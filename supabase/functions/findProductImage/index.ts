// findProductImage — v24 (Pixabay). Deploy with verify_jwt: true.
// Alvin, 20 Nov 2026: "Let's go with using the pixabay" (Unsplash disabled Sellio's account; its
// developer account is still being asked for). Pixabay's API rules (pixabay.com/api/docs):
//   - its image addresses may be used to show search results for a while, never kept ("permanent
//     hotlinking of images ... is not allowed"): a photo the shop uses is copied into its product
//     photos ({ action: 'keep' }, below), and the app saves the copy;
//   - "requests must be cached for 24 hours": each search's answer is kept a day in
//     public.photo_search_cache, and Pixabay is asked again only after that;
//   - wherever results are shown, say they're from Pixabay (the app does: "Photos from Pixabay");
//   - 100 requests a minute for Sellio as a whole.
// The key is the project's PIXABAY_API_KEY secret; there is no built-in one (v23's Unsplash key,
// which this function carried, is gone with Unsplash).
//
// A search: { query, page, tenantId } → { photos: [{ id, previewUrl, keepUrl, alt, credit }],
// keyword, page }. previewUrl (Pixabay's 640 px, valid for 24 hours) is for showing it; keepUrl
// (1280 px, as long) for { action: 'keep' }. There is no `url`: an app from before v24 (which
// saved Unsplash's `url` as the product's photo) finds no photo in the answer rather than saving
// an address that stops working after a day. credit: { source: 'pixabay', name, profile, photo }.
// Item names in Chinese are looked for in Chinese (Pixabay's lang=zh); others as v23, in English.
//
// { action: 'keep', tenantId, photos: [{ id, url }] }: copies each photo (1 to 8 Pixabay image
// addresses, from a search's keepUrl) into product-images/<store>/products/<id>-<time>.<ext> and
// answers { kept: [{ from, url }] } with the copies made (one that couldn't be fetched or saved is
// left out). The same access check as a search; 300 a person an hour; no search is used up.
//
// Everything else is v23: who may search (signed in, an active member with products.create or
// products.edit of an open store: ai_authorized_store), 150 searches a person an hour, a store's
// monthly allowance (free personal shops: 3 a calendar month) given back when the search fails,
// the words worked out from the item's name (LOCAL_FOOD_MAP), sets of 5 (6 sets, then set 1
// again), the first word tried when the words find nothing, set 1 when a later set is empty.
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEARCHES_PER_PERSON_PER_HOUR = 150;
const KEEPS_PER_PERSON_PER_HOUR = 300;
const MAX_QUERY_CHARS = 100;
const MAX_KEEP_AT_ONCE = 8;
const PER_PAGE = 5;
const SETS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const BUCKET = 'product-images';
const LONG_CACHE = '31536000';
// Pixabay's image addresses: search results' (pixabay.com/get/…) and its CDN's (cdn.pixabay.com/photo/…).
const PIXABAY_IMAGE = /^https:\/\/(?:cdn\.)?pixabay\.com\/(?:get|photo)\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/i;
const PHOTO_ID = /^pixabay-\d{1,12}$/;
const CJK = /[㐀-鿿豈-﫿]/;

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

