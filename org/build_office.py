"""org/org.json + 수집·분석 데이터 → org/office.html (JARVIS 빌딩 2층 조감도). 사용: python org/build_office.py [--knowledge <폴더>]
--knowledge: 루틴이 ATLAS·NEXUS 페이지 저장소를 ArtifactData out_dir 로 내려받은 폴더(atlas/briefs, atlas/library, nexus/contacts|pipeline|daily|projects). 직원 대화의 업무 자료가 된다.
아이소메트릭 3D 좌표(X: 오른쪽 아래, Y: 왼쪽 아래, Z: 위)를 화면 좌표로 투영해 SVG를 만든다."""
import base64, collections, datetime as dt, json, pathlib, sys

root = pathlib.Path(__file__).resolve().parent
repo = root.parent
org = json.loads((root / "org.json").read_text(encoding="utf-8"))
KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)
sys.path.insert(0, str(repo)); import os; os.environ.setdefault("DATA_GO_KR_KEY", "-")
from collect import fit

S = 34                      # 1m(격자 한 칸)의 화면 크기
C, H = 0.866 * S, 0.5 * S   # 아이소메트릭 투영 계수
W, D, WALL = 14, 9, 3.2     # 층 바닥 가로(X)·세로(Y), 벽 높이
FLOORS = {"A": 15.5, "B": 0.0}  # 층 바닥 높이(Z): 2F 제안서 준비 본부, 1F 사업 수행 본부 (조감도용으로 띄움)


def P(x, y, z):
    return (x - y) * C, (x + y) * H - z * S


def poly(pts, cls, extra=""):
    return f'<polygon class="{cls}" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in (P(*p) for p in pts))}"{extra}/>'


def box(x, y, z, w, d, h, cls):
    """보이는 세 면(위·왼쪽 앞·오른쪽 앞)만 그린다. cls: 재질 이름 → .{cls}-t/-l/-r"""
    return (poly([(x, y + d, z), (x + w, y + d, z), (x + w, y + d, z + h), (x, y + d, z + h)], f"{cls}-l")
            + poly([(x + w, y, z), (x + w, y + d, z), (x + w, y + d, z + h), (x + w, y, z + h)], f"{cls}-r")
            + poly([(x, y, z + h), (x + w, y, z + h), (x + w, y + d, z + h), (x, y + d, z + h)], f"{cls}-t"))


def avatar(name):
    return "data:image/png;base64," + base64.b64encode((root / "avatars" / f"{name}.png").read_bytes()).decode()


def kpis():
    items = {}
    for f in sorted((repo / "data").glob("2*.json")):
        for x in json.loads(f.read_text(encoding="utf-8"))["items"]:
            items[x["bidNtceNo"]] = x
    def live(x):
        d = x.get("입찰마감일시") or ""
        return not d or dt.datetime.fromisoformat(d).replace(tzinfo=KST) >= now
    rec = sum(1 for x in items.values() if live(x) and (x.get("배정예산") or 10**8) >= 10**8)
    cases = [json.loads(p.read_text(encoding="utf-8")) for p in (repo / "decoder" / "analysis").glob("*.json")]
    nxt = sorted((e["날짜"], e["항목"]) for c in cases for e in c["일정"] if len(e["날짜"]) == 10 and e["날짜"] >= now.strftime("%Y-%m-%d"))
    dd = (dt.date.fromisoformat(nxt[0][0]) - now.date()).days if nxt else None
    return {
        "RADAR": [[f"{rec}", "마감 전 추천 공고"], [f"{len(items)}", "누적 수집"]],
        "DECODER": [[f"{len(cases)}", "분석한 공고"], [f"D-{dd}" if dd is not None else "-", (nxt[0][1].split(" — ")[0][:18] if nxt else "다가오는 일정 없음")]],
    }, rec, len(cases)


# 자리 배치(책상 왼쪽 위 모서리 X, Y). 직원은 책상 뒤(Y-0.9)에 앉아 화면 쪽(앞)을 본다.
SEATS = {"A": [(1.0, 2.3), (4.0, 2.3), (7.0, 2.3), (7.0, 6.7), (4.0, 6.7), (1.0, 6.7)],
         "B": [(1.0, 2.3), (4.0, 2.3), (7.0, 2.3), (3.3, 6.7), (0.9, 6.7), (5.7, 6.7), (8.1, 6.7)]}


