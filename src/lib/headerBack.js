// The workspace header's back arrow (phone layout), shown beside the menu button:
//  - back to the previous Sellio page whenever there is one (react-router's history
//    index, which counts only this app's pages, unlike window.history.length);
//  - on a sub-page opened directly (nothing to go back to), up to its parent page;
//  - none on the main (tab) pages when there is nothing to go back to.

// Parent pages for sub-pages; any page not listed goes up to the Dashboard.
export const HEADER_PARENT_PAGES = { Categories: 'Products', Inventory: 'Products' };

export function headerBack(pageName, tabPages, historyState = window.history.state) {
  const hasEarlierPage = (historyState?.idx ?? 0) > 0;
  return {
    show: hasEarlierPage || !tabPages.includes(pageName),
    fallbackPage: HEADER_PARENT_PAGES[pageName] || 'Dashboard',
  };
}
