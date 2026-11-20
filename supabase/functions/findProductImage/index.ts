// findProductImage - v25 (Pixabay, the dish's own words). Deploy with verify_jwt: true.
//
// v25, Alvin 20 Nov 2026: "a classic club sandwich in menu returns me with images from the
// pixabay of the poker card club or even motorbikes". v24 searched the first two words of a
// name ("Classic Club Sandwich" -> "classic club") and Pixabay matches the words as written:
// playing cards, a club motorbike, a classic car. Now (searchPlan):
//   - the words that say what the dish is: the end of the name ("club sandwich", "mushroom swiss
//     burger"), without menu words that say nothing about it (classic, signature, homemade,
//     freshly, of the day, sizes), what's in brackets, or a side after "with"/"c/w"/"+";
//     "Stir-Fry" is "stir fry";
//   - Pixabay's Food & Drink category first, all photos when it has nothing for those words (so
//     "Foot Reflexology" still finds photos), then fewer words, ending with the dish word
//     ("burger"), never the first word ("classic");
//   - local dishes (LOCAL_DISHES): the local name first ("nasi lemak"), then a few English words
//     ("coconut rice"), in Food & Drink only (a local name can be a place: "bandung");
//   - Chinese in a name: searched in Chinese (lang=zh) after the rest of the name;
//   - at most MAX_ASKS requests to Pixabay a search (answers kept from the last day are free).
//
// Pixabay's API rules (pixabay.com/api/docs), as v24:
//   - its image addresses may be used to show search results for a while, never kept ("permanent
//     hotlinking of images ... is not allowed"): a photo the shop uses is copied into its product
//     photos ({ action: 'keep' }, below), and the app saves the copy;
//   - "requests must be cached for 24 hours": each answer is kept a day in
//     public.photo_search_cache (key "pixabay|<lang>|<food or all>|<set>|<words>");
//   - wherever results are shown, say they're from Pixabay (the app does: "Photos from Pixabay");
//   - 100 requests a minute for Sellio as a whole.
// The key is the project's PIXABAY_API_KEY secret.
//
// A search: { query, page, tenantId } -> { photos: [{ id, previewUrl, keepUrl, alt, credit }],
// keyword (the words that found them), page }. previewUrl (Pixabay's 640 px, valid for 24 hours)
// is for showing it; keepUrl (1280 px, as long) for { action: 'keep' }. There is no `url`: an app
// from before v24 finds no photo in the answer rather than saving an address that stops working.
//
// { action: 'keep', tenantId, photos: [{ id, url }] }: copies each photo (1 to 8 Pixabay image
// addresses, from a search's keepUrl) into product-images/<store>/products/<id>-<time>.<ext> and
// answers { kept: [{ from, url }] } with the copies made (one that couldn't be fetched or saved is
// left out). The same access check as a search; 300 a person an hour; no search is used up.
//
// Who may search, as before: signed in, an active member with products.create or products.edit of
// an open store (ai_authorized_store); 150 searches a person an hour; a store's monthly allowance
// (free personal shops: 3 a calendar month) given back when the search fails; sets of 5 (6 sets,
// then set 1 again), set 1 when a later set has nothing.
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEARCHES_PER_PERSON_PER_HOUR = 150;
const KEEPS_PER_PERSON_PER_HOUR = 300;
const MAX_QUERY_CHARS = 100;
const MAX_KEEP_AT_ONCE = 8;
export const MAX_ASKS = 6;
const PER_PAGE = 5;
const SETS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const BUCKET = 'product-images';
const LONG_CACHE = '31536000';
// Pixabay's image addresses: search results' (pixabay.com/get/...) and its CDN's (cdn.pixabay.com/photo/...).
const PIXABAY_IMAGE = /^https:\/\/(?:cdn\.)?pixabay\.com\/(?:get|photo)\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/i;
const PHOTO_ID = /^pixabay-\d{1,12}$/;
const HAN = /\p{Script=Han}+/gu;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// '1 Nov' (Singapore time) for an ISO timestamp.
const resetLabel = (iso: unknown) => {
  try {
    return new Date(String(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  } catch {
    return 'the 1st of next month';
  }
};

// Email of the signed-in caller, or null (no header, public key, expired token).
async function callerEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return null;
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await callerClient.auth.getUser();
  return error || !user?.email ? null : user.email;
}

const adminClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Local dishes and drinks, as they're written on menus here, and what each is in a few English
// words with the dish last (searched when Pixabay doesn't know the local name).
export const LOCAL_DISHES: Record<string, string> = {
  'kopi o kosong peng': 'iced black coffee',
  'kopi c kosong peng': 'iced milk coffee',
  'kopi o kosong':      'black coffee',
  'kopi c kosong':      'milk coffee',
  'kopi c peng':        'iced milk coffee',
  'kopi o peng':        'iced black coffee',
  'kopi gao peng':      'iced black coffee',
  'kopi si peng':       'iced milk coffee',
  'kopi tarik':         'milk coffee',
  'kopi gao':           'black coffee',
  'kopi o':             'black coffee',
  'kopi c':             'milk coffee',
  'kopi si':            'milk coffee',
  'kopi peng':          'iced coffee',
  'kopi':               'coffee',
  'teh o kosong peng':  'iced black tea',
  'teh c kosong peng':  'iced milk tea',
  'teh o kosong':       'black tea',
  'teh c kosong':       'milk tea',
  'teh tarik':          'milk tea',
  'teh c peng':         'iced milk tea',
  'teh o peng':         'iced tea',
  'teh halia peng':     'iced ginger tea',
  'teh halia':          'ginger tea',
  'teh si peng':        'iced milk tea',
  'teh o':              'black tea',
  'teh c':              'milk tea',
  'teh si':             'milk tea',
  'teh peng':           'iced tea',
  'teh':                'tea',
  'teh botol':          'bottled tea',
  'yuan yang peng':     'iced milk tea',
  'yuan yang':          'milk tea',
  'yuen yeung':         'milk tea',
  'milo dinosaur':      'chocolate drink',
  'milo peng':          'iced chocolate',
  'milo':               'chocolate drink',
  'milo van':           'chocolate ice cream',
  'horlicks peng':      'iced malted milk',
  'horlicks':           'malted milk',
  'ovaltine':           'chocolate drink',
  'bandung peng':       'rose milk',
  'bandung':            'rose milk',
  'sirap bandung':      'rose milk',
  'sirap':              'rose syrup',
  'barley':             'barley water',
  'air mata kucing':    'longan drink',
  'sugarcane juice':    'sugarcane juice',
  'tebu':               'sugarcane juice',
  'soya bean milk':     'soy milk',
  'soyabean':           'soy milk',
  'chrysanthemum tea':  'chrysanthemum tea',
  'grass jelly':        'grass jelly',
  'cincau':             'grass jelly',
  'kelapa':             'coconut water',
  'coconut shake':      'coconut milkshake',
  'abc juice':          'beetroot juice',
  'cendol':             'shaved ice dessert',
  'chendol':            'shaved ice dessert',
  'ice kachang':        'shaved ice',
  'ais kacang':         'shaved ice',
  'abc':                'shaved ice',
  'ice cream sandwich': 'ice cream sandwich',
  'nasi lemak':         'coconut rice',
  'nasi goreng':        'fried rice',
  'nasi kandar':        'curry rice',
  'nasi briyani':       'biryani',
  'nasi biryani':       'biryani',
  'nasi padang':        'indonesian food',
  'nasi kerabu':        'blue rice',
  'nasi dagang':        'fish curry',
  'nasi ayam':          'chicken rice',
  'nasi campur':        'mixed rice',
  'nasi ambeng':        'rice platter',
  'economy rice':       'mixed rice',
  'economic rice':      'mixed rice',
  'zi char':            'chinese food',
  'claypot rice':       'claypot rice',
  'hainanese chicken rice': 'chicken rice',
  'chicken rice':       'chicken rice',
  'duck rice':          'duck rice',
  'banana leaf rice':   'banana leaf rice',
  'lontong sayur':      'vegetable curry',
  'lontong':            'vegetable curry',
  'ketupat':            'rice cake',
  'lo mai gai':         'sticky rice',
  'char kway teow':     'fried noodles',
  'hokkien mee':        'prawn noodles',
  'prawn mee':          'prawn noodles',
  'har mee':            'prawn noodles',
  'sang har mee':       'prawn noodles',
  'mee goreng':         'fried noodles',
  'maggi goreng':       'fried noodles',
  'mee rebus':          'noodle soup',
  'mee siam':           'rice noodles',
  'mee sua':            'noodle soup',
  'mee bandung':        'noodle soup',
  'ban mian':           'noodle soup',
  'pan mee':            'noodle soup',
  'lor mee':            'noodle soup',
  'la mian':            'noodle soup',
  'kway chap':          'noodle soup',
  'kway teow soup':     'noodle soup',
  'mee pok':            'noodles',
  'kolo mee':           'noodles',
  'bak chor mee':       'pork noodles',
  'wonton mee':         'wonton noodles',
  'dry wonton mee':     'wonton noodles',
  'fishball noodles':   'fish ball noodles',
  'laksa':              'curry noodle soup',
  'asam laksa':         'fish noodle soup',
  'curry laksa':        'curry noodle soup',
  'laksa johor':        'laksa',
  'ipoh hor fun':       'rice noodles',
  'hor fun':            'rice noodles',
  'yong tau foo':       'tofu soup',
  'economy bee hoon':   'fried vermicelli',
  'economy bee hoon goreng': 'fried vermicelli',
  'bee hoon':           'rice vermicelli',
  'mee hoon':           'rice vermicelli',
  'tang hoon':          'glass noodles',
  'bak kut teh':        'pork rib soup',
  'sup tulang':         'bone soup',
  'sup kambing':        'mutton soup',
  'watercress soup':    'watercress soup',
  'lotus root soup':    'lotus root soup',
  'fishball soup':      'fish ball soup',
  'tom yam':            'tom yum soup',
  'tom yum':            'tom yum soup',
  'pork rib soup':      'pork rib soup',
  'oxtail soup':        'oxtail soup',
  'soto ayam':          'chicken soup',
  'steamboat':          'hot pot',
  'mala xiang guo':     'spicy stir fry',
  'roti prata':         'flatbread',
  'roti canai':         'flatbread',
  'roti tissue':        'flatbread',
  'prata':              'flatbread',
  'roti john':          'omelette sandwich',
  'murtabak':           'stuffed flatbread',
  'tosai':              'dosa',
  'thosai':             'dosa',
  'thosai masala':      'masala dosa',
  'idli':               'rice cake',
  'chapati':            'flatbread',
  'naan':               'naan bread',
  'puri':               'fried bread',
  'apom':               'rice pancake',
  'appam':              'rice pancake',
  'fish head curry':    'fish curry',
  'biryani':            'biryani',
  'briyani':            'biryani',
  'tandoori':           'tandoori chicken',
  'dhal':               'lentil curry',
  'sambar':             'lentil soup',
  'rasam':              'tamarind soup',
  'vadai':              'lentil fritters',
  'murukku':            'indian snacks',
  'rendang':            'beef curry',
  'beef rendang':       'beef curry',
  'chicken rendang':    'chicken curry',
  'ayam penyet':        'fried chicken',
  'ayam goreng':        'fried chicken',
  'ayam bakar':         'grilled chicken',
  'sambal stingray':    'grilled fish',
  'ikan bakar':         'grilled fish',
  'asam pedas':         'fish curry',
  'masak lemak':        'coconut curry',
  'gulai':              'curry',
  'kuah lodeh':         'vegetable curry',
  'char siew':          'roast pork',
  'sio bak':            'roast pork',
  'roast duck':         'roast duck',
  'kong bak bao':       'pork belly bun',
  'char siew bao':      'steamed pork bun',
  'bao':                'steamed bun',
  'xiao long bao':      'soup dumplings',
  'chai tow kway':      'fried radish cake',
  'fried carrot cake':  'fried radish cake',
  'black carrot cake':  'fried radish cake',
  'white carrot cake':  'fried radish cake',
  'turnip cake':        'radish cake',
  'lo bak go':          'radish cake',
  'or luak':            'oyster omelette',
  'orh luak':           'oyster omelette',
  'oyster omelette':    'oyster omelette',
  'popiah':             'spring roll',
  'kueh pie tee':       'pastry cups',
  'ngoh hiang':         'pork roll',
  'rojak':              'fruit salad',
  'pasembur':           'indian salad',
  'satay':              'meat skewers',
  'satay celup':        'skewers',
  'dim sum':            'dumplings',
  'har gow':            'shrimp dumplings',
  'siew mai':           'pork dumplings',
  'cheung fun':         'rice noodle roll',
  'chee cheong fun':    'rice noodle roll',
  'chwee kueh':         'rice cakes',
  'tau huay':           'tofu pudding',
  'tofu pudding':       'tofu pudding',
  'tau suan':           'mung bean dessert',
  'cheng tng':          'dessert soup',
  'tang yuan':          'glutinous rice balls',
  'bubur cha cha':      'coconut dessert',
  'orh nee':            'taro dessert',
  'ang ku kueh':        'red rice cake',
  'soon kueh':          'vegetable dumplings',
  'kueh lapis':         'layer cake',
  'ondeh ondeh':        'coconut rice balls',
  'onde onde':          'coconut rice balls',
  'pisang goreng':      'banana fritters',
  'goreng pisang':      'banana fritters',
  'curry puff':         'curry puff',
  'epok epok':          'curry puff',
  'otah':               'fish cake',
  'otak otak':          'fish cake',
  'kaya butter toast':  'toast',
  'kaya toast':         'toast',
  'kaya':               'coconut jam',
  'half boiled eggs':   'soft boiled eggs',
  'soft boiled eggs':   'soft boiled eggs',
  'chili crab':         'chilli crab',
  'chilli crab':        'crab',
  'black pepper crab':  'pepper crab',
  'salted egg crab':    'crab',
  'salted egg prawns':  'fried prawns',
  'cereal prawns':      'fried prawns',
  'butter prawns':      'prawns',
  'sambal sotong':      'squid',
  'sotong':             'squid',
  'sambal kangkong':    'water spinach',
  'ikan bilis':         'anchovies',
  'durian':             'durian',
  'durian puff':        'cream puff',
  'mango sticky rice':  'mango sticky rice',
  'puttu mayam':        'string hoppers',
  'waffles':            'waffles',
  'egg tart':           'egg tart',
  'iced gem biscuits':  'biscuits',
  'yakult':             'yogurt drink',
};

// Local names that mean something else on Pixabay (a place, a Western dish, a word): searched in
// English only.
export const ENGLISH_ONLY = new Set([
  'bandung', 'bandung peng', 'sirap bandung', 'mee bandung', 'abc', 'abc juice', 'economy rice',
  'economic rice', 'zi char', 'milo van', 'fried carrot cake', 'black carrot cake', 'white carrot cake',
]);

// Words that say nothing about what an item is.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or',
  'my', 'our', 'your', 'is', 'are', 'was', 'be', 'this', 'that', 'it',
  'no', 'not', 'some', 'any', 'get', 'find', 'show', 'add',
  'new', 'best', 'good', 'great', 'nice', 'very', 'la', 'dan', 'dengan', 'per',
]);
// Menu words that say how it's sold, not what it is: marketing, sizes, units, "of the day".
const FILLER_WORDS = new Set([
  'classic', 'signature', 'special', 'specialty', 'speciality', 'house', 'homemade', 'home', 'made',
  'famous', 'original', 'traditional', 'authentic', 'premium', 'deluxe', 'chef', 'chefs', 'daily',
  'day', 'today', 'todays', 'fresh', 'freshly', 'style', 'set', 'combo', 'regular', 'small',
  'medium', 'large', 'big', 'mini', 'value', 'size', 'portion', 'pax', 'pcs', 'pc', 'piece',
  'pieces', 'ml', 'kg', 'gm', 'oz', 'min', 'mins', 'minute', 'minutes', 'hr', 'hrs', 'hour',
  'hours', 'carte', 'favourite', 'favorite', 'popular', 'recommended', 'must', 'try', 'limited',
  'edition', 'seasonal', 'item', 'items',
]);

