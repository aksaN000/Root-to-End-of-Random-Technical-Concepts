/* DispatchReal: runs a DispatchModel program on a real DOM with real addEventListener, so a browser
 * can be compared with the model. Used by verify/compare-dispatch.js (in Chromium) and by the page's
 * "Check in this browser" button (in the reader's browser).
 *
 *   var r = DispatchReal.setup(prog, win)   builds the tree in win.document.body and adds the listeners
 *   r.point()                                 where to click for a user dispatch: the target's own padding
 *   r.dispatchByScript()                      target.dispatchEvent(new MouseEvent(...)) from script
 *   r.result()                                { log, defaultPrevented, target } once the microtasks have run
 */
(function (root) {
  "use strict";
  var PH = ["none", "capture", "target", "bubble"];
  var CSS = "body{margin:8px;font:12px monospace} body *{display:block;margin:4px;padding:10px;border:1px solid #8a94a3;min-height:8px;box-sizing:content-box} body *::before{content:attr(id);font-size:10px}";

  function setup(prog, win) {
    var doc = win.document, log = [], first = null, count = 0, byName = {};
    doc.body.textContent = "";
    var st = doc.getElementById("dr-style");
    if (!st) { st = doc.createElement("style"); st.id = "dr-style"; doc.head.appendChild(st); }
    st.textContent = CSS;
    (function build(list, parent) {
      list.forEach(function (n) { var el = doc.createElement(n.tag); el.id = n.id; parent.appendChild(el); build(n.children, el); });
    })(prog.tree.roots, doc.body);
    function obj(name) { return name === "window" ? win : name === "document" ? doc : doc.getElementById(name); }
    function who(t) { return t === win ? "window" : t === doc ? "document" : t.id || t.nodeName.toLowerCase(); }
    function add(spec) {
      var name = "L" + (++count), target = obj(spec.target), o = spec.opts;
      var fn = function (e) {
        if (!first) first = e;
        log.push(name + " " + PH[e.eventPhase] + " " + who(e.currentTarget));
        (spec.actions || []).forEach(function (a) {
          if (a.op === "stop") e.stopPropagation();
          else if (a.op === "stopNow") e.stopImmediatePropagation();
          else if (a.op === "prevent") e.preventDefault();
          else if (a.op === "micro") win.Promise.resolve().then(function () { log.push("  micro from " + name); });
          else if (a.op === "add") add({ target: a.target, type: a.type, opts: a.opts });
          else if (a.op === "remove") { var r = byName[a.name]; if (r) r.target.removeEventListener(r.type, r.fn, { capture: r.capture }); }
        });
      };
      target.addEventListener(spec.type, fn, { capture: o.capture, once: o.once, passive: o.passive });
      byName[name] = { target: target, type: spec.type, fn: fn, capture: o.capture };
    }
    prog.listeners.forEach(add);
    var d = prog.dispatch, el = doc.getElementById(d.target), ret = null;
    return {
      point: function () { var r = el.getBoundingClientRect(); return { x: r.left + 3, y: r.top + 3 }; },
      dispatchByScript: function () { ret = el.dispatchEvent(new win.MouseEvent(d.type, { bubbles: d.bubbles, cancelable: d.cancelable })); return ret; },
      result: function () { return { log: log.slice(), defaultPrevented: first ? first.defaultPrevented : false, target: first ? who(first.target) : null }; }
    };
  }
  var api = { setup: setup, CSS: CSS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DispatchReal = api;
})(this);
