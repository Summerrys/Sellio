// deno test supabase/functions/translateContent/index.test.ts
// (from the app root: DENO_NO_PACKAGE_JSON=1 deno test --no-config --node-modules-dir=none --allow-env …)
// Indonesia (12 Nov 2026): menus translate into Bahasa Indonesia, and into English for a menu
// written in Indonesian; Chinese and Malay as before; any other language is refused. Only text
// on an open store's menu is translated, and translations are cached per language. Supabase
// and the translator are stand-ins (fetch).
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";

let handler!: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, "serve", { value: (h: typeof handler) => { handler = h; return {}; }, configurable: true });
Deno.env.set("SUPABASE_URL", "https://project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-for-tests");
Deno.env.set("ANTHROPIC_API_KEY", "translator-key-for-tests");

const ON_MENU = ["Nasi goreng spesial", "Es teh manis", "Kaya toast"];
const prompts: string[] = [];
const cached: Array<{ language: string; source_text: string; translated_text: string }> = [];
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method || (input instanceof Request ? input.method : "GET");
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/rest/v1/rpc/storefront_texts_allowed")) return json(body.p_texts.filter((t: string) => ON_MENU.includes(t)));
  if (url.includes("/rest/v1/translations") && method === "GET") return json([]);
  if (url.includes("/rest/v1/translations") && method === "POST") { cached.push(...body); return new Response(null, { status: 201 }); }
  if (url.startsWith("https://api.anthropic.com/")) {
    const content: string = body.messages[0].content;
    prompts.push(content);
    const lines = content.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^(\d+)\. (.*)$/, "$1. [translated] $2"));
    return json({ content: [{ type: "text", text: lines.join("\n") }] });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

await import("./index.ts");

const ask = async (language: string, texts: string[]) => {
  const res = await handler(new Request("https://project.supabase.co/functions/v1/translateContent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts, language }),
  }));
  return { status: res.status, body: await res.json() };
};

Deno.test("Bahasa Indonesia: menu text is translated and cached", async () => {
  const before = prompts.length;
  const { status, body } = await ask("id", ["Kaya toast", "Not on any menu"]);
  assertEquals(status, 200);
  assertEquals(body.translations, { "Kaya toast": "[translated] Kaya toast" });
  assertEquals(prompts.length, before + 1);
  assert(prompts.at(-1)!.includes("into Bahasa Indonesia (Indonesian)."));
  assert(!prompts.at(-1)!.includes("Not on any menu"), "only menu text reaches the translator");
  assertEquals(cached.at(-1), { source_hash: (cached.at(-1) as any).source_hash, source_text: "Kaya toast", language: "id", translated_text: "[translated] Kaya toast" });
});

Deno.test("English, for a menu written in Indonesian", async () => {
  const { status, body } = await ask("en", ["Nasi goreng spesial", "Es teh manis"]);
  assertEquals(status, 200);
  assertEquals(Object.keys(body.translations).sort(), ["Es teh manis", "Nasi goreng spesial"]);
  assert(prompts.at(-1)!.includes("into English."));
});

Deno.test("Chinese and Malay as before; other languages are refused", async () => {
  assertEquals((await ask("zh", ["Kaya toast"])).status, 200);
  assert(prompts.at(-1)!.includes("into Simplified Chinese."));
  assertEquals((await ask("ms", ["Kaya toast"])).status, 200);
  assert(prompts.at(-1)!.includes("into Bahasa Melayu (Malay)."));
  const before = prompts.length;
  const refused = await ask("th", ["Kaya toast"]);
  assertEquals(refused.status, 400);
  assertEquals(refused.body.error, "Unsupported language: th");
  assertEquals((await ask("toString", ["Kaya toast"])).status, 400, "only the function's own languages");
  assertEquals(prompts.length, before, "nothing refused reaches the translator");
});

Deno.test("Nothing on a menu: nothing is translated", async () => {
  const before = prompts.length;
  const { status, body } = await ask("id", ["Not on any menu"]);
  assertEquals(status, 200);
  assertEquals(body.translations, {});
  assertEquals(prompts.length, before);
});
