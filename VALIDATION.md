# Validation

Every simulator on this site is a **model**: our own simplified code. This file says what each model was checked against, how, on how many cases, and exactly what "matches" means. It is generated from the latest test run by `tools/make-validation.js`; the numbers below are copied from `validation/results/`, not typed by hand.

To rerun everything: `npm test` (setup in [TESTING.md](TESTING.md)). When a check fails, its failing inputs are saved in `validation/failures/<check>.json` so they can be replayed.

## Summary

| Check | Compared with | Cases | Result | Last run |
|---|---|---|---|---|
| [V8 bytecode model](#v8-bytecode-model) | V8 12.4.254.21-node.33 (Node 22.22.0) | 300 | ✅ 300 / 300 match | 2026-10-09 |
| [LR parser engine](#lr-parser-engine) | Dragon Book 2nd ed. Fig. 4.37 and 4.38; bison (GNU Bison) 3.8.2 | 11 | ✅ 11 / 11 match | 2026-10-09 |
| [Event-loop playground model](#event-loop-playground-model) | Node 22.22.0 (V8 12.4.254.21-node.33, libuv 1.51.0) | 18 | ✅ 18 / 18 match | 2026-10-09 |
| [DNS and TLS byte dissectors](#dns-and-tls-byte-dissectors) | scapy 2.8.0 (Python 3.13.16) | 18 | ✅ 18 / 18 match | 2026-10-09 |
| [CORS decision model](#cors-decision-model) | Chromium 141.0.7390.37 (Playwright 1.56.0) | 2,880 | ✅ 2,880 / 2,880 match | 2026-10-09 |
| [HTML parser model](#html-parser-model) | Chrome 141.0.7390.37 DOMParser | 8,929 | ✅ 8,929 / 8,929 match | 2026-10-09 |
| [Pages in a real browser](#pages-in-a-real-browser) | Chromium 141.0.7390.37 (Playwright 1.56.0), axe-core 4.13.0 | 14 | ✅ 14 / 14 match | 2026-10-09 |

## V8 bytecode model

- **Our code:** `v8-pipeline/v8-model.js`: scanner, precedence-climbing parser and Ignition bytecode generator for arithmetic expressions (page: [v8-pipeline](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/v8-pipeline/))
- **Reference:** V8 12.4.254.21-node.33 (Node 22.22.0)
- **Method:** Random expressions over the parameters `a`, `b`, `c` and number literals are compiled by real V8 (`node --print-bytecode`) and by the model.
- **What "match" means:** The bytecode listing is identical instruction for instruction: opcodes, register operands, feedback slot numbers, and `.Wide`/`.ExtraWide` prefixes. Tokens and syntax trees are not compared directly.
- **Not covered:** Statements, calls, objects, strings and comparisons; V8 versions other than the one named (bytecode changes between versions, so this check is skipped on other Node versions).
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 300 of 300.
- **Random batches:** 300 with seed 7. The same seeds always generate the same inputs.
- **Command:** `cd v8-pipeline && node verify/compare-with-node.js 300 7`

## LR parser engine

- **Our code:** `lr-parser/lr-engine.js`: FIRST/FOLLOW, LR(0) item sets, SLR(1) ACTION/GOTO table and the LR driver (page: [lr-parser](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/lr-parser/))
- **Reference:** Dragon Book 2nd ed. Fig. 4.37 and 4.38; bison (GNU Bison) 3.8.2
- **Method:** The expression grammar's table is compared cell by cell with the Dragon Book (2nd ed.) Fig. 4.37 and its parse of `id * id + id` move by move with Fig. 4.38; the conflicts the page teaches are checked; if GNU Bison is installed, its own conflict reports for the same grammars are checked too.
- **What "match" means:** Every ACTION and GOTO cell, every move, the FIRST and FOLLOW sets shown, and the presence or absence of conflicts.
- **Not covered:** LALR(1) and canonical LR(1) table construction (the page shows real Bison output for those), error recovery, precedence declarations.
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 11 of 11.

<details><summary>Individual checks</summary>

```
ok   expression grammar has 12 LR(0) states (I0..I11)
ok   expression grammar has no SLR conflicts
ok   every ACTION and GOTO cell matches Fig. 4.37
ok   moves for id * id + id match Fig. 4.38
ok   FIRST(E) = { (, id }
ok   FOLLOW(T) = { $, ), *, + }
ok   dangling else: exactly one shift/reduce conflict, on e
ok   S -> L = R | R: one SLR shift/reduce conflict on =
ok   ε-grammar parses ( ( ) ) ( )
ok   bison (GNU Bison) 3.8.2: dangling else gives 1 shift/reduce conflict
ok   bison (GNU Bison) 3.8.2: S -> L = R | R has no conflicts (LALR handles it)
```
</details>
- **Command:** `cd lr-parser && node verify/check-dragon-book.js`

## Event-loop playground model

- **Our code:** `js-event-loop/loop-model.js`: an interpreter for a JavaScript subset following the spec's promise jobs and task/microtask order (page: [js-event-loop](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/js-event-loop/))
- **Reference:** Node 22.22.0 (V8 12.4.254.21-node.33, libuv 1.51.0)
- **Method:** Hand-written programs (timers, `.then` chains, `async`/`await`, returning promises, `new Promise`) run in Node and in the model. In the browser, the playground also runs every program in the reader's own engine.
- **What "match" means:** The printed lines and their order are identical.
- **Not covered:** Rejections, `if`/loops, `process.nextTick`, timer clamping, rendering steps and real task priorities; the model reports these as outside its subset.
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 18 of 18.
- **Command:** `cd js-event-loop && node verify/compare-loop-with-node.js`

## DNS and TLS byte dissectors

- **Our code:** `fetch-to-the-wire/wire-model.js`: field-by-field dissectors for the captured DNS query and answer, ClientHello and ServerHello (page: [fetch-to-the-wire](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/fetch-to-the-wire/))
- **Reference:** scapy 2.8.0 (Python 3.13.16)
- **Method:** scapy, an independent packet library, parses the same captured bytes; fields are compared (IDs, names, types, TTL, address, cipher suites, SNI, groups, signature algorithms, ALPN, versions, key shares), plus the negotiated group and cipher Chrome logged.
- **What "match" means:** Each listed field has the same value in both parsers.
- **Not covered:** Field types that do not appear in these captures and decryption of the encrypted TLS records.
- **Latest run:** 2026-10-09 on Linux-6.18.44-fc-v80-x86_64-with-glibc2.39, Node undefined. Passed: 18 of 18.

<details><summary>Individual checks</summary>

```
ok   DNS transaction ID
ok   DNS question name
ok   DNS question type
ok   DNS reply carries same ID
ok   DNS answer TTL
ok   DNS answer address
ok   ClientHello cipher suite count
ok   ClientHello SNI
ok   ClientHello supported_groups
ok   ClientHello signature algorithm count
ok   ClientHello ALPN
ok   ClientHello supported_versions
ok   ClientHello key shares (group|bytes)
ok   ServerHello cipher suite
ok   ServerHello negotiated version
ok   ServerHello key share
ok   NetLog says the same group
ok   NetLog says the same cipher
```
</details>
- **Command:** `cd fetch-to-the-wire && python3 verify/check-dissectors.py`

## CORS decision model

- **Our code:** `fetch-to-the-wire/wire-model.js` `cors()`: the Fetch standard's CORS rules as Chrome applies them (page: [fetch-to-the-wire](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/fetch-to-the-wire/))
- **Reference:** Chromium 141.0.7390.37 (Playwright 1.56.0)
- **Method:** Every combination of method (3) × request headers (5) × credentials mode (2) × Allow-Origin (3) × Allow-Methods (4) × Allow-Headers (4) × Allow-Credentials (2) is fetched by real Chromium from a local server, each at its own URL so preflight caching cannot interfere.
- **What "match" means:** For every case: whether Chrome sent a preflight, and whether `fetch()` resolved or rejected. Error messages and response headers are not compared.
- **Not covered:** Non-2xx preflight status codes, redirects, the preflight cache, Private Network Access, `Access-Control-Expose-Headers`, and other browsers. Chrome lets `Access-Control-Allow-Headers: *` cover `Authorization` (the stricter spec rule sits behind a disabled feature flag); the model follows Chrome by default and the page shows the difference.
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 2,880 of 2,880. 659 fetches succeeded, 2112 preflights sent.
- **Command:** `cd fetch-to-the-wire && node verify/cors-matrix.js`

## HTML parser model

- **Our code:** `html-to-pixels/html-model.js`: the HTML standard's tokenizer and tree builder for the head and body insertion modes (page: [html-to-pixels](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/html-to-pixels/))
- **Reference:** Chrome 141.0.7390.37 DOMParser
- **Method:** Hand-picked tricky snippets plus random tag soup from four seeded batches are parsed by real Chrome's `DOMParser` and by the model; duplicates are removed before counting.
- **What "match" means:** The whole document tree is identical in html5lib test format: element names, attributes and their values, text, comments and the DOCTYPE. Parse errors are not compared.
- **Not covered:** Tables, forms, `select`, `template`, framesets, ruby, SVG and MathML (the model refuses these), the full named-entity table, and scripts that run during parsing.
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 8,929 of 8,929. 61 hand-picked + 9000 random (seeds 7, 2026, 99, 4242); 8929 distinct inputs after removing duplicates.
- **Random batches:** 1,000 with seed 7, 3,000 with seed 2026, 3,000 with seed 99, 2,000 with seed 4242, plus 61 hand-picked cases. The same seeds always generate the same inputs.
- **Command:** `cd html-to-pixels && node verify/compare-with-chrome.js 1000:7 3000:2026 3000:99 2000:4242`

## Pages in a real browser

- **Our code:** Every page of the site
- **Reference:** Chromium 141.0.7390.37 (Playwright 1.56.0), axe-core 4.13.0
- **Method:** Each page is loaded in real Chromium at 1300 px and 390 px wide. The check fails on script errors, failed requests, sideways scrolling, missing components, quizzes or exam answers that do not respond, stale asset hashes, and accessibility violations found by axe-core in light and dark mode.
- **What "match" means:** Zero problems on every page at both widths.
- **Not covered:** Real phones with touch input, screen-reader testing by people, and whether the explanations are clear.
- **Latest run:** 2026-10-09 on linux 6.18.44-fc-v80 x64, Node 22.22.0. Passed: 14 of 14. 7 pages × 2 widths; accessibility checked in light and dark mode against wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa.

<details><summary>Per page</summary>

| Page | Width | Problems | Accessibility violations |
|---|---|---|---|
| home | 1300 px | 0 | 0 |
| home | 390 px | 0 | 0 |
| fetch-to-the-wire | 1300 px | 0 | 0 |
| fetch-to-the-wire | 390 px | 0 | 0 |
| html-to-pixels | 1300 px | 0 | 0 |
| html-to-pixels | 390 px | 0 | 0 |
| js-event-loop | 1300 px | 0 | 0 |
| js-event-loop | 390 px | 0 | 0 |
| lr-parser | 1300 px | 0 | 0 |
| lr-parser | 390 px | 0 | 0 |
| threads-vs-event-loop | 1300 px | 0 | 0 |
| threads-vs-event-loop | 390 px | 0 | 0 |
| v8-pipeline | 1300 px | 0 | 0 |
| v8-pipeline | 390 px | 0 | 0 |
</details>
- **Command:** `node tools/check-pages.js   (add --live for the published site, --browser=firefox or webkit for other engines)`

## Development history

Before this report existed, the same checks were run by hand while each page was built: 746 expressions for the V8 model, and 7,183 HTML parser comparisons that included repeated inputs (the 61 hand-picked cases in every batch, and one batch run twice). Duplicates are now removed before counting, so the figures above are distinct inputs.
