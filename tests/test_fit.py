"""RADAR 적합도 판정 점검: python tests/test_fit.py"""
import os, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
os.environ.setdefault("DATA_GO_KR_KEY", "-")
from collect import fit

cases = {
    ("2026 Global SPP(인도네시아) 및 ATF(싱가포르) 서울관 운영 용역", "집중기관"): "상",
    ("해외전시회 SEMICON JAPAN 2026 공동관 운영 용역(재공고)", "키워드"): "상",
    ("홍콩 코스모프로프 미용 전시회 2026 서울 공동관 장치 시공 용역", "집중기관"): "중",
    ("2027년 동물용의약품산업 해외박람회(VIV ASIA 2027) 한국관 장치 용역 입찰", "키워드"): "하",
    ("2026년 AI바우처 지원사업 실태조사 및 성과분석 용역", "집중기관"): "하",
    ("국립천박물관 상설전시실 진열장 제작 및 설치", "키워드"): "하",
    ("2026년 크리스마스 마켓 운영 대행 용역", "키워드"): "중",
}
for (name, why), want in cases.items():
    got = fit({"사업명": name, "수집사유": why})
    assert got[0] == want, (name, got, want)
print("적합도", len(cases), "건 ✓")
