// ── 디자인 라인 2단계: 키비주얼 보강 (본부장님 결정 2026-10-06) — 별도 파일, build_prism.py 가 design_line.js 뒤에 붙인다
// 배경(AI 시안을 내려받아 올리거나 디자이너 작업 이미지)에 글자·로고 레이어를 나눠 얹고, 기관 브랜드킷(색·서체·로고)을 적용하고, 키비주얼을 확정한다.
// 배경·로고는 PRISM 저장소(assets, 페이지 편집 등급)에 올린 파일만 화면에 보인다 — 페이지는 다른 사이트의 이미지를 불러올 수 없다.
// 저장: line/{id}.레이어 · line/{id}.kv확정 · line/{id}.kv이력 · brandkit/{id}. SVG 내려받기(downloads)는 글자가 편집 가능한 상태로 나간다.
const KV_FONTS = ["Noto Sans KR", "Black Han Sans", "Gothic A1", "IBM Plex Sans KR", "Montserrat", "Bebas Neue"];
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Black+Han+Sans&family=Gothic+A1:wght@400;700;900&family=Montserrat:wght@500;800&family=Bebas+Neue&display=swap">');
document.head.insertAdjacentHTML("beforeend", `<style>
.kvprev{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--glass2);max-width:720px}.kvprev svg{display:block;width:100%;height:auto;max-height:70vh}
.kvbg{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.kvbg img{width:96px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
.kvkit{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.kvsw{display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid var(--line)}
.kvlogo{height:36px;max-width:120px;object-fit:contain;background:var(--glass2);border:1px solid var(--line);border-radius:6px;padding:2px}
</style>`);
const KV_PLACE = ["아래 왼쪽", "위 왼쪽", "가운데", "아래 띠"];
const KV_SIZE = {"16:9": [1600, 900], "21:9": [1680, 720], "2:1": [1600, 800], "4:3": [1600, 1200], "3:2": [1500, 1000], "1:1": [1400, 1400], "4:5": [1280, 1600], "3:4": [1200, 1600], "2:3": [1100, 1650], "9:16": [900, 1600], "1:2": [900, 1800]};
const KV_ROLE = ["디자인팀장", "관리자"];
const kvHex = s => /^#[0-9a-f]{6}$/i.test(String(s || "").trim()) ? String(s).trim().toUpperCase() : "";
const kvBlob = id => /^[A-Za-z0-9_-]{16,64}$/.test(id || "") ? "/_blob/" + id : "";
let kits = [], kvDl = null, kvKitEdit = null, kvTimer = null, kvCut = []; // kvCut = 3줄을 넘어 잘린 글자 레이어
Promise.resolve(window.claude?.use?.("downloads")).then(x => { kvDl = x ?? null; }).catch(() => {});
const kvSay = (m, id = "kvMsg") => { if ($(id)) $(id).textContent = m; };

