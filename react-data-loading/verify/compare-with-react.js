// Checks this page's model (react-model.js) against real React 19.2.8 in real Chromium.
//   node verify/compare-with-react.js                every click sequence up to length 4, plus 60 seeded random ones per array
//   node verify/compare-with-react.js 30 7           30 random sequences per array, seed 7
// 1. Dependency arrays: for 4 arrays (none, [], [count], [count, dark]) and many click sequences, the
//    model must say, for the mount and every click, how many times the component renders and whether
//    the effect runs, exactly as real React does. Clicks are real click() calls on React's buttons.
// 2. The two line-by-line labs: real React runs the Suspense and the useEffect versions of the
//    Technologies section (production build, server delays of 300 ms and 800 ms), and must log exactly
//    the model's observable steps, in order, with the same screen at each one.
// 3. StrictMode in the development build: requests and renders as the page says; and the uncached
//    promise bug: requests keep repeating and the grid never appears; and the wrong file name, which
//    ends in a JSON SyntaxError and a blank screen.
// 4. vendor/react-<version>.production.js still matches a fresh production build of the pinned packages.
const fs = require("fs"), path = require("path");
const H = require("./harness"), P = require("./programs"), M = require("../react-model.js");
let report = null; try { report = require("../../tools/report"); } catch (e) {}
const MODES = ["none", "empty", "count", "both"], ACTS = ["inc", "dark", "same"];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

