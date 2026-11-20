// Test stand-ins for Supabase and Stripe: a World holds the rows and Stripe objects, install()
// replaces fetch so the function under test talks to it, loadHandler() captures the handler a
// function passes to Deno.serve.
export const WEBHOOK_SECRET = "whsec_sellio_test";
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_sellio");
Deno.env.set("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);

export type Handler = (req: Request) => Promise<Response>;

export async function loadHandler(load: () => Promise<unknown>): Promise<Handler> {
  let captured: Handler | null = null;
  Object.defineProperty(Deno, "serve", {
    value: (h: Handler) => {
      captured = h;
      return {};
    },
    configurable: true,
    writable: true,
  });
  await load();
  if (!captured) throw new Error("the module didn't call Deno.serve");
  return captured;
}

export const DAY = 86_400;
export const NOW = Math.floor(Date.now() / 1000);

export type Row = Record<string, any>;
export type World = {
  authEmail?: string | null; // who the request's bearer token belongs to (GET /auth/v1/user)
  tables: Record<string, Row[]>;
  rpcs: { fn: string; args: Row }[];
  rpcAnswer?: (fn: string, args: Row) => unknown;
  stripe: Record<string, Row>; // by API path: "invoices", "subscriptions", "payment_intents", "charges", ...
  stripeLists?: Record<string, (params: URLSearchParams) => Row[] | { data: Row[]; has_more: boolean }>; // GET /v1/<name>
  stripeCalls: string[];
};

export function world(seed: { authEmail?: string | null; tables?: Record<string, Row[]>; stripe?: Record<string, Row>; rpcAnswer?: World["rpcAnswer"]; stripeLists?: World["stripeLists"] } = {}): World {
  return {
    authEmail: seed.authEmail ?? null,
    tables: { stripe_webhook_events: [], subscriptions: [], tenants: [], merchant_invites: [], ...seed.tables },
    rpcs: [],
    rpcAnswer: seed.rpcAnswer,
    stripe: { subscriptions: {}, invoices: {}, payment_intents: {}, charges: {}, customers: {}, ...seed.stripe },
    stripeLists: seed.stripeLists,
    stripeCalls: [],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function rowsMatching(rows: Row[], params: URLSearchParams) {
  const filters = [...params].filter(([key]) => !["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key));
  return rows.filter((row) =>
    filters.every(([key, value]) => {
      if (value.startsWith("eq.")) return row[key] != null && String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("ilike.")) {
        const pattern = value.slice(6).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
        return row[key] != null && new RegExp(`^${pattern}$`, "i").test(String(row[key]));
      }
      throw new Error(`unsupported filter ${key}=${value}`);
    })
  );
}

function pick(row: Row, select: string | null) {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").map((column) => [column.trim(), row[column.trim()] ?? null]));
}

function answerSupabase(w: World, req: Request, url: URL, body: string | null) {
  if (url.pathname === "/auth/v1/user") {
    const bearer = req.headers.get("Authorization") ?? "";
    return w.authEmail && bearer.startsWith("Bearer ") && bearer !== "Bearer anon-test"
      ? jsonResponse({ id: "user_1", aud: "authenticated", role: "authenticated", email: w.authEmail })
      : jsonResponse({ code: 401, error_code: "no_authorization", msg: "This endpoint requires a valid Bearer token" }, 401);
  }
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  if (path.startsWith("rpc/")) {
    const fn = path.slice(4);
    const args = body ? JSON.parse(body) : {};
    w.rpcs.push({ fn, args });
    const result = w.rpcAnswer ? w.rpcAnswer(fn, args) : undefined;
    if (result instanceof Error) return jsonResponse({ code: "P0001", message: result.message, details: null, hint: null }, 400);
    return jsonResponse(result === undefined ? (fn === "sync_stripe_billing_state" ? true : null) : result);
  }
  const table = (w.tables[path] ??= []);
  if (req.method === "GET") {
    return jsonResponse(rowsMatching(table, url.searchParams).map((row) => pick(row, url.searchParams.get("select"))));
  }
  if (req.method === "POST") {
    const rows = [JSON.parse(body ?? "null")].flat();
    if (path === "stripe_webhook_events" && rows.some((row) => table.some((existing) => existing.event_id === row.event_id))) {
      return jsonResponse({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
    }
    table.push(...rows.map((row) => ({ attempts: 1, ...row })));
    return new Response(null, { status: 201 });
  }
  if (req.method === "PATCH") {
    const changes = JSON.parse(body ?? "{}");
    for (const row of rowsMatching(table, url.searchParams)) Object.assign(row, changes);
    return new Response(null, { status: 204 });
  }
  throw new Error(`unexpected Supabase ${req.method} ${url}`);
}

function answerStripe(w: World, req: Request, url: URL) {
  w.stripeCalls.push(`${req.method} ${url.pathname}${url.search ? " " + decodeURIComponent(url.search.slice(1)) : ""}`);
  const [, resource, id, ...rest] = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && resource === "invoices" && id && rest[0] === "lines") {
    const lines = w.stripe.invoices[id]?.lines?.all ?? w.stripe.invoices[id]?.lines?.data ?? [];
    return jsonResponse({ object: "list", url: `/v1/invoices/${id}/lines`, has_more: false, data: lines });
  }
  if (req.method === "POST" && id && rest.length === 0 && w.stripe[resource]?.[id]) {
    return jsonResponse(w.stripe[resource][id]); // an update (metadata): the object as it is
  }
  if (req.method === "GET" && id && rest.length === 0) {
    const found = w.stripe[resource]?.[id];
    return found
      ? jsonResponse(found)
      : jsonResponse({ error: { type: "invalid_request_error", message: `No such ${resource}: '${id}'` } }, 404);
  }
  if (req.method === "GET" && !id) {
    const list = w.stripeLists?.[resource];
    if (list) {
      const listed: any = list(url.searchParams);
      const data = Array.isArray(listed) ? listed : listed.data;
      return jsonResponse({ object: "list", url: `/v1/${resource}`, has_more: !Array.isArray(listed) && Boolean(listed.has_more), data });
    }
    if (resource === "invoices") {
      const subscription = url.searchParams.get("subscription");
      const status = url.searchParams.get("status");
      const data = Object.values(w.stripe.invoices).filter((invoice: any) =>
        (!subscription || invoice.parent?.subscription_details?.subscription === subscription) &&
        (!status || invoice.status === status)
      );
      return jsonResponse({ object: "list", url: "/v1/invoices", has_more: false, data });
    }
  }
  throw new Error(`unexpected Stripe ${req.method} ${url}`);
}

export function install(w: World) {
  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
    if (url.host === "supabase.test") return answerSupabase(w, req, url, body);
    if (url.host === "api.stripe.com") return answerStripe(w, req, url);
    throw new Error("unexpected fetch " + req.url);
  };
}

// A Stripe event, signed as Stripe signs it, delivered to a webhook handler.
export async function deliver(handler: Handler, w: World, event: Row) {
  install(w);
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const res = await handler(new Request("http://webhook.test/", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${hex}`, "content-type": "application/json" },
    body: payload,
  }));
  return { status: res.status, body: await res.json(), event: w.tables.stripe_webhook_events.find((row) => row.event_id === event.id) };
}

let eventNumber = 0;
export function event(type: string, object: Row, created = NOW) {
  return { id: `evt_test_${++eventNumber}`, object: "event", type, created, livemode: false, data: { object } };
}

export const PRICE = {
  id: "price_1UQssYRF2IZPNHju1F8YxwTm", // starter, monthly, S$39
  object: "price",
  currency: "sgd",
  unit_amount: 3900,
  recurring: { interval: "month" },
  metadata: {},
  product: { id: "prod_starter", object: "product", metadata: {} },
};

export function subscription(id: string, status: string, latestInvoice: string | null, customer = "cus_1") {
  return {
    id,
    object: "subscription",
    status,
    customer,
    currency: "sgd",
    metadata: {},
    latest_invoice: latestInvoice,
    items: { object: "list", data: [{ id: "si_" + id, price: PRICE, current_period_start: NOW - DAY, current_period_end: NOW + 29 * DAY }] },
  };
}

export function invoice(id: string, subscriptionId: string, fields: Row = {}) {
  return {
    id,
    object: "invoice",
    customer: "cus_1",
    currency: "sgd",
    parent: { type: "subscription_details", subscription_details: { subscription: subscriptionId } },
    hosted_invoice_url: `https://invoice.stripe.com/i/${id}`,
    payments: { object: "list", data: [] },
    ...fields,
  };
}

export const failedCharge = {
  status: "open",
  amount_due: 3900,
  amount_paid: 0,
  amount_remaining: 3900,
  next_payment_attempt: NOW + 2 * DAY,
  payments: {
    object: "list",
    data: [{
      payment: {
        type: "payment_intent",
        payment_intent: {
          id: "pi_failed",
          object: "payment_intent",
          last_payment_error: { code: "card_declined", message: "Your card was declined." },
          latest_charge: { id: "ch_failed", object: "charge" },
        },
      },
    }],
  },
};

