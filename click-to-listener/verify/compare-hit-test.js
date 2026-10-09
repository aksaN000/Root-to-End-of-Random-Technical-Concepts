// Runs the hit-test model and real Chromium's document.elementFromPoint on the same scenes and points.
//   node verify/compare-hit-test.js                 the presets plus 4 seeded batches of random scenes
//   node verify/compare-hit-test.js 200 7           200 random scenes, seed 7
//   node verify/compare-hit-test.js 100:7 100:99    several batches
// Scenes are drawn exactly as the lab draws them (with id labels). Each scene is tested at 40 points (whole CSS pixels: with fractional points Chrome counted 39.5 as inside a box starting at 40, and the model does not try to copy that conversion).
const path = require("path"), fs = require("fs");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
const M = require("../hit-model.js");
let report = null; try { report = require("../../tools/report"); } catch (e) {}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gen(r) {
  const n = 1 + Math.floor(r() * 7), lines = [], ids = [];
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  for (let i = 0; i < n; i++) {
    const id = "b" + i, w = [];
    w.push("box", id, ri(-20, 300), ri(-20, 200), ri(10, 220), ri(10, 160));
    if (ids.length && r() < 0.5) w.push("in", ids[Math.floor(r() * ids.length)]);
    const z = r(); if (z < 0.2) w.push("z=" + ri(-3, -1)); else if (z < 0.35) w.push("z=0"); else if (z < 0.6) w.push("z=" + ri(1, 4));
    const p = r(); if (p < 0.2) w.push("pe=none"); else if (p < 0.3) w.push("pe=auto");
    const v = r(); if (v < 0.12) w.push("hidden"); else if (v < 0.18) w.push("visible");
    if (r() < 0.2) w.push("clip");
    lines.push(w.join(" ")); ids.push(id);
  }
  return lines.join("\n");
}

(async () => {
  const args = process.argv.slice(2);
  const batches = args.some(a => a.includes(":")) ? args.map(a => a.split(":").map(Number)) : args.length ? [[+args[0], +(args[1] || 1)]] : [[250, 7], [250, 2026], [250, 99], [250, 4242]];
  const scenes = M.PRESETS.map(p => p[1]), handPicked = scenes.length;
  for (const [count, seed] of batches) { const r = rng(seed); for (let i = 0; i < count; i++) scenes.push(gen(r)); }
  const distinct = [...new Set(scenes)];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const b = await pw.chromium.launch({ env, args: ["--no-proxy-server"] });
  const page = await b.newPage({ viewport: { width: 400, height: 280 } });
  await page.setContent("<!doctype html><body style='margin:0'><div id=host></div>");
  let points = 0, pass = 0; const failures = []; let sceneOk = 0;
  for (let si = 0; si < distinct.length; si++) {
    const text = distinct[si], scene = M.parse(text);
    const r = rng(1000 + si), pts = [];
    for (let k = 0; k < 40; k++) pts.push([Math.floor(r() * M.W), Math.floor(r() * M.H)]);
    const real = await page.evaluate(([html, pts]) => { const h = document.getElementById("host"); h.innerHTML = html;
      return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.id ? e.id : e ? e.nodeName.toLowerCase() : null; }); }, [M.toHTML(scene, { labels: true }), pts]);
    let all = true;
    pts.forEach(([x, y], k) => { points++; const want = M.hitTest(scene, x, y).hit; if (want === real[k]) pass++; else { all = false; if (failures.length < 50) failures.push({ scene: text, x, y, model: want, chrome: real[k] }); } });
    if (all) sceneOk++;
  }
  const version = b.version(); await b.close();
  console.log(`${pass}/${points} points in ${distinct.length} distinct scenes hit the same element as Chrome ${version}'s elementFromPoint (${handPicked} presets + ${distinct.length - handPicked} random scenes, 40 points each; ${sceneOk} scenes match at every point)`);
  failures.slice(0, 3).forEach(f => console.log("\nMISMATCH at (" + f.x + ", " + f.y + "): model " + f.model + ", chrome " + f.chrome + "\n" + f.scene));
  if (report) report("hit-test", { reference: "Chromium " + version + " document.elementFromPoint", cases: points, matched: pass, passed: pass === points, handPicked,
    seeds: batches.map(([count, seed]) => ({ count, seed })), detail: `${distinct.length} distinct scenes (${handPicked} presets + ${distinct.length - handPicked} random), 40 points each; ${sceneOk} scenes match at every point`, failures });
  process.exitCode = pass === points ? 0 : 1;
})();
