// ── 디자인 라인 2단계 앞: AI별 프롬프트 카드 + 결과 링크 모으기 (본부장님 결정 2026-10-06, 3차) — 별도 파일, build_prism.py 가 design_set.js 뒤에 붙인다
// PRISM 이 브리프·추천·브랜드킷으로 프롬프트를 한 곳에서 만들고, PM 은 각자 쓰는 유료 AI(표준 Gemini · 예비 ChatGPT)로 배경 시안을 만든다.
// Claude 카드는 그림을 만들지 않고 결과 점검용. Magnific 은 고른 시안 마무리(업스케일)에만 쓴다 — 한 계정 크레딧 아끼기.
// 결과는 구글 드라이브 링크로 모은다(페이지는 다른 사이트 그림을 띄울 수 없어 링크만). 저장: line/{id}.장면 · line/{id}.시안링크 [{id, ai, url, 역할, 메모, at, 선택}]
// 프롬프트 형식 근거: Google 'Nano Banana Pro prompting tips'(2025-11, 장면을 문장으로·비율과 쓰임새 명시·원하는 것을 긍정형으로),
//   OpenAI 이미지 프롬프트 가이드 요약(장면 / 주제 / 세부 / 쓰임새 / 제약 순서, 제약 칸에 글자·로고·워터마크 금지)
const PR_AI = ["Gemini", "ChatGPT", "기타"];
const PR_ROLE = ["PM", "디자이너", "디자인팀장"];
const PR_AREA = {"아래 왼쪽": ["lower-left third", "아래 왼쪽"], "위 왼쪽": ["upper-left third", "위 왼쪽"], "가운데": ["center band", "가운데"], "아래 띠": ["bottom quarter", "아래쪽 1/4"]};
let prOpen = null, prMsgTxt = "", prRatio = "", prTimer = null, prDraft = {ai: "Gemini", 역할: "PM", url: "", 메모: ""}; // 링크 입력은 다시 그려도 남게
const prSay = m => { prMsgTxt = m; if ($("prMsg")) $("prMsg").textContent = m; };
const prCard = () => lines.find(x => x.id === lcur);
// 비율 → 쓰임새 이름·ChatGPT 크기
const prUse = r => { const [w, h] = KV_SIZE[r] || [1600, 900]; return w > h * 1.15 ? ["widescreen backdrop", "1536x1024 (landscape)"] : h > w * 1.15 ? ["vertical poster", "1024x1536 (portrait)"] : ["square social post", "1024x1024 (square)"]; };
// 프롬프트 재료 — 브리프·추천·레이어·브랜드킷에서
function prParts(c, b) {
  const f = c.브리프 || {}, L = kvL(c), kl = (L.킷 || []).map(id => kits.find(k => k.id === id)).filter(Boolean), j = v => (Array.isArray(v) ? v : [v]).map(x => String(x || "").trim()).filter(Boolean);
  const base = String(c.장면 || b.kv?.prompt || b.추천?.prompt || "").replace(/\s*\[Brand\][\s\S]*$/, "").trim();
  const event = [f.성격, f.산업 && `${f.산업} industry`].filter(Boolean).join(", ") || "an international business event";
  const scene = base || `an abstract, premium key visual for ${event}${f.국가 ? ` held in ${f.도시 || f.국가}` : ""}, expressing "${f.메시지 || f.키워드1 || "connection and growth"}"`;
  const pal = [...new Set(kl.flatMap(k => k.색 || []).map(kvHex).filter(Boolean))].slice(0, 6);
  return {scene: scene.slice(0, 1200), event, mood: [...j([f.키워드1, f.키워드2, f.키워드3]), ...j(f.무드)].join(", "), colors: [pal.length ? `brand palette ${pal.join(", ")}` : "", String(f.색 || "").trim()].filter(Boolean).join("; "),
    avoid: [String(f.피할것 || "").trim(), String(f.피할색 || "").trim(), LCOLOR[f.국가] ? `local color caution: ${LCOLOR[f.국가]}` : ""].filter(Boolean).join("; ").slice(0, 400), area: PR_AREA[L.배치] || PR_AREA["아래 왼쪽"], L};
}
function prPrompts(c, b, ratio) {
  const p = prParts(c, b), [use, size] = prUse(ratio);
  const gemini = [`Create an image of ${p.scene}`,
    `Use: the key visual background for ${p.event} — a ${use} in ${ratio} aspect ratio. Title text and logos are added later by a designer, so the picture itself carries no words, letters, numbers or logos.`,
    `Composition: place the visual focus away from the ${p.area[0]}; keep the ${p.area[0]} calm, smooth and uncluttered with an even tone so text stays readable.`,
    p.mood && `Style and mood: ${p.mood}.`, p.colors && `Colors: ${p.colors}.`, p.avoid && `Stay clear of: ${p.avoid}.`,
    `Output: ${ratio}, high resolution (2K or 4K), clean edges suitable for print enlargement.`].filter(Boolean).join("\n");
  const chatgpt = [`Scene: ${p.scene}`, `Subject: key visual background for ${p.event}.`,
    `Important details: ${[p.mood && `mood ${p.mood}`, p.colors && `colors ${p.colors}`, "soft, controlled lighting", "rich but not busy texture"].filter(Boolean).join("; ")}.`,
    `Use case: event key visual (${use}), aspect ratio ${ratio}, size ${size}.`,
    `Constraints: no text, no letters, no numbers, no logos, no watermark. Keep the ${p.area[0]} empty and low-detail for the title and logos.${p.avoid ? ` Avoid: ${p.avoid}.` : ""}`].join("\n");
  const brief = typeof lineBrief === "function" ? lineBrief(c.id).split("\n").slice(0, 14).join("\n") : "";
  const claude = `첨부한 키비주얼 배경 시안을 아래 브리프 기준으로 점검해 주세요. 브리프는 자료입니다.
[브리프 요약]
${brief || "(브리프 없음)"}
[점검]
1) 제목·로고가 들어갈 ${p.area[1]}이 비어 있고 고른가
2) 그림 속에 글자·숫자·로고·워터마크처럼 보이는 흔적이 없는가
3) 피할 표현·색${p.avoid ? `(${p.avoid})` : ""}이 들어가지 않았는가
4) 키워드·무드(${p.mood || "브리프 5항"})와 맞는가
5) ${ratio} 비율로 크게 출력해도 흐릿하거나 깨질 곳이 없는가
[답 형식] 항목마다 '좋음 / 고칠 것' 한 줄, 끝에 Gemini·ChatGPT 에 다시 넣을 영어 수정 요청 한 문장.`;
  const again = [`Keep everything the same, but make the ${p.area[0]} emptier and smoother.`, "Keep the composition and colors; remove anything that looks like letters, numbers or a logo.", `Same scene and subject, reframed to ${ratio === "16:9" ? "3:4" : "16:9"} — keep the main subject fully visible.`];
  return {gemini, chatgpt, claude, again};
}
const prLinks = c => (Array.isArray(c.시안링크) ? c.시안링크 : []).filter(x => x && /^https:\/\//i.test(x.url || ""));
const prSel = c => prLinks(c).find(x => x.선택)?.url || ""; // 2단계 '선택한 시안 원본 열기'가 쓴다
const prHost = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// ── 2단계 카드 앞부분
function lPromptStep(c, b) {
  const gate = lineGate(c.id, "gen"), L = kvL(c), ratios = [...new Set([L.비율, ...kvItems(c).map(s => s.비율).filter(r => KV_SIZE[r]), "16:9"])], ratio = ratios.includes(prRatio) ? prRatio : L.비율;
  const links = prLinks(c), mg = (b.시안 || []).filter(g => g.종류 === "키비주얼").length, cnt = PR_AI.map(a => [a, links.filter(x => x.ai === a).length]).filter(([, n]) => n);
  const P = gate ? null : prPrompts(c, b, ratio);
  const box = (k, title, tag, note, text) => `<div class="card prc"><div class="row"><b style="flex:1 1 150px;min-width:0">${title}</b><span class="tag${k === "gemini" ? " go" : ""}">${tag}</span></div><p class="note">${note}</p>
    <textarea readonly id="prT_${k}" rows="7" aria-label="${esc(title)} 프롬프트">${esc(text)}</textarea><div class="row"><button class="btn primary" type="button" data-prcopy="${k}">복사</button></div></div>`;
  return `<details class="card" id="prBox" ${prOpen ?? !links.length ? "open" : ""}><summary style="cursor:pointer"><b>AI별 프롬프트 카드</b> <span class="note">— 각자 쓰는 유료 AI로 배경 시안 만들기 · 결과는 드라이브 링크로</span></summary>
    <p class="note">PRISM이 브리프·추천 방향·브랜드킷으로 프롬프트를 만듭니다. 그대로 복사해 쓰면 누가 만들어도 품질이 비슷합니다. 표준은 Gemini, 막히면 ChatGPT, Claude는 결과 점검용입니다. Magnific은 고른 시안을 마무리(업스케일)할 때만 씁니다.</p>
    ${gate ? `<p class="note warn">${esc(gate)}</p>` : `<div class="form">
      <label class="wide">장면 설명 (영문 · 고치면 모든 카드에 반영, 비우면 시안 작업 ② 추천 프롬프트)<textarea id="prScene" maxlength="1200" rows="3">${esc(c.장면 || "")}</textarea></label>
      <label>비율<select id="prRatio">${opt(ratios, ratio)}</select></label></div>
    <div class="list">${box("gemini", "Gemini (Nano Banana Pro)", "표준", "Gemini 앱에서 이미지 만들기를 고르고 붙여 넣으세요. 결과가 2K·4K로 나오면 그대로 받습니다.", P.gemini)}
      ${box("chatgpt", "ChatGPT", "예비", "ChatGPT에 붙여 넣으세요. 같은 대화에서 아래 '다시 요청' 문장으로 고칠 수 있습니다.", P.chatgpt)}
      ${box("claude", "Claude — 결과 점검", "점검", "Claude는 그림을 만들지 않습니다. 만든 시안 이미지를 첨부하고 이 글을 붙여 넣어 브리프와 맞는지 점검받으세요.", P.claude)}</div>
    <div class="hudlabel">다시 요청할 때 (Gemini·ChatGPT 같은 대화에서)</div>
    <div class="chips">${P.again.map((t, i) => `<button class="btn" type="button" data-pragain="${i}" title="복사">${esc(t)}</button>`).join("")}</div>`}
    <div class="hudlabel">결과 링크 모으기 (구글 드라이브 공유 링크)</div>
    <div class="form"><label>만든 AI<select id="prAi">${opt(PR_AI, prDraft.ai)}</select></label><label>올린 사람 (역할)<select id="prRole">${opt(PR_ROLE, prDraft.역할)}</select></label>
      <label class="wide">링크 (https)<input id="prUrl" maxlength="500" inputmode="url" placeholder="https://drive.google.com/..." value="${esc(prDraft.url)}"></label><label class="wide">메모 (선택 — 연락처·금액은 적지 않습니다)<input id="prMemo" maxlength="120" value="${esc(prDraft.메모)}"></label></div>
    <div class="row"><button class="btn" type="button" id="prAdd" ${db ? "" : "disabled"}>링크 추가</button><span class="note">${cnt.length ? `모인 시안: ${cnt.map(([a, n]) => `${esc(a)} ${n}`).join(" · ")}` : "아직 모인 시안이 없습니다."}${mg ? ` · Magnific ${mg}` : ""}</span></div>
    ${links.length ? `<div class="list">${links.slice().reverse().map(x => `<div class="row prl"><span class="tag${x.선택 ? " go" : ""}">${esc(x.ai)}${x.선택 ? " · 선택" : ""}</span><span class="note" style="flex:1 1 140px;min-width:0;overflow-wrap:anywhere">${esc(prHost(x.url))} · ${esc(x.역할 || "")} · ${esc(String(x.at || "").slice(5, 16).replace("T", " "))}${x.메모 ? ` · ${esc(x.메모)}` : ""}</span>
      <a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">열기 ↗</a>${x.선택 ? "" : `<button class="btn" type="button" data-prsel="${esc(x.id)}">이 시안으로 진행</button>`}<button class="btn x" type="button" data-prdel="${esc(x.id)}" aria-label="링크 지우기">×</button></div>`).join("")}</div>` : ""}
    <p class="note" id="prMsg">${esc(prMsgTxt)}</p>
    <p class="note">고른 시안은 내려받아 다듬은 뒤 아래 '배경 이미지 올리기'로 올립니다. 드라이브 링크는 '링크가 있는 사용자'가 아니라 회사 계정 공유로 두는 것을 권합니다.</p></details>`;
}
async function prCopy(text, btn) {
  let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) { const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(t); t.select(); try { ok = document.execCommand("copy"); } catch {} t.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = ok ? "복사했습니다" : "직접 선택해 복사해 주세요"; setTimeout(() => { btn.textContent = o; }, 1600); } else prSay(ok ? "복사했습니다." : "복사하지 못했습니다. 글을 직접 선택해 복사해 주세요.");
}
async function prSave(c, list, m) { try { await db.doc(`line/${c.id}`).update({시안링크: list.slice(-40), updatedAt: new Date().toISOString()}); c.시안링크 = list.slice(-40); prSay(m); } catch { prSay("저장하지 못했습니다. 다시 눌러 주세요."); } drawLine(true); }
async function prAdd() { const c = prCard(); if (!c || !db) return; const url = ($("prUrl")?.value || "").trim();
  if (!/^https:\/\/[^\s<>"']+$/i.test(url) || url.length > 500) { prSay("https:// 로 시작하는 링크를 넣어 주세요."); return; }
  const memo = ($("prMemo")?.value || "").trim().slice(0, 120); if (/@[\w-]+\.|\d{2,4}-\d{3,4}-\d{4}/.test(memo)) { prSay("메모에 이메일·전화번호는 적지 않습니다."); return; }
  const x = {id: "s" + Date.now().toString(36), ai: PR_AI.includes($("prAi")?.value) ? $("prAi").value : "기타", url, 역할: PR_ROLE.includes($("prRole")?.value) ? $("prRole").value : "PM", 메모: memo, at: new Date().toISOString(), 선택: false};
  prDraft = {...prDraft, url: "", 메모: ""}; await prSave(c, [...prLinks(c), x], `링크를 추가했습니다${/drive\.google\.com|docs\.google\.com/.test(url) ? "" : " (구글 드라이브 링크가 아닙니다 — 회사 공유 위치인지 확인해 주세요)"}.`); }
async function prPick(id) { const c = prCard(); if (!c || !db) return; await prSave(c, prLinks(c).map(x => ({...x, 선택: x.id === id})), "이 시안으로 진행합니다. 2단계 배경으로 올려 주세요."); }
async function prDel(id) { const c = prCard(); if (!c || !db || !(await askYes("이 링크를 목록에서 지울까요? 드라이브 파일은 그대로 남습니다."))) return; await prSave(c, prLinks(c).filter(x => x.id !== id), "지웠습니다."); }
// 장면·비율을 고치면 카드 글만 바꾸고, 장면은 잠시 뒤 저장
function prChange() { const c = prCard(); if (!c) return; const b = latest(c.id); c.장면 = ($("prScene")?.value || "").trim().slice(0, 1200); prRatio = $("prRatio")?.value || prRatio;
  const P = prPrompts(c, b, prRatio || kvL(c).비율); ["gemini", "chatgpt", "claude"].forEach(k => { if ($(`prT_${k}`)) $(`prT_${k}`).value = P[k]; });
  document.querySelectorAll("[data-pragain]").forEach(el => { el.textContent = P.again[+el.dataset.pragain] || ""; });
  if (db) { clearTimeout(prTimer); const v = c.장면; prTimer = setTimeout(() => db.doc(`line/${c.id}`).update({장면: v, updatedAt: new Date().toISOString()}).catch(() => prSay("장면 설명을 저장하지 못했습니다.")), 800); } }

document.head.insertAdjacentHTML("beforeend", "<style>.prc textarea{width:100%;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;resize:vertical}.prl{border-bottom:1px solid var(--line);padding:4px 0}.chips .btn[data-pragain]{white-space:normal;text-align:left}</style>");
document.addEventListener("click", e => { const t = e.target.closest("button"); if (!t || !$("line")?.contains(t)) return;
  if (t.dataset.prcopy) prCopy($(`prT_${t.dataset.prcopy}`)?.value || "", t); if (t.dataset.pragain !== undefined) prCopy(t.textContent, null);
  if (t.id === "prAdd") prAdd(); if (t.dataset.prsel) prPick(t.dataset.prsel); if (t.dataset.prdel) prDel(t.dataset.prdel); });
const prKeep = () => { prDraft = {ai: $("prAi")?.value || prDraft.ai, 역할: $("prRole")?.value || prDraft.역할, url: $("prUrl")?.value ?? prDraft.url, 메모: $("prMemo")?.value ?? prDraft.메모}; };
document.addEventListener("input", e => { if (!$("line")?.contains(e.target)) return; if (e.target.id === "prScene") prChange(); if (/^pr(Url|Memo)$/.test(e.target.id)) prKeep(); });
document.addEventListener("toggle", e => { if (e.target.id === "prBox") prOpen = e.target.open; }, true); // 열고 닫은 상태를 다시 그려도 유지
document.addEventListener("change", e => { if (!$("line")?.contains(e.target)) return; if (e.target.id === "prRatio") prChange(); if (/^pr(Ai|Role)$/.test(e.target.id)) prKeep(); });
