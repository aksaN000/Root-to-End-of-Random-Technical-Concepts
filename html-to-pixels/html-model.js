// A model of the WHATWG HTML parser (tokenizer + tree construction) for the subset of HTML
// used on this page: the head and body insertion modes, implied tags, <p> closing, list items,
// the active formatting elements with reconstruction, and the adoption agency algorithm.
// Tables, forms, select, template, frameset, ruby and SVG/MathML have their own insertion modes
// and are reported as outside the model. verify/compare-with-chrome.js checks the trees this
// produces against real Chrome's parser.
var HtmlModel = (function () {
  "use strict";
  function ModelError(msg) { var e = new Error(msg); e.model = true; return e; }

  // ---------------- tokenizer ----------------
  var NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©" };
  var RAW = { style: 1, xmp: 1, iframe: 1, noembed: 1, noframes: 1, script: 1 };
  var RCDATA = { title: 1, textarea: 1 };
  function tokenize(src) {
    var out = [], i = 0, n = src.length, text = "", textStart = 0, rawEnd = null, rcdata = false;
    function flush(end) { if (text) out.push({ type: "Character", data: text, s: textStart, e: end, states: ["data"] }); text = ""; }
    function charRef(at, inAttr) {
      // returns [replacement, newIndex] or null (leave the & as text)
      if (src[at + 1] === "#") {
        var m = /^&#([xX][0-9a-fA-F]+|[0-9]+);?/.exec(src.slice(at));
        if (!m) return null;
        var v = m[1][0] === "x" || m[1][0] === "X" ? parseInt(m[1].slice(1), 16) : parseInt(m[1], 10);
        if (v >= 0x80 && v <= 0x9f) throw ModelError("numeric references to C1 controls (&#" + v + ";) are remapped through windows-1252, which this model does not include");
        if (v === 0 || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) v = 0xfffd;
        return [String.fromCodePoint(v), at + m[0].length];
      }
      var rest = src.slice(at + 1);
      if (!/^[a-zA-Z]/.test(rest)) return null;
      var semi = /^([a-zA-Z][a-zA-Z0-9]*);/.exec(rest);
      if (semi && NAMED.hasOwnProperty(semi[1])) return [NAMED[semi[1]], at + 1 + semi[0].length];
      // legacy names that decode even without a semicolon
      var leg = /^(amp|lt|gt|quot|nbsp|copy)/.exec(rest);
      if (leg) {
        var after = rest[leg[1].length];
        if (inAttr && after !== ";" && after && /[=a-zA-Z0-9]/.test(after)) return null;
        return [NAMED[leg[1]], at + 1 + leg[1].length + (after === ";" ? 1 : 0)];
      }
      if (semi) throw ModelError("&" + semi[1] + "; is outside this model's small entity table (it knows amp, lt, gt, quot, apos, nbsp, copy and numeric references)");
      return null;
    }
    while (i < n) {
      if (rawEnd) {
        var re = new RegExp("</" + rawEnd + "(?=[\\s/>])", "i"), m = re.exec(src.slice(i));
        var stop = m ? i + m.index : n, body = src.slice(i, stop);
        if (rcdata) { var t = "", k = i; while (k < stop) { if (src[k] === "&") { var cr = charRef(k, false); if (cr && cr[1] <= stop) { t += cr[0]; k = cr[1]; continue; } } t += src[k]; k++; } body = t; }
        if (body) out.push({ type: "Character", data: body, s: i, e: stop, states: [rcdata ? "RCDATA" : rawEnd === "script" ? "script data" : "RAWTEXT"] });
        i = stop; rawEnd = null; rcdata = false;
        continue;
      }
      var c = src[i];
      if (c === "&") {
        var r = charRef(i, false);
        if (r) { if (!text) textStart = i; text += r[0]; i = r[1]; continue; }
        if (!text) textStart = i; text += c; i++; continue;
      }
      if (c === "\r") { if (!text) textStart = i; text += "\n"; i += src[i + 1] === "\n" ? 2 : 1; continue; }
      if (c !== "<") { if (!text) textStart = i; text += c; i++; continue; }
      // tag open
      var s0 = i, nx = src[i + 1];
      if (nx === "!") {
        if (src.substr(i + 2, 2) === "--") {
          var ce = src.indexOf("-->", i + 4);
          if (src.substr(i + 4, 1) === ">") ce = i + 2; else if (src.substr(i + 4, 2) === "->") ce = i + 3;
          flush(i);
          var data = ce < 0 ? src.slice(i + 4) : src.slice(i + 4, Math.max(i + 4, ce));
          i = ce < 0 ? n : ce + 3;
          out.push({ type: "Comment", data: data, s: s0, e: i, states: ["tag open", "markup declaration open", "comment"] });
          continue;
        }
        if (/^<!doctype/i.test(src.slice(i, i + 9))) {
          flush(i);
          var de = src.indexOf(">", i); if (de < 0) de = n - 1;
          var nm = /^<!doctype\s+([^\s>]+)/i.exec(src.slice(i, de + 1));
          out.push({ type: "DOCTYPE", name: nm ? nm[1].toLowerCase() : "", s: s0, e: de + 1, states: ["tag open", "markup declaration open", "DOCTYPE"] });
          i = de + 1; continue;
        }
        // bogus comment
        flush(i);
        var be = src.indexOf(">", i); if (be < 0) be = n - 1;
        out.push({ type: "Comment", data: src.slice(i + 2, be), s: s0, e: be + 1, states: ["tag open", "markup declaration open", "bogus comment"] });
        i = be + 1; continue;
      }
      if (nx === "?") {
        flush(i);
        var qe = src.indexOf(">", i); if (qe < 0) qe = n - 1;
        out.push({ type: "Comment", data: src.slice(i + 1, qe), s: s0, e: qe + 1, states: ["tag open", "bogus comment"] });
        i = qe + 1; continue;
      }
      var isEnd = nx === "/";
      var j = isEnd ? i + 2 : i + 1;
      if (!/[a-zA-Z]/.test(src[j] || "")) {
        if (isEnd && src[j] === ">") { flush(i); i = j + 1; continue; }            // </> is dropped
        if (isEnd && j < n) {                                                      // </ followed by junk: bogus comment
          flush(i); var ge = src.indexOf(">", j); if (ge < 0) ge = n - 1;
          out.push({ type: "Comment", data: src.slice(j, ge), s: s0, e: ge + 1, states: ["tag open", "end tag open", "bogus comment"] }); i = ge + 1; continue;
        }
        if (!text) textStart = i; text += "<"; i++; continue;                       // a lone < is just text
      }
      flush(i);
      var states = ["tag open", isEnd ? "end tag open" : null, "tag name"].filter(Boolean);
      var k2 = j, name = "";
      while (k2 < n && !/[\s/>]/.test(src[k2])) { name += src[k2].toLowerCase(); k2++; }
      var attrs = [], seen = {}, selfClosing = false, done = false;
      while (k2 < n && !done) {
        var ch = src[k2];
        if (/\s/.test(ch)) { k2++; continue; }
        if (ch === ">") { k2++; done = true; break; }
        if (ch === "/") { if (src[k2 + 1] === ">") { selfClosing = true; k2 += 2; done = true; break; } k2++; continue; }
        // attribute name
        if (states[states.length - 1] !== "before attribute name") states.push("before attribute name");
        var an = src[k2].toLowerCase(); k2++;
        while (k2 < n && !/[\s/>=]/.test(src[k2])) { an += src[k2].toLowerCase(); k2++; }
        states.push("attribute name");
        while (k2 < n && /\s/.test(src[k2])) k2++;
        var av = "";
        if (src[k2] === "=") {
          k2++; while (k2 < n && /\s/.test(src[k2])) k2++;
          var q = src[k2];
          if (q === '"' || q === "'") {
            states.push(q === '"' ? "attribute value (double-quoted)" : "attribute value (single-quoted)");
            k2++; while (k2 < n && src[k2] !== q) { if (src[k2] === "&") { var ar = charRef(k2, true); if (ar) { av += ar[0]; k2 = ar[1]; continue; } } av += src[k2]; k2++; }
            k2++;
          } else {
            states.push("attribute value (unquoted)");
            while (k2 < n && !/[\s>]/.test(src[k2])) { if (src[k2] === "&") { var ar2 = charRef(k2, true); if (ar2) { av += ar2[0]; k2 = ar2[1]; continue; } } av += src[k2]; k2++; }
          }
        }
        if (!seen[an]) { seen[an] = 1; attrs.push([an, av]); }   // duplicate attributes: the first one wins
      }
      if (!done) { i = n; break; }                                 // EOF inside a tag: the tag is dropped
      var tok = { type: isEnd ? "EndTag" : "StartTag", name: name, attrs: isEnd ? [] : attrs, selfClosing: selfClosing, s: s0, e: k2, states: states };
      out.push(tok);
      i = k2;
      if (!isEnd && RAW[name]) rawEnd = name;
      if (!isEnd && RCDATA[name]) { rawEnd = name; rcdata = true; }
    }
    flush(n);
    out.push({ type: "EOF", s: n, e: n, states: ["data"] });
    return out;
  }

  // ---------------- tree construction ----------------
  var SPECIAL = {};
  ("address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp").split(" ").forEach(function (t) { SPECIAL[t] = 1; });
  var FORMATTING = { a: 1, b: 1, big: 1, code: 1, em: 1, font: 1, i: 1, nobr: 1, s: 1, small: 1, strike: 1, strong: 1, tt: 1, u: 1 };
  var VOID = { area: 1, br: 1, embed: 1, img: 1, keygen: 1, wbr: 1, input: 1, param: 1, source: 1, track: 1, hr: 1, meta: 1, link: 1, base: 1, basefont: 1, bgsound: 1 };
  var BLOCKS = { address: 1, article: 1, aside: 1, blockquote: 1, center: 1, details: 1, dialog: 1, dir: 1, div: 1, dl: 1, fieldset: 1, figcaption: 1, figure: 1, footer: 1, header: 1, hgroup: 1, main: 1, menu: 1, nav: 1, ol: 1, p: 1, search: 1, section: 1, summary: 1, ul: 1 };
  var CLOSE_BLOCKS = { address: 1, article: 1, aside: 1, blockquote: 1, button: 1, center: 1, details: 1, dialog: 1, dir: 1, div: 1, dl: 1, fieldset: 1, figcaption: 1, figure: 1, footer: 1, header: 1, hgroup: 1, listing: 1, main: 1, menu: 1, nav: 1, ol: 1, pre: 1, search: 1, section: 1, summary: 1, ul: 1 };
  var HEADINGS = { h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1 };
  var IMPLIED = { dd: 1, dt: 1, li: 1, optgroup: 1, option: 1, p: 1, rb: 1, rp: 1, rt: 1, rtc: 1 };
  var SCOPE = { applet: 1, caption: 1, html: 1, table: 1, td: 1, th: 1, marquee: 1, object: 1, template: 1 };
  var UNSUPPORTED = { table: 1, caption: 1, colgroup: 1, col: 1, tbody: 1, thead: 1, tfoot: 1, tr: 1, td: 1, th: 1, form: 1, select: 1, template: 1, frameset: 1, frame: 1, svg: 1, math: 1, ruby: 1, rb: 1, rp: 1, rt: 1, rtc: 1, plaintext: 1, applet: 1, marquee: 1, object: 1, noscript: 1, image: 1, isindex: 1, option: 1, optgroup: 1, datalist: 1, head: 0 };
  var IN_HEAD_TAGS = { base: 1, basefont: 1, bgsound: 1, link: 1, meta: 1, noframes: 1, script: 1, style: 1, template: 1, title: 1 };

  function build(src, opts) {
    opts = opts || {};
    var tokens = tokenize(src);
    var doc = { type: "document", children: [] }, nid = 0;
    var stack = [], afe = [], mode = "initial", original = null, head = null, steps = [], ignoreLF = false;
    function el(name, attrs) { return { type: "element", name: name, attrs: (attrs || []).map(function (a) { return a.slice(); }), children: [], parent: null, id: ++nid }; }
    function cur() { return stack[stack.length - 1]; }
    function append(parent, node) { if (node.parent) detach(node); node.parent = parent; parent.children.push(node); }
    function detach(node) { var p = node.parent; if (!p) return; p.children.splice(p.children.indexOf(node), 1); node.parent = null; }
    function insertText(data) {
      var p = cur(), last = p.children[p.children.length - 1];
      if (last && last.type === "text") last.data += data; else append(p, { type: "text", data: data, parent: null });
    }
    function insertEl(tok, name) { var e = el(name || tok.name, tok.attrs); append(cur(), e); stack.push(e); return e; }
    function has(name) { for (var i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) return true; return false; }
    function inScope(test, extra) {
      for (var i = stack.length - 1; i >= 0; i--) {
        var n = stack[i];
        if (typeof test === "function" ? test(n) : n === test || n.name === test) return true;
        if (SCOPE[n.name] || (extra && extra[n.name])) return false;
      }
      return false;
    }
    var LIST_SCOPE = { ol: 1, ul: 1 }, BUTTON_SCOPE = { button: 1 };
    function popUntil(name) { while (stack.length) { var x = stack.pop(); if (x.name === name) return; } }
    function popUntilFn(f) { while (stack.length) { var x = stack.pop(); if (f(x)) return; } }
    function genImplied(except) { while (stack.length && IMPLIED[cur().name] && cur().name !== except) stack.pop(); }
    function closeP() { if (inScope("p", BUTTON_SCOPE)) { genImplied("p"); popUntil("p"); note("close the open <p> first (it is in button scope)"); } }
    var notes = [];
    function note(t) { notes.push(t); }
    // active formatting elements
    function pushAFE(e, tok) {
      var count = 0, firstIdx = -1;
      for (var i = afe.length - 1; i >= 0 && afe[i] !== "marker"; i--) {
        var x = afe[i];
        if (x.el.name === e.name && sameAttrs(x.tok.attrs, tok.attrs)) { count++; firstIdx = i; }
      }
      if (count >= 3) { afe.splice(firstIdx, 1); note("Noah's Ark clause: a fourth identical <" + e.name + "> evicts the earliest from the list"); }
      afe.push({ el: e, tok: tok });
    }
    function sameAttrs(a, b) { if (a.length !== b.length) return false; var m = {}; a.forEach(function (x) { m[x[0]] = x[1]; }); return b.every(function (x) { return m[x[0]] === x[1]; }); }
    function reconstruct() {
      if (!afe.length) return;
      var last = afe[afe.length - 1];
      if (last === "marker" || stack.indexOf(last.el) >= 0) return;
      var i = afe.length - 1;
      while (i > 0) { var p = afe[i - 1]; if (p === "marker" || stack.indexOf(p.el) >= 0) break; i--; }
      var made = [];
      for (; i < afe.length; i++) {
        var entry = afe[i], ne = el(entry.el.name, entry.tok.attrs);
        append(cur(), ne); stack.push(ne); afe[i] = { el: ne, tok: entry.tok }; made.push("<" + ne.name + ">");
      }
      note("reconstruct the active formatting elements: reopen " + made.join(""));
    }
    function afeIndexOf(e) { for (var i = 0; i < afe.length; i++) if (afe[i] !== "marker" && afe[i].el === e) return i; return -1; }
    function adoptionAgency(name) {
      var c = cur();
      if (c.name === name && afeIndexOf(c) < 0) { stack.pop(); return; }
      for (var outer = 0; outer < 8; outer++) {
        var fIdx = -1;
        for (var i = afe.length - 1; i >= 0 && afe[i] !== "marker"; i--) if (afe[i].el.name === name) { fIdx = i; break; }
        if (fIdx < 0) return anyOtherEnd(name);
        var fe = afe[fIdx].el;
        if (stack.indexOf(fe) < 0) { afe.splice(fIdx, 1); note("</" + name + "> with no open <" + name + ">: drop it from the formatting list"); return; }
        if (!inScope(fe)) { note("</" + name + "> is not in scope: ignored"); return; }
        var fsi = stack.indexOf(fe), fb = null;
        for (var k = fsi + 1; k < stack.length; k++) if (SPECIAL[stack[k].name]) { fb = stack[k]; break; }
        if (!fb) {
          while (stack.length) { var x = stack.pop(); if (x === fe) break; }
          afe.splice(afeIndexOf(fe), 1);
          note(outer ? "adoption agency: no furthest block now, so just pop up to <" + name + ">" : "</" + name + ">: pop up to and including <" + name + ">, and remove it from the formatting list");
          return;
        }
        note("adoption agency: <" + name + "> has a block <" + fb.name + "> inside it (the furthest block); restructure");
        var ca = stack[fsi - 1], bookmark = afeIndexOf(fe), node = fb, lastNode = fb, inner = 0, ni = stack.indexOf(fb);
        while (true) {
          inner++;
          ni = ni - 1; node = stack[ni];
          if (node === fe) break;
          var nAfe = afeIndexOf(node);
          if (inner > 3 && nAfe >= 0) { afe.splice(nAfe, 1); if (nAfe < bookmark) bookmark--; nAfe = -1; }
          if (nAfe < 0) { stack.splice(ni, 1); continue; }
          var copy = el(node.name, afe[nAfe].tok.attrs);
          afe[nAfe] = { el: copy, tok: afe[nAfe].tok }; stack[ni] = copy; node = copy;
          if (lastNode === fb) bookmark = nAfe + 1;
          append(node, lastNode);
          lastNode = node;
        }
        append(ca, lastNode);
        var fTok = afe[afeIndexOf(fe)].tok, ne = el(fe.name, fTok.attrs);
        var kids = fb.children.slice(); kids.forEach(function (ch) { detach(ch); append(ne, ch); });
        append(fb, ne);
        var oldIdx = afeIndexOf(fe); afe.splice(oldIdx, 1); if (oldIdx < bookmark) bookmark--;
        afe.splice(bookmark, 0, { el: ne, tok: fTok });
        stack.splice(stack.indexOf(fe), 1);
        stack.splice(stack.indexOf(fb) + 1, 0, ne);
      }
    }
    function anyOtherEnd(name) {
      for (var i = stack.length - 1; i >= 0; i--) {
        var n = stack[i];
        if (n.name === name) { genImplied(name); while (stack.length > i) stack.pop(); return; }
        if (SPECIAL[n.name]) { note("</" + name + "> does not match an open element before a special one: ignored"); return; }
      }
    }
    function isWS(s) { return /^[\t\n\f\r ]*$/.test(s); }
    function splitWS(tok) { var m = /^[\t\n\f\r ]*/.exec(tok.data)[0]; return [m, tok.data.slice(m.length)]; }

    function process(tok) {
      var t = tok.type, name = tok.name;
      if (t === "StartTag" && UNSUPPORTED[name] && mode !== "text") throw ModelError("<" + name + "> has its own insertion modes (tables, forms, select, template, SVG/MathML, ruby…) and is outside this model");
      if (t === "EndTag" && UNSUPPORTED[name] && mode !== "text") throw ModelError("</" + name + "> is outside this model");
      switch (mode) {
        case "initial":
          if (t === "Character" && isWS(tok.data)) return;
          if (t === "Comment") { append(doc, { type: "comment", data: tok.data }); return; }
          if (t === "DOCTYPE") { append(doc, { type: "doctype", name: tok.name }); mode = "before html"; return; }
          note("no DOCTYPE: the document is in quirks mode"); doc.quirks = true; mode = "before html"; return process(tok);
        case "before html":
          if (t === "DOCTYPE") return;
          if (t === "Comment") { append(doc, { type: "comment", data: tok.data }); return; }
          if (t === "Character") { var w = splitWS(tok); if (!w[1]) return; tok = { type: "Character", data: w[1] }; t = "Character"; }
          if (t === "StartTag" && name === "html") { var h = el("html", tok.attrs); append(doc, h); stack.push(h); mode = "before head"; return; }
          if (t === "EndTag" && !{ head: 1, body: 1, html: 1, br: 1 }[name]) return;
          var h2 = el("html"); append(doc, h2); stack.push(h2); mode = "before head"; note("implied <html>"); return process(tok);
        case "before head":
          if (t === "Character") { var w2 = splitWS(tok); if (!w2[1]) return; tok = { type: "Character", data: w2[1] }; }
          if (t === "Comment") { append(cur(), { type: "comment", data: tok.data }); return; }
          if (t === "DOCTYPE") return;
          if (t === "StartTag" && name === "html") return mergeHtml(tok);
          if (t === "StartTag" && name === "head") { head = insertEl(tok); mode = "in head"; return; }
          if (t === "EndTag" && !{ head: 1, body: 1, html: 1, br: 1 }[name]) return;
          head = insertEl({ attrs: [] }, "head"); mode = "in head"; note("implied <head>"); return process(tok);
        case "in head":
          if (t === "Character") { var w3 = splitWS(tok); if (w3[0]) insertText(w3[0]); if (!w3[1]) return; tok = { type: "Character", data: w3[1] }; }
          if (t === "Comment") { append(cur(), { type: "comment", data: tok.data }); return; }
          if (t === "DOCTYPE") return;
          if (t === "StartTag" && name === "html") return mergeHtml(tok);
          if (t === "StartTag" && { base: 1, basefont: 1, bgsound: 1, link: 1, meta: 1 }[name]) { insertEl(tok); stack.pop(); return; }
          if (t === "StartTag" && (name === "title" || RAW[name])) { insertEl(tok); original = mode; mode = "text"; return; }
          if (t === "StartTag" && name === "head") return;
          if (t === "EndTag" && name === "head") { stack.pop(); mode = "after head"; return; }
          if (t === "EndTag" && !{ body: 1, html: 1, br: 1 }[name]) return;
          stack.pop(); mode = "after head"; note("implied </head>"); return process(tok);
        case "after head":
          if (t === "Character") { var w4 = splitWS(tok); if (w4[0]) insertText(w4[0]); if (!w4[1]) return; tok = { type: "Character", data: w4[1] }; }
          if (t === "Comment") { append(cur(), { type: "comment", data: tok.data }); return; }
          if (t === "DOCTYPE") return;
          if (t === "StartTag" && name === "html") return mergeHtml(tok);
          if (t === "StartTag" && name === "body") { insertEl(tok); mode = "in body"; return; }
          if (t === "StartTag" && IN_HEAD_TAGS[name]) { stack.push(head); note("<" + name + "> after </head>: processed as if in <head>"); var m0 = mode; mode = "in head"; process(tok); if (mode === "in head") mode = m0; var hi = stack.indexOf(head); if (hi >= 0) stack.splice(hi, 1); if (mode === "text") original = "after head"; return; }
          if (t === "StartTag" && name === "head") return;
          if (t === "EndTag" && !{ body: 1, html: 1, br: 1 }[name]) return;
          insertEl({ attrs: [] }, "body"); mode = "in body"; note("implied <body>"); return process(tok);
        case "text":
          if (t === "Character") { var td = tok.data; if (ignoreLF) { ignoreLF = false; if (td[0] === "\n") td = td.slice(1); if (!td) return; } insertText(td); return; }
          ignoreLF = false;
          if (t === "EOF") { stack.pop(); mode = original; return process(tok); }
          if (t === "EndTag") { stack.pop(); mode = original; return; }
          return;
        case "in body": return inBody(tok);
        case "after body":
          if (t === "Character" && isWS(tok.data)) return inBody(tok);
          if (t === "Comment") { append(stack[0], { type: "comment", data: tok.data }); return; }
          if (t === "DOCTYPE") return;
          if (t === "StartTag" && name === "html") return mergeHtml(tok);
          if (t === "EndTag" && name === "html") { mode = "after after body"; return; }
          if (t === "EOF") return;
          note("content after </body>: back to in body"); mode = "in body"; return process(tok);
        case "after after body":
          if (t === "Comment") { append(doc, { type: "comment", data: tok.data }); return; }
          if (t === "Character" && isWS(tok.data)) return inBody(tok);
          if (t === "DOCTYPE") return;
          if (t === "StartTag" && name === "html") return mergeHtml(tok);
          if (t === "EOF") return;
          mode = "in body"; return process(tok);
      }
    }
    function mergeHtml(tok) { var h = stack[0]; tok.attrs.forEach(function (a) { if (!h.attrs.some(function (x) { return x[0] === a[0]; })) h.attrs.push(a.slice()); }); }
    function inBody(tok) {
      var t = tok.type, name = tok.name;
      if (t === "Character") {
        var d = tok.data;
        if (ignoreLF) { ignoreLF = false; if (d[0] === "\n") d = d.slice(1); if (!d) return; }
        reconstruct(); insertText(d); return;
      }
      ignoreLF = false;
      if (t === "Comment") { append(cur(), { type: "comment", data: tok.data }); return; }
      if (t === "DOCTYPE") return;
      if (t === "EOF") return;
      if (t === "StartTag") {
        if (name === "html") return mergeHtml(tok);
        if (IN_HEAD_TAGS[name]) { if (name === "title" || RAW[name]) { insertEl(tok); original = "in body"; mode = "text"; return; } insertEl(tok); stack.pop(); return; }
        if (name === "body") { var b = stack[1]; if (b && b.name === "body") tok.attrs.forEach(function (a) { if (!b.attrs.some(function (x) { return x[0] === a[0]; })) b.attrs.push(a.slice()); }); return; }
        if (BLOCKS[name]) { closeP(); insertEl(tok); return; }
        if (HEADINGS[name]) { closeP(); if (HEADINGS[cur().name]) { note("a heading inside a heading: close the first one"); stack.pop(); } insertEl(tok); return; }
        if (name === "pre" || name === "listing") { closeP(); insertEl(tok); ignoreLF = true; return; }
        if (name === "li" || name === "dd" || name === "dt") {
          var targets = name === "li" ? { li: 1 } : { dd: 1, dt: 1 };
          for (var i = stack.length - 1; i >= 0; i--) {
            var node = stack[i];
            if (targets[node.name]) { genImplied(node.name); popUntil(node.name); note("a new <" + name + "> closes the open <" + node.name + ">"); break; }
            if (SPECIAL[node.name] && !{ address: 1, div: 1, p: 1 }[node.name]) break;
          }
          closeP(); insertEl(tok); return;
        }
        if (name === "button") { if (inScope("button")) { genImplied(); popUntil("button"); note("a <button> inside a <button> closes the first"); } reconstruct(); insertEl(tok); return; }
        if (name === "a") {
          for (var j = afe.length - 1; j >= 0 && afe[j] !== "marker"; j--) if (afe[j].el.name === "a") {
            note("an <a> inside an <a>: run the adoption agency to close the first");
            var old = afe[j].el; adoptionAgency("a");
            var oi = afeIndexOf(old); if (oi >= 0) afe.splice(oi, 1); var si = stack.indexOf(old); if (si >= 0) stack.splice(si, 1);
            break;
          }
          reconstruct(); var ae = insertEl(tok); pushAFE(ae, tok); return;
        }
        if (FORMATTING[name]) {
          reconstruct();
          if (name === "nobr" && inScope("nobr")) { adoptionAgency("nobr"); reconstruct(); }
          var fe = insertEl(tok); pushAFE(fe, tok); return;
        }
        if ({ area: 1, br: 1, embed: 1, img: 1, keygen: 1, wbr: 1, input: 1 }[name]) { reconstruct(); insertEl(tok); stack.pop(); return; }
        if ({ param: 1, source: 1, track: 1 }[name]) { insertEl(tok); stack.pop(); return; }
        if (name === "hr") { closeP(); insertEl(tok); stack.pop(); return; }
        if (name === "textarea") { insertEl(tok); ignoreLF = true; original = "in body"; mode = "text"; return; }
        if (name === "xmp") { closeP(); reconstruct(); insertEl(tok); original = "in body"; mode = "text"; return; }
        if (name === "iframe" || name === "noembed") { insertEl(tok); original = "in body"; mode = "text"; return; }
        if ({ caption: 1, col: 1, colgroup: 1, frame: 1, head: 1, tbody: 1, td: 1, tfoot: 1, th: 1, thead: 1, tr: 1 }[name]) return;
        reconstruct(); insertEl(tok); return;
      }
      // end tags
      if (name === "body" || name === "html") {
        if (!inScope("body")) return;
        mode = "after body"; if (name === "html") return process(tok); return;
      }
      if (CLOSE_BLOCKS[name]) {
        if (!inScope(name)) { note("</" + name + "> with no open <" + name + "> in scope: ignored"); return; }
        genImplied(); popUntil(name); return;
      }
      if (name === "p") {
        if (!inScope("p", BUTTON_SCOPE)) { note("</p> with no open <p>: insert an empty <p> first"); insertEl({ attrs: [] }, "p"); }
        genImplied("p"); popUntil("p"); return;
      }
      if (name === "li") { if (!inScope("li", LIST_SCOPE)) return; genImplied("li"); popUntil("li"); return; }
      if (name === "dd" || name === "dt") { if (!inScope(name)) return; genImplied(name); popUntil(name); return; }
      if (HEADINGS[name]) {
        if (!inScope(function (n) { return HEADINGS[n.name]; })) return;
        genImplied(); popUntilFn(function (n) { return HEADINGS[n.name]; }); return;
      }
      if (FORMATTING[name]) return adoptionAgency(name);
      if (name === "br") { note("</br> is treated as <br>"); reconstruct(); insertEl({ attrs: [] }, "br"); stack.pop(); return; }
      return anyOtherEnd(name);
    }

    var error = null;
    try {
      tokens.forEach(function (tok) {
        var before = mode; notes = [];
        process(tok);
        if (opts.trace) steps.push({ token: tok, modeBefore: before, modeAfter: mode, stack: stack.map(function (e) { return e.name; }), afe: afe.map(function (x) { return x === "marker" ? "marker" : x.el.name; }), notes: notes.slice(), tree: opts.trace ? serialize(doc) : null });
      });
    } catch (e) { if (e && e.model) error = e.message; else throw e; }
    return { doc: doc, tokens: tokens, steps: steps, error: error, quirks: !!doc.quirks };
  }

  // html5lib-style tree dump (the format browsers' parser tests use)
  function serialize(doc) {
    var out = [];
    function walk(n, d) {
      var pad = "| " + new Array(d * 2 + 1).join(" ");
      if (n.type === "doctype") out.push(pad + "<!DOCTYPE " + n.name + ">");
      else if (n.type === "comment") out.push(pad + "<!-- " + n.data + " -->");
      else if (n.type === "text") out.push(pad + JSON.stringify(n.data));
      else {
        out.push(pad + "<" + n.name + ">");
        n.attrs.slice().sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).forEach(function (a) { out.push(pad + "  " + a[0] + "=" + JSON.stringify(a[1])); });
        n.children.forEach(function (c) { walk(c, d + 1); });
      }
    }
    doc.children.forEach(function (c) { walk(c, 0); });
    return out.join("\n");
  }
  // The same dump for a real DOM Document (used in the browser and by the Chrome check).
  function serializeDOM(document) {
    var out = [];
    function walk(n, d) {
      var pad = "| " + new Array(d * 2 + 1).join(" ");
      if (n.nodeType === 10) out.push(pad + "<!DOCTYPE " + n.name + ">");
      else if (n.nodeType === 8) out.push(pad + "<!-- " + n.data + " -->");
      else if (n.nodeType === 3) out.push(pad + JSON.stringify(n.data));
      else if (n.nodeType === 1) {
        out.push(pad + "<" + n.localName + ">");
        Array.prototype.slice.call(n.attributes).map(function (a) { return [a.name, a.value]; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).forEach(function (a) { out.push(pad + "  " + a[0] + "=" + JSON.stringify(a[1])); });
        Array.prototype.forEach.call(n.childNodes, function (c) { walk(c, d + 1); });
      }
    }
    Array.prototype.forEach.call(document.childNodes, function (c) { walk(c, 0); });
    return out.join("\n");
  }
  return { tokenize: tokenize, build: build, serialize: serialize, serializeDOM: serializeDOM };
})();
if (typeof module !== "undefined") module.exports = HtmlModel;
