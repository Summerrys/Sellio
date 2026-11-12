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
    payStep1: 'Open your banking or e-wallet app',
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
    searchMenu: 'Search the menu…',
    searchResults: '{count} results for “{query}”',
    searchResultOne: '1 result for “{query}”',
    noMenuMatch: 'Nothing on the menu matches “{query}”',
    didYouMean: 'Did you mean {suggestion}?',
    searchFor: 'Search “{query}”',
    showWholeMenu: 'Show the whole menu',
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
    payStep1: '打开您的银行或电子钱包应用程序',
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
    searchMenu: '搜索菜单…',
    searchResults: '“{query}”：{count} 个结果',
    searchResultOne: '“{query}”：1 个结果',
    noMenuMatch: '菜单上没有与“{query}”相符的项目',
    didYouMean: '您是不是要找{suggestion}？',
    searchFor: '搜索“{query}”',
    showWholeMenu: '显示全部菜单',
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
    payStep1: 'Buka aplikasi perbankan atau e-dompet anda',
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
    searchMenu: 'Cari menu…',
    searchResults: '{count} hasil untuk “{query}”',
    searchResultOne: '1 hasil untuk “{query}”',
    noMenuMatch: 'Tiada apa-apa dalam menu yang sepadan dengan “{query}”',
    didYouMean: 'Adakah anda maksudkan {suggestion}?',
    searchFor: 'Cari “{query}”',
    showWholeMenu: 'Tunjuk semua menu',
  },
  // Bahasa Indonesia (12 Nov 2026), for Indonesian shops' buyers. Not the Malay above:
  // Indonesians write Didukung oleh, ponsel, Keranjang. To be checked by a native speaker.
  id: {
    poweredBy: 'Didukung oleh',
    menu: 'Menu',
    all: 'Semua',
    todaysPicks: 'Pilihan Hari Ini',
    specialDeals: 'Promo Spesial',
    other: 'Lainnya',
    search: 'Cari',
    loading: 'Memuat…',
    closedNow: 'Kami sedang tutup',
    opensAt: 'Buka pukul',
    viewHours: 'Lihat jam buka',
    orderingUnavailable: 'Pemesanan tidak tersedia selama kami tutup',
    storeUnavailable: 'Toko tidak tersedia',
    storeUnavailableDesc: 'Toko ini sedang tidak menerima pesanan. Silakan coba lagi nanti.',
    storeUnavailableAskStaff: 'Silakan pesan langsung ke staf kami.',
    addToOrder: 'Tambah ke pesanan',
    outOfStock: 'Stok habis',
    soldOut: 'Terjual habis',
    unlimited: 'Tanpa batas',
    inStock: 'tersisa',
    size: 'Ukuran',
    selectOption: 'Silakan pilih salah satu',
    required: 'Wajib',
    like: 'Suka',
    liked: 'Disukai',
    likeItem: 'Sukai item ini',
    unlikeItem: 'Batal suka',
    likesOne: '1 suka',
    likesMany: '{n} suka',
    chat: 'Chat',
    chatSeller: 'Chat dengan penjual',
    addToCart: 'Tambah ke keranjang',
    buyNow: 'Beli sekarang',
    chooseNamed: 'Pilih {name}',
    logInToLike: 'Masuk untuk menyukai item.',
    likedFound: 'Disukai. Lihat di Me › My likes.',
    ownShopNote: 'Ini toko Anda, seperti yang dilihat pembeli. Anda tidak bisa membeli dari toko sendiri.',
    ownShopNoBuy: 'Anda tidak bisa membeli dari toko sendiri.',
    yourOrder: 'Pesanan Anda',
    cart: 'Keranjang',
    emptyCart: 'Keranjang Anda kosong',
    total: 'Total',
    subtotal: 'Subtotal',
    tax: 'Pajak',
    proceedToCheckout: 'Lanjut ke checkout',
    remove: 'Hapus',
    checkout: 'Checkout',
    orderNotes: 'Catatan pesanan (opsional)',
    orderNotesPlaceholder: 'Ada permintaan khusus?',
    yourName: 'Nama Anda',
    yourNamePlaceholder: 'Masukkan nama Anda',
    placingOrder: 'Mengirim pesanan…',
    placeOrder: 'Pesan sekarang',
    table: 'Meja',
    orderPlaced: 'Pesanan berhasil dibuat!',
    yourOrderSummary: 'Pesanan Anda',
    payAtCounter: 'Bayar di kasir',
    payAtCounterDesc: 'Silakan ke kasir dengan nomor pesanan Anda. Staf kami akan membantu pembayaran Anda.',
    payViaQr: 'Bayar dengan kode QR',
    longPressToScan: 'Tekan lama untuk simpan & pindai',
    reference: 'Referensi',
    copied: 'Tersalin',
    copy: 'Salin',
    howToPay: 'Cara membayar',
    payStep1: 'Buka aplikasi bank atau e-wallet Anda',
    payStep2: 'Tekan lama kode QR di atas → Simpan gambar → Pindai dari galeri',
    payStep3: 'Masukkan jumlah dan konfirmasi pembayaran Anda',
    backToMenu: 'Kembali ke menu',
    thankYou: 'Terima kasih atas kunjungan Anda!',
    askMeAnything: 'Tanya apa saja',
    menuAssistantPlaceholder: 'Tanya tentang menu kami…',
    close: 'Tutup',
    cancel: 'Batal',
    confirm: 'Konfirmasi',
    back: 'Kembali',
    orderNotSent: 'Pesanan Anda belum terkirim',
    orderOffline: 'Ponsel Anda sedang offline, jadi pesanan tidak sampai ke {shop}.',
    nothingSentNotPaid: 'Tidak ada yang terkirim, dan Anda belum membayar.',
    orderFailed: 'Sellio belum bisa menerima pesanan Anda saat ini. Masalahnya ada di pihak kami, bukan Anda.',
    orderStorage: 'Browser ini menghalangi Sellio mencatat pesanan, jadi pesanan tidak terkirim. Mode penyamaran bisa menyebabkan ini: coba jendela browser biasa.',
    orderUnconfirmed: 'Kami tidak bisa memastikan pesanan Anda',
    orderUnconfirmedText: 'Koneksi terputus saat pesanan dikirim, jadi pesanan mungkin sudah atau belum sampai ke {shop}. Ketuk Coba lagi: jika sudah sampai, Anda akan melihatnya, dan pesanan tidak dibuat dua kali.',
    orderEarlier: 'Pesanan terakhir Anda belum terkonfirmasi',
    orderEarlierText: 'Pesanan itu mungkin sudah sampai ke {shop}. Jika ragu, tanyakan dulu ke mereka, lalu kirim pesanan ini.',
    waitingForInternet: 'Menunggu koneksi internet…',
    backOnline: 'Anda sudah online lagi. Anda bisa mengirimnya sekarang.',
    tryAgain: 'Coba lagi',
    showOrderToStaff: 'Tunjukkan pesanan saya ke staf',
    changeMyOrder: 'Ubah pesanan saya',
    sendThisOrder: 'Kirim pesanan ini',
    myOrder: 'Pesanan saya',
    takeaway: 'Bawa pulang',
    forStaffNotSent: 'Pesanan ini belum terkirim. Tolong catat pesanan saya.',
    forStaffMaybeSent: 'Pesanan ini mungkin sudah masuk ke Anda. Mohon periksa dulu sebelum mencatatnya.',
    loadingPhotos: 'Memuat foto',
    photosCount: '{done} dari {total}',
    showMenuWithoutPhotos: 'Tampilkan menu tanpa foto',
    menuWithoutPhotos: 'Menu ditampilkan tanpa foto.',
    showPhotos: 'Tampilkan foto',
    searchMenu: 'Cari di menu…',
    searchResults: '{count} hasil untuk “{query}”',
    searchResultOne: '1 hasil untuk “{query}”',
    noMenuMatch: 'Tidak ada menu yang cocok dengan “{query}”',
    didYouMean: 'Maksud Anda {suggestion}?',
    searchFor: 'Cari “{query}”',
    showWholeMenu: 'Tampilkan semua menu',
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh', label: '中文', name: 'Chinese' },
  { code: 'ms', label: 'BM', name: 'Bahasa Melayu' },
  { code: 'id', label: 'ID', name: 'Bahasa Indonesia' },
];

