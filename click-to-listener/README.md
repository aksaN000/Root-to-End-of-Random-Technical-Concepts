# From a click to our listener

Browser track, page 3 of 3. One press of a mouse button, from the USB report to our `addEventListener` callback and the microtasks after it.

## What it covers

1. **The 60-second version**, with a diagram of the four stops and the capture-target-bubble path.
2. **The mouse and the kernel**: `usb_mouse_irq` reading the button bit, `struct input_event` (EV_KEY, BTN_LEFT, 1), and Chrome's evdev converter on ChromeOS.
3. **The browser process**: `RenderWidgetHostViewEventHandler::OnMouseEvent`, routing between renderers (`FindViewAtLocation`), `ForwardMouseEvent`, and the blocking Mojo `DispatchEvent` that waits for an acknowledgement.
4. **Compositor, then main thread**: `MainThreadEventQueue::IsRafAlignedEvent` (moves wait for a frame, presses do not) and `WidgetBaseInputHandler::HandleInputEvent`.
5. **Hit testing**: `EventHandler::PerformHitTest` and the reverse painting order in `PaintLayer::HitTestLayer`.
6. **Hit-test lab**: type positioned boxes with `z-index`, `pointer-events`, `visibility` and `overflow: hidden`, click the stage, and compare the model's answer with the browser's `elementFromPoint`.
7. **Which events**: pointerdown and mousedown, then pointerup, mouseup and click, and why the click goes to the common ancestor (`DispatchMouseClickIfNeeded`).
8. **Event dispatch**: `DispatchEventAtCapturing`, `DispatchEventAtBubbling` and `FireEventListeners` (snapshots, once, passive, stopping).
9. **Dispatch lab**: a small language for a tree, listeners and one dispatch; the page shows what runs and why, and "Check in this browser" runs it with real listeners (user programs are clicked for real).
10. **Into our listener**: `V8ScriptRunner::CallFunction`, `V8RunMicrotasksScope`, and V8's `ShouldPerformCheckpoint`, with real logs of a user click and `btn.click()`.
11. **The whole trip**: real trace events from the browser process to the listener calls.
12. Quizzes, tools and exercises, exam-style questions, and a reading list.

## Verification

- `node verify/compare-dispatch.js` runs the 10 lab presets and 1,600 seeded random programs (four batches) through `dispatch-model.js` and through real Chromium with real listeners. "By user" programs are clicked with Playwright's mouse, which enters Chrome at the browser process like a real click. Listener order, phases, microtask placement and `defaultPrevented` matched on 1,609/1,609 distinct programs.
- `node verify/compare-hit-test.js` draws the 8 presets and 1,000 seeded random scenes exactly as the lab does and compares `hit-model.js` with `document.elementFromPoint` at 40 points each: 40,320/40,320 identical.
- Latest numbers: [VALIDATION.md](../VALIDATION.md).

## The capture

`data/` holds the test page, `capture.js` (Playwright: a traced real click, `btn.click()` from script, and a press on one element released on another), the raw `trace.json` (opens in DevTools' Performance panel or Perfetto), `order.json` with the listener logs, `flow.js`, which filters the trace into `flow.json`, and `make-page-data.js`, which bundles both into `click-data.js` for the page.

## Sources

Chromium and V8 source (BSD-style licenses) and Linux source (GPL-2.0), fetched October 2026, quoted for study.
