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
adb logcat -G 16M > /dev/null 2>&1 || true # room for the whole run's lines
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

# 6. Pull to refresh, the app's own (SellioRefreshLayout): a finger dragged down from near the top
#    of the sign-in page brings out Sellio's honeycomb (6-pulling.png) and refreshes the page
#    (the app logs "SellioRefresh: pulled: refreshing", the page "Sellio refresh: refreshing").
#    A real touch, as on a phone: as the finger lands, the page tells the app whether it may
#    pull there (PullToRefresh.jsx), and the app waits for that answer.
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://sellio.sg/Auth" "$PKG"
sleep 15
read -r W H < <(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | tr 'x' ' ')
adb shell input swipe $((W / 2)) $((H * 18 / 100)) $((W / 2)) $((H * 60 / 100)) 2500 &
sleep 1.8
adb exec-out screencap -p > "$OUT/6-pulling.png"
wait
sleep 4

# 7. Live updates (src/lib/liveUpdates.js), end to end on this debug build. This computer serves
#    a test manifest and zip (made with scripts/app-update.mjs's own zip writer), reached from
#    the emulator as localhost:8099 (adb reverse; debug builds allow plain http to localhost).
#    A debug build takes ?sellio_update_manifest=<address> to test with it.
#    a. A good update downloads, and the next start switches to it ("running <version>").
#    b. A broken one (its page never starts) is switched to, and the updater goes back by itself.
#    c. Checked again, the broken one isn't downloaded again.
LU="$RUNNER_TEMP/live-update"
rm -rf "$LU" && mkdir -p "$LU/www"
GOOD="e2egood${GITHUB_RUN_ID:-0}"
BROKEN="e2ebroken${GITHUB_RUN_ID:-0}"
cp -R dist-app "$LU/good"
cp -R dist-app "$LU/broken"
printf '<!doctype html><title>broken</title><p>This test update never starts.</p>\n' > "$LU/broken/index.html"
node .github/scripts/live-update-test-bundles.mjs "$LU" "$GOOD" "$BROKEN"
cp "$LU/good.json" "$LU/www/manifest.json"
python3 .github/scripts/live-update-test-server.py "$LU/www" 8099 2> "$OUT/live-update-server.txt" &
LU_SERVER=$!
adb reverse tcp:8099 tcp:8099
TEST_LINK="https://sellio.sg/Auth?sellio_update_manifest=http%3A%2F%2Flocalhost%3A8099%2Fmanifest.json"
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$TEST_LINK" "$PKG"
sleep 30
adb shell am force-stop "$PKG"
sleep 2
adb shell am start -W -n "$PKG/com.wix.MainActivity"
sleep 25
shot 7-live-update
cp "$LU/broken.json" "$LU/www/manifest.json"
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$TEST_LINK" "$PKG"
sleep 30
adb shell am force-stop "$PKG"
sleep 2
adb shell am start -W -n "$PKG/com.wix.MainActivity"
sleep 45
shot 8-after-broken-update
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "$TEST_LINK" "$PKG"
sleep 20
kill "$LU_SERVER" 2> /dev/null || true

# 8. No connection (UX states, 4): with the phone's network off, the page hears it (it logs
#    "Sellio network: offline") and shows "You're offline. Reconnecting…" (9-offline.png);
#    with it back, "Sellio network: online" and "Back online" (10-back-online.png). This needs
#    Android to tell the app's WebView about the network (the ACCESS_NETWORK_STATE permission).
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://sellio.sg/Auth" "$PKG"
sleep 15
adb shell cmd connectivity airplane-mode enable > /dev/null 2>&1 || true
adb shell svc wifi disable > /dev/null 2>&1 || true
adb shell svc data disable > /dev/null 2>&1 || true
sleep 10
shot 9-offline
adb shell cmd connectivity airplane-mode disable > /dev/null 2>&1 || true
adb shell svc wifi enable > /dev/null 2>&1 || true
adb shell svc data enable > /dev/null 2>&1 || true
sleep 6
shot 10-back-online
sleep 10

