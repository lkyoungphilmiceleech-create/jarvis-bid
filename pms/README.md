# MICELEECH PMS

공공기관 입찰용역 수행 전용 프로젝트 관리 시스템. 설계는 [`../docs/pms/00_설계안.md`](../docs/pms/00_설계안.md).

## 구성 (진행 중)

| 경로 | 내용 |
|---|---|
| `src/lib/money.ts` | 정산 장부 금액 규칙 (과세 총액 → 공급가액·부가세 자동 분리) |
| `src/lib/cardSheet.ts` | 법인카드 공용 시트 → 장부 변환 (열 인식, 프로젝트 별칭, 오류 보고) |
| `db/migrations/` | PostgreSQL(Supabase) 스키마·권한(RLS). 스키마 변경은 새 번호 파일로만 추가 |
| `db/test/` | 로컬 auth 스텁 + 권한 검증 스크립트 |
| `db/seed/` | 파일럿(KOCCA 해외마켓) 구조, 최초 관리자 지정 |

## 검증

```bash
npm ci && npm run typecheck && npm test
DATABASE_URL=postgres:///pms_test ./db/test/run.sh   # 빈 DB에서
```

CI: `.github/workflows/pms-ci.yml` — `pms/**` 변경 시 자동 실행.