def floor(wing, z0, name, label, staff, where):
    items = []  # (깊이, svg) — 깊이가 작은 것(뒤)부터 그린다
    add = lambda depth, s: items.append((depth, s))
    base = []
    # 바닥 슬래브와 층 표시
    base.append(box(0, 0, z0 - 0.5, W, D, 0.5, "slab"))
    base.append(poly([(0, 0, z0), (W, 0, z0), (W, D, z0), (0, D, z0)], "floor-t"))
    base.append(poly([(0.6, 1.4, z0 + .01), (9.6, 1.4, z0 + .01), (9.6, 8.4, z0 + .01), (0.6, 8.4, z0 + .01)], "carpet"))
    # 뒷벽 2면(창문 포함)
    base.append(box(-0.3, 0, z0, 0.3, D, WALL, "wall"))
    base.append(box(0, -0.3, z0, W, 0.3, WALL, "wall"))
    for x0 in [1.0, 4.0, 7.0, 10.5]:
        base.append(poly([(x0, 0.01, z0 + 0.9), (x0 + 2.2, 0.01, z0 + 0.9), (x0 + 2.2, 0.01, z0 + 2.7), (x0, 0.01, z0 + 2.7)], "win"))
        base.append(poly([(x0 + 1.1, 0.02, z0 + 0.9), (x0 + 1.15, 0.02, z0 + 0.9), (x0 + 1.15, 0.02, z0 + 2.7), (x0 + 1.1, 0.02, z0 + 2.7)], "mullion"))
    for y0 in [1.2, 4.6]:
        base.append(poly([(0.01, y0, z0 + 0.9), (0.01, y0 + 2.4, z0 + 0.9), (0.01, y0 + 2.4, z0 + 2.7), (0.01, y0, z0 + 2.7)], "win"))
    # 벽면 사인(층 이름)
    sx, sy = P(0.01, D - 0.4, z0 + 3.0)
    base.append(f'<text class="wallsign" transform="matrix(0.866,-0.5,0,1,{sx:.1f},{sy:.1f})">{label}</text>')
    # 회의실(유리벽) + 테이블 + 화이트보드
    mx, my = 10.4, 0.0
    base.append(poly([(mx + 0.2, 0.01, z0 + 0.7), (mx + 3.4, 0.01, z0 + 0.7), (mx + 3.4, 0.01, z0 + 2.6), (mx + 0.2, 0.01, z0 + 2.6)], "board" if wing == "B" else "screen"))
    add(10.4 + 1.5, box(mx + 0.6, 1.3, z0, 2.4, 1.6, 0.75, "wood"))
    for cx, cy in [(mx + 0.9, 3.2), (mx + 2.1, 3.2), (mx + 0.9, 0.7), (mx + 2.1, 0.7)]:
        add(cx + cy, box(cx, cy, z0, 0.5, 0.5, 0.45, "chair"))
    add(20, poly([(mx, 4.3, z0), (W, 4.3, z0), (W, 4.3, z0 + WALL), (mx, 4.3, z0 + WALL)], "glasswall"))
    add(19.5, poly([(mx, 0, z0), (mx, 4.3, z0), (mx, 4.3, z0 + WALL), (mx, 0, z0 + WALL)], "glasswall"))
    # 라운지: 소파·화분·(1F) 커피바
    add(11 + 7, box(10.8, 6.4, z0, 2.6, 1.0, 0.45, "sofa") + box(10.8, 7.2, z0 + .45, 2.6, 0.2, 0.5, "sofa"))
    add(13.3 + 5.2, box(13.1, 5.0, z0, 0.6, 0.6, 0.5, "pot") + f'<circle class="leaf" cx="{P(13.4, 5.3, z0 + 1.2)[0]:.1f}" cy="{P(13.4, 5.3, z0 + 1.2)[1]:.1f}" r="{S * .45:.1f}"/>')
    add(0.6 + 8.4, box(0.3, 8.1, z0, 0.6, 0.6, 0.5, "pot") + f'<circle class="leaf" cx="{P(0.6, 8.4, z0 + 1.2)[0]:.1f}" cy="{P(0.6, 8.4, z0 + 1.2)[1]:.1f}" r="{S * .45:.1f}"/>')
    if wing == "B":
        add(1, box(3.4, 0.2, z0, 3.0, 0.8, 1.0, "wood") + box(3.8, 0.3, z0 + 1.0, 0.5, 0.4, 0.4, "chair") + box(5.2, 0.3, z0 + 1.0, 0.7, 0.5, 0.5, "slab"))
        add(8.8 + 0.6, box(8.8, 0.3, z0, 0.9, 0.7, 1.0, "printer"))
    # 자리: 의자 → 직원 → 책상 → 모니터 순
    for t, (x, y) in zip(staff, SEATS[wing]):
        st = {"근무 중": "on", "스킬 보유": "skill"}.get(t["상태"], "off")
        cx, cy = x + 0.55, y - 0.95
        g = [f'<g class="desk {st}" data-code="{t["code"]}" tabindex="0" role="button" aria-label="{t["code"]} {t["팀"]} ({t["상태"]}) — 두 번 누르면 업무실로"><title>{t["code"]} · 두 번 누르면 업무실로</title>']
        g.append(box(cx, cy, z0, 0.7, 0.7, 0.45, "chair") + box(cx, cy - 0.12, z0 + .45, 0.7, 0.12, 0.8, "chair"))
        px, py = P(cx + 0.35, cy + 0.35, z0 + 0.45)
        size = 2.35 * S
        img = f'<image data-av="{t["avatar"]}" href="{avatar(t["avatar"])}" x="{px - size / 2:.1f}" y="{py - size * .93:.1f}" width="{size:.1f}" height="{size:.1f}"/>'
        g.append(img if st != "off" else f'<g class="vacant">{img}</g>')
        g.append(box(x, y, z0, 1.8, 1.0, 0.75, "desk"))
        g.append(box(x + 0.15, y + 0.15, z0 + 0.75, 0.9, 0.12, 0.62, "mon"))            # 모니터(뒷면이 앞을 봄)
        g.append(poly([(x + 0.18, y + 0.14, z0 + .8), (x + 1.02, y + 0.14, z0 + .8), (x + 1.02, y + 0.14, z0 + 1.34), (x + 0.18, y + 0.14, z0 + 1.34)], "glow" if st == "on" else "dark"))
        g.append(box(x + 1.2, y + 0.45, z0 + 0.75, 0.35, 0.3, 0.08, "paper"))
        hx, hy = P(cx + 0.35, cy + 0.35, z0 + 0.45)
        ty = hy - size * .98
        tw = max(len(t["code"]) * 9 + 26, 70)
        g.append(f'<g class="nametag {st}" transform="translate({hx:.1f},{ty:.1f})"><rect x="{-tw / 2:.1f}" y="-15" width="{tw:.1f}" height="30" rx="7"/>'
                 f'<circle cx="{-tw / 2 + 10:.1f}" cy="-4" r="3.5"/><text class="plate" x="4" y="-1">{t["code"]}</text><text class="sub" x="0" y="11">{t["상태"]}</text></g>')
        if st == "on":
            g.append(f'<g class="typing" transform="translate({hx + tw / 2 + 6:.0f},{ty:.0f})"><rect class="bubbleS" x="-4" y="-12" width="40" height="22" rx="11"/><circle cx="8" cy="-1" r="3"/><circle cx="16" cy="-1" r="3"/><circle cx="24" cy="-1" r="3"/></g>')
        g.append("</g>")
        add(x + y + 1.4, "".join(g))
        where[t["code"]] = P(x + 0.9, y + 0.5, z0 + 1.0)
    return "".join(base) + "".join(s for _, s in sorted(items, key=lambda i: i[0]))


