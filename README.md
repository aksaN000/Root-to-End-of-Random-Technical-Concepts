# Root to End of Random Technical Concepts

[![checks](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/actions/workflows/checks.yml/badge.svg)](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/actions/workflows/checks.yml)

Interactive simulations I build while learning computer science, each one tracing a concept from its root to the end: from the OS, compiler or protocol layer up to the code I actually write, using the real source code of the systems involved.

## Simulations

| Topic | What it traces | Open |
|---|---|---|
| [JavaScript event loop](js-event-loop/) | `fetch().then()` from process creation through Chromium's `RendererMain`, `MessagePumpDefault::Run`, the kernel wait, V8's promise builtins and the microtask queue, plus a playground that steps through our own async code and checks itself against the real engine | [js-event-loop/index.html](js-event-loop/index.html) |
| [How V8 runs our JavaScript](v8-pipeline/) | One expression through V8's scanner, precedence-climbing parser, bytecode generator and Ignition interpreter, then hidden classes, inline caches, tiering and deoptimization. The bytecode model is verified against Node's V8 (`v8-pipeline/verify/`) | [v8-pipeline/index.html](v8-pipeline/index.html) |
| [LR parser we can step through](lr-parser/) | Any grammar → FIRST/FOLLOW → LR(0) item sets → SLR table → step-by-step parse with a growing tree, then real GNU Bison: `yyparse`, default reductions, the dangling-else conflict, and why LALR beats SLR | [lr-parser/index.html](lr-parser/index.html) |
| [What fetch() really sends](fetch-to-the-wire/) | Browser track 1/3: one `fetch()` through real Chromium (Blink, network service, DNS, TCP, post-quantum TLS 1.3, HTTP/1.1, CORS), with captured bytes, a NetLog replay, and a CORS model that matches Chrome on 2,880 cases (`fetch-to-the-wire/verify/`) | [fetch-to-the-wire/index.html](fetch-to-the-wire/index.html) |
| [From HTML bytes to pixels](html-to-pixels/) | Browser track 2/3: Blink's tokenizer and tree builder stepped on any HTML (model matches Chrome on 8,929 distinct inputs, `html-to-pixels/verify/`), then real traces of style, layout, paint and compositing for color, width, transform and forced-layout changes | [html-to-pixels/index.html](html-to-pixels/index.html) |
| [From a click to our listener](click-to-listener/) | Browser track 3/3: one mouse press from the USB report and the kernel's `input_event` through Chrome's browser process, compositor and main thread, hit testing (model matches Chrome's `elementFromPoint` at 40,320 points) and DOM dispatch (model matches Chrome on 1,609 programs, including where microtasks run), with a real trace of the whole trip | [click-to-listener/index.html](click-to-listener/index.html) |
| [Threads vs event loop](threads-vs-event-loop/) | Multi-threading vs event-driven concurrency from the kernel's `schedule()` through glibc `clone` flags, `context_switch`, futex mutexes and `epoll`, with a race stepper and a one-core timeline simulator (CSE321 Assignment 01 companion) | [threads-vs-event-loop/index.html](threads-vs-event-loop/index.html) |

## Roadmap

Planned, roughly in order. New topics come at our own pace; [suggest one](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=topic.yml).

1. **`hello.c` to `main`.** Compiler, linker, the ELF file, `execve`, the dynamic loader and `_start`.
2. **`malloc` to a page fault.** glibc's allocator, `brk` and `mmap`, page tables and the kernel's fault handler.
3. **Containers.** Namespaces, cgroups and what `docker run` actually asks the kernel for.
4. **Autograd.** A computation graph and backpropagation, from the chain rule to a real framework's source.

## How to view

Each simulation is a static HTML page with a few shared files in `assets/`. Open it in a browser, or visit the live site: https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/ (each simulation lives at its folder path, e.g. `/js-event-loop/`).

## Principles

- Trace from the root: start at the lowest layer that matters, end at the code I write.
- Show real code: excerpts come from the actual source (Chromium, V8, libuv, Linux, compilers, network stacks), trimmed and linked to the original.
- Make it steppable: every simulation can be walked through one step at a time.
- Read deeper, then test: numbered markers open curated reading (start here / go deeper / primary sources) right in the text, and each page ends with predict-first quizzes. The shared catalog lives in `assets/reading.js`.

## Every page has

- A **60-second version** at the top, then the full trace from the real source.
- An **interactive lab or simulator**, checked against the real system (`<folder>/verify/`).
- **Reading markers** in the text, **quizzes**, **exam-style questions** with model answers, and a reading list.
- A **"Tell us" link** on every section to report a mistake or something unclear.

## Check our claims

Every simulator is verified against the real system it models (Node's V8, Chrome's HTML parser, real Chromium's CORS decisions, the Dragon Book, GNU Bison, scapy). To rerun all of it:

```bash
npm install && npx playwright install chromium && pip install scapy cryptography
npm test
```

[VALIDATION.md](VALIDATION.md) is generated from the latest run: for each simulator, what it was compared with, on how many cases, what "match" means, and what it does not cover. [TESTING.md](TESTING.md) explains each check, how to test in your own browser with no install, and how to recapture the raw data.

How pages are written and built is in [STYLE.md](STYLE.md); how to help is in [CONTRIBUTING.md](CONTRIBUTING.md). Found a mistake? [Report it](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=mistake.yml). Want a topic? [Suggest it](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=topic.yml).
