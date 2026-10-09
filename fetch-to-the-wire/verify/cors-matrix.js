// Runs every combination of request (method x headers x credentials) and server CORS policy
// (Allow-Origin x Allow-Methods x Allow-Headers x Allow-Credentials) through real Chromium,
// records whether a preflight was sent and whether fetch() succeeded, and compares with Wire.cors().
// Usage: node verify/cors-matrix.js   (needs Playwright's Chromium)
const http = require("http"), path = require("path");
const Wire = require(path.join(__dirname, "..", "wire-model.js"));
let chromium; try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/npm-tools/node_modules/playwright").chromium; }
const ORIGIN = "http://app.example.test:8080";
const METHODS = ["GET", "POST", "PUT"];
const HEADERS = { none: {}, "ct-text": { "Content-Type": "text/plain" }, "ct-json": { "Content-Type": "application/json" }, xrw: { "X-Requested-With": "fetch" }, auth: { Authorization: "Bearer t" } };
const CREDS = ["same-origin", "include"];
const ACAO = { none: null, origin: "origin", star: "*" };
const ACAM = { none: null, POST: "POST", PUT: "PUT", star: "*" };
const ACAH = { none: null, ct: "content-type", "ct-xrw": "content-type, x-requested-with", star: "*" };
const ACAC = [false, true];
const cases = [];
for (const m of METHODS) for (const h in HEADERS) for (const c of CREDS) for (const o in ACAO) for (const am in ACAM) for (const ah in ACAH) for (const cc of ACAC)
  cases.push({ id: cases.length, m, h, c, o, am, ah, cc });
const preflights = new Set();
function policyHeaders(q, res) {
  const c = cases[+q.get("id")];
  if (ACAO[c.o]) res.setHeader("Access-Control-Allow-Origin", ACAO[c.o] === "origin" ? ORIGIN : "*");
  if (c.cc) res.setHeader("Access-Control-Allow-Credentials", "true");
  return c;
}
const api = http.createServer((req, res) => {
  const q = new URL(req.url, "http://x").searchParams, c = policyHeaders(q, res);
  if (req.method === "OPTIONS") {
    preflights.add(c.id);
    if (ACAM[c.am]) res.setHeader("Access-Control-Allow-Methods", ACAM[c.am]);
    if (ACAH[c.ah]) res.setHeader("Access-Control-Allow-Headers", ACAH[c.ah]);
    res.writeHead(204); return res.end();
  }
  res.setHeader("Content-Type", "text/plain"); res.end("ok");
}).listen(9000, "127.0.0.1");
const page = http.createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>cors</title>"); }).listen(8080, "127.0.0.1");
(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const b = await chromium.launch({ env, args: ["--host-resolver-rules=MAP *.example.test 127.0.0.1", "--no-proxy-server"] });
  const p = await b.newPage(); await p.goto(ORIGIN + "/");
  const real = await p.evaluate(async ({ cases, HEADERS }) => {
    const out = [];
    for (const c of cases) {
      try { const r = await fetch("http://api.example.test:9000/r?id=" + c.id, { method: c.m, headers: HEADERS[c.h], credentials: c.c }); await r.text(); out.push(true); }
      catch (e) { out.push(false); }
    }
    return out;
  }, { cases, HEADERS });
  await b.close(); api.close(); page.close();
  let bad = 0;
  for (const c of cases) {
    const m = Wire.cors({ method: c.m, headers: HEADERS[c.h], credentials: c.c }, { acao: ACAO[c.o], acam: ACAM[c.am], acah: ACAH[c.ah], acac: c.cc });
    const ok = m.ok === real[c.id] && m.preflight === preflights.has(c.id);
    if (!ok) { bad++; if (bad <= 15) console.log("MISMATCH", JSON.stringify(c), "model", { ok: m.ok, preflight: m.preflight, error: m.error }, "chrome", { ok: real[c.id], preflight: preflights.has(c.id) }); }
  }
  const okCount = real.filter(Boolean).length;
  console.log(`${cases.length - bad}/${cases.length} cases match real Chromium (preflight sent? and fetch succeeded?). ${okCount} succeeded, ${preflights.size} preflights.`);
  process.exit(bad ? 1 : 0);
})();
