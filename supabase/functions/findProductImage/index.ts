// findProductImage - v27 (Pixabay, paced: photos copied two at a time, waiting when it says so).
// Deploy with verify_jwt: true.
//
// v27, Alvin 20 Nov 2026 ("proceed"): when his 22-item Cafelicious scan was saved (v25), the
// copying asked Pixabay for 8 photos at once, then 8 more a second later: the second 8 were all
// turned away (429) and saved without a photo. Pixabay answers too many requests with 429 (images
// and searches alike; searches: 100 a minute for Sellio as a whole). Now:
//   - keep: photos are fetched two at a time, a moment apart; a 429 makes every fetch of the call
//     wait (Retry-After or X-RateLimit-Reset when Pixabay says, else 1, 2, 4 s, at most 10 s) and
//     the photo is fetched again, up to KEEP_TRIES times, within KEEP_DEADLINE_MS. Photos still
//     turned away come back in `busy`, with retryAfter (the app sends them again once);
//   - search: a 429 with the minute's window about to reset (5 s or less) is waited out and asked
//     once more; otherwise, or again 429, the answer is 429 { code: 'busy', retryAfter } (seconds)
//     and the month's search is given back. The app's Scan Menu waits that long and carries on.
// Everything else is v26.
//
// v26, Alvin 20 Nov 2026: "enhance the keyword searches ... so that it encompasses all possible
// food choices as well as for the hawker or even the F&B line" (after v25, his re-scan still had
// a biryani and a satay among "Asian Chicken Salad"'s photos). Now:
//   - hint: a few English words for the dish from Scan Menu's reader (scanMenu v22 photo_search,
//     from the menu's context: "fried radish cake" for a hawker stall's "Carrot Cake"), searched
//     first (Food & Drink);
//   - LOCAL_DISHES has about 680 dishes and drinks: hawker dishes in their many spellings
//     (kway/kuey/koay teow, mee/mi/mie, bee hoon/bihun), Malay, Indonesian, Chinese, Indian,
//     Thai, Vietnamese, Japanese and Korean dishes, kopitiam, cafe and bubble tea drinks;
//   - a name in Malay or Indonesian that isn't on the list is put into English, the words turned
//     round ("Ikan Bakar Petai" -> "petai grilled fish");
//   - Pixabay is asked for 30 photos at a time and they're put in order of how well their tags
//     match the words (Pixabay orders by popularity, so popular photos matching only some of the
//     words came first); the 6 sets of 5 come from that one answer, kept a day, so "more photos"
//     asks Pixabay nothing.
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
//     public.photo_search_cache (key "pixabay|<lang>|<food or all>|<words>": up to 30, best first);
//   - wherever results are shown, say they're from Pixabay (the app does: "Photos from Pixabay");
//   - 100 requests a minute for Sellio as a whole.
// The key is the project's PIXABAY_API_KEY secret.
//
// A search: { query, page, tenantId, hint? } -> { photos: [{ id, previewUrl, keepUrl, alt, credit }],
// keyword (the words that found them), page }. previewUrl (Pixabay's 640 px, valid for 24 hours)
// is for showing it; keepUrl (1280 px, as long) for { action: 'keep' }. There is no `url`: an app
// from before v24 finds no photo in the answer rather than saving an address that stops working.
//
// { action: 'keep', tenantId, photos: [{ id, url }] }: copies each photo (1 to 8 Pixabay image
// addresses, from a search's keepUrl) into product-images/<store>/products/<id>-<time>.<ext> and
// answers { kept: [{ from, url }], busy: [url], retryAfter? } with the copies made and the photos
// Pixabay still turned away for coming too fast, to send again in retryAfter seconds (one that
// couldn't be fetched or saved otherwise is in neither). The same access check as a search; 300 a
// person an hour; no search is used up.
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
// v27: Pixabay's pace (see the top).
export const KEEP_AT_A_TIME = 2;
export const KEEP_GAP_MS = 250;
export const KEEP_TRIES = 4;
const KEEP_DEADLINE_MS = 60_000;
const MAX_WAIT_MS = 10_000;
const SEARCH_WAIT_MAX_S = 5;
const BUSY_RETRY_S = 20;
// Waiting, and the clock (tests replace them).
export const timing = { sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), now: () => Date.now() };
export const MAX_ASKS = 6;
const PER_PAGE = 5;
export const PIXABAY_PER_ASK = 30; // 6 sets of 5 from one answer
const MAX_HINT_CHARS = 60;
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
  // v26: Kopitiam drinks, more ways of writing them.
  'kopi siu dai':       'milk coffee',
  'kopi kosong':        'coffee',
  'kopi ais':           'iced coffee',
  'kopi o ais':         'iced black coffee',
  'kopi susu':          'milk coffee',
  'es kopi susu':       'iced coffee',
  'teh ais':            'iced milk tea',
  'teh o ais':          'iced tea',
  'teh o limau':        'lemon tea',
  'teh o ais limau':    'iced lemon tea',
  'teh limau':          'lemon tea',
  'teh tarik ais':      'iced milk tea',
  'teh masala':         'masala tea',
  'masala chai':        'masala tea',
  'es teh':             'iced tea',
  'es teh manis':       'iced tea',
  'es jeruk':           'orange juice',
  'air kosong':         'water',
  'air sirap':          'rose syrup',
  'air limau':          'lime juice',
  'air tebu':           'sugarcane juice',
  'air kelapa':         'coconut water',
  'air batu campur':    'shaved ice',
  'ais batu campur':    'shaved ice',
  'calamansi':          'lime juice',
  'kalamansi':          'lime juice',
  'calamansi juice':    'lime juice',
  'sugar cane':         'sugarcane juice',
  'sugarcane':          'sugarcane juice',
  'soy bean milk':      'soy milk',
  'tau huay chui':      'soy milk',
  'milo godzilla':      'chocolate drink',
  'ice kacang':         'shaved ice',
  'soya bean':          'soy milk',
  'soybean':            'soy milk',
  // v26: Cafe drinks.
  'bubble tea':         'bubble tea',
  'boba':               'bubble tea',
  'boba milk tea':      'bubble tea',
  'pearl milk tea':     'bubble tea',
  'brown sugar milk tea': 'bubble tea',
  'brown sugar boba':   'bubble tea',
  'taro milk tea':      'bubble tea',
  'tapioca milk tea':   'bubble tea',
  'thai milk tea':      'thai iced tea',
  'cha yen':            'thai iced tea',
  'thai iced tea':      'thai iced tea',
  'vietnamese coffee':  'vietnamese coffee',
  'ca phe sua da':      'vietnamese coffee',
  'long black':         'black coffee',
  'flat white':         'latte',
  'babyccino':          'frothy milk',
  'dirty chai':         'chai latte',
  'hojicha':            'roasted tea',
  'hojicha latte':      'tea latte',
  // v26: Rice.
  'nasi uduk':          'coconut rice',
  'nasi kuning':        'yellow rice',
  'nasi kukus':         'steamed rice',
  'nasi minyak':        'ghee rice',
  'nasi tomato':        'tomato rice',
  'nasi pattaya':       'omelette fried rice',
  'nasi goreng pattaya': 'omelette fried rice',
  'nasi goreng kampung': 'fried rice',
  'nasi ulam':          'herb rice',
  'cai fan':            'mixed rice',
  'chap fan':           'mixed rice',
  'cai png':            'mixed rice',
  'chap chye png':      'mixed rice',
  'char siew rice':     'roast pork rice',
  'char siu rice':      'roast pork rice',
  'cha siu rice':       'roast pork rice',
  'roast chicken rice': 'chicken rice',
  'steamed chicken rice': 'chicken rice',
  'chicken rice ball':  'chicken rice',
  'chicken rice balls': 'chicken rice',
  'braised duck rice':  'duck rice',
  'roast duck rice':    'duck rice',
  'bo zai fan':         'claypot rice',
  'claypot chicken rice': 'claypot rice',
  'yang chow fried rice': 'fried rice',
  'yangzhou fried rice': 'fried rice',
  'khao pad':           'thai fried rice',
  'khao phat':          'thai fried rice',
  'khao man gai':       'chicken rice',
  'com tam':            'broken rice',
  'katsudon':           'pork cutlet rice',
  'katsu don':          'pork cutlet rice',
  'gyudon':             'beef rice bowl',
  'oyakodon':           'chicken rice bowl',
  'unadon':             'eel rice',
  'unagi don':          'eel rice',
  'chirashi':           'sashimi rice bowl',
  'chirashi don':       'sashimi rice bowl',
  'kaisendon':          'sashimi rice bowl',
  'kaisen don':         'sashimi rice bowl',
  'donburi':            'rice bowl',
  'onigiri':            'rice ball',
  'omurice':            'omelette rice',
  'congee':             'rice porridge',
  'jook':               'rice porridge',
  'bubur ayam':         'chicken porridge',
  'bubur lambuk':       'rice porridge',
  'teochew porridge':   'rice porridge',
  'century egg porridge': 'rice porridge',
  'lemang':             'bamboo rice',
  'zongzi':             'rice dumplings',
  'bak chang':          'rice dumplings',
  'ba chang':           'rice dumplings',
  'nyonya chang':       'rice dumplings',
  'lu rou fan':         'braised pork rice',
  'lor bak png':        'braised pork rice',
  // v26: Noodles, more ways of writing them.
  'char kuey teow':     'fried noodles',
  'char koay teow':     'fried noodles',
  'char kwai teow':     'fried noodles',
  'fried kway teow':    'fried noodles',
  'fried kuey teow':    'fried noodles',
  'ckt':                'fried noodles',
  'kway teow':          'rice noodles',
  'kuey teow':          'rice noodles',
  'koay teow':          'rice noodles',
  'kuay teow':          'rice noodles',
  'kwetiau':            'rice noodles',
  'kwetiau goreng':     'fried noodles',
  'ho fun':             'rice noodles',
  'hor fan':            'rice noodles',
  'wat dan hor':        'rice noodles',
  'beef hor fun':       'beef noodles',
  'bihun':              'rice vermicelli',
  'mihun':              'rice vermicelli',
  'bihun goreng':       'fried vermicelli',
  'mee hoon goreng':    'fried vermicelli',
  'fried bee hoon':     'fried vermicelli',
  'bee hoon goreng':    'fried vermicelli',
  'mee kia':            'noodles',
  'mee tai mak':        'noodles',
  'yee mee':            'noodles',
  'yi mian':            'noodles',
  'ee fu noodles':      'noodles',
  'kampua mee':         'noodles',
  'curry mee':          'curry noodles',
  'mee kari':           'curry noodles',
  'mee soto':           'noodle soup',
  'mee hailam':         'noodles',
  'mee jawa':           'noodle soup',
  'mee goreng mamak':   'fried noodles',
  'mi goreng':          'fried noodles',
  'mie goreng':         'fried noodles',
  'indomie goreng':     'fried noodles',
  'indomie':            'instant noodles',
  'maggi':              'instant noodles',
  'mie ayam':           'chicken noodles',
  'wanton mee':         'wonton noodles',
  'wantan mee':         'wonton noodles',
  'won ton mee':        'wonton noodles',
  'wanton soup':        'wonton soup',
  'wantan soup':        'wonton soup',
  'wanton':             'wontons',
  'wantan':             'wontons',
  'hae mee':            'prawn noodles',
  'hokkien prawn mee':  'prawn noodles',
  'hokkien char mee':   'fried noodles',
  'fishball mee':       'fish ball noodles',
  'fish ball mee':      'fish ball noodles',
  'bcm':                'pork noodles',
  'mee hoon kueh':      'noodle soup',
  'mee hoon kway':      'noodle soup',
  'chilli pan mee':     'noodles',
  'lamian':             'noodle soup',
  'dao xiao mian':      'noodle soup',
  'zha jiang mian':     'noodles',
  'zhajiangmian':       'noodles',
  'jajangmyeon':        'black bean noodles',
  'dan dan mian':       'noodles',
  'katong laksa':       'curry noodle soup',
  'laksa lemak':        'curry noodle soup',
  'nyonya laksa':       'curry noodle soup',
  'penang laksa':       'fish noodle soup',
  'assam laksa':        'fish noodle soup',
  'sarawak laksa':      'curry noodle soup',
  'johor laksa':        'laksa',
  'pho':                'noodle soup',
  'pho bo':             'beef noodle soup',
  'pho ga':             'chicken noodle soup',
  'bun cha':            'grilled pork noodles',
  'bun bo hue':         'beef noodle soup',
  'pad see ew':         'stir fried noodles',
  'khao soi':           'curry noodle soup',
  'japchae':            'glass noodles',
  'ramyeon':            'instant noodles',
  'ramyun':             'instant noodles',
  'naengmyeon':         'cold noodles',
  'yakisoba':           'fried noodles',
  // v26: Soups and stews.
  'bkt':                'pork rib soup',
  'dry bak kut teh':    'braised pork',
  'kway jap':           'braised pork',
  'fish head bee hoon': 'fish soup',
  'tom yum goong':      'tom yum soup',
  'tom yum kung':       'tom yum soup',
  'tom kha':            'coconut soup',
  'tom kha gai':        'coconut soup',
  'bakso':              'meatball soup',
  'soto':               'soup',
  'rawon':              'beef soup',
  'sop buntut':         'oxtail soup',
  'sup ekor':           'oxtail soup',
  'sup ayam':           'chicken soup',
  'kimchi jjigae':      'kimchi stew',
  'sundubu':            'tofu stew',
  'sundubu jjigae':     'tofu stew',
  'budae jjigae':       'sausage stew',
  'doenjang jjigae':    'soybean stew',
  'jjigae':             'stew',
  'samgyetang':         'chicken soup',
  'mala hot pot':       'hot pot',
  'mala':               'spicy stir fry',
  // v26: Indian.
  'dosa':               'dosa',
  'dosai':              'dosa',
  'masala dosa':        'masala dosa',
  'uttapam':            'pancake',
  'vada':               'lentil fritters',
  'poori':              'fried bread',
  'roti kosong':        'flatbread',
  'roti telur':         'egg flatbread',
  'roti bawang':        'flatbread',
  'roti planta':        'flatbread',
  'roti sardin':        'flatbread',
  'roti pisang':        'banana pancake',
  'roti jala':          'lace pancake',
  'roti bakar':         'toast',
  'roti boy':           'coffee bun',
  'garlic naan':        'naan bread',
  'butter naan':        'naan bread',
  'cheese naan':        'naan bread',
  'daal':               'lentil curry',
  'chana masala':       'chickpea curry',
  'aloo gobi':          'potato curry',
  'palak paneer':       'spinach curry',
  'mutton varuval':     'mutton curry',
  'varuval':            'curry',
  'putu mayam':         'string hoppers',
  'putu piring':        'rice cakes',
  'idiyappam':          'string hoppers',
  'kulfi':              'ice cream',
  'payasam':            'rice pudding',
  'kesari':             'semolina pudding',
  // v26: Malay and Indonesian.
  'ayam masak merah':   'chicken curry',
  'masak merah':        'tomato curry',
  'ayam percik':        'grilled chicken',
  'ayam goreng berempah': 'fried chicken',
  'ayam geprek':        'fried chicken',
  'ayam gepuk':         'fried chicken',
  'ayam kunyit':        'fried chicken',
  'ikan goreng':        'fried fish',
  'ikan asam pedas':    'fish curry',
  'sambal udang':       'sambal prawns',
  'udang goreng':       'fried prawns',
  'sotong goreng':      'fried squid',
  'kangkung belacan':   'water spinach',
  'kangkong belacan':   'water spinach',
  'sayur lodeh':        'vegetable curry',
  'lodeh':              'vegetable curry',
  'kari ayam':          'chicken curry',
  'kari kambing':       'mutton curry',
  'telur dadar':        'omelette',
  'telur mata':         'fried egg',
  'telur rebus':        'boiled egg',
  'begedil':            'potato patties',
  'perkedel':           'potato patties',
  'keropok':            'crackers',
  'keropok lekor':      'fish crackers',
  'kerupuk':            'crackers',
  'cucur udang':        'prawn fritters',
  'jemput jemput':      'fritters',
  'apam balik':         'peanut pancake',
  'martabak':           'stuffed pancake',
  'martabak manis':     'sweet pancake',
  'martabak telur':     'stuffed pancake',
  'gado gado':          'vegetable salad',
  'pecel lele':         'fried catfish',
  'tempe goreng':       'fried tempeh',
  'tahu goreng':        'fried tofu',
  'tauhu goreng':       'fried tofu',
  'tahu telur':         'tofu omelette',
  'gudeg':              'jackfruit curry',
  'pempek':             'fish cake',
  'siomay':             'dumplings',
  'batagor':            'fried dumplings',
  'bakwan':             'vegetable fritters',
  'sate':               'meat skewers',
  'sate ayam':          'chicken skewers',
  'sate kambing':       'mutton skewers',
  'satay ayam':         'chicken skewers',
  'satay kambing':      'mutton skewers',
  'ulam':               'herb salad',
  'acar':               'pickles',
  'achar':              'pickles',
  'kuih':               'rice cakes',
  'kueh':               'rice cakes',
  'kue':                'cakes',
  'kuih lapis':         'layer cake',
  'kueh dadar':         'pandan crepes',
  'kue lapis':          'layer cake',
  'kuih dadar':         'pandan crepes',
  'kueh salat':         'layer cake',
  'kuih seri muka':     'layer cake',
  'kueh tutu':          'steamed cakes',
  'kueh bangkit':       'cookies',
  'kuih bahulu':        'sponge cakes',
  'bahulu':             'sponge cakes',
  'png kueh':           'rice dumplings',
  'kueh kosui':         'rice cakes',
  'kuih koci':          'rice dumplings',
  'pulut inti':         'sticky rice',
  'pulut hitam':        'black rice pudding',
  'bubur pulut hitam':  'black rice pudding',
  'pengat pisang':      'banana dessert',
  'es campur':          'shaved ice',
  'es cendol':          'shaved ice dessert',
  // v26: Chinese.
  'char siu':           'roast pork',
  'cha siu':            'roast pork',
  'siu yuk':            'roast pork',
  'siew yuk':           'roast pork',
  'siew yoke':          'roast pork',
  'char siu bao':       'steamed pork bun',
  'cha siu bao':        'steamed pork bun',
  'char siew pau':      'steamed pork bun',
  'siu mai':            'pork dumplings',
  'shumai':             'pork dumplings',
  'har gau':            'shrimp dumplings',
  'xlb':                'soup dumplings',
  'jiaozi':             'dumplings',
  'shui jiao':          'dumplings',
  'guo tie':            'fried dumplings',
  'you tiao':           'fried dough',
  'youtiao':            'fried dough',
  'you char kway':      'fried dough',
  'yau zha gwai':       'fried dough',
  'douhua':             'tofu pudding',
  'tau foo fah':        'tofu pudding',
  'tau fu fa':          'tofu pudding',
  'tau kwa':            'fried tofu',
  'tau pok':            'tofu puffs',
  'lor bak':            'pork roll',
  'loh bak':            'pork roll',
  'cheong fun':         'rice noodle roll',
  'har cheong gai':     'fried chicken',
  'prawn paste chicken': 'fried chicken',
  'kong ba pau':        'pork belly bun',
  'kong bak pau':       'pork belly bun',
  'gua bao':            'pork belly bun',
  'pau':                'steamed bun',
  'pao':                'steamed bun',
  'big pau':            'steamed bun',
  'dong po rou':        'braised pork belly',
  'dongpo pork':        'braised pork belly',
  'lor ark':            'braised duck',
  'yu sheng':           'raw fish salad',
  'yusheng':            'raw fish salad',
  'lo hei':             'raw fish salad',
  'bak kwa':            'pork jerky',
  'bakkwa':             'pork jerky',
  'dan tat':            'egg tart',
  'polo bun':           'pineapple bun',
  'bo lo bao':          'pineapple bun',
  'tau sar piah':       'pastry',
  'tangyuan':           'glutinous rice balls',
  'mango pomelo sago':  'mango dessert',
  'yang zhi gan lu':    'mango dessert',
  'crab bee hoon':      'crab noodles',
  'salted egg yolk prawns': 'fried prawns',
  'bbq stingray':       'grilled fish',
  'stingray':           'grilled fish',
  'cereal prawn':       'fried prawns',
  'lala':               'clams',
  'la la':              'clams',
  'kam heong':          'stir fry',
  'gong gong':          'sea snails',
  // v26: Japanese and Korean.
  'tonkatsu':           'pork cutlet',
  'chicken katsu':      'chicken cutlet',
  'karaage':            'fried chicken',
  'chicken karaage':    'fried chicken',
  'tori karaage':       'fried chicken',
  'ebi tempura':        'prawn tempura',
  'ebi fry':            'fried prawns',
  'temaki':             'sushi rolls',
  'gunkan':             'sushi',
  'inari':              'sushi',
  'chawanmushi':        'steamed egg',
  'tamagoyaki':         'omelette',
  'tamago':             'omelette',
  'unagi':              'grilled eel',
  'saba':               'grilled fish',
  'tteokbokki':         'rice cakes',
  'topokki':            'rice cakes',
  'ddeokbokki':         'rice cakes',
  'kimbap':             'rice rolls',
  'gimbap':             'rice rolls',
  'samgyeopsal':        'pork belly',
  'bingsu':             'shaved ice',
  'bingsoo':            'shaved ice',
  'pajeon':             'pancake',
  'haemul pajeon':      'seafood pancake',
  'dakgalbi':           'spicy chicken',
  'galbi':              'grilled ribs',
  'kalbi':              'grilled ribs',
  'yangnyeom chicken':  'fried chicken',
  'chimaek':            'fried chicken',
  // v26: Thai and Vietnamese.
  'pad kra pao':        'basil chicken',
  'pad krapow':         'basil chicken',
  'kra pao':            'basil chicken',
  'krapow':             'basil chicken',
  'phad kra phao':      'basil chicken',
  'som tam':            'papaya salad',
  'som tum':            'papaya salad',
  'larb':               'meat salad',
  'laab':               'meat salad',
  'moo ping':           'pork skewers',
  'moo kata':           'thai barbecue',
  'mookata':            'thai barbecue',
  'gai yang':           'grilled chicken',
  'banh mi':            'baguette sandwich',
  'goi cuon':           'spring rolls',
  'cha gio':            'fried spring rolls',
  'nem ran':            'fried spring rolls',
  'banh xeo':           'crispy pancake',
  'pad thai':           'thai noodles',
  // v26: Cafes, bakeries and desserts.
  'chicken chop':       'grilled chicken',
  'aglio olio':         'garlic spaghetti',
  'aglio e olio':       'garlic spaghetti',
  'pain au chocolat':   'chocolate croissant',
  'kouign amann':       'pastry',
  'basque cheesecake':  'cheesecake',
  'basque burnt cheesecake': 'cheesecake',
  'eggs ben':           'eggs benedict',
  'eggs benny':         'eggs benedict',
  'acai':               'acai bowl',
  'acai bowl':          'acai bowl',
  'chempedak':          'jackfruit',
  'cempedak':           'jackfruit',
  'ice cream potong':   'ice cream bar',
};

