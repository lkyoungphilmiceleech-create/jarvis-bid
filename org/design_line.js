// ── 디자인 라인 (PRISM 탭) — 별도 파일, python org/build_prism.py 가 prism.html 에 붙인다
// 0 기반 → 1 레퍼런스 → 2 키비주얼 → 3 응용 세트 → 4 발주 패키지. 1차: 0단계(브리프·품목 규격 사전) + 전체 뼈대.
// 1·2단계는 '시안 작업' 기록(briefs/{id})을 그대로 읽고, 이 탭은 db line/{id}(id = briefs id)·linespec/{key} 에만 쓴다.
// prism.tpl.html 의 공용 도구(db·tab·briefs·refs·tasks·esc·opt·http·imgOf·refCard·put·pick·latest·showTab)를 쓴다.
// 금액·업체 연락처는 두지 않는다 — 발주 금액·업체는 관제실 발주서에서 다룬다.
const LSTEP = [["기반", "브리프·품목·규격"], ["레퍼런스", "추천 3개·디자인 방향"], ["키비주얼", "시안 생성·선택"], ["응용 세트", "품목별 시안·확정"], ["발주 패키지", "사양서·인쇄 PDF"]];
const LREADY = 3; // 이 단계부터는 아직 준비 중
const LRATIO = ["1:1", "4:5", "3:4", "2:3", "1:2", "9:16", "4:3", "3:2", "16:9", "2:1", "21:9"];
// 규격 초안 — 인쇄소·매체 사양을 확인해 '품목 규격 사전'에서 고쳐 쓴다(고친 값은 db linespec/{key}). 크기: 인쇄 mm, 디지털 px. h=0 은 길이 가변
const SPEC0 = [
  {key: "poster-a2", 이름: "포스터 A2", 분류: "인쇄", w: 420, h: 594, 단위: "mm", 재단: 3, 해상도: "300dpi", 색: "CMYK", 파일: "PDF (재단 여백 포함)", 비율: "3:4", 종류: "포스터", 메모: "글자·로고는 재단선에서 안쪽으로 5mm 이상 띄웁니다."},
  {key: "leaflet-3", 이름: "3단 접지 리플릿 (A4)", 분류: "인쇄", w: 297, h: 210, 단위: "mm", 재단: 3, 해상도: "300dpi", 색: "CMYK", 파일: "PDF 2쪽 (겉면·안면 펼침)", 비율: "4:3", 종류: "리플렛", 메모: "펼침 크기 기준, 접으면 약 99×210mm. 안으로 접혀 들어가는 면은 2~3mm 좁게(예: 100·100·97mm) — 접지 방식은 인쇄소 확인."},
  {key: "xbanner", 이름: "X배너", 분류: "실사출력", w: 600, h: 1800, 단위: "mm", 재단: 0, 해상도: "실제 크기 100~150dpi", 색: "CMYK", 파일: "PDF 또는 JPG", 비율: "1:2", 종류: "부스 그래픽", 메모: "생성은 1:2로 하고 1:3으로 늘려 맞춥니다. 네 모서리 고리 자리와 맨 아래(거치대에 가림)에는 중요한 글자를 두지 않습니다 — 업체 확인."},
  {key: "directory-b5", 이름: "디렉토리북 B5", 분류: "인쇄(책자)", w: 182, h: 257, 단위: "mm", 재단: 3, 해상도: "300dpi", 색: "CMYK", 파일: "PDF (낱쪽, 재단 여백 포함)", 비율: "3:4", 종류: "", 메모: "4×6배판(188×257mm)과 다릅니다. 쪽수(중철은 4의 배수)·책등 두께(무선 제본)는 인쇄소 확인."},
  {key: "insta-card", 이름: "인스타그램 카드뉴스", 분류: "디지털", w: 1080, h: 1350, 단위: "px", 재단: 0, 해상도: "픽셀 기준", 색: "RGB", 파일: "PNG·JPG", 비율: "4:5", 종류: "SNS 카드", 메모: "한 묶음 최대 20장. 프로필 격자에서는 3:4로 잘려 보이니 핵심은 가운데에 둡니다."},
  {key: "fb-card", 이름: "페이스북 카드뉴스", 분류: "디지털", w: 1080, h: 1350, 단위: "px", 재단: 0, 해상도: "픽셀 기준", 색: "RGB", 파일: "PNG·JPG", 비율: "4:5", 종류: "SNS 카드", 메모: "정사각형(1080×1080)도 됩니다. 인스타그램 카드와 같은 원본을 함께 씁니다."},
  {key: "newsletter", 이름: "웹용 뉴스레터", 분류: "디지털", w: 600, h: 0, 단위: "px", 재단: 0, 해상도: "2배(폭 1200px)로 제작", 색: "RGB", 파일: "JPG·PNG (+ HTML)", 비율: "2:1", 종류: "웹 배너", 메모: "본문 폭 600px, 비율은 머리 이미지 기준. 글은 이미지가 아닌 텍스트로 넣습니다(이미지 차단·검색·접근성). 이미지 한 장 1MB 이하 권장."},
];
document.head.insertAdjacentHTML("beforeend", `<style>
.lmap{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px}
.lmap div{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--glass2);display:flex;flex-direction:column;gap:2px;min-width:0}
.lmap div.wait{border-style:dashed;opacity:.7}
.lmap b{font:700 12px var(--hud);letter-spacing:.06em;color:var(--holo)}
.lmap .n{font:700 22px var(--hud);color:var(--ink)}
.lsteps{display:flex;gap:4px;flex-wrap:wrap}
.lsteps span{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.lsteps span.done{background:var(--holo-soft);color:var(--holo);border-color:var(--holo)}
.lsteps span.now{border-color:var(--amber);color:var(--amber)}
.card.wait{border-style:dashed}
.ltbl{overflow-x:auto;max-width:100%}
.ltbl table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px}
.ltbl th,.ltbl td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.ltbl th{color:var(--muted);font-weight:500;white-space:nowrap}
.ltbl td:first-child{min-width:130px}
.lkv{max-width:420px}.lkv img{width:100%;display:block;border-radius:10px;border:1px solid var(--line)}
</style>`);

