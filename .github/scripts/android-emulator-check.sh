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
