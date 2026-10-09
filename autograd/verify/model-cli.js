// Reads a JSON array of programs on stdin, runs each through autograd-model.js, and prints for each one
// the graph in a canonical order (depth-first from the root over next edges, as Python walks
// grad_fn.next_functions), the backward execution order, the leaf gradients and the output value.
// Used by compare-with-pytorch.py.
const M = require("../autograd-model.js");
let input = ""; process.stdin.on("data", d => input += d).on("end", () => {
  const out = JSON.parse(input).map(text => {
    try {
      const r = M.run(text), idx = {}, list = [];
      (function walk(id) { if (idx[id] !== undefined) return; idx[id] = list.length; list.push(id); r.nodes[id].edges.forEach(e => { if (e !== null) walk(e); }); })(r.root);
      const canon = list.map(id => { const n = r.nodes[id]; return { name: n.name === "AccumulateGrad" ? "torch::autograd::AccumulateGrad" : n.name, leaf: n.leaf || null, edges: n.edges.map(e => e === null ? null : idx[e]), seq: n.seq === Infinity ? -1 : n.seq }; });
      const enc = v => (typeof v === "number" && !isFinite(v)) ? String(v) : v; // JSON has no NaN or Infinity
      const grads = {}; Object.keys(r.grads).forEach(k => grads[k] = enc(r.grads[k]));
      // the largest gradient that flowed along any edge: rounding differences scale with it
      let scale = 1; r.steps.forEach(st => { [st.gradIn].concat(st.outs.map(o => o.grad)).forEach(g => { if (isFinite(g)) scale = Math.max(scale, Math.abs(g)); }); });
      return { canon, order: r.order.map(id => idx[id]), grads, value: enc(r.value), scale };
    } catch (e) { return { error: e.message }; }
  });
  process.stdout.write(JSON.stringify(out));
});
