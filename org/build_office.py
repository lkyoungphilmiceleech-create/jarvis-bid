"""org/org.json + 수집·분석 데이터 → org/office.html (JARVIS 빌딩 2층 조감도). 사용: python org/build_office.py
아이소메트릭 3D 좌표(X: 오른쪽 아래, Y: 왼쪽 아래, Z: 위)를 화면 좌표로 투영해 SVG를 만든다."""
import base64, datetime as dt, json, pathlib

root = pathlib.Path(__file__).resolve().parent
repo = root.parent
org = json.loads((root / "org.json").read_text(encoding="utf-8"))
KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)

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
         "B": [(1.0, 2.3), (4.0, 2.3), (7.0, 2.3), (4.0, 6.7), (1.0, 6.7)]}


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
        g = [f'<g class="desk {st}" data-code="{t["code"]}" tabindex="0" role="button" aria-label="{t["code"]} {t["팀"]} ({t["상태"]})">']
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
    where, parts = {}, []
    # 하늘과 땅 그림자
    x0, y0 = P(0, D, 0)[0] - 60, P(0, 0, FLOORS["A"] + WALL)[1] - 70
    x1, y1 = P(W, 0, 0)[0] + 60, P(W, D, 0)[1] + 50
    parts.append('<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)"/><stop offset="1" stop-color="var(--sky2)"/></linearGradient></defs>')
    parts.append(f'<rect class="sky" x="{x0:.0f}" y="{y0:.0f}" width="{x1 - x0:.0f}" height="{y1 - y0:.0f}"/>')
    gx, gy = P(W / 2, D / 2, -0.6)
    parts.append(f'<ellipse class="ground" cx="{gx:.0f}" cy="{gy + 40:.0f}" rx="{(W + D) * C * .62:.0f}" ry="{(W + D) * H * .7:.0f}"/>')
    # 층을 잇는 기둥(엘리베이터 코어) 점선
    for (cx, cy) in [(0, 0), (W, 0), (0, D), (W, D)]:
        a, b = P(cx, cy, 0), P(cx, cy, FLOORS["A"] - 0.5)
        parts.append(f'<line class="core" x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}"/>')
    names = {b["id"]: b["이름"] for b in org["본부"]}
    for wing, label in [("B", "1F"), ("A", "2F")]:
        staff = next(b["팀"] for b in org["본부"] if b["id"] == wing)
        parts.append(f'<g class="level">{floor(wing, FLOORS[wing], names[wing], f"{label}  {names[wing]}", staff, where)}</g>')
        lx, ly = P(W, D, FLOORS[wing] - 0.5)
        parts.append(f'<text class="fl" x="{lx + 16:.0f}" y="{ly - 6:.0f}">{label}</text><text class="fln" x="{lx + 16:.0f}" y="{ly + 14:.0f}">{names[wing]}</text>')
    # 업무 흐름(2F): RADAR→DECODER 가동, 이후 예정
    flow = [where[c] for c in org["흐름"]]
    live = f"M{flow[0][0]:.0f},{flow[0][1]:.0f} L{flow[1][0]:.0f},{flow[1][1]:.0f}"
    later = "M" + " L".join(f"{a:.0f},{b:.0f}" for a, b in flow[1:])
    parts.append(f'<path class="flow later" d="{later}"/><path class="flow" d="{live}"/>'
                 f'<g><rect class="env" x="-9" y="-6" width="18" height="12" rx="2"/><path d="M-9,-6 L0,1 L9,-6" fill="none" stroke="#6a4a08" stroke-width="1.2"/>'
                 f'<animateMotion dur="3.2s" repeatCount="indefinite" path="{live}"/></g>')
    # 2F 상황판 글자(벽면 위)
    sx, sy = P(10.9, 0.03, FLOORS["A"] + 2.25)
    parts.append(f'<g class="holo" transform="matrix(0.866,0.5,0,1,{sx:.1f},{sy:.1f})"><text x="0" y="0">TODAY</text>'
                 f'<text class="big" x="0" y="22">추천 공고 {rec}</text><text x="0" y="40">DECODER 분석 {ncase}건</text></g>')
    vb = f"{x0:.0f} {y0:.0f} {x1 - x0:.0f} {y1 - y0:.0f}"
    return f'<svg class="map" viewBox="{vb}" role="img" aria-label="JARVIS 빌딩 조감도: 2층 제안서 준비 본부 6명, 1층 사업 수행 본부 5명">' + "".join(parts) + "</svg>"


k, rec, ncase = kpis()
data = {"본부": org["본부"], "kpi": k}
tpl = (root / "office.tpl.html").read_text(encoding="utf-8")
html = tpl.replace("__SVG__", svg(rec, ncase)).replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
(root / "office.html").write_text(html, encoding="utf-8")
print(root / "office.html", f"{len(html) // 1024}KB")
