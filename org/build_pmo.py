"""org/pmo.tpl.html → org/pmo.html (사업 수행 관제실: CHRONOS 공정일정 + LEDGER 예산). 사용: python org/build_pmo.py
프로젝트·WBS·예산·장부·인력은 페이지 저장소(db, 관리자 전용)에 있고 HTML에는 들어가지 않는다."""
import base64, json, pathlib

root = pathlib.Path(__file__).resolve().parent
av = lambda n: "data:image/png;base64," + base64.b64encode((root / f"avatars/{n}.png").read_bytes()).decode()
org = json.loads((root / "org.json").read_text(encoding="utf-8"))
ai = [{"code": e["code"], "역할": e["역할"], "업무": e.get("업무", [])} for b in org["본부"] for e in b["팀"] if e.get("상태") == "근무 중"]
keep = ["bidNtceNo", "사업명", "발주기관", "한줄요약", "과업범위", "일정"]
dec = [{k: a.get(k) for k in keep} for a in (json.loads(p.read_text(encoding="utf-8")) for p in sorted((root.parent / "decoder/analysis").glob("*.json")))]
html = (root / "pmo.tpl.html").read_text(encoding="utf-8")
html = html.replace("__AV_CHRONOS__", av("chronos")).replace("__AV_LEDGER__", av("ledger"))
html = html.replace("__DATA__", json.dumps({"ai": ai, "decoder": dec}, ensure_ascii=False).replace("</", "<\\/"))
out = root / "pmo.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB", f"AI {len(ai)}명", f"분석 {len(dec)}건")
