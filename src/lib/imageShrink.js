// Photos are shrunk on the phone before they're uploaded, so customers download a few
// hundred KB instead of the camera's multi-MB original: at most `maxSide` px on the long
// side, as WebP (JPEG, or PNG for see-through logos, where the phone can't make WebP).
// It never throws: a file it can't safely shrink (GIF, SVG, HEIC the phone can't open,
// anything unreadable) is uploaded as it is, and so is a result that isn't smaller.

export const PHOTO_MAX_SIDE = 1600; // listings and item photos
export const LOGO_MAX_SIDE = 800; // shop logos (shown at up to ~120px)
export const BANNER_MAX_SIDE = 2048; // a store's banner (full width on a computer)
// An upload with a unique name can be cached for a year; a replacement gets a new name.
export const LONG_CACHE = '31536000';

const SHRINKABLE = /^image\/(jpeg|jpg|pjpeg|png|webp|bmp|heic|heif)$/i;
const EXT = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
};

export const extFor = (type, fallback = 'jpg') => EXT[String(type || '').toLowerCase()] || fallback;

// "IMG_1234.JPG" + "webp" → "IMG_1234.webp"
export function withExt(name, ext) {
  const base = String(name || 'photo').replace(/\.[^./\\]*$/, '') || 'photo';
  return `${base}.${ext}`;
}

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => {
  try { canvas.toBlob(resolve, type, quality); } catch { resolve(null); }
});

// Returns { blob, type, ext } — the shrunk photo, or the original when shrinking can't help.
export async function shrinkImage(input, { maxSide = PHOTO_MAX_SIDE, quality = 0.82 } = {}) {
  const type = String(input?.type || '').toLowerCase();
  const original = { blob: input, type: type || 'image/jpeg', ext: extFor(type) };
  if (!input || typeof document === 'undefined' || !SHRINKABLE.test(type)) return original;
  try {
    const img = await decode(input);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return original;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      if (type === 'image/png') {
        blob = await toBlob(canvas, 'image/png');
      } else {
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        blob = await toBlob(canvas, 'image/jpeg', 0.85);
      }
    }
    if (!blob) return original;
    // Already small and not resized: keep the original rather than a bigger re-encode.
    if (scale === 1 && blob.size >= input.size) return original;
    return { blob, type: blob.type, ext: extFor(blob.type) };
  } catch {
    return original;
  }
}
