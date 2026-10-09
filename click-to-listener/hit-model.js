/* HitModel: which element a point hits, the way Blink's PaintLayer::HitTestLayer finds it:
 * walk the painting order backwards and take the first box that contains the point and accepts
 * pointer events.
 *
 * A scene is a few lines, one absolutely positioned box each, inside a 360 × 240 stage that is
 * itself a stacking context (position: relative; z-index: 0):
 *
 *   box a 20 20 200 140
 *   box b 60 40 120 120 in a z=2
 *   box c 100 60 120 80 z=-1 pe=none
 *   box d 10 10 80 60 in c pe=auto hidden clip
 *
 *   box ID LEFT TOP WIDTH HEIGHT [in PARENT] [z=N|z=auto] [pe=none|pe=auto] [hidden|visible] [clip]
 *     LEFT/TOP are relative to the parent box (or the stage). Without "in", the parent is the stage.
 *     z      z-index (default auto). A number makes the box a stacking context.
 *     pe     pointer-events. Inherited when not given, like the real property.
 *     hidden / visible   visibility, also inherited.
 *     clip   overflow: hidden, which clips the box's descendants.
 *
 * paintOrder(scene) lists boxes back to front (CSS 2.2 Appendix E for positioned boxes):
 *   the stacking context's own box, then children with negative z (most negative first),
 *   then z-index auto and 0 in tree order, then positive z (lowest first). A z-index:auto box's
 *   positioned descendants take part in the parent's order; a numbered box paints its whole
 *   subtree together.
 * hitTest(scene, x, y) walks that list from the front and explains each box it passes.
 * Not modelled: transforms, opacity and other properties that also make stacking contexts,
 * non-positioned (in-flow) content, text, border-radius, scrollbars, iframes.
 */