const LOCAL_FOOD_MAP: Record<string, string> = {
  'kopi o kosong peng': 'iced black coffee unsweetened',
  'kopi c kosong peng': 'iced coffee evaporated milk unsweetened',
  'kopi o kosong':      'black coffee unsweetened',
  'kopi c kosong':      'coffee evaporated milk unsweetened',
  'kopi c peng':        'iced coffee evaporated milk',
  'kopi o peng':        'iced black coffee',
  'kopi gao peng':      'iced strong black coffee',
  'kopi si peng':       'iced coffee milk sweet',
  'kopi tarik':         'pulled coffee milk froth',
  'kopi gao':           'strong black coffee',
  'kopi o':             'black coffee',
  'kopi c':             'coffee evaporated milk',
  'kopi si':            'coffee fresh milk',
  'kopi peng':          'iced coffee',
  'kopi':               'coffee cup',
  'teh o kosong peng':  'iced black tea unsweetened',
  'teh c kosong peng':  'iced tea evaporated milk unsweetened',
  'teh o kosong':       'black tea unsweetened',
  'teh c kosong':       'tea evaporated milk unsweetened',
  'teh tarik':          'pulled milk tea frothy',
  'teh c peng':         'iced tea evaporated milk',
  'teh o peng':         'iced black tea',
  'teh halia peng':     'iced ginger tea',
  'teh halia':          'ginger tea',
  'teh si peng':        'iced tea fresh milk',
  'teh o':              'black tea',
  'teh c':              'tea evaporated milk',
  'teh si':             'tea fresh milk',
  'teh peng':           'iced tea',
  'teh':                'tea cup',
  'yuan yang peng':     'iced coffee tea mix',
  'yuan yang':          'coffee tea mix',
  'yuen yeung':         'coffee tea mix hong kong',
  'milo dinosaur':      'chocolate malt drink powder',
  'milo peng':          'iced chocolate malt drink',
  'milo':               'chocolate malt drink',
  'horlicks peng':      'iced malt drink',
  'horlicks':           'malt drink',
  'ovaltine':           'chocolate malt drink',
  'bandung peng':       'iced rose milk drink pink',
  'bandung':            'rose milk drink pink',
  'sirap bandung':      'rose milk syrup drink',
  'sirap':              'rose syrup drink red',
  'barley':             'barley drink',
  'air mata kucing':    'longan herbal drink',
  'sugarcane juice':    'sugarcane juice green',
  'tebu':               'sugarcane juice',
  'soya bean milk':     'soy milk drink',
  'soyabean':           'soy milk drink',
  'chrysanthemum tea':  'chrysanthemum flower tea',
  'grass jelly':        'grass jelly drink black',
  'cincau':             'grass jelly drink',
  'kelapa':             'coconut water',
  'coconut shake':      'coconut milkshake',
  'cendol':             'cendol shaved ice green jelly',
  'chendol':            'cendol shaved ice green jelly',
  'ice kachang':        'ais kacang shaved ice colourful',
  'ais kacang':         'shaved ice colourful toppings',
  'abc':                'shaved ice dessert colourful',
  'ice cream sandwich': 'ice cream wafer sandwich',
  'nasi lemak':         'nasi lemak coconut rice anchovies egg',
  'nasi goreng':        'nasi goreng fried rice',
  'nasi kandar':        'nasi kandar rice curry',
  'nasi briyani':       'biryani rice aromatic',
  'nasi biryani':       'biryani rice aromatic',
  'nasi padang':        'nasi padang rice indonesian',
  'nasi kerabu':        'nasi kerabu blue rice herbs',
  'nasi dagang':        'nasi dagang rice fish curry',
  'nasi ayam':          'hainanese chicken rice',
  'nasi campur':        'mixed rice dishes',
  'economy rice':       'mixed rice dishes chinese hawker',
  'economic rice':      'mixed rice dishes chinese hawker',
  'zi char':            'chinese stir fry seafood dishes',
  'claypot rice':       'claypot rice chinese',
  'hainanese chicken rice': 'hainanese chicken rice poached',
  'chicken rice':       'chicken rice poached',
  'lontong':            'rice cake coconut curry vegetables',
  'ketupat':            'compressed rice cake woven',
  'char kway teow':     'char kway teow fried flat noodles',
  'hokkien mee':        'hokkien mee fried prawn noodles',
  'prawn mee':          'prawn noodle soup',
  'har mee':            'prawn noodle soup spicy',
  'mee goreng':         'mee goreng fried yellow noodles',
  'mee rebus':          'mee rebus noodles gravy',
  'mee siam':           'mee siam spicy tangy noodles',
  'mee sua':            'mee sua thin noodle soup',
  'ban mian':           'ban mian hand torn noodles soup',
  'pan mee':            'pan mee flat noodles soup',
  'lor mee':            'lor mee thick starchy noodle soup',
  'bak chor mee':       'minced pork noodles dry',
  'wonton mee':         'wonton noodle soup char siew',
  'dry wonton mee':     'dry wonton noodles char siew',
  'fishball noodles':   'fish ball noodle soup',
  'laksa':              'laksa spicy coconut noodle soup',
  'asam laksa':         'asam laksa sour fish noodle soup',
  'curry laksa':        'curry laksa coconut milk noodles',
  'ipoh hor fun':       'silky flat rice noodles soup',
  'hor fun':            'flat rice noodles gravy',
  'kway teow soup':     'flat rice noodles soup',
  'sang har mee':       'crispy noodles prawn gravy',
  'yong tau foo':       'yong tau foo stuffed tofu soup',
  'economy bee hoon':   'rice vermicelli stir fry vegetables',
  'bee hoon':           'rice vermicelli noodles',
  'mee hoon':           'rice vermicelli noodles',
  'tang hoon':          'glass noodles soup',
  'maggi goreng':       'maggi instant noodles fried',
  'bak kut teh':        'bak kut teh pork rib herbal soup',
  'sup tulang':         'bone marrow soup malay',
  'sup kambing':        'mutton soup spiced',
  'watercress soup':    'watercress pork soup clear',
  'lotus root soup':    'lotus root pork soup',
  'fishball soup':      'fish ball soup clear broth',
  'tom yam':            'tom yam spicy seafood soup',
  'tom yum':            'tom yum prawn soup thai',
  'pork rib soup':      'pork rib herbal soup',
  'oxtail soup':        'oxtail soup rich broth',
  'roti prata':         'roti prata flatbread flaky',
  'roti canai':         'roti canai flatbread flaky',
  'roti john':          'roti john egg bread sandwich',
  'murtabak':           'murtabak stuffed flatbread',
  'tosai':              'thosai dosa crispy crepe',
  'thosai':             'thosai dosa crispy crepe',
  'idli':               'idli steamed rice cake',
  'chapati':            'chapati flatbread whole wheat',
  'naan':               'naan bread tandoor',
  'puri':               'puri fried bread puffed',
  'apom':               'appam rice pancake bowl',
  'appam':              'appam rice pancake bowl',
  'banana leaf rice':   'banana leaf rice indian',
  'fish head curry':    'fish head curry indian',
  'biryani':            'biryani aromatic rice spiced',
  'briyani':            'biryani aromatic rice spiced',
  'tandoori':           'tandoori chicken grilled',
  'dhal':               'dal lentil curry',
  'sambar':             'sambar lentil vegetable soup',
  'rasam':              'rasam spiced tamarind soup',
  'vadai':              'vada fried lentil doughnut',
  'murukku':            'murukku fried snack crunchy',
  'thosai masala':      'masala dosa potato filling',
  'prata':              'roti prata flatbread flaky',
  'rendang':            'rendang dry beef curry spiced',
  'beef rendang':       'beef rendang dry curry spiced',
  'chicken rendang':    'chicken rendang dry curry',
  'ayam penyet':        'ayam penyet smashed fried chicken',
  'ayam goreng':        'fried chicken crispy',
  'ayam bakar':         'grilled chicken malay',
  'sambal stingray':    'sambal stingray grilled banana leaf',
  'ikan bakar':         'grilled fish banana leaf',
  'asam pedas':         'asam pedas sour spicy fish stew',
  'masak lemak':        'masak lemak coconut milk curry',
  'gulai':              'gulai curry coconut milk',
  'soto ayam':          'soto ayam chicken soup noodles',
  'lontong sayur':      'lontong rice cake vegetable coconut',
  'mee bandung':        'noodles thick spicy gravy',
  'laksa johor':        'johor laksa spaghetti fish',
  'nasi ambeng':        'nasi ambeng communal rice dish',
  'kuah lodeh':         'lodeh vegetable coconut milk',
  'char siew':          'char siew bbq roast pork',
  'sio bak':            'siu yuk roast pork crackling',
  'roast duck':         'roast duck chinese',
  'duck rice':          'duck rice chinese braised',
  'kong bak bao':       'braised pork belly bun',
  'bao':                'steamed bun pork',
  'carrot cake':        'chai tow kway fried radish cake',
  'chai tow kway':      'fried carrot cake radish egg',
  'or luak':            'oyster omelette egg',
  'orh luak':           'oyster omelette egg',
  'oyster omelette':    'oyster omelette egg crispy',
  'popiah':             'popiah fresh spring roll',
  'kueh pie tee':       'kueh pie tee pastry cup prawn',
  'ngoh hiang':         'ngoh hiang five spice pork roll',
  'rojak':              'rojak fruit vegetable peanut sauce',
  'pasembur':           'pasembur indian rojak fried crispy',
  'satay':              'satay grilled skewer peanut sauce',
  'satay celup':        'satay celup skewers dipping soup',
  'dim sum':            'dim sum chinese dumplings',
  'har gow':            'har gow shrimp dumpling steamed',
  'siew mai':           'siu mai pork shrimp dumpling',
  'char siew bao':      'char siew bao bbq pork bun steamed',
  'lo mai gai':         'lo mai gai glutinous rice chicken',
  'cheung fun':         'cheung fun rice noodle roll',
  'turnip cake':        'lo bak go radish cake pan fried',
  'lo bak go':          'lo bak go radish cake pan fried',
  'tau huay':           'tofu pudding silken soft',
  'tofu pudding':       'tofu pudding silken soft',
  'tau suan':           'tau suan mung bean dessert',
  'cheng tng':          'cheng tng sweet clear herbal soup',
  'tang yuan':          'tang yuan glutinous rice ball',
  'bubur cha cha':      'bubur cha cha coconut milk taro yam',
  'orh nee':            'yam paste dessert sweet',
  'ang ku kueh':        'ang ku kueh red tortoise cake',
  'soon kueh':          'soon kueh steamed vegetable dumpling',
  'kueh lapis':         'kueh lapis layered cake',
  'ondeh ondeh':        'ondeh ondeh green glutinous ball coconut',
  'onde onde':          'ondeh ondeh green glutinous ball coconut',
  'pisang goreng':      'goreng pisang fried banana fritter',
  'goreng pisang':      'fried banana fritter golden',
  'curry puff':         'curry puff pastry crispy',
  'epok epok':          'curry puff pastry fried',
  'otah':               'otak otak grilled fish cake spiced',
  'otak otak':          'otak otak grilled fish cake spiced',
  'kaya toast':         'kaya toast bread butter spread',
  'half boiled eggs':   'soft boiled eggs runny yolk',
  'soft boiled eggs':   'soft boiled eggs runny yolk',
  'economy bee hoon goreng': 'fried rice vermicelli hawker',
  'chili crab':         'chilli crab singapore seafood sauce',
  'chilli crab':        'chilli crab singapore seafood sauce',
  'black pepper crab':  'black pepper crab seafood',
  'salted egg crab':    'salted egg yolk crab',
  'salted egg prawns':  'salted egg yolk prawns',
  'cereal prawns':      'cereal butter prawns crispy',
  'butter prawns':      'butter prawn crispy',
  'sambal sotong':      'sambal squid spicy',
  'sotong':             'squid seafood',
  'sambal kangkong':    'sambal water spinach stir fry',
  'ikan bilis':         'dried anchovies crispy',
  'durian':             'durian tropical fruit spiky',
  'durian puff':        'durian cream puff pastry',
  'mango sticky rice':  'mango sticky rice thai dessert',
  'puttu mayam':        'string hoppers coconut rice noodle',
  'waffles':            'waffle crispy golden syrup',
  'egg tart':           'egg tart portuguese custard',
  'kaya':               'kaya coconut jam spread green',
  'teh botol':          'bottled sweet tea drink',
  'milo van':           'chocolate malt ice cream van',
  'iced gem biscuits':  'iced gem biscuits colourful',
  'yakult':             'probiotic yogurt drink',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or',
  'my', 'our', 'your', 'is', 'are', 'was', 'be', 'this', 'that', 'it',
  'no', 'not', 'some', 'any', 'get', 'find', 'show', 'add',
  'new', 'best', 'good', 'great', 'nice', 'very',
]);

