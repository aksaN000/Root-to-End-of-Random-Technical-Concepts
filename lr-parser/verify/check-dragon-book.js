// Checks lr-engine.js against published results:
//  - the SLR table for the expression grammar, Dragon Book 2nd ed. Fig. 4.37
//  - the 14 moves for "id * id + id", Fig. 4.38
//  - the conflicts the page teaches (dangling else; S -> L = R | R is not SLR)
//  - if GNU Bison is installed, Bison's own conflict report for the same grammars
// Usage: node verify/check-dragon-book.js
const path = require("path"), fs = require("fs"), os = require("os"), { execFileSync } = require("child_process");
const LR = require(path.join(__dirname, "..", "lr-engine.js"));
let fails = 0;
function check(what, ok, detail) { if (!ok) fails++; console.log((ok ? "ok   " : "FAIL ") + what + (ok || !detail ? "" : "\n     " + detail)); }

const EXPR = "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id";
// Fig. 4.37, columns id + * ( ) $ | E T F; "." = blank
const FIG437 = [
  "s5 . . s4 . . | 1 2 3", ". s6 . . . acc | . . .", ". r2 s7 . r2 r2 | . . .", ". r4 r4 . r4 r4 | . . .",
  "s5 . . s4 . . | 8 2 3", ". r6 r6 . r6 r6 | . . .", "s5 . . s4 . . | . 9 3", "s5 . . s4 . . | . . 10",
  ". s6 . . s11 . | . . .", ". r1 s7 . r1 r1 | . . .", ". r3 r3 . r3 r3 | . . .", ". r5 r5 . r5 r5 | . . ."
];
const r = LR.build(EXPR), T = ["id", "+", "*", "(", ")", "$"], N = ["E", "T", "F"];
check("expression grammar has 12 LR(0) states (I0..I11)", r.C.states.length === 12, "got " + r.C.states.length);
check("expression grammar has no SLR conflicts", r.T.conflicts.length === 0, JSON.stringify(r.T.conflicts));
let tableOk = true, firstDiff = "";
FIG437.forEach((row, s) => {
  const [act, go] = row.split(" | ");
  act.split(" ").forEach((want, j) => {
    const got = (r.T.ACTION[s][T[j]] || []).map(LR.actText).join("/") || ".";
    if (got !== want) { tableOk = false; firstDiff = firstDiff || `ACTION[${s}, ${T[j]}] = ${got}, book says ${want}`; }
  });
  go.split(" ").forEach((want, j) => {
    const g = r.T.GOTO[s][N[j]], got = g === undefined ? "." : String(g);
    if (got !== want) { tableOk = false; firstDiff = firstDiff || `GOTO[${s}, ${N[j]}] = ${got}, book says ${want}`; }
  });
});
check("every ACTION and GOTO cell matches Fig. 4.37", tableOk, firstDiff);
const P = LR.parser(r.G, r.T, "id * id + id".split(" "));
while (!P.done) P.step();
const kinds = P.steps.map(s => s.kind === "shift" ? "s" + s.act.n : s.kind === "reduce" ? "r" + s.prod : s.kind).join(" ");
check("moves for id * id + id match Fig. 4.38", kinds === "s5 r6 r4 s7 s5 r6 r3 r2 s6 s5 r6 r4 r1 accept", kinds);
const FF = r.FF;
check("FIRST(E) = { (, id }", FF.FIRST.E.slice().sort().join(" ") === "( id", FF.FIRST.E.join(" "));
check("FOLLOW(T) = { $, ), *, + }", FF.FOLLOW.T.slice().sort().join(" ") === "$ ) * +", FF.FOLLOW.T.join(" "));
const dangling = LR.build("S -> i E t S | i E t S e S | a\nE -> b");
check("dangling else: exactly one shift/reduce conflict, on e", dangling.T.conflicts.length === 1 && dangling.T.conflicts[0].sym === "e" && dangling.T.conflicts[0].kind === "shift/reduce", JSON.stringify(dangling.T.conflicts));
const lval = LR.build("S -> L = R | R\nL -> * R | id\nR -> L");
check("S -> L = R | R: one SLR shift/reduce conflict on =", lval.T.conflicts.length === 1 && lval.T.conflicts[0].sym === "=", JSON.stringify(lval.T.conflicts));
const eps = LR.build("S -> ( S ) S | ε");
const PE = LR.parser(eps.G, eps.T, "( ( ) ) ( )".split(" ")); while (!PE.done) PE.step();
check("ε-grammar parses ( ( ) ) ( )", PE.ok);

// Optional: GNU Bison's own verdicts on the same grammars
let bison = null; try { bison = execFileSync("bison", ["--version"]).toString().split("\n")[0]; } catch (e) {}
if (bison) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rte-bison-"));
  function run(name, y) { const f = path.join(dir, name + ".y"); fs.writeFileSync(f, y); const r = require("child_process").spawnSync("bison", ["-o", path.join(dir, name + ".c"), f], { encoding: "utf8" }); return (r.stdout || "") + (r.stderr || ""); }
  const outIfElse = run("ifelse", "%token IF THEN ELSE COND OTHER\n%%\nS : IF COND THEN S | IF COND THEN S ELSE S | OTHER ;\n");
  check(bison + ": dangling else gives 1 shift/reduce conflict", /1 shift\/reduce conflict/.test(outIfElse), outIfElse.trim());
  const outLR = run("lr", "%token ID\n%%\nS : L '=' R | R ;\nL : '*' R | ID ;\nR : L ;\n");
  check(bison + ": S -> L = R | R has no conflicts (LALR handles it)", !/conflict/.test(outLR), outLR.trim());
} else console.log("skip GNU Bison checks (bison not installed)");
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exit(fails ? 1 : 0);