(async () => {
  const count = +(process.argv[2] || 60), seed = +(process.argv[3] || 2026);
  const fails = [];
  // 4. the shipped bundle
  const prod = H.buildBundle("production"), dev = H.buildBundle("development");
  const vend = path.join(__dirname, "..", "vendor", "react-" + H.VERSION + ".production.js");
  const vendorOk = fs.existsSync(vend) && fs.readFileSync(vend, "utf8").endsWith(prod);
  if (!vendorOk) fails.push({ part: "vendor", problem: "vendor bundle differs from a fresh build; run node verify/build-vendor.js" });

  // 1. click sequences
  const seqs = [];
  (function all(prefix) { if (prefix.length) seqs.push(prefix); if (prefix.length < 4) ACTS.forEach(a => all(prefix.concat(a))); })([]);
  const exhaustive = seqs.length, r = rng(seed);
  for (let i = 0; i < count; i++) { const n = 5 + Math.floor(r() * 5), s = []; for (let k = 0; k < n; k++) s.push(ACTS[Math.floor(r() * 3)]); seqs.push(s); }
  const distinct = [...new Map(seqs.map(s => [s.join(" "), s])).values()];
  const browser = await H.openBrowser();
  const driver = fs.readFileSync(path.join(__dirname, "..", "deps-real.js"), "utf8");
  let depCases = 0, depOk = 0, renderBail = 0, eagerBail = 0;
  await Promise.all(MODES.map(async mode => {
    const { page, errors } = await H.openLab(browser, prod, driver, 0);
    const real = await page.evaluate(async ([mode, seqs]) => { const out = []; for (const s of seqs) out.push(await runDepsReal(React, ReactDOMClient, mode, s)); return out; }, [mode, distinct]);
    distinct.forEach((s, i) => {
      depCases++;
      const mine = M.DepsModel.run(mode, s);
      if (JSON.stringify(mine) === JSON.stringify(real[i])) depOk++;
      else fails.push({ part: "deps", mode, clicks: s.join(" "), model: mine.map(x => x.rendered + (x.effect ? "E" : "-")).join(" "), real: real[i].map(x => x.rendered + (x.effect ? "E" : "-")).join(" ") });
      real[i].forEach((x, k) => { if (k && s[k - 1] === "same") { if (x.rendered) renderBail++; else eagerBail++; } });
    });
    errors.forEach(e => fails.push({ part: "deps", mode, problem: "page error: " + e }));
    await page.close();
  }));

  // 2. the timelines
  let tlRuns = 0, tlOk = 0;
  for (const name of ["suspense", "effect"]) for (const delay of [300, 800]) {
    tlRuns++;
    const { page, counts, errors } = await H.openLab(browser, prod, P.program(name, false), delay);
    await page.waitForFunction(() => window.LOG && LOG.some(l => l[1] === "grid"), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(150);
    const real = await page.evaluate(() => LOG), want = M.TIMELINES.observed(M.TIMELINES[name]);
    if (JSON.stringify(real) === JSON.stringify(want) && counts.json === 1 && !errors.length) tlOk++;
    else fails.push({ part: "timeline", name, delay, model: want, real, requests: counts.json, errors });
    await page.close();
  }

  // 3. StrictMode (development build) and the uncached promise
  const S = M.TIMELINES.STRICT, strict = {};
  for (const name of ["suspense", "effect"]) {
    const { page, counts } = await H.openLab(browser, dev, P.program(name, true), 300);
    await page.waitForTimeout(1500);
    const log = await page.evaluate(() => LOG);
    strict[name] = { requests: counts.json, firstRenders: log.filter(l => /loading = true/.test(l[0])).length, technologiesRenders: log.filter(l => l[0] === "Technologies(): render").length, grid: log.some(l => l[1] === "grid") };
    for (const k of Object.keys(S[name])) if (strict[name][k] !== S[name][k]) fails.push({ part: "strict", name, key: k, model: S[name][k], real: strict[name][k] });
    if (!strict[name].grid) fails.push({ part: "strict", name, problem: "the grid never appeared" });
    await page.close();
  }
  const un = await H.openLab(browser, prod, P.program("uncached", false), 100);
  await un.page.waitForTimeout(2000);
  const unLog = await un.page.evaluate(() => LOG), unReq = un.counts.json, unGrid = unLog.some(l => l[1] === "grid");
  if (unReq < 5 || unGrid) fails.push({ part: "uncached", problem: "expected repeating requests and no grid", requests: unReq, grid: unGrid });
  await un.page.close();
  // 5. the wrong file name: a 404 page instead of JSON, the promise rejects, and React removes the whole tree
  const ty = await H.openLab(browser, prod, P.program("typo", false), 100);
  await ty.page.waitForTimeout(1200);
  const tyLog = await ty.page.evaluate(() => LOG), tyBlank = tyLog.length > 0 && tyLog[tyLog.length - 1][1] === "blank" && tyLog.some(l => l[1] === "spinner");
  const tyJson = ty.errors.some(e => /is not valid JSON/.test(e));
  if (!tyBlank || !tyJson) fails.push({ part: "typo", problem: "expected the spinner, then a JSON SyntaxError and a blank screen", log: tyLog.slice(-4), errors: ty.errors });
  await ty.page.close();
  await browser.close();

  console.log(`dependency arrays: ${depOk}/${depCases} programs match real React ${H.VERSION} (${distinct.length} distinct click sequences × 4 arrays; ${exhaustive} exhaustive up to length 4, the rest seeded random, seed ${seed}); same-value clicks: ${eagerBail} skipped before rendering, ${renderBail} rendered once and bailed out`);
  console.log(`timelines: ${tlOk}/${tlRuns} runs log exactly the model's steps (Suspense and useEffect versions, 300 ms and 800 ms server delay)`);
  console.log(`StrictMode (development build): Suspense version ${strict.suspense.requests} request, Technologies rendered ${strict.suspense.technologiesRenders}×; useEffect version ${strict.effect.requests} requests, first render ${strict.effect.firstRenders}×`);
  console.log(`uncached promise: ${unReq} requests in 2 s with a 100 ms server, grid shown: ${unGrid}`);
  console.log(`wrong file name: spinner, then "${(ty.errors.find(e => /JSON/.test(e)) || "no JSON error").slice(0, 70)}", then a blank screen: ${tyBlank && tyJson}`);
  console.log(`vendor bundle: ${vendorOk ? "matches a fresh build" : "DIFFERS"}`);
  fails.slice(0, 8).forEach(f => console.log("FAIL", JSON.stringify(f).slice(0, 600)));
  const total = depCases + tlRuns + 2 + 1 + 1 + 1, matched = depOk + tlOk + (fails.some(f => f.part === "strict") ? 0 : 2) + (fails.some(f => f.part === "uncached") ? 0 : 1) + (fails.some(f => f.part === "typo") ? 0 : 1) + (vendorOk ? 1 : 0);
  if (report) report("react", {
    reference: `react and react-dom ${H.VERSION} (production and development builds, bundled with esbuild) in Playwright's Chromium`,
    cases: total, matched, passed: fails.length === 0, seed,
    detail: `${depCases} dependency-array programs (${distinct.length} distinct click sequences, ${exhaustive} of them every sequence up to length 4, on 4 arrays), checked for renders and effect runs at every step; ${tlRuns} timeline runs of the two line-by-line labs; StrictMode request and render counts; the uncached-promise loop; the wrong-file-name blank page; the vendored bundle`,
    failures: fails
  });
  console.log(fails.length ? fails.length + " mismatch(es)" : `all ${total} cases match React ${H.VERSION}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
