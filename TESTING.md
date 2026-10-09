# Testing Root to End

Every page makes claims about real systems: what V8 emits, what Chrome parses, how CORS decides. This guide shows how anyone can check those claims, from a five-minute look in a browser to rerunning every verification and recapturing the raw data.

## 1. No install: test it in your browser (5 minutes)

Open the site: https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/

Three pages check themselves against **your** browser while you use them:

| Page | What to do | What it proves |
|---|---|---|
| [Event loop](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/js-event-loop/#playground) | Write any code in the playground (or pick an example) and wait a second | The bar under the playground runs the same code in a Web Worker with your browser's real JavaScript engine and says whether the output matches the model |
| [HTML to pixels](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/html-to-pixels/#lab) | Type any HTML in the parser lab and press **Check against this browser** | Your browser's own HTML parser builds the tree, and the page compares it with the model's tree |
| [Click to listener](https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/click-to-listener/#hitlab) | Click the hit-test stage; in the dispatch lab press **Check in this browser** and, for a "by user" program, click the dashed box | Your browser's `elementFromPoint` and your browser's real event dispatch, compared with the models |

Try to break them. Odd inputs are the most useful: misnested tags, unusual entities, chains of `await`.

A quick checklist for any page:

- [ ] The 60-second version and its diagram look right (in light and dark mode).
- [ ] Each lab responds: step forward and back, try the presets, type your own input.
- [ ] Quizzes show an explanation after you answer; exam questions open their model answers.
- [ ] The numbered reading markers open, and the links work.
- [ ] On a phone, nothing scrolls sideways and everything can be tapped.
- [ ] Anything wrong or unclear? Use the **"Tell us"** link at the end of that section. It opens a GitHub issue that already names the page and section.

The most valuable help right now: **Firefox, Safari, and real phones.** All automated tests run in Chromium.

## 2. Run every check (about a minute)

Requirements:

- [Git](https://git-scm.com/) and [Node.js 22](https://nodejs.org/). The V8 bytecode check needs Node 22 exactly, because bytecode differs between V8 versions; with another version that one check is skipped.
- Python 3 with scapy for the packet dissector check: `pip install scapy cryptography` (scapy needs cryptography to read TLS)
- PyTorch (CPU build) for the autograd check: `pip install torch --index-url https://download.pytorch.org/whl/cpu`
- Optional: [GNU Bison](https://www.gnu.org/software/bison/) for two extra LR checks.

```bash
git clone https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts.git
cd Root-to-End-of-Random-Technical-Concepts
npm install                          # installs Playwright and axe-core (pinned versions)
npx playwright install chromium      # downloads the browser Playwright drives
pip install scapy cryptography
pip install torch --index-url https://download.pytorch.org/whl/cpu
npm test
```

On Windows, run the same commands in PowerShell or WSL. Anything that cannot run on your machine is reported as **SKIP** with the reason, never silently ignored.

Expected summary:

```
PASS V8 bytecode model vs this Node's V8
PASS LR engine vs Dragon Book tables (and Bison if installed)
PASS Event-loop playground vs Node
PASS DNS/TLS byte dissectors vs scapy
PASS CORS model vs real Chromium (2,880 cases)
PASS HTML parser model vs real Chrome
PASS Event-dispatch model vs real Chromium (real clicks and script dispatches)
PASS Hit-test model vs Chromium's elementFromPoint
PASS Autograd engine vs real PyTorch (graph, order, gradients)
PASS Every page loads cleanly (desktop and phone width)

10 passed, 0 failed, 0 skipped
```

Other commands:

| Command | What it does |
|---|---|
| `npm run test:quick` | Same checks with fewer random cases (does not overwrite the saved results) |
| `node tools/run-all-checks.js --only=cors,html` | Some checks only (ids: `v8 lr loop packets cors html dispatch hit autograd pages`) |
| `npm run test:pages` | Only the page checks, on your local copy |
| `npm run test:live` | The page checks against the published site |
| `node tools/check-pages.js --browser=firefox` | The page checks in Firefox (run `npx playwright install firefox` first; `webkit` works the same way) |

### What each check compares

| Check | Our code | Compared with | Script |
|---|---|---|---|
| V8 bytecode | `v8-pipeline/v8-model.js` | `node --print-bytecode` on random expressions, byte for byte | `v8-pipeline/verify/compare-with-node.js [count] [seed]` |
| LR parsing | `lr-parser/lr-engine.js` | Dragon Book 2nd ed. Fig. 4.37 (every table cell) and Fig. 4.38 (every move); GNU Bison's conflict reports | `lr-parser/verify/check-dragon-book.js` |
| Event loop | `js-event-loop/loop-model.js` | Node running the same programs | `js-event-loop/verify/compare-loop-with-node.js` |
| Packet dissectors | `fetch-to-the-wire/wire-model.js` | scapy parsing the same captured DNS and TLS bytes | `fetch-to-the-wire/verify/check-dissectors.py` |
| CORS | `fetch-to-the-wire/wire-model.js` | Real Chromium: 2,880 combinations of request and server policy, recording whether a preflight was sent and whether `fetch()` succeeded | `fetch-to-the-wire/verify/cors-matrix.js` |
| HTML parsing | `html-to-pixels/html-model.js` | Real Chrome's `DOMParser` on hand-picked and random HTML (four seeded batches, duplicates removed), compared tree by tree | `html-to-pixels/verify/compare-with-chrome.js [count] [seed]` or `[count:seed …]` |
| Event dispatch | `click-to-listener/dispatch-model.js` | Real Chromium with real listeners on the lab presets and 1,600 seeded random programs; half are clicked for real through the browser's input path, half dispatched from script. Listener order, phases, microtask placement and `defaultPrevented` | `click-to-listener/verify/compare-dispatch.js [count] [seed]` |
| Hit testing | `click-to-listener/hit-model.js` | `document.elementFromPoint` at 40 points in each of 1,008 scenes | `click-to-listener/verify/compare-hit-test.js [count] [seed]` |
| Autograd | `autograd/autograd-model.js` | Real PyTorch on the lab presets and 2,000 seeded random programs: the graph from `grad_fn.next_functions`, the order of sequence numbers, the execution order from pre-hooks on every node, and float64 gradients | `autograd/verify/compare-with-pytorch.py [count] [seed]` |
| Pages | every `index.html` | Real Chromium at 1300 px and 390 px: script errors, failed requests, sideways scrolling, every quiz and exam question clicked, asset version hashes, and axe-core (WCAG 2.2 A/AA) in light and dark mode | `tools/check-pages.js [--live] [--browser=…]` |

### Results and failures

A full `npm test` writes each check's latest numbers to `validation/results/<check>.json` and rebuilds [VALIDATION.md](VALIDATION.md) from them, so the report always shows the last real run. When a check fails, its failing inputs are saved in `validation/failures/<check>.json`; rerun that check with the same count and seed to reproduce them.

### Continuous integration

`.github/workflows/checks.yml` runs on every push, every pull request and every night: a fast job (V8, LR with Bison, event loop, scapy, autograd against PyTorch) and a browser job (CORS, HTML parser, event dispatch, hit testing, pages). Versions are pinned (Node 22.22.0, Playwright 1.56.0, axe-core 4.13.0, scapy 2.8.0 with cryptography 50.0.1, PyTorch 2.14.1 CPU) and random checks use fixed seeds. If a job fails, `validation/` is attached to the run as an artifact.

Random checks take a count and a seed, so a failure can be reproduced exactly, for example `node verify/compare-with-chrome.js 5000 123` inside `html-to-pixels/`.

## 3. Recapture the raw data

Captured data lives in each page's `data/` folder, together with the script that produced it.

- **HTML to pixels traces**: `cd html-to-pixels/data && node trace.js`. This loads `page.html` in headless Chromium, applies the seven changes, and writes `trace-*.json`. It overwrites the committed traces; timings will differ slightly, but the stage counts (for example 20 Layout events versus 1) should not. Open a trace in DevTools → Performance → Load profile, or in [Perfetto](https://ui.perfetto.dev/).
- **fetch() capture**: needs Linux and root, because it runs a DNS server on port 53 and a TLS server on port 443. Start `node servers.js` in `fetch-to-the-wire/data/`, point `/etc/resolv.conf` at `127.0.0.1`, run `node run.js`, then restore `/etc/resolv.conf`. It writes a new `netlog.json` (open it in the [NetLog viewer](https://netlog-viewer.appspot.com/)) and `capture.json` with the raw bytes. Key exchange and GREASE values are random per connection, so bytes will differ; structure and sizes should match.
- **Bison outputs on the LR page** came from GNU Bison 3.8.2; `bison -v -Wcounterexamples` on the grammars shown reproduces them.

## 4. If something fails

1. Rerun that one script on its own. Most take a count and a seed, so the failing case can be reproduced.
2. Check versions: Node (`node -v`), Chrome (printed by the script), Python and scapy.
3. Open an issue with the command, its output and your versions: https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=mistake.yml

A mismatch is not necessarily a bug in our code. When the CORS check disagreed with Chrome on 40 cases, the cause was a Chrome feature flag that leaves a spec rule unshipped, and the page now teaches that difference.

## 5. What these checks do not cover

- Browsers other than Chromium (help wanted; see the commands above).
- Screen readers used by people. axe-core finds missing labels and low contrast, not whether a lab makes sense when heard.
- Real phones and touch input; the 390 px check is a desktop browser made narrow.
- Whether the explanations are clear. Only readers can test that. Please use the "Tell us" links.
- Static source excerpts drift as upstream code changes; each page says when its excerpts were fetched.
