const configuredBase = import.meta.env.VITE_SELLIO_IMMERSIVE_ASSET_BASE_URL;
export const SELLIO_IMMERSIVE_ASSET_BASE = (configuredBase || 'https://assets.apptelier.sg/sellio').replace(/\/$/, '');

export const SELLIO_IMMERSIVE_ASSETS = {
  world: `${SELLIO_IMMERSIVE_ASSET_BASE}/01-sector-world.webp`,
  storefront: `${SELLIO_IMMERSIVE_ASSET_BASE}/02-storefront-zoom.webp`,
  journey: `${SELLIO_IMMERSIVE_ASSET_BASE}/03-commerce-journey.webp`,
  workspace: `${SELLIO_IMMERSIVE_ASSET_BASE}/04-connected-workspace.webp`,
  connected: `${SELLIO_IMMERSIVE_ASSET_BASE}/05-connected-commerce.webp`,
  progression: `${SELLIO_IMMERSIVE_ASSET_BASE}/06-progression.webp`,
  ready: `${SELLIO_IMMERSIVE_ASSET_BASE}/07-ready-world.webp`,
};
