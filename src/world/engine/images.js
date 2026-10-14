// Loads product photos for the stall menu boards. Photos load only for stalls
// near the player, at most three at a time, and a photo whose host does not
// allow cross-origin use simply does not appear (the board keeps the rest).

const cache = new Map();
const queue = [];
let active = 0;
const MAX_ACTIVE = 3;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const job = queue.shift();
    active++;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true; active--; clearTimeout(timer);
      job.resolve(ok ? img : null);
      pump();
    };
    const timer = setTimeout(() => done(false), 9000);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = job.url;
  }
}

export function loadImage(url) {
  if (typeof url !== 'string') return Promise.resolve(null);
  let ok = /^https:\/\//i.test(url);
  try { ok = ok || new URL(url, window.location.href).origin === window.location.origin; } catch { ok = false; }
  if (!ok) return Promise.resolve(null);
  if (!cache.has(url)) cache.set(url, new Promise((resolve) => { queue.push({ url, resolve }); pump(); }));
  return cache.get(url);
}

// Draws an image to fill a square cell (centre crop).
export function drawCover(c, img, x, y, size) {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
  c.drawImage(img, sx, sy, s, s, x, y, size, size);
}
