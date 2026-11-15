// Scan Menu on the phone, for scanMenu v21 (supabase/functions/scanMenu/index.ts).
//
// The photo is sent at the size the AI reads it at (aiPhotoSize: the high-resolution limits
// of Claude's vision, 2576 px on the long side and 4784 patches of 28 × 28 px), so the boxes
// it gives for each item's own picture on the menu are pixels of the photo as sent, with no
// conversion (Claude's vision docs: pre-resize, and ask for absolute pixel coordinates).
// Those pictures are then cut out of the full photo, which is sharper, as the items' photos.
import { checkDrawn, UnreadablePhotoError, PHOTO_MAX_SIDE, extFor } from './imageShrink';
import { N_ } from './appText';

export const AI_MAX_EDGE = 2576;
export const AI_MAX_PATCHES = 4784;
const PATCH = 28;

const patches = (w, h) => Math.ceil(w / PATCH) * Math.ceil(h / PATCH);

// The size the AI reads a `width` × `height` photo at: the photo's own size when it fits,
// otherwise the largest size with the same shape that does (the reference rule in Claude's
// vision docs, "How Claude resizes images").
export function aiPhotoSize(width, height, maxEdge = AI_MAX_EDGE, maxPatches = AI_MAX_PATCHES) {
  const fits = (w, h) => Math.ceil(w / PATCH) * PATCH <= maxEdge && Math.ceil(h / PATCH) * PATCH <= maxEdge && patches(w, h) <= maxPatches;
  if (fits(width, height)) return [width, height];
  if (height > width) {
    const [h, w] = aiPhotoSize(height, width, maxEdge, maxPatches);
    return [w, h];
  }
  const aspect = width / height;
  let low = 1;
  let high = width;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid, Math.max(Math.round(mid / aspect), 1))) low = mid;
    else high = mid;
  }
  return [low, Math.max(Math.round(low / aspect), 1)];
}

// What the scan screen says when nothing was found (scanMenu v21's reason), or null.
export const SCAN_REASONS = {
  not_a_menu: N_('This photo doesn’t look like a menu. Take a photo of the menu or price list.'),
  too_blurry: N_('The menu is too blurry to read. Hold the phone steady, get closer and make sure the menu is well lit.'),
  cut_off: N_('Only part of the menu is in the photo. Step back so the whole menu fits, or scan it in parts.'),
  no_items: N_('No items to order were found in this photo. Try a clearer photo of the menu.'),
  too_long: N_('This menu is too long to read in one go. Scan half of it at a time.'),
};

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => {
  try { canvas.toBlob(resolve, type, quality); } catch { resolve(null); }
});

const readAsBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('unreadable'));
  reader.readAsDataURL(blob);
});

const BROWSER_READABLE = /^image\/(jpeg|jpg|pjpeg|png|webp|bmp)$/i;

// The photo to send, and the full photo the items' pictures are cut from.
// Returns { base64, mediaType, width, height, full: { img, url, width, height } | null }.
// A photo that didn't come through whole throws UnreadablePhotoError (imageShrink.js); one
// the phone can't open (HEIC on some phones) is sent as it is, without pictures.
export async function prepareMenuPhoto(file) {
  if (!file?.size || (file.type && !file.type.startsWith('image/'))) throw new Error('not a photo');
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    if (!file.type || BROWSER_READABLE.test(file.type)) throw new UnreadablePhotoError();
    return { base64: await readAsBase64(file), mediaType: file.type, width: null, height: null, full: null };
  }
  const { img, url } = decoded;
  const fullWidth = img.naturalWidth || img.width;
  const fullHeight = img.naturalHeight || img.height;
  if (!fullWidth || !fullHeight) { URL.revokeObjectURL(url); throw new UnreadablePhotoError(); }
  const [width, height] = aiPhotoSize(fullWidth, fullHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, 0, 0, width, height);
  // Checked before anything else is drawn: a photo cut short leaves its bottom empty.
  const drawn = await checkDrawn(context, width, height, file);
  if (drawn === 'cut-off') { URL.revokeObjectURL(url); throw new UnreadablePhotoError(); }
  if (drawn === 'not-drawn') {
    // Whole, but this phone couldn't redraw it: sent as it is, as before (no pictures).
    URL.revokeObjectURL(url);
    return { base64: await readAsBase64(file), mediaType: file.type || 'image/jpeg', width: null, height: null, full: null };
  }
  // White behind any see-through parts (a PNG), as the JPEG can't keep them.
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  const blob = await toBlob(canvas, 'image/jpeg', 0.9);
  if (!blob) { URL.revokeObjectURL(url); throw new UnreadablePhotoError(); }
  return {
    base64: await readAsBase64(blob),
    mediaType: 'image/jpeg',
    width,
    height,
    full: { img, url, width: fullWidth, height: fullHeight },
  };
}

// A box from the scan ([x1, y1, x2, y2], pixels of the photo as sent) as a rectangle of the
// full photo ({ x, y, width, height }), or null.
export function fullPhotoRect(box, sent, full) {
  if (!Array.isArray(box) || box.length !== 4 || !sent?.width || !sent?.height || !full?.width || !full?.height) return null;
  const sx = full.width / sent.width;
  const sy = full.height / sent.height;
  const x1 = Math.max(0, Math.min(full.width, Math.round(Math.min(box[0], box[2]) * sx)));
  const x2 = Math.max(0, Math.min(full.width, Math.round(Math.max(box[0], box[2]) * sx)));
  const y1 = Math.max(0, Math.min(full.height, Math.round(Math.min(box[1], box[3]) * sy)));
  const y2 = Math.max(0, Math.min(full.height, Math.round(Math.max(box[1], box[3]) * sy)));
  if (x2 - x1 < 8 || y2 - y1 < 8) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// The picture inside `rect` of the full photo, as an item photo (at most PHOTO_MAX_SIDE px,
// WebP or JPEG). Returns { blob, url, type, ext } or null.
export async function cutPicture(img, rect) {
  if (!img || !rect) return null;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(rect.width, rect.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  let blob = await toBlob(canvas, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.88);
  if (!blob) return null;
  return { blob, url: URL.createObjectURL(blob), type: blob.type, ext: extFor(blob.type) };
}

// A price typed in the review: the number, or null when it's empty or not a price.
export function typedPrice(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
}

// Options as the product editor keeps them, with numbers for every extra price (checkout
// reads them as numbers).
export function cleanScannedOptions(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((group) => group && typeof group.name === 'string' && Array.isArray(group.options))
    .map((group) => ({
      name: group.name,
      type: group.type === 'addon' ? 'addon' : 'other',
      options: group.options
        .filter((option) => option && typeof option.label === 'string' && option.label.trim())
        .map((option) => ({ label: option.label.trim(), price_modifier: typedPrice(option.price_modifier) ?? 0 })),
    }))
    .filter((group) => group.options.length > 0);
}
