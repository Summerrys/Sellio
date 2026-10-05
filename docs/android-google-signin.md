# Android Google sign-in with Supabase

The Android wrapper opens Google in the external browser. Sellio now starts that flow with Supabase PKCE, keeps the verifier in the originating WebView, and sends a one-use authorization code back to the same origin. The browser callback does not consume a session. It provides a **Return to Sellio** button when Android has not already opened the app.

The app validates its local attempt, exchanges the code, installs the session in the existing Supabase client, clears callback data, and resumes the existing Auth page's profile, staff-role, invitation and onboarding logic. Password sign-in, email recovery, and ordinary browser Google sign-in retain their original client and flow.

## Inspected release

Inspected the user-supplied `android-2.133512.13.aab` without changing it.

| Field | Observed value |
| --- | --- |
| Version code | 13 |
| Version name | 2.133512.0 |
| Package | `com.base6985959ce9aaceadb8b7cc41.app` |
| WebView start origin | `https://selliosg.base44.app` |
| Verified HTTPS App Link host | `selliosg.base44.app` |
| Main activity | `com.wix.MainActivity` |
| AAB signer SHA-256 | `B7:5B:33:41:01:46:16:F1:A3:66:E0:82:60:81:F4:5C:C9:6C:22:08:B6:F7:51:80:A5:30:01:C1:3B:57:1A:1A` |
| Native JavaScript SHA-256 | `bb6751c3117537e1c7bfab2d5faeb4c0bba0d7ac90920bec43d50e89470ec849` |

The manifest has an autoVerify HTTPS VIEW filter with DEFAULT and BROWSABLE categories and no path restriction. Native JavaScript handles both initial and resumed URLs for its packaged host and forwards them to the WebView source. The native Base44-auth interception only matches API authentication paths; it does not intercept this `/Auth` callback.

The inspected wrapper supports the required URL delivery, so this web change does not itself require a regenerated AAB. This is static inspection, not a successful physical-device sign-in. Version 13 does **not** contain an App Link filter for `sellio.apptelier.sg`. A future wrapper that starts at the custom origin needs a corresponding App Link filter for that origin, because its PKCE storage cannot be transferred between origins.

## Redirect and session binding

Version 13 starts at the Base44 origin, so its callback is:

`https://selliosg.base44.app/Auth?sellio_mobile_oauth=1&attempt=<random-nonce>`

A read-only Supabase authorize/cancel probe confirmed that both deployed Sellio origins preserve this callback path and its marker/attempt parameters. No Supabase authentication settings were changed.

The Google authorized redirect URI remains the Supabase provider callback:

`https://gzktuteedbtnaxfdylyu.supabase.co/auth/v1/callback`

This is distinct from Sellio's final redirect-to-app URL. Do not replace Supabase authentication with Base44 authentication to resolve the wrapper return path.

Attempts expire after 10 minutes. Callbacks must match the stored nonce and origin and have the app-held verifier. Access tokens, refresh tokens and the verifier are never added to the browser return URL. Duplicate in-flight callbacks share one exchange; consumed callbacks cannot be replayed. Cancellation and expired links lead to a recoverable sign-in screen.

## Play signing and link verification

The inspected AAB signer matches the website verification fingerprint observed during this work. Google Play may sign installed APKs with a different **app signing certificate**. The AAB certificate alone cannot prove that a Play-installed app's links are verified.

If the app does not open from the return button, check Google Play Console's App integrity > App signing certificate SHA-256 against `https://selliosg.base44.app/.well-known/assetlinks.json`. Base44 exposes the corresponding setting under Publish > Mobile app > Build Stores Files > More > Add Google Play SHA-256. Do not substitute the upload-key certificate for Play's app-signing certificate. Also check Sellio's Android **Open supported links** setting.

## Release and phone verification

1. Publish the updated web app in Base44.
2. On the Play-installed version 13, reload Sellio so the new code is loaded before starting Google sign-in.
3. Sign in using an existing merchant or staff account. Approve opening the browser if the wrapper asks. Complete Google sign-in and, if the browser stays visible, tap **Return to Sellio**.
4. Confirm that Sellio opens and shows the correct account, tenant and existing staff role on Dashboard.
5. Repeat after Android has terminated the app while Google is open. Persistent PKCE state should allow the same pending attempt to finish after a cold launch.
6. Cancel Google sign-in and confirm the app's sign-in button is usable again. A second attempt must work without reusing the previous link.
7. Check a free Google signup and an invitation signup, then verify ordinary browser Google sign-in, password sign-in and password recovery.

No physical Android device or Google account authentication was exercised by the coding agent.

## Automated verification

- `node --test verification/mobile-oauth.test.mjs`: state, link validation, cancellation, duplicate/replay behavior, session handoff, and S256 generation/exchange using the installed Supabase SDK with a mocked network.
- `node verification/mobile-oauth.dom.mjs`: callback UI, separation of browser/app sessions, existing browser transport, and staff/signup routing. Requires jsdom in `/tmp/sellio-verification`; it does not change app dependencies.
- `python3 verification/mobile-oauth-authorize.py`: read-only live authorize/cancel callback acceptance probe. Never authenticates or creates a user.
- Production build and ESLint on changed application files.

The repository-wide lint has existing errors in untouched files. The older mobile verification also has an existing AI-product test expecting a direct fetch although that component uses Supabase functions. Those unrelated baselines were not changed.
