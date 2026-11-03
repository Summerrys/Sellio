#!/usr/bin/env bash
# What an APK is: package, version, permissions and signing certificate (the SHA-1 and
# SHA-256 that Google Cloud and Play Console ask for). Fails if the package or version code
# isn't what this build should make, if the home-screen entry isn't the alias
# com.wix.MainActivity (the name Base44's build used), or if the sellio.sg sign-in links
# aren't set to open the app.
set -euo pipefail
APK="$1"
BUILD_TOOLS="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
BADGING="$RUNNER_TEMP/badging.txt"
MANIFEST="$RUNNER_TEMP/manifest.txt"
"$BUILD_TOOLS/aapt2" dump badging "$APK" > "$BADGING"
"$BUILD_TOOLS/aapt2" dump xmltree --file AndroidManifest.xml "$APK" > "$MANIFEST"
grep -E "^(package|sdkVersion|targetSdkVersion|application-label|uses-permission):" "$BADGING"
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
sys.exit(0 if launcher and links else 1)
PY
SIGNING="$RUNNER_TEMP/signing.txt"
if ! "$BUILD_TOOLS/apksigner" verify --print-certs "$APK" > "$SIGNING" 2>&1; then
  cat "$SIGNING"; echo "::error::apksigner could not verify $APK"; exit 1
fi
grep -E "certificate (DN|SHA-256 digest|SHA-1 digest)" "$SIGNING" || cat "$SIGNING"
