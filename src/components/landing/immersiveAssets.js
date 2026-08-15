const configuredRoot = import.meta.env.VITE_SELLIO_ASSET_ROOT;
export const SELLIO_ASSET_ROOT = (configuredRoot || 'https://assets.apptelier.sg/sellio/landing').replace(/\/$/, '');

// Desktop uses the original 16:9 immersive artwork restored from the earlier Sellio build.
// Mobile remains on the dedicated portrait assets hosted under the Sellio asset root.
const desktopImageRoot = '/assets/immersive-16x9';
const mobileImageRoot = `${SELLIO_ASSET_ROOT}/images/mobile`;
const posterRoot = `${SELLIO_ASSET_ROOT}/images/posters`;
const videoRoot = `${SELLIO_ASSET_ROOT}/video/masters`;

export const SELLIO_IMMERSIVE_ASSETS = {
  world: `${desktopImageRoot}/01-sellio-world.jpg`,
  storefront: `${desktopImageRoot}/02-merchant-storefront.jpg`,
  journey: `${desktopImageRoot}/03-commerce-journey.jpg`,
  workspace: `${desktopImageRoot}/04-connected-workspace.jpg`,
  connected: `${desktopImageRoot}/05-connected-commerce.webp`,
  progression: `${desktopImageRoot}/06-coins-progression.jpg`,
  ready: `${desktopImageRoot}/07-ready-world.jpg`,
};

export const SELLIO_IMMERSIVE_MOBILE_ASSETS = {
  world: `${mobileImageRoot}/01-sellio-world.jpg`,
  storefront: `${mobileImageRoot}/02-merchant-storefront.jpg`,
  journey: `${mobileImageRoot}/03-commerce-journey.jpg`,
  workspace: `${mobileImageRoot}/04-connected-workspace.jpg`,
  connected: `${mobileImageRoot}/05-connected-commerce.jpg`,
  progression: `${mobileImageRoot}/06-coins-progression.jpg`,
  ready: `${mobileImageRoot}/07-ready-world.jpg`,
};

export const SELLIO_WORLD_MEDIA = {
  video: {
    desktop: `${videoRoot}/1080p-30fps/desktop/sellio-world.mp4`,
    mobile: `${videoRoot}/1080p-30fps/mobile/sellio-world.mp4`,
  },
  poster: {
    desktop: `${posterRoot}/desktop/sellio-world.webp`,
    mobile: `${posterRoot}/mobile/sellio-world.webp`,
  },
};