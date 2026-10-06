// ── 디자인 라인 4단계: 발주 패키지 (본부장님 결정 2026-10-05·06) — 별도 파일, build_prism.py 가 design_prompt.js 뒤에 붙인다
// 확정한 응용 세트(3단계)로 사양서(금액·업체 없음)와 품목별 파일을 만든다: 인쇄·실사출력 = 작업 크기(재단 여백 포함) PDF, 디지털 = 규격 픽셀 PNG.
// 파일은 글자·로고까지 한 장 그림으로 들어간 '발주 확인·교정용'이고 색은 RGB 다 — CMYK 변환·교정은 인쇄소 확인, 글자 편집 원본은 3단계 SVG.
// 저장: line/{id}.발주 {품목: {키: {수량, 소재, 후가공, 면, 납품일, 비고}}, 납품, 메모} · line/{id}.발주확정 · line/{id}.발주이력. 금액·업체·연락처는 관제실.
const OD_PDF = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js";
const OD_SIDE = ["단면", "양면", "해당 없음"];
const OD_ROLE = ["디자인팀장", "담당 PM", "관리자"];
const OD_F = [["수량", "수량", 20], ["소재", "소재·용지", 60], ["후가공", "후가공", 60], ["납품일", "납품일", 10], ["비고", "비고", 120]];
const OD_MAXPX = 7200; // 캔버스 긴 변 상한(브라우저 메모리) — 넘으면 해상도를 낮추고 표시한다
const OD_BAD = PR_BAD; // 이메일·전화·금액은 적지 않는다(design_prompt.js)
let odBusy = false, odMsgTxt = "", odTimer = null, odCM = "";
// 발주 파일은 확정한 응용 세트(가이드·품목·배치) 기준 — 확정 뒤 3단계를 고쳐도 다시 확정하기 전에는 확정본으로 만든다
const odG = c => c.세트확정?.가이드 ? setClean({...setGuideFrom(c), ...c.세트확정.가이드}) : setG(c);
const odItems = c => { const k = c.세트확정?.품목; return Array.isArray(k) && k.length ? k.map(x => lSpecs().find(s => s.key === x)).filter(Boolean) : kvItems(c); };
const odSet = (c, s) => (c.세트확정?.세트 || c.세트 || {})[s.key] || setItem(c, s);
const odSay = m => { odMsgTxt = m; if ($("odMsg")) $("odMsg").textContent = m; };
const odCard = () => lines.find(x => x.id === lcur);
const odName = c => String(latest(c.id).제목 || "발주").replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
// 품목 → 출력 방식. 인쇄 면(리플릿 표지 면 등)은 3단계 조립 면과 같다
function odOut(s) {
  const f = SET_FACE[s.key] || {}, w = +(f.w || s.w) || 0, h = +(f.h || s.h) || 0, dpi = parseInt(s.해상도) || (s.분류 === "실사출력" ? 100 : 300);
  if (s.단위 === "mm" && w > 0 && h > 0) { const b = +s.재단 || 0; return {kind: "pdf", w, h, b, dpi, 면: f.면 || "", label: `인쇄 PDF ${w + 2 * b}×${h + 2 * b}mm`}; }
  if (s.단위 === "px" && w > 0) { const x = /2배/.test(s.해상도 || "") ? 2 : 1; return {kind: "png", w: w * x, h: h > 0 ? h * x : 0, 면: "", label: `PNG 폭 ${w * x}px`}; }
  return {kind: "", label: "현장 크기 확인 후 규격 사전에 넣어 주세요"};
}
const odRow = (c, s) => { const f = c.브리프?.제작물?.[s.key] || {}, v = c.발주?.품목?.[s.key] || {}; return {수량: f.수량 || "", 소재: "", 후가공: "", 면: s.분류 === "디지털" ? "해당 없음" : "단면", 납품일: f.납품일 || "", 비고: f.언어 ? `언어: ${f.언어}` : "", ...v}; };
// 출력 크기에서 배경 원본이 몇 dpi(디지털은 몇 배)에 해당하는지 — 낮으면 Magnific 업스케일 뒤 다시 올리기를 권한다
function odRes(g, s, o) {
  const im = setImgs[g.배경], cv = setCanvas(s); if (!im?.naturalWidth || !o.kind) return null; const r = setRect(g, cv.W, cv.H); if (!r) return null;
  const per = im.naturalWidth / r.w; // 원본 픽셀 / 캔버스 단위
  if (o.kind === "pdf") { const v = Math.round(per * cv.W / o.w * 25.4); return {v, ok: v >= o.dpi * 0.66, txt: `배경 약 ${v}dpi (권장 ${o.dpi})`}; }
  const v = Math.round(per * cv.W / o.w * 100) / 100; return {v, ok: v >= 0.95, txt: `배경 ${v}배 (1배 이상 권장)`};
}
// 품목 한 장을 캔버스에 그린다 — 3단계 조립과 같은 배치(kvLast), 재단 여백만큼 배경·띠를 넓힌다. 글자는 페이지에 읽힌 서체로
async function odDraw(c, g, s, it, outW, bleedMm, faceMm) {
  const {lay} = setBuild(c, g, s, it), bu = faceMm ? bleedMm * lay.W / faceMm : 0, k = outW / lay.W, CW = Math.round((lay.W + 2 * bu) * k), CH = Math.round((lay.H + 2 * bu) * k);
  const cv = document.createElement("canvas"); cv.width = CW; cv.height = CH; const x = cv.getContext("2d"); x.fillStyle = "#1B1B22"; x.fillRect(0, 0, CW, CH);
  const im = await setImg(g.배경); if (im?.naturalWidth) { const r = setRect(g, lay.W + 2 * bu, lay.H + 2 * bu); if (r) x.drawImage(im, r.x * k, r.y * k, r.w * k, r.h * k); }
  if (lay.band) { x.fillStyle = lay.band.color; x.fillRect(0, (bu + lay.band.y) * k, CW, CH - (bu + lay.band.y) * k); }
  else if (lay.dark) { x.fillStyle = `rgba(0,0,0,${lay.dark})`; x.fillRect(0, 0, CW, CH); }
  try { await Promise.all([800, 500].map(w => document.fonts.load(`${w} 40px '${lay.font}'`, "가A"))); } catch {}
  x.fillStyle = lay.color; x.textBaseline = "alphabetic";
  lay.lines.forEach(l => { x.font = `${l.w} ${l.fs * k}px '${lay.font}', sans-serif`; x.textAlign = l.anchor === "middle" ? "center" : "left"; x.fillText(l.t, (bu + l.x) * k, (bu + l.y) * k); });
  for (const o of lay.logos) { const lg = new Image(); lg.src = o.u; try { await lg.decode(); } catch { continue; }
    const sc = Math.min(o.w / lg.naturalWidth, o.h / lg.naturalHeight), w = lg.naturalWidth * sc, h = lg.naturalHeight * sc, dx = o.align.startsWith("xMid") ? (o.w - w) / 2 : o.align.startsWith("xMax") ? o.w - w : 0;
    x.drawImage(lg, (bu + o.x + dx) * k, (bu + o.y + (o.h - h) / 2) * k, w * k, h * k); }
  return cv;
}
const odBlob = (cv, type, q) => new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(), type, q));
const odLoad = () => window.jspdf?.jsPDF ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement("script"); s.src = OD_PDF; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
const odUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });

