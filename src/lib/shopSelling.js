// Free shops (tenants.seller_type = 'individual'): how they sell, and the words their
// orders use. Business stores never use anything in this file.
//
// Selling settings come from the database (get_shop_selling for buyers,
// my_shop_selling for the owner; step 15). The server checks everything again:
// nothing here is trusted for prices, fees or dates.

export const isShopTenant = (tenant) => tenant?.seller_type === 'individual';

// ── Order steps for a free shop ──────────────────────────────────────────────────
// The same order statuses as every store (pending → confirmed → preparing → ready →
// completed, or cancelled), with words that fit a home seller.
export function shopMethod(order) {
  const method = order?.fulfilment?.method;
  if (method === 'delivery' || method === 'collection') return method;
  return order?.type === 'delivery' ? 'delivery' : 'collection';
}

export function shopStatusLabel(status, method, food) {
  switch (status) {
    case 'pending': return 'New';
    case 'confirmed': return 'Accepted';
    case 'preparing': return food ? 'Preparing' : 'Packing';
    case 'ready':
    case 'served': return method === 'delivery' ? 'Out for delivery' : 'Ready for collection';
    case 'completed': return method === 'delivery' ? 'Delivered' : 'Collected';
    case 'cancelled': return 'Cancelled';
    default: return status || '';
  }
}

// The button that moves an order to its next step.
export function shopNextAction(status, method, food) {
  switch (status) {
    case 'pending': return { label: 'Accept', next: 'confirmed' };
    case 'confirmed': return { label: food ? 'Start preparing' : 'Start packing', next: 'preparing' };
    case 'preparing': return { label: method === 'delivery' ? 'Out for delivery' : 'Ready for collection', next: 'ready' };
    case 'ready':
    case 'served': return { label: method === 'delivery' ? 'Mark delivered' : 'Mark collected', next: 'completed' };
    default: return null;
  }
}

// Tabs and counters on the Orders page.
export function shopStatusTabs(food) {
  return [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'New' },
    { value: 'confirmed', label: 'Accepted' },
    { value: 'preparing', label: food ? 'Preparing' : 'Packing' },
    { value: 'ready', label: 'Ready / Out' },
    { value: 'completed', label: 'Done' },
  ];
}

// ── Dates (shops are in Singapore or Malaysia, both UTC+8) ──────────────────────────
export function formatShopDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ── Phone numbers (same rules as the server) ─────────────────────────────────────
export function normaliseBuyerPhone(raw) {
  let v = String(raw || '').replace(/[\s()-]/g, '');
  if (/^[89]\d{7}$/.test(v)) v = '+65' + v;
  else if (/^65[89]\d{7}$/.test(v)) v = '+' + v;
  else if (/^01\d{8,9}$/.test(v)) v = '+6' + v;
  else if (/^601\d{8,9}$/.test(v)) v = '+' + v;
  return /^\+65[89]\d{7}$/.test(v) || /^\+601\d{8,9}$/.test(v) ? v : null;
}

