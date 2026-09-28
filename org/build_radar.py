"""data/*.json 전체 → org/radar.html (RADAR 직원 카드 + 보고서). 사용: python org/build_radar.py"""
import base64, json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import os; os.environ.setdefault("DATA_GO_KR_KEY", "-")
from collect import INSTITUTIONS, KEYWORDS_SERVC, MIN_BUDGET, fit

picked, last = {}, None
for f in sorted(pathlib.Path("data").glob("2*.json")):  # 날짜별 보관본 누적, 같은 공고는 최신 차수
    d = json.load(open(f, encoding="utf-8"))
    last = d
    for x in d["items"]:
        if x["bidNtceNo"] not in picked or x["bidNtceOrd"] >= picked[x["bidNtceNo"]]["bidNtceOrd"]:
            picked[x["bidNtceNo"]] = x
items = list(picked.values())
for x in items:  # RADAR 필드가 없는 과거 파일도 같은 기준으로 판정
    x.setdefault("RADAR", "참고" if (x["배정예산"] or MIN_BUDGET) < MIN_BUDGET else "추천")
    x["적합도"], x["적합근거"] = fit(x)  # 기준이 바뀌면 과거 공고도 다시 매긴다
data = {
    "institutions": INSTITUTIONS, "keywords": KEYWORDS_SERVC,
    "items": sorted(items, key=lambda x: (x["RADAR"] == "참고", "상중하".index(x["적합도"]), -(x["배정예산"] or 0))),
    "note": f"누적 {len(items)}건 · 최근 수집 {last['generated_at']} · 마감 지난 공고는 자동으로 숨깁니다 · 사업명을 누르면 나라장터 공고로 이동합니다.",
}
tpl = pathlib.Path(__file__).with_name("radar.tpl.html").read_text(encoding="utf-8")
out = pathlib.Path(__file__).with_name("radar.html")
avatar = "data:image/png;base64," + base64.b64encode(pathlib.Path(__file__).with_name("avatars").joinpath("radar.png").read_bytes()).decode()
out.write_text(tpl.replace("__AVATAR__", avatar).replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")
print(out, len(data["items"]), "건")
