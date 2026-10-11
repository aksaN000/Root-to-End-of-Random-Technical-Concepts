// Finds the npm that ships with this Node and loads the pieces of it the checks compare against:
// its argument parser (nopt), its option definitions, its command list, npx's argv rewrite and
// npm-package-arg (the package-spec parser). Nothing is installed: we use npm's own copies.
const path = require("path"), fs = require("fs"), vm = require("vm"), { spawnSync } = require("child_process");
function npmDir() {
  const guesses = [path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm"), path.join(path.dirname(process.execPath), "node_modules", "npm")];
  for (const g of guesses) if (fs.existsSync(path.join(g, "package.json"))) return path.resolve(g);
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["prefix", "-g"], { encoding: "utf8", shell: process.platform === "win32" });
  const g = path.join(r.stdout.trim(), process.platform === "win32" ? "" : "lib", "node_modules", "npm");
  if (fs.existsSync(g)) return g;
  throw new Error("could not find npm next to " + process.execPath);
}
const NPM = npmDir();
const req = (p) => require(require.resolve(p, { paths: [NPM] }));
const nopt = req("nopt"), npa = req("npm-package-arg");
const { definitions, shorthands } = require(path.join(NPM, "node_modules/@npmcli/config/lib/definitions"));
const cmdList = require(path.join(NPM, "lib/utils/cmd-list.js"));
const typeDefs = require(path.join(NPM, "node_modules/@npmcli/config/lib/type-defs.js"));
const version = require(path.join(NPM, "package.json")).version;
// npx: run the real bin/npx-cli.js with its last line (`cli(process)`) replaced by a stub that
// hands back the rewritten argv, so we test npm's own code rather than a copy of it.
const npxSrc = fs.readFileSync(path.join(NPM, "bin/npx-cli.js"), "utf8");
function npxArgv(args) {
  const proc = { argv: [process.execPath, path.join(NPM, "bin/npx-cli.js")].concat(args) };
  let got = null;
  const sandboxRequire = (m) => m === "../lib/cli.js" ? (p) => { got = p.argv.slice(2); } : require(require.resolve(m, { paths: [path.join(NPM, "bin")] }));
  sandboxRequire.resolve = (m) => require.resolve(m, { paths: [path.join(NPM, "bin")] });
  const fn = vm.runInThisContext("(function (require, process, console, module, __dirname) {" + npxSrc.replace(/^#!.*\n/, "") + "\n})");
  const quiet = { error() {}, log() {} };
  fn(sandboxRequire, proc, quiet, {}, path.join(NPM, "bin"));
  return got;
}
// What npm does with a command line: nopt's parse step (before its type cleaning), then deref.
function npmParse(args) {
  const types = {}; for (const [k, d] of Object.entries(definitions)) types[k] = d.type;
  const data = {}, remain = [];
  nopt.lib.parse(args.slice(), data, remain, { types, shorthands, typeDefs: Object.assign({}, nopt.typeDefs, typeDefs), unknownHandler: false, abbrevHandler: false });
  const command = remain.length ? cmdList.deref(remain[0]) : undefined;
  return { data, remain, command };
}
module.exports = { NPM, version, nopt, npa, definitions, shorthands, cmdList, typeDefs, npxArgv, npmParse };
