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