// ── 4단계 카드 본문
function lOrderStep(c, b) {
  if (!c.세트확정?.at) return '<p class="empty">3단계 응용 세트를 먼저 확정해 주세요. 확정한 가이드·배치로 사양서와 발주 파일을 만듭니다.</p>';
  const g = odG(c), items = odItems(c), conf = c.발주확정, o = c.발주 || {}, drift = JSON.stringify(setG(c)) !== JSON.stringify(g) || items.map(s => s.key).join() !== kvItems(c).map(s => s.key).join();
  if (g.배경 && !(g.배경 in setImgs)) setImg(g.배경).then(im => { if (im && tab === "line") drawLine(); });
  const rows = items.map(s => { const r = odRow(c, s), out = odOut(s), res = odRes(g, s, out), inp = (k, n) => `<input data-od="${esc(s.key)}" data-odf="${k}" maxlength="${n}" value="${esc(r[k])}" ${k === "납품일" ? 'type="date"' : ""} aria-label="${esc(s.이름)} ${k}">`;
    return [`<b>${esc(s.이름)}</b><div class="note">${esc(lSize(s))}${out.면 ? ` · ${esc(out.면)}` : ""}</div>`, inp("수량", 20), inp("소재", 60), inp("후가공", 60),
      `<select data-od="${esc(s.key)}" data-odf="면" aria-label="${esc(s.이름)} 인쇄 면">${opt(OD_SIDE, r.면)}</select>`, inp("납품일", 10), inp("비고", 120),
      out.kind && kvDl ? `<button class="btn" type="button" data-odfile="${esc(s.key)}">${esc(out.label)}</button>${res ? `<div><span class="tag ${res.ok ? "go" : "amber"}">${esc(res.txt)}</span></div>` : ""}` : `<span class="note">${esc(out.kind ? "claude.ai에서 열면 내려받을 수 있습니다" : out.label)}</span>`]; });
  return `<p class="note">확정한 응용 세트(v${esc(c.세트확정.버전)})로 사양서와 품목별 파일을 만듭니다. 인쇄물은 재단 여백을 포함한 작업 크기 PDF, 디지털은 규격 픽셀 PNG입니다. 파일은 발주 확인·교정용이며 색은 RGB입니다 — CMYK 변환·교정 인쇄는 인쇄소와 확인하고, 글자를 고칠 원본은 3단계 SVG를 씁니다. 금액·업체·연락처는 적지 않습니다(관제실 발주서).</p>
    ${drift ? '<p class="note warn">응용 세트를 확정한 뒤 3단계 가이드나 품목이 바뀌었습니다. 발주 파일은 확정본 기준으로 만듭니다 — 바뀐 내용을 쓰려면 3단계에서 다시 확정해 주세요.</p>' : ""}
    ${items.length ? lTable(rows, ["품목", "수량", "소재·용지", "후가공", "인쇄 면", "납품일", "비고", "파일"]) : '<p class="empty">품목이 없습니다.</p>'}
    <div class="form"><label class="wide">납품 장소·받는 역할 (이름·연락처 대신 역할)<input id="odTo" maxlength="120" value="${esc(o.납품 || "")}" placeholder="예) 행사장 부스 설치팀 · 담당 PM"></label>
      <label class="wide">발주 메모<textarea id="odMemo" maxlength="600">${esc(o.메모 || "")}</textarea></label></div>
    <p class="note">배경 해상도가 권장보다 낮으면 고른 시안을 Magnific으로 업스케일한 뒤 2단계에서 배경을 다시 올리고 확정해 주세요.</p>
    <div class="row">${kvDl ? '<button class="btn primary" type="button" id="odSpec">사양서 PDF 내려받기</button>' : '<span class="note">내려받기는 claude.ai에서 열어야 합니다.</span>'}<span class="note" id="odMsg">${esc(odMsgTxt)}</span></div>
    <div class="card"><b>발주 확정</b><p class="note">확정하면 사양서 내용이 버전으로 남고 디자인 라인이 끝납니다. 사양서 PDF와 품목 파일은 구글 드라이브 프로젝트 폴더에 올리고, 관제실 발주서(금액·업체)에 연결해 주세요.</p>
      ${conf ? `<p><span class="tag go">발주 확정 v${esc(conf.버전)}</span> <span class="note">${esc(conf.역할)} · ${esc(String(conf.at || "").slice(0, 16).replace("T", " "))}${conf.메모 ? ` · ${esc(conf.메모)}` : ""}</span></p>` : ""}
      <div class="row"><select id="odRole" aria-label="확정 역할">${opt(OD_ROLE, conf?.역할 || "디자인팀장")}</select><input id="odCMemo" maxlength="120" value="${esc(odCM)}" placeholder="확정 메모 (선택)" style="flex:1;min-width:140px">
        <button class="btn primary" type="button" id="odConfirm" ${items.length ? "" : "disabled"}>${conf ? "새 버전으로 다시 확정" : "발주 확정"}</button>${conf ? '<button class="btn x" type="button" id="odUnconf">확정 풀기</button>' : ""}</div>
      ${(c.발주이력 || []).filter(x => x.버전 !== conf?.버전).length ? `<p class="note">이전 확정 ${(c.발주이력 || []).filter(x => x.버전 !== conf?.버전).map(x => `v${esc(x.버전)}`).join(", ")} 기록이 남아 있습니다.</p>` : ""}</div>`;
}
function odRead(c) { const 품목 = {};
  odItems(c).forEach(s => { 품목[s.key] = odRow(c, s); }); // 화면에 없는 값은 저장된 값 그대로
  document.querySelectorAll("[data-od]").forEach(el => { const r = 품목[el.dataset.od]; if (!r) return; const k = el.dataset.odf, n = OD_F.find(f => f[0] === k)?.[2] || 20;
    r[k] = k === "면" ? (OD_SIDE.includes(el.value) ? el.value : OD_SIDE[0]) : el.value.trim().slice(0, n); });
  return {품목, 납품: ($("odTo")?.value ?? c.발주?.납품 ?? "").trim().slice(0, 120), 메모: ($("odMemo")?.value ?? c.발주?.메모 ?? "").trim().slice(0, 600)}; }
