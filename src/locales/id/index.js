// Bahasa Indonesia for the owner app, one file per group of screens (src/lib/appText.js loads
// this only for people who see Indonesian). English phrase -> Indonesian; the words follow
// GLOSSARY.md. Every language's index.js exports its groups as GROUPS.
import signup from './signup.json';
import shop from './shop.json';
import explore from './explore.json';

// signup: sign-up and onboarding. shop: Dashboard, Orders, Counter, Kitchen, Products, Settings
// and what they open. explore: Explore, listings, the cart, My purchases, My likes, Me, chats
// and ratings (its screens use useAppText('explore'); in LIVE_GROUPS.id since 16 Nov 2026).
// A phrase two groups show has the same Indonesian in both.
export const GROUPS = { signup, shop, explore };
