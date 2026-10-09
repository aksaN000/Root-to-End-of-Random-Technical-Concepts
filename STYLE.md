# Root to End: house style

This is how every page in this repo is written and built. It is a living document: when we try something new and keep it, it goes in here, and older pages are brought up to date. The changelog at the bottom records each change.

## Who we write for

A CS undergraduate or graduate who already knows the basics (processes, compilers, data structures) and wants to see how a concept *actually* works, all the way down. Pages also have to work for a student revising the night before an exam, which is why each one opens with a 60-second version.

## Page anatomy (in this order)

1. **Hero**: back link "← Root to End", eyebrow (course or scope, and what it was checked against), a short H1, a lede that says where this page picks up from another page, a muted line about where the excerpts come from.
2. **The 60-second version** (`<aside class="tldr">`): 3 to 4 numbered points, one small inline SVG diagram with a caption, and a line linking into the deep sections. A student who reads only this should still get the core rule right.
3. **Frames**: numbered sections ("Frame 0 · the root", "Frame 1 · …"), ordered from the lowest layer up to our code. Each frame has a short prose block, real source excerpts, and a callout with the one thing to remember.
4. **Interactive lab or simulator**: at least one thing we can type into or step through. One input drives every artifact below it where possible.
5. **Real output**: captured from the real tool (Node, Bison, gcc, strace, …) and marked as real.
6. **Try it ourselves**: predict-first quizzes, then commands to run on our own machine, then exercises.
7. **Exam practice** (`#exam`): about 5 exam-style questions with marks, hidden model answers, a marking guide, and self-marking.
8. **Reading list** (`#reading`): filled automatically from the footnotes.
9. **Sources**: links to every original file excerpted.

The left rail lists the frames as a call stack (bottom = root layer). The mobile table of contents mirrors it.

## Real code, not paraphrase

- Excerpts come from the current upstream source, trimmed with `// …` and never edited otherwise. Key lines are prefixed with `»` in the source block so they are highlighted.
- Every excerpt names its file path and links to the original in the Sources section.
- Licences: quote for study, credit the project, keep notices (for example GPL and the Bison exception).

## Verification

- A simulator or model must be checked against the real system, and the page says how. Examples: the V8 bytecode model against `node --print-bytecode` (300 seeded expressions per run), the LR engine against the Dragon Book tables, the event-loop playground against real V8 in a Web Worker and against Node (`verify/` scripts).
- Exam model answers are produced or checked with the page's engine or the real tool where possible.
- Each folder that has a model keeps its check script in `<folder>/verify/`. The script reports through `tools/report.js` (latest numbers in `validation/results/`, failing inputs in `validation/failures/`), and `tools/make-validation.js` turns those into `VALIDATION.md`. Numbers on a page must match `VALIDATION.md`: count distinct inputs, never repeats.
- Random checks use fixed seeds, so every run (and CI) tests the same inputs and a failure can be replayed.
- **Label what kind of evidence each thing is.** Code figures get a badge from the kit: *Observed* (`figure.src.real`, captured from the real system), *Source* (upstream code, the default), *Our example* (`data-kind="example"`). Each lab starts with a scope box, `<div class="scope" data-kind="model|observed|illustration">` with three paragraphs: **What it is.** **Checked against.** **Not covered.** Use *model* only when a verify script checks it; otherwise it is an *illustration*.
- **Capture real data when we can run the system.** Run the real thing locally (a real browser, compiler or kernel tool), record its own logs and bytes, and keep the scripts that reproduce the capture in `<folder>/data/`. Say on the page how it was captured and how the lab differs from the real world (for example a self-signed certificate, or a server on the same machine so round trips cost nothing).
- **When the model and the real system disagree, find out why in the source and teach it.** Do not tune the model until the numbers match. Example: the CORS lab disagreed with Chrome on 40 of 2,880 cases, and the reason was a Chrome feature flag that leaves a spec rule unshipped; the page now teaches the difference.
- Before publishing captured data, check it for local paths, tokens, proxy settings or anything else private.
- **When the real system is the reader's browser, let the page check itself live.** Example: the parser lab's "Check against this browser" button parses the same text with the browser's own `DOMParser` and compares trees, so every reader re-runs the verification on their own machine.
- **Cross-check a model against a number the real system reports.** Example: the tokenizer model's 46 tokens for the traced page against Chrome's own `parsed_tokens: 46`.

## Reading material

- Every reference lives once in `assets/reading.js` as `{t, a, w, why, lvl, url}`. `lvl` is `start`, `deep` or `source`. `w` says exactly what to read (chapter, section, pages). URLs must be checked before adding.
- In text: `<a class="rd" data-r="id1,id2"></a>` after the sentence it supports.
- At the end of a section: `data-deeper="ids"` on the `<section>`.
- The page's `#reading-list` is generated; never hand-write it.

## Practice

- **Quizzes**: `<div class="quiz"><script type="application/json">{q, options, answer, explain}</script></div>`. Four options, one correct, plausible wrong answers, an explanation that names the mechanism.
- **Exam questions**: `<div class="exq" data-marks="5" data-kind="Trace"><div class="q">…</div><div class="a">…<p class="rub">Marking: …</p></div></div>`. Kinds: Trace, Explain, Compare, Calculate, Construct, Parse, Generate, Rewrite, Schedule, Short note. We do not copy real exam papers.

## Tracks

