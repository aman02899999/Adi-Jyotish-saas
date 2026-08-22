#!/usr/bin/env bash
# Starts the Firebase emulator + a production build of the app (most pages are
# `dynamic = "force-dynamic"` and read from Firestore even for public marketing content, so
# Lighthouse needs a real backend behind them, not a bare static server), runs Lighthouse CI
# against a few public URLs, then tears both down regardless of how lhci exits.
set -euo pipefail

FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST
export GCLOUD_PROJECT="demo-jyotish"
export GOOGLE_CLOUD_PROJECT="demo-jyotish"
export NEXT_PUBLIC_USE_EMULATOR="true"
export NEXT_PUBLIC_FIREBASE_API_KEY="demo-key"
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="demo-jyotish.firebaseapp.com"
export NEXT_PUBLIC_FIREBASE_PROJECT_ID="demo-jyotish"
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="demo-jyotish.appspot.com"
export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"
export NEXT_PUBLIC_FIREBASE_APP_ID="1:1234567890:web:abcdef"

EMULATOR_PID=""
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$EMULATOR_PID" ] && kill "$EMULATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_for_port() {
  local port="$1" label="$2" tries=60
  while ! curl -sf "http://127.0.0.1:$port" -o /dev/null 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "Timed out waiting for $label on port $port" >&2
      exit 1
    fi
    sleep 1
  done
}

node_modules/.bin/firebase emulators:start --project=demo-jyotish --only auth,firestore &
EMULATOR_PID=$!
wait_for_port 8080 "Firestore emulator"

npm run build
npm run start &
SERVER_PID=$!
wait_for_port 3000 "Next.js server"

npx lhci autorun
