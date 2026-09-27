"""org/org.json + 수집·분석 데이터 → org/office.html (JARVIS 가상 사무실, 아이소메트릭 지도). 사용: python org/build_office.py"""
import base64, datetime as dt, json, pathlib

root = pathlib.Path(__file__).resolve().parent
repo = root.parent
org = json.loads((root / "org.json").read_text(encoding="utf-8"))
KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)

TW, TH = 280, 140                      # 책상 한 칸(아이소메트릭 타일) 가로·세로
WINGS = {"A": (0, 0), "B": (0, 640)}   # 본부별 바닥 원점
SLOTS = [(0, 2), (1, 1), (2, 0), (4, 1), (3, 2), (2, 3)]  # 앞줄 3 + 뒷줄 3을 엇갈려 배치, 업무 흐름은 뱀 모양
C0, C1, R0, R1 = -0.7, 4.7, -0.7, 3.7                      # 본부 바닥 범위


def pos(wing, c, r):
    ox, oy = WINGS[wing]
    return ox + (c - r) * TW / 2, oy + (c + r) * TH / 2


def pts(ps):
    return " ".join(f"{x:.0f},{y:.0f}" for x, y in ps)


def avatar(name):
    return "data:image/png;base64," + base64.b64encode((root / "avatars" / f"{name}.png").read_bytes()).decode()


def kpis():
    """RADAR·DECODER의 오늘 지표 (빌드 시점 기준)"""
    items = {}
    for f in sorted((repo / "data").glob("2*.json")):
        for x in json.loads(f.read_text(encoding="utf-8"))["items"]:
            items[x["bidNtceNo"]] = x
    def live(x):
        d = x.get("입찰마감일시") or ""
        return not d or dt.datetime.fromisoformat(d).replace(tzinfo=KST) >= now
    rec = sum(1 for x in items.values() if live(x) and (x.get("배정예산") or 10**8) >= 10**8)
    cases = [json.loads(p.read_text(encoding="utf-8")) for p in (repo / "decoder" / "analysis").glob("*.json")]
    nxt = sorted((e["날짜"], e["항목"]) for c in cases for e in c["일정"]
                 if len(e["날짜"]) == 10 and e["날짜"] >= now.strftime("%Y-%m-%d"))
    dd = (dt.date.fromisoformat(nxt[0][0]) - now.date()).days if nxt else None
    return {
        "RADAR": [[f"{rec}", "마감 전 추천 공고"], [f"{len(items)}", "누적 수집"]],
        "DECODER": [[f"{len(cases)}", "분석한 공고"], [f"D-{dd}" if dd is not None else "-", (nxt[0][1].split(" — ")[0][:18] if nxt else "다가오는 일정 없음")]],
    }, rec, len(cases)