adb shell pm get-app-links "$PKG" > "$OUT/app-links.txt" 2>&1
adb shell dumpsys notification > "$OUT/notification-dump.txt" 2>&1 || true
adb logcat -d > "$OUT/logcat-full.txt"
grep -E "Capacitor|chromium|AndroidRuntime|SystemBars" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
echo "--- push alerts: the app's channels, Firebase, and the two tapped alerts (expect: 3 channels, ready, 2 openings)"
grep -oE "NotificationChannel\{mId='(orders|messages|updates)', mName=[^,]*" "$OUT/notification-dump.txt" | sort -u || echo "(no Sellio channels found)"
grep -E "Sellio push:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio push:[^"]*).*/\1/' || echo "(no push lines)"
echo "--- pull to refresh (expect: the page's answers to the app, the app's 'pulled: refreshing', the page's 'refreshing', one finish)"
grep -E "Sellio refresh:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio refresh:[^"]*).*/\1/' | sort | uniq -c || echo "(no page lines)"
grep -E " (Capacitor/)?SellioRefresh(Plugin)?: " "$OUT/logcat-full.txt" | sed -E 's/.* (Capacitor\/)?SellioRefresh(Plugin)?: //' || echo "(no app lines)"
for m in touch finish; do echo "SellioRefresh.$m calls: $(grep -c "pluginId: SellioRefresh, methodName: $m, methodData" "$OUT/logcat-full.txt")"; done
grep -E "pluginId: SellioRefresh, methodName: touch, methodData" "$OUT/logcat-full.txt" | sed -E 's/.*methodData: //' | tail -3 || true
grep -F "is not implemented on android" "$OUT/logcat-full.txt" | grep -F SellioRefresh | head -2 | cut -c1-200 || true
echo "--- live updates"
seen() { if grep -qF "Sellio update: $1" "$OUT/logcat-full.txt"; then echo "PASS $2"; else echo "FAIL $2 (no \"Sellio update: $1\")"; fi; }
seen "$GOOD is ready" "a. the good update downloaded"
seen "switching to $GOOD" "a. the next start switched to it"
seen "running $GOOD" "a. it started and was confirmed"
seen "switching to $BROKEN" "b. the broken update was switched to"
seen "$BROKEN did not start: back in $GOOD" "b. the updater went back to the good one"
seen "$BROKEN did not start on this phone before" "c. the broken one isn't downloaded again"
grep -E "Sellio update:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio update:[^"]*).*/\1/' || echo "(no update lines)"
echo "--- the updater's own lines about loading and going back"
grep -iE "CapacitorUpdater|Capgo" "$OUT/logcat-full.txt" | grep -iE "success|fail|rollback|reset|timeout|ready" | tail -25 || true
echo "--- the test server (expect the manifest and both zips fetched)"
cat "$OUT/live-update-server.txt" 2> /dev/null | tail -12 || true
echo "--- no connection (expect: the page heard offline, then online)"
if grep -qF "Sellio network: offline" "$OUT/logcat-full.txt"; then echo "PASS the page heard the network go"; else echo "FAIL no \"Sellio network: offline\""; fi
if grep -qF "Sellio network: online" "$OUT/logcat-full.txt"; then echo "PASS the page heard it come back"; else echo "FAIL no \"Sellio network: online\""; fi
grep -E "Sellio network:|Sellio offline:" "$OUT/logcat-full.txt" | sed -E 's/.*(Sellio (network|offline):[^"]*).*/\1/' | uniq -c || echo "(no network lines)"
grep -E "android.permission.ACCESS_NETWORK_STATE" <(adb shell dumpsys package "$PKG" 2> /dev/null) | head -2 || echo "(ACCESS_NETWORK_STATE not granted)"
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
