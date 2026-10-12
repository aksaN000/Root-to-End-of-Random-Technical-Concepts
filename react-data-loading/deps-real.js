// Runs one dependency-array program on REAL React in this browser. Shared by the page's
// "Check in this browser" button and by verify/compare-with-react.js, so both test the same thing.
// mode: "none" (no array), "empty" ([]), "count" ([count]), "both" ([count, dark]).
// actions: a list of "inc" (count + 1), "dark" (toggle dark), "same" (setCount(count)), clicked for real.
// Returns one entry per moment (the mount, then each click): how many times the component
// function ran, and whether the effect ran.
(function (g) {
  "use strict";
  // React runs passive effects in a later task, so we wait a little after each step.
  function settle() { return new Promise(function (r) { setTimeout(function () { setTimeout(r, 0); }, 25); }); }
  async function runDepsReal(React, ReactDOMClient, mode, actions) {
    var h = React.createElement, log = [], renders = 0;
    function Counter() {
      var c = React.useState(0), count = c[0], setCount = c[1];
      var d = React.useState(false), dark = d[0], setDark = d[1];
      renders++; var n = renders; log.push({ t: "render", n: n });
      var fn = function () { log.push({ t: "effect", n: n }); };
      if (mode === "none") React.useEffect(fn);
      else if (mode === "empty") React.useEffect(fn, []);
      else if (mode === "count") React.useEffect(fn, [count]);
      else React.useEffect(fn, [count, dark]);
      return h("div", null,
        h("button", { "data-a": "inc", onClick: function () { setCount(count + 1); } }, "count + 1"),
        h("button", { "data-a": "dark", onClick: function () { setDark(!dark); } }, "toggle dark"),
        h("button", { "data-a": "same", onClick: function () { setCount(count); } }, "same value"));
    }
    var el = document.createElement("div"); el.style.position = "absolute"; el.style.left = "-9999px"; el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    var root = ReactDOMClient.createRoot(el);
    function take() { var s = { rendered: 0, effect: false }, e; while ((e = log.shift())) { if (e.t === "render") s.rendered++; else s.effect = true; } return s; }
    root.render(h(Counter)); await settle();
    var steps = [take()];
    for (var i = 0; i < actions.length; i++) { el.querySelector('[data-a="' + actions[i] + '"]').click(); await settle(); steps.push(take()); }
    root.unmount(); el.remove();
    return steps;
  }
  g.runDepsReal = runDepsReal;
})(typeof window !== "undefined" ? window : globalThis);
