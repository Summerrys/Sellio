#!/usr/bin/env bash
# Runs on the macOS runner from .github/workflows/ios.yml: installs the simulator build on an
# iPhone simulator, opens it and takes a screenshot (ios-simulator-check/).
set -uo pipefail
APP="$1"
OUT=ios-simulator-check
mkdir -p "$OUT"
DEVICE=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in devices.items() if "iOS" in runtime for d in ds if d["name"].startswith("iPhone 17")]
phones = phones or [d for runtime, ds in devices.items() if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
print(phones[-1]["udid"] if phones else "")')
[ -n "$DEVICE" ] || { echo "No iPhone simulator found"; exit 1; }
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" sg.sellio.app
sleep 30
xcrun simctl io "$DEVICE" screenshot "$OUT/1-opened.png"
xcrun simctl spawn "$DEVICE" log show --last 3m --style compact --predicate 'process == "App"' > "$OUT/app-log.txt" 2>&1 || true
exit 0
