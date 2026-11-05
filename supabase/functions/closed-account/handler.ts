// What closed-account does with a request (index.ts wires it to the server). See index.ts.
import { removeAccount as removeAccountDefault } from "../_shared/account-removal.ts";
import { verifyGoogleIdToken as verifyGoogleDefault } from "../_shared/google-id-token.ts";

const PHONE_RE = /^\+[0-9]{6,15}$/;
const MAX_PASSWORD_LENGTH = 200;
const minutes = (seconds: unknown) => Math.max(1, Math.ceil((Number(seconds) || 60) / 60));

export type Deps = {
  admin: any;
  stripe: () => any;
  verifyGoogle?: typeof verifyGoogleDefault;
  removeAccount?: typeof removeAccountDefault;
};
export type Reply = { status: number; body: Record<string, unknown> };
const reply = (body: Record<string, unknown>, status = 200): Reply => ({ status, body });

// What the screen shows; the request's id stays on the server.
export function closedForScreen(closed: Record<string, unknown>) {
  const kind = ["owner", "member", "staff"].includes(String(closed.kind)) ? String(closed.kind) : "member";
  return {
    kind,
    deleteAfter: typeof closed.deleteAfter === "string" ? closed.deleteAfter : null,
    shops: Array.isArray(closed.shops) ? closed.shops.filter((s) => typeof s === "string" && s) : [],
    restoreAsked: Boolean(closed.restoreRequestedAt),
  };
}

// `email`: only for an emailed sign-in link, whose holder has shown they have the email (the
// screen fills it in to sign up again). Phone sign-in never shows the account's email.
type Proof = { ok: true; closed: Record<string, unknown>; email?: string } | { ok: false; reply: Reply };

async function prove(deps: Deps, body: Record<string, unknown>, ip: string | null): Promise<Proof> {
  const { admin } = deps;
  const google = typeof body.googleIdToken === "string" && body.googleIdToken.length > 0;
  const emailLink = !google && typeof body.emailTokenHash === "string" && body.emailTokenHash.length > 0;
  const rawPhone = String(body.phone ?? "").trim();
  const phone = !google && !emailLink && PHONE_RE.test(rawPhone) ? rawPhone : null;

  // Phone sign-in's limits: 5 wrong passwords per number, 20 failed attempts per network.
  const { data: gate, error: gateError } = await admin.rpc("phone_auth_begin", { p_action: "sign_in", p_phone: phone, p_ip: ip });
  if (gateError) throw new Error("phone_auth_begin failed: " + gateError.message);
  if (!gate?.allowed) {
    return { ok: false, reply: reply({ ok: false, code: gate?.reason === "locked" ? "locked" : "too_many", retry_after_minutes: minutes(gate?.retry_after) }) };
  }
  const finish = async (outcome: "ok" | "wrong" | "error") => {
    const { error } = await admin.rpc("phone_auth_finish", { p_phone: phone, p_ip: ip, p_outcome: outcome });
    if (error) console.error("phone_auth_finish failed", error.message);
  };

  if (google) {
    const identity = await (deps.verifyGoogle ?? verifyGoogleDefault)(String(body.googleIdToken), String(body.nonce ?? ""));
    if (!identity) {
      await finish("wrong");
      return { ok: false, reply: reply({ ok: false, code: "invalid" }) };
    }
    const { data: found, error } = await admin.rpc("closed_account_by_google", { p_google_sub: identity.sub });
    if (error) throw new Error("closed_account_by_google failed: " + error.message);
    await finish("ok");
    if (!found?.locked || !found.closed) return { ok: false, reply: reply({ ok: false, code: "not_closed" }) };
    return { ok: true, closed: found.closed };
  }

  // An emailed sign-in link (Join): its token, which Supabase Auth didn't use up because the
  // login is locked. One that matches nothing (expired, used, made up) counts as a failed
  // attempt for the network, under the same limit as Google and phone sign-in.
  if (emailLink) {
    const { data: found, error } = await admin.rpc("closed_account_by_email_link", {
      p_token_hash: String(body.emailTokenHash).slice(0, 200),
      p_type: String(body.emailLinkType ?? "magiclink").slice(0, 20),
    });
    if (error) throw new Error("closed_account_by_email_link failed: " + error.message);
    if (!found?.found) {
      await finish("wrong");
      return { ok: false, reply: reply({ ok: false, code: "link_invalid" }) };
    }
    await finish("ok");
    if (!found.locked || !found.closed) return { ok: false, reply: reply({ ok: false, code: "not_closed" }) };
    return { ok: true, closed: found.closed, ...(typeof found.email === "string" && found.email ? { email: found.email } : {}) };
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!phone || !gate.email || !password || password.length > MAX_PASSWORD_LENGTH) {
    await finish("wrong");
    return { ok: false, reply: reply({ ok: false, code: "invalid" }) };
  }
  const { data: check, error } = await admin.rpc("closed_account_check", { p_email: gate.email, p_password: password });
  if (error) throw new Error("closed_account_check failed: " + error.message);
  if (check?.passwordOk !== true) {
    await finish("wrong");
    return { ok: false, reply: reply({ ok: false, code: "invalid" }) };
  }
  await finish("ok");
  if (!check.locked || !check.closed) return { ok: false, reply: reply({ ok: false, code: "not_closed" }) };
  return { ok: true, closed: check.closed };
}

export async function handleClosedAccount(deps: Deps, body: Record<string, unknown>, ip: string | null): Promise<Reply> {
  const action = body?.action;
  if (action !== "status" && action !== "restore" && action !== "delete") return reply({ ok: false, code: "unavailable" }, 400);
  const { admin } = deps;

  const proof = await prove(deps, body, ip);
  if (!proof.ok) return proof.reply;
  const screen = closedForScreen(proof.closed);

  if (action === "status") return reply({ ok: true, closed: screen, ...(proof.email ? { email: proof.email } : {}) });
  // A staff login closed with its shop: its shop's owner decides.
  if (screen.kind === "staff") return reply({ ok: false, code: "staff", closed: screen });

  const requestId = String(proof.closed.requestId ?? "");
  if (!requestId) return reply({ ok: false, code: "unavailable" }, 500);

  if (action === "restore") {
    const { data, error } = await admin.rpc("account_restore_request", { p_request_id: requestId });
    if (error || !data?.ok) throw new Error("account_restore_request failed: " + (error?.message ?? "not pending"));
    return reply({ ok: true, kind: "restore_asked", alreadyAsked: Boolean(data.alreadyAsked) });
  }

  // Start again.
  if (body.confirmation !== "DELETE") return reply({ ok: false, code: "confirm" });
  const result = await (deps.removeAccount ?? removeAccountDefault)(admin, deps.stripe(), requestId);
  if (result.ok) return reply({ ok: true, kind: "deleted" });
  console.error("closed-account delete failed", requestId, JSON.stringify(result).slice(0, 1000));
  const { error: alertError } = await admin.rpc("alert_sellio_admins", {
    p_type: "account_removal_failed",
    p_title: "Account deletion didn't finish",
    p_message: `Someone chose Start again on a closed account, but its deletion stopped (${result.error}). ` +
      "Nothing more happens until it's run again.",
    p_data: { request_id: requestId, result },
  });
  if (alertError) console.error("alert_sellio_admins failed", alertError.message);
  return reply({ ok: false, code: "failed" });
}
