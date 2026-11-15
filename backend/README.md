# Indo Account backend

FastAPI API for `UnifiedAppTable`. AWS credentials stay on Lambda through its
IAM role; they are never placed in the GitHub Pages frontend.

## CloudShell verification

From a checkout of the repository:

```bash
python3 backend/smoke_test.py
```

The script creates one uniquely named test item, verifies create/read/update,
and removes it in a `finally` block.

## Deploy in ap-southeast-2

```bash
cd backend
sam build
PYTHONPATH=.aws-sam/build/IndoAccountApi \
  python3 -c 'from app.main import app; print(app.title)'
sam deploy \
  --stack-name indo-account-api \
  --region ap-southeast-2 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset
```

The template uses the Python 3.13 Lambda runtime so it builds directly in the
current AWS CloudShell environment.

Cross-origin headers are configured once at the Lambda Function URL. They are
not duplicated in FastAPI responses.

Use the `ApiUrl` output as the frontend API base URL. Do not commit AWS access
keys, session credentials, or SMTP secrets.

## Production email OTP

Signup email verification uses Amazon SES and never returns the OTP to the
browser. The Lambda stores only an HMAC digest, attempt count, and expiry in
`UnifiedAppTable`. A successful verification produces a one-time token that is
consumed atomically by account creation.

Required Lambda environment variables:

```text
OTP_FROM_EMAIL=no-reply@eyemail.in
OTP_HASH_SECRET=<at least 32 random bytes; never commit this value>
OTP_TTL_SECONDS=600
OTP_RESEND_SECONDS=60
OTP_VERIFICATION_SECONDS=900
OTP_MAX_ATTEMPTS=5
OTP_RATE_WINDOW_SECONDS=900
OTP_TARGET_WINDOW_LIMIT=3
OTP_TARGET_DAILY_LIMIT=10
OTP_IP_WINDOW_LIMIT=10
OTP_IP_DAILY_LIMIT=50
REQUIRE_SIGNUP_EMAIL_OTP=true
REQUIRE_SENSITIVE_ACTION_OTP=true
REQUIRE_ACCOUNT_DELETE_OTP=true
SUPPORT_TO_EMAIL=<private support inbox receiving authenticated requests>
```

All signup, password-reset, recovery-email and security-action OTP requests use
durable DynamoDB rate limits. Each target is limited to 3 requests per 15
minutes and 10 per day. A source IP is limited to 10 requests per 15 minutes
and 50 per day across all OTP flows. Rate-limit keys contain hashes rather than
email addresses or IP addresses and expire automatically through DynamoDB TTL.

For a zero-downtime rollout, deploy the OTP endpoints with
`REQUIRE_SIGNUP_EMAIL_OTP=false`, publish the matching frontend, and then set
the flag to `true`. When the flag is false, supplied verification tokens are
still validated and consumed; only the legacy no-token signup path remains
temporarily available.

The Lambda execution role also needs `ses:SendEmail` for the verified
`eyemail.in` SES identity. SES production access is required before sending to
unverified recipient addresses.

## Account alerts, secure export, and support

Security emails are best-effort after the related account action succeeds, so
an SES delivery problem never rolls back a password or security change. Sign-in
and account-change preferences are read from `SETTINGS#NOTIFICATIONS`; critical
security alerts remain enabled.

`POST /api/v1/me/export` accepts only a short-lived, single-use
`export_data` verification token. The response is built from DynamoDB and omits
password hashes, bearer-token hashes, OTP challenges, and verification records.

`POST /api/v1/me/support` accepts an authenticated category and message, sends
it to `SUPPORT_TO_EMAIL`, returns a unique reference number, and sends a
confirmation to the verified recovery email.

## Password reset

The public password-reset flow uses the same SES sender and OTP controls as
signup. The request response is intentionally identical for registered and
unknown identifiers, so it does not reveal whether an Indo ID, email address,
or mobile number exists. A correct OTP creates a short-lived, one-time reset
token. Completing the reset atomically changes the password, consumes the
token, records a security event, and revokes every existing session.

