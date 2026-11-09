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
    if (typeof renderCalc === "function") renderCalc();
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
     4b. PRICE CALCULATOR
     Pricing source: official price list of vytahovanidulku.cz
     (cenik page): hail matrix by zone x size x dent count,
     plus the single-dent PDR table for larger dents.
     Calculation model adapted from joteo.net PDR calculator
     (open static implementation).
     ============================================================ */
  // Single-dent PDR table (CZK), by max diameter mm
  var PDR_SIZES = {20:2500,30:2916,40:3198,60:3373,80:3668,100:4044,130:4688,160:5248,190:5738,220:6301,250:6932,280:7500,310:8156};
  // Hail matrix: total price for the whole count band, per zone & size
  // zones: hood (kapota/střecha), door (blatník/dveře), trunk (boční rám/kufr)
  // sizes: [20mm, 30mm, 40mm]
  var HAIL_ROWS = [
    {n:[1,1],    p:{hood:[764,826,892],   door:[867,936,1011],   trunk:[1019,1100,1188]}},
    {n:[2,4],    p:{hood:[1376,1487,1606],door:[1558,1681,1816], trunk:[1833,1980,2139]}},
    {n:[5,8],    p:{hood:[2062,2228,2407],door:[2339,2526,2717], trunk:[2751,2971,3208]}},
    {n:[9,13],   p:{hood:[3032,3274,3538],door:[3436,3711,4008], trunk:[4044,4368,4368]}},
    {n:[14,19],  p:{hood:[3456,3732,4031],door:[3918,4231,4569], trunk:[4609,4979,5378]}},
    {n:[20,26],  p:{hood:[3906,4218,4554],door:[4427,4781,5164], trunk:[5207,5622,6072]}},
    {n:[27,34],  p:{hood:[4640,5011,5412],door:[4826,5212,5629], trunk:[6187,6681,7216]}},
    {n:[35,43],  p:{hood:[5199,5614,6064],door:[5260,5681,6136], trunk:[6929,7484,8052]}},
    {n:[44,53],  p:{hood:[5820,6050,6788],door:[5891,6361,6871], trunk:[7761,8382,9053]}},
    {n:[54,64],  p:{hood:[6986,7544,8148],door:[6599,7127,7698], trunk:[9313,10059,10864]}},
    {n:[65,80],  p:{hood:[8382,9053,9778],door:[7918,8191,9234], trunk:[11176,12071,13036]}},
    {n:[81,100], p:{hood:[9776,10559,11404],door:[9501,10260,11081],trunk:[12849,13878,14988]}},
    {n:[101,120],p:{hood:[10680,11534,12458],door:[10986,11864,12813],trunk:[14100,15228,16447]}},
    {n:[121,140],p:{hood:[11098,11986,12944],door:[12032,12994,14034],trunk:[14759,15940,17214]}},
    {n:[141,160],p:{hood:[12318,13302,14367],door:[13939,15053,16258],trunk:[16381,17692,19108]}},
    {n:[161,180],p:{hood:[12756,13776,14879],door:[15720,16978,18336],trunk:[16879,18229,19688]}},
    {n:[181,200],p:{hood:[13473,14551,15714],door:[16879,18229,19688],trunk:[17874,19300,20924]}},
    {n:[201,240],p:{hood:[16184,17462,19079],door:[18868,20286,23501],trunk:[21481,23176,25400]}},
    {n:[241,260],p:{hood:[17118,18466,20238],door:[19926,21421,24812],trunk:[22722,24508,26940]}},
    {n:[261,280],p:{hood:[17847,19249,21141],door:[20751,22308,25838],trunk:[23692,25551,28142]}},
    {n:[281,300],p:{hood:[18573,20031,22044],door:[21574,23193,26860],trunk:[24659,26589,29344]}},
    {n:[301,320],p:{hood:[19044,20536,22628],door:[22109,23767,27522],trunk:[25286,27262,30121]}},
    {n:[321,340],p:{hood:[19262,20771,22899],door:[22356,24032,27828],trunk:[25574,27573,30480]}},
    {n:[341,360],p:{hood:[19899,21454,23689],door:[23078,24808,28724],trunk:[26422,28484,31532]}},
    {n:[361,380],p:{hood:[20128,21700,23973],door:[23336,25086,29046],trunk:[26727,28811,31909]}},
    {n:[381,400],p:{hood:[20502,22102,24438],door:[23760,25541,29572],trunk:[27224,29347,32528]}}
  ];
  // zone ratios for large dents (derived from the matrix: door ≈ ×1.13, trunk ≈ ×1.33 vs hood)
  var ZONE_RATIO = {hood:1.0, door:1.13, trunk:1.33};

  function readCalcInputs() {
    var sizeSel = document.getElementById("cSize");
    var countEl = document.getElementById("cCount");
    var zoneSel = document.getElementById("cZone");
    var matSel  = document.getElementById("cMat");
    if (!sizeSel || !countEl) return null;
    var count = parseInt(countEl.value, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 400) count = 400;
    return {
      size: sizeSel.value,
      count: count,
      zone: zoneSel.value || "hood",
      alu: matSel.value === "alu",
      bodyline: document.getElementById("cBodyline").checked,
      edge: document.getElementById("cEdge").checked,
      glue: document.getElementById("cGlue").checked
    };
  }

  function computeCalc(inp) {
    var mult = 1;
    if (inp.bodyline) mult *= 1.3;
    if (inp.edge) mult *= 1.3;
    if (inp.glue) mult *= 1.3;
    var matMult = inp.alu ? 1.5 : 1;

    var sizeMm = inp.size === "big" ? null : parseInt(inp.size, 10);
    var baseTotal, perDent, individual = false;

    if (sizeMm === null) {
      individual = true; // bigger than 310 mm — individual quote
    } else if (sizeMm <= 40 && inp.count >= 1) {
      // small dents: exact official hail matrix (total for the count band)
      var si = sizeMm === 20 ? 0 : sizeMm === 30 ? 1 : 2;
      var row = null;
      for (var i = 0; i < HAIL_ROWS.length; i++) {
        if (inp.count >= HAIL_ROWS[i].n[0] && inp.count <= HAIL_ROWS[i].n[1]) { row = HAIL_ROWS[i]; break; }
      }
      if (!row) row = HAIL_ROWS[HAIL_ROWS.length - 1];
      baseTotal = row.p[inp.zone][si];
      perDent = Math.round(baseTotal / inp.count);
    } else {
      // single/large dents: official single-dent table, scaled by zone & count
      var unit = PDR_SIZES[sizeMm] || PDR_SIZES[310];
      var zf = ZONE_RATIO[inp.zone] || 1;
      perDent = Math.round(unit * zf);
      baseTotal = perDent * inp.count;
    }

    var hasSurcharges = matMult * mult !== 1;
    var total = individual ? 0 : (hasSurcharges ? Math.round(baseTotal * matMult * mult / 10) * 10 : baseTotal);
    return { baseTotal: baseTotal, perDent: perDent, total: total,
             surcharge: matMult * mult, individual: individual };
  }

  function renderCalc() {
    var inp = readCalcInputs();
    if (!inp) return;
    var r = computeCalc(inp);
    var d = window.I18N[curLang] || window.I18N.cs;
    var elTotal = document.getElementById("calcTotal");
    var elBase  = document.getElementById("calcBase");
    var elPer   = document.getElementById("calcPerDent");
    var elMult  = document.getElementById("calcMult");
    if (r.individual) {
      elTotal.textContent = d["calc.size_big"];
      elBase.textContent = "—"; elPer.textContent = "—";
      elMult.textContent = "×" + r.surcharge.toFixed(2);
    } else {
      elTotal.textContent = fmtKc(r.total);
      elBase.textContent = fmtKc(r.baseTotal);
      elPer.textContent = fmtKc(r.perDent);
      elMult.textContent = "×" + r.surcharge.toFixed(2);
    }
    window._lastCalc = { inp: inp, res: r };
  }

  function initCalculator() {
    var form = document.getElementById("calcForm");
    if (!form) return;
    ["input","change"].forEach(function (ev) {
      form.addEventListener(ev, renderCalc);
    });
    renderCalc();

    var btn = document.getElementById("calcToQuote");
    if (btn) btn.addEventListener("click", function () {
      var lc = window._lastCalc;
      if (!lc) return;
      var d = window.I18N[curLang] || window.I18N.cs;
      var inp = lc.inp, r = lc.res;
      var sizeLabel = document.getElementById("cSize").selectedOptions[0].textContent;
      var zoneLabel = document.getElementById("cZone").selectedOptions[0].textContent;
      var extras = [];
      if (inp.alu) extras.push(d["calc.m_alu"]);
      if (inp.bodyline) extras.push(d["calc.bodyline"]);
      if (inp.edge) extras.push(d["calc.edge"]);
      if (inp.glue) extras.push(d["calc.glue"]);
      var line = d["calc.h2"] + ": " + inp.count + "× " + sizeLabel + ", " + zoneLabel
               + (extras.length ? " (" + extras.join(", ") + ")" : "")
               + " — " + (r.individual ? d["calc.size_big"] : fmtKc(r.total));
      var desc = document.getElementById("fDesc");
      desc.value = line + (desc.value ? "\n" + desc.value : "");
      var typeSel = document.getElementById("fType");
      if (typeSel) {
        typeSel.value = (inp.count > 1 && inp.size !== "big" && parseInt(inp.size,10) <= 40) ? "kroupa" : "park";
      }
      document.getElementById("quote").scrollIntoView({behavior:"smooth"});
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
    initCalculator();
    initReveal();
    initToTop();
  });
})();
