# Sellio Android hardware Back contract (2026-10-28)

## Why Back went dead in Base44's Android app (found in the app's .aab, build android-2_133512_13)

Base44's app is Wix's app engine (React Native + react-native-navigation) around a web view.

- The engine registers `BottomTabsBackHandler` with the app's tabs. Sellio's only tab is
  `{ id: 'brandedLiteMainTab', screen: 'brandedLite.MainScreen' }`, and `isVerticalRootScreen()`
  treats every tab id except `home`, `dashboard`, `fitnessHome`, `BrandedAppsTab`,
  `portalHomeScreen`, `eventsOverview`, `timeHome` and `HomeTab` as a non-home tab.
- react-native-navigation sends `componentDidDisappear` when the app is paused and
  `componentDidAppear` when it resumes (switching apps, a photo or file picker, a permission
  prompt, the screen turning off). On each `componentDidAppear` the tab handler adds a
  `hardwareBackPress` listener that calls `Navigation.mergeOptions(componentId,
  { bottomTabs: { currentTabIndex: 0 } })` and always returns true.
- React Native asks Back listeners newest first. The web view's own listener
  (`useWebViewAndroidBackNavigation`: `goBack()` when its cached `canGoBack` is true) is added
  again only when `canGoBack` changes. So after any resume the tab handler is first and takes
  every Back: it re-selects the tab already showing (the web view blinks hidden/visible) and
  nothing happens, until `canGoBack` changes or the app restarts.

**Sellio's workaround (`rearmAppBack` in `src/lib/useBackToClose.js`):** in the Android app, when
the page is back on screen (visible / window focus / a file picker returning), once it is quiet
it steps to the first entry of its history (`canGoBack` false) and straight back (`canGoBack`
true), so the web view's listener is added again, newest. The steps are hidden from the page
(popstate stopped before react-router, `intercept({ scroll: 'manual', focusReset: 'manual' })`),
and clicks are held off for that fraction of a second. It runs only when the first history entry
is this same page (an entry of an older page would load that page).

