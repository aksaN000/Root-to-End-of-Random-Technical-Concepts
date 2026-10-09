/* AutogradModel: reverse-mode automatic differentiation the way PyTorch's autograd engine runs it,
 * for scalar float64 programs.
 *
 * A program is a few lines of Python that would also run as-is with torch:
 *
 *   x = 0.5            # a leaf: torch.tensor(0.5, requires_grad=True)
 *   y = -1.25
 *   h = x * y + 2      # an intermediate result
 *   out = tanh(h) * x  # the last assignment is the output; we call out.backward()
 *
 * Operators: + - * / ** and unary minus, with Python's precedence. Functions: tanh exp log sin cos
 * sigmoid relu. Number literals are plain Python numbers (constants), not tensors.
 *
 * Forward: every operation on a tensor creates a backward Node named as PyTorch names it
 * (MulBackward0, AddBackward0, …) with a sequence number from a counter that increases with every
 * node, and with next edges pointing at the nodes of its tensor inputs. A leaf's edge points at its
 * AccumulateGrad node (sequence number UINT64_MAX). Constants have no edge (None in next_functions).
 * Python operator details are kept: 2/x is reciprocal then mul, 2-x is rsub, 2**x is PowBackward2.
 *
 * Backward (Engine::execute): count dependencies from the root (compute_dependencies), push the root
 * on a ready queue, then repeatedly pop the task with the highest sequence number
 * (ReadyQueue::CompareNodeTaskTime, a std::priority_queue simulated exactly, so ties pop in the same
 * order as libstdc++), run its derivative formula, add each output into the next node's input buffer
 * and push that node when its dependency count reaches 0 (Engine::evaluate_function). AccumulateGrad
 * adds the incoming gradient into the leaf's .grad.
 *
 * Not modelled: tensors with more than one element and broadcasting, in-place operations, no_grad,
 * hooks, create_graph (higher-order gradients), retain_graph errors, and CUDA streams.
 */
