// Writes ../tailwind-theme.js: the default theme values (colours, spacing, breakpoints, text sizes, …)
// from the installed tailwindcss package's theme.css. The page's Tailwind model reads them;
// verify/compare-tailwind.js fails if they no longer match.
//   node verify/extract-tailwind-theme.js
const fs = require("fs"), path = require("path");
function theme() {
  const dir = path.dirname(require.resolve("tailwindcss/package.json"));
  const css = fs.readFileSync(path.join(dir, "theme.css"), "utf8"), vars = {};
  const re = /^\s*(--[a-z0-9-]+(?:\\\.[0-9]+)?[a-z0-9-]*):\s*([^;]+);/gim; let m;
  while ((m = re.exec(css))) {
    const k = m[1].replace(/\\/g, ""), v = m[2].trim();
    if (/^--(color|spacing|breakpoint|container|text|font-weight|tracking|leading|radius)\b/.test(k)) vars[k] = v;
  }
  return { tailwind: require(path.join(dir, "package.json")).version, vars };
}
module.exports = theme;
if (require.main === module) {
  const t = theme();
  fs.writeFileSync(path.join(__dirname, "..", "tailwind-theme.js"), "/* Tailwind CSS " + t.tailwind + "'s default theme values (theme.css), copied by verify/extract-tailwind-theme.js. MIT License. */\n(function (g) { var T = " + JSON.stringify(t) + ";\n  if (typeof module !== \"undefined\" && module.exports) module.exports = T; else g.TW_THEME = T;\n})(this);\n");
  console.log("wrote tailwind-theme.js for Tailwind " + t.tailwind + ": " + Object.keys(t.vars).length + " values");
}