export type Attempt = { words: string; lang: 'en' | 'zh'; category: 'food' | 'all' };

// The name in Latin letters as plain words: lower case, accents off, without Chinese, what's in
// brackets, or a side after "with" ("Chicken Chop with Fries" is a chicken chop); punctuation as
// spaces ("Stir-Fry": "stir fry").
export function nameText(query: string): string {
  return String(query || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(HAN, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/\s+(?:with|w\/|c\/w|served with|topped with)\s+|\s*\+\s*/)[0]
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The local dish a name is: the one written first (longest when two start together).
export function localDish(text: string): { name: string; english: string } | null {
  const padded = ` ${text} `;
  let best: { at: number; name: string; english: string } | null = null;
  for (const [name, english] of Object.entries(LOCAL_DISHES)) {
    const at = padded.indexOf(` ${name} `);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && name.length > best.name.length)) best = { at, name, english };
  }
  return best ? { name: best.name, english: best.english } : null;
}

// What to look for, in order, until something is found.
export function searchPlan(query: string): Attempt[] {
  const plan: Attempt[] = [];
  const add = (words: string, lang: Attempt['lang'], category: Attempt['category']) => {
    const w = words.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS);
    if (w && !plan.some((a) => a.words === w && a.lang === lang && a.category === category)) plan.push({ words: w, lang, category });
  };
  const text = nameText(query);
  const local = localDish(text);
  if (local) {
    if (!ENGLISH_ONLY.has(local.name)) add(local.name, 'en', 'food');
    add(local.english, 'en', 'food');
    add(local.english.split(' ').slice(-1).join(' '), 'en', 'food');
  } else {
    const words = text.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !FILLER_WORDS.has(w));
    if (words.length) {
      const [last3, last2, last1] = [3, 2, 1].map((n) => words.slice(-n).join(' '));
      add(last3, 'en', 'food');
      add(last2, 'en', 'food');
      add(last3, 'en', 'all');
      if (last2.includes(' ')) add(last2, 'en', 'all');
      add(last1, 'en', 'food');
      add(last1, 'en', 'all');
    }
  }
  const chinese = (String(query || '').match(HAN) || []).join(' ');
  if (chinese) {
    add(chinese, 'zh', 'food');
    add(chinese, 'zh', 'all');
  }
  return plan;
}

