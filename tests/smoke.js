// 업무실 페이지 연기 시험: 빌드된 org/*.html 을 빈 저장소(db)로 열어 JS 오류·가로 넘침(390px)을 잡는다.
// 사용: python org/build_<이름>.py 들을 먼저 실행 → node tests/smoke.js [페이지이름...]
// CDN 스크립트(xlsx·d3·topojson)는 node_modules 에 있으면 그걸 쓰고, 없으면 네트워크로 받는다.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PAGES = ["office", "radar", "decoder", "atlas", "nexus", "pmo"];
const MOCK = `(() => { const q = () => ({orderBy: q, limit: q, where: q, onSnapshot: cb => { setTimeout(() => cb({docs: [], size: 0, empty: true}), 10); return () => {}; }, get: async () => ({docs: []}), add: async () => ({id: "x"}), doc: () => d()});
  const d = () => ({onSnapshot: cb => { setTimeout(() => cb({exists: false, data: () => undefined}), 10); return () => {}; }, get: async () => ({exists: false, data: () => undefined}), set: async () => {}, update: async () => {}, delete: async () => {}, collection: q});
  window.claude = {use: async n => n === "db" ? {collection: q, doc: d} : null}; })();`;
const local = u => { const m = u.match(/cdn\.jsdelivr\.net\/npm\/([^@]+)@[^/]+\/(.+)$/); const f = m && path.join(ROOT, "node_modules", m[1], m[2]); return f && fs.existsSync(f) ? f : null; };
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : PAGES;
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined}); let bad = 0;  // 브라우저를 따로 둔 환경: CHROMIUM_PATH=경로 npm test
  for (const name of names) {
    const file = path.join(ROOT, "org", `${name}.html`);
    if (!fs.existsSync(file)) { console.log(`- ${name}: 빌드 파일 없음 (python org/build_${name}.py)`); continue; }
    for (const width of [1280, 390]) {
      const page = await browser.newPage({viewport: {width, height: 900}}); const errs = [];
      page.on("pageerror", e => errs.push(e.message));
      await page.route("https://cdn.jsdelivr.net/**", r => { const f = local(r.request().url()); f ? r.fulfill({path: f, contentType: "application/javascript"}) : r.continue(); });
      await page.addInitScript(MOCK);
      await page.goto("file://" + file); await page.waitForTimeout(800);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const ok = !errs.length && over <= 1; bad += !ok;
      console.log(`${ok ? "✓" : "✗"} ${name} @${width}px${errs.length ? " 오류: " + errs.join(" | ") : ""}${over > 1 ? ` 가로 넘침 ${over}px` : ""}`);
      await page.close();
    }
  }
  await browser.close(); process.exit(bad ? 1 : 0);
})();
