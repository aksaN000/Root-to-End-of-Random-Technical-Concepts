# From the engine to the plugin

Web dev track, page 1 of 4. The vocabulary of a React + Vite + Tailwind project, each word put where it lives and traced to the code behind it, plus how to remember it all.

## What it covers

1. **The 60-second version**, with the two-sided diagram: Node prepares the code, the browser runs it.
2. **A program on our machine**: `node`'s `main()`, `StartInternal` and `SpinEventLoopInternal`.
3. **Engines and runtimes**: one V8, two houses, with a real capture of `typeof document` and `typeof require` in Node and in Chromium.
4. **Packages and the registry**: modules, packages, scopes, versions, ranges and tags, the real registry requests of `npm install`, and library versus framework (inversion of control).
5. **Commands**: the grammar, npx as `npm exec`, nopt's options and the lone `--`, `cmd-list.js` aliases (`create` is `init`), and why `npm run dev` finds `vite` (`set-path.js`, with a real PATH capture).
6. **Command lab**: type any npm or npx line and see each word's role, the options npm sets, the command it runs and every package spec broken into scope, name and version.
7. **Tools**: Vite's `loadAndTransform` and the plugin container's `transform` loop, with what the browser really received for `App.tsx` and the real build output.
8. **API, callback, hook, plugin**: Tailwind's Vite plugin as a list of hook objects, and React's `mountState` for the other meaning of "hook".
9. **Tailwind**: `utilities.ts`, the hover variant's `@media (hover: hover)`, the theme's `--spacing`, and the real stylesheet the dev server sent.
10. **Class lab**: type any classes, see the CSS Tailwind writes, and let the browser compute it and test each media condition.
11. **The whole trip in the dev-stack project**.
12. **Remembering it**: the forgetting curve, retrieval practice, spacing (Leitner boxes), chunking, the generation effect, interleaving, memory hooks for common confusions, what not to memorize, and a two-week plan, each with its evidence.
13. **Recall trainer**: 41 cards in Leitner boxes; command and class answers are checked by the two models.
14. Quizzes, commands, exercises, six exam-style questions, and a reading list.

## Verification

- `node verify/compare-commands.js [count] [seed]` compares `command-model.js` with npm's own code from the npm that ships with Node (bash for word splitting, `bin/npx-cli.js`, nopt, `cmd-list.js`, npm-package-arg). `verify/npm-internals.js` finds and loads those files; `verify/extract-npm-tables.js` copies npm's tables into `npm-tables.js`.
- `node verify/compare-tailwind.js [count] [seed]` compares `tailwind-model.js` with the pinned `tailwindcss` compiler. `verify/extract-tailwind-theme.js` copies the default theme into `tailwind-theme.js`.

Latest numbers: [VALIDATION.md](../VALIDATION.md).

## The capture

`data/capture.js` creates a fresh project with `npm create vite@9.2.1 dev-stack -- --template react-ts`, installs it with registry logging, adds Tailwind and daisyUI, prints PATH from a script, builds, and records what the dev server sends for `index.html`, `main.tsx`, `App.tsx` and `index.css`. `data/make-page-data.js` bundles it into `capture-data.js`.

## Sources

node v22.22.0, npm v10.9.4, nopt v8.1.0, npm-package-arg v12.0.2, @npmcli/run-script v9.1.0, Vite v8.3.4, Tailwind CSS v4.3.3 and React v19.3.0, quoted for study under their licenses (MIT; npm under the Artistic License 2.0; nopt, npm-package-arg and run-script under ISC).
