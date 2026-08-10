const fs = require('fs');
const https = require('https');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE = 'https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png';
const SIZES = [16, 32, 64];

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchBuffer(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getMarkBounds(png) {
  // The source includes the SELLIO wordmark below the symbol. For browser tabs,
  // use the storefront/hand symbol only so it remains legible at 16–32px.
  const scanMaxY = Math.min(png.height - 1, 1300);
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y <= scanMaxY; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha > 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('Unable to locate visible logo mark');
  return { minX, minY, maxX, maxY };
}

function squareCrop(bounds, width, height) {
  const markW = bounds.maxX - bounds.minX + 1;
  const markH = bounds.maxY - bounds.minY + 1;
  const padding = Math.ceil(Math.max(markW, markH) * 0.015);
  const side = Math.min(Math.max(markW, markH) + padding * 2, Math.min(width, height));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  let x = Math.round(cx - side / 2);
  let y = Math.round(cy - side / 2);
  x = Math.max(0, Math.min(width - side, x));
  y = Math.max(0, Math.min(height - side, y));
  return { x, y, side };
}

function sampleBilinear(src, sx, sy) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)));
  const x1 = Math.max(0, Math.min(src.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(src.height - 1, y0 + 1));
  const tx = sx - x0;
  const ty = sy - y0;
  const out = [0, 0, 0, 0];
  const weights = [
    [(1 - tx) * (1 - ty), x0, y0],
    [tx * (1 - ty), x1, y0],
    [(1 - tx) * ty, x0, y1],
    [tx * ty, x1, y1],
  ];
  for (const [w, x, y] of weights) {
    const idx = (src.width * y + x) * 4;
    for (let c = 0; c < 4; c++) out[c] += src.data[idx + c] * w;
  }
  return out.map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

function resizeCrop(src, crop, size) {
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = crop.x + ((x + 0.5) / size) * crop.side - 0.5;
      const sy = crop.y + ((y + 0.5) / size) * crop.side - 0.5;
      const rgba = sampleBilinear(src, sx, sy);
      const idx = (size * y + x) * 4;
      for (let c = 0; c < 4; c++) out.data[idx + c] = rgba[c];
    }
  }
  return out;
}

function visibleBounds(png) {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(png.width * y + x) * 4 + 3] > 20) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

(async () => {
  const src = PNG.sync.read(await fetchBuffer(SOURCE));
  const mark = getMarkBounds(src);
  const crop = squareCrop(mark, src.width, src.height);
  fs.mkdirSync(path.join('public', 'icons'), { recursive: true });
  console.log('source mark', mark, 'crop', crop);
  for (const size of SIZES) {
    const out = resizeCrop(src, crop, size);
    const file = path.join('public', 'icons', `sellio-tab-${size}.png`);
    fs.writeFileSync(file, PNG.sync.write(out));
    const b = visibleBounds(out);
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    console.log(file, `${size}x${size}`, `visible ${w}x${h}`, `fill ${(w/size).toFixed(2)} ${(h/size).toFixed(2)}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
