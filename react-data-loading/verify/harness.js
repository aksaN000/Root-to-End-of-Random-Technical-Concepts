// Runs real React (the pinned react and react-dom packages) in real Chromium, for the verifier and the capture.
// buildBundle(mode) bundles React with esbuild: "production" is the build the page ships in vendor/,
// "development" is the build a Vite dev server gives us (StrictMode double-invokes only there).
// The page is served from a fake origin (http://lab.test/) through Playwright routes, so fetch() is a
// real network request that we can delay and count.
const path = require("path"), fs = require("fs"), os = require("os");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
const ROOT = path.resolve(__dirname, "..", "..");
const VERSION = require(path.join(ROOT, "node_modules/react/package.json")).version;

function buildBundle(mode) {
  const esbuild = require("esbuild");
  const entry = path.join(os.tmpdir(), "rdl-entry.js");
  fs.writeFileSync(entry, 'import * as React from "react";\nimport * as ReactDOMClient from "react-dom/client";\nwindow.React = React;\nwindow.ReactDOMClient = ReactDOMClient;\n');
  const r = esbuild.buildSync({ entryPoints: [entry], bundle: true, format: "iife", write: false, minify: mode === "production", nodePaths: [path.join(ROOT, "node_modules")], define: { "process.env.NODE_ENV": JSON.stringify(mode) }, legalComments: "eof", logLevel: "silent" });
  return r.outputFiles[0].text;
}

const TECH = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: "t" + i, name: "Tech " + i })));

async function openBrowser() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  return pw.chromium.launch({ env, args: ["--no-proxy-server"] });
}

// Opens http://lab.test/ with the given React bundle and our program. jsonDelay is how long the
// server waits before answering /Technologies.json. Returns the page and a request counter.
async function openLab(browser, bundle, program, jsonDelay) {
  const page = await browser.newPage();
  const counts = { json: 0 };
  await page.route("http://lab.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><body><div id=root></div><script src=/react.js></script><script src=/program.js></script>" });
    if (url.pathname === "/react.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (url.pathname === "/program.js") return route.fulfill({ contentType: "text/javascript", body: program });
    if (url.pathname === "/Technologies.json") { counts.json++; await new Promise(r => setTimeout(r, jsonDelay || 0)); return route.fulfill({ contentType: "application/json", body: TECH }); }
    return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>404</title>" });
  });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://lab.test/");
  return { page, counts, errors };
}

module.exports = { buildBundle, openBrowser, openLab, VERSION, TECH };
