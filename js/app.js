/* ============================================================
   VytahováníDůlků.cz — app logic
   i18n switch · before/after sliders · mini-game · quote form
   All client-side — no server / VPS required.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- image base (swap this const to host photos locally) ---------- */
  var IMG = "https://vytahovanidulku.cz/wp-content/uploads/";
  var BA_PAIRS = [
    ["2025/09/promacklina1pred.jpg", "2025/09/promacklina1po-scaled.jpg"],
    ["2026/01/strecha-pred.jpg",     "2026/01/strecha-po.jpg"],
    ["2025/09/promacklina2pred.jpg", "2025/09/promacklina2po.jpg"],
    ["2025/09/promacklina5pred.jpg", "2025/09/promacklina5po-scaled.jpg"],
    ["2025/09/promacklina6pred-scaled.jpg", "2025/09/promacklina6po-scaled.jpg"],
    ["2025/09/promacklina4pred.jpg", "2025/09/promacklina4po.jpg"],
    ["2025/09/promacklina3pred.jpg", "2025/09/promacklina3po.jpg"],
    ["2025/10/promacklina8pred.jpg", "2025/10/promacklina8po.jpg"],
    ["2025/10/promacklina7pred.jpg", "2025/10/promacklina7po.jpg"]
  ];

  /* ============================================================
     1. I18N
     ============================================================ */
  var curLang = "cs";
  function detectLang() {
    var saved = null;
    try { saved = localStorage.getItem("pdr_lang"); } catch (e) {}
    if (saved && window.I18N[saved]) return saved;
    var nav = (navigator.language || "cs").slice(0, 2).toLowerCase();
    return window.I18N[nav] ? nav : "cs";
  }

  function applyLang(lang) {
    if (!window.I18N[lang]) lang = "cs";
    curLang = lang;
    var dict = window.I18N[lang];
    document.documentElement.setAttribute("lang", lang);
    try { localStorage.setItem("pdr_lang", lang); } catch (e) {}

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = dict[key];
      if (val == null) return;
      if (el.tagName === "TITLE") el.textContent = val;
      else if (el.tagName === "META" && el.getAttribute("name") === "description") el.setAttribute("content", val);
      else el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (dict[key] != null) el.innerHTML = dict[key];
    });
    // active state on language buttons
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === lang);
    });
    // re-render dynamic bits that depend on language
    renderBeforeAfter();
    if (typeof updatePricePreview === "function") updatePricePreview();
  }

  document.querySelectorAll(".lang-btn").forEach(function (b) {
    b.addEventListener("click", function () { applyLang(b.getAttribute("data-lang")); });
  });

  /* ============================================================
     2. BEFORE / AFTER SLIDERS
     ============================================================ */
  function buildSlider(beforeUrl, afterUrl) {
    var wrap = document.createElement("div");
    wrap.className = "ba-slider";
    wrap.innerHTML =
      '<img class="ba-before" src="' + beforeUrl + '" alt="before" loading="lazy">' +
      '<img class="ba-after" src="' + afterUrl + '" alt="after" loading="lazy">' +
      '<span class="ba-label before">PŘED</span>' +
      '<span class="ba-label after">PO</span>' +
      '<div class="ba-handle"><div class="ba-grip">⇔</div></div>';
    var after = wrap.querySelector(".ba-after");
    var handle = wrap.querySelector(".ba-handle");
    var pos = 50; // percent

    function setPos(p) {
      p = Math.max(0, Math.min(100, p));
      pos = p;
      after.style.clipPath = "inset(0 0 0 " + p + "%)";
      handle.style.left = p + "%";
    }
    function fromEvent(e) {
      var r = wrap.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      setPos((x / r.width) * 100);
    }
    var dragging = false;
    wrap.addEventListener("pointerdown", function (e) { dragging = true; wrap.setPointerCapture(e.pointerId); fromEvent(e); });
    wrap.addEventListener("pointermove", function (e) { if (dragging) fromEvent(e); });
    wrap.addEventListener("pointerup", function () { dragging = false; });
    wrap.addEventListener("pointercancel", function () { dragging = false; });
    setPos(50);
    return wrap;
  }

  function renderBeforeAfter() {
    var grid = document.getElementById("baGrid");
    if (!grid) return;
    grid.innerHTML = "";
    BA_PAIRS.forEach(function (pair) {
      grid.appendChild(buildSlider(IMG + pair[0], IMG + pair[1]));
    });
    // localize the small corner labels
    var labels = { cs: ["PŘED", "PO"], en: ["BEFORE", "AFTER"], de: ["VORHER", "NACHHER"], ru: ["ДО", "ПОСЛЕ"] };
    var L = labels[curLang] || labels.cs;
    grid.querySelectorAll(".ba-label.before").forEach(function (el) { el.textContent = L[0]; });
    grid.querySelectorAll(".ba-label.after").forEach(function (el) { el.textContent = L[1]; });
  }

  /* ============================================================
     3. MINI-GAME  — "pull out the dents"
     ============================================================ */
  var G = {
    canvas: null, ctx: null, W: 900, H: 420,
    running: false, score: 0, time: 30, best: 0,
    dents: [], raf: null, spawnTimer: 0, lastTs: 0,
    flash: [] // little pop effects
  };

  function loadBest() { try { G.best = parseInt(localStorage.getItem("pdr_best") || "0", 10) || 0; } catch (e) { G.best = 0; } }
  function saveBest() { try { localStorage.setItem("pdr_best", String(G.best)); } catch (e) {} }

  function newDent() {
    var r = 16 + Math.random() * 22;
    return {
      x: r + Math.random() * (G.W - 2 * r),
      y: r + Math.random() * (G.H - 2 * r),
      r: r,
      alive: true,
      age: 0,
      life: 6 + Math.random() * 4 // seconds it stays
    };
  }

  function drawCarBg(ctx) {
    // simple bonnet suggestion: soft gradient + panel lines
    var g = ctx.createLinearGradient(0, 0, 0, G.H);
    g.addColorStop(0, "#1b2436");
    g.addColorStop(1, "#0d121c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, G.W, G.H);
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 2;
    for (var i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (G.H / 4) * i);
      ctx.lineTo(G.W, (G.H / 4) * i);
      ctx.stroke();
    }
    // subtle highlight sweep
    var hg = ctx.createLinearGradient(0, 0, G.W, 0);
    hg.addColorStop(0, "rgba(205,244,99,0)");
    hg.addColorStop(.5, "rgba(205,244,99,.05)");
    hg.addColorStop(1, "rgba(205,244,99,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, G.W, G.H);
  }

  function drawDent(d) {
    var ctx = G.ctx;
    // shadow ring
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fill();
    // inner darker
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.fill();
    // rim highlight (top-left) so it reads as a dent
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, Math.PI * 0.9, Math.PI * 1.6);
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // target ring to invite clicking
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(205,244,99,.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function loop(ts) {
    if (!G.running) return;
    var dt = G.lastTs ? (ts - G.lastTs) / 1000 : 0;
    G.lastTs = ts;

    // timer
    G.time -= dt;
    if (G.time <= 0) { endGame(); return; }

    // spawn
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0 && G.dents.length < 7) {
      G.dents.push(newDent());
      G.spawnTimer = 0.6 + Math.random() * 0.6;
    }

    // age & expire
    for (var i = G.dents.length - 1; i >= 0; i--) {
      var d = G.dents[i];
      d.age += dt;
      if (d.age > d.life) G.dents.splice(i, 1);
    }

    // render
    drawCarBg(G.ctx);
    G.dents.forEach(drawDent);
    // pop effects
    for (var f = G.flash.length - 1; f >= 0; f--) {
      var fl = G.flash[f];
      fl.t += dt;
      var k = fl.t / 0.4;
      if (k >= 1) { G.flash.splice(f, 1); continue; }
      G.ctx.beginPath();
      G.ctx.arc(fl.x, fl.y, fl.r + k * 26, 0, Math.PI * 2);
      G.ctx.strokeStyle = "rgba(205,244,99," + (1 - k) + ")";
      G.ctx.lineWidth = 3;
      G.ctx.stroke();
    }

    // HUD
    document.getElementById("gScore").textContent = G.score;
    document.getElementById("gTime").textContent = Math.ceil(G.time);
    document.getElementById("gBest").textContent = G.best;

    G.raf = requestAnimationFrame(loop);
  }

  function startGame() {
    if (G.running) return;
    G.running = true; G.score = 0; G.time = 30; G.dents = []; G.flash = [];
    G.spawnTimer = 0; G.lastTs = 0;
    document.getElementById("gameReward").hidden = true;
    document.getElementById("gameStart").disabled = true;
    G.raf = requestAnimationFrame(loop);
  }

  function endGame() {
    G.running = false;
    cancelAnimationFrame(G.raf);
    document.getElementById("gameStart").disabled = false;
    if (G.score > G.best) { G.best = G.score; saveBest(); }
    document.getElementById("gBest").textContent = G.best;
    awardReward(G.score);
  }

  function clickAt(clientX, clientY) {
    if (!G.running) return;
    var rect = G.canvas.getBoundingClientRect();
    var x = (clientX - rect.left) * (G.W / rect.width);
    var y = (clientY - rect.top) * (G.H / rect.height);
    for (var i = G.dents.length - 1; i >= 0; i--) {
      var d = G.dents[i];
      var dx = x - d.x, dy = y - d.y;
      if (dx * dx + dy * dy <= (d.r + 8) * (d.r + 8)) {
        // smaller dent = more points
        var pts = Math.round(30 - d.r * 0.5);
        if (pts < 4) pts = 4;
        G.score += pts;
        G.flash.push({ x: d.x, y: d.y, r: d.r, t: 0 });
        G.dents.splice(i, 1);
        break;
      }
    }
  }

  /* ---- reward → discount code injected into the form ---- */
  function awardReward(score) {
    var pct = score >= 120 ? 20 : score >= 80 ? 15 : score >= 40 ? 10 : 5;
    var code = "PDR-" + Math.floor(1000 + Math.random() * 9000);
    window.PDR_PROMOS = window.PDR_PROMOS || {};
    window.PDR_PROMOS[code] = pct;

    var box = document.getElementById("gameReward");
    document.getElementById("rewardCode").textContent = code;
    box.hidden = false;

    // add option to discount select (avoid duplicates)
    var sel = document.getElementById("fDiscount");
    var exists = Array.prototype.some.call(sel.options, function (o) { return o.value === "promo:" + code; });
    if (!exists) {
      var opt = document.createElement("option");
      opt.value = "promo:" + code;
      opt.dataset.pct = pct;
      opt.textContent = code + " · −" + pct + " %";
      sel.appendChild(opt);
    }
    sel.value = "promo:" + code;
    updatePricePreview();
  }

  function initGame() {
    G.canvas = document.getElementById("gameCanvas");
    if (!G.canvas) return;
    G.ctx = G.canvas.getContext("2d");
    loadBest();
    document.getElementById("gBest").textContent = G.best;
    // static preview frame
    drawCarBg(G.ctx);
    G.canvas.addEventListener("pointerdown", function (e) { clickAt(e.clientX, e.clientY); });
    document.getElementById("gameStart").addEventListener("click", startGame);
  }

  /* ============================================================
     4. QUOTE FORM — discount dropdown + live price + mailto submit
     ============================================================ */
  var BASE_PRICE = 2500; // Kč — minimal PDR dent, used for indicative preview

  function currentDiscountPct() {
    var sel = document.getElementById("fDiscount");
    if (!sel || !sel.value) return 0;
    var v = sel.value;
    if (v.indexOf("promo:") === 0) {
      var code = v.slice(6);
      return (window.PDR_PROMOS && window.PDR_PROMOS[code]) || 0;
    }
    var map = { none: 0, first10: 10, hail15: 15, referral5: 5 };
    return map[v] || 0;
  }

  function fmtKc(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + " Kč";
  }

  function updatePricePreview() {
    var box = document.getElementById("pricePreview");
    var val = document.getElementById("priceValue");
    if (!box || !val) return;
    var pct = currentDiscountPct();
    if (pct > 0) {
      var price = Math.round(BASE_PRICE * (1 - pct / 100));
      val.textContent = fmtKc(price) + "  (−" + pct + " %)";
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  function initForm() {
    var form = document.getElementById("quoteForm");
    var disc = document.getElementById("fDiscount");
    if (disc) disc.addEventListener("change", updatePricePreview);
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var g = function (id) { return (document.getElementById(id) || {}).value || ""; };
      var typeSel = document.getElementById("fType");
      var typeName = typeSel && typeSel.selectedIndex > 0 ? typeSel.options[typeSel.selectedIndex].textContent : "";
      var discSel = document.getElementById("fDiscount");
      var discName = discSel && discSel.selectedIndex > 0 ? discSel.options[discSel.selectedIndex].textContent : "";
      var pct = currentDiscountPct();

      var lines = [
        "Jméno: " + g("fName"),
        "Telefon: " + g("fPhone"),
        "Auto: " + (g("fCar") || "—"),
        "Typ poškození: " + (typeName || "—"),
        "Popis: " + (g("fDesc") || "—"),
        "Sleva: " + (discName || "bez slevy") + (pct ? " (−" + pct + "%)" : ""),
        "",
        "(Zpráva z webu vytahovanidulku.cz)"
      ];
      var subject = encodeURIComponent("Poptávka na opravu — " + g("fName"));
      var body = encodeURIComponent(lines.join("\n"));
      window.location.href = "mailto:info@vytahovanidulku.cz?subject=" + subject + "&body=" + body;
    });
  }

  /* ============================================================
     5. Scroll reveal + back-to-top
     ============================================================ */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initToTop() {
    var btn = document.querySelector(".to-top");
    if (!btn) return;
    window.addEventListener("scroll", function () {
      btn.classList.toggle("show", window.scrollY > 600);
    }, { passive: true });
  }

  /* ============================================================
     boot
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    applyLang(detectLang());
    initGame();
    initForm();
    initReveal();
    initToTop();
  });
})();
