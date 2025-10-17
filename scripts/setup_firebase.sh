#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   FIREBASE_TOKEN=ya29... PROJECT_ID=my-ecom DISPLAY_NAME="My Ecom" WEBAPP_NAME="Ecom Web" bash scripts/setup_firebase.sh
#
# Requires: firebase-tools installed and FIREBASE_TOKEN (from `firebase login:ci`) or interactive login.

command -v firebase >/dev/null 2>&1 || {
  echo "firebase-tools not found. Install: npm i -g firebase-tools"
  exit 1
}

: "${WEBAPP_NAME:=Ecom Web}"

if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
  TOKEN_ARGS=("--token" "$FIREBASE_TOKEN")
else
  TOKEN_ARGS=()
  echo "No FIREBASE_TOKEN provided. The script may prompt for interactive login."
fi

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "PROJECT_ID is required." >&2
  exit 1
fi

DISPLAY_NAME="${DISPLAY_NAME:-$PROJECT_ID}"

echo "Ensuring Firebase project '$PROJECT_ID' exists ..."
set +e
firebase "${TOKEN_ARGS[@]}" projects:create "$PROJECT_ID" --display-name "$DISPLAY_NAME"
set -e

echo "Selecting project ..."
firebase "${TOKEN_ARGS[@]}" use "$PROJECT_ID"

echo "Creating web app '$WEBAPP_NAME' (idempotent) ..."
set +e
firebase "${TOKEN_ARGS[@]}" apps:create web "$WEBAPP_NAME" --project "$PROJECT_ID"
set -e

echo "SDK config (copy into .env.local as VITE_FIREBASE_*)"
firebase "${TOKEN_ARGS[@]}" apps:sdkconfig web --project "$PROJECT_ID"

echo "Done. Optionally deploy Firestore rules later: firebase deploy --only firestore:rules"

