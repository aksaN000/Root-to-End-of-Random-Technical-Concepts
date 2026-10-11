/* Root to End: what CSS Tailwind CSS 4 writes for one class name. Our own model of the everyday
   utilities (layout, spacing, sizing, type, colour, borders, position) and variants (hover:, lg:, …),
   following Tailwind's utilities.ts and variants.ts. Theme values come from tailwind-theme.js (copied
   from Tailwind's theme.css). Checked against the real Tailwind compiler in verify/compare-tailwind.js.
   Runs in the browser and in Node. */
(function (g) {
  "use strict";
  var TH = (typeof module !== "undefined" && module.exports) ? require("./tailwind-theme.js") : g.TW_THEME;
  var V = TH.vars;

  /* ---------- the class name as a CSS selector (CSS.escape rules) ---------- */
  function cssEscape(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], code = s.charCodeAt(i);
      if (/[0-9]/.test(c) && (i === 0 || (i === 1 && s[0] === "-"))) out += "\\3" + c + " ";
      else if (/[a-zA-Z0-9_-]/.test(c) || code >= 128) out += c;
      else out += "\\" + c;
    }
    return out;
  }

  /* ---------- values ---------- */
  function isMultiple(v, d) { var n = Number(v); return v !== "" && n >= 0 && n % d === 0 && String(n) === String(v); }
  function isPosInt(v) { var n = Number(v); return Number.isInteger(n) && n >= 0 && String(n) === String(v); }
  function isStrictPosInt(v) { var n = Number(v); return Number.isInteger(n) && n > 0 && String(n) === String(v); }
  function used(name, list) { if (list.indexOf(name) < 0) list.push(name); return "var(" + name + ")"; }
  // a spacing value such as 4, 2.5, px, 0 or a fraction such as 1/2
  function spacing(val, neg, vars, opts) {
    opts = opts || {};
    if (val === "px") return neg ? "-1px" : "1px";
    if (opts.fractions && /^\d+\/\d+$/.test(val)) {
      var p = val.split("/");
      if (isPosInt(p[0]) && isStrictPosInt(p[1])) return neg ? "calc(calc(" + p[0] + " / " + p[1] + " * 100%) * -1)" : "calc(" + p[0] + " / " + p[1] + " * 100%)";
      return null;
    }
    if (!isMultiple(val, 0.25)) return null;
    if (Number(val) === 0) return "0px";
    used("--spacing", vars);
    if (Number(val) === 1 && !neg) return "var(--spacing)"; // Tailwind simplifies "* 1" away
    return "calc(var(--spacing) * " + (neg ? "-" : "") + val + ")";
  }
  function themed(ns, key, vars) { var k = "--" + ns + "-" + key; return Object.prototype.hasOwnProperty.call(V, k) ? used(k, vars) : null; }
  var COLOR_KW = { transparent: "transparent", current: "currentcolor", inherit: "inherit" };
  function color(key, vars) { if (COLOR_KW[key]) return COLOR_KW[key]; return themed("color", key, vars); }

  /* ---------- utilities: name -> declarations ---------- */
  var STATIC = {
    block: [["display", "block"]], "inline-block": [["display", "inline-block"]], inline: [["display", "inline"]], flex: [["display", "flex"]],
    "inline-flex": [["display", "inline-flex"]], grid: [["display", "grid"]], "inline-grid": [["display", "inline-grid"]], hidden: [["display", "none"]], contents: [["display", "contents"]],
    static: [["position", "static"]], fixed: [["position", "fixed"]], absolute: [["position", "absolute"]], relative: [["position", "relative"]], sticky: [["position", "sticky"]],
    "flex-row": [["flex-direction", "row"]], "flex-row-reverse": [["flex-direction", "row-reverse"]], "flex-col": [["flex-direction", "column"]], "flex-col-reverse": [["flex-direction", "column-reverse"]],
    "flex-wrap": [["flex-wrap", "wrap"]], "flex-nowrap": [["flex-wrap", "nowrap"]], "flex-1": [["flex", "1"]], "flex-auto": [["flex", "auto"]], "flex-none": [["flex", "none"]],
    grow: [["flex-grow", "1"]], "shrink-0": [["flex-shrink", "0"]],
    "items-start": [["align-items", "flex-start"]], "items-end": [["align-items", "flex-end"]], "items-center": [["align-items", "center"]], "items-baseline": [["align-items", "baseline"]], "items-stretch": [["align-items", "stretch"]],
    "justify-start": [["justify-content", "flex-start"]], "justify-end": [["justify-content", "flex-end"]], "justify-center": [["justify-content", "center"]], "justify-between": [["justify-content", "space-between"]], "justify-around": [["justify-content", "space-around"]], "justify-evenly": [["justify-content", "space-evenly"]],
    "text-left": [["text-align", "left"]], "text-center": [["text-align", "center"]], "text-right": [["text-align", "right"]], "text-justify": [["text-align", "justify"]],
    "overflow-hidden": [["overflow", "hidden"]], "overflow-auto": [["overflow", "auto"]], "overflow-visible": [["overflow", "visible"]], "overflow-scroll": [["overflow", "scroll"]], "overflow-x-auto": [["overflow-x", "auto"]], "overflow-y-auto": [["overflow-y", "auto"]],
    "cursor-pointer": [["cursor", "pointer"]], "cursor-default": [["cursor", "default"]], "cursor-not-allowed": [["cursor", "not-allowed"]], "cursor-wait": [["cursor", "wait"]], "cursor-text": [["cursor", "text"]], "cursor-move": [["cursor", "move"]],
    underline: [["text-decoration-line", "underline"]], "no-underline": [["text-decoration-line", "none"]], "line-through": [["text-decoration-line", "line-through"]],
    uppercase: [["text-transform", "uppercase"]], lowercase: [["text-transform", "lowercase"]], capitalize: [["text-transform", "capitalize"]], italic: [["font-style", "italic"]],
    "rounded-none": [["border-radius", "0"]], "rounded-full": [["border-radius", "calc(infinity * 1px)"]], rounded: [["border-radius", "0.25rem"]],
    "w-full": [["width", "100%"]], "w-screen": [["width", "100vw"]], "w-auto": [["width", "auto"]], "h-full": [["height", "100%"]], "h-screen": [["height", "100vh"]], "h-auto": [["height", "auto"]],
    "min-h-screen": [["min-height", "100vh"]], "max-w-none": [["max-width", "none"]], "max-w-full": [["max-width", "100%"]], "max-w-prose": [["max-width", "65ch"]],
    "z-auto": [["z-index", "auto"]], "col-span-full": [["grid-column", "1 / -1"]]
  };
  var PAD = { p: ["padding"], px: ["padding-inline"], py: ["padding-block"], ps: ["padding-inline-start"], pe: ["padding-inline-end"], pt: ["padding-top"], pr: ["padding-right"], pb: ["padding-bottom"], pl: ["padding-left"] };
  var MAR = { m: ["margin"], mx: ["margin-inline"], my: ["margin-block"], ms: ["margin-inline-start"], me: ["margin-inline-end"], mt: ["margin-top"], mr: ["margin-right"], mb: ["margin-bottom"], ml: ["margin-left"] };
  var INSET = { inset: ["inset"], "inset-x": ["inset-inline"], "inset-y": ["inset-block"], top: ["top"], right: ["right"], bottom: ["bottom"], left: ["left"] };
  var SIZE = { w: ["width"], h: ["height"], size: ["width", "height"], "min-w": ["min-width"], "min-h": ["min-height"], "max-w": ["max-width"], "max-h": ["max-height"] };
  var GAP = { gap: ["gap"], "gap-x": ["column-gap"], "gap-y": ["row-gap"] };
  var BORDER = { "": ["border"], x: ["border-inline"], y: ["border-block"], t: ["border-top"], r: ["border-right"], b: ["border-bottom"], l: ["border-left"], s: ["border-inline-start"], e: ["border-inline-end"] };
  var RADIUS = { "": ["border-radius"], t: ["border-top-left-radius", "border-top-right-radius"], r: ["border-top-right-radius", "border-bottom-right-radius"], b: ["border-bottom-right-radius", "border-bottom-left-radius"], l: ["border-top-left-radius", "border-bottom-left-radius"], tl: ["border-top-left-radius"], tr: ["border-top-right-radius"], br: ["border-bottom-right-radius"], bl: ["border-bottom-left-radius"] };
  function all(props, v) { return props.map(function (p) { return [p, v]; }); }
  function longest(map, name) { var best = null; Object.keys(map).forEach(function (k) { if (name.indexOf(k + "-") === 0 && (!best || k.length > best.length)) best = k; }); return best; }

  function utility(name, vars) {
    if (Object.prototype.hasOwnProperty.call(STATIC, name)) return STATIC[name];
    var neg = name.charAt(0) === "-", base = neg ? name.slice(1) : name, k, v, val;
    // spacing families
    if ((k = longest(PAD, base)) && !neg) { v = spacing(base.slice(k.length + 1), false, vars); return v && all(PAD[k], v); }
    if ((k = longest(MAR, base))) { val = base.slice(k.length + 1); if (val === "auto" && !neg) return all(MAR[k], "auto"); v = spacing(val, neg, vars); return v && all(MAR[k], v); }
    if ((k = longest(GAP, base)) && !neg) { v = spacing(base.slice(k.length + 1), false, vars); return v && all(GAP[k], v); }
    if ((k = longest(INSET, base))) { val = base.slice(k.length + 1); if (val === "auto" && !neg) return all(INSET[k], "auto"); if (val === "full") return all(INSET[k], neg ? "-100%" : "100%"); v = spacing(val, neg, vars, { fractions: true }); return v && all(INSET[k], v); }
    if ((k = longest(SIZE, base)) && !neg) {
      val = base.slice(k.length + 1);
      var horiz = /w$/.test(k), KW = { auto: "auto", full: "100%", screen: k === "size" ? null : horiz ? "100vw" : "100vh" };
      if (Object.prototype.hasOwnProperty.call(KW, val)) return KW[val] && !(val === "auto" && /^max-/.test(k)) ? all(SIZE[k], KW[val]) : null;
      if (k === "max-w" || k === "w" || k === "min-w") { v = themed("container", val, vars); if (v) return all(SIZE[k], v); } // container sizes are for widths only
      v = spacing(val, false, vars, { fractions: true }); return v && all(SIZE[k], v);
    }
    if (neg) return null;
    // z-index, opacity, grid
    if (/^z-/.test(name)) { val = name.slice(2); return isPosInt(val) ? [["z-index", val]] : null; }
    if (/^opacity-/.test(name)) { val = name.slice(8); return isMultiple(val, 0.25) ? [["opacity", val + "%"]] : null; }
    if (/^grid-cols-/.test(name)) { val = name.slice(10); return isStrictPosInt(val) ? [["grid-template-columns", "repeat(" + val + ", minmax(0, 1fr))"]] : val === "none" ? [["grid-template-columns", "none"]] : null; }
    if (/^col-span-/.test(name)) { val = name.slice(9); return isPosInt(val) ? [["grid-column", "span " + val + " / span " + val]] : null; }
    // type
    if (/^text-/.test(name)) {
      val = name.slice(5);
      if (themed("text", val, [])) { used("--text-" + val, vars); used("--text-" + val + "--line-height", vars); return [["font-size", "var(--text-" + val + ")"], ["line-height", "var(--tw-leading, var(--text-" + val + "--line-height))"]]; }
      v = color(val, vars); return v && [["color", v]];
    }
    if (/^font-/.test(name)) { v = themed("font-weight", name.slice(5), vars); return v && [["--tw-font-weight", v], ["font-weight", v]]; }
    if (/^tracking-/.test(name)) { v = themed("tracking", name.slice(9), vars); return v && [["--tw-tracking", v], ["letter-spacing", v]]; }
    if (/^leading-/.test(name)) {
      val = name.slice(8);
      if (val === "none") return [["--tw-leading", "1"], ["line-height", "1"]];
      v = themed("leading", val, vars) || spacing(val, false, vars); return v && [["--tw-leading", v], ["line-height", v]];
    }
    if (/^bg-/.test(name)) { v = color(name.slice(3), vars); return v && [["background-color", v]]; }
    // borders: width, then colour
    var bm = name.match(/^border(?:-(x|y|t|r|b|l|s|e))?(?:-(\d+))?$/);
    if (bm) { var sides = BORDER[bm[1] || ""], w = bm[2] === undefined ? "1" : bm[2]; if (!isPosInt(w)) return null; return [[sides[0] + "-style", "var(--tw-border-style)"], [sides[0] + "-width", w + "px"]]; }
    if (/^border-/.test(name)) { v = color(name.slice(7), vars); return v && [["border-color", v]]; }
    var rm = name.match(/^rounded(?:-(tl|tr|br|bl|t|r|b|l))?(?:-([a-z0-9]+))?$/);
    if (rm) {
      var props = RADIUS[rm[1] || ""], key = rm[2];
      if (key === undefined) return all(props, "0.25rem");
      if (key === "none") return all(props, "0");
      if (key === "full") return all(props, "calc(infinity * 1px)");
      v = themed("radius", key, vars); return v && all(props, v);
    }
    return null;
  }

  /* ---------- variants: name -> how it wraps the rule ---------- */
  var PSEUDO = { focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within", active: ":active", disabled: ":disabled", enabled: ":enabled", first: ":first-child", last: ":last-child", odd: ":nth-child(odd)", even: ":nth-child(even)", visited: ":visited", checked: ":checked" };
  function variant(name) {
    if (name === "hover") return { media: "(hover: hover)", pseudo: ":hover", note: "only while a mouse pointer is over it (and only on devices that can hover)" };
    if (name === "group-hover") return { media: "(hover: hover)", pseudo: ":is(:where(.group):hover *)", note: "only while the mouse is over an ancestor that has the class group" };
    if (name === "print") return { media: "print", note: "only when the page is printed" };
    if (PSEUDO[name]) return { pseudo: PSEUDO[name], note: "only when the element matches " + PSEUDO[name] };
    if (name === "dark") return { media: "(prefers-color-scheme: dark)", note: "only when the reader's system is in dark mode" };
    var bp = name.match(/^(max-)?(sm|md|lg|xl|2xl)$/);
    if (bp) { var w = V["--breakpoint-" + bp[2]]; return { media: "(width " + (bp[1] ? "<" : ">=") + " " + w + ")", note: (bp[1] ? "only below " : "only from ") + w + " (" + parseFloat(w) * 16 + "px) " + (bp[1] ? "wide" : "wide and up") }; }
    return null;
  }

  /* ---------- one class name -> the CSS Tailwind writes ---------- */
  function splitVariants(cls) { var parts = cls.split(":"); return { variants: parts.slice(0, -1), name: parts[parts.length - 1] }; }
  function css(cls) {
    var sv = splitVariants(cls), vars = [], decls = utility(sv.name, vars);
    if (!decls || !sv.name) return { cls: cls, ok: false, reason: sv.name ? "not a class this lab knows (or not a Tailwind class at all)" : "empty" };
    var vs = [];
    for (var i = 0; i < sv.variants.length; i++) { var v = variant(sv.variants[i]); if (!v) return { cls: cls, ok: false, reason: "unknown variant \"" + sv.variants[i] + ":\"" }; vs.push(v); }
    var selector = "." + cssEscape(cls) + vs.map(function (v) { return v.pseudo || ""; }).join("");
    var medias = vs.filter(function (v) { return v.media; }).map(function (v) { return v.media; });
    var lines = [], ind = "";
    medias.forEach(function (m) { lines.push(ind + "@media " + m + " {"); ind += "  "; });
    lines.push(ind + selector + " {");
    decls.forEach(function (d) { lines.push(ind + "  " + d[0] + ": " + d[1] + ";"); });
    lines.push(ind + "}");
    for (var j = medias.length - 1; j >= 0; j--) { ind = ind.slice(2); lines.push(ind + "}"); }
    var theme = {}; vars.forEach(function (k) { theme[k] = V[k]; });
    return { cls: cls, ok: true, text: lines.join("\n"), decls: decls, selector: selector, medias: medias, variants: vs, theme: theme };
  }
  // what a value works out to, in plain units, using the theme (for the lab's "= 16px" notes)
  function resolve(value) {
    var s = String(value), guard = 0;
    while (/var\((--[a-z0-9-]+)(?:, ([^()]*))?\)/.test(s) && guard++ < 10) s = s.replace(/var\((--[a-z0-9-]+)(?:, ([^()]*))?\)/, function (m, k, fb) { return V[k] || fb || (k === "--tw-border-style" ? "solid" : "initial"); }); // Tailwind registers --tw-border-style with @property, initial value solid
    var m = s.match(/^calc\(([0-9.]+)rem \* (-?[0-9.]+)\)$/);
    if (m) { var rem = +m[1] * +m[2]; return +rem.toFixed(4) + "rem = " + +(rem * 16).toFixed(2) + "px"; }
    m = s.match(/^(-?[0-9.]+)rem$/); if (m) return s + " = " + +(+m[1] * 16).toFixed(2) + "px";
    return s === value ? null : s;
  }
  var API = { css: css, resolve: resolve, cssEscape: cssEscape, utility: utility, variant: variant, theme: TH,
    PRESETS: ["sticky top-0 z-50 bg-white border-b border-gray-100", "max-w-6xl mx-auto px-4 h-16 flex items-center justify-between", "hidden lg:flex gap-8 text-sm text-gray-600", "hover:text-pink-600", "text-4xl lg:text-6xl font-bold leading-tight", "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", "px-5 py-2.5 rounded-full cursor-pointer", "disabled:opacity-50 w-1/2 -mt-4"] };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else g.TailwindModel = API;
})(this);
