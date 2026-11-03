#!/usr/bin/env bash
# What an APK is: package, version, home-screen entry, permissions and signing certificate
# (the SHA-1 and SHA-256 that Google Cloud and Play Console ask for). Fails if the package,
# version code or home-screen entry isn't what this build should make.
set -euo pipefail
APK="$1"
BUILD_TOOLS="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
BADGING="$RUNNER_TEMP/badging.txt"
"$BUILD_TOOLS/aapt2" dump badging "$APK" > "$BADGING"
grep -E "^(package|sdkVersion|targetSdkVersion|application-label|launchable-activity|uses-permission):" "$BADGING"
grep -q "^package: name='com.base6985959ce9aaceadb8b7cc41.app' versionCode='${SELLIO_VERSION_CODE}' versionName='2.0'" "$BADGING" \
  || { echo "::error::Unexpected package name or version (expected com.base6985959ce9aaceadb8b7cc41.app, ${SELLIO_VERSION_CODE}, 2.0)"; exit 1; }
grep -q "^launchable-activity: name='com.wix.MainActivity'" "$BADGING" \
  || { echo "::error::The home-screen entry isn't com.wix.MainActivity"; exit 1; }
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK" | grep -E "^Signer #1 certificate (DN|SHA-256 digest|SHA-1 digest)"
