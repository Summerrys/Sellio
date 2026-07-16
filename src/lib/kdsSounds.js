// Merchant-provided notification tones, uploaded to a public Supabase Storage
// bucket ("alert"). Replaces the previous runtime-synthesized "Ding" tone -
// these are real branded sound files instead.
//
// Still played through real <audio> elements (not the Web Audio API) for the
// same reason as before: iOS/iPadOS Safari has repeatedly proven unreliable
// at keeping sounds playable from non-gesture contexts (a new order arriving
// via realtime, a timer-based repeat alert) any other way.
export const NEW_ORDER_TONE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co/storage/v1/object/public/alert/orders/Sellio_NewOrders.mp3';
export const URGENT_ORDER_TONE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co/storage/v1/object/public/alert/orders/Sellio_UrgentOrders.mp3';
