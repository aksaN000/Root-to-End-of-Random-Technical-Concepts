// Runs every verification in the repo and prints one summary.
//   npm test                     (or: node tools/run-all-checks.js)
//   node tools/run-all-checks.js --quick     fewer random cases, faster
//   node tools/run-all-checks.js --only=v8,lr,loop,packets   run some checks (ids: v8 lr loop packets cors html pages)
// Checks that need something missing (Python + scapy, Playwright's Chromium, Node 22 for the
// exact V8 bytecode) are reported as SKIP with the reason, not as failures.
const { spawnSync } = require("child_process"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), quick = process.argv.includes("--quick");
const node = process.execPath, nodeMajor = +process.versions.node.split(".")[0];
let hasPlaywright = true; try { require.resolve("playwright"); } catch (e) { try { require.resolve("/opt/npm-tools/node_modules/playwright"); } catch (e2) { hasPlaywright = false; } }
function py() { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-c", "import scapy"], { encoding: "utf8" }); if (r.status === 0) return c; } return null; }
const PY = py();
const CHECKS = [
  { id: "v8", name: "V8 bytecode model vs this Node's V8", dir: "v8-pipeline", cmd: [node, "verify/compare-with-node.js", quick ? "100" : "300"], need: nodeMajor === 22 ? null : "needs Node 22 (V8 12.4); bytecode differs between V8 versions. This is Node " + process.versions.node },
  { id: "lr", name: "LR engine vs Dragon Book tables (and Bison if installed)", dir: "lr-parser", cmd: [node, "verify/check-dragon-book.js"] },
  { id: "loop", name: "Event-loop playground vs Node", dir: "js-event-loop", cmd: [node, "verify/compare-loop-with-node.js"] },
  { id: "packets", name: "DNS/TLS byte dissectors vs scapy", dir: "fetch-to-the-wire", cmd: [PY || "python3", "verify/check-dissectors.py"], need: PY ? null : "needs Python 3 with scapy (pip install scapy)" },
  { id: "cors", name: "CORS model vs real Chromium (2,880 cases)", dir: "fetch-to-the-wire", cmd: [node, "verify/cors-matrix.js"], need: hasPlaywright ? null : "needs Playwright (npm install, then npx playwright install chromium)" },
  { id: "html", name: "HTML parser model vs real Chrome", dir: "html-to-pixels", cmd: [node, "verify/compare-with-chrome.js"].concat(quick ? ["300:7"] : ["1000:7", "3000:2026", "3000:99", "2000:4242"]), need: hasPlaywright ? null : "needs Playwright (npm install, then npx playwright install chromium)" },
  { id: "pages", name: "Every page loads cleanly (desktop and phone width)", dir: ".", cmd: [node, "tools/check-pages.js"], need: hasPlaywright ? null : "needs Playwright (npm install, then npx playwright install chromium)" }
];
const onlyArg = process.argv.find(a => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;
const results = [];
for (const c of CHECKS.filter(c => !only || only.includes(c.id))) {
  process.stdout.write("\n=== " + c.name + "\n");
  if (c.need) { console.log("SKIP: " + c.need); results.push(["SKIP", c.name, c.need]); continue; }
  const t = Date.now();
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { cwd: path.join(ROOT, c.dir), encoding: "utf8", maxBuffer: 1 << 26, env: quick ? Object.assign({}, process.env, { RK_NO_REPORT: "1" }) : process.env });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").filter(l => !/CryptographyDeprecationWarning|^\s*from cryptography/.test(l));
  console.log(out.slice(-6).join("\n"));
  results.push([r.status === 0 ? "PASS" : "FAIL", c.name, out[out.length - 1] + " (" + ((Date.now() - t) / 1000).toFixed(0) + " s)"]);
}
// VALIDATION.md is rebuilt from the result files the checks just wrote (quick runs are not written up).
if (!quick && !only) { const g = spawnSync(node, [path.join(ROOT, "tools/make-validation.js")], { encoding: "utf8" }); console.log("\n" + (g.stdout || g.stderr).trim()); }
console.log("\n================ summary");
results.forEach(([s, n, d]) => console.log(s.padEnd(5) + n + "\n      " + d));
const failed = results.filter(r => r[0] === "FAIL").length, skipped = results.filter(r => r[0] === "SKIP").length;
console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
