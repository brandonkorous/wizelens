#!/usr/bin/env bash
# Reads WizeLens secrets from Key Vault into files for kubectl. Usage: vault-env.sh <vault> <out-dir>
set -euo pipefail
VAULT="$1"; OUT="$2"
umask 077
mkdir -p "$OUT"
: > "$OUT/cloud.env"

# Vault names allow no `_`, so DATABASE_URL is stored as DATABASE-URL.
read_secret() { az keyvault secret show --vault-name "$VAULT" --name "${1//_/-}" --query value -o tsv 2>/dev/null; }

# A missing one of these fails the deploy, because each breaks sign-in or data, not one feature.
required=(DATABASE_URL WIZELENS_CLOUD_AUTH_SECRET WIZELENS_CLOUD_SETUP_TOKEN)
# Each missing one turns off one feature: email (reset, invites, alerts), bounce handling, or OIDC single sign-on.
optional=(WIZELENS_CLOUD_RESEND_API_KEY WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET WIZELENS_CLOUD_SMTP_URL WIZELENS_CLOUD_SSO_ORIGINS)

missing=()
for name in "${required[@]}"; do
  if value=$(read_secret "$name"); then printf '%s=%s\n' "$name" "$value" >> "$OUT/cloud.env"; else missing+=("${name//_/-}"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Missing required secrets in $VAULT: ${missing[*]}. See deploy/README.md."
  exit 1
fi
for name in "${optional[@]}"; do
  if value=$(read_secret "$name"); then printf '%s=%s\n' "$name" "$value" >> "$OUT/cloud.env"; echo "optional secret present: $name"; fi
done

# For the db-role Job only, never the app. printf '%s' keeps out the newline az adds, which psql would reject.
printf '%s' "$(read_secret DATABASE_ADMIN_URL)" > "$OUT/admin-url"
printf '%s' "$(read_secret WIZELENS_APP_PASSWORD)" > "$OUT/app-password"
[ -s "$OUT/admin-url" ] && [ -s "$OUT/app-password" ] || { echo "::error::DATABASE-ADMIN-URL or WIZELENS-APP-PASSWORD missing in $VAULT."; exit 1; }

# The fingerprint that restarts the cloud pod when a secret changes.
sha256sum "$OUT/cloud.env" | cut -c1-16 > "$OUT/env-hash"
