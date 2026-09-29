"""직원용 사본 만들기 — 아침 루틴이 실행한다(관리자가 페이지를 안 열어도 사본이 최신이 되게).
NEXUS pipeline → pubpipe (연락처 뺌), 관제실 pm·people → view (금액·이메일 뺌).
필드 목록과 가림 규칙은 org/nexus.tpl.html(PUBF·PUBM·scrub·reach)과 org/pmo.tpl.html(syncView)과 같아야 한다.

사용: ArtifactData 로 각 컬렉션을 out_dir 로 내려받은 뒤
  python org/staff_copies.py nexus <pipeline 폴더> <pubpipe 폴더> <출력 폴더>
  python org/staff_copies.py pmo <pm 폴더> <people 폴더> <view 폴더> <출력 폴더>
  python org/staff_copies.py test
출력 폴더에 쓸 문서(<id>.json)와 plan.json {"new": [...], "changed": [...], "delete": [...]} 를 만든다.
changed·delete 는 기존 문서라 ArtifactData 쓰기에 if_version 이 필요하다."""
import json, pathlib, re, sys

PUBF = ["유형", "이름", "직책", "역할구분", "회사", "국가", "도시", "분야", "산업군", "프로필", "거래실적", "거래출처", "거래근거", "근거", "웹",
        "행사경로", "행사경로출처", "발굴대상", "발굴경로", "상태", "최고적합도", "최초발굴일", "최근확인일", "시험"]
PUBM = ["pid", "프로젝트", "기업명", "적합도", "적합이유", "추천접근"]
A = re.ASCII | re.I  # JS 정규식처럼 \w·\b 를 ASCII 기준으로
MAIL = re.compile(r"[\w.+-]+\s*(@|\[at\]|\(at\))\s*[\w-]+(\s*(\.|\[dot\])\s*[\w-]+)+", A)
PHONE = re.compile(r"(\+\d|\b0\d{1,2})[\d\s().-]{6,}\d", re.ASCII)
LINKEDIN = re.compile(r"(https?://)?([\w-]+\.)*linkedin\.com/\S*", A)


def scrub(v):
    if isinstance(v, list):
        return [x for x in map(scrub, v) if x != ""]
    if not isinstance(v, str):
        return v
    if re.search(r"linkedin\.com", v, re.I) and not re.search(r"\s", v.strip()):
        return ""
    return LINKEDIN.sub("", PHONE.sub("(전화 생략)", MAIL.sub("(이메일 생략)", v)))


def pick(o, ks):
    return {k: v for k in ks if (v := scrub(o.get(k))) is not None and v != ""}


def reach(b):
    return b.get("연락") or ("개인 이메일" if b.get("이메일") else "회사 연락처" if b.get("회사연락처") else "행사 경로" if b.get("행사경로")
                            else "링크드인만" if b.get("링크드인") else "없음")


def pub_of(b):
    return {**pick(b, PUBF), "매칭": [pick(m, PUBM) for m in (b.get("매칭") if isinstance(b.get("매칭"), list) else [])], "연락": reach(b)}


def s(x):
    return "" if x is None else str(x)


def views(pm, people):
    name = {i: s(p.get("이름")) for i, p in people.items()}
    return {pid: {**{k: s(p.get(k)) for k in ["이름", "발주처", "상태", "시작", "종료"]}, "담당PM": name.get(p.get("PM"), ""),
                  "인력": sorted(({k: s(x.get(k)) for k in ["id", "이름", "직책", "역할", "참여시작", "참여종료"]}
                                for i, x in ((i, {**x, "id": i}) for i, x in people.items()) if not x.get("pid") or x.get("pid") == pid), key=lambda x: x["id"])}
            for pid, p in pm.items()}


def load(d):
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(pathlib.Path(d).glob("*.json"))} if pathlib.Path(d).is_dir() else {}


def write(want, have, out):
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True)
    key = lambda v: json.dumps(v, ensure_ascii=False, sort_keys=True)
    plan = {"new": [], "changed": [], "delete": sorted(set(have) - set(want))}
    for i, v in want.items():
        if i in have and key(have[i]) == key(v):
            continue
        plan["changed" if i in have else "new"].append(i)
        (out / f"{i}.json").write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")
    (out / "plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    print(f"새로 {len(plan['new'])} · 바뀜 {len(plan['changed'])} · 삭제 {len(plan['delete'])} → {out}")


def test():
    assert scrub("문의 kim@x.co.kr 또는 010-1234-5678, 02-123-4567") == "문의 (이메일 생략) 또는 (전화 생략), (전화 생략)"
    assert scrub("name [at] x [dot] com") == "(이메일 생략)"
    assert scrub("전화010-1234-5678") == "전화(전화 생략)"  # JS \b 처럼 한글 뒤에서도 가림
    assert scrub("https://kr.linkedin.com/in/x") == "" and scrub("see linkedin.com/in/abc ok") == "see  ok"
    assert scrub("2025.07 투자(105억원)") == "2025.07 투자(105억원)" and scrub(["a", "https://linkedin.com/in/x"]) == ["a"]
    b = {"이름": "A", "이메일": "a@b.com", "회사연락처": "x", "메모": "비밀", "dbId": "D1", "최고적합도": 0,
         "매칭": [{"pid": "P", "msg": "비밀", "적합도": 80}]}
    assert pub_of(b) == {"이름": "A", "최고적합도": 0, "매칭": [{"pid": "P", "적합도": 80}], "연락": "개인 이메일"}
    v = views({"P1": {"이름": "사업", "계약금액": 100, "PM": "u1"}}, {"u1": {"이름": "김", "이메일": "k@x.com", "인건비": 5}})
    assert v == {"P1": {"이름": "사업", "발주처": "", "상태": "", "시작": "", "종료": "", "담당PM": "김",
                        "인력": [{"id": "u1", "이름": "김", "직책": "", "역할": "", "참여시작": "", "참여종료": ""}]}}
    print("ok")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["test"]:
        test()
    elif a[:1] == ["nexus"] and len(a) == 4:
        write({i: pub_of(b) for i, b in load(a[1]).items()}, load(a[2]), a[3])
    elif a[:1] == ["pmo"] and len(a) == 5:
        write(views(load(a[1]), load(a[2])), load(a[3]), a[4])
    else:
        sys.exit(__doc__)
