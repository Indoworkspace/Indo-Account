#!/usr/bin/env bash
# Deploy the Indo Account API.
#
# The stack takes OtpHashSecret as a NoEcho parameter, so a plain `sam deploy` fails with
# "Parameters: [OtpHashSecret] must have values". Rather than asking a human to paste a
# secret into a shell, this reads the value already held by the live function and passes it
# straight through. The secret is never printed and never written to disk.
#
# First deploy on a fresh account: there is nothing to read, so pass a new secret in:
#   OTP_HASH_SECRET="$(openssl rand -hex 32)" ./deploy.sh
set -euo pipefail

STACK="${STACK:-indo-account-api}"
REGION="${REGION:-ap-southeast-2}"
FUNCTION="${FUNCTION:-indo-account-api}"

cd "$(dirname "$0")"

secret="${OTP_HASH_SECRET:-}"
if [ -z "$secret" ]; then
  secret="$(aws lambda get-function-configuration \
    --function-name "$FUNCTION" \
    --region "$REGION" \
    --query 'Environment.Variables.OTP_HASH_SECRET' \
    --output text 2>/dev/null || true)"
fi

if [ -z "$secret" ] || [ "$secret" = "None" ]; then
  echo "No OTP hash secret found. Run: OTP_HASH_SECRET=\"\$(openssl rand -hex 32)\" ./deploy.sh" >&2
  exit 1
fi

if [ "${#secret}" -lt 32 ]; then
  echo "The OTP hash secret is shorter than the 32 characters the template requires." >&2
  exit 1
fi

sam build --no-cached
sam deploy \
  --stack-name "$STACK" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --parameter-overrides "OtpHashSecret=$secret"

unset secret

aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION"
aws lambda get-function-configuration --function-name "$FUNCTION" --region "$REGION" \
  --query 'LastModified' --output text