let lines = [], lspec = {}, lcur = null, lview = "card", lnew = false, ledit = false, lsedit = null, lbusy = false, lmsg = "";
try { lcur = localStorage.getItem("prism-lcur"); lview = localStorage.getItem("prism-lview") || "card"; } catch {}
const lsay = m => { lmsg = m; if ($("lnMsg")) $("lnMsg").textContent = m; };
// 기본 규격 + 디자인팀이 고친·추가한 규격(linespec)
const lSpecs = () => [...SPEC0.map(s => ({...s, ...(lspec[s.key] || {}), key: s.key, 기본: true})), ...Object.entries(lspec).filter(([k]) => !SPEC0.some(s => s.key === k)).map(([k, v]) => ({...v, key: k}))];
const lSize = s => s.h > 0 ? `${s.w}×${s.h}${s.단위}` : `폭 ${s.w}${s.단위}`;
const lWork = s => { if (s.단위 !== "mm" || !(s.h > 0)) return s.단위 === "px" && /2배/.test(s.해상도 || "") ? `폭 ${s.w * 2}px` : "-";
  const r = +s.재단 || 0, w = s.w + 2 * r, h = s.h + 2 * r, dpi = parseInt(s.해상도);
  return `${w}×${h}mm${dpi > 0 ? ` · 약 ${Math.round(w / 25.4 * dpi)}×${Math.round(h / 25.4 * dpi)}px` : ""}`; };
const lDone = (c, b) => [!!(c.품목 || []).length, !!(b.추천?.picks || []).length, !!b.kv?.id, false, false];
const lStage = (c, b) => { const i = lDone(c, b).indexOf(false); return i < 0 ? 4 : i; };
const lCards = () => lines.map(c => ({c, b: latest(c.id)})).filter(x => x.b.id).sort((x, y) => String(x.b.마감 || "9").localeCompare(String(y.b.마감 || "9")));

