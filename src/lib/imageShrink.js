// Photos are shrunk on the phone before they're uploaded, so customers download a few
// hundred KB instead of the camera's multi-MB original: at most `maxSide` px on the long
// side, as WebP (JPEG, or PNG for see-through logos, where the phone can't make WebP).
// A file it can't safely shrink (GIF, SVG, HEIC the phone can't open) is uploaded as it
// is, and so is a result that isn't smaller.
//
// A photo that didn't come through whole is never uploaded: shrinkImage throws
// UnreadablePhotoError instead, whose message is meant for the person. Seen in Sellio's
// Android app on an OPPO Find X9 Pro (Oct 2026): the phone handed the page only the first
// 2.16 MB of a 2.97 MB photo it had taken seconds before. Such a photo still "loads", but
// draws as nothing (or without its bottom), so its shrunk copy came out blank and the
// listing showed no photo. A JPG, PNG or WebP the browser can't open at all is damaged the
// same way. checkPhoto runs the same check on a photo shown or edited before its upload.

export const PHOTO_MAX_SIDE = 1600; // listings and item photos
export const LOGO_MAX_SIDE = 800; // shop logos (shown at up to ~120px)
export const BANNER_MAX_SIDE = 2048; // a store's banner (full width on a computer)
// An upload with a unique name can be cached for a year; a replacement gets a new name.
export const LONG_CACHE = '31536000';

export const UNREADABLE_PHOTO_MESSAGE = "This photo didn't come through in full from your phone. Please take it again or choose another photo.";

export class UnreadablePhotoError extends Error {
  constructor() {
    super(UNREADABLE_PHOTO_MESSAGE);
    this.name = 'UnreadablePhotoError';
    this.friendly = true; // meant for the person: shown as it is
  }
}

const SHRINKABLE = /^image\/(jpeg|jpg|pjpeg|png|webp|bmp|heic|heif)$/i;
// Every browser opens these, so one that won't open is damaged rather than unusual.
const BROWSER_READABLE = /^image\/(jpeg|jpg|pjpeg|png|webp|bmp)$/i;
// No see-through parts: once drawn, a whole photo covers every pixel.
const OPAQUE = /^image\/(jpeg|jpg|pjpeg|bmp|heic|heif)$/i;
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

// Did the photo really land on the canvas? Reads three rows, so it's quick. A photo with
// no see-through parts must cover most of each of them; any photo must show something.
function drewWhole(context, width, height, opaque) {
  let shown = 0;
  for (const y of new Set([0, Math.floor(height / 2), height - 1])) {
    const { data } = context.getImageData(0, y, width, 1);
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) solid += 1;
    if (opaque && solid < width / 2) return false;
    shown += solid;
  }
  return shown > 0;
}

// The browser's verdict on the whole file: an <img> still "loads" a photo that's cut
// short, but createImageBitmap refuses it.
async function decodesFully(blob) {
  if (typeof createImageBitmap !== 'function') return false;
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

// After `file` was drawn to fill the canvas behind `context`: 'whole'; 'cut-off' (the file
// itself is incomplete or damaged: never upload it); or 'not-drawn' (the file is whole and
// only this phone's redraw failed).
export async function checkDrawn(context, width, height, file) {
  if (drewWhole(context, width, height, OPAQUE.test(String(file?.type || '')))) return 'whole';
  return (await decodesFully(file)) ? 'not-drawn' : 'cut-off';
}

// Returns { blob, type, ext } — the shrunk photo, or the original when shrinking can't help.
// Throws UnreadablePhotoError for a photo that didn't come through whole (see the top).
export async function shrinkImage(input, { maxSide = PHOTO_MAX_SIDE, quality = 0.82 } = {}) {
  const type = String(input?.type || '').toLowerCase();
  const original = { blob: input, type: type || 'image/jpeg', ext: extFor(type) };
  if (!input || typeof document === 'undefined' || !SHRINKABLE.test(type)) return original;
  let img;
  try {
    img = await decode(input);
  } catch {
    if (BROWSER_READABLE.test(type)) throw new UnreadablePhotoError();
    return original; // HEIC on a phone that can't open it: uploaded as it is
  }
  try {
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
    const drawn = await checkDrawn(context, canvas.width, canvas.height, input);
    if (drawn === 'cut-off') throw new UnreadablePhotoError();
    if (drawn === 'not-drawn') return original; // whole: uploaded as it is, like any photo that can't be shrunk
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
  } catch (error) {
    if (error instanceof UnreadablePhotoError) throw error;
    return original;
  }
}

// Throws UnreadablePhotoError when `blob` didn't come through whole: for a photo shown or
// edited before it's uploaded (the upload checks it again as it shrinks it).
export async function checkPhoto(blob) {
  await shrinkImage(blob, { maxSide: 256 });
}
