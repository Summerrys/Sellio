// What a store looks like before its owner saves a design: the same in Design Store and
// on the live store, so the designer never shows something customers don't see.
// Home shops show their listings in a Grid; businesses get Split (the menu with its
// category list). A saved choice always wins.
export const DEFAULT_BANNER_COLOR = '#6366f1';

export function storefrontLayout(config, homeShop) {
  return config?.product_layout || (homeShop ? 'grid' : 'split');
}
