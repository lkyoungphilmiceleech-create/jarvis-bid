"""org/atlas.tpl.html → org/atlas.html (ATLAS 리서치실). 사용: python org/build_atlas.py
브리핑은 페이지 저장소(db)의 briefs 컬렉션에 매일 루틴이 쌓는다."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/atlas.png").read_bytes()).decode()
out = root / "atlas.html"
out.write_text((root / "atlas.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar), encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