const odBadIn = o => [o.납품, o.메모, ...Object.values(o.품목).flatMap(r => OD_F.map(f => r[f[0]]))].some(v => OD_BAD.test(String(v || "")));
function odChange() { const c = odCard(); if (!c || !db) return; const o = odRead(c);
  if (odBadIn(o)) { clearTimeout(odTimer); odSay("이메일·전화번호·금액은 적지 않습니다. 지우면 저장됩니다(금액·업체는 관제실 발주서)."); return; }
  c.발주 = o; clearTimeout(odTimer); odTimer = setTimeout(async () => { try { await db.doc(`line/${c.id}`).update({발주: o, updatedAt: new Date().toISOString()}); odSay("저장했습니다."); } catch { odSay("저장하지 못했습니다."); } }, 800); }
async function odFile(key) { const c = odCard(); if (!c || !kvDl || odBusy) return; const s = odItems(c).find(x => x.key === key); if (!s) return; const o = odOut(s); if (!o.kind) return;
  const g = odG(c), it = odSet(c, s), name = `${odName(c)}_${s.이름.replace(/[\\/:*?"<>|]/g, "")}`;
  odBusy = true; odSay(`${s.이름} 파일을 만드는 중…`);
  try {
    if (o.kind === "png") { const cv = setCanvas(s), outH = o.h || Math.round(o.w * cv.H / cv.W), cnv = await odDraw(c, g, s, it, o.w, 0, 0);
      const fit = document.createElement("canvas"); fit.width = o.w; fit.height = outH; fit.getContext("2d").drawImage(cnv, 0, 0, o.w, outH);
      await kvDl.save({filename: `${name}_${o.w}x${outH}.png`, data: await odBlob(fit, "image/png")}); odSay(`PNG(${o.w}×${outH}px)를 내려받았습니다.`); }
    else { await odLoad(); const pw = o.w + 2 * o.b, ph = o.h + 2 * o.b, want = Math.round(pw / 25.4 * o.dpi), maxW = Math.floor(OD_MAXPX * Math.min(1, pw / ph)), outW = Math.min(want, maxW) * o.w / pw;
      const cnv = await odDraw(c, g, s, it, outW, o.b, o.w), real = Math.round(cnv.width / pw * 25.4);
      const P = new window.jspdf.jsPDF({orientation: pw > ph ? "l" : "p", unit: "mm", format: [pw, ph], compress: true});
      P.setProperties({title: `${latest(c.id).제목 || ""} ${s.이름}`, subject: `작업 크기 ${pw}×${ph}mm (재단 ${o.b}mm 포함) · RGB · 약 ${real}dpi`, creator: "PRISM 디자인 라인"});
      P.addImage(await odUrl(await odBlob(cnv, "image/jpeg", 0.92)), "JPEG", 0, 0, pw, ph);
      await kvDl.save({filename: `${name}_${pw}x${ph}mm.pdf`, data: P.output("blob")}); odSay(`PDF(${pw}×${ph}mm, 재단 ${o.b}mm 포함, 약 ${real}dpi)를 내려받았습니다.${real < o.dpi ? ` 브라우저 한도로 권장 ${o.dpi}dpi보다 낮게 만들었습니다 — 최종 인쇄 원본은 디자이너가 SVG로 마감해 주세요.` : ""}`); }
  } catch (e) { odSay(e?.code === "declined" ? "내려받기를 취소했습니다." : "파일을 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요."); }
  odBusy = false; }
