# Runs the autograd model and real PyTorch on the same programs and compares four things:
#   1. the backward graph: every node's name and its next edges, in the order Python reaches them
#      walking grad_fn.next_functions depth-first from the output
#   2. the order of sequence numbers (which node was created first)
#   3. the order the engine ran the nodes in, recorded with a pre-hook on every node
#   4. every leaf's .grad, in float64 (difference at most 1e-12 times the largest gradient in the graph;
#      nan and inf must match exactly)
#
#   python3 verify/compare-with-pytorch.py                      the presets plus 4 seeded batches
#   python3 verify/compare-with-pytorch.py 500 7                the presets plus 500 random programs, seed 7
#   python3 verify/compare-with-pytorch.py 300:7 300:99         several batches
# Needs PyTorch (pip install torch --index-url https://download.pytorch.org/whl/cpu) and Node.
import json, math, os, platform, random, subprocess, sys, datetime
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
torch.set_default_dtype(torch.float64)
FUNCS = {"tanh": torch.tanh, "exp": torch.exp, "log": torch.log, "sin": torch.sin, "cos": torch.cos, "sigmoid": torch.sigmoid, "relu": torch.relu}


def presets():
    js = "const M=require(%s);process.stdout.write(JSON.stringify(M.PRESETS.map(p=>p[1])))" % json.dumps(os.path.join(HERE, "..", "autograd-model.js"))
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)


def gen(r):
    """A random program: 1 to 4 leaves, 1 to 3 statements, Python operators and the seven functions."""
    leaves = ["abcd"[i] for i in range(r.randint(1, 4))]
    lines = ["%s = %s" % (l, r.choice(["0.5", "-1.25", "2.0", "0.75", "-0.3", "1.5", "3.0", "-2.0", "0.0", "0.1"])) for l in leaves]
    names = list(leaves)
    def has_var(e): return any(n in e for n in names)
    def expr(d):
        k = r.random()
        if d <= 0 or k < 0.25:
            return r.choice(names) if r.random() < 0.8 else r.choice(["2", "3", "0.5", "1.5"])
        if k < 0.45:
            a = expr(d - 1)
            if not has_var(a): a = r.choice(names)
            return "%s(%s)" % (r.choice(list(FUNCS)), a)
        if k < 0.52:
            return "-" + paren(expr(d - 1))
        op = r.choice(["+", "-", "*", "/", "**", "+", "*"])
        a, b = expr(d - 1), expr(d - 1)
        if op == "**" and not has_var(a) and not has_var(b): b = "2"
        if op == "**" and not has_var(b) and r.random() < 0.7: b = r.choice(["2", "3", "0.5", "-1"])
        return paren(a) + " " + op + " " + paren(b)
    def paren(e): return e if e.replace(".", "").replace("_", "").isalnum() else "(" + e + ")"
    n_stmts = r.randint(1, 3)
    for i in range(n_stmts):
        e = expr(r.randint(1, 4))
        if not has_var(e): e = r.choice(names) + " * " + e
        name = "out" if i == n_stmts - 1 else "h%d" % i
        lines.append("%s = %s" % (name, e))
        names.append(name)
    return "\n".join(lines)


def run_torch(text):
    """Executes the program with torch and returns the same canonical view the model CLI prints."""
    env, leaves = dict(FUNCS), {}
    stmts = []
    for line in text.split("\n"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        name, rhs = [s.strip() for s in line.split("=", 1)]
        if not stmts:
            try:
                v = float(rhs)
                env[name] = leaves[name] = torch.tensor(v, requires_grad=True)
                continue
            except ValueError:
                pass
        stmts.append(name)
        env[name] = eval(rhs, {"__builtins__": {}}, env)
    out = env[stmts[-1]]
    root = out.grad_fn
    idx, nodes = {}, []
    def walk(fn):
        if fn in idx:
            return
        idx[fn] = len(nodes); nodes.append(fn)
        for nxt, _ in fn.next_functions:
            if nxt is not None:
                walk(nxt)
    walk(root)
    leaf_of = {}
    for name, t in leaves.items():
        for fn in nodes:
            if fn.name() == "torch::autograd::AccumulateGrad" and fn.variable is t:
                leaf_of[fn] = name
    canon = [{"name": fn.name(), "leaf": leaf_of.get(fn), "edges": [None if n is None else idx[n] for n, _ in fn.next_functions], "seq": -1 if fn.name() == "torch::autograd::AccumulateGrad" else fn._sequence_nr()} for fn in nodes]
    order = []
    for fn in nodes:
        fn.register_prehook(lambda g, fn=fn: order.append(idx[fn]))
    out.backward()
    grads = {n: (t.grad.item() if t.grad is not None else None) for n, t in leaves.items()}
    return {"canon": canon, "order": order, "grads": grads, "value": out.item()}


def same_number(a, b, scale=1.0):
    dec = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}
    a = dec.get(a, a) if isinstance(a, str) else a
    if a is None or b is None:
        return a is None and b is None or (a is None and b == 0) or (b is None and a == 0)
    if math.isnan(a) or math.isnan(b):
        return math.isnan(a) and math.isnan(b)
    if math.isinf(a) or math.isinf(b):
        return a == b
    # Rounding: PyTorch's CPU kernels and JavaScript can differ in the last bit of a product or a
    # quotient, and when two gradients cancel that last bit is all that is left. So the tolerance is
    # relative to the largest gradient that flowed through the graph, not to the (possibly tiny) result.
    return abs(a - b) <= 1e-12 * max(scale, abs(a), abs(b))


