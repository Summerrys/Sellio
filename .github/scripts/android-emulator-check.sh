#!/usr/bin/env bash
# Runs on the emulator from .github/workflows/android.yml. Screenshots and logs go to
# android-emulator-check/ (the workflow's "android-emulator-check" download).
set -uo pipefail
PKG=com.base6985959ce9aaceadb8b7cc41.app
OUT=android-emulator-check
mkdir -p "$OUT"
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
focus() { adb shell dumpsys window | grep -m1 -E "mCurrentFocus" > "$OUT/$1-focus.txt"; cat "$OUT/$1-focus.txt"; }

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c

# 1. Opens from its home-screen entry (com.wix.MainActivity, the name Base44's build used).
adb shell am start -W -n "$PKG/com.wix.MainActivity"
sleep 25
shot 1-opened
focus 1-opened

# 2. Back on the app's first page leaves the app.
adb shell input keyevent KEYCODE_BACK
sleep 3
shot 2-after-back
focus 2-after-back

# 3. A sign-in link, as in an email, opens the app on the sign-in page. (A debug build's
#    links aren't verified for sellio.sg, so the link names the app.)
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://sellio.sg/Auth" "$PKG"
sleep 15
shot 3-sign-in-link
focus 3-sign-in-link

adb shell pm get-app-links "$PKG" > "$OUT/app-links.txt" 2>&1
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "Capacitor|chromium|AndroidRuntime|SystemBars" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
exit 0
