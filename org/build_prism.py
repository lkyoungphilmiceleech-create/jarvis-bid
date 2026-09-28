"""org/prism.tpl.html → org/prism.html (PRISM 디자인 스튜디오). 사용: python org/build_prism.py
요청·레퍼런스·시안 기록은 페이지 저장소(db)에 있고, 레퍼런스 수집 루틴 번호는 db config/prism 의 trigger 에 둔다."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/prism.png").read_bytes()).decode()
html = (root / "prism.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar)
out = root / "prism.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
