#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JARVIS 입찰공고 수집기 (조달청 나라장터 OpenAPI)
- GitHub Actions 러너에서 실행되며, 34개 질의를 병렬 호출한다.
- 결과를 data/latest.json 및 data/YYYY-MM-DD.json 으로 저장한다.
- Zapier 릴레이를 완전히 대체한다.
"""
import os
import re
import sys
import json
import time
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

import requests

KST = dt.timezone(dt.timedelta(hours=9))

SERVICE_KEY = os.environ.get("DATA_GO_KR_KEY", "").strip()
if not SERVICE_KEY:
    print("::error::DATA_GO_KR_KEY secret이 비어 있습니다.")
    sys.exit(1)

BASE = "http://apis.data.go.kr/1230000/ad/BidPublicInfoService"
EP = {
    "용역": f"{BASE}/getBidPblancListInfoServcPPSSrch",
    "물품": f"{BASE}/getBidPblancListInfoThngPPSSrch",
}

# 집중 10개 기관 (키워드 무관 전량 수집)
INSTITUTIONS = [
    "콘텐츠진흥원",
    "국가유산진흥원",
    "정보통신산업진흥원",
    "연구개발특구진흥재단",
    "광주정보문화산업진흥원",
    "서울경제진흥원",
    "한국출판문화산업진흥원",
    "창업진흥원",
    "중소벤처기업진흥공단",
    "경기콘텐츠진흥원",
]

KEYWORDS_SERVC = ["투자", "상담", "박람회", "전시", "홍보관",
                  "로드쇼", "비즈매칭", "비즈니스매칭", "마켓", "컨퍼런스"]
KEYWORDS_THNG = ["박람회", "전시", "홍보관", "마켓"]

# ── 오탐 제거 규칙 ─────────────────────────────────────────────
RE_FIN = re.compile(r"(증권|주식|펀드|자산운용|채권|여유자금|출자지분)")
RE_COUNSEL = re.compile(r"(입시|진학상담|입학전형|심리상담|복지상담|정신건강|학생상담|가족상담)")
RE_ITSYS = re.compile(r"(시스템|콜센터|챗봇|플랫폼|솔루션|정보화|ERP|앱\s*개발)")
RE_PPP = re.compile(r"(민간투자사업|BTO|BTL|타당성|기술검토|비용산정|적격성|편익\s*추정)")
RE_DISPOSAL = re.compile(r"(폐선|폐기물|불용품|위탁매각|매각)")
RE_TEARDOWN = re.compile(r"(철거|해체)")
RE_EVCHARGE = re.compile(r"(전기차|전기자동차|충전기|충전시설|충전소|분전반|급속충전|완속충전|EV\s*충전)")
RE_ENERGY = re.compile(r"(태양광|발전설비|발전시설|열병합|생태공장|스마트공장|ESS\b)")
RE_FACILITY = re.compile(r"(청소용역|경비용역|시설관리|방역|소독|경관조명|가로등|제설)")

# 행사·전시 본업 신호. 이 신호가 있으면 '철거' 같은 부수 단어만으로는 제외하지 않는다.
RE_EVENT_POS = re.compile(r"(전시회|박람회|홍보관|전시관|기획전|특별전|부스|엑스포|페어|상담회|로드쇼)")


def is_false_positive(title: str, matched_kw: str):
    """오탐이면 (True, 사유), 아니면 (False, None)"""
    positive = bool(RE_EVENT_POS.search(title))

    if RE_EVCHARGE.search(title):
        return True, "전기차 충전설비('전시'↔'전기' 부분일치)"
    if RE_ENERGY.search(title):
        return True, "발전설비·공장구축 건"
    if RE_DISPOSAL.search(title):
        return True, "폐기·매각 건"
    if RE_TEARDOWN.search(title) and not positive:
        return True, "철거·해체 건"
    if RE_FACILITY.search(title):
        return True, "단순 시설관리·청소·경비"
    if matched_kw == "투자":
        if RE_FIN.search(title):
            return True, "금융성 '투자'(증권·펀드 등)"
        if RE_PPP.search(title) and not positive:
            return True, "민자사업 타당성·기술검토 '투자'"
    if matched_kw == "상담":
        if RE_COUNSEL.search(title):
            return True, "입시·심리·복지 '상담'"
        if RE_ITSYS.search(title) and not positive:
            return True, "IT 상담시스템 구축 건"
    return False, None


def build_url(kind: str, param_key: str, param_val: str, bgn: str, end: str) -> str:
    q = {
        "serviceKey": SERVICE_KEY,
        "numOfRows": 100,
        "pageNo": 1,
        "type": "json",
        "inqryDiv": 1,
        "inqryBgnDt": bgn,
        "inqryEndDt": end,
        param_key: param_val,
    }
    return f"{EP[kind]}?{urlencode(q, encoding='utf-8')}"


def fetch(task):
    """단일 질의 실행. 최대 3회 재시도."""
    label, kind, param_key, param_val, bgn, end, reason = task
    url = build_url(kind, param_key, param_val, bgn, end)
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=25)
            r.raise_for_status()
            body = r.json()
            hdr = body.get("response", {}).get("header", {})
            code = hdr.get("resultCode")
            if code not in ("00", "0"):
                last_err = f"resultCode={code} {hdr.get('resultMsg')}"
                time.sleep(1.5)
                continue
            b = body.get("response", {}).get("body", {}) or {}
            items = b.get("items") or []
            if isinstance(items, dict):
                items = items.get("item") or []
            return {
                "label": label, "ok": True, "kind": kind, "reason": reason,
                "param_key": param_key, "param_val": param_val,
                "total": b.get("totalCount", 0), "items": items,
            }
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(1.5)
    return {"label": label, "ok": False, "kind": kind, "reason": reason,
            "param_key": param_key, "param_val": param_val,
            "error": last_err, "items": [], "total": 0}


def decide_window():
    """조회 구간 결정. request.json 의 override 를 우선한다."""
    req = {}
    if os.path.exists("request.json"):
        try:
            req = json.load(open("request.json", encoding="utf-8"))
        except Exception:  # noqa: BLE001
            req = {}
    if req.get("begin") and req.get("end"):
        return req["begin"], req["end"], "request.json override"

    now = dt.datetime.now(KST)
    today = now.date()
    # 월요일이면 지난 금요일부터 3일 소급, 그 외 평일은 전일
    back = 3 if today.weekday() == 0 else 1
    bgn_d = today - dt.timedelta(days=back)
    end_d = today - dt.timedelta(days=1)
    return (bgn_d.strftime("%Y%m%d") + "0000",
            end_d.strftime("%Y%m%d") + "2359",
            f"auto({'월요일 3일 소급' if back == 3 else '전일'})")


def main():
    bgn, end, how = decide_window()
    print(f"[window] {bgn} ~ {end}  ({how})")

    tasks = []
    for inst in INSTITUTIONS:
        tasks.append((f"용역·기관·{inst}", "용역", "dminsttNm", inst, bgn, end, "집중기관"))
        tasks.append((f"물품·기관·{inst}", "물품", "dminsttNm", inst, bgn, end, "집중기관"))
    for kw in KEYWORDS_SERVC:
        tasks.append((f"용역·키워드·{kw}", "용역", "bidNtceNm", kw, bgn, end, "키워드"))
    for kw in KEYWORDS_THNG:
        tasks.append((f"물품·키워드·{kw}", "물품", "bidNtceNm", kw, bgn, end, "키워드"))

    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(fetch, tasks))

    # 집중기관이 dminsttNm 으로 0건이면 ntceInsttNm 으로 보조 조회
    extra = []
    for r in results:
        if r["reason"] == "집중기관" and r["ok"] and not r["items"]:
            extra.append((f"{r['label']}(공고기관)", r["kind"], "ntceInsttNm",
                          r["param_val"], bgn, end, "집중기관"))
    if extra:
        with ThreadPoolExecutor(max_workers=12) as ex:
            results += list(ex.map(fetch, extra))

    failed = [r["label"] for r in results if not r["ok"]]
    print(f"[query] 총 {len(results)}건 · 성공 {len(results)-len(failed)} · 실패 {len(failed)}")
    for r in results:
        if not r["ok"]:
            print(f"  ::warning::실패 {r['label']} — {r.get('error')}")

    # ── 집계 · 중복 제거 · 오탐 제거 ───────────────────────────
    picked, excluded = {}, []
    for r in results:
        for it in r["items"]:
            no = (it.get("bidNtceNo") or "").strip()
            ordv = (it.get("bidNtceOrd") or "000").strip()
            title = (it.get("bidNtceNm") or "").strip()
            if not no or not title:
                continue
            kw = r["param_val"] if r["param_key"] == "bidNtceNm" else ""
            bad, why = is_false_positive(title, kw)
            if bad:
                excluded.append({"공고번호": f"{no}-{ordv}", "사업명": title, "사유": why})
                continue
            rec = {
                "공고번호": f"{no}-{ordv}",
                "bidNtceNo": no,
                "bidNtceOrd": ordv,
                "사업명": title,
                "공고기관": (it.get("ntceInsttNm") or "").strip(),
                "수요기관": (it.get("dminsttNm") or "").strip(),
                "공고일시": (it.get("bidNtceDt") or "").strip(),
                "공고일자": (it.get("bidNtceDt") or "").strip()[:10].replace("/", "-"),
                "배정예산": int(float(it.get("asignBdgtAmt") or 0)) if str(it.get("asignBdgtAmt") or "").strip() else None,
                "입찰마감일시": (it.get("bidClseDt") or "").strip(),
                "구분": r["kind"],
                "수집사유": r["reason"],
                "공고URL": f"https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo={no}&bidPbancOrd={ordv}",
            }
            prev = picked.get(no)
            if prev is None or ordv > prev["bidNtceOrd"]:
                if prev and prev["수집사유"] == "집중기관":
                    rec["수집사유"] = "집중기관"
                picked[no] = rec
            elif prev["수집사유"] == "키워드" and r["reason"] == "집중기관":
                prev["수집사유"] = "집중기관"

    items = sorted(picked.values(),
                   key=lambda x: (x["수집사유"] != "집중기관", -(x["배정예산"] or 0)))

    # 중복 제외 목록 정리
    seen, ded = set(), []
    for e in excluded:
        if e["공고번호"] in seen:
            continue
        seen.add(e["공고번호"])
        ded.append(e)

    out = {
        "generated_at": dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST"),
        "window": {"begin": bgn, "end": end, "how": how},
        "query_stats": {"total": len(results),
                        "ok": len(results) - len(failed),
                        "failed": failed},
        "counts": {"수집": len(items),
                   "집중기관": sum(1 for i in items if i["수집사유"] == "집중기관"),
                   "키워드": sum(1 for i in items if i["수집사유"] == "키워드"),
                   "오탐제외": len(ded)},
        "items": items,
        "excluded": ded,
    }

    os.makedirs("data", exist_ok=True)
    stamp = dt.datetime.now(KST).strftime("%Y-%m-%d")
    for path in ("data/latest.json", f"data/{stamp}.json"):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"[done] 수집 {len(items)}건 (집중기관 {out['counts']['집중기관']} / "
          f"키워드 {out['counts']['키워드']}) · 오탐제외 {len(ded)}건")
    if failed:
        print(f"::warning::실패 질의 {len(failed)}건: {', '.join(failed)}")


if __name__ == "__main__":
    main()
