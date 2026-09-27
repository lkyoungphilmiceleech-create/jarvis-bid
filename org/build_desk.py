"""사업 수행 본부 업무 데스크 → org/desk.html. 사용: python org/build_desk.py
본부장님 스킬(~/.claude/skills/synced/*/<스킬>/SKILL.md)을 업무 지침으로 넣는다.
⚠ 스킬에는 내부 자료가 있어 결과 파일(org/desk.html)은 저장소에 올리지 않는다(.gitignore)."""
import base64, glob, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent
STAFF = [
    {"code": "BABEL", "avatar": "babel", "팀": "통번역·비즈니스 메일팀", "역할": "통번역가", "인사": "번역할 메시지나 답장할 내용을 붙여 주세요.",
     "modes": [{"label": "비즈니스 번역·답장", "skill": "business-translation", "desc": "외국어 메시지를 번역하고, 보낼 답장을 영·국문으로 만듭니다.", "placeholder": "예) 바이어가 보낸 영문 메일 전문 + 하고 싶은 답(한국어)"}]},
    {"code": "NEXUS", "avatar": "nexus", "팀": "네트워크 발굴·매칭팀", "역할": "매칭 매니저", "인사": "바이어 프로필과 상황을 알려 주시면 메시지를 만들겠습니다.",
     "modes": [
        {"label": "연결 요청", "skill": "buyer-connection-request", "desc": "아직 연결되지 않은 바이어에게 보낼 연결 요청 메시지 (가치가 없으면 '필요 없음' 판정)", "placeholder": "바이어 이름·직책·회사·산업·직무·회사규모"},
        {"label": "수락 후 상담 초청", "skill": "buyer-meeting-invite", "desc": "연결이 수락된 바이어와 참가기업을 매칭해 상담 시간까지 제안", "placeholder": "수락한 바이어 프로필"},
        {"label": "첫 매칭 메시지", "skill": "buyer-connect-first-message", "desc": "이미 연결된 바이어에게 보내는 첫 상담 매칭 메시지", "placeholder": "바이어 프로필과 연결 상황"},
        {"label": "회신 대응", "skill": "buyer-reply-followup", "desc": "바이어 회신을 번역·의도 분석하고 후속 메시지 작성", "placeholder": "바이어 정보 + 내가 보낸 마지막 메시지 + 바이어 회신"},
        {"label": "아웃리치", "skill": "buyer-investor-outreach", "desc": "바이어·투자자·미디어 대상 후킹 아웃리치 메시지 (행사 무관)", "placeholder": "대상자 정보 + 소개할 한국 기업과 강점 + 행사명"}]},
    {"code": "MAESTRO", "avatar": "maestro", "팀": "행사 기획팀", "역할": "행사 기획자", "인사": "포럼 기획안이나 연사 후보를 보여 주세요.",
     "modes": [{"label": "U-KNOCK 포럼 보강", "skill": "uknock-forum-enhancer", "desc": "U-KNOCK 2026 포럼 기획안 검토·보강, 연사 섭외, 세션 구성", "placeholder": "기획안 일부, 연사 후보, 보강하고 싶은 부분"}]},
    {"code": "SCRIBE", "avatar": "scribe", "팀": "보고서팀", "역할": "기록관", "인사": "녹취나 회의 노트를 붙여 주시면 보고서로 정리하겠습니다.",
     "modes": [
        {"label": "기관 보고 800자", "skill": "institutional-brief-800", "desc": "컨퍼런스·리포트 전문을 800자(핵심 300 + 세부 500) 서술형 보고로", "placeholder": "컨퍼런스 녹취, 기사, 리포트 전문"},
        {"label": "세션 요약", "skill": "conference-session-summary", "desc": "세션 녹취를 표준 개조식 요약으로 (날짜·세션명·연사명 포함)", "placeholder": "날짜/시간, 세션명, 연사명 + 녹취 본문"},
        {"label": "주간회의록 초안", "skill": "kocca-weekly-minutes", "desc": "KOCCA 해외마켓 주간회의록을 표준 구조의 본문으로 (HWPX 파일은 JARVIS 채팅에서)", "placeholder": "회의 일시·장소·참석자 + 녹취 또는 메모"}]},
]


def skill_text(name):
    hits = glob.glob(str(pathlib.Path.home() / ".claude/skills/synced/*" / name / "SKILL.md"))
    if not hits:
        raise SystemExit(f"스킬을 찾을 수 없습니다: {name}")
    return re.sub(r"^---.*?---\s*", "", pathlib.Path(hits[0]).read_text(encoding="utf-8"), flags=re.S)


skills = {m["skill"]: skill_text(m["skill"]) for s in STAFF for m in s["modes"]}
avatars = {s["avatar"]: "data:image/png;base64," + base64.b64encode((root / "avatars" / f"{s['avatar']}.png").read_bytes()).decode() for s in STAFF}
data = {"staff": STAFF, "skills": skills, "avatars": avatars}
tpl = (root / "desk.tpl.html").read_text(encoding="utf-8")
out = root / "desk.html"
out.write_text(tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")
print(out, f"{out.stat().st_size // 1024}KB", len(skills), "개 스킬")
