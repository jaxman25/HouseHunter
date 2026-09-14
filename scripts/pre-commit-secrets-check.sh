#!/usr/bin/env bash
# Pre-commit hook: scan staged files for secrets and credentials.
#
# Install:
#   ln -s ../../scripts/pre-commit-secrets-check.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# What it checks:
#   - AWS access keys (AKIA...)
#   - Google API keys (AIza...)
#   - GitHub tokens (ghp_, gho_, ghs_, ghr_)
#   - Stripe keys (sk_live_, sk_test_, rk_live_, rk_test_)
#   - SendGrid keys (SG...)
#   - Firebase service account keys
#   - Private keys (PEM blocks)
#   - Hardcoded passwords in assignments
#   - Connection strings (mongodb://, postgresql://, mysql://, redis://)
#   - Generic high-entropy secrets in key=value patterns

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Patterns to scan for (case-insensitive)
PATTERNS=(
  # AWS
  'AKIA[0-9A-Z]{16}'
  # Google API keys
  'AIza[0-9A-Za-z_-]{35}'
  # GitHub tokens
  'ghp_[0-9a-zA-Z]{36}'
  'gho_[0-9a-zA-Z]{36}'
  'ghs_[0-9a-zA-Z]{36}'
  'ghr_[0-9a-zA-Z]{36}'
  # Stripe
  'sk_live_[0-9a-zA-Z]{24,}'
  'sk_test_[0-9a-zA-Z]{24,}'
  'rk_live_[0-9a-zA-Z]{24,}'
  'rk_test_[0-9a-zA-Z]{24,}'
  # SendGrid
  'SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'
  # Firebase service account
  '"type"\s*:\s*"service_account"'
  # Private keys
  '-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'
  # Connection strings
  'mongodb(\+srv)?://[^[:space:]]+'
  'postgresql://[^[:space:]]+'
  'mysql://[^[:space:]]+'
  'redis://[^[:space:]]+'
  # Generic secrets in assignments (password, secret, token, apikey)
  '(password|secret|token|api[_-]?key)\s*[:=]\s*["\x27][^"\x27]{8,}["\x27]'
)

# Get staged files (excluding deleted files)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=d 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

FOUND_SECRETS=0

for file in $STAGED_FILES; do
  # Skip binary files and common non-secret files
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.svg|*.woff|*.woff2|*.ttf|*.eot)
      continue
      ;;
    *.lock|package-lock.json|yarn.lock|pnpm-lock.yaml)
      continue
      ;;
    *.min.js|*.min.css)
      continue
      ;;
  esac

  # Skip .env.example files (they have placeholders by design)
  case "$file" in
    *.env.example|*/.env.example)
      continue
      ;;
  esac

  # Skip node_modules and dist
  case "$file" in
    node_modules/*|dist/*|functions/lib/*|.expo/*)
      continue
      ;;
  esac

  for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(grep -n -i -E "$pattern" "$file" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      echo -e "${RED}⚠️  Potential secret found in ${file}:${NC}"
      echo "$MATCHES" | head -5
      echo ""
      FOUND_SECRETS=1
    fi
  done
done

if [ "$FOUND_SECRETS" -eq 1 ]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ Secret detection failed. Commit blocked.${NC}"
  echo ""
  echo -e "${YELLOW}If these are false positives:${NC}"
  echo "  1. Add the file to .gitignore if it contains env vars"
  echo "  2. Use git commit --no-verify to bypass (NOT recommended)"
  echo "  3. Move secrets to .env files (never commit .env)"
  echo "  4. Use Cloud Functions environment for server-side secrets"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
fi

echo -e "✅ No secrets detected in staged files."
exit 0
