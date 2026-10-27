// Test helper (not part of the app). The browser's own Back, the same call Android's Back
// makes in the app's WebView: it skips history entries the browser marked as added
// without a tap, and with nothing left to go back to it does nothing.
self.phoneBack = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  try {
    await chrome.tabs.goBack(tab.id);
    return 'went back';
  } catch (e) {
    return 'NOTHING: ' + e.message;
  }
};
