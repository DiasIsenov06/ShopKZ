#!/usr/bin/env bash
# Run from an authenticated local clone of DiasIsenov06/ShopKZ.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo 'Install GitHub CLI first'; exit 1; }
gh auth status
git rev-parse --git-dir >/dev/null
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
[ "$repo" = 'DiasIsenov06/ShopKZ' ] || { echo "Unexpected repository: $repo"; exit 1; }
branch='lab10-cicd-dora'
git switch -c "$branch"
git add .github .gitignore scripts dora docs/lab10 trivy.yaml package.json package-lock.json eslint.config.cjs server.js playwright.config.js README_LAB10_KK.md verification/lab10
if ! git diff --cached --quiet; then
  git commit -m 'Add ShopKZ CI, DORA dashboard and release controls'
fi
git push -u origin "$branch"
gh pr create --base main --head "$branch" --title 'ЗС 10: CI/CD, DORA dashboard and release controls' --body-file docs/lab10/PR_BODY.md
echo 'PR created. Wait for quality/security/build; request an independent review.'
