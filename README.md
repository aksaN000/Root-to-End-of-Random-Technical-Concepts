# Root to End of Random Technical Concepts

Interactive simulations I build while learning computer science, each one tracing a concept from its root to the end: from the OS, compiler or protocol layer up to the code I actually write, using the real source code of the systems involved.

## Simulations

| Topic | What it traces | Open |
|---|---|---|
| [JavaScript event loop](js-event-loop/) | `fetch().then()` from process creation through Chromium's `RendererMain`, `MessagePumpDefault::Run`, the kernel wait, V8's promise builtins and the microtask queue, plus a playground that steps through our own async code and checks itself against the real engine | [js-event-loop/index.html](js-event-loop/index.html) |
| [How V8 runs our JavaScript](v8-pipeline/) | One expression through V8's scanner, precedence-climbing parser, bytecode generator and Ignition interpreter, then hidden classes, inline caches, tiering and deoptimization. The bytecode model is verified against Node's V8 (`v8-pipeline/verify/`) | [v8-pipeline/index.html](v8-pipeline/index.html) |
| [LR parser we can step through](lr-parser/) | Any grammar → FIRST/FOLLOW → LR(0) item sets → SLR table → step-by-step parse with a growing tree, then real GNU Bison: `yyparse`, default reductions, the dangling-else conflict, and why LALR beats SLR | [lr-parser/index.html](lr-parser/index.html) |
| [Threads vs event loop](threads-vs-event-loop/) | Multi-threading vs event-driven concurrency from the kernel's `schedule()` through glibc `clone` flags, `context_switch`, futex mutexes and `epoll`, with a race stepper and a one-core timeline simulator (CSE321 Assignment 01 companion) | [threads-vs-event-loop/index.html](threads-vs-event-loop/index.html) |

## How to view

Each simulation is a static HTML page with a few shared files in `assets/`. Open it in a browser, or visit the live site: https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/ (each simulation lives at its folder path, e.g. `/js-event-loop/`).

## Principles

- Trace from the root: start at the lowest layer that matters, end at the code I write.
- Show real code: excerpts come from the actual source (Chromium, V8, libuv, Linux, compilers, network stacks), trimmed and linked to the original.
- Make it steppable: every simulation can be walked through one step at a time.
- Read deeper, then test: numbered markers open curated reading (start here / go deeper / primary sources) right in the text, and each page ends with predict-first quizzes. The shared catalog lives in `assets/reading.js`.