def svg(rec, ncase):
    """층마다 따로 그린 SVG 2장(2F, 1F). PC 는 나란히, 휴대폰은 위아래로 놓는다(배치는 CSS)."""
    where, out = {}, {}
    names = {b["id"]: b["이름"] for b in org["본부"]}
    for wing, label in [("A", "2F"), ("B", "1F")]:
        z, parts = FLOORS[wing], []
        x0, y0 = P(0, D, z)[0] - 24, P(0, 0, z + WALL)[1] - 30
        x1, y1 = P(W, 0, z)[0] + 24, P(W, D, z)[1] + 44
        if wing == "A":  # 하늘 그라데이션은 문서 전체에서 한 번만 정의
            parts.append('<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)"/><stop offset="1" stop-color="var(--sky2)"/></linearGradient></defs>')
        parts.append(f'<rect class="sky" x="{x0:.0f}" y="{y0:.0f}" width="{x1 - x0:.0f}" height="{y1 - y0:.0f}"/>')
        gx, gy = P(W / 2, D / 2, z - 0.6)
        parts.append(f'<ellipse class="ground" cx="{gx:.0f}" cy="{gy + 24:.0f}" rx="{(W + D) * C * .46:.0f}" ry="{(W + D) * H * .56:.0f}"/>')
        staff = next(b["팀"] for b in org["본부"] if b["id"] == wing)
        parts.append(f'<g class="level">{floor(wing, z, names[wing], f"{label}  {names[wing]}", staff, where)}</g>')
        lx, ly = P(W, D, z - 0.5)
        parts.append(f'<text class="fl" x="{lx + 16:.0f}" y="{ly - 6:.0f}">{label}</text><text class="fln" x="{lx + 16:.0f}" y="{ly + 14:.0f}">{names[wing]}</text>')
        out[wing] = (f"{x0:.0f} {y0:.0f} {x1 - x0:.0f} {y1 - y0:.0f}", parts, f"{label} {names[wing]} {len(staff)}명")
    # 업무 흐름(2F): RADAR→DECODER 가동, 이후 예정
    flow = [where[c] for c in org["흐름"]]
    live = f"M{flow[0][0]:.0f},{flow[0][1]:.0f} L{flow[1][0]:.0f},{flow[1][1]:.0f}"
    later = "M" + " L".join(f"{a:.0f},{b:.0f}" for a, b in flow[1:])
    out["A"][1].append(f'<path class="flow later" d="{later}"/><path class="flow" d="{live}"/>'
                       f'<g><rect class="env" x="-9" y="-6" width="18" height="12" rx="2"/><path d="M-9,-6 L0,1 L9,-6" fill="none" stroke="#6a4a08" stroke-width="1.2"/>'
                       f'<animateMotion dur="3.2s" repeatCount="indefinite" path="{live}"/></g>')
    # 2F 상황판 글자(벽면 위)
    sx, sy = P(10.9, 0.03, FLOORS["A"] + 2.25)
    out["A"][1].append(f'<g class="holo" transform="matrix(0.866,0.5,0,1,{sx:.1f},{sy:.1f})"><text x="0" y="0">TODAY</text>'
                       f'<text class="big" x="0" y="22">추천 공고 {rec}</text><text x="0" y="40">DECODER 분석 {ncase}건</text></g>')
    return "".join(f'<svg class="map" viewBox="{vb}" role="img" aria-label="JARVIS 빌딩 {lab}">' + "".join(parts) + "</svg>" for vb, parts, lab in (out["A"], out["B"]))


