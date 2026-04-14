#!/usr/bin/env bash
# Verify API health after deploy. Usage:
#   API_HOST=https://api.example.com bash scripts/verify-deployment.sh
# Defaults to http://localhost:8080

set -e
API_HOST="${API_HOST:-http://localhost:8080}"
URL="${API_HOST%/}/health"

echo "Checking: $URL"
curl -sfS "$URL"
echo ""
echo "OK: health endpoint responded"
