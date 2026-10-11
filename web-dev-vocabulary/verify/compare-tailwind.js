// Checks the Tailwind model (../tailwind-model.js) against the real Tailwind compiler (the tailwindcss
// package pinned in the repo's package.json): for each class, a fresh compiler builds the CSS, and we
// compare the rule it writes (selector, @media wrappers, every declaration, in order) and the theme
// variables it defines in :root. Classes the compiler rejects must be rejected by the model too.
//   node verify/compare-tailwind.js [count] [seed]      (defaults: 3000 random classes, seed 2026)
const fs = require("fs"), path = require("path");
const M = require("../tailwind-model.js"), extract = require("./extract-tailwind-theme");
const count = +(process.argv[2] || 3000), seed = +(process.argv[3] || 2026);
let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
const fails = [];
const live = extract();
if (JSON.stringify(live.vars) !== JSON.stringify(M.theme.vars)) fails.push({ part: "theme", problem: "tailwind-theme.js differs from Tailwind " + live.tailwind + "; run node verify/extract-tailwind-theme.js" });

const FIXED = [].concat.apply([], M.PRESETS.map(p => p.split(" "))).concat(("block inline-block inline flex inline-flex grid inline-grid hidden contents static fixed absolute relative sticky flex-row flex-col flex-wrap flex-nowrap flex-1 flex-auto flex-none grow shrink-0 " +
  "items-start items-end items-center items-baseline items-stretch justify-start justify-end justify-center justify-between justify-around justify-evenly text-left text-center text-right text-justify " +
  "overflow-hidden overflow-auto overflow-x-auto cursor-pointer cursor-not-allowed underline no-underline line-through uppercase italic w-full w-screen w-auto h-full h-screen min-h-screen max-w-none max-w-full max-w-prose " +
  "max-w-sm max-w-6xl max-w-7xl w-sm z-0 z-10 z-50 z-auto col-span-full col-span-2 grid-cols-12 grid-cols-none opacity-0 opacity-50 opacity-2.5 rounded rounded-none rounded-full rounded-lg rounded-t-lg rounded-bl-xl " +
  "border border-0 border-2 border-x border-y-4 border-t border-b-2 border-gray-200 border-transparent bg-white bg-black bg-transparent bg-current bg-gray-50 bg-red-950 text-white text-current text-inherit text-gray-600 text-pink-600 " +
  "text-xs text-sm text-base text-lg text-2xl text-5xl text-9xl font-thin font-medium font-bold font-black tracking-tight leading-none leading-tight leading-6 leading-relaxed " +
  "p-0 p-px p-0.5 p-1.25 p-13 px-4 py-2.5 pt-2 m-auto mx-auto mt-auto -mt-4 -mt-0 -m-px m-0.75 gap-4 gap-x-2 gap-y-8 top-0 -top-2 top-1/2 inset-0 inset-x-4 left-full h-1/3 w-1/2 w-px size-8 min-w-0 max-h-96 " +
  "hover:text-pink-600 lg:hidden lg:flex md:grid-cols-2 sm:flex xl:px-8 2xl:px-0 max-md:hidden dark:bg-gray-900 focus:underline focus-visible:underline active:opacity-90 disabled:opacity-50 first:mt-0 last:border-0 odd:bg-white even:bg-gray-50 " +
  "hover:lg:flex lg:hover:flex md:lg:flex dark:hover:bg-white first:hover:mt-0 hover:focus:underline " +
  "p-0.3 p-01 p--4 -p-4 text-gray-1000 bg-pinkish foo flex-col-x opacity-101 z-1.5 grid-cols-0 hover: :flex lg:foo bogus:flex").split(" "));
