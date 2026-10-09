// A small model of the JavaScript event loop for a subset of JavaScript.
// It follows the ECMAScript promise jobs (PerformPromiseThen, NewPromiseResolveThenableJob,
// Await with the 2019 optimization) and the HTML loop order: one task, then drain all microtasks.
// Every run is checked against the real engine in the page (see index.html), and the
// test suite in verify/compare-loop-with-node.js checks it against Node.
var LoopModel = (function () {
  "use strict";
  function ModelError(msg, line) { var e = new Error((line ? "Line " + line + ": " : "") + msg); e.model = true; return e; }
  var STOP = { stop: true };

  // ---------- lexer ----------
  function lex(src) {
    var toks = [], i = 0, line = 1, n = src.length, m;
    while (i < n) {
      var c = src[i];
      if (c === "\n") { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") {
        var j = src.indexOf("*/", i + 2); if (j < 0) j = n;
        for (var k = i; k < j; k++) if (src[k] === "\n") line++;
        i = j + 2; continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        var q = i + 1, s = "", sl = line;
        while (q < n && src[q] !== c) {
          if (src[q] === "\\") { var nx = src[q + 1]; s += nx === "n" ? "\n" : nx === "t" ? "\t" : nx; q += 2; continue; }
          if (src[q] === "\n") { if (c !== "`") throw ModelError("a string cannot span lines", line); line++; }
          if (c === "`" && src[q] === "$" && src[q + 1] === "{") throw ModelError("template ${…} is not supported here; join strings with + instead", line);
          s += src[q]; q++;
        }
        if (q >= n) throw ModelError("this string is never closed", sl);
        toks.push({ t: "str", v: s, line: sl }); i = q + 1; continue;
      }
      if (/\d/.test(c)) { m = /^\d+(\.\d+)?/.exec(src.slice(i)); toks.push({ t: "num", v: +m[0], line: line }); i += m[0].length; continue; }
      if (/[A-Za-z_$]/.test(c)) { m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)); toks.push({ t: "id", v: m[0], line: line }); i += m[0].length; continue; }
      if (src.substr(i, 2) === "=>") { toks.push({ t: "p", v: "=>", line: line }); i += 2; continue; }
      if ("(){},;.=+".indexOf(c) >= 0) { toks.push({ t: "p", v: c, line: line }); i++; continue; }
      throw ModelError("the playground does not understand '" + c + "'", line);
    }
    toks.push({ t: "eof", v: "", line: line });
    return toks;
  }

  // ---------- parser ----------
  function parse(src) {
    var T = lex(src), p = 0;
    function pk(o) { return T[Math.min(p + (o || 0), T.length - 1)]; }
    function is(v, o) { var t = pk(o); return t.t !== "str" && t.t !== "num" && t.v === v; }
    function eat(v) { if (!is(v)) throw ModelError("expected '" + v + "' but found '" + (pk().v || "end of code") + "'", pk().line); return T[p++]; }
    function ident() { var t = pk(); if (t.t !== "id") throw ModelError("expected a name but found '" + (t.v || "end of code") + "'", t.line); p++; return t.v; }
    function semi() { if (is(";")) p++; }
    function block() {
      eat("{"); var b = [];
      while (!is("}")) { if (pk().t === "eof") throw ModelError("a { is never closed", pk().line); b.push(stmt()); }
      eat("}"); return b;
    }
    function params() { eat("("); var ps = []; while (!is(")")) { ps.push(ident()); if (is(",")) p++; else break; } eat(")"); return ps; }
    function stmt() {
      var t = pk(), line = t.line;
      if (is("async") && is("function", 1)) { p++; return fdecl(true, line); }
      if (is("function")) return fdecl(false, line);
      if (is("const") || is("let") || is("var")) { p++; var name = ident(); eat("="); var e = expr(); semi(); return { k: "var", name: name, e: e, line: line }; }
      if (is("return")) { p++; var r = null; if (!is(";") && !is("}") && pk().line === line) r = expr(); semi(); return { k: "ret", e: r, line: line }; }
      if (is(";")) { p++; return { k: "empty", line: line }; }
      if (is("if") || is("for") || is("while") || is("try") || is("class")) throw ModelError("'" + t.v + "' is outside this playground's subset", line);
      var x = expr(); semi(); return { k: "expr", e: x, line: line };
    }
    function fdecl(async, line) { eat("function"); var name = ident(); var ps = params(); return { k: "fdecl", name: name, fn: { async: async, params: ps, body: block(), name: name, line: line } }; }
    function arrowAhead() {
      if (pk().t === "id" && is("=>", 1)) return true;
      if (!is("(")) return false;
      var d = 0, q = p;
      for (; q < T.length; q++) { if (T[q].t === "p" && T[q].v === "(") d++; else if (T[q].t === "p" && T[q].v === ")") { d--; if (d === 0) break; } }
      return !!T[q + 1] && T[q + 1].t === "p" && T[q + 1].v === "=>";
    }
    function arrow(async, line) {
      var ps = pk().t === "id" ? [ident()] : params();
      eat("=>");
      if (is("{")) return { k: "fn", fn: { async: async, params: ps, body: block(), line: line, arrow: true }, line: line };
      var e = assign();
      return { k: "fn", fn: { async: async, params: ps, body: [{ k: "ret", e: e, line: line }], line: line, arrow: true, concise: true }, line: line };
    }
    function expr() { return assign(); }
    function assign() {
      if (pk().t === "id" && is("=", 1)) { var line = pk().line, name = ident(); p++; return { k: "assign", name: name, e: assign(), line: line }; }
      return add();
    }
    function add() { var l = unary(); while (is("+")) { var line = pk().line; p++; l = { k: "add", l: l, r: unary(), line: line }; } return l; }
    function unary() { if (is("await")) { var line = pk().line; p++; return { k: "await", e: unary(), line: line }; } return postfix(primary()); }
    function primary() {
      var t = pk(), line = t.line, nm;
      if (t.t === "str" || t.t === "num") { p++; return { k: "lit", v: t.v, line: line }; }
      if (is("async") && (is("(", 1) || (pk(1).t === "id" && is("=>", 2)))) { p++; return arrow(true, line); }
      if (is("async") && is("function", 1)) { p += 2; nm = pk().t === "id" ? ident() : null; return { k: "fn", fn: { async: true, params: params(), body: block(), line: line, name: nm }, line: line }; }
      if (is("function")) { p++; nm = pk().t === "id" ? ident() : null; return { k: "fn", fn: { async: false, params: params(), body: block(), line: line, name: nm }, line: line }; }
      if (arrowAhead()) return arrow(false, line);
      if (is("new")) { p++; var c = ident(); return { k: "new", c: c, args: argsList(), line: line }; }
      if (is("(")) { p++; var e = expr(); eat(")"); return e; }
      if (t.t === "id") { p++; return { k: "id", name: t.v, line: line }; }
      throw ModelError("unexpected '" + (t.v || "end of code") + "'", line);
    }
    function argsList() { eat("("); var a = []; while (!is(")")) { a.push(assign()); if (is(",")) p++; else break; } eat(")"); return a; }
    function postfix(e) {
      for (;;) {
        if (is(".")) { var line = pk().line; p++; e = { k: "get", o: e, name: ident(), line: line }; }
        else if (is("(")) { e = { k: "call", f: e, args: argsList(), line: pk(-0).line }; }
        else return e;
      }
    }
    var body = [];
    while (pk().t !== "eof") body.push(stmt());
    return body;
  }

  // ---------- formatting shared with the real-engine check ----------
  function fmt(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v && v.kind === "promise") return "Promise";
    if (v && (v.kind === "closure" || v.kind === "builtin")) return "[Function]";
    return "[object]";
  }

  // ---------- interpreter + event loop ----------
  function run(src, opts) {
    opts = opts || {};
    var MAX = opts.maxSteps || 1200;
    var ast;
    try { ast = parse(src); } catch (e) { if (e && e.model) return { steps: [], out: [], error: e.message, truncated: false, maxDelay: 0 }; throw e; }
    var steps = [], out = [], micro = [], timers = [], promises = [], stack = [];
    var clock = 0, seq = 0, pid = 0, tid = 0, phase = 0, running = "", cur = 1, truncated = false, error = null;

    function pdesc(p) {
      return { id: p.id, state: p.state, value: p.state === "fulfilled" && p.value !== undefined ? fmt(p.value) : "", origin: p.origin, waiting: p.reactions.length };
    }
    function cmpT(a, b) { return a.due - b.due || a.seq - b.seq; }
    function snap(line, text, kind) {
      if (line) cur = line;
      if (steps.length >= MAX) { truncated = true; throw STOP; }
      steps.push({
        line: cur, text: text, kind: kind || "", phase: phase, running: running, clock: clock,
        stack: stack.slice(), micro: micro.map(function (j) { return j.label; }),
        tasks: timers.slice().sort(cmpT).map(function (t) { return t.label + " · due " + t.due + " ms"; }),
        promises: promises.map(pdesc), out: out.slice()
      });
    }

    function Env(parent) { this.v = Object.create(null); this.parent = parent; }
    function closure(fn, env) { return { kind: "closure", fn: fn, env: env }; }
    function label(f) {
      if (f.kind === "builtin") return f.name;
      var n = f.fn.name ? f.fn.name + "()" : (f.fn.arrow ? "arrow fn" : "function") + " @ line " + f.fn.line;
      return (f.fn.async ? "async " : "") + n;
    }
    function isP(v) { return !!v && v.kind === "promise"; }
    function callable(v) { return !!v && (v.kind === "closure" || v.kind === "builtin"); }

    // promises
    function newPromise(origin) { var p = { kind: "promise", id: "P" + (++pid), state: "pending", value: undefined, reactions: [], origin: origin, resolved: false }; promises.push(p); return p; }
    function enqueue(job, why) { micro.push(job); snap(job.line, why || ("Queue a microtask: " + job.label + "."), "enqueue"); }
    function fulfill(p, v) {
      p.state = "fulfilled"; p.value = v;
      var rs = p.reactions; p.reactions = [];
      snap(null, p.id + " is now fulfilled" + (v === undefined ? "" : " with " + JSON.stringify(fmt(v))) + (rs.length ? ". Each of its " + rs.length + " stored reaction" + (rs.length > 1 ? "s" : "") + " becomes a microtask." : ". No reactions were waiting on it."), "fulfill");
      rs.forEach(function (r) { enqueue(jobFor(r, v)); });
    }
    function jobFor(r, v) { return { label: r.label, line: r.line, run: function () { r.run(v); } }; }
    function addReaction(p, r, verb) {
      if (p.state === "pending") { p.reactions.push(r); snap(r.line, p.id + " is still pending, so " + verb + " is only stored on it as a reaction. Nothing is queued yet.", "store"); }
      else enqueue(jobFor(r, p.value), p.id + " is already fulfilled, so " + verb + " goes straight onto the microtask queue.");
    }
    function resolvePromise(p, x) {
      if (p.resolved) return; p.resolved = true;
      if (isP(x)) {
        if (x === p) throw ModelError("a promise cannot resolve to itself", cur);
        enqueue({
          label: "ResolveThenableJob: " + p.id + " follows " + x.id, line: cur,
          run: function () { addReaction(x, { label: p.id + " takes " + x.id + "'s value", line: cur, run: function (v) { fulfill(p, v); } }, "the reaction that will settle " + p.id); }
        }, p.id + " was resolved with another promise (" + x.id + "). The spec does not adopt it directly: it queues a ResolveThenableJob, which costs extra ticks.");
      } else fulfill(p, x);
    }
    function promiseResolve(v, origin) {
      if (isP(v)) return v;
      var p = newPromise(origin); p.resolved = true; p.state = "fulfilled"; p.value = v;
      snap(null, "Create " + p.id + ", already fulfilled" + (v === undefined ? "" : " with " + JSON.stringify(fmt(v))) + ".", "create");
      return p;
    }
    function then(p, onF, line, kind) {
      var q = newPromise("." + kind + "() @ line " + line);
      var useF = kind === "then" && callable(onF);
      var r = {
        label: useF ? kind + " callback: " + label(onF) : kind + " pass-through @ line " + line, line: useF && onF.fn ? onF.fn.line : line,
        run: function (v) { resolvePromise(q, useF ? callFn(onF, [v], r.line) : v); }
      };
      snap(line, "." + kind + "() on " + p.id + " creates " + q.id + ", the promise it returns.", "then");
      addReaction(p, r, "the callback");
      return q;
    }

    // functions
    function callFn(f, args, line) {
      if (!callable(f)) throw ModelError(fmt(f) + " is not a function", line);
      if (f.kind === "builtin") return f.call(args, line);
      var env = new Env(f.env);
      if (f.fn.name) env.v[f.fn.name] = f; // a named function can refer to itself
      f.fn.params.forEach(function (n, i) { env.v[n] = args[i]; });
      hoist(f.fn.body, env);
      var lb = label(f);
      stack.push(lb);
      snap(f.fn.line, "Call " + lb + ": push a frame on the call stack.", "call");
      var g = execBlock(f.fn.body, env);
      if (!f.fn.async) {
        var r = g.next();
        if (!r.done) throw ModelError("await only works inside an async function", r.value.line);
        stack.pop();
        return r.value ? r.value.value : undefined;
      }
      var P = newPromise("result of " + lb);
      stepAsync(g, P, lb, undefined);
      return P;
    }
    function stepAsync(g, P, lb, sent) {
      var r = g.next(sent);
      stack.pop();
      if (r.done) {
        var v = r.value ? r.value.value : undefined;
        snap(null, lb + " finishes and resolves " + P.id + ", the promise it returned.", "return");
        resolvePromise(P, v);
        return;
      }
      var line = r.value.line;
      var q = promiseResolve(r.value.v, "await @ line " + line);
      snap(line, lb + " reaches await on " + q.id + ". It pops off the stack; the rest of the function is saved for later.", "await");
      var rr = { label: "resume " + lb + " after await @ line " + line, line: line, run: function (v) { stack.push(lb); snap(line, "Resume " + lb + " just after the await.", "resume"); stepAsync(g, P, lb, v); } };
      addReaction(q, rr, "resuming " + lb);
    }
    function hoist(stmts, env) { stmts.forEach(function (s) { if (s.k === "fdecl") env.v[s.name] = closure(s.fn, env); }); }

    // globals
    var G = new Env(null);
    function builtin(name, fn) { return { kind: "builtin", name: name, call: fn }; }
    G.v.console = { kind: "obj", props: { log: builtin("console.log", function (a, line) { var s = a.map(fmt).join(" "); out.push(s); snap(line, "console.log prints " + JSON.stringify(s) + ".", "log"); }) } };
    G.v.setTimeout = builtin("setTimeout", function (a, line) {
      var f = a[0], ms = Math.max(0, +a[1] || 0);
      if (!callable(f)) throw ModelError("setTimeout needs a function", line);
      var t = { id: ++tid, fn: f, args: a.slice(2), due: clock + ms, seq: ++seq, line: f.fn ? f.fn.line : line, label: "timer #" + (tid) + " → " + label(f) };
      timers.push(t);
      snap(line, "setTimeout hands timer #" + t.id + " to the browser. Its callback becomes a task once " + ms + " ms have passed. Nothing is queued on the JS side yet.", "timer");
      return t.id;
    });
    G.v.queueMicrotask = builtin("queueMicrotask", function (a, line) {
      var f = a[0]; if (!callable(f)) throw ModelError("queueMicrotask needs a function", line);
      enqueue({ label: "queueMicrotask callback: " + label(f), line: f.fn ? f.fn.line : line, run: function () { callFn(f, [], line); } });
    });
    G.v.Promise = { kind: "obj", props: {
      resolve: builtin("Promise.resolve", function (a, line) { cur = line; return promiseResolve(a[0], "Promise.resolve() @ line " + line); }),
      reject: builtin("Promise.reject", function (a, line) { throw ModelError("rejections are not modeled in this playground", line); })
    } };
    G.v.undefined = undefined; G.v.null = null; G.v.true = true; G.v.false = false;

    function lookup(env, name, line) {
      for (var e = env; e; e = e.parent) if (name in e.v) return e.v[name];
      throw ModelError("'" + name + "' is not defined (the playground knows console.log, setTimeout, queueMicrotask, Promise and our own functions)", line);
    }
    function setVar(env, name, val, line) {
      for (var e = env; e; e = e.parent) if (name in e.v) { e.v[name] = val; return val; }
      throw ModelError("'" + name + "' is not declared", line);
    }
    function member(o, name, line) {
      if (o && o.kind === "obj") { if (name in o.props) return o.props[name]; throw ModelError("'" + name + "' is not available here", line); }
      if (isP(o)) {
        if (name === "then") return builtin(o.id + ".then", function (a, l) { return then(o, a[0], l, "then"); });
        if (name === "catch") return builtin(o.id + ".catch", function (a, l) { return then(o, a[0], l, "catch"); });
        throw ModelError("promise." + name + " is not modeled; use .then", line);
      }
      throw ModelError("cannot read ." + name + " of " + fmt(o), line);
    }

    function* execBlock(stmts, env) {
      for (var i = 0; i < stmts.length; i++) {
        var r = yield* execStmt(stmts[i], env);
        if (r) return r;
      }
    }
    function* execStmt(s, env) {
      cur = s.line;
      switch (s.k) {
        case "fdecl": case "empty": return;
        case "var": env.v[s.name] = yield* ev(s.e, env); return;
        case "ret": return { value: s.e ? yield* ev(s.e, env) : undefined };
        case "expr": yield* ev(s.e, env); return;
      }
    }
    function* ev(e, env) {
      switch (e.k) {
        case "lit": return e.v;
        case "id": return lookup(env, e.name, e.line);
        case "fn": return closure(e.fn, env);
        case "add": { var l = yield* ev(e.l, env), r = yield* ev(e.r, env); return (typeof l === "number" && typeof r === "number") ? l + r : fmt(l) + fmt(r); }
        case "assign": return setVar(env, e.name, yield* ev(e.e, env), e.line);
        case "await": { var v = yield* ev(e.e, env); return yield { v: v, line: e.line }; }
        case "get": return member(yield* ev(e.o, env), e.name, e.line);
        case "call": {
          var f = yield* ev(e.f, env), args = [];
          for (var i = 0; i < e.args.length; i++) args.push(yield* ev(e.args[i], env));
          cur = e.line;
          return callFn(f, args, e.line);
        }
        case "new": {
          if (e.c !== "Promise") throw ModelError("only new Promise(...) is modeled", e.line);
          var ex = yield* ev(e.args[0] || { k: "lit", v: undefined }, env);
          if (!callable(ex)) throw ModelError("new Promise needs an executor function", e.line);
          var P = newPromise("new Promise @ line " + e.line);
          snap(e.line, "new Promise creates " + P.id + " (pending) and runs the executor right now, synchronously.", "create");
          var res = builtin("resolve(" + P.id + ")", function (a, l) { cur = l || cur; snap(l, "resolve() is called for " + P.id + ".", "resolve"); resolvePromise(P, a[0]); });
          var rej = builtin("reject", function (a, l) { throw ModelError("rejections are not modeled in this playground", l); });
          callFn(ex, [res, rej], e.line);
          return P;
        }
      }
      throw ModelError("cannot evaluate this", e.line);
    }

    function drain() {
      phase = 1;
      if (!micro.length) { running = "Microtask checkpoint"; snap(null, "Microtask checkpoint: the queue is already empty.", "checkpoint"); return; }
      while (micro.length) {
        var j = micro.shift();
        running = "Microtask: " + j.label;
        snap(j.line, "Checkpoint: take the oldest microtask and run it: " + j.label + ".", "micro");
        j.run();
      }
      running = "Microtask checkpoint";
      snap(null, "The microtask queue is empty. Only now can the loop move on to rendering or the next task.", "checkpoint");
    }

    try {
      hoist(ast, G);
      phase = 0; running = "Task: run the script"; stack.push("(script)");
      snap(1, "Running the whole script is the first task. V8 executes it top to bottom on the main thread.", "task");
      var g = execBlock(ast, G), r0 = g.next();
      if (!r0.done) throw ModelError("top-level await is not modeled; put it inside an async function", r0.value.line);
      stack.pop();
      snap(null, "The script is done and the call stack is empty. Time for the microtask checkpoint.", "end");
      drain();
      while (timers.length) {
        timers.sort(cmpT);
        var t = timers[0];
        if (t.due > clock) { phase = 3; running = "Idle: sleeping in the kernel"; snap(null, "Nothing is runnable. The thread sleeps until timer #" + t.id + " is due at " + t.due + " ms.", "sleep"); clock = t.due; }
        timers.shift();
        phase = 0; running = "Task: " + t.label;
        snap(t.line, "Timer #" + t.id + " is due, so its task runs: " + label(t.fn) + ".", "task");
        callFn(t.fn, t.args, t.line);
        drain();
      }
      phase = 3; running = "Idle";
      snap(null, "Every queue is empty. A browser tab would sleep here waiting for input; Node would exit.", "done");
    } catch (e) {
      if (e === STOP) truncated = true;
      else if (e && e.model) error = e.message;
      else throw e;
    }
    return { steps: steps, out: out, error: error, truncated: truncated, maxDelay: maxDelay(src) };
  }
  function maxDelay(src) { var m, re = /setTimeout\([^]*?,\s*(\d+)\s*\)/g, mx = 0; while ((m = re.exec(src))) mx = Math.max(mx, +m[1]); return mx; }

  // Code the page runs in a Web Worker to get the real engine's output for the same program.
  var WORKER = "var __o=[];function __f(v){return v===undefined?'undefined':v===null?'null':typeof v==='string'?v:(typeof v==='number'||typeof v==='boolean')?String(v):(v instanceof Promise)?'Promise':typeof v==='function'?'[Function]':'[object]'}" +
    "self.console={log:function(){var a=[].slice.call(arguments).map(__f).join(' ');postMessage({log:a})}};" +
    "onmessage=function(e){try{(0,eval)(e.data)}catch(err){postMessage({err:String(err)})}};";

  return { run: run, parse: parse, lex: lex, fmt: fmt, WORKER: WORKER };
})();
if (typeof module !== "undefined") module.exports = LoopModel;
