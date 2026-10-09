// SLR(1) parser construction and simulation, following the Dragon Book (2nd ed.) Sections 4.4.2 and 4.6.
// Grammar text: one rule per line, "A -> x y | z", symbols separated by spaces, "ε" or nothing for empty.
var LR = (function () {
  var EPS = "ε", END = "$";
  function parseGrammar(text) {
    var prods = [], nts = [], order = [];
    text.split("\n").forEach(function (raw, li) {
      var line = raw.replace(/#.*/, "").trim();
      if (!line) return;
      var m = line.match(/^(\S+)\s*(?:->|→|::=)\s*(.*)$/);
      if (!m) throw new Error("Line " + (li + 1) + ": expected  A -> symbols | symbols");
      var lhs = m[1];
      if (nts.indexOf(lhs) < 0) nts.push(lhs);
      m[2].split("|").forEach(function (alt) {
        var rhs = alt.trim().split(/\s+/).filter(function (s) { return s && s !== EPS && s !== "ε" && s !== "''"; });
        prods.push({ lhs: lhs, rhs: rhs });
      });
    });
    if (!prods.length) throw new Error("Write at least one rule");
    var start = prods[0].lhs, aug = start + "'";
    while (nts.indexOf(aug) >= 0) aug += "'";
    prods.unshift({ lhs: aug, rhs: [start] });
    nts.unshift(aug);
    var terms = [];
    prods.forEach(function (p) { p.rhs.forEach(function (s) { if (nts.indexOf(s) < 0 && terms.indexOf(s) < 0) terms.push(s); }); });
    if (terms.indexOf(END) >= 0) throw new Error("$ is reserved for end of input");
    prods.forEach(function (p, i) { p.id = i; });
    return { prods: prods, nts: nts, terms: terms, start: start, aug: aug };
  }
  function firstFollow(G) {
    var FIRST = {}, FOLLOW = {};
    G.terms.forEach(function (t) { FIRST[t] = [t]; });
    G.nts.forEach(function (n) { FIRST[n] = []; FOLLOW[n] = []; });
    function add(set, x) { if (set.indexOf(x) < 0) { set.push(x); return true; } return false; }
    function firstSeq(seq) {
      var out = [];
      for (var i = 0; i < seq.length; i++) {
        var f = FIRST[seq[i]];
        f.forEach(function (x) { if (x !== EPS) add(out, x); });
        if (f.indexOf(EPS) < 0) return out;
      }
      add(out, EPS);
      return out;
    }
    var changed = true;
    while (changed) {
      changed = false;
      G.prods.forEach(function (p) { firstSeq(p.rhs).forEach(function (x) { if (add(FIRST[p.lhs], x)) changed = true; }); });
    }
    add(FOLLOW[G.aug], END);
    changed = true;
    while (changed) {
      changed = false;
      G.prods.forEach(function (p) {
        p.rhs.forEach(function (B, i) {
          if (G.nts.indexOf(B) < 0) return;
          var f = firstSeq(p.rhs.slice(i + 1));
          f.forEach(function (x) { if (x !== EPS && add(FOLLOW[B], x)) changed = true; });
          if (f.indexOf(EPS) >= 0) FOLLOW[p.lhs].forEach(function (x) { if (add(FOLLOW[B], x)) changed = true; });
        });
      });
    }
    return { FIRST: FIRST, FOLLOW: FOLLOW, firstSeq: firstSeq };
  }
  function key(items) { return items.map(function (it) { return it[0] + "." + it[1]; }).sort().join(","); }
  function closure(G, kernel) {
    var items = kernel.slice(), seen = {};
    items.forEach(function (it) { seen[it[0] + "." + it[1]] = 1; });
    for (var i = 0; i < items.length; i++) {
      var p = G.prods[items[i][0]], B = p.rhs[items[i][1]];
      if (B === undefined || G.nts.indexOf(B) < 0) continue;
      G.prods.forEach(function (q) {
        if (q.lhs === B && !seen[q.id + ".0"]) { seen[q.id + ".0"] = 1; items.push([q.id, 0]); }
      });
    }
    return items;
  }
  function collection(G) {
    var states = [], index = {}, trans = [];
    function addState(kernel) {
      var k = key(kernel);
      if (index[k] !== undefined) return index[k];
      var id = states.length;
      index[k] = id;
      states.push({ id: id, kernel: kernel, items: closure(G, kernel) });
      return id;
    }
    addState([[0, 0]]);
    for (var s = 0; s < states.length; s++) {
      var st = states[s], syms = [];
      st.items.forEach(function (it) { var X = G.prods[it[0]].rhs[it[1]]; if (X !== undefined && syms.indexOf(X) < 0) syms.push(X); });
      st.go = {};
      syms.forEach(function (X) {
        var kernel = st.items.filter(function (it) { return G.prods[it[0]].rhs[it[1]] === X; }).map(function (it) { return [it[0], it[1] + 1]; });
        var t = addState(kernel);
        st.go[X] = t;
        trans.push([s, X, t]);
      });
    }
    return { states: states, trans: trans };
  }
  function slrTable(G, FF, C) {
    var ACTION = [], GOTO = [], conflicts = [];
    C.states.forEach(function (st) {
      var row = {};
      function put(a, act) {
        row[a] = row[a] || [];
        if (!row[a].some(function (x) { return x.t === act.t && x.n === act.n; })) row[a].push(act);
      }
      st.items.forEach(function (it) {
        var p = G.prods[it[0]], X = p.rhs[it[1]];
        if (X !== undefined) { if (G.terms.indexOf(X) >= 0) put(X, { t: "s", n: st.go[X] }); }
        else if (p.id === 0) put(END, { t: "acc" });
        else FF.FOLLOW[p.lhs].forEach(function (a) { put(a, { t: "r", n: p.id }); });
      });
      Object.keys(row).forEach(function (a) {
        if (row[a].length > 1) {
          var kinds = row[a].map(function (x) { return x.t; }).sort().join("");
          conflicts.push({ state: st.id, sym: a, acts: row[a], kind: kinds.indexOf("s") >= 0 ? "shift/reduce" : "reduce/reduce" });
        }
      });
      ACTION.push(row);
      var g = {};
      G.nts.forEach(function (A) { if (st.go[A] !== undefined) g[A] = st.go[A]; });
      GOTO.push(g);
    });
    return { ACTION: ACTION, GOTO: GOTO, conflicts: conflicts };
  }
  function actText(x) { return x.t === "acc" ? "acc" : x.t + x.n; }
  // LR parsing algorithm (Dragon Book Algorithm 4.44). On a conflict it shifts, like Bison's default.
  function parser(G, T, tokens) {
    var input = tokens.concat([END]), stack = [{ s: 0 }], pos = 0, done = false, ok = false, steps = [];
    function step() {
      if (done) return null;
      var s = stack[stack.length - 1].s, a = input[pos], cell = (T.ACTION[s] || {})[a], rec = { stack: stack.map(function (e) { return e; }), pos: pos, state: s, sym: a };
      if (!cell || !cell.length) { done = true; rec.kind = "error"; rec.text = "error: no action for state " + s + " on " + a; steps.push(rec); return rec; }
      var act = cell.length > 1 ? (cell.filter(function (x) { return x.t === "s"; })[0] || cell[0]) : cell[0];
      rec.conflict = cell.length > 1;
      if (act.t === "s") {
        stack.push({ s: act.n, sym: a, node: { sym: a, kids: [] } });
        pos++;
        rec.kind = "shift"; rec.text = "shift " + a + ", go to state " + act.n;
      } else if (act.t === "r") {
        var p = G.prods[act.n], kids = stack.splice(stack.length - p.rhs.length, p.rhs.length).map(function (e) { return e.node; });
        var top = stack[stack.length - 1].s, g = T.GOTO[top][p.lhs];
        stack.push({ s: g, sym: p.lhs, node: { sym: p.lhs, kids: kids.length ? kids : [{ sym: "ε", kids: [] }], prod: p.id } });
        rec.kind = "reduce"; rec.prod = p.id; rec.text = "reduce by " + p.id + ": " + p.lhs + " → " + (p.rhs.join(" ") || "ε") + ", then GOTO[" + top + ", " + p.lhs + "] = " + g;
      } else { done = true; ok = true; rec.kind = "accept"; rec.text = "accept"; }
      rec.act = act;
      steps.push(rec);
      return rec;
    }
    return { step: step, get stack() { return stack; }, get pos() { return pos; }, get done() { return done; }, get ok() { return ok; }, input: input, steps: steps };
  }
  function build(text) {
    var G = parseGrammar(text), FF = firstFollow(G), C = collection(G), T = slrTable(G, FF, C);
    return { G: G, FF: FF, C: C, T: T };
  }
  return { build: build, parser: parser, actText: actText, EPS: EPS, END: END, parseGrammar: parseGrammar };
})();
if (typeof module !== "undefined") module.exports = LR;