const lookupLocalFood = (query: string): string | null => {
  const q = query.toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
  const entries = Object.entries(LOCAL_FOOD_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, mapped] of entries) {
    if (q === phrase || q.startsWith(phrase + ' ') || q.includes(' ' + phrase) || q.includes(phrase)) {
      return mapped;
    }
  }
  return null;
};

const parseKeyword = (query: string): string => {
  const localMatch = lookupLocalFood(query);
  if (localMatch) return localMatch;

  const words = query
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));

  return words.slice(0, 2).join(' ') || query.trim().split(/\s+/)[0] || 'food';
};

// What to look for, and in which language: a name in Chinese as it's written (Pixabay searches
// Chinese with lang=zh), anything else worked out in English as before.
export function searchWords(query: string): { keyword: string; lang: 'zh' | 'en' } {
  const q = String(query || '').trim();
  if (CJK.test(q)) return { keyword: q.replace(/\s+/g, ' ').slice(0, MAX_QUERY_CHARS), lang: 'zh' };
  return { keyword: parseKeyword(q), lang: 'en' };
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
async function askPixabay(keyword: string, lang: string, page: number) {
  const key = pixabayKey();
  if (!key) throw new Error('Pixabay key missing: set the PIXABAY_API_KEY secret');
  const params = new URLSearchParams({ key, q: keyword, lang, image_type: 'photo', safesearch: 'true', per_page: String(PER_PAGE), page: String(page) });
  const res = await fetch(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(10000) });
  console.log(`findProductImage v24: Pixabay ${res.status} for "${keyword}" (${lang}) set ${page}, rate limit ${res.headers.get('x-ratelimit-limit')}/min, ${res.headers.get('x-ratelimit-remaining')} left`);
  if (res.status === 400) {
    const text = await res.text().catch(() => '');
    if (/out of valid range/i.test(text)) return [];
    throw new Error(`Pixabay API error: 400 ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`Pixabay API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data?.hits) ? data.hits : [])
    .filter((hit: any) => hit?.id && typeof hit?.webformatURL === 'string' && PIXABAY_IMAGE.test(hit.webformatURL))
    .map((hit: any) => toPhoto(hit, keyword));
}

