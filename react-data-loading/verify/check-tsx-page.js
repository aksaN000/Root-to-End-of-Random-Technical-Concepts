// Checks the companion page react-data-loading/tsx-syntax/ in real Chromium: every live demo gives the
// result the page's text claims, and the page is clean at 1300 px and 390 px, in light and dark mode.
//   node verify/check-tsx-page.js
// The demos run real JavaScript (the arrow-function and Object.is buttons) and the real React 19.2.8
// production bundle in ../vendor/ (the &&, onClick, key and push demos), so this checks the claims
// against the systems themselves, not against a model.
const http = require("http"), fs = require("fs"), path = require("path");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
let report = null; try { report = require("../../tools/report"); } catch (e) {}
let AXE = null; try { AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const ROOT = path.resolve(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end("not found"); }
      r.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream"); fs.createReadStream(f).pipe(r);
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}

(async () => {
  const srv = await serve(), base = "http://127.0.0.1:" + srv.address().port + "/react-data-loading/tsx-syntax/";
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const browser = await pw.chromium.launch({ env, args: ["--no-proxy-server"] });
  const fails = [], checks = [];
  const expect = (name, ok, got) => { checks.push(name); if (!ok) fails.push({ check: name, got }); };
  for (const w of [1300, 390]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push("script error: " + e.message));
    page.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + ": " + r.url()); });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.React && document.querySelector("#clickDemo button"), null, { timeout: 10000 }).catch(() => {});
    expect(w + "px: no script errors or failed requests", !errs.length, errs);
    expect(w + "px: no sideways scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "scrolls");
    if (w === 1300) {
      // && demo: n = 0 prints a 0 on the left, nothing on the right
      expect("&& with n = 0 prints 0", (await page.textContent("#andA")).includes("[0]") && (await page.textContent("#andB")).includes("[]"), [await page.textContent("#andA"), await page.textContent("#andB")]);
      // onClick: B calls add() 3 times while drawing, before any click
      const before = (await page.textContent("#clickLog")).trim().split("\n");
      expect("onClick={add(tech)} calls add() 3 times while drawing", before.length === 3 && before.every(l => /add\(\) called with "(React|Vue|Svelte)"/.test(l)), before);
      await page.click("#clickDemo .row:nth-child(1) button >> nth=0");
      await page.click("#clickDemo .row:nth-child(2) button >> nth=0");
      await page.click("#clickDemo .row:nth-child(3) button >> nth=0");
      const after = (await page.textContent("#clickLog")).trim().split("\n");
      expect("A logs the technology on click, B does nothing on click, C logs a click event", after.length === 5 && after[3] === 'add() called with "React"' && /click EVENT/.test(after[4]), after);
      // arrow functions: run every button and compare with real JavaScript here
      const AR = [["(name) => name.toUpperCase()", ["REACT", "VUE", "SVELTE"]], ["block with return", ["REACT", "VUE", "SVELTE"]], ["block without return", [null, null, null]], ["object without ( )", [null, null, null]], ["object in ( )", [{ label: "React" }, { label: "Vue" }, { label: "Svelte" }]]];
      for (let i = 0; i < AR.length; i++) {
        await page.click("#arrowBtns button >> nth=" + i);
        const txt = await page.textContent("#arrowOut"), json = txt.replace(/^Real result: /, "").split("\n")[0].replace(/undefined/g, "null");
        let got; try { got = JSON.parse(json); } catch (e) { got = txt; }
        expect("arrow button " + (i + 1) + ": " + AR[i][0], JSON.stringify(got) === JSON.stringify(AR[i][1]), txt);
      }
      // Object.is buttons
      const IS = [true, false, true, true, false];
      for (let i = 0; i < IS.length; i++) { await page.click("#isBtns button >> nth=" + i); expect("Object.is button " + (i + 1), (await page.textContent("#isOut")).includes("→  " + IS[i]), await page.textContent("#isOut")); }
      // key demo: tick React in both, remove the first item
      await page.check("#keyA input >> nth=0"); await page.check("#keyB input >> nth=0"); await page.click("#keyRm");
      const kA = await page.$$eval("#keyA input", xs => xs.map(x => x.checked)), kB = await page.$$eval("#keyB input", xs => xs.map(x => x.checked));
      const nB = await page.$$eval("#keyB .lrow", xs => xs.map(x => x.textContent));
      expect("key={id}: nothing ticked after removing React", kA.length === 3 && kA.every(x => !x), kA);
      expect("key={index}: the tick moves to Vue.js", kB[0] === true && kB.slice(1).every(x => !x) && /Vue\.js/.test(nB[0]), { kB, nB });
      // push vs new array
      await page.click('#pushDemo button >> nth=0'); await page.click('#pushDemo button >> nth=0');
      const p1 = await page.textContent("#pushDemo .out");
      await page.click('#pushDemo button >> nth=1');
      const p2 = await page.textContent("#pushDemo .out");
      expect("push + setList(list) does not redraw", /On screen: React\nArray length: 1/.test(p1), p1);
      expect("a new array redraws, showing the pushed items too", /On screen: React, Item 2, Item 3, Item 4/.test(p2), p2);
      // quiz: every question shows its explanation
      const qOk = await page.evaluate(() => { let n = 0; document.querySelectorAll("#quizBox .qz").forEach((q, i) => { q.querySelector("button").click(); if (document.getElementById("qx" + i).style.display === "block") n++; }); return [n, document.querySelectorAll("#quizBox .qz").length]; });
      expect("every quiz question explains its answer", qOk[0] === qOk[1] && qOk[1] > 0, qOk);
    }
    if (AXE) {
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" }); await page.waitForTimeout(150);
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async tags => (await axe.run(document, { runOnly: { type: "tag", values: tags } })).violations.map(x => x.id + " on " + x.nodes.length), ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
        expect(w + "px " + scheme + ": axe-core finds no WCAG 2.2 A/AA violations", !v.length, v);
      }
    }
    await page.close();
  }
  const version = browser.version(); await browser.close(); srv.close();
  fails.forEach(f => console.log("FAIL", JSON.stringify(f).slice(0, 400)));
  console.log(`tsx-syntax page: ${checks.length - fails.length}/${checks.length} checks pass in Chromium ${version} (live demos on real JavaScript and real React 19.2.8, page at 1300 and 390 px${AXE ? ", axe-core in light and dark" : ""})`);
  if (report) report("tsx-page", { reference: `Chromium ${version}: the page's own demos on real JavaScript and the vendored React 19.2.8 production build`, cases: checks.length, matched: checks.length - fails.length, passed: !fails.length, detail: `every demo on react-data-loading/tsx-syntax/ against the claim the page makes about it, plus script errors, failed requests, sideways scroll and axe-core at 1300 and 390 px`, failures: fails });
  console.log(fails.length ? fails.length + " problem(s)" : "all " + checks.length + " checks pass");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
