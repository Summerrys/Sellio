// "Did you mean …?" for a search that finds nothing (UX state 6: fix the typo for them, and
// suggest a next search). It looks for the words in the names already on the page that are
// closest to what was typed, allowing a typo or two: "kaya tost" → "Kaya toast",
// "lontog" → "Lontong". Used where the list is on the phone already (Products, Orders, a
// shop's menu); Explore's search runs on Sellio's server.

// Lower case, no accents: "Crème" and "creme" are the same word.
const fold = (text) => String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
// Letters and numbers only, single spaces: "Kaya-toast (2)" → "kaya toast 2".
export const searchWords = (text) => fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Typos between two words: letters added, missing, changed, or two side by side swapped.
// Stops counting once it's past `limit`.
export function typoDistance(a, b, limit = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let lowest = i;
    for (let j = 1; j <= b.length; j++) {
      const change = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + change);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
      current[j] = value;
      if (value < lowest) lowest = value;
    }
    if (lowest > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

// How many typos a search this long can have and still mean the word. Under 4 letters
// there's too little to go on ("tea" could be "teh" or "pea").
export function typosAllowed(length) {
  if (length < 4) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

// The runs of words in a name as long as the search, or one word shorter or longer
// ("nasilemak" finds "Nasi lemak"). Punctuation at either end is dropped.
function phrasesOf(name, words) {
  const tokens = String(name ?? '').split(/\s+/).filter(Boolean);
  const phrases = [];
  for (let size = Math.max(1, words - 1); size <= words + 1; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const text = tokens.slice(start, start + size).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (text) phrases.push(text);
    }
  }
  return phrases;
}

// The closest phrase in `names`, or null. `finds(text)` says whether searching for a phrase
// would show anything on the page (with its tabs and filters), so a suggestion always works.
export function didYouMean(query, names, finds = () => true) {
  const typed = String(query ?? '').trim();
  const wanted = searchWords(typed);
  if (wanted.length < 4) return null;
  const words = wanted.split(' ').length;
  const close = new Map();
  const far = new Set();
  for (const name of names) {
    for (const text of phrasesOf(name, words)) {
      const key = searchWords(text);
      if (!key || far.has(key)) continue;
      const known = close.get(key);
      if (known) { known.count += 1; continue; }
      const limit = typosAllowed(Math.max(key.length, wanted.length));
      const distance = typoDistance(wanted, key, limit);
      if (distance > limit) { far.add(key); continue; }
      close.set(key, { text, distance, count: 1 });
    }
  }
  const ranked = [...close.values()].sort((a, b) => (
    a.distance - b.distance || b.count - a.count || a.text.length - b.text.length || a.text.localeCompare(b.text)
  ));
  const pick = ranked.find((option) => option.text.toLowerCase() !== typed.toLowerCase() && finds(option.text));
  return pick ? pick.text : null;
}
