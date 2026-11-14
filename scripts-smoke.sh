#!/usr/bin/env bash
# Usage: [OUT=out-a] ./scripts-smoke.sh steps.json [home_dir]
# Runs the built app headless under Xvfb with a throwaway HOME, executing scripted steps (see runSmokeScript in src/main/index.ts).
set -e
STEPS="$1"; H="${2:-/tmp/cv-smoke-home}"
mkdir -p "$H"
HOME="$H" CV_SMOKE_SCRIPT="$STEPS" timeout 120 xvfb-run -a -s "-screen 0 1440x900x24" ./node_modules/.bin/electron --no-sandbox --disable-gpu "${OUT:-out}/main/index.js" 2>&1 | grep -v -E "dbus|Fontconfig|GLib|viz_main|gpu_init|ui/gl|sandbox_linux|Exiting GPU|libva|ContextResult" || true