// 사양서 PDF — A4 세로, 글자는 페이지 서체로 그린 그림(한글 서체를 PDF 에 넣지 않아도 되게). 품목마다 작은 미리보기
async function odSpec() { const c = odCard(); if (!c || !kvDl || odBusy) return; const o = odRead(c); if (odBadIn(o)) { odSay("이메일·전화번호·금액을 지운 뒤 다시 눌러 주세요."); return; }
  odBusy = true; odSay("사양서를 만드는 중…");
  try { await odLoad(); const g = odG(c), items = odItems(c), b = latest(c.id), W = 1240, H = 1754, M = 90, pages = []; let cv, x, y;
    const font = "'Noto Sans KR', sans-serif"; try { await Promise.all([400, 700].map(w => document.fonts.load(`${w} 20px 'Noto Sans KR'`, "가A"))); } catch {}
    const page = () => { cv = document.createElement("canvas"); cv.width = W; cv.height = H; x = cv.getContext("2d"); x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, H); x.fillStyle = "#222222"; y = M; pages.push(cv);
      x.font = `400 16px ${font}`; x.fillStyle = "#888888"; x.fillText(`PRISM 디자인 라인 · 발주 사양서 · ${pages.length}쪽`, M, H - 50); x.fillStyle = "#222222"; };
    const wrap = (t, maxW) => { const out = []; let line = ""; for (const ch of String(t)) { if (x.measureText(line + ch).width > maxW && line) { out.push(line); line = ch.trimStart(); } else line += ch; } if (line) out.push(line); return out; };
    const text = (t, size, weight = 400, color = "#222222", indent = 0) => { x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; wrap(t, W - 2 * M - indent).forEach(l => { if (y + size > H - 90) page(); y += size * 1.45; x.fillText(l, M + indent, y); }); };
    page(); text(`${b.제목 || "디자인 발주"} — 발주 사양서`, 40, 700);
    text([b.프로젝트, c.브리프?.일시, c.브리프?.도시].filter(Boolean).join(" · "), 20, 400, "#555555");
    text(`응용 세트 v${c.세트확정?.버전 || "-"} · 키비주얼 v${c.kv확정?.버전 || "-"} · 작성 ${new Date().toISOString().slice(0, 10)}${c.발주확정 ? ` · 발주 확정 v${c.발주확정.버전}` : " · 발주 확정 전"}`, 18, 400, "#555555");
    if (o.납품) text(`납품 장소·받는 역할: ${o.납품}`, 20); if (o.메모) text(`메모: ${o.메모}`, 20); y += 16;
    for (const s of items) { const r = o.품목[s.key] || odRow(c, s), out = odOut(s), it = odSet(c, s), res = odRes(g, s, out);
      const th = await odDraw(c, g, s, it, 200, 0, 0), tw = 200 * Math.min(1, 260 / th.height), tH = th.height * tw / th.width;
      if (y + Math.max(tH, 220) > H - 100) page();
      x.strokeStyle = "#DDDDDD"; x.beginPath(); x.moveTo(M, y + 8); x.lineTo(W - M, y + 8); x.stroke(); y += 20; const top = y; x.drawImage(th, W - M - tw, top + 10, tw, tH);
      const L0 = [`${s.이름}${out.면 ? ` (${out.면})` : ""}`, `완성 ${lSize(s)} · 작업 ${lWork(s)} · 재단 ${+s.재단 || 0}mm`, `${[s.해상도, s.색].filter(Boolean).join(" · ")} · 파일 ${s.파일 || "-"} · 이번 파일 ${out.kind ? out.label : "규격 확인 필요"}${res ? ` · ${res.txt}` : ""}`,
        `수량 ${r.수량 || "-"} · 소재·용지 ${r.소재 || "-"} · 후가공 ${r.후가공 || "-"} · 인쇄 면 ${r.면 || "-"} · 납품일 ${r.납품일 || "-"}`, r.비고 ? `비고: ${r.비고}` : "", s.메모 ? `규격 메모: ${s.메모}` : ""].filter(Boolean);
      const right = tw + 30;
      L0.forEach((t, i) => { x.font = `${i ? 400 : 700} ${i ? 18 : 24}px ${font}`; x.fillStyle = i ? "#333333" : "#111111"; wrap(t, W - 2 * M - right).forEach(l => { if (y + 40 > H - 100) { page(); x.font = `${i ? 400 : 700} ${i ? 18 : 24}px ${font}`; x.fillStyle = i ? "#333333" : "#111111"; } y += (i ? 18 : 24) * 1.45; x.fillText(l, M, y); }); }); // 긴 품목은 줄마다 쪽을 넘긴다
      y = Math.max(y, top + tH + 20) + 10; }
    y += 10; text("• 색은 RGB 파일입니다. CMYK 변환·교정 인쇄는 인쇄소와 확인합니다. • 금액·업체는 관제실 발주서에서 다룹니다. • 글자 수정 원본은 3단계 SVG·PPTX입니다.", 16, 400, "#666666");
    const P = new window.jspdf.jsPDF({orientation: "p", unit: "mm", format: "a4", compress: true}); P.setProperties({title: `${b.제목 || ""} 발주 사양서`, creator: "PRISM 디자인 라인"});
    for (let i = 0; i < pages.length; i++) { if (i) P.addPage("a4", "p"); P.addImage(await odUrl(await odBlob(pages[i], "image/jpeg", 0.9)), "JPEG", 0, 0, 210, 297); }
    await kvDl.save({filename: `${odName(c)}_발주사양서.pdf`, data: P.output("blob")}); odSay(`사양서 PDF(${pages.length}쪽)를 내려받았습니다.`); }
  catch (e) { odSay(e?.code === "declined" ? "내려받기를 취소했습니다." : "사양서를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요."); }
  odBusy = false; }
