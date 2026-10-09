# From the chain rule to loss.backward()

ML track, page 1 of 2. How PyTorch computes gradients: the graph recorded during the forward pass, the engine that walks it, and the node that writes `.grad`.

## What it covers

1. **The 60-second version**, with the backward graph of `tanh(w * x + b)`.
2. **The chain rule, run backwards**: local derivatives, forward versus reverse mode, and `derivatives.yaml`, the table PyTorch generates its backward nodes from.
3. **Recording the graph**: `Node`, its next edges and sequence number, and the real `grad_fn.next_functions` chain; how Python operators map to nodes (`2 / x` is reciprocal then mul).
4. **Leaves**: `AccumulateGrad`, its `UINT64_MAX` sequence number, and `variable_grad += new_grad`, with a real capture of gradients piling up without `zero_grad()`.
5. **The engine**: `compute_dependencies`, `ReadyQueue::CompareNodeTaskTime` and `evaluate_function`'s input buffers.
6. **Backward lab**: type a small Python program and step through the engine: the graph lights up node by node, with the ready queue, dependency counts, gradients on every edge and `.grad`; "backward() again" shows accumulation, and "Check with finite differences" checks every gradient numerically in the browser.
7. **Saved tensors**: `release_variables()` and the real "backward through the graph a second time" error.
8. **loss.backward()**: `_make_grads`, `ones_like`, and `_engine_run_backward` into `Engine::execute`.
9. **Real output**: the execution order from pre-hooks, and `torch.profiler` linking forward ops to backward nodes by sequence number.
10. Quizzes, tools and exercises, exam-style questions, and a reading list.

## Verification

`python3 verify/compare-with-pytorch.py` runs the 8 presets and 2,000 seeded random programs (four batches) through `autograd-model.js` (via `verify/model-cli.js`) and through PyTorch, and compares the graph (names and next edges, walking `grad_fn.next_functions`), the order of sequence numbers, the execution order (a pre-hook on every node), and the float64 gradients (nan and inf exactly; other values within 1e-12 times the largest gradient in the graph). Latest numbers: [VALIDATION.md](../VALIDATION.md).

## The capture

`data/capture.py` records the graph of a neuron, the execution order of the mixed example, a profiler trace, three `backward()` calls without `zero_grad()`, and the error from a second backward on a freed graph, into `capture.json`. `data/make-page-data.py` bundles it into `capture-data.js` for the page.

## Sources

PyTorch source at tag v2.14.1 (BSD-style license), quoted for study.
