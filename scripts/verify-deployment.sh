#!/usr/bin/env bash
# Verify API health after deploy. Usage:
#   API_HOST=https://api.example.com bash scripts/verify-deployment.sh
# Defaults to https://microflux-arc.onrender.com

set -e
API_HOST="${API_HOST:-https://microflux-arc.onrender.com}"
URL="${API_HOST%/}/health"

echo "Checking: $URL"
curl -sfS "$URL"
echo ""
echo "OK: health endpoint responded"
