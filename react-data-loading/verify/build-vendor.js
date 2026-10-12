// Writes vendor/react-<version>.production.js: the pinned react and react-dom packages bundled with
// esbuild in production mode. The page loads it only when we press "Check in this browser", and
// verify/compare-with-react.js fails if it no longer matches a fresh build.
const fs = require("fs"), path = require("path"), H = require("./harness");
const out = path.join(__dirname, "..", "vendor", "react-" + H.VERSION + ".production.js");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, "/* react and react-dom " + H.VERSION + ", production build, bundled by verify/build-vendor.js. MIT License, Copyright (c) Meta Platforms, Inc. and affiliates. */\n" + H.buildBundle("production"));
console.log("wrote", path.relative(process.cwd(), out), fs.statSync(out).size, "bytes");