function drawLine(force) {
  const box = $("line"); if (!box) return;
  const a = document.activeElement; if (!force && (lnew || ledit || lsedit || box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return; // 양식을 쓰는 중에는 db 변경으로 다시 그리지 않는다
  const specs = lSpecs();
  box.innerHTML = `<div class="row"><h2 style="flex:1;min-width:0">디자인 라인</h2><div class="seg" role="group" aria-label="보기">${[["card", "작업 카드"], ["spec", "품목 규격 사전"]].map(([k, l]) => `<button type="button" data-lv="${k}" aria-pressed="${lview === k}">${l}</button>`).join("")}</div></div>
    <p class="note">레퍼런스 → 키비주얼 → 응용 세트 → 발주 패키지를 작업 카드 하나로 이어 갑니다. 지금은 0~2단계가 작동하고 3·4단계는 차례로 붙입니다. 금액·업체 연락처는 관제실에서 다룹니다.</p>
    <p class="note warn" id="lnMsg">${esc(lmsg)}</p>
    ${lview === "spec" ? lSpecView(specs) : lCardView(specs)}`;
}

// ── 작업 카드
function lCardView(specs) {
  const all = lCards(), counts = LSTEP.map((_, i) => all.filter(x => lStage(x.c, x.b) === i).length);
  const map = `<div class="lmap">${LSTEP.map(([n, d], i) => `<div class="${i >= LREADY ? "wait" : ""}"><b>${i} · ${esc(n)}</b><span class="n">${counts[i]}</span><span class="note">${esc(d)}${i >= LREADY ? " · 준비 중" : ""}</span></div>`).join("")}</div>`;
  const pickRow = `<div class="row"><select id="lnSel" aria-label="작업 카드" style="flex:1;min-width:0">${opt(all.map(({c, b}) => [c.id, `${b.제목 || "(제목 없음)"} · ${lStage(c, b)}단계${b.마감 ? ` · ${b.마감}` : ""}`]), lcur, all.length ? "작업 카드를 고르세요" : "작업 카드가 없습니다")}</select><button class="btn primary" type="button" id="lnNew" ${db ? "" : "disabled"}>+ 새 작업 카드</button></div>`;
  if (lnew) return map + pickRow + lForm(specs);
  const x = all.find(x => x.c.id === lcur);
  if (!x) return map + pickRow + `<p class="empty">${db ? "작업 카드를 고르거나 새로 만드세요. 관제실에서 배정된 디자인 업무나 시안 작업 중인 요청에서도 시작할 수 있습니다." : "이 화면에서는 저장소에 연결할 수 없습니다. claude.ai에서 열어 주세요."}</p>`;
  return map + pickRow + (ledit ? lForm(specs, x) : lDetail(x, specs));
}
function lForm(specs, x) {
  const c = x?.c || {}, b = x?.b || {}, sel = new Set(c.품목 || []);
  const from = lnew ? [...briefs.filter(b => !lines.some(c => c.id === b.id) && b.상태 !== "완료").map(b => [b.id, `${b.제목} (시안 작업)`]), ...tasks.filter(t => LIVE(t) && !briefs.some(b => b.id === t.id)).map(t => [t.id, `${t.제목} (관제실 배정)`])] : [];
  return `<div class="card"><h3>${lnew ? "새 작업 카드 — 0단계 브리프" : "브리프 고치기"}</h3>
    <div class="form">${lnew ? `<label class="wide">시작<select id="lnFrom">${opt(from, "", "새 요청으로 시작")}</select></label>` : ""}
      <label class="wide">제목${lnew ? " (기존 요청이면 비워도 됩니다)" : ""}<input id="lnTitle" maxlength="120" value="${esc(b.제목 || "")}" placeholder="예) 2026 K-콘텐츠 마켓 공동관 홍보물"></label>
      <label>행사·프로젝트<input id="lnProj" maxlength="120" value="${esc(b.프로젝트 || "")}"></label>
      <label>마감<input id="lnDue" type="date" value="${esc(b.마감 || "")}"></label>
      <label>언어<select id="lnLang">${opt(["국문", "영문", "국영문 병기", "기타"], c.언어 || "국영문 병기")}</select></label>
      <label>행사 일시·장소 (글자 레이어용)<input id="lnWhen" maxlength="160" value="${esc(c.일시장소 || "")}" placeholder="2026.11.5 · LA"></label>
      <label>주최·주관 (로고 자리)<input id="lnHost" maxlength="160" value="${esc(c.주최 || "")}"></label>
      <label>톤<input id="lnTone" maxlength="80" value="${esc(b.톤 || "")}" placeholder="미니멀, 네온, 신뢰감"></label>
      <label class="wide">설명<textarea id="lnDesc" maxlength="2000">${esc(b.설명 || "")}</textarea></label></div>
    <div class="hudlabel">품목 (규격은 '품목 규격 사전'에서 고칩니다)</div>
    <div class="chips">${specs.map(s => `<label><input type="checkbox" data-lp="${esc(s.key)}" ${sel.has(s.key) ? "checked" : ""}>${esc(s.이름)} <span class="note">${esc(lSize(s))}</span></label>`).join("")}</div>
    <div class="row"><button class="btn primary" type="button" id="lnSave" ${lbusy ? "disabled" : ""}>${lbusy ? "저장 중…" : "저장"}</button><button class="btn" type="button" id="lnCancel">취소</button></div></div>`;
}
const lTable = (rows, head) => `<div class="ltbl"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
function lDetail({c, b}, specs) {
  const done = lDone(c, b), now = lStage(c, b), items = (c.품목 || []).map(k => specs.find(s => s.key === k) || {key: k, 이름: `${k} (사전에 없음)`, w: 0, h: 0, 단위: ""});
  const picks = (b.추천?.picks || []).map(p => [refs.find(r => r.id === p.id), p.이유]).filter(([r]) => r), g = (b.시안 || []).find(x => x.id === b.kv?.id), kvSrc = g && http(g.preview || g.url);
  const head = (i, extra = "") => `<div class="row"><h3 style="flex:1;min-width:0">${i} · ${esc(LSTEP[i][0])}</h3>${i >= LREADY ? '<span class="tag amber">준비 중</span>' : `<span class="tag${done[i] ? " go" : ""}">${done[i] ? "완료" : i === now ? "진행 중" : "대기"}</span>`}${extra}</div>`;
  const go = `<button class="btn" type="button" data-lgo="${esc(c.id)}">시안 작업에서 진행 →</button>`;
  return `<div class="card"><div class="row"><h3 style="flex:1;min-width:0">${esc(b.제목 || "(제목 없음)")}</h3><span class="note">${esc([b.프로젝트, b.마감 && `마감 ${b.마감} ${dday(b.마감)}`].filter(Boolean).join(" · "))}</span></div>
      <div class="lsteps">${LSTEP.map(([n], i) => `<span class="${done[i] ? "done" : i === now ? "now" : ""}">${i} ${esc(n)}</span>`).join("")}</div></div>
    <div class="card">${head(0, `<button class="btn" type="button" id="lnEdit">고치기</button>`)}
      <p class="note">${esc([c.언어, c.일시장소, c.주최 && `주최·주관 ${c.주최}`, b.톤 && `톤 ${b.톤}`].filter(Boolean).join(" · ") || "언어·일시·주최를 넣어 두면 2단계 글자 레이어에 씁니다.")}</p>
      ${items.length ? lTable(items.map(s => [esc(s.이름), esc(lSize(s)), esc(lWork(s)), esc([s.해상도, s.색].filter(Boolean).join(" · ")), esc(s.비율 || "")]), ["품목", "완성 크기", "작업 크기(재단 포함)", "해상도·색", "생성 비율"]) : '<p class="empty">품목을 골라 주세요.</p>'}</div>
    <div class="card">${head(1, go)}
      ${picks.length ? `<div class="refs">${picks.map(([r, why]) => refCard(r, why || " ")).join("")}</div>` : `<p class="empty">아직 추천이 없습니다. 시안 작업 ①·②에서 레퍼런스를 모으고 추천 3개를 받으세요.</p>`}
      ${b.추천?.방향 ? `<div class="dir">${esc(b.추천.방향)}</div>` : ""}</div>
    <div class="card">${head(2, go)}
      ${kvSrc ? `<div class="lkv"><img src="${esc(kvSrc)}" alt="선택한 키비주얼" loading="lazy"></div>` : `<p class="empty">${g ? "선택한 키비주얼의 미리보기를 아직 받지 못했습니다. 시안 작업 ③에서 [결과 이어 받기]를 눌러 주세요." : "선택한 키비주얼이 없습니다. 시안 작업 ③에서 만들고 [키비주얼로 선택]을 누르세요."}</p>`}
      <p class="note">다음 업그레이드: 배경 그래픽과 글자·로고 레이어 분리, 기관 브랜드킷 적용.</p></div>
    <div class="card wait">${head(3)}
      <p class="note">고른 품목마다 키비주얼을 규격에 맞게 펼친 시안(리플릿 펼침면, X배너 세로형, 디렉토리북 표지·내지, 카드뉴스 묶음)을 만들고, 팀장 이상이 버전을 확정합니다. 그 전까지는 시안 작업 ④ 홍보물 목업으로 분위기를 볼 수 있습니다.</p>
      ${items.length ? `<div class="chips">${items.map(s => `<span class="tag">${esc(s.이름)} · ${esc(s.비율 || "-")}</span>`).join("")}</div>` : ""}</div>
    <div class="card wait">${head(4)}
      <p class="note">확정 시안으로 사양서(품목·규격·수량·재질·후가공·납기 — 금액 없음)와 인쇄용 PDF를 만들어 구글 드라이브에 저장하고, 관제실 발주서로 넘깁니다. 아래는 지금 품목으로 만든 사양서 미리보기입니다.</p>
      ${items.length ? lTable(items.map(s => [esc(s.이름), esc(s.분류 || ""), esc(lSize(s)), esc(`${+s.재단 || 0}mm`), esc([s.해상도, s.색].filter(Boolean).join(" · ")), esc(s.파일 || "")]), ["품목", "분류", "완성 크기", "재단 여백", "해상도·색", "파일"]) : ""}</div>`;
}
// 관제실 배정 업무로 시작하면 briefs/{같은 id} 를 없을 때만 만든다(pick 과 같은 내용, 시안 작업의 선택은 그대로 둔다)
async function lFromTask(id, now) {
  const t = tasks.find(x => x.id === id); if (!t) throw 0;
  const r = {제목: String(t.제목 || ""), 마감: String(t.마감 || ""), 상태: "접수", 프로젝트: String(t.프로젝트 || ""), 설명: String(t.내용 || ""), 출처: "관제실", at: now, updatedAt: now};
  if (!(await db.doc(`briefs/${id}`).get()).exists) await db.doc(`briefs/${id}`).set(r); if (!briefs.some(b => b.id === id)) briefs.push({id, ...r});
}
async function lSave() {
  if (!db || lbusy) return;
  const v = id => ($(id)?.value || "").trim(), specs = lSpecs(), old = lnew ? [] : (lines.find(c => c.id === lcur)?.품목 || []).filter(k => !specs.some(s => s.key === k)); // 사전에서 빠진 품목은 체크박스가 없어 그대로 둔다
  const items = [...document.querySelectorAll("[data-lp]:checked")].map(x => x.dataset.lp).concat(old);
  let id = lnew ? v("lnFrom") : lcur;
  if (!id && !v("lnTitle")) { lsay("제목을 넣어 주세요."); return; }
  if (!items.length) { lsay("품목을 하나 이상 골라 주세요."); return; }
  const now = new Date().toISOString(), bf = {};
  [["제목", "lnTitle"], ["프로젝트", "lnProj"], ["마감", "lnDue"], ["톤", "lnTone"], ["설명", "lnDesc"]].forEach(([k, i]) => { if (v(i) || !lnew) bf[k] = v(i); });
  if (!lnew && !bf.제목) delete bf.제목; // 제목은 비울 수 없다
  const kinds = ["키비주얼", ...items.map(k => specs.find(s => s.key === k)?.종류).filter(Boolean)]; // 시안 작업 ④ 목업 종류와 맞춘다
  const ln = {언어: v("lnLang"), 일시장소: v("lnWhen"), 주최: v("lnHost"), 품목: items, updatedAt: now}; // 아래 drawLine 이 폼을 다시 그리기 전에 읽는다
  lbusy = true; lsay(""); drawLine(true);
  try {
    if (id) { if (!briefs.some(b => b.id === id)) await lFromTask(id, now); bf.종류 = [...new Set([...(latest(id).종류 || []), ...kinds])]; if (!(await put(id, bf))) throw 0; }
    else { id = "L" + Date.now().toString(36); const r = {제목: bf.제목, 마감: bf.마감 || "", 상태: "접수", 프로젝트: bf.프로젝트 || "", 설명: bf.설명 || "", 톤: bf.톤 || "", 종류: [...new Set(kinds)], 출처: "디자인 라인", at: now, updatedAt: now};
      await db.doc(`briefs/${id}`).set(r); if (!briefs.some(b => b.id === id)) briefs.push({id, ...r}); }
    if (lines.some(c => c.id === id)) await db.doc(`line/${id}`).update(ln); else await db.doc(`line/${id}`).set({...ln, at: now});
    const i = lines.findIndex(c => c.id === id); i < 0 ? lines.push({id, ...ln}) : Object.assign(lines[i], ln);
    lcur = id; lnew = ledit = false; try { localStorage.setItem("prism-lcur", id); } catch {} lsay("저장했습니다.");
  } catch { lsay("저장하지 못했습니다. 다시 눌러 주세요."); }
  lbusy = false; drawLine(true);
}

// ── 품목 규격 사전
function lSpecView(specs) {
  const s = lsedit === "new" ? {key: "", 분류: "인쇄", 단위: "mm", 재단: 3, 해상도: "300dpi", 색: "CMYK", 비율: "3:4"} : specs.find(x => x.key === lsedit);
  return `<p class="note">규격은 초안입니다. 인쇄소·매체 사양을 확인해 고쳐 주세요. 3단계 응용 시안과 4단계 사양서·인쇄 PDF가 이 표를 기준으로 만들어집니다.</p>
    ${s ? lSpecForm(s) : `<div class="row"><button class="btn primary" type="button" id="lnSpecNew" ${db ? "" : "disabled"}>+ 품목 추가</button></div>`}
    ${lTable(specs.map(x => [`<b>${esc(x.이름)}</b>${lspec[x.key] ? ` <span class="tag${x.기본 ? " amber" : ""}">${x.기본 ? "고침" : "추가"}</span>` : ""}<div class="note">${esc(x.분류 || "")}</div>`, esc(lSize(x)), esc(lWork(x)), esc([x.해상도, x.색].filter(Boolean).join(" · ")), esc(x.파일 || ""), esc(x.비율 || ""), `<span class="note">${esc(x.메모 || "")}</span>`,
      db ? `<div class="row"><button class="btn" type="button" data-lse="${esc(x.key)}">고치기</button>${lspec[x.key] ? `<button class="btn x" type="button" data-lsr="${esc(x.key)}">${x.기본 ? "기본값으로" : "삭제"}</button>` : ""}</div>` : ""]), ["품목", "완성 크기", "작업 크기(재단 포함)", "해상도·색", "파일", "생성 비율", "메모", ""])}`;
}
function lSpecForm(s) {
  return `<div class="card"><h3>${s.key ? `${esc(s.이름)} 규격 고치기` : "품목 추가"}</h3><div class="form">
    <label class="wide">품목 이름<input id="lsName" maxlength="60" value="${esc(s.이름 || "")}" placeholder="예) 에코백, 명찰, 부스 월"></label>
    <label>분류<select id="lsKind">${opt(["인쇄", "인쇄(책자)", "실사출력", "굿즈", "디지털"], s.분류 || "인쇄")}</select></label>
    <label>가로<input id="lsW" type="number" min="1" max="20000" value="${esc(s.w ?? "")}"></label>
    <label>세로 (0 = 가변)<input id="lsH" type="number" min="0" max="20000" value="${esc(s.h ?? "")}"></label>
    <label>단위<select id="lsUnit">${opt(["mm", "px"], s.단위 || "mm")}</select></label>
    <label>재단 여백(mm)<input id="lsBleed" type="number" min="0" max="20" value="${esc(s.재단 ?? 0)}"></label>
    <label>해상도<input id="lsDpi" maxlength="40" value="${esc(s.해상도 || "")}"></label>
    <label>색<select id="lsColor">${opt(["CMYK", "RGB", "별색 포함"], s.색 || "CMYK")}</select></label>
    <label>파일<input id="lsFile" maxlength="80" value="${esc(s.파일 || "")}"></label>
    <label>생성 비율<select id="lsRatio">${opt(LRATIO, s.비율 || "1:1")}</select></label>
    <label class="wide">메모 (인쇄소 확인 사항 등 — 금액·연락처는 적지 않습니다)<textarea id="lsMemo" maxlength="400">${esc(s.메모 || "")}</textarea></label></div>
    <div class="row"><button class="btn primary" type="button" id="lnSpecSave">저장</button><button class="btn" type="button" id="lnSpecCancel">취소</button></div></div>`;
}
async function lSpecSave() {
  if (!db) return; const v = id => ($(id)?.value || "").trim(), n = id => Number(v(id));
  const s = {이름: v("lsName"), 분류: v("lsKind"), w: n("lsW"), h: n("lsH"), 단위: v("lsUnit"), 재단: n("lsBleed"), 해상도: v("lsDpi"), 색: v("lsColor"), 파일: v("lsFile"), 비율: v("lsRatio"), 메모: v("lsMemo"), updatedAt: new Date().toISOString()};
  if (!s.이름) { lsay("품목 이름을 넣어 주세요."); return; }
  if (!(s.w > 0 && s.w <= 20000) || !(s.h >= 0 && s.h <= 20000) || !(s.재단 >= 0 && s.재단 <= 20)) { lsay("크기는 1~20000, 재단 여백은 0~20 사이 숫자로 넣어 주세요."); return; }
  const base = SPEC0.find(x => x.key === lsedit); if (base) s.종류 = base.종류;
  const key = lsedit === "new" ? "c" + Date.now().toString(36) : lsedit;
  try { await db.doc(`linespec/${key}`).set(s); lspec[key] = s; lsedit = null; lsay("규격을 저장했습니다."); } catch { lsay("저장하지 못했습니다."); }
  drawLine(true);
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || !$("line")?.contains(t)) return;
  if (t.dataset.lv) { lview = t.dataset.lv; lsedit = null; try { localStorage.setItem("prism-lview", lview); } catch {} lsay(""); drawLine(true); }
  if (t.id === "lnNew") { lnew = true; ledit = false; lsay(""); drawLine(true); }
  if (t.id === "lnEdit") { ledit = true; lsay(""); drawLine(true); }
  if (t.id === "lnCancel") { lnew = ledit = false; lsay(""); drawLine(true); }
  if (t.id === "lnSave") lSave();
  if (t.dataset.lgo) { await pick(t.dataset.lgo); showTab("work"); }
  if (t.id === "lnSpecNew") { lsedit = "new"; drawLine(true); }
  if (t.dataset.lse) { lsedit = t.dataset.lse; drawLine(true); }
  if (t.id === "lnSpecCancel") { lsedit = null; drawLine(true); }
  if (t.id === "lnSpecSave") lSpecSave();
  if (t.dataset.lsr && confirm(SPEC0.some(s => s.key === t.dataset.lsr) ? "이 품목을 기본 규격으로 되돌릴까요?" : "이 품목을 지울까요? 이미 고른 작업 카드에는 '사전에 없음'으로 남습니다.")) {
    const k = t.dataset.lsr; try { await db.doc(`linespec/${k}`).delete(); delete lspec[k]; } catch { lsay("지우지 못했습니다."); } drawLine(true); }
});
document.addEventListener("change", e => { if (e.target.id === "lnSel") { lcur = e.target.value; lnew = ledit = false; try { localStorage.setItem("prism-lcur", lcur); } catch {} lsay(""); drawLine(true); } });
function lineInit() {
  db.collection("line").onSnapshot(s => { lines = s.docs.map(d => ({id: d.id, ...structuredClone(d.data())})); if (tab === "line") drawLine(); });
  db.collection("linespec").onSnapshot(s => { lspec = Object.fromEntries(s.docs.map(d => [d.id, structuredClone(d.data())])); if (tab === "line") drawLine(); });
}
if (db) lineInit(); // PRISM 시작이 먼저 끝났으면 여기서 시작(아니면 PRISM이 부른다)
if (tab === "line") drawLine();