const VARS = ["hover", "focus", "focus-visible", "active", "disabled", "first", "last", "odd", "even", "dark", "sm", "md", "lg", "xl", "2xl", "max-sm", "max-md", "max-lg", "group-hover", "print"];
const COLORS = Object.keys(M.theme.vars).filter(k => k.startsWith("--color-")).map(k => k.slice(8)).concat(["transparent", "current", "inherit", "pinkish"]);
const NUMS = ["0", "px", "0.5", "1", "1.5", "2", "2.5", "3", "4", "5", "6", "8", "10", "12", "16", "20", "24", "32", "64", "96", "0.25", "0.3", "1.1", "07", "1/2", "1/3", "2/3", "3/4", "full", "auto", "screen", "xs", "md", "6xl"];
const FAMS = [() => pick(["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe"]) + "-" + pick(NUMS), () => (rnd() < 0.3 ? "-" : "") + pick(["m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me"]) + "-" + pick(NUMS),
  () => pick(["gap", "gap-x", "gap-y"]) + "-" + pick(NUMS), () => (rnd() < 0.2 ? "-" : "") + pick(["inset", "inset-x", "inset-y", "top", "right", "bottom", "left"]) + "-" + pick(NUMS),
  () => pick(["w", "h", "size", "min-w", "min-h", "max-w", "max-h"]) + "-" + pick(NUMS), () => pick(["text", "bg", "border"]) + "-" + pick(COLORS),
  () => "text-" + pick(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl", "10xl"]), () => "font-" + pick(["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black", "heavy"]),
  () => "leading-" + pick(["none", "tight", "snug", "normal", "relaxed", "loose", "4", "6", "7", "8", "2.5"]), () => "tracking-" + pick(["tighter", "tight", "normal", "wide", "wider", "widest", "huge"]),
  () => "border" + pick(["", "-x", "-y", "-t", "-r", "-b", "-l", "-s", "-e"]) + pick(["", "-0", "-2", "-4", "-8", "-3"]), () => "rounded" + pick(["", "-t", "-r", "-b", "-l", "-tl", "-tr", "-br", "-bl"]) + pick(["", "-none", "-full", "-xs", "-sm", "-md", "-lg", "-xl", "-2xl", "-3xl", "-4xl", "-5xl"]),
  () => "z-" + pick(["0", "10", "20", "50", "100", "auto", "1.5"]), () => "opacity-" + pick(["0", "5", "50", "75", "100", "2.5", "33", "0.3"]), () => "grid-cols-" + pick(["1", "2", "3", "4", "6", "12", "none", "0"]), () => "col-span-" + pick(["1", "2", "6", "full", "0"]),
  () => pick(Object.keys({ block: 1, flex: 1, grid: 1, hidden: 1, "inline-flex": 1, sticky: 1, relative: 1, absolute: 1, "flex-col": 1, "items-center": 1, "justify-between": 1, "text-center": 1, underline: 1, italic: 1, "cursor-pointer": 1, "shrink-0": 1, "flex-1": 1 }))];
function randomClass() { const nv = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2; const v = []; for (let i = 0; i < nv; i++) v.push(pick(VARS)); return v.concat([pick(FAMS)()]).join(":"); }
const classes = Array.from(new Set(FIXED.concat(Array.from({ length: count }, randomClass)))).filter(Boolean);

// split real output into: :root variables, and the rules for the class (without @property / @layer properties)
function realParts(out) {
  out = out.replace(/^\/\*![^\n]*\*\/\n/, "").replace(/^@layer properties;\n/, "");
  const root = {}; out = out.replace(/:root, :host \{\n([^}]*)\}\n/, (m, body) => { body.replace(/\s*(--[^:]+): ([^;]+);/g, (x, k, v) => { root[k] = v; }); return ""; });
  const rules = out.split(/\n?@property |\n?@layer properties \{/)[0].trim();
  return { root, rules };
}
(async () => {
  const { compile } = await import("tailwindcss");
  const dir = path.dirname(require.resolve("tailwindcss/package.json"));
  const files = { theme: fs.readFileSync(path.join(dir, "theme.css"), "utf8"), utilities: fs.readFileSync(path.join(dir, "utilities.css"), "utf8") };
  const opts = { base: dir, loadStylesheet: async (id, base) => ({ path: id, base, content: files[id.replace("tailwindcss/", "")] }) };
  let ok = 0, valid = 0, rejected = 0;
  for (const cls of classes) {
    const c = await compile('@import "tailwindcss/theme"; @import "tailwindcss/utilities";', opts);
    const r = realParts(c.build([cls])), m = M.css(cls);
    if (!r.rules) { if (!m.ok) { ok++; rejected++; } else fails.push({ cls, model: m.text, real: "(Tailwind writes nothing: not a class)" }); continue; }
    if (!m.ok) { fails.push({ cls, model: "(rejected: " + m.reason + ")", real: r.rules }); continue; }
    if (m.text !== r.rules) { fails.push({ cls, model: m.text, real: r.rules }); continue; }
    if (JSON.stringify(Object.keys(m.theme).sort()) !== JSON.stringify(Object.keys(r.root).sort()) || Object.keys(r.root).some(k => r.root[k] !== m.theme[k])) { fails.push({ cls, model: m.theme, real: r.root, part: "theme variables" }); continue; }
    ok++; valid++;
  }
  console.log(`theme: ${fails.some(f => f.part === "theme") ? "DIFFERS" : "matches Tailwind " + live.tailwind} (${Object.keys(live.vars).length} values)`);
  console.log(`classes: ${ok}/${classes.length} match (${valid} produce CSS, ${rejected} rejected by both); seed ${seed}`);
  fails.slice(0, 10).forEach(f => console.log("FAIL", JSON.stringify(f)));
  require("../../tools/report")("tailwind", {
    reference: `Tailwind CSS ${live.tailwind} (the tailwindcss package's compile() and build(), a fresh compiler per class)`,
    cases: classes.length, matched: ok, passed: fails.length === 0, seed,
    detail: `${classes.length} distinct classes (${FIXED.length} hand-picked, the rest seeded random, with up to two variants): the same selector, @media wrappers and declarations in the same order, the same :root theme variables, or rejected by both`,
    failures: fails
  });
  console.log(fails.length ? fails.length + " mismatch(es)" : `all ${classes.length} classes match Tailwind ${live.tailwind}`);
  process.exit(fails.length ? 1 : 0);
})();
