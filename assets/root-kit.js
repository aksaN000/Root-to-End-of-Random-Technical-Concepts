/* Root to End shared kit.
   - <a class="rd" data-r="id1,id2"></a>   numbered reading footnote; click opens cards under the paragraph
   - <section data-deeper="id1,id2">        appends a "Go deeper" strip at the end of the section
   - <div id="reading-list"></div>          filled with every reference used on the page, grouped by level
   - <div class="quiz"><script type="application/json">{...}</script></div>   predict-the-output quiz
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
