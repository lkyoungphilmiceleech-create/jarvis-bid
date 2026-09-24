#!/usr/bin/env bash
# 사용법: DATABASE_URL=postgres://... ./db/test/run.sh  (빈 테스트 DB에서 실행)
set -euo pipefail
cd "$(dirname "$0")/.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f test/auth_stub.sql
for f in migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f test/rls_test.sql
