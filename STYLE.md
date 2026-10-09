# Root to End: house style

This is how every page in this repo is written and built. It is a living document: when we try something new and keep it, it goes in here, and older pages are brought up to date. The changelog at the bottom records each change.

## Who we write for

A CS undergraduate or graduate who already knows the basics (processes, compilers, data structures) and wants to see how a concept *actually* works, all the way down. Pages also have to work for a student revising the night before an exam, which is why each one opens with a 60-second version.

## Voice

- First person plural: **we, our, us**. "Our callback", "we step through it". Never "you/your" in page text. (The landing page intro is the author's own voice, "I build…".)
- Plain, direct sentences. Define a term the first time we use it.
- No hype words, no filler. Say what the code does.
- Section references are written as words: "Section 4.1", "Sections 5 to 7". No § sign.
- Precise about what is verified and what is a model.

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

- A simulator or model must be checked against the real system, and the page says how. Examples: the V8 bytecode model against `node --print-bytecode` (746 expressions), the LR engine against the Dragon Book tables, the event-loop playground against real V8 in a Web Worker and against Node (`verify/` scripts).
- Exam model answers are produced or checked with the page's engine or the real tool where possible.
- Each folder that has a model keeps its check script in `<folder>/verify/`.

## Reading material

- Every reference lives once in `assets/reading.js` as `{t, a, w, why, lvl, url}`. `lvl` is `start`, `deep` or `source`. `w` says exactly what to read (chapter, section, pages). URLs must be checked before adding.
- In text: `<a class="rd" data-r="id1,id2"></a>` after the sentence it supports.
- At the end of a section: `data-deeper="ids"` on the `<section>`.
- The page's `#reading-list` is generated; never hand-write it.

## Practice

- **Quizzes**: `<div class="quiz"><script type="application/json">{q, options, answer, explain}</script></div>`. Four options, one correct, plausible wrong answers, an explanation that names the mechanism.
- **Exam questions**: `<div class="exq" data-marks="5" data-kind="Trace"><div class="q">…</div><div class="a">…<p class="rub">Marking: …</p></div></div>`. Kinds: Trace, Explain, Compare, Calculate, Construct, Parse, Generate, Rewrite, Schedule, Short note. We do not copy real exam papers.

## Visual system

- Fonts: Chivo (display), IBM Plex Sans (body), JetBrains Mono (code), from Google Fonts.
- Colour tokens on `:root` with a dark theme under `prefers-color-scheme` and `[data-theme]`: `--bg --surface --code --ink --muted --rule --accent --accent-soft --trace --trace-bg --ok --ok-bg --bad --bad-bg`, plus page-specific pairs (for example `--sh`/`--re` for shift and reduce).
- Accent (blue) means "where we are / our code". Trace (amber) means "the key line / the root". Green means done or correct, red means conflict or wrong.
- Diagrams are inline SVG using the `.tl-box`, `.tl-t`, `.tl-a` classes so they work in both themes.
- Every page works at 390 px wide with no sideways scrolling; long code wraps or scrolls inside its own box.
- Motion is small and respects `prefers-reduced-motion`.

## Shared kit

`assets/root-kit.css` and `assets/root-kit.js` provide footnotes, go-deeper strips, the reading list, quizzes, exam questions with self-marking, "report a mistake" links on every section, the page footer and the reading progress bar. Load order: `root-kit.css` in the head, `reading.js` before the page script, `root-kit.js` last.

## Getting found and getting feedback

- Head: a descriptive `<title>` ending in "| Root to End", a meta description of about 160 characters, a canonical URL, Open Graph and Twitter tags, a 1200×630 preview in `assets/og/<slug>.png`, and JSON-LD (`LearningResource`).
- Add each page to `sitemap.xml`, the landing page (card and topic map), and the root README table.
- Every section has a "Something wrong or unclear in this section?" link to a prefilled GitHub issue; templates live in `.github/ISSUE_TEMPLATE/`.

## Before publishing a page

1. jsdom smoke test: no script errors, footnotes, quizzes and exam questions render.
2. Playwright screenshots at 1300 px and 390 px, light and dark; no horizontal scroll.
3. Run the folder's `verify/` script.
4. Commit as `aksaN000 <aksangoni.alif@gmail.com>`, with no co-author or tool attribution lines, push, and check the live URL.

## Changelog

- **2026-10-09**: Added the 60-second version, exam practice with self-marking, per-section mistake reports, issue templates, SEO metadata, preview images and the sitemap. Wrote this guide.
- **2026-10-09**: Added the event-loop playground (model plus real-engine check).
- **2026-10-09**: Added reading footnotes, go-deeper strips, reading lists, quizzes and the progress bar to every page. Replaced the § sign with "Section".
- **2026-10-08**: Switched page text to "we/our".
