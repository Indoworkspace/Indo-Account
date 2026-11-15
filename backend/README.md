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
```

The Lambda execution role also needs `ses:SendEmail` for the verified
`eyemail.in` SES identity. SES production access is required before sending to
unverified recipient addresses.

