# 배턴 파일 스키마 (investor-relay)

모든 단계 출력은 아래 **공통 봉투(envelope)**를 따른다. 단계별로 `items[]` 안의 필드만 누적된다.
앞 단계 필드를 **삭제하지 않는다**. 덮어쓰지 않는다. 오직 추가한다.

```json
{
  "run_id": "2026-09-01-k-content",
  "stage": "03_cases",
  "generated_at": "2026-09-01T14:00:00+09:00",
  "brief": { "sector": "", "regions": [], "stage_focus": [], "target_count": 40 },
  "items": [],
  "dropped": [{ "id": "", "name": "", "reason": "", "stage": "" }],
  "needs_review": [{ "id": "", "name": "", "question": "" }]
}
```

## 단계별 누적 필드

| 단계 | 추가되는 `items[]` 필드 |
|---|---|
| 1 `01_longlist` | `id`, `name`, `legal_name`, `type`(VC/CVC/PE/AC/공공펀드), `hq`, `website`, `sources[]`, `confidence` |
| 2 `02_classified` | `sectors[]`, `stage[]`, `check_size`, `thesis` |
| 3 `03_cases` | `kr_deals[]`(company, round, date, amount, co_investors[], source, confidence), `kr_intent` |
| 4 `04_people` | `people[]`(name, title, focus, kr_relevance, sources[]) |
| 5 `05_contacts` | `contact[]`(channel, value, source), `preferred_route`, `priority`(A/B/C) |

## 불변 규칙

1. `id`는 1단계에서 `inv-0001` 형식으로 부여하고 끝까지 바꾸지 않는다.
2. 모든 `items[]` 항목은 `sources[]` 최소 1개를 가진다. 없으면 `needs_review`로 이동한다.
3. `confidence`는 `high`(1차 출처) / `med`(주요 매체) / `low`(2차 요약본) 중 하나.
4. 값을 모르면 `null`. 빈 문자열이나 추정치를 넣지 않는다.
5. 제외 항목은 삭제하지 않고 `dropped`에 사유와 함께 남긴다(감사 추적).