(function (root) {
  "use strict";
  var FUNCS = { tanh: 1, exp: 1, log: 1, sin: 1, cos: 1, sigmoid: 1, relu: 1 };
  var ACC_SEQ = "18446744073709551615"; // UINT64_MAX, shown as text; compared as Infinity

  /* ---------- parsing: Python expression subset ---------- */
  function tokenize(s, where) {
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (c === " " || c === "\t") { i++; continue; }
      if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i)))) { out.push({ t: "num", v: m[1], isInt: /^\d+$/.test(m[1]) }); i += m[1].length; continue; }
      if ((m = /^[A-Za-z_]\w*/.exec(s.slice(i)))) { out.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
      if (s.slice(i, i + 2) === "**") { out.push({ t: "op", v: "**" }); i += 2; continue; }
      if ("+-*/(),".indexOf(c) >= 0) { out.push({ t: "op", v: c }); i++; continue; }
      throw new Error(where + ": unexpected '" + c + "'");
    }
    return out;
  }
  function parseExpr(s, where) {
    var toks = tokenize(s, where), p = 0;
    function peek() { return toks[p]; }
    function eat(v) { var t = toks[p]; if (!t || t.v !== v) throw new Error(where + ": expected '" + v + "'"); p++; }
    function sum() { var l = prod(); while (peek() && (peek().v === "+" || peek().v === "-")) { var o = toks[p++].v; l = { k: "bin", op: o, a: l, b: prod() }; } return l; }
    function prod() { var l = unary(); while (peek() && (peek().v === "*" || peek().v === "/")) { var o = toks[p++].v; l = { k: "bin", op: o, a: l, b: unary() }; } return l; }
    function unary() { if (peek() && peek().v === "-") { p++; return { k: "neg", a: unary() }; } if (peek() && peek().v === "+") { p++; return unary(); } return power(); }
    function power() { var b = atom(); if (peek() && peek().v === "**") { p++; return { k: "bin", op: "**", a: b, b: unary() }; } return b; }
    function atom() {
      var t = toks[p++];
      if (!t) throw new Error(where + ": the expression ends too early");
      if (t.t === "num") return { k: "num", v: +t.v, isInt: t.isInt };
      if (t.t === "id") {
        if (peek() && peek().v === "(") { if (!FUNCS[t.v]) throw new Error(where + ": unknown function " + t.v + "()"); p++; var a = sum(); eat(")"); return { k: "call", f: t.v, a: a }; }
        return { k: "var", v: t.v };
      }
      if (t.v === "(") { var e = sum(); eat(")"); return e; }
      throw new Error(where + ": unexpected '" + t.v + "'");
    }
    var e = sum();
    if (p < toks.length) throw new Error(where + ": unexpected '" + toks[p].v + "'");
    return e;
  }
  function parse(text) {
    var prog = { leaves: [], stmts: [], names: {} };
    text.split("\n").forEach(function (raw, i) {
      var line = raw.replace(/#.*$/, "").trim(), where = "line " + (i + 1);
      if (!line) return;
      var m = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line);
      if (!m) throw new Error(where + ": expected  name = expression");
      if (FUNCS[m[1]]) throw new Error(where + ": " + m[1] + " is a function name");
      var rhs = m[2].trim(), num = /^-?(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)$/.exec(rhs);
      if (num && !prog.stmts.length) { if (prog.names[m[1]]) throw new Error(where + ": " + m[1] + " is already defined"); prog.leaves.push({ name: m[1], value: +rhs }); prog.names[m[1]] = "leaf"; return; }
      var e = parseExpr(rhs, where);
      (function check(n) { if (n.k === "var" && !prog.names[n.v]) throw new Error(where + ": " + n.v + " is not defined yet"); ["a", "b"].forEach(function (k) { if (n[k]) check(n[k]); }); })(e);
      prog.stmts.push({ name: m[1], expr: e, line: i + 1, src: rhs }); prog.names[m[1]] = "stmt";
    });
    if (!prog.leaves.length) throw new Error("start with at least one leaf, for example  x = 0.5");
    if (!prog.stmts.length) throw new Error("add a line that computes something from the leaves, for example  out = x * x");
    prog.output = prog.stmts[prog.stmts.length - 1].name;
    return prog;
  }

  /* ---------- forward: values and the backward graph ---------- */
  function forward(prog) {
    var nodes = [], seq = 0, env = {}, acc = {};
    function node(name, edges, info) { var n = { id: nodes.length, name: name, seq: seq++, edges: edges, info: info }; nodes.push(n); return n; }
    function accFor(leaf) {
      if (!acc[leaf]) { var n = { id: nodes.length, name: "AccumulateGrad", seq: Infinity, edges: [], leaf: leaf }; nodes.push(n); acc[leaf] = n; }
      return acc[leaf];
    }
    function edge(v) { return v.leaf ? accFor(v.leaf).id : v.fn.id; }
    function T(value, fn) { return { tensor: true, value: value, fn: fn }; }
    prog.leaves.forEach(function (l) { env[l.name] = { tensor: true, value: l.value, leaf: l.name, label: l.name }; });
    function ev(e) {
      if (e.k === "num") return { tensor: false, value: e.v };
      if (e.k === "var") return env[e.v];
      if (e.k === "neg") { var a = ev(e.a); if (!a.tensor) return { tensor: false, value: -a.value }; return T(-a.value, node("NegBackward0", [edge(a)], { op: "neg", x: a.value })); }
      if (e.k === "call") {
        var x = ev(e.a);
        if (!x.tensor) throw new Error(e.f + "() needs a tensor argument, not the constant " + fmt(x.value) + " (torch." + e.f + " of a Python number is a TypeError)");
        var v = { tanh: Math.tanh, exp: Math.exp, log: Math.log, sin: Math.sin, cos: Math.cos, sigmoid: function (t) { return 1 / (1 + Math.exp(-t)); }, relu: function (t) { return t !== t ? t : t > 0 ? t : 0; } }[e.f](x.value); // relu passes nan through, as torch.relu does
        var nm = { tanh: "TanhBackward0", exp: "ExpBackward0", log: "LogBackward0", sin: "SinBackward0", cos: "CosBackward0", sigmoid: "SigmoidBackward0", relu: "ReluBackward0" }[e.f];
        return T(v, node(nm, [edge(x)], { op: e.f, x: x.value, result: v }));
      }
      var A = ev(e.a), B = ev(e.b), op = e.op;
      if (!A.tensor && !B.tensor) {
        if (op === "/" && B.value === 0) throw new Error("division by zero between two constants (a Python ZeroDivisionError)");
        return { tensor: false, value: op === "+" ? A.value + B.value : op === "-" ? A.value - B.value : op === "*" ? A.value * B.value : op === "/" ? A.value / B.value : Math.pow(A.value, B.value) };
      }
      if (op === "+") return T(A.value + B.value, node("AddBackward0", A.tensor && B.tensor ? [edge(A), edge(B)] : [edge(A.tensor ? A : B), null], { op: "add", ta: A.tensor, tb: B.tensor }));
      if (op === "*") return T(A.value * B.value, node("MulBackward0", A.tensor && B.tensor ? [edge(A), edge(B)] : [edge(A.tensor ? A : B), null], { op: "mul", a: A.tensor ? A.value : B.value, b: A.tensor ? B.value : A.value, both: A.tensor && B.tensor }));
      if (op === "-") {
        if (A.tensor) return T(A.value - B.value, node("SubBackward0", B.tensor ? [edge(A), edge(B)] : [edge(A), null], { op: "sub" }));
        return T(A.value - B.value, node("RsubBackward1", [edge(B)], { op: "rsub" })); // constant - tensor: tensor.__rsub__
      }
      if (op === "/") {
        if (A.tensor) return T(A.value / B.value, node("DivBackward0", B.tensor ? [edge(A), edge(B)] : [edge(A), null], { op: "div", a: A.value, b: B.value, both: B.tensor }));
        // constant / tensor: Tensor.__rtruediv__ is reciprocal() * constant
        var r = 1 / B.value, rn = node("ReciprocalBackward0", [edge(B)], { op: "reciprocal", result: r });
        return T(r * A.value, node("MulBackward0", [rn.id, null], { op: "mul", a: r, b: A.value, both: false }));
      }
      if (op === "**") {
        if (A.tensor && B.tensor) { var pv = Math.pow(A.value, B.value); return T(pv, node("PowBackward1", [edge(A), edge(B)], { op: "powtt", a: A.value, b: B.value, result: pv })); }
        if (A.tensor) return T(Math.pow(A.value, B.value), node("PowBackward0", [edge(A)], { op: "pow", a: A.value, c: B.value }));
        var p2 = Math.pow(A.value, B.value);
        return T(p2, node("PowBackward2", [edge(B)], { op: "rpow", base: A.value, e: B.value, result: p2 }));
      }
      throw new Error("unknown operator " + op);
    }
    prog.stmts.forEach(function (s) { var v = ev(s.expr); if (v.fn && !v.fn.label) v.fn.label = s.name; env[s.name] = v; });
    var out = env[prog.output];
    if (!out.tensor) throw new Error(prog.output + " is a constant, so it has no gradient: use a leaf in it");
    if (out.leaf) throw new Error(prog.output + " is a leaf; backward() needs a computed result");
    return { nodes: nodes, env: env, root: out.fn.id, value: out.value };
  }

  /* ---------- the derivative formulas, as in derivatives.yaml / FunctionsManual.cpp ---------- */
  function apply(n, g) {
    var i = n.info;
    switch (i.op) {
      case "add": return n.edges.length === 2 && n.edges[1] !== null ? [g, g] : [g, null];
      case "sub": return n.edges[1] !== null ? [g, -g] : [g, null];
      case "rsub": return [-g];
      case "neg": return [-g];
      case "mul": return i.both ? [g * i.b, g * i.a] : [g * i.b, null];                         // mul_tensor_backward: grad * other
      case "div": return i.both ? [g / i.b, -g * ((i.a / i.b) / i.b)] : [g / i.b, null];      // div_tensor_self/other_backward
      case "reciprocal": return [-g * (i.result * i.result)];
      case "pow": return [i.c === 0 ? 0 : g * (i.c * Math.pow(i.a, i.c - 1))];                 // pow_backward
      case "powtt": return [i.b === 0 ? 0 : g * (i.b * Math.pow(i.a, i.b - 1)),               // pow_backward_self
        g * (i.a === 0 && i.b >= 0 ? 0 : i.result * Math.log(i.a))];                          // pow_backward_exponent
      case "rpow": return [i.base === 0 ? g * (i.e >= 0 ? 0 : i.result * Math.log(0)) : g * (i.result * Math.log(i.base))]; // pow_backward_exponent, scalar base
      case "tanh": return [g * (1 - i.result * i.result)];                                     // tanh_backward
      case "sigmoid": return [g * ((1 - i.result) * i.result)];                                // sigmoid_backward
      case "relu": return [i.result <= 0 ? 0 : g];                                             // threshold_backward(grad, result, 0)
      case "exp": return [g * i.result];
      case "log": return [g / i.x];
      case "sin": return [g * Math.cos(i.x)];
      case "cos": return [g * -Math.sin(i.x)];
    }
    throw new Error("no formula for " + n.name);
  }
  var FORMULA = {
    add: "grad, grad", sub: "grad, -grad", rsub: "-grad", neg: "-grad", mul: "grad * other, grad * self", div: "grad / other, -grad * self / other²",
    reciprocal: "-grad * result²", pow: "grad * c * self^(c-1)", powtt: "grad * b * a^(b-1), grad * result * log(a)", rpow: "grad * result * log(base)",
    tanh: "grad * (1 - result²)", sigmoid: "grad * (1 - result) * result", relu: "result > 0 ? grad : 0", exp: "grad * result", log: "grad / self", sin: "grad * cos(self)", cos: "grad * -sin(self)"
  };

  /* ---------- std::priority_queue as libstdc++ implements it ---------- */
  function lessTask(a, b) { return a.seq < b.seq; } // CompareNodeTaskTime: same reentrant depth, so by sequence_nr
  function pushHeap(h, hole, top, value) {
    var parent = Math.floor((hole - 1) / 2);
    while (hole > top && lessTask(h[parent], value)) { h[hole] = h[parent]; hole = parent; parent = Math.floor((hole - 1) / 2); }
    h[hole] = value;
  }
  function pqPush(h, v) { h.push(v); pushHeap(h, h.length - 1, 0, v); }
  function pqPop(h) {
    var len = h.length, top = h[0];
    if (len > 1) {
      var value = h[len - 1]; h[len - 1] = h[0];
      var n = len - 1, hole = 0, second = 0;
      while (second < Math.floor((n - 1) / 2)) { second = 2 * (second + 1); if (lessTask(h[second], h[second - 1])) second--; h[hole] = h[second]; hole = second; }
      if ((n & 1) === 0 && second === Math.floor((n - 2) / 2)) { second = 2 * (second + 1); h[hole] = h[second - 1]; hole = second - 1; }
      pushHeap(h, hole, 0, value);
    }
    h.pop();
    return top;
  }

  /* ---------- backward: Engine::execute ---------- */
  function backward(F, existing) {
    var nodes = F.nodes, deps = {}, seen = {}, stack = [F.root], steps = [], order = [], grads = {};
    Object.keys(existing || {}).forEach(function (k) { grads[k] = existing[k]; });
    seen[F.root] = true;
    while (stack.length) { // compute_dependencies
      var id = stack.pop();
      nodes[id].edges.forEach(function (e) { if (e === null) return; deps[e] = (deps[e] || 0) + 1; if (!seen[e]) { seen[e] = true; stack.push(e); } });
    }
    var depsStart = JSON.parse(JSON.stringify(deps));
    var heap = [], buffers = {}, notReady = {};
    pqPush(heap, { id: F.root, seq: nodes[F.root].seq, grad: 1 });
    while (heap.length) {
      var queueBefore = heap.map(function (t) { return t.id; });
      var task = pqPop(heap), n = nodes[task.id], step = { node: n.id, gradIn: task.grad, queueBefore: queueBefore, outs: [] };
      order.push(n.id);
      if (n.name === "AccumulateGrad") {
        var before = grads[n.leaf];
        grads[n.leaf] = before === undefined ? task.grad : before + task.grad;
        step.acc = { leaf: n.leaf, before: before, after: grads[n.leaf] };
      } else {
        var outs = apply(n, task.grad);
        n.edges.forEach(function (e, k) {
          if (e === null) return;
          var g = outs[k], ready = --deps[e] === 0;
          if (notReady[e] === undefined) { buffers[e] = g; } else { buffers[e] = buffers[e] + g; } // InputBuffer::add accumulates
          var o = { to: e, grad: g, buffer: buffers[e], depsLeft: deps[e], pushed: ready };
          if (ready) { delete notReady[e]; pqPush(heap, { id: e, seq: nodes[e].seq, grad: buffers[e] }); } else notReady[e] = true;
          step.outs.push(o);
        });
      }
      step.queueAfter = heap.map(function (t) { return t.id; });
      steps.push(step);
    }
    return { steps: steps, order: order, grads: grads, deps: depsStart };
  }

  function run(text, existing) {
    var prog = typeof text === "string" ? parse(text) : text, F = forward(prog), B = backward(F, existing);
    return { prog: prog, nodes: F.nodes, root: F.root, value: F.value, env: F.env, steps: B.steps, order: B.order, grads: B.grads, deps: B.deps };
  }
  function fmt(v) { if (v === Infinity) return "inf"; if (v === -Infinity) return "-inf"; if (v !== v) return "nan"; var s = (+v.toPrecision(6)).toString(); return s; }
  function seqText(n) { return n.seq === Infinity ? ACC_SEQ : String(n.seq); }
  function label(n) { return n.name === "AccumulateGrad" ? "AccumulateGrad (" + n.leaf + ")" : n.name; }

  var PRESETS = [
    ["A neuron", "x = 0.5\nw = -1.5\nb = 0.25\nout = tanh(w * x + b)"],
    ["A variable used twice", "x = 3.0\ny = 2.0\nout = x * y + x"],
    ["x * x", "x = 3.0\nout = x * x"],
    ["Our mixed example", "x = 0.5\ny = -1.25\nz = 2.0\nout = tanh(x*y + z) * x + x**2 / y - 3"],
    ["Constants: 2/x and 2-x", "x = 4.0\nout = 2/x + (2 - x)"],
    ["Two-layer MLP, one input", "x = 1.0\nw1 = 0.8\nb1 = -0.2\nw2 = -1.1\nb2 = 0.3\nh = relu(w1 * x + b1)\nout = sigmoid(w2 * h + b2)"],
    ["Squared error loss", "w = 0.7\nb = 0.1\npred = w * 2.0 + b\nloss = (pred - 1.0) ** 2"],
    ["ReLU at zero", "x = 0.0\nout = relu(x) + x"]
  ];

  var api = { parse: parse, run: run, forward: forward, backward: backward, fmt: fmt, seqText: seqText, label: label, FORMULA: FORMULA, PRESETS: PRESETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AutogradModel = api;
})(this);