const pixabayKey = () => Deno.env.get('PIXABAY_API_KEY') || '';

// A Pixabay result as the app takes it.
export function toPhoto(hit: any, keyword: string) {
  const tags = String(hit?.tags || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3).join(', ');
  const name = String(hit?.user || '').trim();
  return {
    id: `pixabay-${hit.id}`,
    previewUrl: hit.webformatURL,
    keepUrl: hit.largeImageURL || hit.webformatURL,
    alt: tags || keyword,
    credit: {
      source: 'pixabay',
      name: (name || 'Pixabay').slice(0, 80),
      profile: name && hit?.user_id ? `https://pixabay.com/users/${encodeURIComponent(name)}-${hit.user_id}/` : null,
      photo: typeof hit?.pageURL === 'string' && hit.pageURL.startsWith('https://pixabay.com/') ? hit.pageURL : null,
    },
  };
}

// One set of photos from Pixabay (never logs the address: it carries the key). A set past the
// last is empty (Pixabay answers 400 "page is out of valid range").
async function askPixabay(attempt: Attempt, page: number) {
  const key = pixabayKey();
  if (!key) throw new Error('Pixabay key missing: set the PIXABAY_API_KEY secret');
  const params = new URLSearchParams({ key, q: attempt.words, lang: attempt.lang, image_type: 'photo', safesearch: 'true', per_page: String(PER_PAGE), page: String(page) });
  if (attempt.category === 'food') params.set('category', 'food');
  const res = await fetch(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(10000) });
  console.log(`findProductImage v25: Pixabay ${res.status} for "${attempt.words}" (${attempt.lang}, ${attempt.category}) set ${page}, rate limit ${res.headers.get('x-ratelimit-limit')}/min, ${res.headers.get('x-ratelimit-remaining')} left`);
  if (res.status === 400) {
    const text = await res.text().catch(() => '');
    if (/out of valid range/i.test(text)) return [];
    throw new Error(`Pixabay API error: 400 ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`Pixabay API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.hits) ? data.hits : [])
    .filter((hit: any) => hit?.id && typeof hit?.webformatURL === 'string' && PIXABAY_IMAGE.test(hit.webformatURL))
    .map((hit: any) => toPhoto(hit, attempt.words));
}

