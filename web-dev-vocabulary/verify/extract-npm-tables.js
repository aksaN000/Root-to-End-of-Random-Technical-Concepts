// Writes ../npm-tables.js: npm's command names, aliases, option names with their types, and
// shorthands, copied from the npm that ships with this Node. The page's command model reads them;
// verify/compare-commands.js fails if they no longer match the running npm.
//   node verify/extract-npm-tables.js
const fs = require("fs"), path = require("path"), I = require("./npm-internals");
function tables() {
  const T = I.typeDefs, opts = {};
  const code = (t) => t === Boolean ? "B" : t === String ? "S" : t === Number ? "N" : t === Array ? "A" : t === null ? "0" : (typeof t === "string") ? null : "O";
  for (const [k, d] of Object.entries(I.definitions)) {
    const ts = Array.isArray(d.type) ? d.type : [d.type];
    const flags = Array.from(new Set(ts.map(code).filter(Boolean))).sort().join("");
    const lits = ts.filter(t => typeof t === "string");
    opts[k] = lits.length ? [flags, lits] : flags;
  }
  const sh = {}; for (const [k, v] of Object.entries(I.shorthands)) sh[k] = Array.isArray(v) ? v : String(v).split(/\s+/);
  return { npm: I.version, commands: I.cmdList.commands, aliases: I.cmdList.aliases, options: opts, shorthands: sh };
}
module.exports = tables;
if (require.main === module) {
  const t = tables();
  const out = "/* npm " + t.npm + "'s command list, aliases, option types and shorthands, copied by verify/extract-npm-tables.js.\n   Option types: B Boolean, S String, N Number, A Array, 0 null, O another type (path, URL, …); a second entry lists allowed words. */\n" +
    "(function (g) { var T = " + JSON.stringify(t) + ";\n  if (typeof module !== \"undefined\" && module.exports) module.exports = T; else g.NPM_TABLES = T;\n})(this);\n";
  fs.writeFileSync(path.join(__dirname, "..", "npm-tables.js"), out);
  console.log("wrote npm-tables.js for npm " + t.npm + ": " + t.commands.length + " commands, " + Object.keys(t.aliases).length + " aliases, " + Object.keys(t.options).length + " options, " + Object.keys(t.shorthands).length + " shorthands");
}
