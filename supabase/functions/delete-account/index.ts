// delete-account — v3 (switched off). Deploy with verify_jwt: true (unchanged).
// Change vs v2 (Alvin, 2026-10-03): Sellio accounts are deleted on request only.
// The person emails sellio@apptelier.sg from the address they sign in with, with the
// request and the reason; Sellio confirms before anything is deleted. This function
// no longer deletes anything: every request gets 410 with that instruction.
// Undo: deploy rollback/delete-account_v2_index.ts (the exact v2) with verify_jwt: true.

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};

const MESSAGE =
  "Account deletion is done on request. Email sellio@apptelier.sg from the email address you sign in with, " +
  "tell us it's a deletion request and why. We'll confirm with you before anything is deleted.";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({ error: MESSAGE, code: "DELETION_BY_REQUEST" }), { status: 410, headers });
});
