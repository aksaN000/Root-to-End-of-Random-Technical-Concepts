# Contributing

Thanks for looking. This is a learning project, so the most useful help is finding where a page is wrong, unclear or broken.

## The quickest ways to help

- **Report a mistake.** Every section of every page ends with a "Tell us" link that opens a prefilled issue naming the page and section. Or use the [mistake template](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=mistake.yml).
- **Try to break a lab.** The event-loop playground and the HTML parser lab check themselves against your browser. An input where the model and your browser disagree is a great issue; paste the input.
- **Test in Firefox, Safari or on a real phone.** All automated checks run in Chromium. See [TESTING.md](TESTING.md), section 1.
- **Suggest a topic** with the [topic template](https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts/issues/new?template=topic.yml). The [roadmap](README.md#roadmap) lists what is planned.

## Changing code

1. Set up and run everything once (about a minute): see [TESTING.md](TESTING.md), section 2. `npm test` must pass before and after your change.
2. Follow [STYLE.md](STYLE.md): page anatomy, real code only (trimmed with `// …` and linked to the source), evidence labels and scope boxes, accessibility, and the "Before publishing" list.
3. If you change a model, change or extend its `verify/` script too, and commit the regenerated `VALIDATION.md` and `validation/results/`.
4. After editing any CSS or JS file, run `python3 tools/stamp-assets.py`.
5. Open a pull request saying what you changed and how you checked it. CI reruns every check.

## Good first tasks

- Run `node tools/check-pages.js --browser=firefox` (or `webkit`) and report or fix what fails.
- Tab through a page with the keyboard only, or with a screen reader, and report anything you cannot reach or understand.
- Find a source excerpt whose link or line numbers have drifted from upstream and update it.
- Add a hand-picked case to a verify script (for example a tricky HTML snippet in `html-to-pixels/verify/compare-with-chrome.js`) that the model gets right, or wrong.
- Check a reading-list link that has moved or gone.

## What we will not merge

- Paraphrased "code" presented as real source.
- A model changed only to make numbers match, without finding out why the real system behaves differently (see "Verification" in STYLE.md).
- Numbers on a page that do not come from a verify run.