// 글자 레이어 — 브리프 6항(필수 문구, 우선순위 순). 비어 있으면 행사명·일시·장소로 채운다
function kvTexts(c) {
  const f = c.브리프 || {}, rows = (f.문구 || []).filter(r => String(r.표기 || "").trim()).map((r, i) => ({key: r.구분, text: String(r.표기).trim(), rank: +r.순위 || i + 5}));
  if (!rows.some(r => r.key === "행사명") && (f.행사명 || f.행사명영)) rows.push({key: "행사명", text: f.행사명 || f.행사명영, rank: 0});
  if (!rows.some(r => r.key === "일시와 장소") && (f.일시 || f.도시)) rows.push({key: "일시와 장소", text: [f.일시, f.도시].filter(Boolean).join(" · "), rank: 9});
  return rows.sort((a, b) => a.rank - b.rank).slice(0, 5);
}
const kvItems = c => (c.품목 || []).map(k => lSpecs().find(s => s.key === k)).filter(Boolean);
const kvDefault = c => ({배치: "아래 왼쪽", 색: "#FFFFFF", 서체: "Noto Sans KR", 어둡게: 30, 크기: 100, 비율: KV_SIZE[kvItems(c)[0]?.비율] ? kvItems(c)[0].비율 : "16:9", 배경: "", 킷: [], 끔: [], 띠색: ""});
const kvL = c => { const L = {...kvDefault(c), ...(c.레이어 || {})}; if (!KV_SIZE[L.비율]) L.비율 = "16:9"; if (!KV_PLACE.includes(L.배치)) L.배치 = "아래 왼쪽"; if (!KV_FONTS.includes(L.서체)) L.서체 = "Noto Sans KR"; return L; };
// 대략적인 줄바꿈(한글은 넓게, 영문은 좁게) — 최대 3줄
function kvWrap(t, fs, maxW) {
  const cw = ch => /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? fs * 0.98 : /[A-Z0-9]/.test(ch) ? fs * 0.64 : fs * 0.52, out = [];
  let line = "", w = 0;
  const words = String(t).split(/(\s+)/).flatMap(w => [...w].reduce((a, ch) => a + cw(ch), 0) > maxW ? [...w] : [w]); // 띄어쓰기 없는 긴 단어는 글자 단위로 끊는다
  for (const word of words) { const ww = [...word].reduce((a, ch) => a + cw(ch), 0);
    if (w + ww > maxW && line.trim()) { out.push(line.trim()); line = word.trimStart(); w = [...line].reduce((a, ch) => a + cw(ch), 0); } else { line += word; w += ww; } }
  if (line.trim()) out.push(line.trim()); out.cut = out.length > 3; return out.length > 3 ? Object.assign(out.slice(0, 3), {cut: true}) : out;
}
// 레이어 SVG — 배경 / 어둡게 / 글자 / 로고를 따로 묶는다(일러스트레이터에서 레이어로 열림). src = {bg, logos:[url]} 화면용 /_blob 주소 또는 내려받기용 data: 주소
// opt(3단계 응용 세트용): size=[W,H] 캔버스, texts=글자 레이어, bgRect={x,y,w,h} 초점 맞춘 배경 자리. 계산한 배치는 kvLast 에 남긴다(PPTX·대비 점검이 같은 값을 쓰게)
let kvLast = null;
function kvSVG(c, L, src, opt = {}) {
  const [W, H] = opt.size || KV_SIZE[L.비율], band = L.배치 === "아래 띠", m = Math.round(Math.min(W, H) * Math.min(15, Math.max(2, +L.여백 || 6)) / 100 * 1.5), fsBase = [0.075, 0.04, 0.03, 0.024, 0.022].map(x => Math.round(Math.min(W, H * 1.6) * x * (Math.min(140, Math.max(60, +L.크기 || 100)) / 100) * (band ? 0.7 : 1)));
  const font = KV_FONTS.includes(L.서체) ? L.서체 : "Noto Sans KR"; // 서체는 목록에 있는 것만 — 저장소 값이 속성에 그대로 들어가지 않게
  const kitList = (L.킷 || []).map(id => kits.find(k => k.id === id)).filter(Boolean), color = kvHex(L.색) || "#FFFFFF", bandColor = kvHex(L.띠색) || kvHex(kitList[0]?.색?.[0]) || "#111111";
  const lines = []; kvCut = []; (opt.texts || kvTexts(c)).filter(r => !(L.끔 || []).includes(r.key)).forEach((r, i) => { const fs = fsBase[Math.min(i, 4)], maxW = (L.배치 === "가운데" ? W - 2 * m : W * (band ? 0.62 : 0.72) - (W > H ? 0 : m * 0.5));
    const ws = kvWrap(r.text, fs, maxW); if (ws.cut) kvCut.push(r.key); ws.forEach((t, j) => lines.push({t, fs, w: i === 0 ? 800 : 500, gap: j === 0 && lines.length ? fs * 0.55 : 0, maxW, key: r.key})); });
  const blockH = lines.reduce((a, l) => a + l.gap + l.fs * 1.18, 0), logoH = Math.round(Math.min(W, H * 1.6) * (band ? 0.05 : 0.042)), bandH = band ? Math.max(Math.round(H * 0.24), Math.round(blockH + logoH + H * 0.08)) : 0;
  let y = L.배치 === "위 왼쪽" ? m * 1.4 : L.배치 === "가운데" ? (H - blockH) / 2 : band ? H - bandH + (bandH - blockH) / 2 : H - m * 1.4 - blockH - logoH - m * 0.6;
  const y0 = y, x = L.배치 === "가운데" ? W / 2 : m, anchor = L.배치 === "가운데" ? "middle" : "start", pos = [];
  const text = lines.map(l => { y += l.gap + l.fs; pos.push({...l, x, y, anchor}); const t = `<text x="${Math.round(x)}" y="${Math.round(y)}" font-size="${l.fs}" font-weight="${l.w}" text-anchor="${anchor}">${esc(l.t)}</text>`; y += l.fs * 0.18; return t; }).join("");
  const logos = (src.logos || []).filter(Boolean), lw = logoH * 3, lgap = logoH * 0.5, ly = band ? H - bandH / 2 - logoH / 2 : H - m - logoH;
  let lx = L.배치 === "가운데" ? (W - (logos.length * lw + (logos.length - 1) * lgap)) / 2 : L.배치 === "위 왼쪽" || L.배치 === "아래 왼쪽" ? m : W - m - (logos.length * lw + (logos.length - 1) * lgap); // 아래 왼쪽은 글자 아래 같은 쪽에 로고 줄
  const lpos = [], align = L.배치 === "가운데" ? "xMidYMid" : L.배치 === "아래 띠" ? "xMaxYMid" : "xMinYMid";
  const logo = logos.map(u => { lpos.push({u, x: lx, y: ly, w: lw, h: logoH, align}); const s = `<image href="${esc(u)}" xlink:href="${esc(u)}" x="${Math.round(lx)}" y="${Math.round(ly)}" width="${Math.round(lw)}" height="${logoH}" preserveAspectRatio="${align} meet"/>`; lx += lw + lgap; return s; }).join("");
  const dark = Math.min(80, Math.max(0, +L.어둡게 || 0)) / 100, r = opt.bgRect;
  const bgImg = !src.bg ? "" : r ? `<image href="${esc(src.bg)}" xlink:href="${esc(src.bg)}" x="${Math.round(r.x)}" y="${Math.round(r.y)}" width="${Math.round(r.w)}" height="${Math.round(r.h)}" preserveAspectRatio="none"/>` : `<image href="${esc(src.bg)}" xlink:href="${esc(src.bg)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
  kvLast = {W, H, m, lines: pos, logos: lpos, band: band ? {y: H - bandH, h: bandH, color: bandColor} : null, dark: band ? 0 : dark, color, font, box: {x: anchor === "middle" ? m : x, y: y0, w: anchor === "middle" ? W - 2 * m : (lines[0]?.maxW || W * 0.7), h: blockH}, cut: [...kvCut]};
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opt.label || "키비주얼 레이어 미리보기")}">
<g id="배경"><rect width="${W}" height="${H}" fill="#1B1B22"/>${bgImg || `<text x="${W / 2}" y="${H / 2}" font-size="${Math.round(Math.min(W, H) * 0.04)}" fill="#8A8A99" text-anchor="middle" font-family="sans-serif">배경 이미지를 올려 주세요</text>`}</g>
<g id="어둡게">${band ? `<rect x="0" y="${H - bandH}" width="${W}" height="${bandH}" fill="${bandColor}"/>` : dark ? `<rect width="${W}" height="${H}" fill="#000000" opacity="${dark}"/>` : ""}</g>
<g id="글자" font-family="'${esc(font)}', sans-serif" fill="${color}">${text}</g>
<g id="로고">${logo}</g></svg>`;
}
const kvCutNote = () => kvCut.length ? `글자가 길어 3줄까지만 보입니다: ${kvCut.join(", ")} — 글자 크기를 줄이거나 브리프 6항 표기를 줄여 주세요.` : "";
const kvLogoUrls = L => (L.킷 || []).map(id => kits.find(k => k.id === id)).filter(Boolean).map(k => kvBlob(k.로고?.[0]?.파일)).filter(Boolean);
// 디자인 라인 2단계 카드 본문
function lKvStep(c, b) {
  const L = kvL(c), g = (b.시안 || []).find(x => x.id === b.kv?.id), orig = g && http(g.url || g.web), conf = c.kv확정, ratios = [...new Set([L.비율, ...kvItems(c).map(s => s.비율).filter(r => KV_SIZE[r]), "16:9"])];
  const texts = kvTexts(c);
  return `<p class="note">AI 시안이나 디자이너 작업 이미지를 배경으로 올리고, 브리프 6항 필수 문구와 브랜드킷 로고를 레이어로 얹습니다. 글자는 AI가 그리지 않으므로 표기가 정확하게 들어갑니다.</p>
    <div class="kvbg">${kvBlob(L.배경) ? `<img src="${esc(kvBlob(L.배경))}" alt="배경">` : '<span class="tag amber">배경 없음</span>'}
      ${assets ? `<label class="btn">배경 이미지 올리기<input type="file" id="kvUp" accept="image/png,image/jpeg,image/webp" hidden></label>` : '<span class="note">배경 올리기는 페이지 편집 권한이 있어야 합니다.</span>'}
      ${orig ? `<a class="btn" href="${esc(orig)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">선택한 AI 시안 원본 열기 ↗</a><span class="note">원본을 내려받아 다듬은 뒤 올려 주세요.</span>` : '<span class="note">시안 작업 ③에서 키비주얼을 만들고 고르면 원본 링크가 여기에 나옵니다.</span>'}</div>
    <div class="form">
      <label>비율<select data-kv="비율">${opt(ratios, L.비율)}</select></label>
      <label>배치<select data-kv="배치">${opt(KV_PLACE, L.배치)}</select></label>
      <label>서체<select data-kv="서체">${opt(KV_FONTS, L.서체)}</select></label>
      <label>글자색 (HEX)<input data-kv="색" maxlength="7" value="${esc(L.색)}" placeholder="#FFFFFF"></label>
      <label>띠 색 (아래 띠 배치, HEX)<input data-kv="띠색" maxlength="7" value="${esc(L.띠색)}" placeholder="브랜드킷 첫 색"></label>
      <label>배경 어둡게 ${esc(L.어둡게)}%<input type="range" data-kv="어둡게" min="0" max="70" step="5" value="${esc(L.어둡게)}"></label>
      <label>글자 크기 ${esc(L.크기)}%<input type="range" data-kv="크기" min="60" max="140" step="5" value="${esc(L.크기)}"></label></div>
    <div class="hudlabel">글자 레이어 (브리프 6항 우선순위 순 — 끄면 빠집니다)</div>
    <div class="chips">${texts.length ? texts.map(r => `<label><input type="checkbox" data-kvoff="${esc(r.key)}" ${(L.끔 || []).includes(r.key) ? "" : "checked"}>${esc(r.key)} <span class="note">${esc(r.text.slice(0, 24))}</span></label>`).join("") : '<span class="note">브리프 6항 필수 문구나 행사명을 채우면 글자 레이어가 생깁니다.</span>'}</div>
    <div class="hudlabel">로고 (브랜드킷 — 고른 순서대로 놓입니다)</div>
    <div class="chips">${kits.length ? kits.map(k => `<label><input type="checkbox" data-kvkit="${esc(k.id)}" ${(L.킷 || []).includes(k.id) ? "checked" : ""}>${esc(k.이름)}</label>`).join("") : '<span class="note">아직 브랜드킷이 없습니다. 위 \'브랜드킷\' 보기에서 기관 색·로고를 등록하세요.</span>'}</div>
    <div class="kvprev" id="kvPrev">${kvSVG(c, L, {bg: kvBlob(L.배경), logos: kvLogoUrls(L)})}</div>
    <p class="note warn" id="kvCutMsg">${kvCutNote()}</p>
    <div class="row">${kvDl ? '<button class="btn primary" type="button" id="kvSvg">레이어 SVG 내려받기 (글자 편집 가능)</button>' : ""}<button class="btn" type="button" id="kvPrompt">브랜드 조건을 키비주얼 프롬프트에 넣기</button><span class="note" id="kvMsg"></span></div>
    <div class="card"><b>키비주얼 확정</b><p class="note">확정하면 지금 배경·레이어 설정이 버전으로 남고, 3단계 응용 세트의 기준이 됩니다. 확정은 디자인팀장 이상이 합니다(화면 표시이며 실제 권한은 페이지 공유 등급).</p>
      ${conf ? `<p><span class="tag go">확정 v${esc(conf.버전)}</span> <span class="note">${esc(conf.역할)} · ${esc(String(conf.at || "").slice(0, 16).replace("T", " "))}${conf.메모 ? ` · ${esc(conf.메모)}` : ""}</span></p>` : ""}
      <div class="row"><select id="kvRole" aria-label="확정 역할">${opt(KV_ROLE, conf?.역할 || "디자인팀장")}</select><input id="kvMemo" maxlength="120" placeholder="확정 메모 (선택)" style="flex:1;min-width:140px">
        <button class="btn primary" type="button" id="kvConfirm" ${kvBlob(L.배경) ? "" : "disabled"}>${conf ? "새 버전으로 다시 확정" : "확정"}</button>${conf ? '<button class="btn x" type="button" id="kvUnconf">확정 풀기</button>' : ""}</div>
      ${(c.kv이력 || []).filter(x => x.버전 !== conf?.버전).length ? `<p class="note">이전 확정 ${(c.kv이력 || []).filter(x => x.버전 !== conf?.버전).map(x => `v${esc(x.버전)}`).join(", ")} 기록이 남아 있습니다.</p>` : ""}</div>`;
}
const kvCard = () => lines.find(x => x.id === lcur);
function kvRead(c) { const L = kvL(c);
  document.querySelectorAll("[data-kv]").forEach(el => { const k = el.dataset.kv; L[k] = ["어둡게", "크기"].includes(k) ? +el.value : el.value.trim(); });
  L.끔 = [...document.querySelectorAll("[data-kvoff]")].filter(x => !x.checked).map(x => x.dataset.kvoff);
  const prev = L.킷 || [], on = [...document.querySelectorAll("[data-kvkit]:checked")].map(x => x.dataset.kvkit); L.킷 = [...prev.filter(id => on.includes(id)), ...on.filter(id => !prev.includes(id))]; // 고른 순서 유지
  return L; }
