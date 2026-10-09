# Captures what real PyTorch does for the programs the page uses. Writes capture.json.
#   python3 data/capture.py      (needs PyTorch; the page shows the version it recorded)
import json, os, platform, torch
torch.set_default_dtype(torch.float64)
HERE = os.path.dirname(os.path.abspath(__file__))
out = {"torch": torch.__version__, "python": platform.python_version()}

# 1. The graph autograd recorded for a neuron, as Python sees it
x = torch.tensor(0.5, requires_grad=True); w = torch.tensor(-1.5, requires_grad=True); b = torch.tensor(0.25, requires_grad=True)
y = torch.tanh(w * x + b)
lines = []
def show(fn, depth, seen):
    name = fn.name()
    tag = ""
    if name == "torch::autograd::AccumulateGrad":
        tag = "  # leaf " + {id(x): "x", id(w): "w", id(b): "b"}[id(fn.variable)]
    lines.append("  " * depth + name + tag)
    if fn in seen: return
    seen.add(fn)
    for nxt, _ in fn.next_functions:
        if nxt is None: lines.append("  " * (depth + 1) + "None  # a constant")
        else: show(nxt, depth + 1, seen)
show(y.grad_fn, 0, set())
out["graph"] = {"code": "y = torch.tanh(w * x + b)", "lines": lines, "value": y.item()}

# 2. The order the engine runs nodes in, recorded with pre-hooks, and each node's sequence number
x = torch.tensor(0.5, requires_grad=True); yy = torch.tensor(-1.25, requires_grad=True); z = torch.tensor(2.0, requires_grad=True)
o = torch.tanh(x * yy + z) * x + x ** 2 / yy - 3
names = {id(x): "x", id(yy): "y", id(z): "z"}
nodes, seen = [], set()
def walk(fn):
    if fn in seen: return
    seen.add(fn); nodes.append(fn)
    for n, _ in fn.next_functions:
        if n is not None: walk(n)
walk(o.grad_fn)
base = min(f._sequence_nr() for f in nodes if f.name() != "torch::autograd::AccumulateGrad")
def label(f): return "AccumulateGrad (" + names[id(f.variable)] + ")" if f.name() == "torch::autograd::AccumulateGrad" else f.name()
order = []
for f in nodes: f.register_prehook(lambda g, f=f: order.append({"node": label(f), "seq": "UINT64_MAX" if f.name() == "torch::autograd::AccumulateGrad" else f._sequence_nr() - base, "grad_in": g[0].item()}))
o.backward()
out["order"] = {"code": "out = torch.tanh(x*y + z) * x + x**2 / y - 3", "steps": order, "grads": {"x": x.grad.item(), "y": yy.grad.item(), "z": z.grad.item()}, "note": "sequence numbers shown relative to the first node of this program"}

# 3. The profiler's view: the engine's own evaluate_function events, with sequence numbers
x = torch.tensor(0.5, requires_grad=True); w = torch.tensor(-1.5, requires_grad=True); b = torch.tensor(0.25, requires_grad=True)
with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU], record_shapes=False) as prof:
    y = torch.tanh(w * x + b); y.backward()
ev = [e for e in prof.events() if e.name.startswith("autograd::engine::evaluate_function") or e.name in ("aten::mul", "aten::add", "aten::tanh")]
ev.sort(key=lambda e: e.time_range.start)
t0 = ev[0].time_range.start
out["profiler"] = [{"name": e.name, "seq": e.sequence_nr, "start_us": round(e.time_range.start - t0, 1), "kind": "backward node" if e.name.startswith("autograd::") else ("forward op" if e.sequence_nr >= 0 else "math inside a backward formula")} for e in ev]

# 4. .grad accumulates: two backward calls without zero_grad
w = torch.tensor(-1.5, requires_grad=True); x = torch.tensor(0.5)
acc = []
for i in range(3):
    loss = (w * x - 1.0) ** 2
    loss.backward()
    acc.append(w.grad.item())
w.grad = None
loss = (w * x - 1.0) ** 2; loss.backward()
out["accumulate"] = {"code": "for step in range(3):\n    loss = (w * x - 1.0) ** 2\n    loss.backward()        # no zero_grad", "grads": acc, "after_reset": w.grad.item()}

# 5. Backward twice through the same graph: the saved values are freed after the first pass
w = torch.tensor(-1.5, requires_grad=True); x = torch.tensor(0.5)
loss = torch.tanh(w * x) ** 2
loss.backward()
try:
    loss.backward()
    out["twice"] = "no error"
except RuntimeError as e:
    out["twice"] = str(e).split("\n")[0][:400]

json.dump(out, open(os.path.join(HERE, "capture.json"), "w"), indent=1)
print("wrote capture.json with PyTorch", torch.__version__)
