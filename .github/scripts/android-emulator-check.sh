#!/usr/bin/env bash
# Runs on the emulator from .github/workflows/android.yml. Screenshots and logs go to
# android-emulator-check/ (the workflow's "android-emulator-check" download).
set -uo pipefail
PKG=com.base6985959ce9aaceadb8b7cc41.app
OUT=android-emulator-check
mkdir -p "$OUT"
# A cold emulator's launcher sometimes shows "isn't responding"; close such boxes first.
calm() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true; }
shot() { calm; sleep 1; adb exec-out screencap -p > "$OUT/$1.png"; }
focus() { adb shell dumpsys window | grep -m1 -E "mCurrentFocus" > "$OUT/$1-focus.txt"; cat "$OUT/$1-focus.txt"; }

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell input keyevent KEYCODE_HOME
sleep 20
calm
adb logcat -c

# 1. Opens from its home-screen entry (com.wix.MainActivity, the name Base44's build used).
adb shell am start -W -n "$PKG/com.wix.MainActivity"
sleep 25
shot 1-opened
focus 1-opened

# 2. Back on the app's first page leaves the app.
calm
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

# 4. Tapping a push alert while the app is open opens the alert's page (Firebase hands the
#    alert's data to the app as these extras; pushNotifications.js openAlert).
adb shell am start -W -n "$PKG/com.wix.MainActivity" \
  --es google.message_id 0:sellio-check-1 --es type new_order --es link /Notifications \
  --es notification_id 00000000-0000-0000-0000-000000000000
sleep 12
shot 4-alert-tapped
focus 4-alert-tapped

# 5. The same with the app closed: it starts and opens the alert's page.
adb shell am force-stop "$PKG"
sleep 2
adb shell am start -W -n "$PKG/com.wix.MainActivity" \
  --es google.message_id 0:sellio-check-2 --es type new_order --es link /Notifications \
  --es notification_id 00000000-0000-0000-0000-000000000000
sleep 25
shot 5-alert-tapped-closed
focus 5-alert-tapped-closed

# 6. Pull to refresh: a finger dragged down from near the top of the sign-in page refreshes it
#    (the page logs "Sellio refresh: refreshing"). A real touch, as on a phone: the web view
#    decides when the finger lands whether the page may hold its moves (PullToRefresh.jsx).
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://sellio.sg/Auth" "$PKG"
sleep 15
read -r W H < <(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | tr 'x' ' ')
adb shell input swipe $((W / 2)) $((H * 18 / 100)) $((W / 2)) $((H * 60 / 100)) 2500 &
sleep 1.8
adb exec-out screencap -p > "$OUT/6-pulling.png"
wait
sleep 4

adb shell pm get-app-links "$PKG" > "$OUT/app-links.txt" 2>&1
adb shell dumpsys notification > "$OUT/notification-dump.txt" 2>&1 || true
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "Capacitor|chromium|AndroidRuntime|SystemBars" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
echo "--- push alerts: the app's channels, Firebase, and the two tapped alerts (expect: 3 channels, ready, 2 openings)"
grep -oE "NotificationChannel\{mId='(orders|messages|updates)', mName=[^,]*" "$OUT/notification-dump.txt" | sort -u || echo "(no Sellio channels found)"
grep -E "Sellio push:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio push:[^"]*).*/\1/' || echo "(no push lines)"
echo "--- pull to refresh (expect: refreshing, and no 'could not be held')"
grep -E "Sellio refresh:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio refresh:[^"]*).*/\1/' || echo "(no refresh lines)"
echo "--- app console and crashes"
grep -E "Capacitor/Console|Uncaught|FATAL|AndroidRuntime" "$OUT/logcat-full.txt" | tail -60 || true

# The three screenshots side by side, small, also in the log (base64 JPEG between the markers),
# for reading without the download.
python3 -m pip install --quiet --disable-pip-version-check pillow > /dev/null 2>&1 || true
python3 - "$OUT" <<'PY' || true
import base64, io, sys
from pathlib import Path
from PIL import Image
out = Path(sys.argv[1])
shots = [Image.open(p).convert('RGB') for p in sorted(out.glob('*.png'))]
if shots:
    w = 360
    shots = [s.resize((w, round(s.height * w / s.width))) for s in shots]
    sheet = Image.new('RGB', (w * len(shots) + 10 * (len(shots) - 1), max(s.height for s in shots)), (60, 60, 60))
    for i, s in enumerate(shots):
        sheet.paste(s, (i * (w + 10), 0))
    buf = io.BytesIO()
    sheet.save(buf, 'JPEG', quality=70)
    print('SCREENSHOTS-BASE64-BEGIN')
    data = base64.b64encode(buf.getvalue()).decode()
    for i in range(0, len(data), 4000):
        print(data[i:i + 4000])
    print('SCREENSHOTS-BASE64-END')
PY
exit 0
