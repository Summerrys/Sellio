// 中文 (Simplified Chinese, as written in Singapore and Malaysia) for the owner app, one file per
// group of screens (src/lib/appText.js loads this only for people who see Chinese). English
// phrase -> Chinese; the words follow GLOSSARY.md and match the store page's Chinese
// (src/lib/LanguageContext.jsx) where the two meet.
import signup from './signup.json';
import shop from './shop.json';
import explore from './explore.json';

// signup: sign-up and onboarding. shop: Dashboard, Orders, Counter, Kitchen, Products, Settings
// and what they open. explore: Explore, listings, the cart, My purchases, My likes, Me, chats
// and ratings. A phrase two groups show has the same Chinese in both.
export const GROUPS = { signup, shop, explore };
