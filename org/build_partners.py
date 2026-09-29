"""org/partners.tpl.html → org/partners.html (국내외 협업사 DB). 사용: python org/build_partners.py
관리자·담당 PM 에게만 공유한다(투입 인력이 보는 관제실과 분리). 데이터는 페이지 db partners/{id}."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/ledger.png").read_bytes()).decode()
html = (root / "partners.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar)
out = root / "partners.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
