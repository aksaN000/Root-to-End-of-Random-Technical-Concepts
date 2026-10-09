# From HTML bytes to pixels

Browser track, page 2 of 3. How Chrome turns the bytes of an HTML document into a DOM, and the DOM into pixels.

## What it covers

1. **The 60-second version**, with a diagram of which stages a `width`, `color` or `transform` change reruns.
2. **Bytes to tokens**: `HTMLDocumentParser::PumpTokenizer` (with its yield budget) and the tokenizer state machine in `HTMLTokenizer::NextTokenImpl`.
3. **Parser lab**: type any HTML and step through it token by token: tokenizer states, insertion mode, the stack of open elements, the active formatting elements, the rule that fired, and the DOM so far. "Check against this browser" compares the result with the browser's own `DOMParser`.
4. **Tokens to a DOM**: `ProcessStartTagForInBody`, implied tags, `<p>` closing, list items, reconstruction and the adoption agency (`CallTheAdoptionAgency`).
5. **The rendering lifecycle**: `document_lifecycle.h`, `ScheduleLayoutTreeUpdate`, and the phase order in `LocalFrameView`.
6. **Cost lab**: real trace events for seven changes (first load, color, width, transform, append, write-read × 20, writes then one read).
7. **Forced synchronous layout**: `offsetHeightForBinding` → `UpdateStyleAndLayout`, and 20 Layout events versus 1.
8. **Paint and composite**: layers, `RasterTask` on worker threads, and why the transform change had no Layout, Paint or RasterTask.
9. Quizzes, tools and exercises, exam-style questions, and a reading list.

## Verification

- `node verify/compare-with-chrome.js 1000:7 3000:2026 3000:99 2000:4242` parses 61 hand-picked and 9,000 random snippets with `html-model.js` and with real Chrome's `DOMParser`, removes duplicates, and compares the trees in html5lib format: 8,929/8,929 distinct inputs identical. Latest numbers: [VALIDATION.md](../VALIDATION.md).
- For the traced test page (450 bytes), the model's tokenizer emits 46 tokens; Chrome's `ParseHTML` trace event recorded `parsed_tokens: 46`, `parsed_bytes: 450`.

The model covers the head and body insertion modes. Tables, forms, `select`, `template`, framesets, ruby and SVG/MathML have their own insertion modes; the lab says so instead of guessing.

## The capture

`data/` holds the test page, the Playwright script that recorded the traces (`trace.js`), the raw traces (`trace-*.json`, which open in DevTools' Performance panel or Perfetto), and `pipeline.json`, the curated events the page uses.

## Sources

Blink source (BSD-style license), fetched October 2026, quoted for study.
