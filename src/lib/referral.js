import { useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { N_, englishText } from '@/lib/appText';

// Sellio's referral programme, the app's side (phase 3 of the build plan; the database is phase
// 1, supabase/migrations/20261110090000_referral_programme.sql, and the Stripe webhook phase 2).
// The owner of a business shop on a paid plan joins Refer & earn and gets a random code and a
// link, sellio.sg/r/CODE. An owner who opens the link, or types the code, signs up with it:
//
// - On this device the code is kept for 60 days ({code, shopName, firstName, typed, savedAt},
//   after referral_code_info says it's a working code). The latest link opened, or code typed,
//   wins.
// - Sign-up Payment Links carry it as client_reference_id: ref_CODE for a link's code, reft_CODE
//   for one typed at sign-up (withReferral). Stripe hands it to stripe-webhook, which signs the
//   owner up as usual and notes the referral; Sellio records which it was (source link or code,
//   and a line in app.referral_events, 20 Nov 2026). A shop's own links (shopCheckoutLink) keep
//   the shop's id there, so a shop that exists already attaches a typed code with
//   referral_attach instead, before its first payment.
//
// Alvin, 20 Nov 2026: the code part first; the wallet and how earnings are paid out wait. So
// nothing here reads the wallet, pending earnings or the plan fee back.

export const KEEP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = 'sellio_referral';

// A code as Sellio's database reads it (app.referral_normal_code): letters and digits only, in
// capitals; six of A–H, J–N, P–Z and 2–9 (no I, O, 0 or 1), or "ref" and six (ref_4PWJDZ).
export function referralCode(raw) {
  const code = String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return code;
  if (/^REF[A-HJ-NP-Z2-9]{6}$/.test(code)) return code.slice(3);
  return null;
}

// --- The code kept on this device --------------------------------------------------------

const listeners = new Set();
let snapshot; // what useKeptReferral shows (undefined until first read)

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

function readKept(now = Date.now()) {
  const store = storage();
  if (!store) return null;
  try {
    const kept = JSON.parse(store.getItem(KEY) || 'null');
    const code = referralCode(kept?.code);
    const savedAt = Number(kept?.savedAt);
    if (!code || !Number.isFinite(savedAt) || !(now - savedAt < KEEP_DAYS * DAY_MS) || savedAt > now + DAY_MS) {
      if (kept) store.removeItem(KEY);
      return null;
    }
    return {
      code,
      shopName: typeof kept.shopName === 'string' && kept.shopName.trim() ? kept.shopName.trim() : null,
      firstName: typeof kept.firstName === 'string' && kept.firstName.trim() ? kept.firstName.trim() : null,
      typed: kept.typed === true,
      savedAt,
    };
  } catch {
    return null;
  }
}

function changed() {
  snapshot = readKept();
  listeners.forEach((listener) => listener());
}

// The code kept on this device, or null (none, or older than 60 days).
export function keptReferral(now = Date.now()) {
  return readKept(now);
}

// Keeps a working code (what referral_code_info returned for it) for the next 60 days. typed: the
// owner typed it (rather than opening the distributor's link).
export function keepReferral(info, now = Date.now()) {
  const code = referralCode(info?.code);
  const store = storage();
  if (!code || !store) return null;
  const kept = { code, shopName: info.shopName || null, firstName: info.firstName || null, typed: info.typed === true, savedAt: now };
  try { store.setItem(KEY, JSON.stringify(kept)); } catch { /* private mode: the link still works this visit */ }
  changed();
  return kept;
}

export function forgetReferral() {
  try { storage()?.removeItem(KEY); } catch { /* nothing kept */ }
  changed();
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => { if (event.key === KEY || event.key === null) changed(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
function getSnapshot() {
  if (snapshot === undefined) snapshot = readKept();
  return snapshot;
}

// In a component: the kept code ({code, shopName, firstName}) or null, kept up to date.
export function useKeptReferral() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

// A sign-up Payment Link (plan.links in lib/plans.js) carrying the code: ref_CODE, or reft_CODE
// when the owner typed it. Only sign-up links: on a shop's own links client_reference_id is the
// shop's id.
export function withReferral(link, code, { typed = false } = {}) {
  const ref = referralCode(code);
  if (!link || !ref) return link;
  try {
    const url = new URL(link);
    url.searchParams.set('client_reference_id', `${typed ? 'reft' : 'ref'}_${ref}`);
    return url.toString();
  } catch {
    return link;
  }
}

// ?ref=CODE on any page: checked with Sellio, then kept. (The invite page, /r/CODE, keeps its
// own code the same way.)
export async function captureReferral(search) {
  const code = referralCode(new URLSearchParams(search || '').get('ref'));
  if (!code) return null;
  const info = await referralCodeInfo(code).catch(() => null);
  if (!info?.found) return null;
  keepReferral(info);
  return info;
}

// --- Sellio's database (public.referral_* functions) -------------------------------------

async function rpc(name, args) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// Anyone, signed in or not: {found:false}, or {found, code, shopName, logoUrl, firstName,
// whatsapp} (whatsapp only when the distributor chose to show it).
export const referralCodeInfo = (code) => rpc('referral_code_info', { p_code: code });
// The shop's owner. Not joined: {joined:false, joiningOpen, termsVersion, canJoin, joinBlock, rates}
// (joinBlock, why it can't join yet: 'trial', 'no payment', 'plan lapsed', 'shop closed', 'home shop').
// Joined: {joined, code, link, status, showWhatsapp, earning, notEarningReason, rates, …}.
export const referralDashboard = (tenantId) => rpc('referral_dashboard', { p_tenant_id: tenantId });
export const joinReferral = (tenantId, termsVersion) => rpc('referral_join', { p_tenant_id: tenantId, p_terms_version: termsVersion });
export const attachReferral = (tenantId, code) => rpc('referral_attach', { p_tenant_id: tenantId, p_code: code });
export const setReferralWhatsapp = (tenantId, show) => rpc('referral_set_whatsapp', { p_tenant_id: tenantId, p_show: !!show });

// What those functions say when they refuse, word for word (a screen shows them through its t).
const DATABASE_SAYS = new Set([
  N_("Only the shop's owner can do this."),
  N_("Only the shop's owner can see this."),
  N_('Refer & earn is closed for this shop.'),
  N_("Refer & earn isn't open yet."),
  N_('The distributor terms have changed. Please read them again.'),
  N_("Refer & earn opens after your shop's first payment."),
  N_('Refer & earn is for shops on a paid business plan.'),
  N_("That referral code isn't valid."),
  N_("That's this shop's own code."),
  N_("That code belongs to someone at this shop, so it can't be used here."),
  N_("A referral code can only be added before the shop's first payment."),
  N_("This shop's referral is settled already."),
  N_("This shop hasn't joined Refer & earn."),
]);
export function referralErrorMessage(error, t = englishText, fallback = null) {
  const message = error?.message;
  if (typeof message === 'string' && DATABASE_SAYS.has(message)) return t(message);
  return fallback ?? t('Something went wrong. Please try again.');
}

// --- Words and links ---------------------------------------------------------------------

// A rate from the settings (0.03) as people read it (3%).
export function ratePercent(rate, locale = 'en-SG') {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

export const DISTRIBUTOR_TERMS_PATH = '/distributor-terms';

export function whatsAppLink(text, number = '') {
  const to = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
