"""ATLAS 동향 브리핑·심층 리포트(JSON) → 공공기관 제출용 보고서 HWPX + PDF.
사용: python org/atlas_report.py <브리핑.json>  → atlas/reports/<날짜>.hwpx / .pdf
      python org/atlas_report.py <리포트.json>  → atlas/reports/deep/<날짜>.hwpx / .pdf (섹션·차트가 있는 심층 리포트)
JSON은 ATLAS 리서치실 db의 briefs/<날짜> 또는 reports/<날짜> 문서(data 부분 또는 {id, data} 형태 모두 받음)."""
import collections
import html
import json
import os
import pathlib
import subprocess
import sys

from hwpx.document import HwpxDocument

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDS = ["콘텐츠", "출판", "과학기술", "공통"]
KO = "가나다라마바사"
CSS = """@page{size:A4;margin:18mm 16mm}body{font-family:"IBM Plex Sans KR","Noto Sans CJK KR","WenQuanYi Zen Hei",sans-serif;font-size:10pt;line-height:1.6;color:#14202a}
h1{font-size:17pt;margin:0 0 10px;border-bottom:2px solid #1d3a5f;padding-bottom:6px}h1 small{font-size:11pt;color:#556}h2{font-size:12.5pt;margin:16px 0 6px;color:#1d3a5f;break-after:avoid}
table{width:100%;border-collapse:collapse;margin:6px 0;font-size:9pt}th,td{border:1px solid #b9c3cf;padding:4px 6px;vertical-align:top;text-align:left;word-break:break-all}th{background:#e9eef5;white-space:nowrap}
tr{break-inside:avoid}.meta th{width:80px}p{margin:3px 0}.ind{font-weight:700;margin-top:8px}.sub{padding-left:14px}.src{padding-left:14px;color:#556;font-size:9pt}"""


def sections(b):
    """(제목, 블록들). 블록: ("p", 문장) | ("table", 머리행, 행들)"""
    items = b["항목"]
    by_ind = [(i, [x for x in items if x.get("산업") == i]) for i in INDS]
    by_nat = collections.defaultdict(list)
    for x in items:
        by_nat[x.get("국가") or x.get("권역") or "기타"].append(x)
    body = []
    for k, (ind, xs) in enumerate([t for t in by_ind if t[1]]):
        body.append(("p", f"{KO[k]}. {ind} 분야"))
        for x in xs:
            body.append(("p", f"  ◦ [{x.get('국가') or x.get('권역', '')}] {x['제목']}"))
            body.append(("p", f"    - {x['요약']}"))
            if x.get("시사점"):
                body.append(("p", f"    - (시사점) {x['시사점']}"))
            body.append(("p", f"    ※ 출처: {x.get('출처명', '')}, {x.get('발행일', '')}"))
    return [
        ("핵심 요약", [("p", f"  ◦ {h}") for h in b.get("헤드라인", [])]),
        ("분야별 주요 동향", body),
        ("국가·권역별 동향 현황", [("table", ["국가·권역", "건수", "주요 내용"],
                                [(n, str(len(xs)), " / ".join(x["제목"] for x in xs)) for n, xs in sorted(by_nat.items(), key=lambda t: -len(t[1]))])]),
        ("시사점 및 사업 활용 방안", [("p", f"  ◦ {t}") for t in b.get("제안서활용", [])]),
        ("참고 자료", [("table", ["번호", "출처", "발행일", "제목", "URL"],
                    [(str(i), x.get("출처명", ""), x.get("발행일", ""), x["제목"], x.get("URL", "")) for i, x in enumerate(items, 1)])]),
    ]


def meta(b):
    nats = [n for n, _ in collections.Counter(x.get("국가") or x.get("권역") for x in b["항목"]).most_common() if n]
    return [("보고 일자", b["날짜"]), ("작    성", "제안서 준비 본부 산업 국제 동향 리서치팀 (ATLAS)"),
            ("조사 범위", "콘텐츠·출판·과학기술 분야 국내외 정책·시장·투자·유통 동향"),
            ("대상 국가", ", ".join(nats[:10])), ("수록 건수", f"{len(b['항목'])}건 (모든 항목 출처 표기)")]


