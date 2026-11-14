import { toast } from 'sonner';
import { isOffline, isNetworkError } from '@/lib/network';
import { N_ } from '@/lib/appText';

// Errors in plain words (UX states, 3): what went wrong (the title, in the words of what the
// person was doing: "Couldn't save the product"), whose side it's on, and what to do next.
// Database and network wording never reaches the screen; the console keeps it for us.
// The words are English unless a translated screen passes its t (lib/appText.js):
// showError(err, t('Couldn’t upload the logo'), { t }). Other screens stay all English, so
// no note mixes two languages.

export const SUPPORT_EMAIL = 'sellio@apptelier.sg';
// An error toast stays this long, with a close button (others go after 4 seconds).
export const ERROR_TOAST_MS = 10000;

const SAYS = {
  offline: N_('You’re offline. Connect to the internet, then try again.'),
  network: N_('Your phone couldn’t reach Sellio. Check your internet connection, then try again.'),
  'signed-out': N_('You’ve been signed out. Sign in again, then try again.'),
  'no-access': N_('Your account isn’t allowed to do this. Ask the shop’s owner for access.'),
  'in-use': N_('It’s still used elsewhere in your shop, so it can’t be removed yet.'),
  stale: N_('It was changed or removed somewhere else. Refresh the page, then try again.'),
  invalid: N_('Some details weren’t accepted. Check what you entered, then try again.'),
  missing: N_('A required detail is missing. Fill it in, then try again.'),
  'too-long': N_('Some text is too long. Shorten it, then try again.'),
  'too-big': N_('A number is too large. Check the amounts, then try again.'),
  clash: N_('Someone else changed this at the same moment. Refresh, check it, then try again.'),
  'file-too-big': N_('That file is too big. Choose a smaller one, then try again.'),
  'rate-limit': N_('That’s a lot of tries in a short time. Wait a minute, then try again.'),
  timeout: N_('Sellio took too long to answer. That’s on our side, not yours. Try again in a moment.'),
  server: N_('Something went wrong on Sellio’s side, not yours. Try again in a moment. If it keeps happening, email {email}.'),
};

