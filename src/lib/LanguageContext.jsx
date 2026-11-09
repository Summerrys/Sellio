import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// ── Static UI dictionary — instant, zero backend calls ──────────────────────
// Covers fixed app chrome only. Merchant-entered content (product names,
// descriptions, categories) is translated dynamically via useTranslatedText/s.
const DICTIONARY = {
  en: {
    // Storefront header / general
    poweredBy: 'Powered by',
    menu: 'Menu',
    all: 'All',
    todaysPicks: "Today's Picks",
    specialDeals: 'Special Deals',
    other: 'Other',
    search: 'Search',
    loading: 'Loading…',
    // Business hours / closed state
    closedNow: "We're closed right now",
    opensAt: 'Opens at',
    viewHours: 'View hours',
    orderingUnavailable: 'Ordering is unavailable while we\u2019re closed',
    storeUnavailable: 'Store unavailable',
    storeUnavailableDesc: 'This store isn\u2019t taking orders right now. Please check back later.',
    storeUnavailableAskStaff: 'Please place your order with our staff.',
    // Product cards / modal
    addToOrder: 'Add to order',
    outOfStock: 'Out of stock',
    soldOut: 'Sold out',
    unlimited: 'Unlimited',
    inStock: 'in stock',
    size: 'Size',
    selectOption: 'Please select an option',
    required: 'Required',
    // A home seller's item: Like, Chat, Add to cart, Buy now
    like: 'Like',
    liked: 'Liked',
    likeItem: 'Like this item',
    unlikeItem: 'Unlike this item',
    likesOne: '1 like',
    likesMany: '{n} likes',
    chat: 'Chat',
    chatSeller: 'Chat with the seller',
    addToCart: 'Add to cart',
    buyNow: 'Buy now',
    chooseNamed: 'Choose {name}',
    logInToLike: 'Log in to like items.',
    likedFound: 'Liked. Find it in Me › My likes.',
    ownShopNote: 'This is your shop, as buyers see it. You can’t buy from it.',
    ownShopNoBuy: 'You can’t buy from your own shop.',
    // Cart
    yourOrder: 'Your order',
    cart: 'Cart',
    emptyCart: 'Your cart is empty',
    total: 'Total',
    subtotal: 'Subtotal',
    tax: 'Tax',
    proceedToCheckout: 'Proceed to checkout',
    remove: 'Remove',
    // Checkout
    checkout: 'Checkout',
    orderNotes: 'Order notes (optional)',
    orderNotesPlaceholder: 'Any special requests?',
    yourName: 'Your name',
    yourNamePlaceholder: 'Enter your name',
    placingOrder: 'Placing order…',
    placeOrder: 'Place order',
    table: 'Table',
    // Order success
    orderPlaced: 'Order placed!',
    yourOrderSummary: 'Your Order',
    payAtCounter: 'Pay at the counter',
    payAtCounterDesc: 'Please proceed to the counter with your order number. Our staff will assist you with payment.',
    payViaQr: 'Pay via QR Code',
    longPressToScan: 'Long press to save & scan',
    reference: 'Reference',
    copied: 'Copied',
    copy: 'Copy',
    howToPay: 'How to pay',
    payStep1: 'Open your banking app (DBS PayLah, OCBC, UOB etc.)',
    payStep2: 'Long press the QR code above \u2192 Save image \u2192 Scan from photo',
    payStep3: 'Enter the amount and confirm your payment',
    backToMenu: 'Back to menu',
    thankYou: 'Thank you for your visit!',
    // Menu Assistant
    askMeAnything: 'Ask me anything',
    menuAssistantPlaceholder: 'Ask about our menu…',
    // Misc
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    back: 'Back',
    // An order that didn't go through (components/storefront/CheckoutProblem.jsx)
    orderNotSent: 'Your order wasn’t sent',
    orderOffline: 'Your phone is offline, so the order didn’t reach {shop}.',
    nothingSentNotPaid: 'Nothing was sent, and you haven’t paid.',
    orderFailed: 'Sellio couldn’t take your order just now. That’s on our side, not yours.',
    orderStorage: 'This browser stopped Sellio from keeping track of the order, so it wasn’t sent. Private browsing can do this: try a normal browser window.',
    orderUnconfirmed: 'We couldn’t confirm your order',
    orderUnconfirmedText: 'The connection dropped while it was sending, so it may or may not have reached {shop}. Tap Try again: if it got there, you’ll see it, and nothing is ordered twice.',
    orderEarlier: 'Your last order wasn’t confirmed',
    orderEarlierText: 'It may already have reached {shop}. If you’re not sure, check with them first, then send this order.',
    waitingForInternet: 'Waiting for the internet…',
    backOnline: 'You’re back online. You can send it now.',
    tryAgain: 'Try again',
    showOrderToStaff: 'Show my order to staff',
    changeMyOrder: 'Change my order',
    sendThisOrder: 'Send this order',
    myOrder: 'My order',
    takeaway: 'Takeaway',
    forStaffNotSent: 'This order hasn’t been sent. Please take it for me.',
    forStaffMaybeSent: 'This order may already have reached you. Please check before taking it.',
    loadingPhotos: 'Loading photos',
    photosCount: '{done} of {total}',
    showMenuWithoutPhotos: 'Show menu without photos',
    menuWithoutPhotos: 'Showing the menu without photos.',
    showPhotos: 'Show photos',
  },
  zh: {
    poweredBy: '技术支持',
    menu: '菜单',
    all: '全部',
    todaysPicks: '今日推荐',
    specialDeals: '特惠优惠',
    other: '其他',
    search: '搜索',
    loading: '加载中…',
    closedNow: '我们目前已打烊',
    opensAt: '营业时间',
    viewHours: '查看营业时间',
    orderingUnavailable: '打烊期间无法下单',
    storeUnavailable: '店铺暂不可用',
    storeUnavailableDesc: '本店目前暂不接受订单，请稍后再来。',
    storeUnavailableAskStaff: '请向店员下单。',
    addToOrder: '加入订单',
    outOfStock: '缺货',
    soldOut: '已售罄',
    unlimited: '不限量',
    inStock: '件有货',
    size: '规格',
    selectOption: '请选择一个选项',
    required: '必选',
    like: '喜欢',
    liked: '已喜欢',
    likeItem: '喜欢这件商品',
    unlikeItem: '取消喜欢',
    likesOne: '1 人喜欢',
    likesMany: '{n} 人喜欢',
    chat: '聊天',
    chatSeller: '与卖家聊天',
    addToCart: '加入购物车',
    buyNow: '立即购买',
    chooseNamed: '请选择{name}',
    logInToLike: '登录后即可喜欢商品。',
    likedFound: '已喜欢。可在 Me › My likes 查看。',
    ownShopNote: '这是您的店铺，也就是买家看到的样子。您不能在这里购买。',
    ownShopNoBuy: '您不能购买自己店铺的商品。',
    yourOrder: '您的订单',
    cart: '购物车',
    emptyCart: '购物车是空的',
    total: '总计',
    subtotal: '小计',
    tax: '税费',
    proceedToCheckout: '前往结账',
    remove: '移除',
    checkout: '结账',
    orderNotes: '订单备注（可选）',
    orderNotesPlaceholder: '有什么特别要求吗？',
    yourName: '您的姓名',
    yourNamePlaceholder: '请输入您的姓名',
    placingOrder: '正在下单…',
    placeOrder: '下单',
    table: '桌号',
    orderPlaced: '订单已提交！',
    yourOrderSummary: '您的订单',
    payAtCounter: '请到柜台付款',
    payAtCounterDesc: '请携带您的订单号前往柜台，我们的工作人员将协助您付款。',
    payViaQr: '扫码支付',
    longPressToScan: '长按保存并扫描',
    reference: '参考编号',
    copied: '已复制',
    copy: '复制',
    howToPay: '支付方式',
    payStep1: '打开您的银行应用程序（DBS PayLah、OCBC、UOB 等）',
    payStep2: '长按上方二维码 → 保存图片 → 从相册扫描',
    payStep3: '输入金额并确认付款',
    backToMenu: '返回菜单',
    thankYou: '感谢您的光临！',
    askMeAnything: '有问题尽管问我',
    menuAssistantPlaceholder: '询问我们的菜单…',
    close: '关闭',
    cancel: '取消',
    confirm: '确认',
    back: '返回',
    orderNotSent: '您的订单没有发出',
    orderOffline: '您的手机没有网络，订单没有送到{shop}。',
    nothingSentNotPaid: '订单没有发出，您也没有付款。',
    orderFailed: 'Sellio 暂时无法接收您的订单。这是我们这边的问题，不是您的问题。',
    orderStorage: '这个浏览器不让 Sellio 记录这张订单，所以订单没有发出。无痕浏览可能会这样：请换用普通的浏览器窗口。',
    orderUnconfirmed: '无法确认您的订单',
    orderUnconfirmedText: '发送时网络断了，订单可能已经送到{shop}，也可能没有。请点“重试”：如果已经送到，您会看到这张订单，不会重复下单。',
    orderEarlier: '您上一张订单没有得到确认',
    orderEarlierText: '那张订单可能已经送到{shop}。如果不确定，请先向他们确认，再发送这张订单。',
    waitingForInternet: '正在等待网络…',
    backOnline: '网络已恢复，现在可以发送了。',
    tryAgain: '重试',
    showOrderToStaff: '给店员看我的订单',
    changeMyOrder: '修改我的订单',
    sendThisOrder: '发送这张订单',
    myOrder: '我的订单',
    takeaway: '外带',
    forStaffNotSent: '这张订单还没有发出，请帮我下单。',
    forStaffMaybeSent: '这张订单可能已经送到您那里，请先确认再下单。',
    loadingPhotos: '正在加载图片',
    photosCount: '{done}/{total}',
    showMenuWithoutPhotos: '显示无图菜单',
    menuWithoutPhotos: '正在显示无图菜单。',
    showPhotos: '显示图片',
  },
  ms: {
    poweredBy: 'Dikuasakan oleh',
    menu: 'Menu',
    all: 'Semua',
    todaysPicks: 'Pilihan Hari Ini',
    specialDeals: 'Tawaran Istimewa',
    other: 'Lain-lain',
    search: 'Cari',
    loading: 'Memuatkan…',
    closedNow: 'Kami sedang tutup buat masa ini',
    opensAt: 'Dibuka pada',
    viewHours: 'Lihat waktu operasi',
    orderingUnavailable: 'Pesanan tidak tersedia semasa kedai tutup',
    storeUnavailable: 'Kedai tidak tersedia',
    storeUnavailableDesc: 'Kedai ini tidak menerima pesanan buat masa ini. Sila cuba lagi kemudian.',
    storeUnavailableAskStaff: 'Sila buat pesanan dengan kakitangan kami.',
    addToOrder: 'Tambah ke pesanan',
    outOfStock: 'Kehabisan stok',
    soldOut: 'Habis dijual',
    unlimited: 'Tanpa had',
    inStock: 'lagi',
    size: 'Saiz',
    selectOption: 'Sila pilih satu pilihan',
    required: 'Wajib',
    like: 'Suka',
    liked: 'Disukai',
    likeItem: 'Suka item ini',
    unlikeItem: 'Batal suka',
    likesOne: '1 suka',
    likesMany: '{n} suka',
    chat: 'Sembang',
    chatSeller: 'Sembang dengan penjual',
    addToCart: 'Tambah ke troli',
    buyNow: 'Beli sekarang',
    chooseNamed: 'Pilih {name}',
    logInToLike: 'Log masuk untuk suka item.',
    likedFound: 'Disukai. Lihat di Me › My likes.',
    ownShopNote: 'Ini kedai anda, seperti yang dilihat pembeli. Anda tidak boleh membeli daripadanya.',
    ownShopNoBuy: 'Anda tidak boleh membeli dari kedai anda sendiri.',
    yourOrder: 'Pesanan Anda',
    cart: 'Troli',
    emptyCart: 'Troli anda kosong',
    total: 'Jumlah',
    subtotal: 'Jumlah kecil',
    tax: 'Cukai',
    proceedToCheckout: 'Teruskan ke pembayaran',
    remove: 'Buang',
    checkout: 'Pembayaran',
    orderNotes: 'Nota pesanan (pilihan)',
    orderNotesPlaceholder: 'Ada permintaan khas?',
    yourName: 'Nama anda',
    yourNamePlaceholder: 'Masukkan nama anda',
    placingOrder: 'Menghantar pesanan…',
    placeOrder: 'Hantar pesanan',
    table: 'Meja',
    orderPlaced: 'Pesanan berjaya dihantar!',
    yourOrderSummary: 'Pesanan Anda',
    payAtCounter: 'Bayar di kaunter',
    payAtCounterDesc: 'Sila ke kaunter dengan nombor pesanan anda. Kakitangan kami akan membantu anda membuat pembayaran.',
    payViaQr: 'Bayar melalui Kod QR',
    longPressToScan: 'Tekan lama untuk simpan & imbas',
    reference: 'Rujukan',
    copied: 'Disalin',
    copy: 'Salin',
    howToPay: 'Cara membayar',
    payStep1: 'Buka aplikasi perbankan anda (DBS PayLah, OCBC, UOB dll.)',
    payStep2: 'Tekan lama kod QR di atas \u2192 Simpan imej \u2192 Imbas dari foto',
    payStep3: 'Masukkan jumlah dan sahkan pembayaran anda',
    backToMenu: 'Kembali ke menu',
    thankYou: 'Terima kasih atas kunjungan anda!',
    askMeAnything: 'Tanya saya apa-apa',
    menuAssistantPlaceholder: 'Tanya tentang menu kami…',
    close: 'Tutup',
    cancel: 'Batal',
    confirm: 'Sahkan',
    back: 'Kembali',
    orderNotSent: 'Pesanan anda tidak dihantar',
    orderOffline: 'Telefon anda tiada sambungan internet, jadi pesanan tidak sampai ke {shop}.',
    nothingSentNotPaid: 'Tiada apa-apa dihantar, dan anda belum membayar.',
    orderFailed: 'Sellio tidak dapat menerima pesanan anda buat masa ini. Masalah ini di pihak kami, bukan anda.',
    orderStorage: 'Pelayar ini menghalang Sellio daripada merekod pesanan, jadi pesanan tidak dihantar. Mod peribadi boleh menyebabkan ini: cuba tetingkap pelayar biasa.',
    orderUnconfirmed: 'Kami tidak dapat mengesahkan pesanan anda',
    orderUnconfirmedText: 'Sambungan terputus semasa pesanan dihantar, jadi pesanan mungkin sudah atau belum sampai ke {shop}. Tekan Cuba lagi: jika sudah sampai, anda akan melihatnya, dan pesanan tidak akan dibuat dua kali.',
    orderEarlier: 'Pesanan anda yang terakhir tidak disahkan',
    orderEarlierText: 'Pesanan itu mungkin sudah sampai ke {shop}. Jika tidak pasti, semak dengan mereka dahulu, kemudian hantar pesanan ini.',
    waitingForInternet: 'Menunggu sambungan internet…',
    backOnline: 'Anda kembali dalam talian. Anda boleh menghantarnya sekarang.',
    tryAgain: 'Cuba lagi',
    showOrderToStaff: 'Tunjuk pesanan saya kepada kakitangan',
    changeMyOrder: 'Ubah pesanan saya',
    sendThisOrder: 'Hantar pesanan ini',
    myOrder: 'Pesanan saya',
    takeaway: 'Bungkus',
    forStaffNotSent: 'Pesanan ini belum dihantar. Sila ambil pesanan saya.',
    forStaffMaybeSent: 'Pesanan ini mungkin sudah sampai kepada anda. Sila semak dahulu sebelum mengambilnya.',
    loadingPhotos: 'Memuatkan foto',
    photosCount: '{done} daripada {total}',
    showMenuWithoutPhotos: 'Tunjuk menu tanpa foto',
    menuWithoutPhotos: 'Menu ditunjukkan tanpa foto.',
    showPhotos: 'Tunjuk foto',
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh', label: '中文', name: 'Chinese' },
  { code: 'ms', label: 'BM', name: 'Bahasa Melayu' },
];

const LanguageContext = createContext(null);

const STORAGE_KEY = 'sellio_storefront_lang';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'en'; } catch { return 'en'; }
  });

  const setLang = useCallback((code) => {
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }, []);

  const t = useCallback((key) => {
    return DICTIONARY[lang]?.[key] ?? DICTIONARY.en[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

// ── Dynamic content translation (merchant-entered text) ─────────────────────
// In-memory cache shared across the whole session so re-renders and repeated
// products/categories don't re-request the same string twice client-side.
// The edge function itself also caches server-side (translations table) so
// even a fresh page load for a different customer is instant after the first.
const memoryCache = { zh: {}, ms: {} };

async function fetchTranslations(texts, language) {
  const uncached = texts.filter(t => t && !memoryCache[language]?.[t]);
  if (uncached.length === 0) return;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.functions.invoke('translateContent', {
      body: { texts: uncached, language },
    });
    if (error || !data?.translations) return;
    memoryCache[language] = { ...memoryCache[language], ...data.translations };
  } catch {}
}

/**
 * Translates a single piece of merchant content (product name, description, etc.)
 * Returns the original text immediately, then swaps to the translated version
 * once available (near-instant if cached, ~1-2s on first-ever translation).
 */
export function useTranslatedText(text) {
  const { lang } = useLanguage();
  const [translated, setTranslated] = useState(text);

  useEffect(() => {
    if (!text || lang === 'en') { setTranslated(text); return; }
    const cached = memoryCache[lang]?.[text];
    if (cached) { setTranslated(cached); return; }
    setTranslated(text); // show original while translating
    let cancelled = false;
    fetchTranslations([text], lang).then(() => {
      if (!cancelled) setTranslated(memoryCache[lang]?.[text] || text);
    });
    return () => { cancelled = true; };
  }, [text, lang]);

  return translated;
}

/**
 * Batch version — translates an array of strings in ONE request (e.g. all
 * product names on a menu page) instead of one request per item.
 * Returns a map { originalText: translatedText }.
 */
export function useTranslatedTexts(texts) {
  const { lang } = useLanguage();
  const [map, setMap] = useState({});
  const key = (texts || []).join('|');

  useEffect(() => {
    if (!texts || texts.length === 0 || lang === 'en') { setMap({}); return; }
    let cancelled = false;
    fetchTranslations(texts, lang).then(() => {
      if (cancelled) return;
      const next = {};
      texts.forEach(t => { if (t) next[t] = memoryCache[lang]?.[t] || t; });
      setMap(next);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  return lang === 'en' ? {} : map;
}

/**
 * Fire-and-forget background pre-warm. Call this once as soon as storefront
 * content (products/categories) loads, regardless of the customer's current
 * language. By the time they actually tap the toggle, translations for the
 * *other* languages are usually already cached — so the toggle feels instant.
 * Safe to call repeatedly; fetchTranslations already skips anything cached.
 */
export function prewarmTranslations(texts) {
  const clean = (texts || []).filter(Boolean);
  if (clean.length === 0) return;
  fetchTranslations(clean, 'zh');
  fetchTranslations(clean, 'ms');
}