Related pages form a **track** that follows one interaction or one pipeline, each page picking up where the previous one stops (for example the Browser track: `fetch()` → HTML to pixels → a click to our listener). The hero eyebrow says "<Track> track · n of N", the landing page lists the track with live, next and planned pages, and each page links to its neighbours. Plain API syntax that MDN already teaches well is linked from the reading list, not repeated; our pages explain the mechanism underneath.

## Visual system

- Fonts: Chivo (display), IBM Plex Sans (body), JetBrains Mono (code), from Google Fonts.
- Colour tokens on `:root` with a dark theme under `prefers-color-scheme` and `[data-theme]`: `--bg --surface --code --ink --muted --rule --accent --accent-soft --trace --trace-bg --ok --ok-bg --bad --bad-bg`, plus page-specific pairs (for example `--sh`/`--re` for shift and reduce).
- Accent (blue) means "where we are / our code". Trace (amber) means "the key line / the root". Green means done or correct, red means conflict or wrong.
- Diagrams are inline SVG using the `.tl-box`, `.tl-t`, `.tl-a` classes so they work in both themes. Each shape also carries plain fallback attributes (`fill`, `stroke`, `font-size`, and `width`/`height` on the `<svg>`), so a diagram stays readable even if the stylesheet fails to load.
- Every page works at 390 px wide with no sideways scrolling; long code wraps or scrolls inside its own box.
- Motion is small and respects `prefers-reduced-motion` (the kit also stops all animation for readers who ask for reduced motion).
- Accessibility: WCAG 2.2 AA, checked by axe-core in light and dark mode on every run. Text, including code comments, needs 4.5:1 contrast on its own background; show "off" or "skipped" states with dashes or strikethrough, not by fading text with `opacity`. Every control is a real `<button>`, link or input with a visible focus ring. Anything that scrolls is focusable (the kit adds `tabindex="0"` and a label from the figure caption). Lab parts that are not buttons get keys of their own, for example arrow keys in the byte dissector.

## Shared kit

`assets/root-kit.css` and `assets/root-kit.js` provide footnotes, go-deeper strips, the reading list, quizzes, exam questions with self-marking, "report a mistake" links on every section, the page footer, the reading progress bar, evidence labels and scope boxes, and keyboard access to scrolling boxes. Load order: `root-kit.css` in the head, `reading.js` before the page script, `root-kit.js` last.

## Getting found and getting feedback

- Head: a descriptive `<title>` ending in "| Root to End", a meta description of about 160 characters, a canonical URL, Open Graph and Twitter tags, a 1200×630 preview in `assets/og/<slug>.png`, and JSON-LD (`LearningResource`).
- Add each page to `sitemap.xml`, the landing page (card with reading time and prerequisites, the topic map, and a "Where to start" path if it opens a new one), and the root README table. Reading time is the rendered prose at 200 words a minute, rounded to 5 minutes.
- Every section has a "Something wrong or unclear in this section?" link to a prefilled GitHub issue; templates live in `.github/ISSUE_TEMPLATE/`.

## Before publishing a page

0. Add the page's verify scripts to `tools/run-all-checks.js` (`tools/check-pages.js` finds every page by itself). Run `npm test`; everything must PASS (SKIP is only for missing tools, with a reason).
0. Run `python3 tools/stamp-assets.py`. It adds a content hash (`?v=1a2b3c4d`) to every local CSS and JS link. GitHub Pages lets browsers cache files for 10 minutes, so without it a browser can pair a new page with an old stylesheet.
1. Look at it: screenshots at 1300 px and 390 px, light and dark. Then put the mouse away and Tab through the whole page; every stop must show a focus ring and every lab must work from the keyboard.
2. Commit `validation/results/` and the regenerated `VALIDATION.md` with the page. CI (`.github/workflows/checks.yml`) reruns everything on each push and nightly.
3. Commit as `aksaN000 <aksangoni.alif@gmail.com>`, with no co-author or tool attribution lines, push, and check the live URL.

## Changelog

- **2026-10-09**: Evidence labels (Observed, Source, Our example, Model, Illustration) and a scope box on every lab. `VALIDATION.md` generated from each run, with failing inputs kept for replay. Accessibility pass: contrast fixed in both themes, scrolling boxes focusable, keyboard bytes in the dissector, axe-core in every page check. CI on every push and nightly. Landing page: a live demo, three starting points, reading times and prerequisites. `CONTRIBUTING.md`.

- **2026-10-09**: One command for all checks (`npm test` → `tools/run-all-checks.js`), a page checker for local, live and other browsers (`tools/check-pages.js`), a Dragon Book and Bison check for the LR page, and `TESTING.md`.
- **2026-10-09**: Browser track page 2 (`html-to-pixels`). New rules: live in-browser checks, and cross-checking against numbers the real system reports.
- **2026-10-09**: Added the Browser track and its first page (`fetch-to-the-wire`). New rules: real captures with reproducible scripts in `data/`, teach model-versus-reality differences found in the source, tracks. Inline code in the lede, 60-second box and exam questions now wraps on phones.
- **2026-10-09**: Versioned asset links (`tools/stamp-assets.py`) and fallback attributes on diagrams, after a cached old stylesheet made the new diagrams render as large black shapes.
- **2026-10-09**: Added the 60-second version, exam practice with self-marking, per-section mistake reports, issue templates, SEO metadata, preview images and the sitemap. Wrote this guide.
- **2026-10-09**: Added the event-loop playground (model plus real-engine check).
- **2026-10-09**: Added reading footnotes, go-deeper strips, reading lists, quizzes and the progress bar to every page. Replaced the § sign with "Section".
- **2026-10-08**: Switched page text to "we/our".
