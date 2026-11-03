#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo="${1:-DiasIsenov06/ShopKZ}"
command -v gh >/dev/null || { echo 'GitHub CLI (gh) қажет'; exit 1; }
gh auth status
gh api --method PUT "repos/$repo/branches/main/protection" --input .github/branch-protection.json > /dev/null
gh api "repos/$repo/branches/main/protection" > verification/lab10/branch-protection-applied.json
echo 'main protection applied; evidence saved.'
