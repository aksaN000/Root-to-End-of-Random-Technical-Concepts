// Checks the command model (../command-model.js) against the real thing, piece by piece:
//   1. the tables it copies (commands, aliases, option types, shorthands) still match this npm;
//   2. word splitting matches bash;
//   3. npx's rewrite matches npm's real bin/npx-cli.js;
//   4. option parsing matches nopt's parse step, with npm's real option definitions;
//   5. the command word matches npm's real cmd-list.js deref();
//   6. every package spec matches npm-package-arg: type, name, scope, fetch spec, or the same error.
// Inputs: the lab presets, hand-picked specs, and seeded random command lines.
//   node verify/compare-commands.js [count] [seed]      (defaults: 3000 lines, seed 2026)
const { spawnSync } = require("child_process"), path = require("path");
const I = require("./npm-internals"), M = require("../command-model.js"), extract = require("./extract-npm-tables");
const count = +(process.argv[2] || 3000), seed = +(process.argv[3] || 2026);
let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
const fails = [];
// 1. tables
const live = extract(), ours = M.tables;
for (const k of ["commands", "aliases", "options", "shorthands"]) if (JSON.stringify(live[k]) !== JSON.stringify(ours[k])) fails.push({ part: "tables", what: k, problem: "npm-tables.js differs from npm " + live.npm + "; run node verify/extract-npm-tables.js" });

// hand-picked package specs: the ones the page talks about, and the edges of npm-package-arg
const SPECS = ["react", "react@19", "react@19.3.0", "react@^19.2.8", "react@~19.2.0", "react@latest", "react@next", "react@canary", "react@19.x", "react@>=18 <20", "react@18 || 19", "react@1.2.3 - 2.0.0",
  "react@v19.3.0", "react@=19.3.0", "react@19.3.0-rc.1", "react@19.3.0rc1", "react@19.3.0+build.5", "react@01.2.3", "react@^", "react@x", "react@*", "react@", "react@ latest", "react@foo bar", "react@%",
  "@tailwindcss/vite", "@tailwindcss/vite@4.3.3", "@tailwindcss/vite@latest", "@tailwindcss/vite@latest/daisyui@latest", "@types/react@^19", "@scope", "@scope/", "@/x", "@a/b/c",
  "React", "_private", ".hidden", "node_modules", "fs", "http@1.0.0", "my-react@npm:react@19", "x@npm:y", "x@npm:npm:y", "x@npm:./dir", "x@npm:", "npm:react",
  "github:facebook/react", "facebook/react", "facebook/react#v19.3.0", "git+https://github.com/facebook/react.git", "https://github.com/facebook/react", "git@github.com:facebook/react.git",
  "https://example.com/pkg.tgz", "./local-folder", "../lib.tgz", "file:../x", "~/pkg", "/abs/path", "pkg.tgz", "a b", "x@1.2.3.4", "x@>= 1.2.3", "x@~ 1.2", "x@^ 2", "x@1.2.3 foo", "x@foo 1.2.3", "x@||", "x@1 ||", "x@ ", "x@1.2.3-", "x@-1"];
