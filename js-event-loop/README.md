# From the power button to `.then()`

A root-to-end trace of one `fetch().then()` call in a React app running in Chrome.

## What it covers

1. **The OS gives Chrome a process**: `fork()`/`execvp()` in `base/process/launch_posix.cc`.
2. **Chrome's processes and threads**: which OS thread (`CrRendererMain`) runs our JavaScript.
3. **Launching a renderer**: `wWinMain` → `ContentMain` → `RunOtherNamedProcessTypeMain` → `RendererMain`.
4. **The line that starts the event loop**: `run_loop.Run()` in `content/renderer/renderer_main.cc`.
5. **Inside the loop**: the `for (;;)` in `MessagePumpDefault::Run` and task selection in `DoWorkImpl`.
6. **How the loop sleeps**: `WaitForSingleObject` / condition variables, and `ScheduleWork` → `Signal`.
7. **The IO thread**: `Chrome_ChildIOThread` and the full wake chain for a network reply.
8. **V8**: `PromisePrototypeThen`, `PerformPromiseThenImpl`, `FulfillPromise`, and the microtask ring buffer.
9. **Step-through simulator**: JS stack, C++ stack, task queue, microtask queue and promise states side by side.
10. **React**, **Node.js / libuv contrast**, and **exercises** to verify everything on our own machine.
11. **Predict-first quizzes** and a **reading list**. Numbered markers in the text open the relevant reading in place.

## Sources

Chromium, V8, Node.js and libuv source, fetched October 2026. Excerpts are used under their BSD and MIT licenses; links to each original file are at the bottom of the page.
