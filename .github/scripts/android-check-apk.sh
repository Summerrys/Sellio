#!/usr/bin/env bash
# What an APK is: package, version, permissions and signing certificate (the SHA-1 and
# SHA-256 that Google Cloud and Play Console ask for). Fails if the package or version code
# isn't what this build should make, if the home-screen entry isn't the alias
# com.wix.MainActivity (the name Base44's build used), or if the sellio.sg sign-in links
# aren't set to open the app.
set -euo pipefail
APK="$1"
EXPECTED_SHA1="${2:-}" # signed builds: the upload key's SHA-1 as Play shows it (AB:CD:…)
BUILD_TOOLS="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
BADGING="$RUNNER_TEMP/badging.txt"
MANIFEST="$RUNNER_TEMP/manifest.txt"
"$BUILD_TOOLS/aapt2" dump badging "$APK" > "$BADGING"
"$BUILD_TOOLS/aapt2" dump xmltree --file AndroidManifest.xml "$APK" > "$MANIFEST"
grep -E "^(package|sdkVersion|targetSdkVersion|application-label|uses-permission):" "$BADGING"
# Plain http to localhost is for debug builds only (the emulator's live update test).
if [ -n "$EXPECTED_SHA1" ] && grep -q "networkSecurityConfig" "$MANIFEST"; then
  echo "::error::The signed build has a network security config: plain http is for debug builds only."; exit 1
fi
grep -q "^package: name='com.base6985959ce9aaceadb8b7cc41.app' versionCode='${SELLIO_VERSION_CODE}' versionName='2.0'" "$BADGING" \
  || { echo "::error::Unexpected package name or version (expected com.base6985959ce9aaceadb8b7cc41.app, ${SELLIO_VERSION_CODE}, 2.0)"; exit 1; }
python3 - "$MANIFEST" <<'PY'
import re, sys
lines = open(sys.argv[1]).read().splitlines()
def blocks(tag):
    """Each element named `tag`, as the text of its own line and everything nested under it."""
    out = []
    for i, line in enumerate(lines):
        if re.match(r'\s*E: ' + re.escape(tag) + r' ', line):
            depth = len(line) - len(line.lstrip())
            body = [line]
            for nxt in lines[i + 1:]:
                if len(nxt) - len(nxt.lstrip()) <= depth:
                    break
                body.append(nxt)
            out.append('\n'.join(body))
    return out
launcher = [b for b in blocks('activity-alias')
            if '"com.wix.MainActivity"' in b and 'android.intent.action.MAIN' in b
            and 'android.intent.category.LAUNCHER' in b and 'MainActivity' in b.split('targetActivity', 1)[-1]]
links = [b for b in blocks('intent-filter')
         if 'android.intent.action.VIEW' in b and '"sellio.sg"' in b and '"/Auth"' in b and '"/Join"' in b and 'autoVerify' in b]
print('home-screen entry com.wix.MainActivity:', 'ok' if launcher else 'MISSING')
print('sellio.sg /Auth and /Join app links:', 'ok' if links else 'MISSING')

# Permissions as AndroidManifest.xml sets them over the plugins' own: Bluetooth scanning never
# for location (neverForLocation is 0x10000), location only up to Android 11 (API 30).
perms = {}
for b in blocks('uses-permission'):
    name = re.search(r'android:name\([^)]*\)="([^"]+)"', b)
    if name:
        perms[name.group(1)] = b
def has(name, *patterns):
    # aapt2 shows numbers in decimal or hex depending on its version: patterns allow both.
    block = perms.get('android.permission.' + name)
    return bool(block) and all(re.search(p, block) for p in patterns)
checks = {
    'notifications (POST_NOTIFICATIONS)': has('POST_NOTIFICATIONS'),
    'Bluetooth scan, never for location': has('BLUETOOTH_SCAN', r'usesPermissionFlags\([^)]*\)=(?:\(type 0x11\))?(?:0x0*10000|65536)\b'),
    'Bluetooth connect': has('BLUETOOTH_CONNECT'),
    'fine location only up to Android 11': has('ACCESS_FINE_LOCATION', r'maxSdkVersion\([^)]*\)=(?:\(type 0x10\))?(?:0x0*1e|30)\b'),
    'coarse location only up to Android 11': has('ACCESS_COARSE_LOCATION', r'maxSdkVersion\([^)]*\)=(?:\(type 0x10\))?(?:0x0*1e|30)\b'),
}
if not all(checks.values()):
    for name in ('BLUETOOTH_SCAN', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'):
        print(perms.get('android.permission.' + name, f'(no {name})'))
for label, ok in checks.items():
    print(f'{label}:', 'ok' if ok else 'WRONG')
sys.exit(0 if launcher and links and all(checks.values()) else 1)
PY
SIGNING="$RUNNER_TEMP/signing.txt"
if ! "$BUILD_TOOLS/apksigner" verify --print-certs "$APK" > "$SIGNING" 2>&1; then
  cat "$SIGNING"; echo "::error::apksigner could not verify $APK"; exit 1
fi
grep -E "certificate (DN|SHA-256 digest|SHA-1 digest)" "$SIGNING" || cat "$SIGNING"
if [ -n "$EXPECTED_SHA1" ]; then
  WANT=$(printf '%s' "$EXPECTED_SHA1" | tr -d ':' | tr 'A-F' 'a-f')
  GOT=$(grep -m1 -E "certificate SHA-1 digest" "$SIGNING" | awk '{print $NF}')
  [ "$GOT" = "$WANT" ] || { echo "::error::Signed with SHA-1 $GOT, not the upload key Google has on file ($EXPECTED_SHA1)"; exit 1; }
  echo "Signed with the upload key Google has on file."
fi