async function odConfirm(undo) { const c = odCard(); if (!c || !db) return; const now = new Date().toISOString();
  if (undo) { if (!(await askYes("발주 확정을 풀까요? 기록은 남습니다."))) return; try { await db.doc(`line/${c.id}`).update({발주확정: null, updatedAt: now}); c.발주확정 = null; } catch { odSay("확정을 풀지 못했습니다."); } drawLine(true); return; }
  const o = odRead(c); if (odBadIn(o)) { odSay("이메일·전화번호·금액을 지운 뒤 확정해 주세요."); return; }
  const empty = odItems(c).filter(s => !String(o.품목[s.key]?.수량 || "").trim()).map(s => s.이름);
  if (empty.length && !(await askYes(`수량이 비어 있는 품목이 있습니다: ${empty.join(", ")}. 그래도 확정할까요?`))) return;
  const v = {버전: Math.max(0, ...(c.발주이력 || []).map(x => +x.버전 || 0)) + 1, 발주: o, 세트버전: c.세트확정?.버전 || 0, 역할: OD_ROLE.includes($("odRole")?.value) ? $("odRole").value : "디자인팀장", 메모: ($("odCMemo")?.value || "").trim().slice(0, 120), at: now};
  try { await db.doc(`line/${c.id}`).update({발주확정: v, 발주이력: [...(c.발주이력 || []), v].slice(-20), 발주: o, updatedAt: now}); c.발주확정 = v; c.발주이력 = [...(c.발주이력 || []), v]; c.발주 = o; odSay(`v${v.버전}으로 발주를 확정했습니다. 사양서 PDF를 내려받아 드라이브·관제실 발주서에 붙여 주세요.`); }
  catch { odSay("확정하지 못했습니다."); } drawLine(true); }

document.head.insertAdjacentHTML("beforeend", "<style>.ltbl input[data-od],.ltbl select[data-od]{width:100%;min-width:70px}</style>");
document.addEventListener("click", e => { const t = e.target.closest("button"); if (!t || !$("line")?.contains(t)) return;
  if (t.id === "odConfirm" || t.id === "odUnconf") odCM = "";
  if (t.dataset.odfile) odFile(t.dataset.odfile); if (t.id === "odSpec") odSpec(); if (t.id === "odConfirm") odConfirm(); if (t.id === "odUnconf") odConfirm(true); });
document.addEventListener("input", e => { if (!$("line")?.contains(e.target)) return; if (e.target.matches?.("[data-od],#odTo,#odMemo")) odChange(); if (e.target.id === "odCMemo") odCM = e.target.value; });
document.addEventListener("change", e => { if (e.target.matches?.("select[data-od]") && $("line")?.contains(e.target)) odChange(); });
