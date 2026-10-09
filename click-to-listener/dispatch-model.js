/* DispatchModel: the DOM standard's event dispatch, as Blink's EventDispatcher and EventTarget run it.
 *
 * A small text program describes a tree, some listeners and one dispatch:
 *
 *   <div id=card><div id=row><button id=btn></button></div></div>
 *   listen card click capture: micro
 *   listen btn click: stop
 *   listen window click
 *   dispatch click at btn by user
 *
 * Listener options: capture, once, passive. Actions (comma separated, run in order):
 *   stop            event.stopPropagation()
 *   stopNow         event.stopImmediatePropagation()
 *   prevent         event.preventDefault()
 *   micro           queue a microtask that logs "micro from Ln"
 *   add T TYPE [capture] [once] [passive]   add a new listener (it only logs) on T
 *   remove Ln       removeEventListener for listener Ln
 * Every listener logs "Ln phase target" when it runs. Listeners are numbered L1, L2, … in the order
 * they are declared; listeners added by "add" continue the numbering when they are added.
 *
 * dispatch TYPE at ID by user|script [nobubble] [nocancel]
 *   by user    a real click: Blink calls each listener from C++ with no script on the stack, so
 *              V8's microtask checkpoint runs after every listener (only "click" is allowed)
 *   by script  el.dispatchEvent(new MouseEvent(TYPE, …)) from a script: microtasks wait until the
 *              script that called dispatchEvent returns, so they all run after the dispatch
 *
 * Output: { log: [...lines], defaultPrevented, steps: [...] } where steps explain each decision.
 * Not modelled: shadow DOM and retargeting, relatedTarget, activation behaviour (a link navigating,
 * a checkbox toggling), listeners that throw, handleEvent objects, and event types other browsers
 * treat specially (load, focus). See the page's scope box.
 */