// Local names that mean something else on Pixabay (a place, a Western dish, a word): searched in
// English only.
export const ENGLISH_ONLY = new Set([
  'bandung', 'bandung peng', 'sirap bandung', 'mee bandung', 'abc', 'abc juice', 'economy rice',
  'economic rice', 'zi char', 'milo van', 'fried carrot cake', 'black carrot cake', 'white carrot cake',
  'chicken chop', 'long black', 'babyccino', 'cai fan', 'chap fan', 'cai png', 'chap chye png', 'ckt', 'bcm', 'xlb',
  'bkt', 'pau', 'pao', 'big pau', 'roti boy', 'maggi', 'indomie', 'mala', 'mala xiang guo', 'kue',
  'varuval', 'ulam', 'acar', 'achar', 'lala', 'la la', 'kam heong', 'gong gong', 'stingray', 'saba',
  'inari', 'tamago', 'unagi', 'jjigae', 'kesari',
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
  'edition', 'seasonal', 'item', 'items', 'istimewa', 'spesial', 'biasa', 'jumbo', 'porsi', 'paket',
  'tawar', 'bungkus', 'tapau', 'dabao', 'takeaway', 'serving', 'servings', 'person', 'persons', 'sharing',
]);

// v26: Malay and Indonesian words in English, for names that aren't on LOCAL_DISHES. Two-word
// ones first ("lada hitam"). Malay puts what the dish is first ("ikan bakar": fish, grilled), so
// the words are turned round into English order ("grilled fish").
export const MALAY_WORDS: Record<string, string> = {
  'nasi': 'rice', 'pulut': 'sticky rice', 'mee': 'noodles', 'mi': 'noodles', 'mie': 'noodles',
  'bihun': 'vermicelli', 'roti': 'bread', 'bubur': 'porridge', 'kuih': 'cake', 'kueh': 'cake',
  'kue': 'cake', 'keropok': 'crackers', 'kerupuk': 'crackers', 'ayam': 'chicken', 'itik': 'duck',
  'bebek': 'duck', 'daging': 'beef', 'lembu': 'beef', 'sapi': 'beef', 'kambing': 'mutton',
  'ikan': 'fish', 'udang': 'prawn', 'sotong': 'squid', 'cumi': 'squid', 'ketam': 'crab',
  'kepiting': 'crab', 'kerang': 'cockles', 'siput': 'snails', 'telur': 'egg', 'tauhu': 'tofu',
  'tahu': 'tofu', 'tempe': 'tempeh', 'sayur': 'vegetable', 'sayuran': 'vegetables',
  'siakap': 'sea bass', 'kerapu': 'grouper', 'tenggiri': 'mackerel', 'kembung': 'mackerel',
  'bawal': 'pomfret', 'pari': 'stingray', 'patin': 'catfish', 'keli': 'catfish', 'lele': 'catfish',
  'bilis': 'anchovies', 'teri': 'anchovies', 'kangkung': 'water spinach', 'kangkong': 'water spinach',
  'bayam': 'spinach', 'kacang panjang': 'long beans', 'taugeh': 'bean sprouts', 'tauge': 'bean sprouts',
  'terung': 'eggplant', 'bendi': 'okra', 'kubis': 'cabbage', 'sawi': 'mustard greens', 'labu': 'pumpkin',
  'cendawan': 'mushroom', 'jamur': 'mushroom', 'jagung': 'corn', 'kentang': 'potato', 'ubi': 'sweet potato',
  'keledek': 'sweet potato', 'kacang': 'peanut', 'goreng': 'fried', 'bakar': 'grilled',
  'panggang': 'roasted', 'rebus': 'boiled', 'kukus': 'steamed', 'stim': 'steamed', 'masak': 'cooked',
  'berempah': 'spiced', 'pedas': 'spicy', 'manis': 'sweet', 'masin': 'salty', 'masam': 'sour',
  'asam': 'sour', 'lemak': 'coconut', 'santan': 'coconut milk', 'kari': 'curry', 'kare': 'curry',
  'gulai': 'curry', 'sup': 'soup', 'sop': 'soup', 'soto': 'soup', 'kicap': 'soy sauce',
  'kecap': 'soy sauce', 'tiram': 'oyster', 'lada hitam': 'black pepper', 'lada': 'pepper',
  'halia': 'ginger', 'jahe': 'ginger', 'serai': 'lemongrass', 'kunyit': 'turmeric',
  'belacan': 'shrimp paste', 'cili api': 'chilli', 'cili': 'chilli', 'cabai': 'chilli', 'cabe': 'chilli',
  'bawang putih': 'garlic', 'bawang': 'onion', 'putih': 'white', 'hitam': 'black', 'merah': 'red',
  'hijau': 'green', 'kuning': 'yellow', 'campur': 'mixed', 'susu': 'milk', 'ais': 'iced', 'es': 'iced',
  'panas': 'hot', 'sejuk': 'cold', 'jus': 'juice', 'teh': 'tea', 'kopi': 'coffee', 'buah': 'fruit',
  'oren': 'orange', 'jeruk': 'orange', 'epal': 'apple', 'apel': 'apple', 'tembikai': 'watermelon',
  'semangka': 'watermelon', 'nanas': 'pineapple', 'betik': 'papaya', 'pepaya': 'papaya',
  'mangga': 'mango', 'limau': 'lime', 'lobak': 'carrot', 'wortel': 'carrot', 'kelapa': 'coconut',
  'pisang': 'banana', 'nangka': 'jackfruit',
};
// The words a Malay or Indonesian dish name starts with (what it is).
const MALAY_HEADS = new Set([
  'nasi', 'pulut', 'mee', 'mi', 'mie', 'bihun', 'roti', 'bubur', 'kuih', 'kueh', 'kue', 'keropok',
  'kerupuk', 'ayam', 'itik', 'bebek', 'daging', 'lembu', 'sapi', 'kambing', 'ikan', 'udang', 'sotong',
  'cumi', 'ketam', 'kepiting', 'kerang', 'telur', 'tauhu', 'tahu', 'tempe', 'sayur', 'sup', 'sop',
  'soto', 'kari', 'gulai', 'teh', 'kopi', 'ais', 'es', 'jus', 'pisang', 'jagung', 'kentang', 'kangkung',
]);