def docs(folder):
    """ArtifactData out_dir 로 저장된 문서들({id, data} 또는 data 자체)."""
    return [(lambda j: j.get("data", j))(json.loads(f.read_text(encoding="utf-8"))) for f in sorted(folder.glob("*.json"))] if folder.is_dir() else []


def night(d):
    """NEXUS daily 문서 한 줄 요약(회차기록 형식·예전 형식 모두)."""
    r = d.get("회차기록")
    if not r:
        return f"{d.get('산업군', '')} 새로 {d.get('추가', 0)}곳 — {str(d.get('요약', ''))[:300]}"
    s = lambda k: sum(int(x.get(k) or 0) for x in r)
    return f"{len(r)}회차 · 1차 후보 +{s('후보추가')} · 2차 검증 {s('검증')}곳(한국 {s('한국')}·아시아 {s('아시아')}·가능성 {s('가능성')}) · 인물 {s('인물')}명"


def briefing(kdir):
    """가상 사무실 첫 화면 '오늘 브리핑' 카드(직원별 한눈 요약 + 업무실 바로가기)."""
    page = {t["code"]: t.get("page") for b in org["본부"] for t in b["팀"]}
    items = {}
    for f in sorted((repo / "data").glob("2*.json")):
        for x in json.loads(f.read_text(encoding="utf-8"))["items"]:
            items[x["bidNtceNo"]] = x
    live = sorted((x for x in items.values() if (not x.get("입찰마감일시") or x["입찰마감일시"][:10] >= now.strftime("%Y-%m-%d")) and (x.get("배정예산") or 10**8) >= 10**8),
                  key=lambda x: str(x.get("입찰마감일시") or "9"))
    top = sorted(live, key=lambda x: "상중하".index(fit(x)[0]))  # 적합 상부터, 같은 등급은 마감 순
    cards = [{"code": "RADAR", "값": str(len(live)), "라벨": "마감 전 추천 공고", "줄": [f"[{fit(x)[0]}] {x['사업명'][:26]} · 마감 {str(x.get('입찰마감일시') or '미정')[5:10]}" for x in top[:3]], "url": page["RADAR"]}]
    cases = [json.loads(p.read_text(encoding="utf-8")) for p in (repo / "decoder" / "analysis").glob("*.json")]
    nxt = sorted((e["날짜"], e["항목"], c["사업명"]) for c in cases for e in c["일정"] if len(e["날짜"]) == 10 and e["날짜"] >= now.strftime("%Y-%m-%d"))
    cards.append({"code": "DECODER", "값": str(len(cases)), "라벨": "분석한 공고", "줄": [f"{d[5:]} {i[:22]} ({n[:14]})" for d, i, n in nxt[:3]] or ["다가오는 일정 없음"], "url": page["DECODER"]})
    if kdir:
        b = max(docs(kdir / "atlas" / "briefs"), key=lambda b: b.get("날짜", ""), default=None)
        cards.append({"code": "ATLAS", "값": str(len(b.get("항목", []))) if b else "-", "라벨": f"{b['날짜']} 동향" if b else "동향 브리핑", "줄": (b.get("헤드라인", [])[:2] if b else []) + ["심층 리포트는 리서치실 '심층 리포트' 탭"], "url": page["ATLAS"]})
        d = max(docs(kdir / "nexus" / "daily"), key=lambda d: d.get("날짜", ""), default=None)
        pipe = [p for p in docs(kdir / "nexus" / "pipeline") if not p.get("시험")]
        cards.append({"code": "NEXUS", "값": str(sum(1 for p in pipe if (p.get("상태") or "발굴") == "발굴")), "라벨": "검토 대기 바이어·투자자", "줄": [f"{d.get('날짜')} {night(d)}"[:90]] if d else ["야간 발굴 기록 없음"], "url": page["NEXUS"]})
    cards.append({"code": "CHRONOS", "값": "→", "라벨": "공정·예산", "줄": ["공정 지연·예산 수익률은 관제실에서", "지연·임박 작업은 아침 카톡으로 알림"], "url": page["CHRONOS"]})
    links = [["업무 데스크(BABEL·MAESTRO·SCRIBE)", page["BABEL"]], ["운영 보드(환율·할 일·입찰 기록)", "https://claude.ai/artifact/R6sS9fpQa9UQn2Hzj7MKED"]]
    return {"시각": now.strftime("%m/%d %H:%M"), "카드": cards, "링크": links}


