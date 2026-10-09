// Parses hand-picked and random HTML with this page's model and with real Chrome (DOMParser),
// and compares the two trees in html5lib format. Usage: node verify/compare-with-chrome.js [random-count] [seed]
const path = require("path");
const H = require(path.join(__dirname, "..", "html-model.js"));
let chromium; try { chromium = require("playwright").chromium; } catch (e) { chromium = require("/opt/npm-tools/node_modules/playwright").chromium; }
const FIXED = [
  "<p>One<p>Two", "<b>1<i>2</b>3</i>", "<ul><li>a<li>b</ul>", "<p><div>x</div>", "<b><p>x</b>y</p>",
  "Hello &amp; &lt;b&gt; &copy &#x41; &ampx", "<!doctype html><title>T &amp; x</title><p class=a class=b>hi",
  "<a href=1>x<a href=2>y", "<b><b><b><b>x</b></b></b></b>", "<p><b>one<p>two", "<b class=x><b class=x><b class=x><b class=x>4</b>",
  "<!-- before --><html><!-- in html --><head></head><body>x</body></html><!-- after -->",
  "text before html", "<html lang=en><body class=a><html data-x=1><body class=b id=c>",
  "<h1>a<h2>b</h1>c", "<div><p>a</div>b", "</p>", "</b>orphan", "<br></br>x", "<p>a</br>b",
  "<pre>\nfirst line</pre>", "<pre>\n\nsecond</pre>", "<style>p { color: red } </p></style><p>x",
  "<script>if (a < b) document.write('</p>')</script>", "<title>&lt;tag&gt; &amp</title>",
  "<textarea>\n<b>not bold</b></textarea>", "<meta charset=utf-8><link rel=x><p>body", "</head><meta x=1>",
  "<head></head><style>s</style><p>x", "<p><button><button>x", "<dl><dt>a<dd>b<dt>c</dl>", "<li>a<li>b",
  "<div><li>a<div><li>b</div></div>", "<a><p>x</a>y", "<b><i><p>x</b>y", "<nobr>a<nobr>b", "<em><strong>x</em>y</strong>z",
  "a<!-- c -->b", "<p id='q\"' title=\"x'y\" data-a=b&c data-b='&amp;'>v", "<img src=a.png alt=x><input value=1>",
  "<hr><p>a<hr>b", "<ol><li>x<ul><li>y</ol>z", "<span><div>block in inline</div></span>", "<a href=x><div>y</div></a>",
  "<p>a<h3>b</h3>", "<u>a<s>b</u>c</s>d", "<b>x</p>y", "<div></span>x</div>", "<body><p>a</body><p>b",
  "</html><p>after html", "<p>a</html>b", "<!DOCTYPE html><html><head><title>t</title></head><body><h1>Hi</h1></body></html>",
  "<?xml version=1.0?><p>x", "<!bogus><p>y", "</ >x", "</3>x", "a < b && c > d", "<p\nclass=x\n>y</p\n>",
  "<b><i><u><p>x</b>y", "<a>1<b>2<a>3</b>4", "<i><a><p>x</i>y",
];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function random(n, seed) {
  const R = rng(seed), TAGS = ["p", "div", "b", "i", "a", "li", "ul", "span", "em", "h1", "h2", "br", "img", "u", "pre", "dd", "dt", "button", "strong", "nobr", "section", "hr", "s"];
  const out = [];
  for (let k = 0; k < n; k++) {
    let s = "", parts = 2 + Math.floor(R() * 10);
    for (let j = 0; j < parts; j++) {
      const r = R(), t = TAGS[Math.floor(R() * TAGS.length)];
      if (r < 0.45) s += "<" + t + (R() < 0.2 ? " class=c" + Math.floor(R() * 3) : "") + ">";
      else if (r < 0.75) s += "</" + t + ">";
      else s += ["x", "y", " ", "z\n", "&amp;"][Math.floor(R() * 5)];
    }
    out.push(s);
  }
  return out;
}
(async () => {
  const N = +(process.argv[2] || 1000), SEED = +(process.argv[3] || 7);
  const cases = FIXED.concat(random(N, SEED));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const b = await chromium.launch({ env });
  const p = await b.newPage();
  const ser = H.serializeDOM.toString();
  const real = await p.evaluate(({ cases, ser }) => { const f = eval("(" + ser + ")"); return cases.map(c => f(new DOMParser().parseFromString(c, "text/html"))); }, { cases, ser });
  const version = b.version(); await b.close();
  let ok = 0, skipped = 0, bad = [];
  cases.forEach((c, i) => {
    const r = H.build(c);
    if (r.error) { skipped++; return; }
    const m = H.serialize(r.doc);
    if (m === real[i]) ok++; else bad.push([c, m, real[i]]);
  });
  bad.slice(0, 6).forEach(([c, m, rl]) => console.log("MISMATCH " + JSON.stringify(c) + "\n--- model\n" + m + "\n--- chrome\n" + rl + "\n"));
  console.log(`${ok}/${cases.length - skipped} trees identical to Chrome ${version} (${FIXED.length} hand-picked + ${N} random, seed ${SEED}; ${skipped} outside the model's subset skipped)`);
  process.exit(bad.length ? 1 : 0);
})();