def svg(rec, ncase):
    staff = [(b["id"], t) for b in org["본부"] for t in b["팀"]]
    where, parts, sprites = {}, [], []
    for wing in WINGS:
        members = [t for w, t in staff if w == wing]
        corners = [pos(wing, C0, R0), pos(wing, C1, R0), pos(wing, C1, R1), pos(wing, C0, R1)]
        parts.append(f'<polygon class="flr" points="{pts(corners)}"/>')
        grid = [f'<line x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}"/>'
                for k in [i / 2 for i in range(0, 10)] for a, b in [(pos(wing, k, R0), pos(wing, k, R1))]]
        grid += [f'<line x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}"/>'
                 for k in [i / 2 for i in range(0, 8)] for a, b in [(pos(wing, C0, k), pos(wing, C1, k))]]
        parts.append(f'<g class="grid">{"".join(grid)}</g>')
        lx, ly = pos(wing, C0, R1)
        name = next(b["이름"] for b in org["본부"] if b["id"] == wing)
        parts.append(f'<text class="wing" x="{lx + 10:.0f}" y="{ly - 16:.0f}">{name}</text>')
        for t, (c, r) in zip(members, SLOTS):
            x, y = pos(wing, c, r)
            where[t["code"]] = (x, y)
            sprites.append((y, t, x))
    # 업무 흐름 선 (RADAR→DECODER는 가동 중, 이후는 예정)
    flow = [where[c] for c in org["흐름"]]
    live = f"M{flow[0][0]:.0f},{flow[0][1] - 6:.0f} L{flow[1][0]:.0f},{flow[1][1] - 6:.0f}"
    later = "M" + " L".join(f"{x:.0f},{y - 6:.0f}" for x, y in flow[1:])
    parts.append(f'<path class="flow later" d="{later}"/><path class="flow" id="flowLive" d="{live}"/>'
                 f'<g><rect class="env" x="-9" y="-6" width="18" height="12" rx="2"/><path d="M-9,-6 L0,1 L9,-6" fill="none" stroke="#6a4a08" stroke-width="1.2"/>'
                 f'<animateMotion dur="3.2s" repeatCount="indefinite" path="{live}"/></g>')
    # 복도 중앙 상황판(홀로그램)
    hx, hy = pos("A", C1, R0)[0] - 90, pos("A", C0, R0)[1] + 10
    parts.append(f'<g class="holo"><ellipse cx="{hx:.0f}" cy="{hy + 70:.0f}" rx="70" ry="16" fill="var(--holo-soft)" stroke="var(--line)"/>'
                 f'<rect x="{hx - 70:.0f}" y="{hy - 30:.0f}" width="140" height="92" rx="8" fill="var(--holo-soft)" stroke="var(--holo)" stroke-opacity=".5"/>'
                 f'<text x="{hx:.0f}" y="{hy - 10:.0f}">TODAY</text><text class="big" x="{hx:.0f}" y="{hy + 18:.0f}">{rec}</text>'
                 f'<text x="{hx:.0f}" y="{hy + 34:.0f}">추천 공고</text><text x="{hx:.0f}" y="{hy + 52:.0f}">분석 {ncase}건</text></g>')
    for y, t, x in sorted(sprites, key=lambda s: s[0]):
        st = {"근무 중": "on", "스킬 보유": "skill"}.get(t["상태"], "off")
        w, h, side = 62, 31, 24
        top = [(x, y - h), (x + w, y), (x, y + h), (x - w, y)]
        g = [f'<g class="desk {st}" data-code="{t["code"]}" tabindex="0" role="button" aria-label="{t["code"]} {t["팀"]} ({t["상태"]})">',
             f'<ellipse class="ring" cx="{x:.0f}" cy="{y + 6:.0f}" rx="78" ry="39"/>',
             f'<image data-av="{t["avatar"]}" href="{avatar(t["avatar"])}" x="{x - 50:.0f}" y="{y - 112:.0f}" width="100" height="100"/>',
             f'<polygon class="sideL" points="{pts([(x - w, y), (x, y + h), (x, y + h + side), (x - w, y + side)])}"/>',
             f'<polygon class="sideR" points="{pts([(x, y + h), (x + w, y), (x + w, y + side), (x, y + h + side)])}"/>',
             f'<polygon class="top" points="{pts(top)}"/>',
             f'<polygon class="mon" points="{pts([(x - 30, y - 10), (x + 4, y - 27), (x + 4, y - 47), (x - 30, y - 30)])}"/>',
             f'<text class="plate" x="{x:.0f}" y="{y + h + side + 20:.0f}">{t["code"]}</text>',
             f'<text class="sub" x="{x:.0f}" y="{y + h + side + 35:.0f}">{t["팀"]}</text>']
        if st == "on":
            g.append(f'<g class="typing" transform="translate({x + 38:.0f},{y - 108:.0f})"><rect class="bubbleS" x="-4" y="-12" width="40" height="22" rx="11"/>'
                     '<circle cx="8" cy="-1" r="3"/><circle cx="16" cy="-1" r="3"/><circle cx="24" cy="-1" r="3"/></g>')
        else:
            g.append(f'<text class="tag {st}" x="{x:.0f}" y="{y - 116:.0f}">{t["상태"]}</text>')
        parts.append("".join(g) + "</g>")
    xs = [pos(w, c, r)[0] for w in WINGS for c in (C0, C1) for r in (R0, R1)]
    ys = [pos(w, c, r)[1] for w in WINGS for c in (C0, C1) for r in (R0, R1)]
    vb = f"{min(xs) - 20:.0f} {min(ys) - 40:.0f} {max(xs) - min(xs) + 40:.0f} {max(ys) - min(ys) + 60:.0f}"
    return (f'<svg class="map" viewBox="{vb}" role="img" aria-label="JARVIS 가상 사무실 지도: 제안서 준비 본부 6명, 사업 수행 본부 5명">'
            + "".join(parts) + "</svg>")


k, rec, ncase = kpis()
data = {"본부": org["본부"], "kpi": k}
tpl = (root / "office.tpl.html").read_text(encoding="utf-8")
html = tpl.replace("__SVG__", svg(rec, ncase)).replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
(root / "office.html").write_text(html, encoding="utf-8")
print(root / "office.html", f"{len(html) // 1024}KB")
