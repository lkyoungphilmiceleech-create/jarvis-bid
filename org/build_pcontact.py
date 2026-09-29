"""org/pcontact.tpl.html → org/pcontact.html (프로젝트별 참가기업 연락처). 사용: python org/build_pcontact.py
프로젝트마다 이 파일을 별도 아티팩트로 발행하고 그 프로젝트 담당 PM 에게만 공유한다.
프로젝트 이름·관제실 id 는 발행 뒤 JARVIS 가 그 페이지 db config/project 에 적는다."""
import base64, pathlib

root = pathlib.Path(__file__).resolve().parent
avatar = "data:image/png;base64," + base64.b64encode((root / "avatars/chronos.png").read_bytes()).decode()
html = (root / "pcontact.tpl.html").read_text(encoding="utf-8").replace("__AVATAR__", avatar)
out = root / "pcontact.html"
out.write_text(html, encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB")