const LanguageContext = createContext(null);

const STORAGE_KEY = 'sellio_storefront_lang';

// The language a visitor chose before, if they did.
function storedLanguage() {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.some((l) => l.code === code) ? code : null;
  } catch {
    return null;
  }
}

// contentLang: the language the shop writes its menu in; its own text isn't translated into it.
// An Indonesian shop's page opens in Bahasa Indonesia for a first visit and its menu is taken
// as Indonesian (preferLanguage / setContentLang from the store page); a visitor's own choice
// still wins.
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => storedLanguage() || 'en');
  const [contentLang, setContentLang] = useState('en');

  const setLang = useCallback((code) => {
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }, []);

  // The shop's own language for a visitor who hasn't chosen one (not remembered as theirs).
  const preferLanguage = useCallback((code) => {
    if (!storedLanguage() && DICTIONARY[code]) setLangState(code);
  }, []);

  const t = useCallback((key) => {
    return DICTIONARY[lang]?.[key] ?? DICTIONARY.en[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, preferLanguage, contentLang, setContentLang }}>
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
const memoryCache = { zh: {}, ms: {}, id: {}, en: {} };

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
  const { lang, contentLang } = useLanguage();
  const [translated, setTranslated] = useState(text);

  useEffect(() => {
    if (!text || lang === contentLang) { setTranslated(text); return; }
    const cached = memoryCache[lang]?.[text];
    if (cached) { setTranslated(cached); return; }
    setTranslated(text); // show original while translating
    let cancelled = false;
    fetchTranslations([text], lang).then(() => {
      if (!cancelled) setTranslated(memoryCache[lang]?.[text] || text);
    });
    return () => { cancelled = true; };
  }, [text, lang, contentLang]);

  return translated;
}

