// Runs each program through loop-model.js and through Node's real V8 + libuv, then compares output.
// Usage: node verify/compare-loop-with-node.js
const vm = require("vm"), M = require("../loop-model.js");
const PROGRAMS = [
`console.log(1); setTimeout(() => console.log(2)); Promise.resolve().then(() => console.log(3)); console.log(4);`,
`async function f() { console.log("a"); await null; console.log("b"); }
f(); console.log("c");`,
`Promise.resolve().then(() => console.log("A1")).then(() => console.log("A2")).then(() => console.log("A3"));
Promise.resolve().then(() => console.log("B1")).then(() => console.log("B2")).then(() => console.log("B3"));`,
`Promise.resolve().then(() => { console.log("outer"); Promise.resolve().then(() => console.log("inner")); }).then(() => console.log("next"));`,
`Promise.resolve().then(() => { console.log("returns a promise"); return Promise.resolve(); }).then(() => console.log("after"));
Promise.resolve().then(() => console.log("t1")).then(() => console.log("t2")).then(() => console.log("t3")).then(() => console.log("t4"));`,
`async function a1() { console.log("a1 start"); await a2(); console.log("a1 end"); }
async function a2() { console.log("a2"); }
console.log("script start");
setTimeout(() => console.log("setTimeout"), 0);
a1();
new Promise(resolve => { console.log("promise1"); resolve(); }).then(() => console.log("promise2"));
console.log("script end");`,
`const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() { console.log("start"); await sleep(20); console.log("after 20"); await sleep(10); console.log("after 30"); }
main(); setTimeout(() => console.log("timer 25"), 25); console.log("sync");`,
`setTimeout(() => { console.log("T1"); Promise.resolve().then(() => console.log("micro in T1")); }, 5);
setTimeout(() => console.log("T2"), 5);`,
`queueMicrotask(() => console.log("qm")); Promise.resolve().then(() => console.log("then")); console.log("sync");`,
`async function f() { return 1; }
async function g() { return Promise.resolve(1); }
f().then(() => console.log("f done")); g().then(() => console.log("g done"));
Promise.resolve().then(() => console.log("p1")).then(() => console.log("p2")).then(() => console.log("p3")).then(() => console.log("p4"));`,
`const p = new Promise(resolve => setTimeout(() => resolve("late"), 10));
p.then(v => console.log("first " + v)); p.then(v => console.log("second " + v)); console.log("registered");`,
`async function x() { await undefined; console.log("x1"); await undefined; console.log("x2"); }
async function y() { await undefined; console.log("y1"); await undefined; console.log("y2"); }
x(); y();`,
`const p = Promise.resolve(5);
p.then(v => { console.log("got " + v); return v + 1; }).then(v => console.log("then " + v));
p.catch(() => console.log("never")).then(v => console.log("catch passes " + v));`,
`async function inner() { await null; console.log("inner done"); return "x"; }
async function outer() { const v = await inner(); console.log("outer got " + v); }
outer(); Promise.resolve().then(() => console.log("m1")).then(() => console.log("m2")).then(() => console.log("m3"));`,
`setTimeout(() => console.log("10"), 10); setTimeout(() => console.log("5"), 5); setTimeout(() => console.log("20"), 20);
setTimeout(() => { console.log("5b"); setTimeout(() => console.log("5b+3"), 3); }, 5);`,
`function make(n) { return () => console.log("cb " + n); }
queueMicrotask(make(1)); setTimeout(make(2), 1); queueMicrotask(make(3));`,
`new Promise(r => { r(Promise.resolve("v")); }).then(v => console.log("adopted " + v));
Promise.resolve().then(() => console.log("a")).then(() => console.log("b")).then(() => console.log("c"));`,
`let count = 0;
const bump = () => { count = count + 1; console.log("count " + count); };
Promise.resolve().then(bump).then(bump); setTimeout(bump, 0); bump();`,
];
(async () => {
  let ok = 0;
  for (const [i, src] of PROGRAMS.entries()) {
    const m = M.run(src);
    const real = await new Promise(res => {
      const out = [];
      const ctx = vm.createContext({ console: { log: (...a) => out.push(a.map(v => typeof v === "string" ? v : v instanceof Promise ? "Promise" : String(v)).join(" ")) }, setTimeout, queueMicrotask });
      vm.runInContext(src, ctx);
      setTimeout(() => res(out), m.maxDelay + 60);
    });
    const same = !m.error && JSON.stringify(m.out) === JSON.stringify(real);
    if (same) ok++;
    else console.log("MISMATCH #" + i, "\n model:", m.error || m.out.join(" | "), "\n node: ", real.join(" | "));
  }
  console.log(ok + "/" + PROGRAMS.length + " programs print the same lines in the same order as Node " + process.version);
})();