// 조절할 때는 미리보기만 다시 그리고, 저장은 잠시 뒤 한 번
function kvChange() { const c = kvCard(); if (!c || !db) return; const L = kvRead(c); c.레이어 = L;
  if ($("kvPrev")) $("kvPrev").innerHTML = kvSVG(c, L, {bg: kvBlob(L.배경), logos: kvLogoUrls(L)}); if ($("kvCutMsg")) $("kvCutMsg").textContent = kvCutNote();
  document.querySelectorAll('input[type="range"][data-kv]').forEach(el => { const t = el.closest("label")?.firstChild; if (t) t.textContent = `${el.dataset.kv === "어둡게" ? "배경 어둡게" : "글자 크기"} ${el.value}% `; });
  clearTimeout(kvTimer); kvTimer = setTimeout(() => db.doc(`line/${c.id}`).update({레이어: L, updatedAt: new Date().toISOString()}).catch(() => kvSay("레이어 설정을 저장하지 못했습니다.")), 700); }
async function kvUpload(file) { const c = kvCard(); if (!c || !assets || !db) return;
  if (file.size > 20 * 1024 * 1024) { kvSay("20MB 이하 이미지만 올릴 수 있습니다."); return; }
  kvSay("배경을 올리는 중…");
  try { const a = await assets.upload(file), L = {...kvRead(c), 배경: a.id}; c.레이어 = L; await db.doc(`line/${c.id}`).update({레이어: L, updatedAt: new Date().toISOString()}); drawLine(true); kvSay("배경을 올렸습니다."); }
  catch (e) { kvSay(e?.code === "quota_exceeded" ? "저장 공간이 부족합니다." : "배경을 올리지 못했습니다."); } }
