# Sellio Android startup

## Web changes

Sellio now uses one AppLoader design: full Sellio logo, outlined tagline and branded dots. It paints immediately and remains visible while the destination checks its session or store data. There is no separate small-logo "Loading..." screen, fixed 2.6-second splash timer, logo pulse, or Auth/Join route slide animation.

The native root starts /Auth directly. Existing /Splash links immediately forward to /Auth while preserving search and hash parameters. Browser visitors to / still receive the public landing page. Logo and tagline images are preloaded. Android text scaling remains available on interactive pages; the outlined splash tagline cannot reflow.

Publish these web changes manually in Base44. They do not require a new AAB. Native launch screens are a separate issue.

## Native screens still present in approved version 13

The supplied android-2.133512.13.aab contains:

- base/res/layout/splash.xml: a full-screen ConstraintLayout with a centered ImageView.
- base/res/drawable/branded_logo.png: the native logo asset.
- base/res/drawable/ic_app_icon.png: the packaged icon.
- appColor, splash_color and brandedColor: white.

The first two plain-logo screenshots are consistent with Android's system launch splash followed by the wrapper's own native splash. This attribution is based on the screenshots and static package inspection, not a device recording. Both appear before Sellio's editable React code.

Android 12+ applies a system splash window on cold/warm starts. A native wrapper should use AndroidX SplashScreen, avoid a second independent splash layout, and hand off to the ready WebView with a matching background. If the goal is no visible plain logo, the native starting theme's icon needs a deliberate minimal/transparent treatment; removing web images cannot change it. The system launch window itself still exists.

Base44's available sandbox tools edit web code, not the Android wrapper source or packaged splash layout. The requested removal of native duplicates remains pending a supported Base44 packaging setting or a native-wrapper change by the packager, followed by a new correctly signed AAB. Simply regenerating the same wrapper cannot guarantee that change.

Preserve package com.base6985959ce9aaceadb8b7cc41.app and its Play signing identity when rebuilding. Do not patch/re-sign the supplied AAB as an arbitrary new application.

Android guidance: https://developer.android.com/develop/ui/views/launch/splash-screen/migrate

## OAuth

The user reports that approved version 13 now returns automatically from Google into Sellio. Keep the callback/session handoff and browser Return to Sellio fallback: normal verified App Links bypass the fallback page, while devices that cannot open the app automatically can still recover. No auth migration or Despia integration was performed for this startup change.

## Verification

Production build passed. All 11 OAuth checks and 8 DOM checks passed, including pending session recovery, direct login-form transition, legacy Splash recovery/invite links, callback handling and existing staff/onboarding routing. Changed JavaScript/JSX files have zero ESLint errors; src/App.jsx retains its pre-existing unused MainPage warning. These are code/DOM checks, not Android device acceptance.

## Device acceptance still needed

Check a cold launch and a warm launch on the approved Play build after publishing. The preferred web splash should now yield directly to Auth or the authenticated destination. The two packaged native screens will remain until the native wrapper is changed. Also check a returning staff account, Google sign-up, password recovery, and an invite link.