function realSpec(a) {
  try { const r = I.npa(a, "/tmp"); return { type: r.type, name: r.name, scope: r.scope, fetch: r.registry && r.type !== "alias" ? r.fetchSpec : undefined, sub: r.subSpec ? { type: r.subSpec.type, name: r.subSpec.name } : undefined }; }
  catch (e) { return { error: e.code || e.message.split(":")[0].replace(/ ".*/, "") }; }
}
function modelSpec(a) {
  const r = M.npa(a); if (r.error) return { error: r.error };
  return { type: r.type, name: r.name, scope: r.scope, fetch: r.registry && r.type !== "alias" ? r.fetchSpec : undefined, sub: r.subSpec ? { type: r.subSpec.type, name: r.subSpec.name } : undefined };
}
// real npm's errors without codes become their message; ours carry codes, so compare "is an error" plus code when npm has one
const sameSpec = (x, y) => (x.error || y.error) ? (!!x.error && !!y.error && (!/^E[A-Z]+$/.test(y.error) || x.error === y.error)) : JSON.stringify(x) === JSON.stringify(y);
let specCases = 0, specOk = 0; const specTypes = {};
function checkSpec(a, where) {
  specCases++; const m = modelSpec(a), r = realSpec(a);
  if (sameSpec(m, r)) { specOk++; specTypes[r.error ? "error" : r.type] = (specTypes[r.error ? "error" : r.type] || 0) + 1; }
  else fails.push({ part: "spec", input: a, where, model: m, real: r });
}

// random command lines from the shapes we teach, plus noise
const NAMES = ["react", "react-dom", "vite", "typescript", "tailwindcss", "daisyui", "react-toastify", "@tailwindcss/vite", "@vitejs/plugin-react", "@types/react", "@types/node", "lodash", "left-pad", "Express", "_x", ".x", "a.b", "my-pkg"];
const SPECV = ["", "", "", "latest", "next", "beta", "4", "4.3", "4.3.3", "^4.3.0", "~4.3.0", "4.x", "x", "'*'", "'>=4'", "'>=4 <5'", "'^1 || ^2'", "'1 - 2'", "v1.2.3", "1.2.3-beta.1", "1.2.3+b", "^", "'a b'", "%41", "latest/daisyui@latest", "npm:react@19"];
const CMDS = ["install", "i", "add", "in", "ins", "insta", "isntall", "uninstall", "rm", "remove", "un", "r", "update", "up", "upgrade", "run", "run-script", "rum", "urn", "exec", "x", "create", "init", "innit", "ls", "list", "view", "info", "show", "v", "test", "t", "tst", "start", "ci", "clean-install", "it", "cit", "help", "explain", "why", "pkg", "dist-tags", "installTest", "instal", "inst", "foo", "lss", "INSTALL"];
const FLAGS = ["-D", "--save-dev", "-g", "--global", "-E", "--save-exact", "-O", "-P", "-S", "--save", "--no-save", "-y", "--yes", "-f", "--force", "-d", "-dd", "-q", "-s", "--silent", "-gD", "-Dg", "-DE", "-gy", "--loglevel", "--loglevel=warn", "--registry", "--prefix", "--dry-run", "--no-package-lock", "--save-dev=false", "--save-d", "--glob", "--template", "--template=react-ts", "--foo", "-x", "-p", "--package", "--workspace", "-w", "--include", "--omit", "--yes=false", "--no-yes", "--", "--", "-h", "--help", "-v", "--version", "true", "false"];
const WORDS = ["dev", "build", "dev-stack", "react-ts", "vite", "tsc", "--noEmit", "hello.js", "warn", "http://r.example/", "./sub", "dev", "--", "x"];
function randomLine() {
  const npx = rnd() < 0.25, parts = [npx ? "npx" : "npm"];
  const n = 1 + Math.floor(rnd() * 5);
  if (!npx || rnd() < 0.3) for (let k = 0; k < Math.floor(rnd() * 2); k++) parts.push(pick(FLAGS));
  if (!npx) parts.push(pick(CMDS));
  for (let k = 0; k < n; k++) {
    const r = rnd();
    if (r < 0.45) { const v = pick(SPECV); parts.push(pick(NAMES) + (v ? "@" + v : "")); }
    else if (r < 0.75) parts.push(pick(FLAGS));
    else parts.push(pick(WORDS));
  }
  return parts.join(" ");
}
const presets = M.PRESETS.map(p => p[1]).filter(l => /^np[mx] /.test(l));
const lines = presets.concat(Array.from({ length: count }, randomLine));
const unique = Array.from(new Set(lines));

// bash splits each line (inputs are our own generated text)
function bashWords(line) {
  const r = spawnSync("bash", ["-c", 'eval "set -- $L"; printf "%s\\0" "$@"'], { env: { L: line, PATH: process.env.PATH }, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\0").slice(0, -1);
}
let lineOk = 0, wordsOk = 0, npxOk = 0, npxCases = 0, optOk = 0, cmdOk = 0;
const commandsSeen = {};
for (const line of unique) {
  let mw; try { mw = M.tokenize(line); } catch (e) { mw = null; }
  const bw = bashWords(line);
  if (!bw) { fails.push({ part: "words", input: line, problem: "bash could not split it" }); continue; }
  if (JSON.stringify(mw) !== JSON.stringify(bw)) { fails.push({ part: "words", input: line, model: mw, real: bw }); continue; }
  wordsOk++;
  let argv = bw.slice(1), margv = argv;
  if (bw[0] === "npx") {
    npxCases++;
    const real = I.npxArgv(argv), mine = M.npxRewrite(argv).argv;
    if (JSON.stringify(real) !== JSON.stringify(mine)) { fails.push({ part: "npx", input: line, model: mine, real }); continue; }
    npxOk++; argv = real; margv = mine;
  }
  const real = I.npmParse(argv), mine = M.noptParse(margv);
  if (JSON.stringify(real.data) !== JSON.stringify(mine.data) || JSON.stringify(real.remain) !== JSON.stringify(mine.remain)) { fails.push({ part: "options", input: line, model: { data: mine.data, remain: mine.remain }, real: { data: real.data, remain: real.remain } }); continue; }
  optOk++;
  const mc = M.deref(mine.remain[0]);
  if (mc !== real.command) { fails.push({ part: "command", input: line, model: mc, real: real.command }); continue; }
  cmdOk++; commandsSeen[real.command || "(none)"] = (commandsSeen[real.command || "(none)"] || 0) + 1;
  // specs of the commands that take package specs
  if (["install", "uninstall", "update", "view"].includes(real.command)) real.remain.slice(1).forEach(a => checkSpec(a, line));
  lineOk++;
}
SPECS.forEach(a => checkSpec(a, "hand-picked"));
// the same specs as single words through a whole install line, for words bash accepts
const specDistinct = specCases;
console.log(`tables: ${fails.filter(f => f.part === "tables").length ? "DIFFER" : "match npm " + live.npm} (${ours.commands.length} commands, ${Object.keys(ours.aliases).length} aliases, ${Object.keys(ours.options).length} options, ${Object.keys(ours.shorthands).length} shorthands)`);
console.log(`command lines: ${unique.length} distinct (${presets.length} presets + seeded random, seed ${seed}); words match bash ${wordsOk}, npx rewrite ${npxOk}/${npxCases}, options match nopt ${optOk}, command matches deref ${cmdOk}`);
console.log(`package specs: ${specOk}/${specCases} match npm-package-arg (${Object.entries(specTypes).map(([k, v]) => k + " " + v).join(", ")})`);
fails.slice(0, 12).forEach(f => console.log("FAIL", JSON.stringify(f)));
const total = unique.length + specCases, matched = lineOk + specOk;
require("../../tools/report")("commands", {
  reference: `npm ${I.version} on Node ${process.version}: bash for word splitting, bin/npx-cli.js, nopt's parse with npm's option definitions, lib/utils/cmd-list.js deref(), and npm-package-arg`,
  cases: total, matched, passed: fails.length === 0, seed,
  detail: `${unique.length} distinct command lines (${presets.length} lab presets, the rest seeded random) checked word by word, option by option and command by command; ${specCases} package specs (${SPECS.length} hand-picked, the rest from the lines) checked for type, name, scope and fetch spec, or the same error`,
  failures: fails
});
console.log(fails.length ? fails.length + " mismatch(es)" : `all ${total} cases match npm ${I.version}`);
process.exit(fails.length ? 1 : 0);