// Words that only a program would write: such a message is never shown as it is.
const TECHNICAL = /violat|constraint|relation\s|column\s|syntax|invalid input|duplicate key|null value|permission denied|row[- ]level|value too long|\bjwt\b|token|schema|pgrst|typeerror|referenceerror|rangeerror|undefined|\bnull\b|\bnan\b|fetch|network|status code|\bsql\b|uuid|exception|econn|err_|query returned|\brows?\b|bucket|payload|stack|cannot read|is not a function|\bobject\b|function\s+\S+\(|\(\d{3}\)|https?:|[a-z0-9]+_[a-z0-9_]+|[{}<>]|=>|::/i;
const STATUS_WORDS = /^(bad request|not found|unauthori[sz]ed|forbidden|internal server error|service unavailable|gateway|failed\b|error\b)/i;

// Whether a message reads as words for people: a short sentence with nothing technical in it.
export function looksPlain(text) {
  const s = String(text || '').trim();
  if (s.length < 4 || s.length > 220) return false;
  if (!/^[A-Z"“‘']/.test(s)) return false;
  if (STATUS_WORDS.test(s)) return false;
  return !TECHNICAL.test(s);
}

// Codes Sellio's own database functions raise with a message written for people.
const OWN_CODES = new Set(['P0001', 'P0002', '22023', '42501', '40001', '23505']);
const OWN_HINT = /^[a-z][a-z0-9_]*$/; // our functions name the case in the hint: own_shop, sign_in…

// The error's own message when it was written for people (by the app, or by Sellio's
// database functions), or null.
export function ownMessage(error) {
  const message = String(error?.message || '').trim();
  if (!message) return null;
  if (error.friendly) return message;
  if (!looksPlain(message)) return null;
  if (typeof error.hint === 'string' && OWN_HINT.test(error.hint)) return message;
  if (OWN_CODES.has(String(error.code || ''))) return message;
  // Supabase sign-in's answers to a request it refused ("New password should be different
  // from the old password.").
  const status = Number(error.status || 0);
  if (['AuthApiError', 'AuthWeakPasswordError'].includes(error.name) && status >= 400 && status < 500) return message;
  // The app's own Error (no code or status from a server).
  if (error instanceof Error && error.name === 'Error' && !error.code && !error.status) return message;
  return null;
}

// What kind of problem it is, from the error's code, status and wording.
export function errorKind(error) {
  if (isOffline()) return 'offline';
  if (!error) return 'server';
  if (isNetworkError(error)) return 'network';
  if (ownMessage(error)) return 'own';
  const code = String(error.code || '');
  const status = Number(error.status || error.statusCode || 0);
  const text = `${error.message || ''} ${typeof error.details === 'string' ? error.details : ''} ${error.error_description || ''}`;
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /\bjwt\b|not authenticated|auth session missing|session (has )?expired|refresh token/i.test(text)) return 'signed-out';
  if (code === '42501' || status === 403 || /permission denied|row[- ]level security|not authori[sz]ed|forbidden/i.test(text)) return 'no-access';
  if (code === '23505' || /duplicate key|already exists/i.test(text)) return 'duplicate';
  if (code === '23503' || /foreign key/i.test(text)) return /still referenced|is referenced/i.test(text) ? 'in-use' : 'stale';
  if (code === '23502' || /null value in column|not-null/i.test(text)) return 'missing';
  if (code === '22001' || /value too long/i.test(text)) return 'too-long';
  if (code === '22003' || /out of range|numeric field overflow/i.test(text)) return 'too-big';
  if (['23514', '22P02', '22007', '22008', '22023'].includes(code) || /check constraint|invalid input/i.test(text)) return 'invalid';
  if (code === '40001' || code === '40P01' || /could not serialize|deadlock/i.test(text)) return 'clash';
  if (code === 'PGRST116' || /multiple \(or no\) rows|contains 0 rows/i.test(text)) return 'stale';
  if (status === 413 || /payload too large|entity too large|maximum allowed size|exceeded the maximum|too large/i.test(text)) return 'file-too-big';
  if (status === 429 || /rate limit|too many requests/i.test(text)) return 'rate-limit';
  if (code === '57014' || status === 504 || status === 408 || error.name === 'AbortError' || /time(d)? ?out|statement timeout|aborted/i.test(text)) return 'timeout';
  return 'server';
}

// "Key (tenant_id, sku)=(…) already exists" → "That SKU is already in use…"
const FIELDS = {
  phone_number: N_('That phone number'), table_number: N_('That table number'), order_number: N_('That order number'),
  email: N_('That email address'), phone: N_('That phone number'), slug: N_('That web address'), name: N_('That name'),
  sku: N_('That SKU'), code: N_('That code'), number: N_('That number'),
};
const SAME_DETAILS = N_('Something with the same details');
const IN_USE = N_('{thing} is already in use. Change it, then try again.');
const DEFAULT_TITLE = N_('That didn’t work');

// English words with their {blanks} filled, for a screen that isn't translated.
const english = (phrase, vars) => phrase.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, name) => (vars?.[name] != null ? String(vars[name]) : whole));
const FIELD_KEYS = Object.keys(FIELDS).sort((a, b) => b.length - a.length);
function duplicateText(error, say) {
  const text = `${typeof error.details === 'string' ? error.details : ''} ${error.message || ''}`;
  const keys = (text.match(/Key \(([^)]+)\)/i)?.[1] || '').split(',').map((k) => k.trim().toLowerCase()).reverse();
  const constraint = (text.match(/constraint "([^"]+)"/i)?.[1] || '').toLowerCase().replace(/_(key|idx|unique|uniq)$/, '');
  const field = keys.find((k) => FIELDS[k]) || FIELD_KEYS.find((k) => new RegExp(`(^|_)${k}$`).test(constraint));
  return say(IN_USE, { thing: say(FIELDS[field] || SAME_DETAILS) });
}

const sentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

// { kind, title, description } for an error. fallback: what to say instead of the general
// "on Sellio's side" when nothing more is known (e.g. a print that needs the printer checked).
// t: a translated screen's own (see the top).
export function explainError(error, { title, fallback, t } = {}) {
  const say = t || english;
  const kind = errorKind(error);
  const heading = title ?? say(DEFAULT_TITLE);
  let description;
  if (kind === 'own') description = sentence(say(ownMessage(error))); // the app's own words, translated when known
  else if (kind === 'duplicate') description = duplicateText(error, say);
  else if (kind === 'server' && fallback) description = fallback;
  else description = say(SAYS[kind], { email: SUPPORT_EMAIL });
  if (error && typeof console !== 'undefined') console.warn(`${heading}:`, error);
  return { kind, title: heading, description };
}

// The same as a toast, which stays ERROR_TOAST_MS with a close button. Returns the words.
export function showError(error, title, { fallback, id, duration = ERROR_TOAST_MS, t } = {}) {
  const note = explainError(error, { title, fallback, t });
  toast.error(note.title, { description: note.description, duration, closeButton: true, ...(id ? { id } : {}) });
  return note;
}

// Words for a change that needs the internet, while the phone is offline.
const OFFLINE_NEEDS = N_('You’re offline. {needs} Connect to the internet, then try again.');
export const offlineNote = (title, needs, t) => ({
  kind: 'offline',
  title,
  description: needs ? (t || english)(OFFLINE_NEEDS, { needs }) : (t || english)(SAYS.offline),
});

// Before a change that needs the internet: when the phone is offline, says so and returns
// true (the caller stops there). "needs": what needs it, e.g. "Updating an order needs the internet."
export function blockedOffline(title, needs, t) {
  if (!isOffline()) return false;
  const note = offlineNote(title, needs, t);
  toast.error(note.title, { description: note.description, duration: ERROR_TOAST_MS, closeButton: true, id: 'sellio-offline-blocked' });
  return true;
}