def build_hwpx(b, out):
    doc = HwpxDocument.new()
    for para in list(doc.paragraphs):
        try:
            para.remove()
        except Exception:  # noqa: BLE001
            pass
    doc.add_paragraph(f"「해외 산업 동향 보고」 {b['날짜']}")
    doc.add_paragraph("")
    m = meta(b)
    t = doc.add_table(len(m), 2)
    for r, (k, v) in enumerate(m):
        t.set_cell_text(r, 0, k)
        t.set_cell_text(r, 1, v)
    t.set_column_widths([9000, 33000])
    for n, (title, blocks) in enumerate(sections(b), 1):
        doc.add_paragraph("")
        doc.add_paragraph(f"{n}. {title}")
        for blk in blocks:
            if blk[0] == "p":
                doc.add_paragraph(blk[1])
            else:
                head, rows = blk[1], blk[2]
                tb = doc.add_table(len(rows) + 1, len(head))
                for j, h in enumerate(head):
                    tb.set_cell_text(0, j, h)
                for i, row in enumerate(rows, 1):
                    for j, v in enumerate(row):
                        tb.set_cell_text(i, j, v, split_paragraphs=True)
    doc.save_to_path(str(out))
    issues = HwpxDocument.open(str(out)).validate().issues
    if issues:
        raise SystemExit(f"HWPX 검증 실패: {issues}")


