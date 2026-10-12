// The two versions of the Dev Stack Technologies section, written with React.createElement so they
// run without a JSX compiler, instrumented with a log. Every log line records what the screen
// (the DOM under #root) showed at that moment, and a MutationObserver adds a line each time a
// commit changes what the screen shows. Used by verify/compare-with-react.js and data/capture.js.
const COMMON = `
var h = React.createElement, LOG = window.LOG = [], last = "blank";
function screen() { var r = document.getElementById("root"); if (r.querySelector(".grid")) return "grid"; if (r.querySelector(".spinner")) return "spinner"; return r.childElementCount ? "other" : "blank"; }
function log(what) { LOG.push([what, screen()]); }
new MutationObserver(function () { var s = screen(); if (s !== last) { last = s; LOG.push(["commit: the screen now shows the " + s, s]); } })
  .observe(document.getElementById("root"), { childList: true, subtree: true, characterData: true });
function mount(el) { ReactDOMClient.createRoot(document.getElementById("root")).render(window.STRICT ? h(React.StrictMode, null, el) : el); }
`;

// Frame 4 of the page: use(promise) + Suspense, with the promise made once at module level.
const SUSPENSE = COMMON + `
async function loadTechnologies() {
  log("loadTechnologies(): fetch sent");
  var res = await fetch("/Technologies.json");
  log("fetch: the response arrived");
  var data = await res.json();
  log("res.json(): 12 items, the promise is fulfilled");
  return data;
}
var technologiesPromise = loadTechnologies();
function TechGrid() {
  log("TechGrid(): render starts, calls use()");
  var technologies = React.use(technologiesPromise);
  log("TechGrid(): use() returned " + technologies.length + " items");
  return h("div", { className: "grid" }, technologies.length + " technologies loaded");
}
function Technologies() {
  log("Technologies(): render");
  return h("section", null, h("h2", null, "Explore the Technologies"),
    h(React.Suspense, { fallback: h("span", { className: "spinner" }) }, h(TechGrid)),
    h("aside", null, "Your Stack"));
}
mount(h(Technologies));
`;

// Frame 2 of the page: useEffect + useState.
const EFFECT = COMMON + `
function TechnologiesEffect() {
  var a = React.useState([]), technologies = a[0], setTechnologies = a[1];
  var b = React.useState(true), loading = b[0], setLoading = b[1];
  log("TechnologiesEffect(): render, loading = " + loading + ", technologies = " + technologies.length);
  React.useEffect(function () {
    log("effect: runs");
    async function loadTechnologies() {
      log("loadTechnologies(): fetch sent");
      var res = await fetch("/Technologies.json");
      log("fetch: the response arrived");
      var data = await res.json();
      log("res.json(): 12 items");
      setTechnologies(data);
      setLoading(false);
      log("setTechnologies(data) and setLoading(false) called");
    }
    loadTechnologies();
  }, []);
  return h("section", null, h("h2", null, "Explore the Technologies"),
    loading ? h("span", { className: "spinner" }) : h("div", { className: "grid" }, technologies.length + " technologies loaded"),
    h("aside", null, "Your Stack"));
}
mount(h(TechnologiesEffect));
`;

// The bug from Frame 4: the promise is created inside TechGrid, so every render makes a new one.
const UNCACHED = COMMON + `
async function loadTechnologies() { var res = await fetch("/Technologies.json"); return res.json(); }
var renders = 0;
function TechGrid() {
  renders++; if (renders > 40) { log("stopped by the harness after 40 renders"); return h("p", null, "stopped"); }
  log("TechGrid(): render " + renders + ", creates a NEW promise");
  var technologies = React.use(loadTechnologies());
  return h("div", { className: "grid" }, technologies.length + " technologies loaded");
}
mount(h(React.Suspense, { fallback: h("span", { className: "spinner" }) }, h(TechGrid)));
`;

// The blank page from Frame 5: the code asks for /technologies.json but the file is Technologies.json.
const TYPO = SUSPENSE.replace('fetch("/Technologies.json")', 'fetch("/technologies.json")') + `
window.addEventListener("error", function (e) { log("uncaught error: " + String(e.message).slice(0, 80)); });
`;

function program(name, strict) { return "window.STRICT = " + (strict ? "true" : "false") + ";\n" + { suspense: SUSPENSE, effect: EFFECT, uncached: UNCACHED, typo: TYPO }[name]; }

module.exports = { program };