// A set of photos for one attempt: from the day's searches when it was asked for in the last 24
// hours (Pixabay's rule), else from Pixabay (while this search has asks left; null when not
// looked for) and kept for the next day. The store of searches failing never stops a search;
// now and then, searches over a day old are cleared out.
async function findPhotos(admin: any, attempt: Attempt, page: number, asked: { count: number }) {
  const cacheKey = `pixabay|${attempt.lang}|${attempt.category}|${page}|${attempt.words.toLowerCase()}`;
  try {
    const { data: hit, error } = await admin.from('photo_search_cache').select('photos, fetched_at').eq('key', cacheKey).maybeSingle();
    if (error) throw error;
    if (hit && Date.now() - Date.parse(hit.fetched_at) < DAY_MS && Array.isArray(hit.photos)) return hit.photos;
  } catch (e) {
    console.warn('findProductImage v25: searches store not read:', (e as Error).message);
  }
  if (asked.count >= MAX_ASKS) return null;
  asked.count++;
  const photos = await askPixabay(attempt, page);
  try {
    const { error } = await admin.from('photo_search_cache').upsert({ key: cacheKey, photos, fetched_at: new Date().toISOString() });
    if (error) throw error;
    if (Math.random() < 0.05) {
      await admin.from('photo_search_cache').delete().lt('fetched_at', new Date(Date.now() - DAY_MS).toISOString());
    }
  } catch (e) {
    console.warn('findProductImage v25: search not stored:', (e as Error).message);
  }
  return photos;
}

