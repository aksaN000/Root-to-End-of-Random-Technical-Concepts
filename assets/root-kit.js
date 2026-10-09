/* Root to End shared kit.
   - <a class="rd" data-r="id1,id2"></a>   numbered reading footnote; click opens cards under the paragraph
   - <section data-deeper="id1,id2">        appends a "Go deeper" strip at the end of the section
   - <div id="reading-list"></div>          filled with every reference used on the page, grouped by level
   - <div class="quiz"><script type="application/json">{...}</script></div>   predict-the-output quiz
   - <div class="exq" data-marks="5"><div class="q">…</div><div class="a">…</div></div>   exam question, answer hidden
   - every main section gets a "report a mistake" link; main gets a footer with issue links
   - figure.src gets an evidence label (observed / source / example via data-kind); .scope[data-kind] boxes get a header
   Requires assets/reading.js (window.ROOT_READING) to be loaded first. */
(function () {
  "use strict";
  var R = window.ROOT_READING || {};
  var order = [], num = {};
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function ids(s) { return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(function (x) { return R[x]; }); }
  function number(id) { if (!num[id]) { order.push(id); num[id] = order.length; } return num[id]; }
  var LVL = { start: "start here", deep: "go deeper", source: "primary source" };
  function title(r) { return r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.t) + "</a>" : esc(r.t); }
  function card(id) {
    var r = R[id];
    return '<div class="rk-card"><span class="n">[' + number(id) + ']</span>' +
      '<span class="tt">' + title(r) + '<span class="rk-lvl ' + r.lvl + '">' + LVL[r.lvl] + '</span></span>' +
      '<span class="by">' + esc(r.a) + (r.url ? "" : " · print book") + '</span>' +
      '<span class="wh"><b>Read</b>' + esc(r.w) + '. ' + esc(r.why) + '</span></div>';
  }

  /* 1. number every reference in document order (footnotes and strips together) */
  var marks = [].slice.call(document.querySelectorAll("a.rd, [data-deeper]"));
  marks.forEach(function (el) { ids(el.getAttribute(el.classList.contains("rd") ? "data-r" : "data-deeper")).forEach(number); });

  /* 2. footnote markers */
  [].slice.call(document.querySelectorAll("a.rd")).forEach(function (a) {
    var list = ids(a.getAttribute("data-r"));
    if (!list.length) { a.remove(); return; }
    a.textContent = list.map(function (id) { return number(id); }).join(",");
    a.href = "#ref-" + list[0];
    a.setAttribute("role", "button");
    a.setAttribute("aria-expanded", "false");
    a.title = list.map(function (id) { return R[id].t; }).join(" · ");
    var box = null;
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (box) { box.remove(); box = null; a.setAttribute("aria-expanded", "false"); return; }
      var host = a.closest("p, li, td, .callout, .claim, figcaption, .note, div") || a.parentNode;
      box = document.createElement("div");
      box.className = "rk-cards";
      box.innerHTML = list.map(card).join("");
      if (host.tagName === "TD" || host.tagName === "LI") host.appendChild(box); else host.insertAdjacentElement("afterend", box);
      a.setAttribute("aria-expanded", "true");
    });
  });

  /* 3. go-deeper strips */
  [].slice.call(document.querySelectorAll("[data-deeper]")).forEach(function (sec) {
    var list = ids(sec.getAttribute("data-deeper"));
    if (!list.length) return;
    var el = document.createElement("aside");
    el.className = "deeper";
    el.innerHTML = "<b>Go deeper on this section</b><ul>" + list.map(function (id) {
      var r = R[id];
      return '<li><span class="n">[' + number(id) + ']</span>' + title(r) + '<span class="rk-lvl ' + r.lvl + '">' + LVL[r.lvl] + '</span><span class="w">' + esc(r.w) + '</span></li>';
    }).join("") + "</ul>";
    sec.appendChild(el);
  });

  /* 4. page reading list */
  var rl = document.getElementById("reading-list");
  if (rl) {
    var groups = [["start", "Start here", "Short, approachable, read these first"], ["deep", "Go deeper", "Book chapters, design docs and long-form posts"], ["source", "Primary sources", "Specs, papers, manuals and man pages"]];
    rl.className = "rk-list";
    rl.innerHTML = groups.map(function (g) {
      var items = order.filter(function (id) { return R[id].lvl === g[0]; });
      if (!items.length) return "";
      return '<div class="rk-group ' + g[0] + '"><h3>' + g[1] + "<small>" + g[2] + "</small></h3>" + items.map(function (id) { return '<div id="ref-' + id + '">' + card(id) + "</div>"; }).join("") + "</div>";
    }).join("");
  }

  /* 5. quizzes */
  var solved = 0, total = 0;
  var quizzes = [].slice.call(document.querySelectorAll(".quiz"));
  function scoreText() { return solved + " / " + total + " predicted"; }
  quizzes.forEach(function (qz) {
    var dataEl = qz.querySelector('script[type="application/json"]');
    if (!dataEl) return;
    var d; try { d = JSON.parse(dataEl.textContent); } catch (e) { return; }
    total++;
    function render() {
      qz.innerHTML = '<div class="qh"><b>' + esc(d.label || "Predict first") + '</b><span class="score"></span></div>' +
        '<div class="qq">' + d.q + "</div>" + (d.code ? "<pre>" + esc(d.code) + "</pre>" : "") +
        '<div class="opts">' + d.options.map(function (o, i) { return '<button type="button" class="opt" data-i="' + i + '"><span class="k">' + "ABCDEF"[i] + "</span><span>" + o + "</span></button>"; }).join("") + "</div>";
      qz.appendChild(dataEl);
      [].forEach.call(qz.querySelectorAll(".score"), function (s) { s.textContent = scoreText(); });
      [].forEach.call(qz.querySelectorAll(".opt"), function (b) {
        b.addEventListener("click", function () {
          var i = +b.getAttribute("data-i"), ok = i === d.answer;
          [].forEach.call(qz.querySelectorAll(".opt"), function (x) {
            x.disabled = true;
            if (+x.getAttribute("data-i") === d.answer) x.classList.add("right");
          });
          if (!ok) b.classList.add("wrong");
          if (ok) { solved++; qz.classList.remove("pop"); void qz.offsetWidth; qz.classList.add("pop"); }
          var ex = document.createElement("div");
          ex.className = "ex";
          ex.innerHTML = "<b>" + (ok ? "Correct. " : "Not quite. ") + "</b>" + d.explain;
          qz.appendChild(ex);
          var again = document.createElement("button");
          again.type = "button"; again.className = "again"; again.textContent = "Try again";
          again.addEventListener("click", function () { if (ok) solved--; render(); updateScores(); });
          qz.appendChild(again);
          updateScores();
        });
      });
    }
    render();
  });
  function updateScores() { [].forEach.call(document.querySelectorAll(".quiz .score"), function (s) { s.textContent = scoreText(); }); }

  /* 7. exam-style questions: answer hidden until asked, then self-marking */
  var exqs = [].slice.call(document.querySelectorAll(".exq")), got = {}, totalMarks = 0;
  var tallyEls = [].slice.call(document.querySelectorAll(".exam-bar .tally"));
  function tally() {
    var sum = 0, done = 0;
    Object.keys(got).forEach(function (k) { sum += got[k]; done++; });
    tallyEls.forEach(function (t) { t.textContent = done ? "Self-marked " + done + " of " + exqs.length + " · " + (Math.round(sum * 2) / 2) + " / " + totalMarks + " marks" : exqs.length + " questions · " + totalMarks + " marks"; });
  }
  exqs.forEach(function (q, idx) {
    var marks = +q.getAttribute("data-marks") || 0; totalMarks += marks;
    var a = q.querySelector(".a"); if (!a) return;
    a.hidden = true;
    var head = document.createElement("div"); head.className = "eh";
    head.innerHTML = "<span>Question " + (idx + 1) + (q.getAttribute("data-kind") ? " · " + esc(q.getAttribute("data-kind")) : "") + '</span><span class="mk">' + marks + " mark" + (marks === 1 ? "" : "s") + "</span>";
    q.insertBefore(head, q.firstChild);
    var btns = document.createElement("div"); btns.className = "btns";
    btns.innerHTML = '<button type="button" class="show">Show model answer</button>';
    q.insertBefore(btns, a);
    btns.querySelector(".show").addEventListener("click", function () {
      a.hidden = !a.hidden;
      this.textContent = a.hidden ? "Show model answer" : "Hide model answer";
      if (!a.hidden && !btns.querySelector(".self")) {
        var self = document.createElement("span"); self.className = "self";
        self.innerHTML = '<span class="lbl">How did we do?</span> <button type="button" data-f="1">Full marks</button> <button type="button" data-f="0.5">Partly</button> <button type="button" data-f="0">Missed it</button>';
        btns.appendChild(self);
        [].forEach.call(self.querySelectorAll("button"), function (b) {
          b.addEventListener("click", function () {
            [].forEach.call(self.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
            got[idx] = marks * +b.getAttribute("data-f"); tally();
          });
        });
      }
    });
  });
  tally();

  /* 8. report-a-mistake links */
  var REPO = "https://github.com/aksaN000/Root-to-End-of-Random-Technical-Concepts";
  var pageUrl = location.href.split("#")[0];
  var pageTitle = (document.querySelector("h1") || {}).textContent || document.title;
  function issueUrl(where, anchor) {
    var body = "Page: " + pageUrl + (anchor ? "#" + anchor : "") + "\nSection: " + where + "\n\nWhat is wrong or unclear:\n\n\nWhat it should say (if you know):\n";
    return REPO + "/issues/new?labels=" + encodeURIComponent("content") + "&title=" + encodeURIComponent("[" + document.title + "] " + where) + "&body=" + encodeURIComponent(body);
  }
  [].slice.call(document.querySelectorAll("main section[id]")).forEach(function (sec) {
    if (/^(reading|sources)$/.test(sec.id)) return;
    var h = sec.querySelector("h2"); if (!h) return;
    var a = document.createElement("a");
    a.className = "rk-report"; a.target = "_blank"; a.rel = "noopener";
    a.href = issueUrl(h.textContent.trim(), sec.id);
    a.textContent = "Something wrong or unclear in this section? Tell us →";
    var strip = sec.querySelector(":scope > .deeper");
    (strip || sec).appendChild(a);
  });
  var main = document.querySelector("main");
  if (main && !document.querySelector(".rk-foot")) {
    var f = document.createElement("footer"); f.className = "rk-foot";
    f.innerHTML = '<span>Found a mistake, or still confused after reading?</span><a href="' + esc(issueUrl("General", "")) + '" target="_blank" rel="noopener">Report it on GitHub</a><a href="' + REPO + '/issues/new?labels=topic-request&title=' + encodeURIComponent("Topic request: ") + '" target="_blank" rel="noopener">Suggest a topic</a><a href="../">All topics</a>';
    main.appendChild(f);
  }

  /* 9. evidence labels: every code figure says whether it is observed output, upstream source, or our own example;
        every lab carries a scope box (.scope[data-kind]) saying what it is, what it was checked against and what it leaves out */
  var KIND = {
    observed: ["Observed", "Captured from the real system (real output, real bytes, real traces)"],
    source: ["Source", "Real upstream source code, trimmed only with // …"],
    example: ["Our example", "Code or input we wrote to demonstrate the idea"],
    model: ["Model", "Our simplification, checked against the real system"],
    illustration: ["Illustration", "Our simplification, not checked against the real system"]
  };
  function kindBadge(k) { var d = KIND[k]; return '<span class="kind ' + k + '" title="' + esc(d[1]) + '">' + d[0] + "</span>"; }
  var usedKinds = {};
  [].slice.call(document.querySelectorAll("figure.src")).forEach(function (f) {
    var k = f.getAttribute("data-kind") || (f.classList.contains("real") ? "observed" : "source");
    var cap = f.querySelector("figcaption"); if (!cap || cap.querySelector(".kind")) return;
    cap.insertAdjacentHTML("afterbegin", kindBadge(k)); usedKinds[k] = 1;
  });
  [].slice.call(document.querySelectorAll(".scope[data-kind]")).forEach(function (sc) {
    var k = sc.getAttribute("data-kind"); if (!KIND[k] || sc.querySelector(".sh")) return;
    sc.insertAdjacentHTML("afterbegin", '<div class="sh">' + kindBadge(k) + "<span>Scope and limits</span></div>"); usedKinds[k] = 1;
  });
  var tl = document.querySelector(".tldr");
  if (tl && Object.keys(usedKinds).length) {
    var lg = document.createElement("div"); lg.className = "kinds-legend";
    lg.innerHTML = "<b>Labels on this page</b>" + ["observed", "source", "example", "model", "illustration"].filter(function (k) { return usedKinds[k]; }).map(function (k) { return "<span>" + kindBadge(k) + " " + esc(KIND[k][1].charAt(0).toLowerCase() + KIND[k][1].slice(1)) + "</span>"; }).join("");
    tl.insertAdjacentElement("afterend", lg);
  }

  /* 10. keyboard access to scrolling boxes: any code block, table or lab panel that scrolls gets tabindex="0"
         (so arrow keys can scroll it) and a name for screen readers. Rechecked on resize, because whether a box
         scrolls depends on the width. Boxes the page already made focusable are left alone. */
  function nameFor(el) {
    var fig = el.closest("figure"), cap = fig && fig.querySelector("figcaption");
    if (cap) return cap.textContent.replace(/\s+/g, " ").trim().slice(0, 120);
    var h = el.closest("section") && el.closest("section").querySelector("h2,h3");
    return (h ? h.textContent.trim() + ": " : "") + "scrollable " + (el.tagName === "PRE" ? "code" : "panel");
  }
  function markScrollers() {
    [].slice.call(document.querySelectorAll("main *, body > section *")).forEach(function (el) {
      if (el.hasAttribute("tabindex") && !el.hasAttribute("data-rk-scroll")) return;
      var cs = getComputedStyle(el), scrolls = /(auto|scroll)/.test(cs.overflowX + cs.overflowY) &&
        (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      if (scrolls && !el.hasAttribute("data-rk-scroll")) {
        el.setAttribute("tabindex", "0"); el.setAttribute("data-rk-scroll", "");
        if (!el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) { el.setAttribute("aria-label", nameFor(el)); if (!el.getAttribute("role")) el.setAttribute("role", "region"); }
      } else if (!scrolls && el.hasAttribute("data-rk-scroll")) {
        el.removeAttribute("tabindex"); el.removeAttribute("data-rk-scroll");
      }
    });
  }
  markScrollers(); setTimeout(markScrollers, 800);
  var rkT; addEventListener("resize", function () { clearTimeout(rkT); rkT = setTimeout(markScrollers, 250); });
  window.rkMarkScrollers = markScrollers;

  /* 6. reading progress bar */
  var bar = document.createElement("div");
  bar.className = "rk-progress";
  bar.innerHTML = "<i></i>";
  document.body.appendChild(bar);
  var fill = bar.firstChild;
  function prog() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    fill.style.width = (h > 0 ? Math.min(100, 100 * window.scrollY / h) : 0) + "%";
  }
  window.addEventListener("scroll", prog, { passive: true });
  prog();
})();
