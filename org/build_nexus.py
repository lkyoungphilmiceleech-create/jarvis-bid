"""org/nexus.tpl.html + org/geo/geo.json(지도) → org/nexus.html (NEXUS 매칭 센터). 사용: python org/build_nexus.py
연락처·프로젝트는 페이지 저장소(db)에 있고 HTML에는 들어가지 않는다."""
import base64, pathlib

TRIGGER = "trig_01TVfvJ4yxB4uGDnYBCjzTx4"  # [발굴] 버튼이 부르는 루틴 'NEXUS 바이어·투자자 발굴'
root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/nexus.png").read_bytes()).decode()
html = (root / "nexus.tpl.html").read_text(encoding="utf-8")
html = html.replace("__AVATAR__", avatar).replace("__TRIGGER__", TRIGGER).replace("__GEO__", (root / "geo/geo.json").read_text(encoding="utf-8"))
out = root / "nexus.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
