"""data/*.json → org/radar.html (RADAR 직원 카드 + 보고서). 사용: python org/build_radar.py [data/파일.json]"""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import os; os.environ.setdefault("DATA_GO_KR_KEY", "-")
from collect import INSTITUTIONS, KEYWORDS_SERVC, MIN_BUDGET

src = sys.argv[1] if len(sys.argv) > 1 else "data/latest.json"
d = json.load(open(src, encoding="utf-8"))
for x in d["items"]:  # RADAR 필드가 없는 과거 파일도 같은 기준으로 판정
    x.setdefault("RADAR", "참고" if (x["배정예산"] or MIN_BUDGET) < MIN_BUDGET else "추천")
w = d["window"]
data = {
    "institutions": INSTITUTIONS, "keywords": KEYWORDS_SERVC, "excluded": len(d["excluded"]),
    "items": sorted(d["items"], key=lambda x: (x["RADAR"] == "참고", x["수집사유"] != "집중기관", -(x["배정예산"] or 0))),
    "note": f"공고 게시일 {w['begin'][:4]}.{w['begin'][4:6]}.{w['begin'][6:8]} 기준 · {d['generated_at']} 수집 · 사업명을 누르면 나라장터 공고로 이동합니다.",
}
tpl = pathlib.Path(__file__).with_name("radar.tpl.html").read_text(encoding="utf-8")
out = pathlib.Path(__file__).with_name("radar.html")
out.write_text(tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")
print(out, len(data["items"]), "건")
