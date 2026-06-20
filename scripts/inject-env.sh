#!/usr/bin/env bash
# Injects values from .env into HTML files for local development.
# Usage: bash scripts/inject-env.sh
# The original placeholders are restored by git checkout when you're done.

set -e

ENV_FILE="$(dirname "$0")/../.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

FILES=("docs/index.html" "landing/index.html")
for f in "${FILES[@]}"; do
  sed -i "s|__SUPABASE_URL__|${SUPABASE_URL}|g" "$f"
  sed -i "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" "$f"
  echo "Injected into $f"
done

echo ""
echo "Done. Run 'git restore docs/index.html landing/index.html' to reset placeholders before committing."
