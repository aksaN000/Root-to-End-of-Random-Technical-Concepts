# From a JSON file to the screen

Web dev track, page 2 of 5. Loading data into a React component three ways (plain JavaScript, `useEffect` + `useState`, and `use(promise)` + `<Suspense>`), traced into React 19.2.8's source, with line-by-line labs of the Dev Stack Technologies component and a dependency-array lab.

Live: https://aksan000.github.io/Root-to-End-of-Random-Technical-Concepts/react-data-loading/

| File | What it is |
|---|---|
| `index.html` | The page |
| `tsx-syntax/index.html` | Companion cheat sheet: how to write code in a .tsx file, with live demos on real JavaScript and real React; checked by `verify/check-tsx-page.js` |
| `react-model.js` | The model: `DepsModel` (renders and effect runs for a dependency array and a click sequence) and `TIMELINES` (the steps of the two line-by-line labs) |
| `deps-real.js` | Runs a click sequence on real React; shared by the page's "Check in this browser" button and the verifier |
| `vendor/react-19.2.8.production.js` | react and react-dom 19.2.8, production build, bundled with esbuild by `verify/build-vendor.js`; loaded only for the live check |
| `capture-data.js`, `data/capture.json` | Real React's logs for both versions, written by `data/capture.js` |
| `verify/compare-with-react.js` | The check against real React in Chromium (`npm test` runs it as `react`) |
| `verify/harness.js`, `verify/programs.js` | The fake-origin server and the instrumented components the check and the capture run |

```bash
npm install && npx playwright install chromium
node react-data-loading/verify/compare-with-react.js        # every sequence up to 4 clicks + 60 random per array
node react-data-loading/verify/compare-with-react.js 200 9  # 200 random sequences per array, seed 9
cd react-data-loading/data && node capture.js               # recapture the real logs
```
