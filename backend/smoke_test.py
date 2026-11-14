"""Run a reversible CRUD test against UnifiedAppTable.

Usage in AWS CloudShell:
    python3 backend/smoke_test.py
"""

from __future__ import annotations

import os
import time
from uuid import uuid4

import boto3


region = os.getenv("AWS_REGION", "ap-southeast-2")
table = boto3.resource("dynamodb", region_name=region).Table(os.getenv("DYNAMODB_TABLE", "UnifiedAppTable"))
test_id = f"SMOKE#{uuid4().hex}"
key = {"PK": test_id, "SK": "CRUD#TEST"}

try:
    table.put_item(Item={**key, "entity_type": "SMOKE_TEST", "value": "created", "ttl": int(time.time()) + 300})
    created = table.get_item(Key=key, ConsistentRead=True).get("Item")
    assert created and created["value"] == "created", "Create/read check failed"

    table.update_item(
        Key=key,
        UpdateExpression="SET #value = :value",
        ExpressionAttributeNames={"#value": "value"},
        ExpressionAttributeValues={":value": "updated"},
    )
    updated = table.get_item(Key=key, ConsistentRead=True).get("Item")
    assert updated and updated["value"] == "updated", "Update check failed"
    print(f"PASS: create, read and update succeeded in {region}.")
finally:
    table.delete_item(Key=key)
    deleted = table.get_item(Key=key, ConsistentRead=True).get("Item")
    assert deleted is None, "Delete check failed"
    print("PASS: test item deleted; no smoke-test data remains.")

