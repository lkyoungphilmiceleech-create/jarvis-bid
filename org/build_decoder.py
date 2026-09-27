"""decoder/analysis/*.json → org/decoder.html (DECODER 분석실). 사용: python org/build_decoder.py"""
import base64, json, pathlib

root = pathlib.Path(__file__).resolve().parent
cases = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(root.parent.glob("decoder/analysis/*.json"))]
cases.sort(key=lambda c: c.get("analyzedAt", ""), reverse=True)
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/decoder.png").read_bytes()).decode()
tpl = (root / "decoder.tpl.html").read_text(encoding="utf-8")
out = root / "decoder.html"
out.write_text(tpl.replace("__AVATAR__", avatar).replace("__DATA__", json.dumps({"cases": cases}, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")
print(out, len(cases), "건")