(function (root) {
  "use strict";

  function parseTree(html) {
    // just enough HTML: nested tags with an id attribute, no text
    var re = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, m, stack = [], top = { tag: "#root", id: null, children: [] }, nodes = {};
    stack.push(top);
    var rest = html.replace(re, "").trim();
    if (rest) throw new Error("the tree may only contain tags, no text: " + rest.slice(0, 20));
    while ((m = re.exec(html))) {
      var closing = !!m[1], tag = m[2].toLowerCase(), attrs = m[3];
      if (closing) {
        var cur = stack[stack.length - 1];
        if (cur.tag !== tag) throw new Error("</" + tag + "> does not match <" + cur.tag + ">");
        stack.pop();
      } else {
        var idm = /\bid\s*=\s*"?([A-Za-z][\w-]*)"?/.exec(attrs);
        if (!idm) throw new Error("<" + tag + "> needs an id");
        if (nodes[idm[1]] || idm[1] === "window" || idm[1] === "document") throw new Error("duplicate or reserved id: " + idm[1]);
        var n = { tag: tag, id: idm[1], children: [], parent: stack[stack.length - 1] };
        stack[stack.length - 1].children.push(n); nodes[n.id] = n;
        if (!/\/\s*$/.test(attrs)) stack.push(n);
      }
    }
    if (stack.length !== 1) throw new Error("<" + stack[stack.length - 1].tag + "> is not closed");
    if (!top.children.length) throw new Error("the tree is empty");
    return { roots: top.children, nodes: nodes };
  }

  var OPTS = { capture: 1, once: 1, passive: 1 };
  function parseListenerOpts(words, where) {
    var o = { capture: false, once: false, passive: false };
    words.forEach(function (w) { if (!OPTS[w]) throw new Error(where + ": unknown option '" + w + "'"); o[w] = true; });
    return o;
  }
  function parseActions(text, where) {
    if (!text.trim()) return [];
    return text.split(",").map(function (a) {
      var w = a.trim().split(/\s+/);
      switch (w[0]) {
        case "stop": case "stopNow": case "prevent": case "micro":
          if (w.length !== 1) throw new Error(where + ": '" + w[0] + "' takes nothing after it");
          return { op: w[0] };
        case "add":
          if (w.length < 3) throw new Error(where + ": add needs a target and an event type");
          return { op: "add", target: w[1], type: w[2], opts: parseListenerOpts(w.slice(3), where) };
        case "remove":
          if (w.length !== 2 || !/^L\d+$/.test(w[1])) throw new Error(where + ": remove needs a listener name like L2");
          return { op: "remove", name: w[1] };
        default: throw new Error(where + ": unknown action '" + w[0] + "'");
      }
    });
  }

  function parse(text) {
    var lines = text.split("\n"), htmlLines = [], prog = { listeners: [], dispatch: null };
    var i = 0;
    for (; i < lines.length; i++) { var t = lines[i].trim(); if (/^(listen|dispatch)\b/.test(t)) break; htmlLines.push(t); }
    prog.tree = parseTree(htmlLines.join(""));
    for (; i < lines.length; i++) {
      var line = lines[i].replace(/#.*$/, "").trim(), where = "line " + (i + 1);
      if (!line) continue;
      var m;
      if ((m = /^listen\s+([^\s:]+)\s+([^\s:]+)((?:\s+[a-z]+)*)\s*(?::\s*(.*))?$/.exec(line))) {
        if (prog.dispatch) throw new Error(where + ": listeners must come before dispatch");
        checkTarget(prog.tree, m[1], where);
        var opts = parseListenerOpts(m[3].trim() ? m[3].trim().split(/\s+/) : [], where);
        prog.listeners.push({ target: m[1], type: m[2], opts: opts, actions: parseActions(m[4] || "", where) });
      } else if ((m = /^dispatch\s+(\S+)\s+at\s+(\S+)\s+by\s+(user|script)((?:\s+[a-z]+)*)$/.exec(line))) {
        if (prog.dispatch) throw new Error(where + ": only one dispatch");
        if (!prog.tree.nodes[m[2]]) throw new Error(where + ": no element with id " + m[2]);
        var flags = m[4].trim() ? m[4].trim().split(/\s+/) : [];
        flags.forEach(function (f) { if (f !== "nobubble" && f !== "nocancel") throw new Error(where + ": unknown flag '" + f + "'"); });
        if (m[3] === "user" && (m[1] !== "click" || flags.length)) throw new Error(where + ": a user dispatch is a real click: use 'dispatch click at ID by user'");
        prog.dispatch = { type: m[1], target: m[2], by: m[3], bubbles: flags.indexOf("nobubble") < 0, cancelable: flags.indexOf("nocancel") < 0 };
      } else throw new Error(where + ": expected 'listen …' or 'dispatch …'");
    }
    if (!prog.dispatch) throw new Error("add a line: dispatch click at ID by user");
    prog.listeners.forEach(function (l) { l.actions.forEach(function (a) { if (a.op === "add") checkTarget(prog.tree, a.target, "add"); }); });
    return prog;
  }
  function checkTarget(tree, t, where) { if (t !== "window" && t !== "document" && !tree.nodes[t]) throw new Error(where + ": no element with id " + t); }

  /* ---------- the dispatch itself ---------- */
  function run(text) {
    var prog = typeof text === "string" ? parse(text) : text;
    var tree = prog.tree, d = prog.dispatch;
    var targets = {}; // name -> listener list (EventListenerVector)
    var count = 0, byName = {};
    function addListener(spec) {
      var l = { name: "L" + (++count), target: spec.target, type: spec.type, capture: spec.opts.capture, once: spec.opts.once, passive: spec.opts.passive, actions: spec.actions || [], removed: false };
      var list = targets[spec.target] || (targets[spec.target] = []);
      list.push(l); byName[l.name] = l; return l;
    }
    function removeListener(l) {
      var list = targets[l.target]; var i = list ? list.indexOf(l) : -1;
      if (i >= 0) { list.splice(i, 1); l.removed = true; } // EventListenerMap::Remove marks it removed for running snapshots
    }
    prog.listeners.forEach(addListener);

    // the event path: target, its ancestors, then document and window (EventPath + WindowEventContext)
    var path = [], n = tree.nodes[d.target];
    while (n && n.tag !== "#root") { path.push(n.id); n = n.parent; }
    // the tree is placed inside <body> inside <html> in the real document; those are on the path too
    path.push("body", "html", "document", "window");

    var ev = { type: d.type, bubbles: d.bubbles, cancelable: d.cancelable, stop: false, stopNow: false, canceled: false, phase: 0, current: null };
    var log = [], steps = [], micro = [], depthIsZero = d.by === "user";
    var PH = ["none", "capture", "target", "bubble"];
    steps.push({ kind: "path", text: "Path, built once before any listener runs: " + path.slice().reverse().join(" → ") });

    function checkpoint() { while (micro.length) { var job = micro.shift(); log.push("  micro from " + job); } }

    // EventTarget::FireEventListeners for one target and one pass
    function invoke(tname, phase, pass) {
      var list = targets[tname];
      if (!list || !list.length) return;
      var snapshot = list.slice(); // EventListenerVectorSnapshot: listeners added now will not run in this pass
      for (var i = 0; i < snapshot.length; i++) {
        var l = snapshot[i];
        if (l.removed) { steps.push({ kind: "skip", text: l.name + " on " + tname + " was removed during this dispatch: skipped" }); continue; }
        if (ev.stopNow) { steps.push({ kind: "skip", text: "stopImmediatePropagation(): no more listeners on " + tname }); break; }
        if (l.type !== ev.type) continue;
        if (pass === "capture" && !l.capture) continue; // ShouldFire: capturing pass runs capture listeners only
        if (pass === "bubble" && l.capture) continue;
        if (l.once) removeListener(l); // removed before it runs
        ev.phase = phase; ev.current = tname;
        log.push(l.name + " " + PH[phase] + " " + tname);
        steps.push({ kind: "call", text: l.name + " runs: eventPhase " + PH[phase] + ", currentTarget " + tname + (l.once ? " (once: removed first)" : "") + (l.passive ? " (passive)" : "") });
        l.actions.forEach(function (a) {
          if (a.op === "stop") ev.stop = true;
          else if (a.op === "stopNow") { ev.stop = true; ev.stopNow = true; }
          else if (a.op === "prevent") {
            if (l.passive) steps.push({ kind: "note", text: l.name + " is passive, so preventDefault() is ignored (Chrome logs a console warning)" });
            else if (!ev.cancelable) steps.push({ kind: "note", text: "the event is not cancelable, so preventDefault() does nothing" });
            else ev.canceled = true;
          } else if (a.op === "micro") micro.push(l.name);
          else if (a.op === "add") { var nl = addListener({ target: a.target, type: a.type, opts: a.opts }); steps.push({ kind: "note", text: l.name + " added " + nl.name + " on " + a.target + (a.opts.capture ? " (capture)" : "") }); }
          else if (a.op === "remove") { var r = byName[a.name]; if (r && !r.removed) { removeListener(r); steps.push({ kind: "note", text: l.name + " removed " + a.name }); } }
        });
        // V8RunMicrotasksScope ends here; with no script below us the depth is 0 and the checkpoint runs
        if (depthIsZero && micro.length) { steps.push({ kind: "micro", text: "listener returned to C++ with an empty JavaScript stack: microtask checkpoint" }); checkpoint(); }
      }
    }

    // capturing: window down to the target (EventDispatcher::DispatchEventAtCapturing)
    for (var i = path.length - 1; i >= 0 && !ev.stop; i--) invoke(path[i], i === 0 ? 2 : 1, "capture");
    // bubbling: the target, then up if the event bubbles (DispatchEventAtBubbling)
    if (!ev.stop) for (var j = 0; j < path.length; j++) {
      if (j > 0 && !ev.bubbles) { steps.push({ kind: "note", text: "bubbles is false: no bubbling phase above the target" }); break; }
      invoke(path[j], j === 0 ? 2 : 3, "bubble");
      if (ev.stop) break;
    }
    if (ev.stop) steps.push({ kind: "note", text: "propagation stopped at " + ev.current + ": no further targets" });
    ev.phase = 0; ev.current = null;
    var result = { log: log, defaultPrevented: ev.canceled, steps: steps, path: path };
    // by script, the microtasks run when the calling script finishes, after dispatchEvent returned
    if (!depthIsZero && micro.length) { steps.push({ kind: "micro", text: "dispatchEvent() returned to our script; its microtasks run when that script ends" }); checkpoint(); }
    return result;
  }

  /* Lab presets; verify/compare-dispatch.js also runs every one of them against Chrome. */
  var PRESETS = [
    ["Our captured click", "<div id=card><button id=btn></button></div>\nlisten window click capture\nlisten document click capture\nlisten card click capture\nlisten btn click capture\nlisten btn click\nlisten card click\nlisten document click\nlisten window click\ndispatch click at btn by user"],
    ["Microtasks: a real click", "<div id=card><button id=btn></button></div>\nlisten btn click: micro\nlisten card click: micro\ndispatch click at btn by user"],
    ["Microtasks: btn.click() from script", "<div id=card><button id=btn></button></div>\nlisten btn click: micro\nlisten card click: micro\ndispatch click at btn by script"],
    ["stopPropagation finishes this target", "<div id=card><div id=row><button id=btn></button></div></div>\nlisten card click capture\nlisten btn click: stop\nlisten btn click\nlisten row click\nlisten card click\ndispatch click at btn by user"],
    ["stopImmediatePropagation stops at once", "<div id=card><div id=row><button id=btn></button></div></div>\nlisten card click capture\nlisten btn click: stopNow\nlisten btn click\nlisten row click\nlisten card click\ndispatch click at btn by user"],
    ["Capture runs first at the target", "<div id=card><button id=btn></button></div>\nlisten btn click\nlisten btn click capture\nlisten card click\ndispatch click at btn by user"],
    ["once and passive", "<div id=card><button id=btn></button></div>\nlisten btn click once\nlisten card click passive: prevent\nlisten window click: prevent\ndispatch click at btn by user"],
    ["Adding listeners mid-dispatch", "<div id=card><div id=row><button id=btn></button></div></div>\nlisten card click capture: add btn click, add card click capture, add card click\nlisten btn click: add btn click\ndispatch click at btn by user"],
    ["Removing listeners mid-dispatch", "<div id=card><button id=btn></button></div>\nlisten btn click: remove L2, remove L3\nlisten btn click\nlisten card click\ndispatch click at btn by user"],
    ["An event that does not bubble", "<div id=card><button id=btn></button></div>\nlisten card ping capture\nlisten btn ping\nlisten card ping\nlisten window ping\ndispatch ping at btn by script nobubble"]
  ];

  var api = { parse: parse, run: run, parseTree: parseTree, PRESETS: PRESETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DispatchModel = api;
})(this);
