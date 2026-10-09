// Captures what really happens when a mouse click reaches a page, in headless Chromium.
//   node capture.js   (from this folder; needs Playwright: npm install at the repo root)
// Writes:
//   order.json   the listener log for three clicks (a real click, btn.click() from script,
//                and a press on #a released on #b), plus elementFromPoint results
//   trace.json   a Chrome trace of the real click, from the browser process to our listener
//   (then run node flow.js to rebuild flow.json, the rows the page shows)
// Playwright's page.mouse sends Input.dispatchMouseEvent over the DevTools protocol. That enters
// Chrome in the browser process (RenderWidgetHostImpl::ForwardMouseEvent), the same place an OS
// click arrives after the window system, so everything from there on is the real path.
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
const fs = require("fs"), http = require("http");
const srv = http.createServer((q, r) => { r.setHeader("Content-Type", "text/html"); r.end(fs.readFileSync(__dirname + "/page.html")); }).listen(8098);
const CATS = ["input", "latencyInfo", "benchmark", "blink", "devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "toplevel"];
(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const b = await pw.chromium.launch({ env, args: ["--no-proxy-server"] });
  const p = await b.newPage({ viewport: { width: 400, height: 260 } });
  await p.goto("http://127.0.0.1:8098/");
  const out = { chrome: b.version(), playwright: require(require.resolve("playwright/package.json")).version, runs: {} };
  const take = async () => { const l = await p.evaluate(() => { const x = LOG.slice(); LOG.length = 0; return x; }); return l; };
  const settle = () => p.waitForTimeout(150);

  // 1. a real click on the button, recorded in a trace
  await p.mouse.move(130, 100); await settle(); await take();
  await b.startTracing(p, { path: __dirname + "/trace.json", categories: CATS });
  await p.mouse.down(); await settle();
  await p.mouse.up(); await settle();
  await b.stopTracing();
  out.runs.real = { how: "page.mouse.down() then page.mouse.up() at (130, 100), over #btn", log: await take() };

  // 2. the same button clicked from script
  await p.evaluate(() => document.getElementById("btn").click()); await settle();
  out.runs.script = { how: "document.getElementById('btn').click()", log: await take() };

  // 3. pressed on #a, released on #b: the click goes to their common ancestor
  await p.mouse.move(110, 165); await p.mouse.down(); await p.mouse.move(270, 165); await p.mouse.up(); await settle();
  out.runs.split = { how: "press over #a at (110, 165), move to (270, 165) over #b, release", log: (await take()).filter(l => !/^pointer(move|over|out)|^mouse(move|over|out)/.test(l)) };

  out.elementFromPoint = await p.evaluate(() => [[130, 100], [110, 165], [270, 165], [60, 60], [380, 240]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return { x, y, hit: e.id ? "#" + e.id : e.nodeName.toLowerCase() }; }));
  // the trace records Chrome's command line; drop the temporary profile path before publishing
  const tr = fs.readFileSync(__dirname + "/trace.json", "utf8").replace(/--user-data-dir=[^ "]*/g, "--user-data-dir=<temp>").replace(/"\/[^" ]*\/headless_shell[^" ]*/g, '"<chromium>/headless_shell');
  fs.writeFileSync(__dirname + "/trace.json", tr);
  fs.writeFileSync(__dirname + "/order.json", JSON.stringify(out, null, 1) + "\n");
  await b.close(); srv.close();
  console.log("wrote order.json and trace.json with Chrome " + out.chrome);
})();
