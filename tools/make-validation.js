// Writes VALIDATION.md from validation/results/*.json (written by each verify script).
// Run by `npm test` after the checks; can also be run on its own: node tools/make-validation.js
// The numbers in VALIDATION.md are therefore always the latest real run, never typed by hand.
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), RES = path.join(ROOT, "validation", "results");

// What each check means. Kept here, next to the generator, so the claims and the numbers live together.
const CHECKS = [
  { id: "v8-bytecode", title: "V8 bytecode model", page: "v8-pipeline",
    ours: "`v8-pipeline/v8-model.js`: scanner, precedence-climbing parser and Ignition bytecode generator for arithmetic expressions",
    method: "Random expressions over the parameters `a`, `b`, `c` and number literals are compiled by real V8 (`node --print-bytecode`) and by the model.",
    match: "The bytecode listing is identical instruction for instruction: opcodes, register operands, feedback slot numbers, and `.Wide`/`.ExtraWide` prefixes. Tokens and syntax trees are not compared directly.",
    notCovered: "Statements, calls, objects, strings and comparisons; V8 versions other than the one named (bytecode changes between versions, so this check is skipped on other Node versions).",
    command: "cd v8-pipeline && node verify/compare-with-node.js 300 7" },
  { id: "lr-dragon", title: "LR parser engine", page: "lr-parser",
    ours: "`lr-parser/lr-engine.js`: FIRST/FOLLOW, LR(0) item sets, SLR(1) ACTION/GOTO table and the LR driver",
    method: "The expression grammar's table is compared cell by cell with the Dragon Book (2nd ed.) Fig. 4.37 and its parse of `id * id + id` move by move with Fig. 4.38; the conflicts the page teaches are checked; if GNU Bison is installed, its own conflict reports for the same grammars are checked too.",
    match: "Every ACTION and GOTO cell, every move, the FIRST and FOLLOW sets shown, and the presence or absence of conflicts.",
    notCovered: "LALR(1) and canonical LR(1) table construction (the page shows real Bison output for those), error recovery, precedence declarations.",
    command: "cd lr-parser && node verify/check-dragon-book.js" },
  { id: "event-loop", title: "Event-loop playground model", page: "js-event-loop",
    ours: "`js-event-loop/loop-model.js`: an interpreter for a JavaScript subset following the spec's promise jobs and task/microtask order",
    method: "Hand-written programs (timers, `.then` chains, `async`/`await`, returning promises, `new Promise`) run in Node and in the model. In the browser, the playground also runs every program in the reader's own engine.",
    match: "The printed lines and their order are identical.",
    notCovered: "Rejections, `if`/loops, `process.nextTick`, timer clamping, rendering steps and real task priorities; the model reports these as outside its subset.",
    command: "cd js-event-loop && node verify/compare-loop-with-node.js" },
  { id: "packet-dissectors", title: "DNS and TLS byte dissectors", page: "fetch-to-the-wire",
    ours: "`fetch-to-the-wire/wire-model.js`: field-by-field dissectors for the captured DNS query and answer, ClientHello and ServerHello",
    method: "scapy, an independent packet library, parses the same captured bytes; fields are compared (IDs, names, types, TTL, address, cipher suites, SNI, groups, signature algorithms, ALPN, versions, key shares), plus the negotiated group and cipher Chrome logged.",
    match: "Each listed field has the same value in both parsers.",
    notCovered: "Field types that do not appear in these captures and decryption of the encrypted TLS records.",
    command: "cd fetch-to-the-wire && python3 verify/check-dissectors.py" },
  { id: "cors", title: "CORS decision model", page: "fetch-to-the-wire",
    ours: "`fetch-to-the-wire/wire-model.js` `cors()`: the Fetch standard's CORS rules as Chrome applies them",
    method: "Every combination of method (3) × request headers (5) × credentials mode (2) × Allow-Origin (3) × Allow-Methods (4) × Allow-Headers (4) × Allow-Credentials (2) is fetched by real Chromium from a local server, each at its own URL so preflight caching cannot interfere.",
    match: "For every case: whether Chrome sent a preflight, and whether `fetch()` resolved or rejected. Error messages and response headers are not compared.",
    notCovered: "Non-2xx preflight status codes, redirects, the preflight cache, Private Network Access, `Access-Control-Expose-Headers`, and other browsers. Chrome lets `Access-Control-Allow-Headers: *` cover `Authorization` (the stricter spec rule sits behind a disabled feature flag); the model follows Chrome by default and the page shows the difference.",
    command: "cd fetch-to-the-wire && node verify/cors-matrix.js" },
  { id: "html-parser", title: "HTML parser model", page: "html-to-pixels",
    ours: "`html-to-pixels/html-model.js`: the HTML standard's tokenizer and tree builder for the head and body insertion modes",
    method: "Hand-picked tricky snippets plus random tag soup from four seeded batches are parsed by real Chrome's `DOMParser` and by the model; duplicates are removed before counting.",
    match: "The whole document tree is identical in html5lib test format: element names, attributes and their values, text, comments and the DOCTYPE. Parse errors are not compared.",
    notCovered: "Tables, forms, `select`, `template`, framesets, ruby, SVG and MathML (the model refuses these), the full named-entity table, and scripts that run during parsing.",
    command: "cd html-to-pixels && node verify/compare-with-chrome.js 1000:7 3000:2026 3000:99 2000:4242" },
  { id: "event-dispatch", title: "Event dispatch model", page: "click-to-listener",
    ours: "`click-to-listener/dispatch-model.js`: the DOM standard's dispatch as Blink's `EventDispatcher` and `FireEventListeners` run it, including where V8's microtask checkpoint falls",
    method: "The lab's presets and random programs (a tree, listeners with capture/once/passive and actions such as stopPropagation, preventDefault, queueing a microtask, adding or removing listeners mid-dispatch, and one dispatch) run in the model and in real Chromium with real listeners (`click-to-listener/dispatch-real.js`). \"By user\" programs are clicked with Playwright's mouse, which enters Chrome at the browser process; \"by script\" programs call `dispatchEvent` from a script.",
    match: "The full log is identical: which listeners ran, in what order, with which `eventPhase` and `currentTarget`, where each microtask ran, and the final `defaultPrevented`.",
    notCovered: "Shadow DOM and retargeting, `relatedTarget`, default actions, listeners that throw, `handleEvent` objects, `AbortSignal`, and the other events a real click fires (pointerdown, mousedown, …), which the programs do not listen to.",
    command: "cd click-to-listener && node verify/compare-dispatch.js" },
  { id: "hit-test", title: "Hit-test model", page: "click-to-listener",
    ours: "`click-to-listener/hit-model.js`: the CSS painting order for positioned boxes, walked backwards, with stacking contexts, overflow clipping and inherited `pointer-events` and `visibility`",
    method: "The lab's presets and random scenes are drawn exactly as the lab draws them, and the model's answer is compared with `document.elementFromPoint` at 40 whole-pixel points per scene.",
    match: "The same element (by id) at every point, or both say the stage.",
    notCovered: "Transforms, opacity, filters and other stacking-context triggers, in-flow content and text, rounded corners, scrollbars, iframes, and fractional points.",
    command: "cd click-to-listener && node verify/compare-hit-test.js" },
  { id: "pages", title: "Pages in a real browser", page: null,
    ours: "Every page of the site",
    method: "Each page is loaded in real Chromium at 1300 px and 390 px wide. The check fails on script errors, failed requests, sideways scrolling, missing components, quizzes or exam answers that do not respond, stale asset hashes, and accessibility violations found by axe-core in light and dark mode.",
    match: "Zero problems on every page at both widths.",
    notCovered: "Real phones with touch input, screen-reader testing by people, and whether the explanations are clear.",
    command: "node tools/check-pages.js   (add --live for the published site, --browser=firefox or webkit for other engines)" }
];