def build_html(b):
    e = html.escape
    parts = [f"<h1>해외 산업 동향 보고 <small>{e(b['날짜'])}</small></h1><table class='meta'>"
             + "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in meta(b)) + "</table>"]
    for n, (title, blocks) in enumerate(sections(b), 1):
        parts.append(f"<h2>{n}. {e(title)}</h2>")
        for blk in blocks:
            if blk[0] == "p":
                s = blk[1].strip()
                cls = " class='src'" if s.startswith("※") else " class='sub'" if s.startswith("-") else " class='ind'" if s[:2] in {f"{k}." for k in KO} else ""
                parts.append(f"<p{cls}>{e(s)}</p>")
            else:
                parts.append("<table><tr>" + "".join(f"<th>{e(h)}</th>" for h in blk[1]) + "</tr>"
                             + "".join("<tr>" + "".join(f"<td>{e(v)}</td>" for v in row) + "</tr>" for row in blk[2]) + "</table>")

    return f"<!doctype html><meta charset='utf-8'><style>{CSS}</style>" + "".join(parts)


def num(v):
    return f"{float(v):,.2f}".rstrip("0").rstrip(".")


def deep_sections(r):
    """심층 리포트 → (제목, 블록들). 블록: ("p", 문장) | ("table", 머리행, 행들) | ("chart", 차트)"""
    out = [("핵심 요약", [("p", f"  ◦ {h}") for h in r.get("핵심요약", [])])]
    if r.get("차트"):
        out.append(("주요 수치", [b for c in r["차트"] for b in (("p", f"  ◦ {c['제목']}" + (f" (단위: {c['단위']})" if c.get("단위") else "")), ("chart", c),
                                                             ("p", f"    ※ 출처: {c.get('출처명', '')}{', 기준 ' + c['기준'] if c.get('기준') else ''}"))]))
    for sec in r.get("섹션", []):
        out.append((sec["제목"].lstrip("0123456789. "), [("p", f"  ◦ {t}") for t in sec.get("문단", [])]))
    if r.get("사례"):
        out.append(("사례", [("table", ["구분", "기업(국가)", "내용", "성과", "출처"],
                             [(c.get("구분", ""), f"{c.get('기업', '')} ({c.get('국가', '')})", c.get("내용", ""), c.get("성과", ""), c.get("출처명", "")) for c in r["사례"]])]))
    out.append(("마케팅·제안서 활용 방안", [("p", f"  ◦ (마케팅) {t}") for t in r.get("마케팅활용", [])] + [("p", f"  ◦ (제안서) {t}") for t in r.get("제안서활용", [])]))
    out.append(("참고 자료", [("table", ["번호", "유형", "출처", "발행일", "제목", "URL"],
                              [(str(i), x.get("유형", ""), x.get("출처명", ""), x.get("발행일", ""), x.get("제목", ""), x.get("URL", "")) for i, x in enumerate(r.get("참고자료", []), 1)])]))
    return out


def deep_meta(r):
    return [("보고 일자", r["날짜"]), ("작    성", "제안서 준비 본부 산업 국제 동향 리서치팀 (ATLAS)"), ("주    제", r.get("주제", "")),
            ("조사 범위", "국내외 진흥원 백서·컨퍼런스 발표·전문가 SNS·전문지·언론 기사"), ("수록 자료", f"{r.get('자료수', len(r.get('참고자료', [])))}건 (모든 수치·사례 출처 표기)")]


def chart_svg(c):
    d = [x for x in c.get("데이터", []) if isinstance(x.get("값"), (int, float)) or str(x.get("값", "")).replace(".", "", 1).lstrip("-").isdigit()][:12]
    if not d:
        return ""
    e, vs = html.escape, [float(x["값"]) for x in d]
    if c.get("유형") == "line" and len(d) > 1:
        W, H, L, R, T, B = 560, 200, 30, 30, 24, 30
        lo, hi = min(vs), max(vs)
        pad = (hi - lo) * .2 or abs(hi) * .1 or 1
        y0, y1 = lo - pad, hi + pad
        X = lambda i: L + i * (W - L - R) / (len(d) - 1)
        Y = lambda v: T + (1 - (v - y0) / (y1 - y0)) * (H - T - B)
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(vs))
        marks = "".join(f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="4" fill="#1d6fa5"/><text x="{X(i):.1f}" y="{H - 10}" text-anchor="middle">{e(str(x["라벨"]))}</text>'
                        f'<text x="{X(i):.1f}" y="{Y(v) - 9:.1f}" text-anchor="middle" fill="#14202a">{num(v)}</text>' for i, (x, v) in enumerate(zip(d, vs)))
        return f'<svg viewBox="0 0 {W} {H}" class="ch"><line x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}" stroke="#b9c3cf"/><polyline points="{pts}" fill="none" stroke="#1d6fa5" stroke-width="2"/>{marks}</svg>'
    W, L, rh = 560, 170, 26
    mx = max(vs + [0]) or 1
    rows = "".join(f'<text x="{L - 8}" y="{i * rh + 18}" text-anchor="end">{e(str(x["라벨"])[:22])}</text><rect x="{L}" y="{i * rh + 5}" width="{max(2, v / mx * (W - L - 90)):.1f}" height="16" rx="3" fill="#1d6fa5"/>'
                   f'<text x="{L + max(2, v / mx * (W - L - 90)) + 6:.1f}" y="{i * rh + 18}" fill="#14202a">{num(v)}{e(c.get("단위", ""))}</text>' for i, (x, v) in enumerate(zip(d, vs)))
    return f'<svg viewBox="0 0 {W} {len(d) * rh + 8}" class="ch">{rows}</svg>'


