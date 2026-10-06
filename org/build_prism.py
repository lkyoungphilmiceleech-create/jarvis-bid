"""org/prism.tpl.html + org/design_brief.js + org/design_line.js + org/design_kv.js + org/design_set.js → org/prism.html (PRISM 디자인 스튜디오). 사용: python org/build_prism.py
요청·레퍼런스·시안 기록은 페이지 저장소(db)에 있고, 레퍼런스 수집 루틴 번호는 db config/prism 의 trigger 에 둔다.
디자인 라인 탭은 별도 파일 org/design_brief.js(PM 브리프)·org/design_line.js·org/design_kv.js(키비주얼 레이어·브랜드킷)·org/design_set.js(응용 세트 가이드·조립·PPTX)로 만들고 여기서 차례로 붙인다(저장소 경로 line/·linespec/)."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/prism.png").read_bytes()).decode()
line = "\n".join((root / f).read_text(encoding="utf-8") for f in ("design_brief.js", "design_line.js", "design_kv.js", "design_set.js"))
assert "</script" not in line.lower(), "design_*.js 에 </script 가 있으면 페이지가 깨집니다"
html = (root / "prism.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar).replace("__DESIGN_LINE__", line)
out = root / "prism.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
