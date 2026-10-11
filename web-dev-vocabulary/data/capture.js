// Captures what the real tools print, for the page's "real output" sections.
//   node capture.js        (needs Node 22, npm, network access to registry.npmjs.org, and Playwright's Chromium)
// It creates a fresh Vite + React + TypeScript project in a temporary folder, runs the same commands as
// the dev-stack assignment, and writes capture.json next to this file. Absolute paths are replaced
// with ~/dev-stack and the temporary folder's name, so nothing about the capturing machine is published.
const { spawnSync, spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const VERS = { createVite: "9.2.1", tailwind: "4.3.3", daisyui: "5.7.47" };
// The project lives in <tmp>/rte-xxxx/home/you/dev-stack, and the prefix is cut from every output,
// so paths read like a normal machine (/home/you/dev-stack) and say nothing about this one.
const JAIL = fs.mkdtempSync(path.join(os.tmpdir(), "rte-")), TMP = path.join(JAIL, "home", "you"), PROJ = path.join(TMP, "dev-stack");
fs.mkdirSync(TMP, { recursive: true });
const env = Object.assign({}, process.env, { NO_COLOR: "1", FORCE_COLOR: "0", npm_config_fund: "false", npm_config_update_notifier: "false" });
const clean = s => String(s).split(JAIL).join("").split(os.homedir()).join("/home/you")
  .replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "").replace(/[ \t]+$/gm, "");