**Pages that replace another start on the first entry (`startFreshInstead` / `goFresh` in the same
file, 2026-10-29).** In the Android app, the page's own `location.replace` / `location.reload` to a
Sellio address (finishing a sign-in, signing out, "Update available → Reload", "Try again", a
finished setup) is cancelled in the `navigate` event and loaded on the first entry instead:
- the first entry is this page: step there the hidden way (`stepToFirstEntry`) and load it there;
- the first entry is an older page (after an earlier sign-in, or a page the app loaded on top, such
  as Google sign-in's return): leave a note (`sessionStorage['sellio-fresh-start']`) and go to that
  entry; `index.html`'s first script (`<script id="sellio-fresh-start">`) runs on it before anything
  else, stops it loading and loads the new page in its place (the older page never starts Sellio).
  If that page never comes, the new page loads where it was, as before.

The new page then has nothing behind it and keeps re-arming; Back on it does nothing, as after a
fresh start. Going to the first entry also changes `canGoBack`, so the web view's listener is newest
again even when the app came back on screen before the page loaded (Google sign-in). Sign-out
buttons replace the page too (no Back into signed-in pages). Left as before: a history holding
another site's pages, and pages added on top (`location.assign`, like a store's "sign in to check
out"), which keep Back to the page before them but sit on older pages until the next replace.
Without this, every sign-in left Back dead after the next app switch (or at once after Google
sign-in) until the app was closed. Base44 can fix it properly by adding
`brandedLiteMainTab` to the home-tab ids (or skipping `BottomTabsBackHandler` for a single tab),
or by re-adding the web view's Back listener on `componentDidAppear`.
`verification/back-navigation.browser.mjs` checks the workaround, the reload and the pages that
replace another (with index.html's first script) in real Chrome.

## Web app (implemented)

`src/lib/useBackToClose.js` owns the registered overlay stack and now exposes:

- `window.__sellioHandleAndroidBack()` — synchronous boolean: `true` means Sellio consumed Back: it either closed/guarded the topmost overlay **or** traversed a React Router page using its own history index. `false` means no app-owned overlay or page step exists, leaving the wrapper to handle Android's root navigation/exit.
- `document`'s cancelable `backbutton` event and `window`'s cancelable `sellio:android-back` event are optional alternative dispatch mechanisms.
- Normal browser `popstate` handling remains in place for wrappers that use browser history. Do **not** dispatch a direct Back event *and* call WebView.goBack() for the same press if the direct handler returned true.

The direct handler uses the same registered hierarchy as the history fallback. The Design Store drawer closes before the editor, a confirmation closes before its editor, and an editor with unsaved changes prompts before exiting. For ordinary routes (e.g. Orders → Products → Dashboard), the direct handler invokes web history when React Router's `history.state.idx > 0`, avoiding a stale native `canGoBack` decision. Resuming from the background reconciles an obsolete synthetic-history marker.

## Required native wrapper integration (NOT implemented in Base44 web source)

The installed Android AAB's native Back handler must invoke the web contract **before** deciding whether to call WebView.goBack() or exit/minimize the Activity.

**Plain Android WebView:** Evaluate `Boolean(window.__sellioHandleAndroidBack && window.__sellioHandleAndroidBack())` using `evaluateJavascript` on the WebView's UI thread. The result is a JSON-encoded boolean. When it is `true`, consume this Back press. When `false` or the JS method is unavailable, fall back to `WebView.canGoBack()` / `WebView.goBack()`, then the wrapper's existing root exit behaviour. Handle rapid presses by serializing the JS callbacks. Let Android's IME consume Back before the WebView handler when the keyboard is visible.

**React Native WebView:** Android `BackHandler` callbacks must return `true` immediately to await the asynchronous WebView response. Inject JavaScript to call `window.__sellioHandleAndroidBack()`, then send its boolean via the existing `window.ReactNativeWebView.postMessage` bridge, e.g. `{type:'SELLIO_BACK_RESULT', handled:true|false}`. Merge response handling into the wrapper's **existing** `onMessage` listener, then use `webViewRef.goBack()` only when `handled === false` and the WebView has an earlier route. Never override other bridge messages (OAuth, scanning, etc.). Add a timeout/error fallback and serialize pending Back presses.

**Base44-generated Android wrapper:** A web source edit cannot guarantee this native integration. A previous inspection of the supplied version-14 AAB identified `com.wix.MainActivity` and a React Native/Hermes shell (see the earlier version-14 inspection report). Its compiled Android Back handler was **not** verified. Inspect or customize the wrapper's Android Back handling before claiming the installed APK/AAB is fully fixed. Its package/signing identity, launch splash, native permissions and OAuth return flow must remain unchanged. Repackaging the *same* wrapper without integrating the bridge is not an established fix.

## Regression checklist on a real Android device

1. Dashboard > Design Store: Back closes expanded drawer first; second Back closes the designer when clean.
2. Edit banner/menu/style without saving: Back (after closing the drawer) shows unsaved-changes confirmation. Back dismisses the confirmation and preserves the draft.
3. Image editor / file picker: Back closes the topmost dialog, not the entire app.
4. Switch to another app and return: *first* hardware Back works without requiring a tap.
5. Repeat rapidly through nested layers; no dead Back, double pop, unexpected exit or duplicate confirmation.
6. On root navigation, retain the packaged app's intended double-Back exit policy.
7. Move between Dashboard → Products → Orders, switch to another Android app, resume, then press Back twice. Expected: Orders → Products → Dashboard. The first press must work without another tap.
8. Distinguish Home/background from force-stop/cold start. The latter starts with a fresh navigation history unless the native wrapper explicitly restores its WebView state.
9. Repeat after a web deployment and a cold app restart. Device tests, not jsdom, are needed to certify this.
10. Sign out, sign in (phone, then Google), switch to another app and back, press Back: it works each time. Same after "Update available → Reload" and after a "Try again".

## Restore

Pre-change Base44 checkpoint: `6ae16a1490ce9cee395316f1`.