(function (root) {
  "use strict";
  var W = 360, H = 240;

  function parse(text) {
    var boxes = [], byId = { stage: null }, stage = { id: "stage", x: 0, y: 0, w: W, h: H, z: 0, pe: "auto", vis: "visible", clip: false, children: [], parent: null, abs: { x: 0, y: 0 } };
    text.split("\n").forEach(function (raw, i) {
      var line = raw.replace(/#.*$/, "").trim(), where = "line " + (i + 1);
      if (!line) return;
      var w = line.split(/\s+/);
      if (w[0] !== "box") throw new Error(where + ": lines start with 'box'");
      if (w.length < 6) throw new Error(where + ": box ID LEFT TOP WIDTH HEIGHT …");
      var id = w[1];
      if (!/^[a-z][\w-]*$/i.test(id) || id === "stage") throw new Error(where + ": bad id '" + id + "'");
      if (byId[id] !== undefined) throw new Error(where + ": duplicate id " + id);
      var nums = w.slice(2, 6).map(Number);
      if (nums.some(function (n) { return !isFinite(n) || n !== Math.round(n); })) throw new Error(where + ": LEFT TOP WIDTH HEIGHT must be whole numbers");
      if (nums[2] < 0 || nums[3] < 0) throw new Error(where + ": width and height cannot be negative");
      var b = { id: id, x: nums[0], y: nums[1], w: nums[2], h: nums[3], z: "auto", pe: null, vis: null, clip: false, children: [], parent: stage, line: i + 1 };
      for (var k = 6; k < w.length; k++) {
        var t = w[k], m;
        if (t === "in") { var p = w[++k]; if (!p || byId[p] === undefined) throw new Error(where + ": 'in' needs an earlier box id"); b.parent = p === "stage" ? stage : byId[p]; }
        else if ((m = /^z=(auto|-?\d+)$/.exec(t))) b.z = m[1] === "auto" ? "auto" : +m[1];
        else if ((m = /^pe=(none|auto)$/.exec(t))) b.pe = m[1];
        else if (t === "hidden" || t === "visible") b.vis = t;
        else if (t === "clip") b.clip = true;
        else throw new Error(where + ": unknown word '" + t + "'");
      }
      b.parent.children.push(b); byId[id] = b; boxes.push(b);
    });
    // absolute rects, inherited properties, clip rects (each box is the containing block of its children)
    (function walk(n, clipRect) {
      n.children.forEach(function (c) {
        c.abs = { x: n.abs.x + c.x, y: n.abs.y + c.y };
        c.cpe = c.pe || n.cpe || n.pe; c.cvis = c.vis || n.cvis || n.vis;
        c.clipRect = clipRect;
        walk(c, c.clip ? intersect(clipRect, { x: c.abs.x, y: c.abs.y, w: c.w, h: c.h }) : clipRect);
      });
    })(stage, { x: 0, y: 0, w: W, h: H }); // the stage clips too (overflow: hidden), so nothing outside it is hit
    stage.cpe = "auto"; stage.cvis = "visible";
    return { stage: stage, boxes: boxes, byId: byId };
  }
  function intersect(a, b) { var x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x: x, y: y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }; }
  function inside(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

  // back-to-front list of boxes for the stacking context rooted at ctx
  function order(ctx) {
    var units = [], idx = 0;
    (function walk(n) {
      n.children.forEach(function (c) {
        if (c.z !== "auto") units.push({ z: c.z, i: idx++, ctx: c });
        else { units.push({ z: 0, i: idx++, self: c }); walk(c); }
      });
    })(ctx);
    var by = function (a, b) { return a.z - b.z || a.i - b.i; };
    var neg = units.filter(function (u) { return u.z < 0; }).sort(by);
    var zero = units.filter(function (u) { return u.z === 0; }).sort(function (a, b) { return a.i - b.i; });
    var pos = units.filter(function (u) { return u.z > 0; }).sort(by);
    var out = [ctx];
    neg.concat(zero, pos).forEach(function (u) { if (u.ctx) out = out.concat(order(u.ctx)); else out.push(u.self); });
    return out;
  }
  function paintOrder(scene) { return order(scene.stage); }

  function hitTest(scene, x, y) {
    var list = paintOrder(scene), why = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i], rect = b === scene.stage ? { x: 0, y: 0, w: W, h: H } : intersect(b.clipRect, { x: b.abs.x, y: b.abs.y, w: b.w, h: b.h });
      var raw = b === scene.stage || inside({ x: b.abs.x, y: b.abs.y, w: b.w, h: b.h }, x, y);
      if (!raw) { why.push({ id: b.id, result: "outside" }); continue; }
      if (!inside(rect, x, y)) { why.push({ id: b.id, result: "clipped" }); continue; }
      if (b.cvis === "hidden") { why.push({ id: b.id, result: "visibility: hidden" }); continue; }
      if (b.cpe === "none") { why.push({ id: b.id, result: "pointer-events: none" }); continue; }
      why.push({ id: b.id, result: "hit" });
      return { hit: b.id, why: why, order: list.map(function (n) { return n.id; }) };
    }
    return { hit: null, why: why, order: list.map(function (n) { return n.id; }) };
  }

  // A real DOM copy of the scene (used by the lab and by the verifier). Colours are rgba backgrounds,
  // not opacity, because opacity below 1 would create stacking contexts and change the answer.
  // With labels, each box shows its id in a positioned span with pointer-events: none, which
  // hit testing skips, so the labels never change what is hit.
  function toHTML(scene, opts) {
    var COLORS = ["122,162,247", "224,175,104", "158,206,106", "247,118,142", "187,154,247", "125,207,255", "255,158,100", "192,202,245"];
    var ci = 0, labels = opts && opts.labels;
    function el(b) {
      var s = "position:absolute;left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px;z-index:" + b.z +
        (b.pe ? ";pointer-events:" + b.pe : "") + (b.vis ? ";visibility:" + b.vis : "") + (b.clip ? ";overflow:hidden" : "") +
        ";background:rgba(" + COLORS[(ci++) % COLORS.length] + ",.62);box-shadow:inset 0 0 0 1px rgba(0,0,0,.45)";
      var lab = labels ? '<span style="position:absolute;left:3px;top:1px;pointer-events:none;font:11px/1.2 monospace;color:#141a22">' + b.id + (b.z !== "auto" ? " z" + b.z : "") + (b.pe === "none" ? " pe:none" : "") + "</span>" : "";
      return '<div id="' + b.id + '" data-box style="' + s + '">' + lab + b.children.map(el).join("") + "</div>";
    }
    return '<div id="stage" style="position:relative;z-index:0;width:' + W + "px;height:" + H + 'px;overflow:hidden;background:#eef1f5">' + scene.stage.children.map(el).join("") + "</div>";
  }

  var PRESETS = [
    ["Tree order, then z-index", "box a 30 30 180 120\nbox b 120 70 180 120\nbox c 60 110 120 90 z=1"],
    ["Negative z-index goes under", "box a 30 30 220 150\nbox b 80 60 200 140 z=-1\nbox c 140 20 90 60 in a"],
    ["pointer-events: none overlay", "box card 40 40 220 140\nbox btn 30 30 120 50 in card\nbox overlay 20 20 300 180 pe=none"],
    ["A child that opts back in", "box overlay 20 20 300 190 pe=none\nbox hole 100 60 100 60 in overlay pe=auto"],
    ["Stacking contexts trap z-index", "box a 20 20 200 160 z=1\nbox a1 20 20 140 80 in a z=100\nbox b 120 60 200 160 z=2"],
    ["z-index: auto lets children escape", "box a 20 20 200 160\nbox a1 20 20 140 80 in a z=100\nbox b 120 60 200 160 z=2"],
    ["overflow: hidden clips children", "box frame 40 40 160 120 clip\nbox inner 100 60 200 120 in frame\nbox under 220 90 120 120 z=-1"],
    ["visibility: hidden", "box a 40 30 200 160 hidden\nbox b 30 30 100 80 in a visible\nbox c 160 100 160 120 z=-1"]
  ];

  var api = { parse: parse, paintOrder: paintOrder, hitTest: hitTest, toHTML: toHTML, PRESETS: PRESETS, W: W, H: H };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HitModel = api;
})(this);
