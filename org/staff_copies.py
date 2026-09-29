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
# JS 정규식과 같게: \w·\d·\b 는 ASCII 로 풀어 쓰고, \s·\S 는 유니코드 그대로(NBSP·전각 공백 포함)
MAIL = re.compile(r"[A-Za-z0-9_.+-]+\s*(@|\[at\]|\(at\))\s*[A-Za-z0-9_-]+(\s*(\.|\[dot\])\s*[A-Za-z0-9_-]+)+", re.I)
PHONE = re.compile(r"(\+[0-9]|(?<![A-Za-z0-9_])0[0-9]{1,2})[0-9\s().-]{6,}[0-9]")
LINKEDIN = re.compile(r"(https?://)?([A-Za-z0-9_-]+\.)*linkedin\.com/\S*", re.I)


def truthy(v):  # JS 참/거짓: 빈 배열·객체도 참
    return v not in (None, False, 0, "") or isinstance(v, (list, dict))


def scrub(v):
    if isinstance(v, list):
        return [x for x in map(scrub, v) if x != ""]
    if not isinstance(v, str):
        return v
    if re.search(r"linkedin\.com", v, re.I) and not re.search(r"\s", v.strip()):
        return ""
    return LINKEDIN.sub("", PHONE.sub("(전화 생략)", MAIL.sub("(이메일 생략)", v)))


def pick(o, ks):
    o = o if isinstance(o, dict) else {}
    return {k: v for k in ks if (v := scrub(o.get(k))) is not None and v != ""}


def reach(b):
    t = lambda k: truthy(b.get(k))
    return b.get("연락") if t("연락") else "개인 이메일" if t("이메일") else "회사 연락처" if t("회사연락처") else "행사 경로" if t("행사경로") else "링크드인만" if t("링크드인") else "없음"


def pub_of(b):
    return {**pick(b, PUBF), "매칭": [pick(m, PUBM) for m in (b.get("매칭") if isinstance(b.get("매칭"), list) else [])], "연락": reach(b)}


def s(x):  # JS String()
    return "" if x is None else ("true" if x else "false") if isinstance(x, bool) else ",".join(map(s, x)) if isinstance(x, list) else str(x)


def views(pm, people):
    ppl = [{"id": i, **x} for i, x in people.items()]  # JS {id: d.id, ...d.data()} 처럼 data 의 id 가 이긴다
    return {pid: {**{k: s(p.get(k)) for k in ["이름", "코드", "발주처", "상태", "시작", "종료", "연락처페이지"]},
                  "담당PM": s(next((x.get("이름") for x in ppl if x["id"] == p.get("PM")), "")), "PM": s(p.get("PM")),
                  "인력": sorted(({k: s(x.get(k)) for k in ["id", "이름", "직책", "역할", "참여시작", "참여종료", "uid"]}
                                for x in ppl if not x.get("pid") or x.get("pid") == pid), key=lambda x: x["id"])}  # ponytail: JS localeCompare 와 달리 코드 순서 — 인력 id 는 "U"+base36 이라 같음
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
    assert scrub("010\u00a01234\u00a05678") == "(전화 생략)" and scrub("kim\u3000@\u3000x.com") == "(이메일 생략)"  # NBSP·전각 공백
    assert scrub("linkedin.com/in/x\u00a0abc") == "\u00a0abc" and reach({"이메일": []}) == "개인 이메일"
    assert pub_of({"매칭": [None, "x", {"pid": "P"}]})["매칭"] == [{}, {}, {"pid": "P"}] and s(True) == "true" and s([1, 2]) == "1,2"
    assert scrub("https://kr.linkedin.com/in/x") == "" and scrub("see linkedin.com/in/abc ok") == "see  ok"
    assert scrub("2025.07 투자(105억원)") == "2025.07 투자(105억원)" and scrub(["a", "https://linkedin.com/in/x"]) == ["a"]
    b = {"이름": "A", "이메일": "a@b.com", "회사연락처": "x", "메모": "비밀", "dbId": "D1", "최고적합도": 0,
         "매칭": [{"pid": "P", "msg": "비밀", "적합도": 80}]}
    assert pub_of(b) == {"이름": "A", "최고적합도": 0, "매칭": [{"pid": "P", "적합도": 80}], "연락": "개인 이메일"}
    v = views({"P1": {"이름": "사업", "계약금액": 100, "PM": "u1"}}, {"u1": {"이름": "김", "이메일": "k@x.com", "인건비": 5}})
    assert v == {"P1": {"이름": "사업", "코드": "", "발주처": "", "상태": "", "시작": "", "종료": "", "연락처페이지": "", "담당PM": "김", "PM": "u1",
                        "인력": [{"id": "u1", "이름": "김", "직책": "", "역할": "", "참여시작": "", "참여종료": "", "uid": ""}]}}
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
