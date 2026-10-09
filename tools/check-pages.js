// Loads every page in real Chromium and checks what a reader would hit.
//   node tools/check-pages.js            serve this checkout locally and test it
//   node tools/check-pages.js --live     test the published site instead
//   node tools/check-pages.js --browser=firefox   (or webkit) to try another engine
// Per page, at 1300 px and 390 px wide: no script errors, no failed requests, no sideways scroll;
// the 60-second version, quizzes, exam questions and reading list are present and respond to clicks;
// every local CSS/JS link carries a ?v= hash that matches the file (local mode);
// axe-core finds no WCAG 2.2 A/AA violations, in light and in dark mode (after the quizzes and exam answers are opened).
// Local runs of the default engine write validation/results/pages.json for VALIDATION.md.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
const ROOT = path.resolve(__dirname, "..");
let AXE = null; try { AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) { console.log("axe-core not installed (npm install): accessibility not checked"); }
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const LIVE = "https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/";
const args = process.argv.slice(2), live = args.includes("--live");
const engine = (args.find(a => a.startsWith("--browser=")) || "--browser=chromium").split("=")[1];
const PAGES = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, "index.html")) && !d.startsWith(".")).sort();
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".pdf": "application/pdf", ".svg": "image/svg+xml" };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end("not found"); }
      r.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
      fs.createReadStream(f).pipe(r);
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}

(async () => {
  let srv = null, base = LIVE;
  if (!live) { srv = await serve(); base = "http://127.0.0.1:" + srv.address().port + "/"; }
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const browser = await pw[engine].launch(live ? {} : { env, args: engine === "chromium" ? ["--no-proxy-server"] : [] });
  let fails = 0; const rows = [], failures = [];
  const fail = (page, w, msg) => { fails++; failures.push({ page, width: w, problem: msg }); console.log(`FAIL ${page} @${w}px: ${msg}`); };
  async function axeRun(page) {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async tags => {
      if (window.rkMarkScrollers) window.rkMarkScrollers();
      const r = await axe.run(document, { runOnly: { type: "tag", values: tags } });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, first: v.nodes[0].target.join(" ") }));
    }, AXE_TAGS);
  }

  // stamped asset hashes (local mode)
  if (!live) {
    const PAT = /(?:src|href)="([^"#?:]+\.(?:css|js))(?:\?v=([0-9a-f]+))?"/g;
    for (const d of [""].concat(PAGES)) {
      const html = fs.readFileSync(path.join(ROOT, d, "index.html"), "utf8"); let m;
      while ((m = PAT.exec(html))) {
        const file = path.join(ROOT, d, m[1]);
        const h = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
        if (m[2] !== h) fail(d || "home", "-", `${m[1]} has ?v=${m[2] || "(none)"} but the file hash is ${h}; run python3 tools/stamp-assets.py`);
      }
    }
  }

  for (const d of [""].concat(PAGES)) {
    for (const w of [1300, 390]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      const errs = [];
      page.on("pageerror", e => errs.push("script error: " + e.message));
      page.on("requestfailed", r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push("request failed: " + r.url()); });
      page.on("response", r => { if (r.status() >= 400 && r.url().startsWith(base)) errs.push("HTTP " + r.status() + ": " + r.url()); });
      await page.goto(base + (d ? d + "/" : ""), { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const info = await page.evaluate(() => ({
        hscroll: document.documentElement.scrollWidth > innerWidth,
        tldr: !!document.querySelector(".tldr svg"),
        quizzes: document.querySelectorAll(".quiz").length,
        exq: document.querySelectorAll(".exq").length,
        cards: document.querySelectorAll("#reading-list .rk-card").length,
        report: document.querySelectorAll(".rk-report").length
      }));
      const name = d || "home";
      errs.forEach(e => fail(name, w, e));
      if (info.hscroll) fail(name, w, "the page scrolls sideways");
      if (d) {
        if (!info.tldr) fail(name, w, "no 60-second version diagram");
        if (!info.quizzes) fail(name, w, "no quizzes");
        if (!info.exq) fail(name, w, "no exam questions");
        if (!info.cards) fail(name, w, "empty reading list");
        if (!info.report) fail(name, w, "no report-a-mistake links");
        if (w === 1300) {
          const clicks = await page.evaluate(() => {
            let quizOk = 0, examOk = 0;
            document.querySelectorAll(".quiz").forEach(q => { const o = q.querySelector(".opt"); if (o) { o.click(); if (q.querySelector(".ex")) quizOk++; } });
            document.querySelectorAll(".exq").forEach(q => { const b = q.querySelector(".show"); if (b) { b.click(); if (!q.querySelector(".a").hidden) examOk++; } });
            return { quizOk, examOk, quizzes: document.querySelectorAll(".quiz").length, exq: document.querySelectorAll(".exq").length };
          });
          if (clicks.quizOk !== clicks.quizzes) fail(name, w, `only ${clicks.quizOk}/${clicks.quizzes} quizzes showed feedback`);
          if (clicks.examOk !== clicks.exq) fail(name, w, `only ${clicks.examOk}/${clicks.exq} exam answers opened`);
        }
      }
      let a11y = null;
      if (AXE) {
        a11y = 0;
        for (const scheme of ["light", "dark"]) {
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" }); await page.waitForTimeout(150); // reduced motion: decorative fades would otherwise be measured mid-animation
          for (const v of await axeRun(page)) { a11y += v.nodes; fail(name, w, `accessibility (${scheme}): ${v.id} [${v.impact}] on ${v.nodes} element(s), first: ${v.first}`); }
        }
      }
      rows.push({ page: name, width: w, problems: errs.length + (info.hscroll ? 1 : 0), a11y });
      console.log(`page ${name.padEnd(22)} ${String(w).padStart(4)}px  ${errs.length ? errs.length + " problem(s)" : "clean"}  quizzes ${info.quizzes}, exam ${info.exq}, reading ${info.cards}, a11y ${a11y === null ? "not checked" : a11y + " violation(s)"}`);
      await page.close();
    }
  }
  const version = browser.version();
  await browser.close(); if (srv) srv.close();
  if (!live && engine === "chromium") {
    const pwv = require(require.resolve("playwright/package.json")).version;
    require("./report")("pages", { reference: `Chromium ${version} (Playwright ${pwv})${AXE ? `, axe-core ${require(require.resolve("axe-core/package.json")).version}` : ""}`,
      cases: rows.length, matched: rows.filter(r => !r.problems && !r.a11y).length, passed: fails === 0,
      detail: `${PAGES.length + 1} pages × 2 widths; accessibility checked in light and dark mode against ${AXE_TAGS.join(", ")}`,
      pages: rows, failures });
  }
  console.log(fails ? `${fails} problem(s) found` : `all pages passed in ${engine} (${live ? "live site" : "local checkout"})`);
  process.exit(fails ? 1 : 0);
})();
