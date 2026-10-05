# Sellio Android startup

## What the app shows when it opens

- **In the Android app only:** one Sellio splash (logo, outlined tagline, branded dots). It shows from the first paint of the app's start page until the first screen is ready: the login page, or the Dashboard for someone already signed in.
  - `index.html` starts it before the code loads when the app's bridge is already there. Otherwise `RootRoute` starts it when the code runs.
  - The splash stays up for at least 1.5 seconds.
  - It stays while any full-screen loader is showing, and for 0.3 seconds after the last one, so pages that swap one loader for another stay covered.
  - It also covers the reload on the way to the Dashboard. `index.html` shows the same splash before the code loads again, so there is no white gap.
  - It never stays longer than 10 seconds.
  - It fades out over 0.2 seconds.
- **On the website:** the splash never appears. Visitors see the normal small "Loading..." loader (`AppLoader`), as before.
- **How the app is detected:** by the native bridge (`isNativeApp` in `RootRoute`). The app's start page `/` goes straight to `/Auth`. Browser visitors to `/` still get the landing page.
- **Old `/Splash` links** forward to `/Auth` at once, keeping their search and hash parameters (invites, password recovery).
- **Auth and Join** keep the usual page slide-in.

The code:

- `src/lib/appLaunch.js`: the timing rules.
  - The launch state is kept in sessionStorage under `sellio-launch`, so it survives the reload.
  - Every `AppLoader` holds the splash while it is mounted.
- `index.html`:
  - the splash itself, the `#sellio-launch-splash` element, with its `.sellio-launch` styles. The tagline is inline, so it is there from the first paint; keep it in step with `public/branding/sellio-splash-tagline.svg`.
  - the script that shows it before the code loads.
  - If the code never runs, the script still removes the splash after the 10 seconds.
  - Keep the key, the 10-second limit and the bridge test in step with `appLaunch.js` and `App.jsx`.
- `src/components/ui-custom/LaunchSplash.jsx`: mounted once in `App.jsx`. It keeps that same element up and fades it out, so the page never swaps one splash for another.
- The Google sign-in return (`?sellio_mobile_oauth=`) never shows the splash.

Publish these web changes in Base44. They do not need a new AAB.

## Native screens still present in approved version 13

The supplied android-2.133512.13.aab contains:

- base/res/layout/splash.xml: a full-screen ConstraintLayout with a centered ImageView.
- base/res/drawable/branded_logo.png: the native logo asset.
- base/res/drawable/ic_app_icon.png: the packaged icon.
- appColor, splash_color and brandedColor: white.

**What the two plain-logo screens are:**

- The first two plain-logo screenshots match two native screens: Android's system launch splash, then the wrapper's own native splash.
- This comes from the screenshots and from reading the package, not from a recording on a phone.
- Both appear before Sellio's editable web code runs, so web changes cannot remove them.

**Removing them needs a native wrapper change:**

- Android 12 and later always shows a system launch window. A wrapper should use AndroidX SplashScreen and hand over to the WebView with a matching background, rather than adding a second splash layout of its own.
- This needs either a Base44 packaging setting or a change to the native wrapper, followed by a new correctly signed AAB.
- Keep package com.base6985959ce9aaceadb8b7cc41.app and its Play signing identity.

Android guidance: https://developer.android.com/develop/ui/views/launch/splash-screen/migrate

## Google sign-in from the app

**The relay page:**

- The app starts Google sign-in at `https://sellio.apptelier.sg/google-signin?to=<Supabase authorize address>`, so the wrapper's "Open External Link?" box names sellio.apptelier.sg.
- The script at the top of `index.html` forwards the browser at once, before the app's code loads. It forwards only to Sellio's own Supabase Google authorize address, and only when:
  - the request uses a PKCE S256 challenge;
  - the return address is Sellio's Android sign-in return (`sellio_mobile_oauth=1` on sellio.apptelier.sg or selliosg.base44.app).
- Anything else stays on the page, which says the link isn't valid.
- The same rules are in `src/lib/googleRelay.js`.

**What you can't change from web code:**

- The box's own wording is drawn by the Base44 wrapper.
- The Chrome tab left behind after Google hands back to the app is also native: the wrapper opens sign-in as an ordinary Chrome tab.
- A web page cannot close a tab it did not open.
- Opening sign-in in an in-app browser sheet (Custom Tab) is a wrapper change.

**The hint:** in the app, a line under the Google buttons on Auth and Join reads "Google sign-in opens in your browser, then brings you back here."

**Google's return:**

- Google still returns to `https://selliosg.base44.app/Auth?sellio_mobile_oauth=1&…`, which version 13 opens in the app automatically (verified App Link).
- See android-google-signin.md.

## Verification

- `node --test verification/mobile-oauth.test.mjs` and `node verification/mobile-oauth.dom.mjs`. The DOM checks expect:
  - the relay address;
  - the page loader while the session check is pending.
- In sellio-security, tests/20:
  - launch timelines in a production build, with the native bridge simulated, signed out and signed in. Every frame Chrome paints is checked: splash from the first frame until the fade, then the first screen;
  - the website loader;
  - the relay rules in `index.html` and `googleRelay.js`, including a real supabase-js authorize address;
  - the hint;
  - the share link.

These are browser checks, not Android device acceptance.

## Device acceptance still needed

After publishing, on the Play-installed app:

- **Cold launch:**
  - signed out: the Sellio splash, then the login page;
  - signed in: the Sellio splash straight to the Dashboard.
- **Google sign-in:** the box names sellio.apptelier.sg, and sign-in still returns to the app on its own.
- **Other flows:** password recovery and an invite link.
