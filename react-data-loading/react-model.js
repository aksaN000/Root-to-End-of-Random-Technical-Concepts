// Our model of the React 19.2.8 behaviour this page teaches. Two parts:
//  1. DepsModel: given a dependency array and a list of clicks, does the component render, and
//     does the effect run? Checked against real React by verify/compare-with-react.js.
//  2. TIMELINES: the steps of the two line-by-line labs. Each step that React can show us has an
//     `obs` line, and the verifier checks that real React logs exactly those lines in this order.
(function (g) {
  "use strict";
  var is = Object.is;
  var LABEL = { none: "no array", empty: "[]", count: "[count]", both: "[count, dark]" };
  function deps(s) { return s.mode === "none" ? null : s.mode === "empty" ? [] : s.mode === "count" ? [s.count] : [s.count, s.dark]; }
  function changed(a, b) { for (var i = 0; i < a.length; i++) if (!is(a[i], b[i])) return true; return false; }

  // `clean` mirrors the check at the top of dispatchSetStateInternal: React may compare the new
  // state before rendering only when neither this fiber nor its alternate has pending work (lanes).
  // After a real update the old fiber (now the alternate) still carries that update's lane, so the
  // first same-value setState renders once and bails out; that render clears the lanes.
  function create(mode) { return { mode: mode, count: 0, dark: false, prev: null, clean: true, renders: 0 }; }
  function mount(s) {
    s.renders = 1; s.prev = deps(s); s.clean = true;
    return { rendered: 1, effect: true, render: 1, why: "First render: an effect always runs after the first commit, whatever its array says." };
  }
  function act(s, a) {
    if (a === "same") {
      if (s.clean) return { rendered: 0, effect: false, render: null, why: "setCount(" + s.count + ") is the same value. Nothing else is pending on this component, so React compares with Object.is before rendering and skips the render completely." };
      s.renders++; s.clean = true;
      return { rendered: 1, effect: false, render: s.renders, bail: true, why: "setCount(" + s.count + ") is the same value, but the last update's lane is still on this component, so React renders once, finds every state unchanged and throws the render away: no commit, so no effect" + (s.mode === "none" ? ", even with no array." : ".") };
    }
    var before = { count: s.count, dark: s.dark };
    if (a === "inc") s.count++; else s.dark = !s.dark;
    s.renders++; s.clean = false;
    var d = deps(s), run, why, what = a === "inc" ? "count went " + before.count + " → " + s.count : "dark went " + before.dark + " → " + s.dark;
    if (d === null) { run = true; why = what + ". No array, so the effect runs after every committed render."; }
    else if (d.length === 0) { run = false; why = what + ". [] has nothing that can change, so the effect is skipped."; }
    else {
      run = changed(d, s.prev);
      why = what + ". React compares " + LABEL[s.mode] + " item by item with Object.is: " + (run ? "something changed, so the effect runs." : "nothing in it changed, so the effect is skipped.");
    }
    s.prev = d;
    return { rendered: 1, effect: run, render: s.renders, why: why };
  }
  function run(mode, actions) { var s = create(mode), out = [mount(s)]; actions.forEach(function (a) { out.push(act(s, a)); }); return out.map(function (x) { return { rendered: x.rendered, effect: x.effect }; }); }
  var DepsModel = { create: create, mount: mount, act: act, run: run, LABEL: LABEL };

  // ---- the line-by-line labs ----
  // l: highlighted line numbers; d: what happens; obs: the line real React logs at this point
  // (null when nothing observable happens, such as defining a function); scr: blank|spinner|grid.
  var SUSPENSE = {
    code: [
      'import { Suspense, use } from "react";',
      'import type { Technology } from "../types";',
      '',
      'async function loadTechnologies(): Promise<Technology[]> {',
      '  const res = await fetch("/Technologies.json");',
      '  const data = await res.json();',
      '  return data;',
      '}',
      '',
      'const technologiesPromise = loadTechnologies();',
      '',
      'function TechGrid() {',
      '  const technologies = use(technologiesPromise);',
      '  return (',
      '    <div className="grid ...">',
      '      <p>{technologies.length} technologies loaded</p>',
      '    </div>',
      '  );',
      '}',
      '',
      'function Technologies() {',
      '  return (',
      '    <section>',
      '      <h2>Explore the Technologies</h2>',
      '      <Suspense fallback={<span className="loading ..." />}>',
      '        <TechGrid />',
      '      </Suspense>',
      '      <aside>Your Stack</aside>',
      '    </section>',
      '  );',
      '}'],
    steps: [
      { l: [1, 2], d: "The page opens. main.tsx imports App, App imports Technologies.tsx, and the browser runs this file once, top to bottom. Lines 1 and 2 bring in the tools.", p: "does not exist yet", n: "nothing", scr: "blank", obs: null },
      { l: [4, 5, 6, 7, 8], d: "Lines 4 to 8 only define the function, like writing down a recipe. Nothing inside it runs yet.", p: "does not exist yet", n: "nothing", scr: "blank", obs: null },
      { l: [10, 5], d: "Line 10 calls loadTechnologies(). Line 5 sends the request, and await pauses the function. Because it paused, the async function immediately hands back a pending promise, which line 10 stores.", p: "pending", n: "GET /Technologies.json sent", scr: "blank", obs: "loadTechnologies(): fetch sent" },
      { l: [21], d: "The rest of the file only defines components. Then main.tsx asks React to draw App, and React calls Technologies() (line 21).", p: "pending", n: "waiting", scr: "blank", obs: "Technologies(): render" },
      { l: [25, 26, 13], d: "Technologies returns JSX with a Suspense around TechGrid, so React calls TechGrid(). Line 13 asks use(): is the promise done? It is not, so React marks it pending, attaches a .then listener, and throws. Lines 14 to 18 do not run.", p: "pending (React's listener attached)", n: "waiting", scr: "blank", obs: "TechGrid(): render starts, calls use()" },
      { l: [25], d: "The throw is caught by the nearest Suspense, which renders its fallback instead. React commits: the heading, the spinner and the aside appear.", p: "pending", n: "waiting", scr: "spinner", obs: "commit: the screen now shows the spinner" },
      { l: [13], d: "A step that is easy to miss: right after committing the fallback, React 19 renders the suspended part once more, to warm up siblings it skipped (\"prerendering\"). use() is still pending, so it throws again, and nothing on screen changes.", p: "pending", n: "waiting", scr: "spinner", obs: "TechGrid(): render starts, calls use()", real: true },
      { l: [5], d: "The response arrives, so line 5 continues: res is the response.", p: "pending", n: "200 OK received", scr: "spinner", obs: "fetch: the response arrived" },
      { l: [6, 7], d: "Line 6 reads the body as JSON and line 7 returns it. The promise is fulfilled with 12 items, React's listener writes status and value onto it, and pings React to try TechGrid again.", p: "fulfilled: 12 items", n: "done", scr: "spinner", obs: "res.json(): 12 items, the promise is fulfilled" },
      { l: [12, 13], d: "React calls TechGrid() again, from the top.", p: "fulfilled: 12 items", n: "done", scr: "spinner", obs: "TechGrid(): render starts, calls use()" },
      { l: [13, 14, 15, 16, 17], d: "This time use() finds status \"fulfilled\" and returns the 12 items straight away, so lines 14 to 18 run and build the grid.", p: "fulfilled: 12 items", n: "done", scr: "spinner", obs: "TechGrid(): use() returned 12 items" },
      { l: [26], d: "React commits: the spinner is replaced by the grid. Finished, with one request. Line 10 never runs again, because the file runs only once.", p: "fulfilled: 12 items", n: "1 request in total", scr: "grid", obs: "commit: the screen now shows the grid" }]
  };
  var EFFECT = {
    code: [
      'import { useEffect, useState } from "react";',
      'import type { Technology } from "../types";',
      '',
      'function TechnologiesEffect() {',
      '  const [technologies, setTechnologies] = useState<Technology[]>([]);',
      '  const [loading, setLoading] = useState(true);',
      '',
      '  useEffect(() => {',
      '    async function loadTechnologies() {',
      '      const res = await fetch("/Technologies.json");',
      '      const data: Technology[] = await res.json();',
      '      setTechnologies(data);',
      '      setLoading(false);',
      '    }',
      '    loadTechnologies();',
      '  }, []);',
      '',
      '  return (',
      '    <section>',
      '      <h2>Explore the Technologies</h2>',
      '      {loading ? (',
      '        <span className="loading ..." />',
      '      ) : (',
      '        <div className="grid ...">',
      '          <p>{technologies.length} technologies loaded</p>',
      '        </div>',
      '      )}',
      '      <aside>Your Stack</aside>',
      '    </section>',
      '  );',
      '}'],
    steps: [
      { l: [1, 2], d: "The page opens and the browser runs this file once. Lines 1 and 2 bring in the tools; lines 4 to 31 only define the component.", st: "(no state yet)", e: "–", n: "nothing", scr: "blank", obs: null },
      { l: [4, 5, 6], d: "React calls TechnologiesEffect() for render 1. The first time only, each useState creates a slot on this component's fiber and fills it with the starting value we gave: [] and true.", st: "technologies = []\nloading = true", e: "–", n: "nothing", scr: "blank", obs: null },
      { l: [8, 16], d: "useEffect is called, but our arrow function is only handed over, not called. React stores it in the fiber's effect list with its array [], to run after the commit. Lines 9 to 15 are skipped for now.", st: "technologies = []\nloading = true", e: "stored for later", n: "nothing", scr: "blank", obs: null },
      { l: [18, 21, 22, 28], d: "The return runs. loading is true, so ? picks the spinner. This is only a description of the screen so far.", st: "technologies = []\nloading = true", e: "stored for later", n: "nothing", scr: "blank", obs: "TechnologiesEffect(): render, loading = true, technologies = 0" },
      { l: [21, 22], d: "React commits the description to the real DOM: the heading, the spinner and the aside appear.", st: "technologies = []\nloading = true", e: "stored for later", n: "nothing", scr: "spinner", obs: "commit: the screen now shows the spinner" },
      { l: [8, 15], d: "After the commit, React takes our function out of the effect list and calls it: create(). Line 15 calls loadTechnologies().", st: "technologies = []\nloading = true", e: "running", n: "nothing", scr: "spinner", obs: "effect: runs" },
      { l: [10], d: "fetch sends the request and await pauses loadTechnologies. The page stays usable and the spinner keeps spinning.", st: "technologies = []\nloading = true", e: "waiting at await", n: "GET /Technologies.json sent", scr: "spinner", obs: "loadTechnologies(): fetch sent" },
      { l: [10], d: "The response arrives, so line 10 continues.", st: "technologies = []\nloading = true", e: "running", n: "200 OK received", scr: "spinner", obs: "fetch: the response arrived" },
      { l: [11], d: "Line 11 parses the body: data holds 12 items.", st: "technologies = []\nloading = true", e: "running", n: "done", scr: "spinner", obs: "res.json(): 12 items" },
      { l: [12, 13], d: "setTechnologies(data) and setLoading(false) put two updates on the slots' queues and schedule one render for both (batching). The screen does not change yet.", st: "queued: technologies = 12 items\nqueued: loading = false", e: "finished", n: "done", scr: "spinner", obs: "setTechnologies(data) and setLoading(false) called" },
      { l: [4, 5, 6, 18, 21, 23, 24, 25], d: "Render 2: React calls the function again from the top. useState ignores [] and true (they were only for the first render) and returns the new values, so : picks the grid.", st: "technologies = 12 items\nloading = false", e: "–", n: "done", scr: "spinner", obs: "TechnologiesEffect(): render, loading = false, technologies = 12" },
      { l: [8, 16], d: "useEffect again: React compares this render's [] with the last one. There is nothing to compare, so they are equal, and the effect is not stored to run again. No second fetch.", st: "technologies = 12 items\nloading = false", e: "skipped ([] unchanged)", n: "done", scr: "spinner", obs: null },
      { l: [24, 25, 26], d: "React commits: the spinner is replaced by the grid. Finished: two renders, one effect run, one request.", st: "technologies = 12 items\nloading = false", e: "–", n: "1 request in total", scr: "grid", obs: "commit: the screen now shows the grid" }]
  };
  // What StrictMode (development build) changes, checked by the verifier.
  var STRICT = { suspense: { requests: 1, technologiesRenders: 2 }, effect: { requests: 2, firstRenders: 2 } };
  function observed(t) { return t.steps.filter(function (s) { return s.obs; }).map(function (s) { return [s.obs, s.scr]; }); }
  var TIMELINES = { suspense: SUSPENSE, effect: EFFECT, observed: observed, STRICT: STRICT };

  var api = { DepsModel: DepsModel, TIMELINES: TIMELINES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else g.ReactDataModel = api;
})(typeof window !== "undefined" ? window : globalThis);