/**
 * Batch version — translates an array of strings in ONE request (e.g. all
 * product names on a menu page) instead of one request per item.
 * Returns a map { originalText: translatedText }.
 */
export function useTranslatedTexts(texts) {
  const { lang, contentLang } = useLanguage();
  const [map, setMap] = useState({});
  const key = (texts || []).join('|');

  useEffect(() => {
    if (!texts || texts.length === 0 || lang === contentLang) { setMap({}); return; }
    let cancelled = false;
    fetchTranslations(texts, lang).then(() => {
      if (cancelled) return;
      const next = {};
      texts.forEach(t => { if (t) next[t] = memoryCache[lang]?.[t] || t; });
      setMap(next);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang, contentLang]);

  return lang === contentLang ? {} : map;
}

/**
 * Fire-and-forget background pre-warm. Call this once as soon as storefront
 * content (products/categories) loads, regardless of the customer's current
 * language. By the time they actually tap the toggle, translations for the
 * *other* languages are usually already cached — so the toggle feels instant.
 * Safe to call repeatedly; fetchTranslations already skips anything cached.
 */
// languages: which to warm (Chinese and Malay unless the store page says otherwise, e.g.
// English, Chinese and Malay for an Indonesian shop's Indonesian menu).
export function prewarmTranslations(texts, languages = ['zh', 'ms']) {
  const clean = (texts || []).filter(Boolean);
  if (clean.length === 0) return;
  for (const language of languages) fetchTranslations(clean, language);
}