// A set of photos, from the day's searches when it was asked for in the last 24 hours (Pixabay's
// rule), else from Pixabay and kept for the next day. The store of searches failing never stops a
// search; now and then, searches over a day old are cleared out.
async function findPhotos(admin: any, keyword: string, lang: string, page: number) {
  const cacheKey = `pixabay|${lang}|${page}|${keyword.toLowerCase()}`;
  try {
    const { data: hit, error } = await admin.from('photo_search_cache').select('photos, fetched_at').eq('key', cacheKey).maybeSingle();
    if (error) throw error;
    if (hit && Date.now() - Date.parse(hit.fetched_at) < DAY_MS && Array.isArray(hit.photos)) return hit.photos;
  } catch (e) {
    console.warn('findProductImage v24: searches store not read:', (e as Error).message);
  }
  const photos = await askPixabay(keyword, lang, page);
  try {
    const { error } = await admin.from('photo_search_cache').upsert({ key: cacheKey, photos, fetched_at: new Date().toISOString() });
    if (error) throw error;
    if (Math.random() < 0.05) {
      await admin.from('photo_search_cache').delete().lt('fetched_at', new Date(Date.now() - DAY_MS).toISOString());
    }
  } catch (e) {
    console.warn('findProductImage v24: search not stored:', (e as Error).message);
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
      if (!res.ok) { console.warn(`findProductImage v24: ${id} not fetched (${res.status})`); return null; }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) { console.warn(`findProductImage v24: ${id} is not a photo (${type})`); return null; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) { console.warn(`findProductImage v24: ${id} size ${bytes.length}`); return null; }
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${storeId}/products/${id}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, cacheControl: LONG_CACHE, upsert: false });
      if (error) { console.warn(`findProductImage v24: ${id} not saved:`, error.message); return null; }
      return { from: url, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
    } catch (e) {
      console.warn(`findProductImage v24: ${id} not kept:`, (e as Error).message);
      return null;
    }
  }));
  const copies = kept.filter(Boolean);
  console.log(`findProductImage v24: kept ${copies.length} of ${photos.length} photos for store ${storeId}`);
  return json({ kept: copies });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // v22: gives back the monthly photo search this call used (set once it is used).
  let giveBackSearch: (() => Promise<void>) | null = null;
  try {
    const body = await req.json();
    if (body?.action === 'keep') return await keepPhotos(req, body);
    if (body?.action) return json({ error: 'Unknown action.' }, 400);
    const { query, page: rawPage, tenantId: rawTenantId } = body;
    const tenantId = typeof rawTenantId === 'string' && rawTenantId.trim() ? rawTenantId.trim() : null;
    if (!query?.trim()) return json({ error: 'query required' }, 400);

    // ── who is asking, may they, and have they got searches left ──────
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

    // v22: monthly allowance (free shops: 3 searches a month; business: unlimited).
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

    // 6 sets of 5 (30 photos), then set 1 again.
    let page = parseInt(rawPage) || 1;
    page = ((page - 1) % SETS) + 1;

    const { keyword, lang } = searchWords(String(query));
    console.log(`findProductImage v24: query="${query}" -> keyword="${keyword}" (${lang}) | page=${page}`);

    let photos = await findPhotos(admin, keyword, lang, page);
    // Nothing for the words: the first word alone (same set).
    if (photos.length === 0 && lang === 'en') {
      const firstWord = keyword.split(' ')[0];
      if (firstWord && firstWord !== keyword) photos = await findPhotos(admin, firstWord, lang, page);
    }
    // A later set that's empty (the words ran out of photos): set 1.
    if (photos.length === 0 && page !== 1) {
      photos = await findPhotos(admin, keyword, lang, 1);
      page = 1;
    }
    if (photos.length === 0) return json({ error: 'No images found for this keyword' }, 404);

    console.log(`findProductImage v24: returning ${photos.length} photos for keyword="${keyword}" page=${page}`);
    return json({ photos, keyword, page });
  } catch (error) {
    console.error('findProductImage v24 error:', error);
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
