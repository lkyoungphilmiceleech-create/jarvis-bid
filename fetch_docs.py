#!/usr/bin/env python3
"""
DECODER 첨부파일 수집기
- decoder/queue.json 에 오른 공고(RADAR 페이지에서 'DECODER로 이관'한 공고)의
  제안요청서·과업지시서 등 첨부파일을 나라장터 OpenAPI로 찾아 decoder/files/<공고번호>/ 에 받는다.
- 이미 받은 공고(_meta.json 존재)는 건너뛴다.
"""
import os
import re
import sys
import json
import datetime as dt
from urllib.parse import urlencode

import requests

KST = dt.timezone(dt.timedelta(hours=9))
SERVICE_KEY = os.environ.get("DATA_GO_KR_KEY", "").strip()
BASE = "http://apis.data.go.kr/1230000/ad/BidPublicInfoService"
OPS = {"용역": "getBidPblancListInfoServc", "물품": "getBidPblancListInfoThng"}
MAX_BYTES = 50 * 1024 * 1024


def find_notice(no: str, kind: str):
    """공고번호로 공고 1건을 조회한다 (inqryDiv=2: 공고번호 기준)."""
    for k in [kind] + [x for x in OPS if x != kind]:
        q = {"serviceKey": SERVICE_KEY, "numOfRows": 10, "pageNo": 1, "type": "json", "inqryDiv": 2, "bidNtceNo": no}
        r = requests.get(f"{BASE}/{OPS[k]}?{urlencode(q)}", timeout=25)
        r.raise_for_status()
        items = (r.json().get("response", {}).get("body", {}) or {}).get("items") or []
        if isinstance(items, dict):
            items = items.get("item") or []
        if items:
            return max(items, key=lambda x: x.get("bidNtceOrd") or "")
    return None


def safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", name).strip("_")[:120] or "file"


def main():
    if not SERVICE_KEY:
        print("::error::DATA_GO_KR_KEY secret이 비어 있습니다.")
        sys.exit(1)
    queue = json.load(open("decoder/queue.json", encoding="utf-8")) if os.path.exists("decoder/queue.json") else []
    for q in queue:
        no = q["bidNtceNo"]
        folder = f"decoder/files/{no}"
        if os.path.exists(f"{folder}/_meta.json"):
            continue
        os.makedirs(folder, exist_ok=True)
        meta = {"bidNtceNo": no, "사업명": q.get("사업명"), "fetched_at": dt.datetime.now(KST).isoformat(timespec="seconds"), "files": []}
        try:
            it = find_notice(no, q.get("구분") or "용역")
        except Exception as e:  # noqa: BLE001
            print(f"::warning::{no} 공고 조회 실패 — {type(e).__name__}: {str(e).replace(SERVICE_KEY, '***')[:200]}")
            continue  # _meta.json 을 남기지 않아 다음 실행에서 다시 시도
        if not it:
            meta["error"] = "공고번호로 조회되지 않음"
        else:
            for n in range(1, 11):
                url, name = (it.get(f"ntceSpecDocUrl{n}") or "").strip(), (it.get(f"ntceSpecFileNm{n}") or "").strip()
                if not url:
                    continue
                rec = {"name": name or f"첨부{n}", "url": url}
                try:
                    r = requests.get(url, timeout=60, stream=True)
                    r.raise_for_status()
                    path = f"{folder}/{n:02d}_{safe(rec['name'])}"
                    size = 0
                    with open(path, "wb") as f:
                        for chunk in r.iter_content(65536):
                            size += len(chunk)
                            if size > MAX_BYTES:
                                raise ValueError("50MB 초과")
                            f.write(chunk)
                    rec.update(saved=os.path.basename(path), bytes=size)
                except Exception as e:  # noqa: BLE001
                    if "path" in locals() and os.path.exists(path):
                        os.remove(path)
                    rec["error"] = f"{type(e).__name__}: {e}"[:200]
                meta["files"].append(rec)
        with open(f"{folder}/_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        ok = sum(1 for x in meta["files"] if "saved" in x)
        print(f"[{no}] {q.get('사업명')} — 첨부 {ok}/{len(meta['files'])}건 저장 {meta.get('error', '')}")


if __name__ == "__main__":
    main()
