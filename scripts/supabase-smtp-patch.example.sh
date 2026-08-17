#!/usr/bin/env bash
# Copiez vers supabase-smtp-patch.local.sh (non versionné), exportez les variables, exécutez.
# Ne commitez jamais de secrets.
#
# Token : https://supabase.com/dashboard/account/tokens
# PROJECT_REF = yyhropmaztlxgttqaiph (Portail paie)

set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Définis SUPABASE_ACCESS_TOKEN}"
: "${PROJECT_REF:?Définis PROJECT_REF (ex. yyhropmaztlxgttqaiph)}"
: "${SMTP_ADMIN_EMAIL:?ex. paie@votre-domaine.fr}"
: "${SMTP_HOST:=smtp-relay.brevo.com}"
: "${SMTP_PORT:=587}"   # doit rester une chaîne pour l'API Management
: "${SMTP_USER:?login SMTP Brevo}"
: "${SMTP_PASS:?clé SMTP Brevo}"
: "${SMTP_SENDER_NAME:=ETIK Paie}"

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg email "$SMTP_ADMIN_EMAIL" \
    --arg host "$SMTP_HOST" \
    --arg port "$SMTP_PORT" \
    --arg user "$SMTP_USER" \
    --arg pass "$SMTP_PASS" \
    --arg name "$SMTP_SENDER_NAME" \
    '{
      external_email_enabled: true,
      mailer_secure_email_change_enabled: true,
      smtp_admin_email: $email,
      smtp_host: $host,
      smtp_port: $port,
      smtp_user: $user,
      smtp_pass: $pass,
      smtp_sender_name: $name
    }')"

echo
echo "OK : vérifiez Authentication → SMTP et Rate limits dans le dashboard Supabase."
