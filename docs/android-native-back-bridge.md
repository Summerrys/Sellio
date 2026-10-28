# Sellio Android hardware Back contract (2026-10-28)

## Web app (implemented)

`src/lib/useBackToClose.js` owns the registered overlay stack and now exposes:

- `window.__sellioHandleAndroidBack()` — synchronous boolean: `true` means the topmost Sellio overlay handled Back (or refused to close because it is saving/has a confirmation pending); `false` means no Sellio overlay handled Back.
- `document`'s cancelable `backbutton` event and `window`'s cancelable `sellio:android-back` event are optional alternative dispatch mechanisms.
- Normal browser `popstate` handling remains in place for wrappers that use browser history. Do **not** dispatch a direct Back event *and* call WebView.goBack() for the same press if the direct handler returned true.

The direct handler uses the same registered hierarchy as the history fallback. The Design Store drawer closes before the editor, a confirmation closes before its editor, and an editor with unsaved changes prompts before exiting. Resuming from the background reconciles an obsolete synthetic-history marker.

## Required native wrapper integration (NOT implemented in Base44 web source)

The installed Android AAB's native Back handler must invoke the web contract **before** deciding whether to call WebView.goBack() or exit/minimize the Activity.

**Plain Android WebView:** Evaluate `Boolean(window.__sellioHandleAndroidBack && window.__sellioHandleAndroidBack())` using `evaluateJavascript` on the WebView's UI thread. The result is a JSON-encoded boolean. When it is `true`, consume this Back press. When `false` or the JS method is unavailable, fall back to `WebView.canGoBack()` / `WebView.goBack()`, then the wrapper's existing root exit behaviour. Handle rapid presses by serializing the JS callbacks. Let Android's IME consume Back before the WebView handler when the keyboard is visible.

**React Native WebView:** Android `BackHandler` callbacks must return `true` immediately to await the asynchronous WebView response. Inject JavaScript to call `window.__sellioHandleAndroidBack()`, then send its boolean via the existing `window.ReactNativeWebView.postMessage` bridge, e.g. `{type:'SELLIO_BACK_RESULT', handled:true|false}`. Merge response handling into the wrapper's **existing** `onMessage` listener, then use `webViewRef.goBack()` only when `handled === false` and the WebView has an earlier route. Never override other bridge messages (OAuth, scanning, etc.). Add a timeout/error fallback and serialize pending Back presses.

**Base44-generated Android wrapper:** A web source edit cannot guarantee this native integration. Inspect or customize the wrapper's Android Back handling before claiming the installed APK/AAB is fully fixed. Its launch splash and OAuth return flow must remain unchanged.

## Regression checklist on a real Android device

1. Dashboard > Design Store: Back closes expanded drawer first; second Back closes the designer when clean.
2. Edit banner/menu/style without saving: Back (after closing the drawer) shows unsaved-changes confirmation. Back dismisses the confirmation and preserves the draft.
3. Image editor / file picker: Back closes the topmost dialog, not the entire app.
4. Switch to another app and return: *first* hardware Back works without requiring a tap.
5. Repeat rapidly through nested layers; no dead Back, double pop, unexpected exit or duplicate confirmation.
6. On root navigation, retain the packaged app's intended double-Back exit policy.
7. Repeat after a web deployment and a cold app restart. Device tests, not jsdom, are needed to certify this.

## Restore

Pre-change Base44 checkpoint: `6ae16a1490ce9cee395316f1`.