// 내려받기용 — 저장소 파일을 data: 주소로 넣어 파일 하나로 열리게 한다(같은 페이지 주소라 읽을 수 있음)
const kvData = async u => { if (!u) return ""; try { const b = await (await fetch(u)).blob(); return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); }); } catch { return u; } };
async function kvExport() { const c = kvCard(); if (!c || !kvDl) return; const L = kvRead(c); kvSay("SVG 파일을 만드는 중…");
  const svg = kvSVG(c, L, {bg: await kvData(kvBlob(L.배경)), logos: await Promise.all(kvLogoUrls(L).map(kvData))}), name = String(latest(c.id).제목 || "키비주얼").replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
  try { await kvDl.save({filename: `${name}_키비주얼_${L.비율.replace(":", "x")}.svg`, data: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`}); kvSay(`내려받았습니다. 서체(${L.서체})가 컴퓨터에 없으면 비슷한 글꼴로 보입니다.`); }
  catch (e) { kvSay(e?.code === "declined" ? "내려받기를 취소했습니다." : "내려받지 못했습니다."); } }
async function kvPrompt() { const c = kvCard(); if (!c || !db) return; const L = kvRead(c), b = latest(c.id), kl = (L.킷 || []).map(id => kits.find(k => k.id === id)).filter(Boolean);
  const pal = [...new Set(kl.flatMap(k => k.색 || []).map(kvHex).filter(Boolean))].slice(0, 6), area = {"아래 왼쪽": "lower-left third", "위 왼쪽": "upper-left third", "가운데": "center", "아래 띠": "bottom quarter"}[L.배치];
  const add = `[Brand] ${pal.length ? `Color palette: ${pal.join(", ")}. ` : ""}Leave clean negative space in the ${area} for title text and logos. No text, no letters, no logos in the image.`;
  const base = String(b.kv?.prompt || b.추천?.prompt || "").replace(/\s*\[Brand\][\s\S]*$/, "").trim();
  if (await put(c.id, {kv: {...(b.kv || {}), prompt: `${base}${base ? " " : ""}${add}`.slice(0, 1800)}})) kvSay("시안 작업 ③ 프롬프트에 브랜드 조건을 넣었습니다. 다시 만들면 반영됩니다."); else kvSay("프롬프트를 저장하지 못했습니다."); }
async function kvConfirm(undo) { const c = kvCard(); if (!c || !db) return; const now = new Date().toISOString();
  if (undo) { if (!(await askYes("키비주얼 확정을 풀까요? 기록은 남습니다."))) return; try { await db.doc(`line/${c.id}`).update({kv확정: null, updatedAt: now}); c.kv확정 = null; } catch { kvSay("확정을 풀지 못했습니다."); } drawLine(true); return; }
  const L = kvRead(c); if (!L.배경) { kvSay("배경 이미지를 먼저 올려 주세요."); return; }
  const v = {버전: Math.max(0, ...(c.kv이력 || []).map(x => +x.버전 || 0)) + 1, 배경: L.배경, kv: latest(c.id).kv?.id || "", 레이어: L, 역할: $("kvRole")?.value || "디자인팀장", 메모: ($("kvMemo")?.value || "").trim().slice(0, 120), at: now};
  try { await db.doc(`line/${c.id}`).update({kv확정: v, kv이력: [...(c.kv이력 || []), v].slice(-20), 레이어: L, updatedAt: now}); c.kv확정 = v; c.kv이력 = [...(c.kv이력 || []), v]; kvSay(`v${v.버전}으로 확정했습니다.`); }
  catch { kvSay("확정하지 못했습니다."); } drawLine(true); }

// ── 브랜드킷 (기관별 색·서체·로고·사용 규정) — 디자인 라인의 '브랜드킷' 보기
function lKitView() {
  const k = kvKitEdit === "new" ? {이름: "", 색: [], 서체: "Noto Sans KR", 로고: [], 메모: ""} : kits.find(x => x.id === kvKitEdit);
  return `<p class="note">주최·주관·후원 기관의 색·서체·로고를 한 번 등록해 두면 키비주얼 레이어와 프롬프트에 씁니다. 로고 사용 규정(여백·최소 크기·금지 색)은 메모에 적어 주세요.</p>
    ${k ? `<div class="card"><h3>${kvKitEdit === "new" ? "브랜드킷 추가" : `${esc(k.이름)} 고치기`}</h3><div class="form">
      <label>기관·브랜드 이름<input id="kkName" maxlength="60" value="${esc(k.이름)}" placeholder="예) 한국콘텐츠진흥원"></label>
      <label>색 (HEX, 쉼표로 · 첫 색이 주색)<input id="kkColor" maxlength="80" value="${esc((k.색 || []).join(", "))}" placeholder="#E60012, #1A1A1A"></label>
      <label>서체<select id="kkFont">${opt(KV_FONTS, k.서체 || "Noto Sans KR")}</select></label>
      <label class="wide">로고 사용 규정 메모<textarea id="kkMemo" maxlength="600">${esc(k.메모 || "")}</textarea></label></div>
      ${kvKitEdit !== "new" ? `<div class="kvkit">${(k.로고 || []).map((l, i) => `<img class="kvlogo" src="${esc(kvBlob(l.파일))}" alt="${esc(l.이름 || "로고")}"><button class="btn x" type="button" data-kklogodel="${i}" aria-label="로고 지우기">×</button>`).join("")}
        ${assets ? `<label class="btn">로고 올리기 (PNG·SVG, 투명 배경 권장)<input type="file" id="kkLogo" accept="image/png,image/svg+xml,image/webp" hidden></label>` : '<span class="note">로고 올리기는 페이지 편집 권한이 있어야 합니다.</span>'}</div><p class="note">첫 로고가 레이어에 쓰입니다.</p>` : '<p class="note">저장한 뒤 로고를 올릴 수 있습니다.</p>'}
      <div class="row"><button class="btn primary" type="button" id="kkSave">저장</button><button class="btn" type="button" id="kkCancel">닫기</button>${kvKitEdit !== "new" ? '<button class="btn x" type="button" id="kkDel">브랜드킷 지우기</button>' : ""}<span class="note" id="kkMsg"></span></div></div>`
    : `<div class="row"><button class="btn primary" type="button" id="kkNew" ${db ? "" : "disabled"}>+ 브랜드킷 추가</button></div>`}
    <div class="list">${kits.map(x => `<div class="card"><div class="row"><b style="flex:1;min-width:0">${esc(x.이름)}</b><button class="btn" type="button" data-kkedit="${esc(x.id)}">고치기</button></div>
      <div class="kvkit">${(x.색 || []).map(h => kvHex(h) ? `<span class="kvsw" style="background:${kvHex(h)}" title="${kvHex(h)}"></span>` : "").join("")}<span class="note">${esc(x.서체 || "")}</span></div>
      <div class="kvkit">${(x.로고 || []).map(l => `<img class="kvlogo" src="${esc(kvBlob(l.파일))}" alt="${esc(l.이름 || "로고")}">`).join("") || '<span class="note">로고 없음</span>'}</div>
      ${x.메모 ? `<p class="note">${esc(String(x.메모).slice(0, 120))}</p>` : ""}</div>`).join("") || '<p class="empty">등록한 브랜드킷이 없습니다.</p>'}</div>`;
}
async function kkSave() { if (!db) return; const 이름 = ($("kkName")?.value || "").trim(); if (!이름) { kvSay("이름을 넣어 주세요.", "kkMsg"); return; }
  const 색 = ($("kkColor")?.value || "").split(/[,\s]+/).map(kvHex).filter(Boolean).slice(0, 8), old = kits.find(x => x.id === kvKitEdit) || {};
  const k = {이름: 이름.slice(0, 60), 색, 서체: KV_FONTS.includes($("kkFont")?.value) ? $("kkFont").value : "Noto Sans KR", 로고: old.로고 || [], 메모: ($("kkMemo")?.value || "").trim().slice(0, 600), updatedAt: new Date().toISOString()};
  const id = kvKitEdit === "new" ? "k" + Date.now().toString(36) : kvKitEdit;
  try { await db.doc(`brandkit/${id}`).set(k); const i = kits.findIndex(x => x.id === id); i < 0 ? kits.push({id, ...k}) : (kits[i] = {id, ...k}); kvKitEdit = id; drawLine(true); kvSay("저장했습니다. 이제 로고를 올릴 수 있습니다.", "kkMsg"); }
  catch { kvSay("저장하지 못했습니다.", "kkMsg"); } }
async function kkLogo(file, del) { const k = kits.find(x => x.id === kvKitEdit); if (!k || !db) return;
  let 로고 = [...(k.로고 || [])];
  if (del !== undefined) { if (!(await askYes("이 로고를 지울까요?"))) return; 로고.splice(del, 1); }
  else { if (!assets) return; if (file.size > 5 * 1024 * 1024) { kvSay("로고는 5MB 이하로 올려 주세요.", "kkMsg"); return; } kvSay("로고를 올리는 중…", "kkMsg");
    try { const a = await assets.upload(file); 로고 = [...로고, {파일: a.id, 이름: file.name.replace(/\.[^.]+$/, "").slice(0, 60)}].slice(0, 6); } catch { kvSay("로고를 올리지 못했습니다.", "kkMsg"); return; } }
  try { await db.doc(`brandkit/${k.id}`).update({로고, updatedAt: new Date().toISOString()}); k.로고 = 로고; drawLine(true); } catch { kvSay("저장하지 못했습니다.", "kkMsg"); } }

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || !$("line")?.contains(t)) return;
  if (t.id === "kvSvg") kvExport(); if (t.id === "kvPrompt") kvPrompt(); if (t.id === "kvConfirm") kvConfirm(); if (t.id === "kvUnconf") kvConfirm(true);
  if (t.id === "kkNew") { kvKitEdit = "new"; drawLine(true); } if (t.dataset.kkedit) { kvKitEdit = t.dataset.kkedit; drawLine(true); } if (t.id === "kkCancel") { kvKitEdit = null; drawLine(true); }
  if (t.id === "kkSave") kkSave(); if (t.dataset.kklogodel !== undefined) kkLogo(null, +t.dataset.kklogodel);
  if (t.id === "kkDel" && await askYes("이 브랜드킷을 지울까요? 이미 확정한 키비주얼 기록은 남습니다.")) { try { await db.doc(`brandkit/${kvKitEdit}`).delete(); kits = kits.filter(x => x.id !== kvKitEdit); kvKitEdit = null; } catch { kvSay("지우지 못했습니다.", "kkMsg"); } drawLine(true); }
});
document.addEventListener("input", e => { if (e.target.matches?.("[data-kv]") && $("line")?.contains(e.target)) kvChange(); });
document.addEventListener("change", e => { const t = e.target; if (!$("line")?.contains(t)) return;
  if (t.matches("[data-kv],[data-kvoff],[data-kvkit]")) kvChange();
  if (t.id === "kvUp" && t.files.length) { const f = t.files[0]; t.value = ""; kvUpload(f); }
  if (t.id === "kkLogo" && t.files.length) { const f = t.files[0]; t.value = ""; kkLogo(f); } });
function kvInit() { // design_line.js lineInit 이 부른다
  db.collection("brandkit").onSnapshot(s => { kits = s.docs.map(d => ({id: d.id, ...structuredClone(d.data())})).sort((a, b) => String(a.이름).localeCompare(String(b.이름))); if (tab === "line") drawLine(); }); }