// v24: copies the photos the shop uses into its product photos (Pixabay's addresses aren't kept).
async function keepPhotos(req: Request, body: any) {
  const email = await callerEmail(req);
  if (!email) return json({ error: 'Please sign in again.' }, 401);
  const tenantId = typeof body?.tenantId === 'string' && body.tenantId.trim() ? body.tenantId.trim() : null;
  const photos = Array.isArray(body?.photos) ? body.photos : [];
  if (!photos.length || photos.length > MAX_KEEP_AT_ONCE
    || !photos.every((p: any) => typeof p?.id === 'string' && PHOTO_ID.test(p.id) && typeof p?.url === 'string' && PIXABAY_IMAGE.test(p.url))) {
    return json({ error: `Send 1 to ${MAX_KEEP_AT_ONCE} Pixabay photos.` }, 400);
  }
  const admin = adminClient();
  const { data: storeId, error: authError } = await admin.rpc('ai_authorized_store', {
    p_email: email, p_tenant_id: tenantId, p_permissions: ['products.create', 'products.edit'],
  });
  if (authError) throw authError;
  if (!storeId) return json({ error: 'You do not have access to image search.' }, 403);
  const { data: withinQuota, error: quotaError } = await admin.rpc('ai_quota_take', {
    p_feature: 'photoKeep', p_scope: `user:${email.toLowerCase()}`, p_window_seconds: 3600, p_limit: KEEPS_PER_PERSON_PER_HOUR,
  });
  if (quotaError) throw quotaError;
  if (!withinQuota) return json({ error: 'Too many photos this hour. Please try again later.' }, 429);

  const kept = await Promise.all(photos.map(async ({ id, url }: { id: string; url: string }) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) { console.warn(`findProductImage v25: ${id} not fetched (${res.status})`); return null; }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) { console.warn(`findProductImage v25: ${id} is not a photo (${type})`); return null; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) { console.warn(`findProductImage v25: ${id} size ${bytes.length}`); return null; }
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${storeId}/products/${id}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, cacheControl: LONG_CACHE, upsert: false });
      if (error) { console.warn(`findProductImage v25: ${id} not saved:`, error.message); return null; }
      return { from: url, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
    } catch (e) {
      console.warn(`findProductImage v25: ${id} not kept:`, (e as Error).message);
      return null;
    }
  }));
  const copies = kept.filter(Boolean);
  console.log(`findProductImage v25: kept ${copies.length} of ${photos.length} photos for store ${storeId}`);
  return json({ kept: copies });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Gives back the monthly photo search this call used (set once it is used).
  let giveBackSearch: (() => Promise<void>) | null = null;
  try {
    const body = await req.json();
    if (body?.action === 'keep') return await keepPhotos(req, body);
    if (body?.action) return json({ error: 'Unknown action.' }, 400);
    const { query, page: rawPage, tenantId: rawTenantId } = body;
    const tenantId = typeof rawTenantId === 'string' && rawTenantId.trim() ? rawTenantId.trim() : null;
    if (!query?.trim()) return json({ error: 'query required' }, 400);

    // Who is asking, may they, and have they got searches left.
    const email = await callerEmail(req);
    if (!email) return json({ error: 'Please sign in again.' }, 401);
    if (String(query).length > MAX_QUERY_CHARS) return json({ error: 'Search text is too long.' }, 400);

    const admin = adminClient();
    const { data: storeId, error: authError } = await admin.rpc('ai_authorized_store', {
      p_email: email, p_tenant_id: tenantId, p_permissions: ['products.create', 'products.edit'],
    });
    if (authError) throw authError;
    if (!storeId) return json({ error: 'You do not have access to image search.' }, 403);

    const { data: withinQuota, error: quotaError } = await admin.rpc('ai_quota_take', {
      p_feature: 'findProductImage', p_scope: `user:${email.toLowerCase()}`, p_window_seconds: 3600, p_limit: SEARCHES_PER_PERSON_PER_HOUR,
    });
    if (quotaError) throw quotaError;
    if (!withinQuota) return json({ error: 'Too many image searches this hour. Please try again later.' }, 429);

    // Monthly allowance (free shops: 3 searches a month; business: unlimited).
    const { data: allowance, error: allowanceError } = await admin.rpc('ai_monthly_take', {
      p_tenant_id: storeId, p_feature: 'photo_search',
    });
    if (allowanceError) throw allowanceError;
    if (!allowance?.allowed) {
      return json({
        error: `You've used this month's ${allowance?.limit ?? 0} photo searches. They reset on ${resetLabel(allowance?.resets_at)}.`,
        code: 'allowance_used', allowance,
      }, 429);
    }
    if (allowance.limit != null) {
      giveBackSearch = async () => {
        const { error: refundError } = await admin.rpc('ai_monthly_refund', { p_tenant_id: storeId, p_feature: 'photo_search' });
        if (refundError) throw refundError;
      };
    }

    // 6 sets of 5 (30 photos), then set 1 again; a later set with nothing: set 1.
    let page = parseInt(rawPage) || 1;
    page = ((page - 1) % SETS) + 1;
    const plan = searchPlan(String(query));
    const asked = { count: 0 };
    let found: { attempt: Attempt; photos: any[]; page: number } | null = null;
    for (const set of page === 1 ? [1] : [page, 1]) {
      for (const attempt of plan) {
        const photos = await findPhotos(admin, attempt, set, asked);
        if (photos?.length) { found = { attempt, photos, page: set }; break; }
      }
      if (found) break;
    }
    if (!found) {
      console.log(`findProductImage v25: "${query}": nothing found (${plan.map((a) => `${a.words} [${a.lang}, ${a.category}]`).join(' > ') || 'no words'}; asked Pixabay ${asked.count})`);
      return json({ error: 'No images found for this keyword' }, 404);
    }
    console.log(`findProductImage v25: "${query}" -> "${found.attempt.words}" (${found.attempt.lang}, ${found.attempt.category}) set ${found.page}: ${found.photos.length} photos (asked Pixabay ${asked.count})`);
    return json({ photos: found.photos, keyword: found.attempt.words, page: found.page });
  } catch (error) {
    console.error('findProductImage v25 error:', error);
    if (giveBackSearch) {
      try {
        await giveBackSearch();
      } catch (refundError) {
        console.error('findProductImage: could not give the search back:', (refundError as Error).message);
      }
    }
    return json({ error: (error as Error).message }, 500);
  }
});