def build_hwpx_deep(r, out):
    doc = HwpxDocument.new()
    for para in list(doc.paragraphs):
        try:
            para.remove()
        except Exception:  # noqa: BLE001
            pass
    doc.add_paragraph(f"「{r.get('제목', '해외 마케팅 심층 리포트')}」 {r['날짜']}")
    doc.add_paragraph("")
    m = deep_meta(r)
    t = doc.add_table(len(m), 2)
    for i, (k, v) in enumerate(m):
        t.set_cell_text(i, 0, k)
        t.set_cell_text(i, 1, v)
    t.set_column_widths([9000, 33000])
    for n, (title, blocks) in enumerate(deep_sections(r), 1):
        doc.add_paragraph("")
        doc.add_paragraph(f"{n}. {title}")
        for blk in blocks:
            if blk[0] == "p":
                doc.add_paragraph(blk[1])
            elif blk[0] == "chart":  # 한글 파일에는 차트 대신 수치 표
                c = blk[1]
                tb = doc.add_table(len(c.get("데이터", [])) + 1, 2)
                tb.set_cell_text(0, 0, "항목")
                tb.set_cell_text(0, 1, f"값({c.get('단위', '')})")
                for i, x in enumerate(c.get("데이터", []), 1):
                    tb.set_cell_text(i, 0, str(x.get("라벨", "")))
                    tb.set_cell_text(i, 1, num(x["값"]) if str(x.get("값", "")).replace(".", "", 1).lstrip("-").isdigit() else str(x.get("값", "")))
            else:
                head, rows = blk[1], blk[2]
                tb = doc.add_table(len(rows) + 1, len(head))
                for j, h in enumerate(head):
                    tb.set_cell_text(0, j, h)
                for i, row in enumerate(rows, 1):
                    for j, v in enumerate(row):
                        tb.set_cell_text(i, j, v, split_paragraphs=True)
    doc.save_to_path(str(out))
    issues = HwpxDocument.open(str(out)).validate().issues
    if issues:
        raise SystemExit(f"HWPX 검증 실패: {issues}")


def build_html_deep(r):
    e = html.escape
    parts = [f"<h1>{e(r.get('제목', '해외 마케팅 심층 리포트'))} <small>{e(r['날짜'])}</small></h1><table class='meta'>"
             + "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in deep_meta(r)) + "</table>"]
    for n, (title, blocks) in enumerate(deep_sections(r), 1):
        parts.append(f"<h2>{n}. {e(title)}</h2>")
        for blk in blocks:
            if blk[0] == "p":
                t = blk[1].strip()
                parts.append(f"<p{' class=src' if t.startswith('※') else ''}>{e(t)}</p>")
            elif blk[0] == "chart":
                parts.append(f"<div class='chw'>{chart_svg(blk[1])}</div>")
            else:
                parts.append("<table><tr>" + "".join(f"<th>{e(h)}</th>" for h in blk[1]) + "</tr>"
                             + "".join("<tr>" + "".join(f"<td>{e(v)}</td>" for v in row) + "</tr>" for row in blk[2]) + "</table>")
    return f"<!doctype html><meta charset='utf-8'><style>{CSS}</style>" + "<style>.ch{width:100%;max-width:640px}.ch text{font-size:12px;fill:#556}.chw{break-inside:avoid;margin:4px 0 2px}</style>" + "".join(parts)


def main(src):
    b = json.loads(pathlib.Path(src).read_text(encoding="utf-8"))
    b = b.get("data", b)
    deep = "섹션" in b
    out = ROOT / "atlas" / "reports" / ("deep" if deep else "")
    out.mkdir(parents=True, exist_ok=True)
    hwpx, pdf, tmp = out / f"{b['날짜']}.hwpx", out / f"{b['날짜']}.pdf", out / f"{b['날짜']}.print.html"
    (build_hwpx_deep if deep else build_hwpx)(b, hwpx)
    tmp.write_text((build_html_deep if deep else build_html)(b), encoding="utf-8")
    js = ("const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();"
          f"await p.goto('file://{tmp}');await p.pdf({{path:'{pdf}',format:'A4',printBackground:true}});await b.close();}})();")
    npm_root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
    subprocess.run(["node", "-e", js], check=True, env={**os.environ, "NODE_PATH": npm_root})
    tmp.unlink()
    print(hwpx, pdf)


if __name__ == "__main__":
    main(sys.argv[1])