// wa.me needs the number without "+".
export const whatsappLink = (phone, text) =>
  `https://wa.me/${String(phone || '').replace(/[^\d]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// ── Delivery charge shown to the buyer (the server works it out again) ─────────────
export function deliveryChargeFor(selling, subtotal) {
  const d = selling?.delivery;
  if (!d?.enabled || d.fee_mode !== 'extra') return 0;
  const fee = Number(d.fee) || 0;
  const freeAbove = d.free_above == null ? null : Number(d.free_above);
  if (freeAbove != null && Number(subtotal) >= freeAbove) return 0;
  return fee;
}

// Methods the buyer can choose, in a fixed order.
export function availableMethods(selling) {
  const out = [];
  if (selling?.collection?.enabled) out.push('collection');
  if (selling?.delivery?.enabled) out.push('delivery');
  return out.length ? out : ['collection'];
}

// ── Settings form defaults ─────────────────────────────────────────────────────────
export function emptySellingForm() {
  return {
    collection: { enabled: true, area: '', address: '', notes: '' },
    delivery: { enabled: false, fee_mode: 'included', fee: '', free_above: '', areas: '', notes: '' },
    preorder: { enabled: false, min_days: 1 },
  };
}

export function sellingFormFrom(settings) {
  const f = emptySellingForm();
  if (!settings) return f;
  const c = settings.collection || {};
  const d = settings.delivery || {};
  const p = settings.preorder || {};
  return {
    collection: { enabled: !!c.enabled, area: c.area || '', address: c.address || '', notes: c.notes || '' },
    delivery: {
      enabled: !!d.enabled,
      fee_mode: d.fee_mode === 'extra' ? 'extra' : 'included',
      fee: d.fee_mode === 'extra' && Number(d.fee) > 0 ? String(Number(d.fee)) : '',
      free_above: d.free_above != null ? String(Number(d.free_above)) : '',
      areas: d.areas || '',
      notes: d.notes || '',
    },
    preorder: { enabled: !!p.enabled, min_days: Number.isInteger(p.min_days) ? p.min_days : 1 },
  };
}

// What save_shop_selling receives.
export function sellingPayload(form) {
  const amount = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
  };
  return {
    collection: {
      enabled: !!form.collection.enabled,
      area: form.collection.area,
      address: form.collection.address,
      notes: form.collection.notes,
    },
    delivery: {
      enabled: !!form.delivery.enabled,
      fee_mode: form.delivery.fee_mode,
      fee: form.delivery.fee_mode === 'extra' ? amount(form.delivery.fee) : null,
      free_above: form.delivery.fee_mode === 'extra' ? amount(form.delivery.free_above) : null,
      areas: form.delivery.areas,
      notes: form.delivery.notes,
    },
    preorder: { enabled: !!form.preorder.enabled, min_days: Number(form.preorder.min_days) || 0 },
  };
}

// One line describing how a shop sells, e.g. for the Dashboard card or Settings.
export function sellingSummary(settings, sym = '$') {
  if (!settings) return '';
  const parts = [];
  if (settings.collection?.enabled) parts.push(`Self-collection${settings.collection.area ? ` (${settings.collection.area})` : ''}`);
  if (settings.delivery?.enabled) {
    const d = settings.delivery;
    parts.push(d.fee_mode === 'extra' && Number(d.fee) > 0
      ? `Delivery ${sym}${Number(d.fee).toFixed(2)}${d.free_above ? `, free above ${sym}${Number(d.free_above).toFixed(2)}` : ''}`
      : 'Delivery (postage & courier included)');
  }
  if (settings.preorder?.enabled) parts.push(`Pre-orders, ${settings.preorder.min_days} day${settings.preorder.min_days === 1 ? '' : 's'} notice`);
  return parts.join(' · ');
}

// ── Words on the store page (English, Chinese, Malay) ───────────────────────────────
const SHOP_TEXT = {
  en: {
    howToGet: 'How would you like to get your order?',
    collection: 'Self-collect',
    delivery: 'Delivery',
    collectionAt: 'Collect at',
    addressAfterAccept: 'The seller shares the exact address once they accept your order.',
    deliveryIncluded: 'Postage & courier included',
    deliveryFee: 'Delivery (postage & courier)',
    freeAbove: 'Free delivery for orders from',
    deliversTo: 'Delivers to',
    yourName: 'Your name',
    yourMobile: 'Mobile number',
    mobileHint: 'The seller will contact you on this number.',
    deliveryAddress: 'Delivery address',
    pickDate: 'Date',
    pickDateHint: 'Pre-order: choose a date from',
    notes: 'Notes (optional)',
    notesPlaceholder: 'Anything the seller should know?',
    subtotal: 'Subtotal',
    free: 'Free',
    included: 'Included',
    total: 'Total',
    nameNeeded: 'Please enter your name.',
    phoneNeeded: 'Please enter a Singapore or Malaysia mobile number.',
    addressNeeded: 'Please enter the delivery address.',
    dateNeeded: 'Please choose a date.',
    yourOrder: 'Your order',
    contactSeller: 'Message the seller on WhatsApp',
    payLater: 'The seller will contact you about payment.',
    statusNew: 'Waiting for the seller to accept',
    orderHistory: 'Your orders',
    noOrders: 'No orders yet',
    showQr: 'Show payment QR',
    paid: 'Paid',
    notPaid: 'Not paid yet',
    for: 'For',
  },
  zh: {
    howToGet: '您想如何取得订单？',
    collection: '自取',
    delivery: '送货',
    collectionAt: '自取地点',
    addressAfterAccept: '卖家接受订单后会告诉您确切地址。',
    deliveryIncluded: '已含邮费和快递费',
    deliveryFee: '送货费（邮费和快递）',
    freeAbove: '订单满此金额免运费：',
    deliversTo: '送货范围',
    yourName: '您的名字',
    yourMobile: '手机号码',
    mobileHint: '卖家会通过此号码联系您。',
    deliveryAddress: '送货地址',
    pickDate: '日期',
    pickDateHint: '预购：请选择日期，从',
    notes: '备注（可选）',
    notesPlaceholder: '有什么需要告诉卖家吗？',
    subtotal: '小计',
    free: '免费',
    included: '已包含',
    total: '总计',
    nameNeeded: '请输入您的名字。',
    phoneNeeded: '请输入新加坡或马来西亚的手机号码。',
    addressNeeded: '请输入送货地址。',
    dateNeeded: '请选择日期。',
    yourOrder: '您的订单',
    contactSeller: '通过 WhatsApp 联系卖家',
    payLater: '卖家会联系您安排付款。',
    statusNew: '等待卖家接受',
    orderHistory: '我的订单',
    noOrders: '还没有订单',
    showQr: '显示付款二维码',
    paid: '已付款',
    notPaid: '未付款',
    for: '日期',
  },
  ms: {
    howToGet: 'Bagaimana anda mahu terima pesanan anda?',
    collection: 'Ambil sendiri',
    delivery: 'Penghantaran',
    collectionAt: 'Ambil di',
    addressAfterAccept: 'Penjual akan beri alamat tepat selepas menerima pesanan anda.',
    deliveryIncluded: 'Termasuk pos & kurier',
    deliveryFee: 'Penghantaran (pos & kurier)',
    freeAbove: 'Penghantaran percuma untuk pesanan dari',
    deliversTo: 'Hantar ke',
    yourName: 'Nama anda',
    yourMobile: 'Nombor telefon bimbit',
    mobileHint: 'Penjual akan menghubungi anda melalui nombor ini.',
    deliveryAddress: 'Alamat penghantaran',
    pickDate: 'Tarikh',
    pickDateHint: 'Pra-pesanan: pilih tarikh dari',
    notes: 'Nota (pilihan)',
    notesPlaceholder: 'Apa-apa yang penjual perlu tahu?',
    subtotal: 'Jumlah kecil',
    free: 'Percuma',
    included: 'Termasuk',
    total: 'Jumlah',
    nameNeeded: 'Sila masukkan nama anda.',
    phoneNeeded: 'Sila masukkan nombor telefon bimbit Singapura atau Malaysia.',
    addressNeeded: 'Sila masukkan alamat penghantaran.',
    dateNeeded: 'Sila pilih tarikh.',
    yourOrder: 'Pesanan anda',
    contactSeller: 'Mesej penjual di WhatsApp',
    payLater: 'Penjual akan menghubungi anda tentang bayaran.',
    statusNew: 'Menunggu penjual menerima',
    orderHistory: 'Pesanan anda',
    noOrders: 'Belum ada pesanan',
    showQr: 'Tunjuk QR bayaran',
    paid: 'Sudah dibayar',
    notPaid: 'Belum dibayar',
    for: 'Untuk',
  },
};

export function shopT(lang, key) {
  return (SHOP_TEXT[lang] && SHOP_TEXT[lang][key]) || SHOP_TEXT.en[key] || key;
}

// Status words the buyer sees.
const BUYER_STATUS = {
  en: { pending: 'Waiting for the seller', confirmed: 'Accepted', preparing_food: 'Preparing', preparing: 'Packing', ready_collection: 'Ready for collection', ready_delivery: 'Out for delivery', completed_collection: 'Collected', completed_delivery: 'Delivered', cancelled: 'Cancelled' },
  zh: { pending: '等待卖家接受', confirmed: '已接受', preparing_food: '准备中', preparing: '包装中', ready_collection: '可以自取', ready_delivery: '送货中', completed_collection: '已自取', completed_delivery: '已送达', cancelled: '已取消' },
  ms: { pending: 'Menunggu penjual', confirmed: 'Diterima', preparing_food: 'Sedang disediakan', preparing: 'Sedang dibungkus', ready_collection: 'Sedia untuk diambil', ready_delivery: 'Dalam penghantaran', completed_collection: 'Telah diambil', completed_delivery: 'Telah dihantar', cancelled: 'Dibatalkan' },
};

export function buyerStatusLabel(lang, status, method, food) {
  const words = BUYER_STATUS[lang] || BUYER_STATUS.en;
  let key = status;
  if (status === 'preparing') key = food ? 'preparing_food' : 'preparing';
  else if (status === 'ready' || status === 'served') key = method === 'delivery' ? 'ready_delivery' : 'ready_collection';
  else if (status === 'completed') key = method === 'delivery' ? 'completed_delivery' : 'completed_collection';
  return words[key] || BUYER_STATUS.en[key] || status;
}
