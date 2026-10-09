// Model of V8's expression pipeline for arithmetic over parameters a, b, c:
// precedence climbing (ParseBinaryContinuation), constant folding (ShortcutLiteralBinaryExpression),
// n-ary collapsing (CollapseNaryExpression) and Ignition bytecode generation incl. register-optimizer effects.
var V8M = (function () {
  var PREC = {"|":6,"^":7,"&":8,"<<":11,">>":11,"+":12,"-":12,"*":13,"/":13,"%":13,"**":14};
  var OPN = {"+":"Add","-":"Sub","*":"Mul","/":"Div","%":"Mod","**":"Exp","|":"BitwiseOr","^":"BitwiseXor","&":"BitwiseAnd","<<":"ShiftLeft",">>":"ShiftRight"};
  var COMM = {"*":1,"&":1,"|":1,"^":1};
  var PARAMS = {a:"a0",b:"a1",c:"a2"};
  function lex(s) {
    var t = [], re = /\s*(\d+(?:\.\d+)?|[A-Za-z_]\w*|\*\*|<<|>>|[-+*/%()|^&])/y, m, end = s.replace(/\s+$/, "").length;
    while (re.lastIndex < end) { m = re.exec(s); if (!m) throw new Error("Unexpected character at position " + (re.lastIndex + 1)); t.push(m[1]); }
    return t;
  }
  function fold(x, y, op) {
    if (x.k !== "num" || y.k !== "num") return null;
    var a = x.v, b = y.v, F = {"+":a+b,"-":a-b,"*":a*b,"/":a/b,"%":a%b,"|":a|b,"&":a&b,"^":a^b,"<<":a<<b,">>":a>>b,"**":Math.pow(a,b)};
    if (!(op in F)) return null;
    return {k:"num", v:F[op], folded:{l:x, op:op, r:y}};
  }
  function parse(src) {
    var t = lex(src), p = 0, log = [];
    function peek() { return t[p]; } function next() { return t[p++]; }
    function unary(depth) {
      var x = next();
      if (x === undefined) throw new Error("Expression ends too early");
      if (x === "(") { var e = bin(4, depth + 1); if (next() !== ")") throw new Error("Missing )"); return e; }
      if (/^\d/.test(x)) return {k:"num", v:+x};
      if (/^[A-Za-z_]\w*$/.test(x)) { if (!PARAMS[x]) throw new Error("Use the parameters a, b or c"); return {k:"var", v:x}; }
      throw new Error("Unexpected " + x);
    }
    function bin(prec, depth) {
      log.push({d:depth, s:"ParseBinaryExpression(prec=" + prec + ")"});
      var x = unary(depth), p1 = PREC[peek()] || 0;
      if (p1 >= prec) return cont(x, prec, p1, depth);
      return x;
    }
    function cont(x, prec, p1, depth) {
      do {
        while ((PREC[peek()] || 0) === p1) {
          var op = next(), np = op === "**" ? p1 : p1 + 1;
          log.push({d:depth, s:"  saw '" + op + "' (prec " + p1 + "), parse right side with prec ≥ " + np});
          var y = bin(np, depth + 1), f = fold(x, y, op);
          if (f) { x = f; log.push({d:depth, s:"  both sides are literals: fold to " + fmt(f.v)}); }
          else if (x.k === "nary" && x.op === op) { x.items.push(y); }
          else if (x.k === "bin" && x.op === op && op !== "**") { x = {k:"nary", op:op, items:[x.l, x.r, y]}; log.push({d:depth, s:"  same operator again: collapse into an n-ary node"}); }
          else { x = {k:"bin", op:op, l:x, r:y}; }
        }
        --p1;
      } while (p1 >= prec);
      return x;
    }
    var e = bin(4, 0);
    if (p < t.length) throw new Error("Unexpected " + t[p]);
    return {ast:e, log:log, tokens:t};
  }
  function fmt(v) { return Object.is(v, -0) ? "-0" : String(+v.toPrecision(12)); }
  function smi(v) { return Number.isInteger(v) && v >= -2147483648 && v <= 2147483647 && !Object.is(v, -0); }
  function wide(v) { return v >= -128 && v <= 127 ? "" : v >= -32768 && v <= 32767 ? ".Wide" : ".ExtraWide"; }
  function gen(ast) {
    var out = [], slot = 0, nextReg = 0, maxReg = 0, kpool = [];
    function emit(op, args, why) { out.push({op:op, args:args || [], why:why || ""}); }
    function isSmi(n) { return n.k === "num" && smi(n.v); }
    function newSlot() { return slot++; }
    function lit(n) {
      if (!smi(n.v)) { kpool.push(n.v); emit("LdaConstant", ["[" + (kpool.length - 1) + "]"], "load heap number " + fmt(n.v) + " from the constant pool"); return; }
      if (n.v === 0) emit("LdaZero", [], "accumulator = 0"); else emit("LdaSmi" + wide(n.v), ["[" + n.v + "]"], "accumulator = " + n.v);
    }
    function acc(n) {
      if (n.k === "num") return lit(n);
      if (n.k === "var") return emit("Ldar", [PARAMS[n.v]], "accumulator = " + n.v);
      if (n.k === "bin") return binop(n);
      return nary(n);
    }
    function reg(n) {
      // Visit first, then take a register. A parameter still consumes a register index:
      // V8 emits "Ldar aN; Star rK" and the register optimizer elides both, aliasing rK to aN.
      if (n.k !== "var") acc(n);
      var r = "r" + (nextReg++); maxReg = Math.max(maxReg, nextReg);
      if (n.k === "var") return PARAMS[n.v];
      emit("Star" + r.slice(1), [], r + " = accumulator");
      return r;
    }
    function binop(n) {
      var s = newSlot(), name = OPN[n.op];
      if (isSmi(n.r)) { acc(n.l); emit(name + "Smi" + wide(n.r.v), ["[" + n.r.v + "]", "[" + s + "]"], "accumulator = accumulator " + n.op + " " + n.r.v); return; }
      if (COMM[n.op] && isSmi(n.l)) { acc(n.r); emit(name + "Smi" + wide(n.l.v), ["[" + n.l.v + "]", "[" + s + "]"], "commutative: literal moved to the immediate operand"); return; }
      var save = nextReg, r = reg(n.l); acc(n.r);
      emit(name, [r, "[" + s + "]"], "accumulator = " + r + " " + n.op + " accumulator");
      nextReg = save;
    }
    function nary(n) {
      var name = OPN[n.op], first = n.items[0], cur, inAcc = false, saveN = nextReg;
      if (first.k !== "var") { acc(first); inAcc = true; }
      var mine = "r" + (nextReg++); maxReg = Math.max(maxReg, nextReg);
      cur = first.k === "var" ? PARAMS[first.v] : mine;
      for (var i = 1; i < n.items.length; i++) {
        var it = n.items[i];
        if (isSmi(it)) {
          if (!inAcc) { emit("Ldar", [cur], "accumulator = " + cur); inAcc = true; }
          emit(name + "Smi" + wide(it.v), ["[" + it.v + "]", "[" + newSlot() + "]"], "accumulator = accumulator " + n.op + " " + it.v);
          continue;
        }
        var r;
        if (inAcc) { r = mine; emit("Star" + r.slice(1), [], r + " = accumulator"); } else r = cur;
        acc(it);
        emit(name, [r, "[" + newSlot() + "]"], "accumulator = " + r + " " + n.op + " accumulator");
        inAcc = true;
      }
      if (!inAcc) emit("Ldar", [cur], "");
      nextReg = saveN;
    }
    acc(ast);
    emit("Return", [], "return the accumulator");
    return {code:out, regs:maxReg, slots:slot, constants:kpool};
  }
  function text(g) { return g.code.map(function (c) { return c.op + (c.args.length ? " " + c.args.join(", ") : ""); }); }
  return {parse:parse, gen:gen, text:text, lex:lex, PREC:PREC, fmt:fmt};
})();
if (typeof module !== "undefined") module.exports = V8M;
