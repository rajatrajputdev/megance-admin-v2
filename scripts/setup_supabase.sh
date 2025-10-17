#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PROJECT_REF=your-ref BUCKET_NAME=product-images bash scripts/setup_supabase.sh
# Or create a project first:
#   ORG_ID=org_xxx PROJECT_NAME=my-ecom REGION=us-east-1 bash scripts/setup_supabase.sh
#
# Auth:
#   Export SUPABASE_ACCESS_TOKEN (preferred) or run `supabase login` interactively.

command -v supabase >/dev/null 2>&1 || {
  echo "supabase CLI not found. Install:"
  echo "  macOS: brew install supabase/tap/supabase"
  echo "  Linux: curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz && sudo mv supabase /usr/local/bin"
  exit 1
}

: "${BUCKET_NAME:=product-images}"
: "${REGION:=us-east-1}"

PROJECT_REF="${PROJECT_REF:-}"
ORG_ID="${ORG_ID:-}"
PROJECT_NAME="${PROJECT_NAME:-}"

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  export SUPABASE_ACCESS_TOKEN
fi

if [[ -z "$PROJECT_REF" ]]; then
  if [[ -z "$ORG_ID" || -z "$PROJECT_NAME" ]]; then
    echo "Either set PROJECT_REF for an existing project, or provide ORG_ID and PROJECT_NAME to create one."
    exit 1
  fi
  echo "Creating Supabase project '$PROJECT_NAME' in $REGION under org $ORG_ID ..."
  supabase projects create "$PROJECT_NAME" --org-id "$ORG_ID" --region "$REGION" --wait
  echo "Fetching project ref ..."
  PROJECT_REF=$(supabase projects list --json | jq -r ".[] | select(.name==\"$PROJECT_NAME\").ref")
  if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == "null" ]]; then
    echo "Failed to resolve project ref. Please check 'supabase projects list'." >&2
    exit 1
  fi
fi

echo "Using project ref: $PROJECT_REF"

echo "Creating bucket '$BUCKET_NAME' (public) ..."
set +e
supabase storage create-bucket "$BUCKET_NAME" --public --project-ref "$PROJECT_REF"
rc=$?
set -e
if [[ $rc -ne 0 ]]; then
  echo "Bucket may already exist, continuing."
fi

echo "Listing buckets:"
supabase storage list-buckets --project-ref "$PROJECT_REF"

echo "Done. Configure env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Dashboard → Settings → API."