def knowledge(kdir):
    """직원별 대화용 업무 자료(짧은 글). kdir: 루틴이 ATLAS·NEXUS 저장소를 내려받아 둔 폴더(없으면 저장소 자료만)."""
    items = {}
    for f in sorted((repo / "data").glob("2*.json")):
        for x in json.loads(f.read_text(encoding="utf-8"))["items"]:
            items[x["bidNtceNo"]] = x
    live = [x for x in items.values() if not x.get("입찰마감일시") or x["입찰마감일시"][:10] >= now.strftime("%Y-%m-%d")]
    live.sort(key=lambda x: -(x.get("배정예산") or 0))
    kn = {"RADAR": f"[마감 전 공고 {len(live)}건, {now:%Y-%m-%d} 기준, 1억 이상=추천]\n" + "\n".join(
        f"- [{'추천' if (x.get('배정예산') or 10**8) >= 10**8 else '참고'}·적합 {fit(x)[0]}] {x['사업명']} | {x['공고기관']} | 예산 {(x.get('배정예산') or 0) / 1e8:.1f}억 | 마감 {str(x.get('입찰마감일시'))[:16]}" for x in live[:30])}
    cases = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((repo / "decoder" / "analysis").glob("*.json"))]
    kn["DECODER"] = "\n\n".join(
        f"[{c['사업명']}] ({c['bidNtceNo']}, {c['발주기관']}, 분석 {c['analyzedAt']})\n요약: {c['한줄요약']}\n평가: {c['평가']['방식']}\n"
        + "다가오는 일정: " + "; ".join(f"{e['날짜']} {e['항목']}" for e in c["일정"] if e["날짜"] >= now.strftime("%Y-%m-%d"))[:600]
        + "\n리스크: " + "; ".join(f"[{r['수준']}] {r['내용']}" for r in c["리스크"][:4])
        + "\n전략힌트: " + "; ".join(c["전략힌트"]) for c in cases) or "분석한 공고 없음"
    if kdir:
        briefs = sorted(docs(kdir / "atlas" / "briefs"), key=lambda b: b.get("날짜", ""), reverse=True)[:3]
        kn["ATLAS"] = "\n\n".join(f"[{b['날짜']} 브리핑] 헤드라인: " + " / ".join(b.get("헤드라인", [])) + "\n"
                                  + "\n".join(f"- ({i.get('산업')}·{i.get('국가') or i.get('권역')}) {i['제목']}: {i['요약']} [{i.get('출처명')}, {i.get('발행일')}]" for i in b.get("항목", []))
                                  for b in briefs)[:9000] or "브리핑 없음"
        lib = docs(kdir / "atlas" / "library")
        if lib:
            kn["ATLAS"] += "\n\n[제안 조사 자료] " + "; ".join(f"{l.get('사업명')}(대상 {','.join(l.get('대상국가', []))}, 조사필요: {', '.join(l.get('조사필요', []))})" for l in lib)
        rows = [r for c in docs(kdir / "nexus" / "contacts") for r in c.get("rows", [])]
        pipe = [p for p in docs(kdir / "nexus" / "pipeline") if not p.get("시험")]
        daily = sorted(docs(kdir / "nexus" / "daily"), key=lambda d: d.get("날짜", ""), reverse=True)[:3]
        projs = [p for p in docs(kdir / "nexus" / "projects") if not p.get("시험")]
        cnt = lambda xs, k, n=8: ", ".join(f"{a} {b}" for a, b in collections.Counter(x.get(k) or "미상" for x in xs).most_common(n))
        kn["NEXUS"] = (f"[네트워크 DB] {len(rows)}명 · 유형: {cnt(rows, '유형')} · 산업: {cnt(rows, '산업대')} · 국가: {cnt(rows, '국가', 12)} · 관계: {cnt(rows, '관계단계')}\n"
                       f"[발굴 DB] {len(pipe)}건 · 매일 자동 발굴 {sum(1 for p in pipe if p.get('발굴경로') == '매일 발굴')} / 프로젝트 발굴 {sum(1 for p in pipe if p.get('발굴경로') != '매일 발굴')} · 상태: {cnt(pipe, '상태')} · 산업군: {cnt(pipe, '산업군')}\n"
                       + "".join(f"[야간 발굴 {d.get('날짜')}] {night(d)}\n" for d in daily)
                       + "[프로젝트] " + ("; ".join(f"{p.get('이름')}({p.get('목적')}, {p.get('국가') or p.get('지역')}, 참가기업 {len(p.get('companies', []))}곳)" for p in projs) or "없음")
                       + "\n※ 개인 연락처는 여기 없음. 명단은 NEXUS 매칭 센터에서 확인.")
    return kn


k, rec, ncase = kpis()
kdir = pathlib.Path(sys.argv[sys.argv.index("--knowledge") + 1]) if "--knowledge" in sys.argv else None
data = {"본부": org["본부"], "kpi": k, "지식": knowledge(kdir), "지식시각": now.strftime("%Y-%m-%d %H:%M"), "브리핑": briefing(kdir)}
tpl = (root / "office.tpl.html").read_text(encoding="utf-8")
html = tpl.replace("__SVG__", svg(rec, ncase)).replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
(root / "office.html").write_text(html, encoding="utf-8")
print(root / "office.html", f"{len(html) // 1024}KB")
