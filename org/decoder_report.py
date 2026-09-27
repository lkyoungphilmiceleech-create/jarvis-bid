"""DECODER 분석(JSON) → 보고서 HWPX + PDF.
사용: python org/decoder_report.py decoder/analysis/<공고번호>.json  → decoder/reports/<공고번호>.hwpx / .pdf
PDF는 node + playwright(Chromium)로 인쇄용 HTML을 변환한다."""
import html
import json
import pathlib
import subprocess
import sys

from hwpx.document import HwpxDocument

ROOT = pathlib.Path(__file__).resolve().parent.parent


def sections(c):
    """보고서 본문을 (제목, 블록들) 목록으로. 블록: ("p", 문장) | ("table", 머리행, 행들)"""
    tl = [(e["날짜"][5:] + ("~" + e["끝"][5:] if e.get("끝") else ""), e["항목"], e.get("비고", "")) for e in c["일정"]]
    return [
        ("사업 개요", [("p", f"※ {c['한줄요약']}")] + [("p", f"  ◦ {k} : {v}") for k, v in c["개요"]]),
        ("공정 일정", [("table", ["일자", "내용", "비고"], tl)]),
        ("평가 배점 및 심사 포인트", [("p", f"  ◦ 평가방식 : {c['평가']['방식']}"),
                              ("table", ["평가항목", "배점", "평가위원이 듣고 싶은 내용"], [(s["항목"], str(s["배점"]), s["듣고싶은내용"]) for s in c["평가"]["항목"]])]
         + [("p", f"※ {t}") for t in c["평가"]["인사이트"]]),
        ("과업 범위", [("p", f"  가. {s['영역']}(난이도 {s['무게']}) : {s['내용']}") for s in c["과업범위"]]),
        ("제출 서류", [("table", ["구분", "서류", "대표", "분담", "형식"], [(d["구분"], d["서류"], d["대표"], d["분담"], d["형식"]) for d in c.get("제출서류", [])])]),
        ("제안서 목차별 분량 배분", [("p", f"  ◦ {c['목차배분']['설명']}"), ("table", ["목차", "평가항목", "배점", "권장 쪽수"], [(m["목차"], m["평가"], str(m["배점"]), str(m["쪽"])) for m in c["목차배분"]["항목"]])] if c.get("목차배분") else []),
        ("주요 질문사항", [("p", f"  {i}) {q['질문']} [{q['채널']}]") for i, q in enumerate(c["질문"], 1)]),
        ("리스크", [("p", f"  ◦ [{r['수준']}] {r['내용']}") for r in c["리스크"]]),
        ("전략팀(ORACLE) 전달 사항", [("p", f"  ◦ {t}") for t in c["전략힌트"]]),
    ]


def build_hwpx(c, out):
    doc = HwpxDocument.new()
    for para in list(doc.paragraphs):
        try:
            para.remove()
        except Exception:  # noqa: BLE001
            pass
    doc.add_paragraph("「DECODER 제안요청서 분석 보고」")
    doc.add_paragraph("")
    meta = [("사 업 명", c["사업명"]), ("발주기관", c["발주기관"]), ("공고번호", c["bidNtceNo"]),
            ("분석 일자", c["analyzedAt"]), ("작 성", "제안 사전 분석팀 DECODER"), ("근거 자료", ", ".join(c["sources"]))]
    t = doc.add_table(len(meta), 2)
    for r, (k, v) in enumerate(meta):
        t.set_cell_text(r, 0, k)
        t.set_cell_text(r, 1, v)
    t.set_column_widths([9000, 33000])
    for n, (title, blocks) in enumerate(sections(c), 1):
        if not blocks:
            continue
        doc.add_paragraph("")
        doc.add_paragraph(f"{n}. {title}")
        for b in blocks:
            if b[0] == "p":
                doc.add_paragraph(b[1])
            else:
                head, rows = b[1], b[2]
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


def build_html(c):
    e = html.escape
    parts = [f"<h1>DECODER 제안요청서 분석 보고</h1><table class='meta'>"
             + "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in [("사업명", c["사업명"]), ("발주기관", c["발주기관"]), ("공고번호", c["bidNtceNo"]), ("분석 일자", c["analyzedAt"]), ("작성", "제안 사전 분석팀 DECODER")])
             + "</table>"]
    for n, (title, blocks) in enumerate(sections(c), 1):
        if not blocks:
            continue
        parts.append(f"<h2>{n}. {e(title)}</h2>")
        for b in blocks:
            if b[0] == "p":
                cls = " class='note'" if b[1].startswith("※") else ""
                parts.append(f"<p{cls}>{e(b[1].strip())}</p>")
            else:
                parts.append("<table><tr>" + "".join(f"<th>{e(h)}</th>" for h in b[1]) + "</tr>"
                             + "".join("<tr>" + "".join(f"<td>{e(v)}</td>" for v in row) + "</tr>" for row in b[2]) + "</table>")
    css = """@page{size:A4;margin:16mm 14mm}body{font-family:"IBM Plex Sans KR","Noto Sans CJK KR","WenQuanYi Zen Hei",sans-serif;font-size:10pt;line-height:1.55;color:#14202a}
h1{font-size:17pt;margin:0 0 10px;border-bottom:2px solid #0a7fa0;padding-bottom:6px}h2{font-size:12pt;margin:16px 0 6px;color:#0a5f78;break-after:avoid}
table{width:100%;border-collapse:collapse;margin:6px 0;break-inside:auto}th,td{border:1px solid #b9c7cf;padding:4px 6px;vertical-align:top;text-align:left}th{background:#e8f1f5;white-space:nowrap}
tr{break-inside:avoid}.meta th{width:80px}p{margin:3px 0}.note{background:#fff6e5;border-left:3px solid #c98a12;padding:4px 8px}"""
    return f"<!doctype html><meta charset='utf-8'><style>{css}</style>" + "".join(parts)


def main(src):
    c = json.loads(pathlib.Path(src).read_text(encoding="utf-8"))
    out = ROOT / "decoder" / "reports"
    out.mkdir(parents=True, exist_ok=True)
    hwpx, pdf, tmp = out / f"{c['bidNtceNo']}.hwpx", out / f"{c['bidNtceNo']}.pdf", out / f"{c['bidNtceNo']}.print.html"
    build_hwpx(c, hwpx)
    tmp.write_text(build_html(c), encoding="utf-8")
    js = ("const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();"
          f"await p.goto('file://{tmp}');await p.pdf({{path:'{pdf}',format:'A4',printBackground:true}});await b.close();}})();")
    subprocess.run(["node", "-e", js], check=True, env={**__import__("os").environ, "NODE_PATH": subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()})
    tmp.unlink()
    print(hwpx, pdf)


if __name__ == "__main__":
    main(sys.argv[1])
