const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const edgeColourCache = new Map();

export function isValidBannerEdgeColor(value) {
  return typeof value === 'string' && HEX_COLOUR.test(value);
}

function channelToHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function sampleStrip(imageData) {
  let redSquared = 0;
  let greenSquared = 0;
  let blueSquared = 0;
  let weight = 0;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3] / 255;
    if (alpha < 0.08) continue;

    redSquared += imageData.data[index] ** 2 * alpha;
    greenSquared += imageData.data[index + 1] ** 2 * alpha;
    blueSquared += imageData.data[index + 2] ** 2 * alpha;
    weight += alpha;
  }

  if (weight === 0) return null;

  // RMS averaging keeps a colourful edge from becoming a muddy grey while
  // still smoothing out individual pixels, text and compression artefacts.
  return `#${channelToHex(Math.sqrt(redSquared / weight))}${channelToHex(Math.sqrt(greenSquared / weight))}${channelToHex(Math.sqrt(blueSquared / weight))}`;
}

function loadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load banner image for edge colour sampling.'));
    image.src = imageUrl;
  });
}

async function sampleBannerEdgeAssets(imageUrl) {
  const image = await loadImage(imageUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Banner image has no measurable dimensions.');

  // Retain enough vertical detail for a crisp edge continuation at the
  // storefront's largest supported banner height without processing the
  // merchant's full-resolution upload on every device.
  const scale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable for banner edge extraction.');
  context.drawImage(image, 0, 0, width, height);

  // Four percent is wide enough to preserve the edge's vertical texture but
  // narrow enough that stretching it cannot distort central products or text.
  const stripWidth = Math.max(1, Math.round(width * 0.04));
  const verticalInset = Math.min(
    Math.floor(height / 3),
    Math.max(0, Math.round(height * 0.08))
  );
  const sampleHeight = Math.max(1, height - verticalInset * 2);
  const left = sampleStrip(context.getImageData(0, verticalInset, stripWidth, sampleHeight));
  const right = sampleStrip(context.getImageData(width - stripWidth, verticalInset, stripWidth, sampleHeight));

  if (!left || !right) throw new Error('Banner edge colours could not be sampled.');

  const makeStrip = (sourceX) => {
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = stripWidth;
    stripCanvas.height = height;
    const stripContext = stripCanvas.getContext('2d');
    if (!stripContext) throw new Error('Canvas is unavailable for banner edge extraction.');
    stripContext.drawImage(
      canvas,
      sourceX,
      0,
      stripWidth,
      height,
      0,
      0,
      stripWidth,
      height
    );
    return stripCanvas.toDataURL('image/png');
  };

  return {
    left,
    right,
    leftStrip: makeStrip(0),
    rightStrip: makeStrip(width - stripWidth),
    aspectRatio: sourceWidth / sourceHeight,
  };
}

export function extractBannerEdgeAssets(imageUrl) {
  if (!imageUrl) return Promise.reject(new Error('A banner image URL is required.'));

  const cached = edgeColourCache.get(imageUrl);
  if (cached) return cached;

  const extraction = sampleBannerEdgeAssets(imageUrl).catch(error => {
    edgeColourCache.delete(imageUrl);
    throw error;
  });
  edgeColourCache.set(imageUrl, extraction);
  return extraction;
}

export async function extractBannerEdgeColors(imageUrl) {
  const { left, right } = await extractBannerEdgeAssets(imageUrl);
  return { left, right };
}