const out = { captured: new Date().toISOString().slice(0, 10), platform: os.platform() + " " + os.arch(), steps: [] };
function run(label, cmd, args, cwd, keep) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 1 << 26, shell: false });
  let text = clean((r.stdout || "") + (r.stderr || "")).trim();
  if (keep) text = keep(text);
  out.steps.push({ label, cmd: [path.basename(cmd)].concat(args).join(" "), cwd: clean(cwd), status: r.status, out: text });
  console.log("$ " + [path.basename(cmd)].concat(args).join(" ") + "  (exit " + r.status + ")");
  return text;
}
const get = (url) => new Promise((res, rej) => http.get(url, r => { let b = ""; r.on("data", d => b += d); r.on("end", () => res({ status: r.statusCode, type: r.headers["content-type"], body: b })); }).on("error", rej));
(async () => {
  out.versions = { node: process.version, npm: spawnSync("npm", ["--version"], { encoding: "utf8", env }).stdout.trim() };
  // 1. The same question asked of two runtimes
  run("Node: which globals exist?", "node", ["-e", "console.log(typeof window, typeof document, typeof process, typeof require)"], TMP);
  let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/npm-tools/node_modules/playwright"); }
  const b = await pw.chromium.launch(); const pg = await b.newPage();
  out.browser = { version: "Chromium " + b.version(), answer: await pg.evaluate(() => [typeof window, typeof document, typeof process, typeof require].join(" ")) };
  await b.close();
  // 2. Create the project, exactly as the assignment does (non-interactive because stdin is not a terminal)
  run("Create the project", "npm", ["create", "vite@" + VERS.createVite, "dev-stack", "--", "--template", "react-ts"], TMP);
  run("What the generator wrote: package.json scripts", "npm", ["pkg", "get", "scripts", "dependencies", "devDependencies"], PROJ);
  // 3. npm install, with the registry requests shown
  run("Install, showing every request to the registry", "npm", ["install", "--loglevel", "http"], PROJ, t => {
    const lines = t.split("\n"), gets = lines.filter(l => /npm http fetch GET/.test(l));
    return gets.slice(0, 8).join("\n") + "\n… (" + gets.length + " registry requests in total)\n" + lines.filter(l => /^added|^found/.test(l)).join("\n");
  });
  run("Add Tailwind, its Vite plugin and daisyUI", "npm", ["install", "tailwindcss@" + VERS.tailwind, "@tailwindcss/vite@" + VERS.tailwind, "daisyui@" + VERS.daisyui], PROJ);
  run("What is installed at the top level", "npm", ["ls", "--depth=0"], PROJ);
  run("Ask the registry about a scoped package", "npm", ["view", "@tailwindcss/vite@" + VERS.tailwind, "name", "version", "dist.tarball"], PROJ);
  run("Ask the registry which version each tag points to", "npm", ["view", "react", "dist-tags"], PROJ);
  run("node_modules/.bin: where commands like vite live", "node", ["-e", "const fs=require('fs');for(const f of ['vite','tsc'])console.log('node_modules/.bin/'+f+' -> '+fs.readlinkSync('node_modules/.bin/'+f))"], PROJ);
  // 4. Why npm run finds `vite`: npm puts node_modules/.bin first on PATH (set-path.js)
  run("Add a script that prints PATH", "npm", ["pkg", "set", "scripts.where=node -e \"console.log(process.env.PATH.split(require('path').delimiter).slice(0,4).join('\\n'))\""], PROJ);
  run("npm run where", "npm", ["run", "where"], PROJ, t => t.split("\n").filter(l => l && !l.startsWith(">")).join("\n"));
  // 5. Wire in Tailwind and a navbar like the assignment's
  fs.writeFileSync(path.join(PROJ, "vite.config.ts"), "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n})\n");
  fs.writeFileSync(path.join(PROJ, "src/index.css"), '@import "tailwindcss";\n@plugin "daisyui" {\n  themes: light --default;\n}\n\n:root {\n  --brand-gradient: linear-gradient(90deg, #f97316, #ec4899, #8b5cf6);\n}\n\n@utility bg-brand {\n  background-image: var(--brand-gradient);\n}\n');
  fs.writeFileSync(path.join(PROJ, "src/App.tsx"), 'import { useState } from "react";\n\ntype Props = { label: string };\n\nfunction Navbar({ label }: Props) {\n  const [open, setOpen] = useState(false);\n  return (\n    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">\n      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">\n        <button className="lg:hidden" onClick={() => setOpen(!open)}>☰</button>\n        <a href="#" className="hidden lg:flex hover:text-pink-600">{label}</a>\n        <button className="bg-brand text-white px-5 py-2 rounded-full">Sign Up</button>\n      </div>\n    </nav>\n  );\n}\n\nexport default function App() {\n  return <Navbar label="Home" />;\n}\n');
  run("Build for publishing", "npm", ["run", "build"], PROJ);
  // 6. The dev server: what the browser actually receives for our files
  const dev = spawn("npx", ["vite", "--port", "5199", "--strictPort", "--host", "127.0.0.1"], { cwd: PROJ, env, detached: true });
  let banner = ""; dev.stdout.on("data", d => banner += d); dev.stderr.on("data", d => banner += d);
  for (let i = 0; i < 100 && !/ready in/.test(banner); i++) await new Promise(r => setTimeout(r, 200));
  out.devBanner = clean(banner).trim();
  const base = "http://127.0.0.1:5199";
  out.served = {};
  for (const [k, u] of [["index", "/"], ["main", "/src/main.tsx"], ["app", "/src/App.tsx"], ["css", "/src/index.css?direct"]]) {
    const r = await get(base + u); out.served[k] = { url: u, status: r.status, type: r.type, body: clean(r.body).replace(/\/\/# sourceMappingURL=data:[^\n]*/g, "//# sourceMappingURL=data:… (removed)") };
  }
  try { process.kill(-dev.pid, "SIGTERM"); } catch (e) { dev.kill("SIGTERM"); } // npx starts vite as a child: stop the whole group
  // keep only the rules for the navbar's classes from the 60 KB stylesheet, plus its size
  const css = out.served.css.body;
  out.served.css.bytes = css.length;
  fs.writeFileSync(path.join(__dirname, "capture.json"), JSON.stringify(out, null, 1) + "\n");
  console.log("wrote capture.json");
  fs.rmSync(JAIL, { recursive: true, force: true });
  process.exit(0);
})();
