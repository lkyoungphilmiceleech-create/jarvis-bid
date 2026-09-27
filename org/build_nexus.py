"""org/nexus.tpl.html → org/nexus.html (NEXUS 매칭 센터). 사용: python org/build_nexus.py
연락처·프로젝트는 페이지 저장소(db)에 있고 HTML에는 들어가지 않는다."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/nexus.png").read_bytes()).decode()
out = root / "nexus.html"
out.write_text((root / "nexus.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar), encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
