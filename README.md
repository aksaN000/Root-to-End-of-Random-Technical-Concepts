# Root to End of Random Technical Concepts

Interactive simulations I build while learning computer science, each one tracing a concept from its root to the end: from the OS, compiler or protocol layer up to the code I actually write, using the real source code of the systems involved.

## Simulations

| Topic | What it traces | Open |
|---|---|---|
| [JavaScript event loop](js-event-loop/) | `fetch().then()` from process creation through Chromium's `RendererMain`, `MessagePumpDefault::Run`, the kernel wait, V8's promise builtins and the microtask queue | [js-event-loop/index.html](js-event-loop/index.html) |

## How to view

Each simulation is a single self-contained HTML file. Open it in a browser, or enable GitHub Pages for this repo (Settings → Pages → deploy from the `main` branch) and visit `https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/js-event-loop/`.

## Principles

- Trace from the root: start at the lowest layer that matters, end at the code I write.
- Show real code: excerpts come from the actual source (Chromium, V8, libuv, Linux, compilers, network stacks), trimmed and linked to the original.
- Make it steppable: every simulation can be walked through one step at a time.