const results = {};
if (fs.existsSync(RES)) fs.readdirSync(RES).filter(f => f.endsWith(".json")).forEach(f => { const r = JSON.parse(fs.readFileSync(path.join(RES, f), "utf8")); results[r.id] = r; });
const fmt = n => typeof n === "number" ? n.toLocaleString("en-US") : n;
const day = d => d ? d.slice(0, 10) : "never run";
const slug = t => t.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
let md = `# Validation

Every simulator on this site is a **model**: our own simplified code. This file says what each model was checked against, how, on how many cases, and exactly what "matches" means. It is generated from the latest test run by \`tools/make-validation.js\`; the numbers below are copied from \`validation/results/\`, not typed by hand.

To rerun everything: \`npm test\` (setup in [TESTING.md](TESTING.md)). When a check fails, its failing inputs are saved in \`validation/failures/<check>.json\` so they can be replayed.

## Summary

| Check | Compared with | Cases | Result | Last run |
|---|---|---|---|---|
`;
CHECKS.forEach(c => {
  const r = results[c.id];
  md += `| [${c.title}](#${slug(c.title)}) | ${r ? r.reference || "" : ""} | ${r ? fmt(r.cases) : ""} | ${r ? (r.passed ? "✅ " : "❌ ") + fmt(r.matched) + " / " + fmt(r.cases) + " match" : "not run yet"} | ${r ? day(r.date) : ""} |\n`;
});
CHECKS.forEach(c => {
  const r = results[c.id];
  md += `\n## ${c.title}\n\n`;
  md += `- **Our code:** ${c.ours}${c.page ? ` (page: [${c.page}](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/${c.page}/))` : ""}\n`;
  md += `- **Reference:** ${r ? r.reference || "" : "(not run yet)"}\n`;
  md += `- **Method:** ${c.method}\n`;
  md += `- **What "match" means:** ${c.match}\n`;
  md += `- **Not covered:** ${c.notCovered}\n`;
  if (r) {
    md += `- **Latest run:** ${day(r.date)} on ${r.platform}, Node ${r.node}. ${r.passed ? "Passed" : "FAILED"}: ${fmt(r.matched)} of ${fmt(r.cases)}${r.skipped ? ` (${r.skipped} skipped as outside the model)` : ""}.${r.detail ? " " + r.detail + "." : ""}\n`;
    if (r.seeds) md += `- **Random batches:** ${r.seeds.map(s => fmt(s.count) + " with seed " + s.seed).join(", ")}${r.handPicked ? `, plus ${r.handPicked} hand-picked cases` : ""}. The same seeds always generate the same inputs.\n`;
    if (r.failureCount) md += `- **Failing cases saved in:** \`validation/failures/${c.id}.json\`\n`;
    if (r.checks) md += `\n<details><summary>Individual checks</summary>\n\n\`\`\`\n${r.checks.join("\n")}\n\`\`\`\n</details>\n`;
    if (r.pages) md += `\n<details><summary>Per page</summary>\n\n| Page | Width | Problems | Accessibility violations |\n|---|---|---|---|\n${r.pages.map(p => `| ${p.page} | ${p.width} px | ${p.problems} | ${p.a11y === null ? "not checked" : p.a11y} |`).join("\n")}\n</details>\n`;
  }
  md += `- **Command:** \`${c.command}\`\n`;
});
md += `\n## Development history\n\nBefore this report existed, the same checks were run by hand while each page was built: 746 expressions for the V8 model, and 7,183 HTML parser comparisons that included repeated inputs (the 61 hand-picked cases in every batch, and one batch run twice). Duplicates are now removed before counting, so the figures above are distinct inputs.\n`;
fs.writeFileSync(path.join(ROOT, "VALIDATION.md"), md);
console.log("wrote VALIDATION.md from " + Object.keys(results).length + " result file(s)");
