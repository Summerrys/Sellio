#!/usr/bin/env bash
# Runs in .github/workflows/android.yml before Gradle. Writes android/app/google-services.json
# (the Firebase project's Android config, for push alerts) from the GOOGLE_SERVICES_JSON_BASE64
# secret, and checks it's for Sellio's app (PKG) and the Firebase project send-push sends
# through (FIREBASE_PROJECT_ID): with another project's file the phones' tokens wouldn't take
# Sellio's alerts. Without the secret the app builds without push alerts (with a warning).
set -euo pipefail
OUT=android/app/google-services.json

if [ -z "${GOOGLE_SERVICES_JSON_BASE64:-}" ]; then
  rm -f "$OUT"
  echo "::warning::GOOGLE_SERVICES_JSON_BASE64 isn't set: this build has no push alerts."
  exit 0
fi

if ! printf '%s' "$GOOGLE_SERVICES_JSON_BASE64" | tr -d ' \r\n' | base64 --decode > "$OUT" 2> /dev/null; then
  rm -f "$OUT"
  echo "::error::GOOGLE_SERVICES_JSON_BASE64 isn't base64 (encode google-services.json with: base64 -i google-services.json)."
  exit 1
fi

python3 - "$OUT" "$PKG" "$FIREBASE_PROJECT_ID" <<'PY' || { rm -f "$OUT"; exit 1; }
import json, sys
path, package, project = sys.argv[1:4]
try:
    data = json.load(open(path))
except Exception as error:
    print(f"::error::GOOGLE_SERVICES_JSON_BASE64 isn't google-services.json in base64 ({error}).")
    sys.exit(1)
found = (data.get('project_info') or {}).get('project_id')
apps = [((c.get('client_info') or {}).get('android_client_info') or {}).get('package_name') for c in data.get('client') or []]
apps = [a for a in apps if a]
print(f"google-services.json: Firebase project {found}; Android apps: {', '.join(apps) or 'none'}")
if package not in apps:
    print(f"::error::google-services.json has no Android app {package}. Add it to the Firebase project, then download google-services.json again.")
    sys.exit(1)
if project and found != project:
    print(f"::error::google-services.json is for the Firebase project {found}, but send-push sends through {project}.")
    sys.exit(1)
print("google-services.json is for Sellio's app and Firebase project: push alerts are in this build.")
PY