// A Malay or Indonesian name in English words ("ikan bakar petai" -> petai grilled fish), or null
// when it isn't one: it starts with what a dish is and two of its words are known.
export function malayEnglish(words: string[]): string[] | null {
  if (words.length < 2 || !MALAY_HEADS.has(words[0])) return null;
  const parts: string[] = [];
  let known = 0;
  for (let i = 0; i < words.length; i++) {
    const pair = MALAY_WORDS[`${words[i]} ${words[i + 1] ?? ''}`];
    if (pair) { parts.push(pair); known += 2; i++; continue; }
    if (MALAY_WORDS[words[i]]) known++;
    parts.push(MALAY_WORDS[words[i]] ?? words[i]);
  }
  return known >= 2 ? parts.reverse().join(' ').split(' ') : null;
}

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

const meaningful = (words: string[]) => words.filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !FILLER_WORDS.has(w));

// What to look for, in order, until something is found. `hint`: Scan Menu's words for the dish.
export function searchPlan(query: string, hint = ''): Attempt[] {
  const plan: Attempt[] = [];
  const add = (words: string, lang: Attempt['lang'], category: Attempt['category']) => {
    const w = words.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS);
    if (w && !plan.some((a) => a.words === w && a.lang === lang && a.category === category)) plan.push({ words: w, lang, category });
  };
  const hinted = meaningful(nameText(String(hint || '').slice(0, MAX_HINT_CHARS)).split(' ')).slice(-4);
  if (hinted.length) {
    add(hinted.slice(-3).join(' '), 'en', 'food');
    add(hinted.slice(-2).join(' '), 'en', 'food');
  }
  const text = nameText(query);
  const local = localDish(text);
  if (local) {
    if (!ENGLISH_ONLY.has(local.name)) add(local.name, 'en', 'food');
    add(local.english, 'en', 'food');
    add(local.english.split(' ').slice(-1).join(' '), 'en', 'food');
  } else {
    const named = text.split(' ').filter(Boolean);
    const words = meaningful(malayEnglish(named) ?? named);
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

// v26: how well a Pixabay photo's tags (and the words in its page's address) match the words: a
// point for each word found, two more when the last word (what the dish is) is, two more when
// all of them are found together. Plurals count as the word ("tacos": taco).
const stem = (w: string) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
export function tagScore(hit: any, words: string): number {
  const query = words.toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w)).map(stem);
  if (!query.length) return 0;
  const tags = String(hit?.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
  const slug = typeof hit?.pageURL === 'string' ? (hit.pageURL.toLowerCase().match(/\/photos\/([a-z0-9-]+?)-\d+\/?$/)?.[1] || '') : '';
  const phrases = [...tags, slug.replace(/-/g, ' ')].map((t) => t.split(/\s+/).filter(Boolean).map(stem).join(' '));
  const found = new Set(phrases.flatMap((t) => t.split(' ')));
  let score = query.filter((w) => found.has(w)).length;
  if (found.has(query[query.length - 1])) score += 2;
  const together = query.join(' ');
  if (query.length > 1 && phrases.some((t) => ` ${t} `.includes(` ${together} `))) score += 2;
  return score;
}