def ranks(canon):
    seqs = sorted(c["seq"] for c in canon if c["seq"] >= 0)
    return [seqs.index(c["seq"]) if c["seq"] >= 0 else -1 for c in canon]


def compare(m, t):
    if "error" in m:
        return "model refused: " + m["error"]
    strip = lambda c: [{"name": x["name"], "leaf": x["leaf"], "edges": x["edges"]} for x in c]
    if strip(m["canon"]) != strip(t["canon"]):
        return "graph differs"
    if ranks(m["canon"]) != ranks(t["canon"]):
        return "sequence-number order differs"
    if m["order"] != t["order"]:
        return "execution order differs"
    for k, v in t["grads"].items():
        if not same_number(m["grads"].get(k), v, m.get("scale", 1.0)):
            return "grad of %s differs: model %r, torch %r" % (k, m["grads"].get(k), v)
    return None


def main():
    args = sys.argv[1:]
    if any(":" in a for a in args):
        batches = [tuple(int(x) for x in a.split(":")) for a in args]
    elif args:
        batches = [(int(args[0]), int(args[1]) if len(args) > 1 else 1)]
    else:
        batches = [(500, 7), (500, 2026), (500, 99), (500, 4242)]
    progs = presets()
    hand = len(progs)
    for count, seed in batches:
        r = random.Random(seed)
        made = 0
        while made < count:
            p = gen(r)
            try:
                run_torch(p)
            except Exception:
                continue  # Python itself rejects it (for example a complex power); not a program to compare
            progs.append(p); made += 1
    distinct = list(dict.fromkeys(progs))
    model = json.loads(subprocess.run(["node", os.path.join(HERE, "model-cli.js")], input=json.dumps(distinct), capture_output=True, text=True, check=True).stdout)
    passed, failures, nodes, specials = 0, [], 0, 0
    for text, m in zip(distinct, model):
        t = run_torch(text)
        nodes += len(t["canon"])
        specials += any(v is not None and (math.isnan(v) or math.isinf(v)) for v in t["grads"].values())
        why = compare(m, t)
        if why is None:
            passed += 1
        else:
            failures.append({"program": text, "why": why, "model": m, "torch": t})
    ver = torch.__version__
    print("%d/%d distinct programs match PyTorch %s: graph, node names, sequence order, execution order and float64 grads (%d presets + %d random; %d backward nodes in all; %d with nan or inf gradients)" % (passed, len(distinct), ver, hand, len(distinct) - hand, nodes, specials))
    for f in failures[:3]:
        print("\nMISMATCH (%s)\n%s" % (f["why"], f["program"]))
    if not os.environ.get("RK_NO_REPORT"):
        res = os.path.join(ROOT, "validation", "results"); os.makedirs(res, exist_ok=True)
        out = {"id": "autograd", "date": datetime.datetime.now(datetime.timezone.utc).isoformat(), "platform": platform.platform(), "node": subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip().lstrip("v"),
               "reference": "PyTorch %s (CPU, Python %s)" % (ver, platform.python_version()), "cases": len(distinct), "matched": passed, "passed": not failures, "handPicked": hand,
               "seeds": [{"count": c, "seed": s} for c, s in batches], "detail": "%d backward nodes compared; %d programs with nan or inf gradients" % (nodes, specials), "failureCount": len(failures)}
        json.dump(out, open(os.path.join(res, "autograd.json"), "w"), indent=1)
        ff = os.path.join(ROOT, "validation", "failures", "autograd.json")
        if failures:
            os.makedirs(os.path.dirname(ff), exist_ok=True); json.dump({"id": "autograd", "failures": failures}, open(ff, "w"), indent=1, default=str)
        elif os.path.exists(ff):
            os.remove(ff)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
