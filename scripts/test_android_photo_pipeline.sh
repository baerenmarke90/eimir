#!/usr/bin/env bash
# Join actual Android-selected File bytes to the existing real-stack Web flow.
set -euo pipefail
export EIMIR_NATIVE_SELECTED_PHOTO="$PWD/android/native-selected-photo.jpg"
test -s "$EIMIR_NATIVE_SELECTED_PHOTO"
export G2_E2E_API_BASE=http://127.0.0.1:8000
export G2_E2E_EMAIL=native-photo@example.invalid
export G2_E2E_PASSWORD=native-photo-ci-only
export G2_E2E_BOOTSTRAP_TOKEN=native-photo-bootstrap-ci-only-0001
cp .env.example .env
sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=native-photo-ci-only/' .env
printf '\nEIMIR_BOOTSTRAP_TOKEN=%s\n' "$G2_E2E_BOOTSTRAP_TOKEN" >> .env
trap 'docker compose down -v >/dev/null' EXIT
python3 scripts/build_self_hosted_source.py --env-file .env
docker compose up -d --wait --wait-timeout 300
payload=$(jq -nc --arg email "$G2_E2E_EMAIL" --arg password "$G2_E2E_PASSWORD" \
  --arg bootstrap "$G2_E2E_BOOTSTRAP_TOKEN" \
  '{displayName:"Native photo fixture",email:$email,password:$password,bootstrapToken:$bootstrap,deviceName:"CI setup",platform:"ci"}')
response=$(curl --fail-with-body --silent --show-error -H 'Content-Type: application/json' \
  -d "$payload" "$G2_E2E_API_BASE/api/v1/auth/register")
account_id=$(jq -r '.account.id // empty' <<< "$response")
# The value comes from the real API; validate before inserting it into SQL.
[[ "$account_id" =~ ^[0-9a-fA-F-]{36}$ ]]
G2_E2E_SPACE_ID=$(docker compose exec -T postgres psql -U eimir -d eimir -Atc \
  "select space_id from memberships where account_id = '$account_id' and status = 'ACTIVE' limit 1;")
export G2_E2E_SPACE_ID
test -n "$G2_E2E_SPACE_ID"
(cd web && npm test -- src/client/selectedPhotoLocation.e2e.test.ts --reporter=default) \
  | tee android/native-photo-pipeline.log
python3 - <<'PY'
import re
from pathlib import Path
text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", Path('android/native-photo-pipeline.log').read_text())
if not re.search(r"Tests\s+1 passed", text) or re.search(r"Tests\s+.*skipped", text, re.I):
    raise SystemExit('Native-selected real pipeline test did not pass exactly once without skipping.')
print('Foreign photo -> Android File -> production Web upload -> real worker -> canonical Place: passed.')
PY