// Photos in order of tagScore, Pixabay's order (popularity) when equal.
export function rankHits(hits: any[], words: string) {
  return hits.map((hit, i) => ({ hit, i, score: tagScore(hit, words) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ hit }) => hit);
}

// v27: Pixabay turned a search away (429): try again in `retryAfter` seconds.
export class PixabayBusy extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`Pixabay API error: 429 (busy for ${retryAfter} s)`);
    this.retryAfter = retryAfter;
  }
}

// Seconds Pixabay asks to wait (Retry-After, else what's left of its minute), or null.
function pixabayWait(res: Response): number | null {
  for (const header of ['retry-after', 'x-ratelimit-reset']) {
    const seconds = Number(res.headers.get(header));
    if (res.headers.has(header) && Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }
  return null;
}

// Up to 30 photos from Pixabay for the words, best matches first (never logs the address: it
// carries the key). Turned away (429) with its minute about to reset: asked once more after it;
// else PixabayBusy.
async function askPixabay(attempt: Attempt, again = false): Promise<any[]> {
  const key = pixabayKey();
  if (!key) throw new Error('Pixabay key missing: set the PIXABAY_API_KEY secret');
  const params = new URLSearchParams({ key, q: attempt.words, lang: attempt.lang, image_type: 'photo', safesearch: 'true', per_page: String(PIXABAY_PER_ASK), page: '1' });
  if (attempt.category === 'food') params.set('category', 'food');
  const res = await fetch(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(10000) });
  console.log(`findProductImage v27: Pixabay ${res.status} for "${attempt.words}" (${attempt.lang}, ${attempt.category}), rate limit ${res.headers.get('x-ratelimit-limit')}/min, ${res.headers.get('x-ratelimit-remaining')} left`);
  if (res.status === 429) {
    await res.body?.cancel();
    const wait = pixabayWait(res);
    if (!again && wait != null && wait <= SEARCH_WAIT_MAX_S) {
      await timing.sleep(wait * 1000 + 250);
      return askPixabay(attempt, true);
    }
    throw new PixabayBusy(wait ?? BUSY_RETRY_S);
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => '');
    if (/out of valid range/i.test(text)) return [];
    throw new Error(`Pixabay API error: 400 ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`Pixabay API error: ${res.status}`);
  const data = await res.json();
  const hits = (Array.isArray(data?.hits) ? data.hits : [])
    .filter((hit: any) => hit?.id && typeof hit?.webformatURL === 'string' && PIXABAY_IMAGE.test(hit.webformatURL));
  return rankHits(hits, attempt.words).map((hit: any) => toPhoto(hit, attempt.words));
}

// The photos for one attempt (all 6 sets, best first): from the day's searches when it was asked
// for in the last 24 hours (Pixabay's rule), else from Pixabay (while this search has asks left;
// null when not looked for) and kept for the next day. The store of searches failing never stops
// a search; now and then, searches over a day old are cleared out.
async function findPhotos(admin: any, attempt: Attempt, asked: { count: number }) {
  const cacheKey = `pixabay|${attempt.lang}|${attempt.category}|${attempt.words.toLowerCase()}`;
  try {
    const { data: hit, error } = await admin.from('photo_search_cache').select('photos, fetched_at').eq('key', cacheKey).maybeSingle();
    if (error) throw error;
    if (hit && Date.now() - Date.parse(hit.fetched_at) < DAY_MS && Array.isArray(hit.photos)) return hit.photos;
  } catch (e) {
    console.warn('findProductImage v27: searches store not read:', (e as Error).message);
  }
  if (asked.count >= MAX_ASKS) return null;
  asked.count++;
  const photos = await askPixabay(attempt);
  try {
    const { error } = await admin.from('photo_search_cache').upsert({ key: cacheKey, photos, fetched_at: new Date().toISOString() });
    if (error) throw error;
    if (Math.random() < 0.05) {
      await admin.from('photo_search_cache').delete().lt('fetched_at', new Date(Date.now() - DAY_MS).toISOString());
    }
  } catch (e) {
    console.warn('findProductImage v27: search not stored:', (e as Error).message);
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

  // v27: two at a time, a moment apart; a 429 holds every fetch of this call (notBefore).
  const started = timing.now();
  let notBefore = 0;
  const keepOne = async ({ id, url }: { id: string; url: string }): Promise<{ from: string; url: string } | 'busy' | null> => {
    for (let tries = 0; tries < KEEP_TRIES; tries++) {
      const wait = notBefore - timing.now();
      if (wait > 0) await timing.sleep(wait);
      if (timing.now() - started > KEEP_DEADLINE_MS) break;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.status === 429) {
          await res.body?.cancel();
          const ms = Math.min((pixabayWait(res) ?? 2 ** tries) * 1000, MAX_WAIT_MS);
          notBefore = Math.max(notBefore, timing.now() + ms);
          console.warn(`findProductImage v27: ${id} turned away (429), fetching again in ${ms} ms`);
          continue;
        }
        if (!res.ok) { await res.body?.cancel(); console.warn(`findProductImage v27: ${id} not fetched (${res.status})`); return null; }
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!/^image\/(jpeg|png|webp)$/.test(type)) { await res.body?.cancel(); console.warn(`findProductImage v27: ${id} is not a photo (${type})`); return null; }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) { console.warn(`findProductImage v27: ${id} size ${bytes.length}`); return null; }
        const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${storeId}/products/${id}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
        const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, cacheControl: LONG_CACHE, upsert: false });
        if (error) { console.warn(`findProductImage v27: ${id} not saved:`, error.message); return null; }
        return { from: url, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
      } catch (e) {
        console.warn(`findProductImage v27: ${id} not kept:`, (e as Error).message);
        return null;
      }
    }
    console.warn(`findProductImage v27: ${id} still turned away`);
    return 'busy';
  };
  const results: ({ from: string; url: string } | 'busy' | null)[] = new Array(photos.length).fill(null);
  let next = 0;
  const worker = async (lane: number) => {
    if (lane) await timing.sleep(KEEP_GAP_MS * lane);
    while (next < photos.length) {
      const index = next++;
      results[index] = await keepOne(photos[index]);
      if (next < photos.length) await timing.sleep(KEEP_GAP_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(KEEP_AT_A_TIME, photos.length) }, (_, lane) => worker(lane)));
  const copies = results.filter((r): r is { from: string; url: string } => !!r && r !== 'busy');
  const busy = photos.filter((_: unknown, i: number) => results[i] === 'busy').map((p: { url: string }) => p.url);
  console.log(`findProductImage v27: kept ${copies.length} of ${photos.length} photos for store ${storeId}${busy.length ? `, ${busy.length} turned away` : ''}`);
  // retryAfter: seconds before the app sends the busy ones again (what's left of the last wait).
  return json(busy.length ? { kept: copies, busy, retryAfter: Math.max(1, Math.ceil((notBefore - timing.now()) / 1000)) } : { kept: copies, busy });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Gives back the monthly photo search this call used (set once it is used).
  let giveBackSearch: (() => Promise<void>) | null = null;
  try {
    const body = await req.json();
    if (body?.action === 'keep') return await keepPhotos(req, body);
    if (body?.action) return json({ error: 'Unknown action.' }, 400);
    const { query, page: rawPage, tenantId: rawTenantId, hint: rawHint } = body;
    const hint = typeof rawHint === 'string' ? rawHint.slice(0, MAX_HINT_CHARS) : '';
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
    const plan = searchPlan(String(query), hint);
    const asked = { count: 0 };
    const lists = new Map<Attempt, any[] | null>();
    let found: { attempt: Attempt; photos: any[]; page: number } | null = null;
    for (const set of page === 1 ? [1] : [page, 1]) {
      for (const attempt of plan) {
        if (!lists.has(attempt)) lists.set(attempt, await findPhotos(admin, attempt, asked));
        const photos = (lists.get(attempt) || []).slice((set - 1) * PER_PAGE, set * PER_PAGE);
        if (photos.length) { found = { attempt, photos, page: set }; break; }
      }
      if (found) break;
    }
    const named = hint ? `"${query}" (${hint})` : `"${query}"`;
    if (!found) {
      console.log(`findProductImage v27: ${named}: nothing found (${plan.map((a) => `${a.words} [${a.lang}, ${a.category}]`).join(' > ') || 'no words'}; asked Pixabay ${asked.count})`);
      return json({ error: 'No images found for this keyword' }, 404);
    }
    console.log(`findProductImage v27: ${named} -> "${found.attempt.words}" (${found.attempt.lang}, ${found.attempt.category}) set ${found.page}: ${found.photos.length} photos (asked Pixabay ${asked.count})`);
    return json({ photos: found.photos, keyword: found.attempt.words, page: found.page });
  } catch (error) {
    console.error('findProductImage v27 error:', error);
    if (giveBackSearch) {
      try {
        await giveBackSearch();
      } catch (refundError) {
        console.error('findProductImage: could not give the search back:', (refundError as Error).message);
      }
    }
    // v27: Pixabay busy (Sellio's 100 a minute): the app waits retryAfter seconds.
    if (error instanceof PixabayBusy) {
      return json({ error: 'Pixabay is busy. Please try again in a minute.', code: 'busy', retryAfter: error.retryAfter }, 429);
    }
    return json({ error: (error as Error).message }, 500);
  }
});
