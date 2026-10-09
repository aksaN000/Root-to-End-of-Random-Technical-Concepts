// Runs the event-dispatch model and real Chromium on the same programs and compares, line by line,
// which listeners ran, in what order, with which eventPhase and currentTarget, where the microtasks
// ran, and whether defaultPrevented ended up true.
//   node verify/compare-dispatch.js                       the presets plus 4 seeded batches
//   node verify/compare-dispatch.js 500 7                 the presets plus 500 random programs, seed 7
//   node verify/compare-dispatch.js 300:7 300:99          several batches
// "by user" programs are clicked with page.mouse (Input.dispatchMouseEvent: the browser process
// input path); "by script" programs call dispatchEvent from a script.
const path = require("path"), fs = require("fs");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
const M = require("../dispatch-model.js");
const REAL = fs.readFileSync(path.join(__dirname, "../dispatch-real.js"), "utf8");
const MODEL = fs.readFileSync(path.join(__dirname, "../dispatch-model.js"), "utf8");
let report = null; try { report = require("../../tools/report"); } catch (e) {}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gen(r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const n = 1 + Math.floor(r() * 5), ids = "abcdef".slice(0, n).split(""), tags = ["div", "section", "span", "p", "article"];
  // random nesting: each element's parent is an earlier element or the body
  const parent = ids.map((id, i) => (i === 0 || r() < 0.25) ? null : ids[Math.floor(r() * i)]);
  const html = (p) => ids.filter((id, i) => parent[i] === p).map(id => { const t = pick(tags); return `<${t} id=${id}>${html(id)}</${t}>`; }).join("");
  const user = r() < 0.5, type = user ? "click" : pick(["click", "ping"]);
  const targets = ids.concat(["document", "window"]);
  const lines = [html(null)];
  const nL = 1 + Math.floor(r() * 7);
  for (let i = 0; i < nL; i++) {
    const opts = []; if (r() < 0.45) opts.push("capture"); if (r() < 0.2) opts.push("once"); if (r() < 0.2) opts.push("passive");
    const acts = [];
    const nA = r() < 0.5 ? 0 : 1 + Math.floor(r() * 2);
    for (let k = 0; k < nA; k++) {
      const x = r();
      if (x < 0.13) acts.push("stop"); else if (x < 0.22) acts.push("stopNow"); else if (x < 0.42) acts.push("prevent");
      else if (x < 0.65) acts.push("micro");
      else if (x < 0.85) acts.push("add " + pick(targets) + " " + type + (r() < 0.5 ? " capture" : "") + (r() < 0.2 ? " once" : ""));
      else acts.push("remove L" + (1 + Math.floor(r() * nL)));
    }
    lines.push(`listen ${pick(targets)} ${r() < 0.9 ? type : "other"}${opts.length ? " " + opts.join(" ") : ""}${acts.length ? ": " + acts.join(", ") : ""}`);
  }
  const flags = user ? "" : (r() < 0.3 ? " nobubble" : "") + (r() < 0.2 ? " nocancel" : "");
  lines.push(`dispatch ${type} at ${pick(ids)} by ${user ? "user" : "script"}${flags}`);
  return lines.join("\n");
}

(async () => {
  const args = process.argv.slice(2);
  let batches = args.some(a => a.includes(":")) ? args.map(a => a.split(":").map(Number)) : args.length ? [[+args[0], +(args[1] || 1)]] : [[400, 7], [400, 2026], [400, 99], [400, 4242]];
  const progs = M.PRESETS.map(p => p[1]);
  const handPicked = progs.length;
  for (const [count, seed] of batches) { const r = rng(seed); for (let i = 0; i < count; i++) progs.push(gen(r)); }
  const distinct = [...new Set(progs)];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const b = await pw.chromium.launch({ env, args: ["--no-proxy-server"] });
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent("<!doctype html><body style='margin:0'><iframe id=f style='border:0;width:800px;height:600px;position:absolute;left:0;top:0'></iframe>");
  await page.addScriptTag({ content: MODEL.replace("})(this);", "})(window);") });
  await page.addScriptTag({ content: REAL.replace("})(this);", "})(window);") });
  let pass = 0; const failures = [];
  for (const text of distinct) {
    const want = M.run(text), by = M.parse(text).dispatch.by;
    // a fresh iframe document for every program, so no listener survives from the last one
    await page.evaluate(() => new Promise(res => { const f = document.getElementById("f"); f.onload = res; f.srcdoc = "<!doctype html><html><head></head><body></body></html>"; }));
    let got;
    if (by === "script") {
      got = await page.evaluate(t => { const f = document.getElementById("f").contentWindow; const r = DispatchReal.setup(DispatchModel.parse(t), f); r.dispatchByScript(); return new Promise(res => setTimeout(() => res(r.result()), 0)); }, text);
    } else {
      const pt = await page.evaluate(t => { const f = document.getElementById("f").contentWindow; window.__r = DispatchReal.setup(DispatchModel.parse(t), f); return window.__r.point(); }, text);
      await page.mouse.click(pt.x, pt.y);
      got = await page.evaluate(() => new Promise(res => setTimeout(() => res(window.__r.result()), 0)));
    }
    const ok = got.log.join("\n") === want.log.join("\n") && got.defaultPrevented === want.defaultPrevented;
    if (ok) pass++; else failures.push({ program: text, model: { log: want.log, defaultPrevented: want.defaultPrevented }, chrome: got });
  }
  const version = b.version(); await b.close();
  const users = distinct.filter(t => / by user/.test(t)).length;
  const line = `${pass}/${distinct.length} distinct programs give the same listener order, phases, microtask placement and defaultPrevented as Chrome ${version} (${handPicked} presets + ${distinct.length - handPicked} random; ${users} real clicks, ${distinct.length - users} script dispatches)`;
  console.log(line);
  failures.slice(0, 3).forEach(f => console.log("\nMISMATCH\n" + f.program + "\nmodel:  " + JSON.stringify(f.model) + "\nchrome: " + JSON.stringify(f.chrome)));
  if (report) report("event-dispatch", { reference: "Chromium " + version + " (Playwright " + require(require.resolve("playwright/package.json")).version + ")", cases: distinct.length, matched: pass, passed: pass === distinct.length,
    handPicked, seeds: batches.map(([count, seed]) => ({ count, seed })), detail: `${users} real clicks through the browser's input path and ${distinct.length - users} script dispatches`, failures });
  process.exitCode = pass === distinct.length ? 0 : 1;
})();
