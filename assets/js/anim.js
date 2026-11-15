/* =====================================================================
   Animaciones e interacción (todas las páginas)
   - Pantalla de entrada (solo la primera visita de la sesión)
   - Aparición de elementos al hacer scroll, contadores, efecto onda
   - Encabezado dinámico, barra de progreso y botón "volver arriba"
   Respeta la preferencia del sistema "reducir movimiento".
   ===================================================================== */
(function () {
  "use strict";
  var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var body = document.body;

  /* ---------- Pantalla de entrada ---------- */
  function iniciarPagina() { body.classList.add("cargado"); }
  var intro = document.getElementById("intro");
  var yaVisto = false;
  try { yaVisto = sessionStorage.getItem("automax_intro") === "1"; } catch (e) { /* nada */ }
  if (intro && !yaVisto && !reducir) {
    var inicio = Date.now();
    var cerrar = function () {
      if (intro.classList.contains("fuera")) return;
      var espera = Math.max(0, 1100 - (Date.now() - inicio));
      setTimeout(function () {
        intro.classList.add("fuera");
        iniciarPagina();
        setTimeout(function () { intro.remove(); }, 700);
      }, espera);
      try { sessionStorage.setItem("automax_intro", "1"); } catch (e) { /* nada */ }
    };
    if (document.readyState === "complete") cerrar(); else window.addEventListener("load", cerrar);
    setTimeout(cerrar, 2800); // nunca más de ~3 s
  } else {
    if (intro) intro.remove();
    iniciarPagina();
  }

  /* ---------- Encabezado, progreso y volver arriba ---------- */
  var header = document.querySelector(".header");
  var conHero = !!document.querySelector(".hero");
  var barra = document.createElement("div");
  barra.className = "progreso-lectura"; barra.setAttribute("aria-hidden", "true");
  body.appendChild(barra);

  var arriba = document.createElement("button");
  arriba.type = "button"; arriba.className = "arriba"; arriba.setAttribute("aria-label", "Volver arriba");
  arriba.innerHTML = '<svg class="anillo" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="23"/></svg>' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  body.appendChild(arriba);
  var anillo = arriba.querySelector("circle");
  arriba.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reducir ? "auto" : "smooth" }); });

  var cta = document.querySelector(".cta__fondo");
  var telefono = document.querySelector(".telefono");
  var pendiente = false;
  function alDesplazar() {
    pendiente = false;
    var y = window.scrollY;
    var alto = document.documentElement.scrollHeight - window.innerHeight;
    var p = alto > 0 ? Math.min(1, y / alto) : 0;
    barra.style.transform = "scaleX(" + p + ")";
    anillo.style.strokeDashoffset = String(145 - 145 * p);
    arriba.classList.toggle("ver", y > 600);
    if (header) {
      header.classList.toggle("header--scroll", y > 30);
      if (conHero) header.classList.toggle("header--transparente", y <= 30);
    }
    if (cta && !reducir) {
      var r = cta.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) cta.style.transform = "translateY(" + (r.top * -0.12) + "px)";
    }
  }
  window.addEventListener("scroll", function () { if (!pendiente) { pendiente = true; requestAnimationFrame(alDesplazar); } }, { passive: true });
  alDesplazar();

  /* ---------- Aparición al hacer scroll ---------- */
  var animables = document.querySelectorAll("[data-anim], .pasos-proceso, .medidor, .titulo-anim");
  if ("IntersectionObserver" in window && !reducir) {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    animables.forEach(function (el) { obs.observe(el); });
  } else {
    animables.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Contadores ---------- */
  function contar(el) {
    var objetivo = parseFloat(el.getAttribute("data-contar") || el.textContent) || 0;
    if (reducir || objetivo <= 0) { el.textContent = objetivo; return; }
    var t0 = null, dur = 1400;
    function paso(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var v = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(objetivo * v);
      if (k < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }
  var contadores = document.querySelectorAll("[data-contar]");
  if (contadores.length) {
    var listo = window.TY ? TY.cargarReservas() : Promise.resolve();
    listo.then(function () {
      // Espera un instante a que common.js escriba los valores de reservas.json
      setTimeout(function () {
        if (!("IntersectionObserver" in window)) { contadores.forEach(contar); return; }
        var oc = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { oc.unobserve(e.target); contar(e.target); } });
        }, { threshold: 0.6 });
        contadores.forEach(function (c) { oc.observe(c); });
      }, 50);
    });
  }

  /* ---------- Efecto onda en botones ---------- */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest(".btn, .filtro");
    if (!b || reducir) return;
    var r = b.getBoundingClientRect();
    var s = Math.max(r.width, r.height);
    var o = document.createElement("span");
    o.className = "onda";
    o.style.width = o.style.height = s + "px";
    o.style.left = (e.clientX - r.left - s / 2) + "px";
    o.style.top = (e.clientY - r.top - s / 2) + "px";
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 650);
  });

  /* ---------- Celular con inclinación 3D (escritorio) ---------- */
  if (telefono && !reducir && window.matchMedia("(hover: hover) and (min-width: 921px)").matches) {
    var hero = document.querySelector(".hero");
    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      telefono.style.transform = "rotateY(" + (x * 14) + "deg) rotateX(" + (-y * 10) + "deg)";
    });
    hero.addEventListener("mouseleave", function () { telefono.style.transform = ""; });
  }

  /* ---------- Menú: resalta la sección visible ---------- */
  var enlaces = document.querySelectorAll('.nav a[href^="#"]');
  if (enlaces.length && "IntersectionObserver" in window) {
    var mapa = {};
    enlaces.forEach(function (a) { var s = document.querySelector(a.getAttribute("href")); if (s) mapa[s.id] = a; });
    var os = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && mapa[e.target.id]) {
          enlaces.forEach(function (a) { a.classList.remove("activo"); });
          mapa[e.target.id].classList.add("activo");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(mapa).forEach(function (id) { os.observe(document.getElementById(id)); });
  }
})();

/* =====================================================================
   v3 — Efectos avanzados: chispas, foco, 3D, magnetismo,
   títulos animados, palabras rotativas y parallax.
   ===================================================================== */
(function () {
  "use strict";
  var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var escritorio = window.matchMedia("(hover: hover) and (min-width: 921px)").matches;

  /* ---------- Títulos: dividir en palabras ---------- */
  document.querySelectorAll(".titulo-anim").forEach(function (h) {
    var i = 0;
    (function recorrer(nodo) {
      Array.prototype.slice.call(nodo.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var s = document.createElement("span"); s.className = "w"; s.style.setProperty("--wi", i++); s.textContent = t; frag.appendChild(s);
          });
          nodo.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains("w")) {
          if (n.classList.contains("grad") || n.classList.contains("grad-azul")) { n.classList.add("w"); n.style.setProperty("--wi", i++); }
          else recorrer(n);
        }
      });
    })(h);
  });

  if (reducir) return;

  /* ---------- Palabras que rotan en el hero ---------- */
  var rot = document.querySelector(".hero__rotador");
  if (rot) {
    var items = rot.querySelectorAll("span"), k = 0;
    setInterval(function () {
      var actual = items[k]; k = (k + 1) % items.length; var sig = items[k];
      actual.classList.remove("activo"); actual.classList.add("sale");
      sig.classList.remove("sale"); sig.classList.add("activo");
      setTimeout(function () { actual.classList.remove("sale"); }, 500);
    }, 2200);
  }

  /* ---------- Chispas (brasas) en el hero y la banda CTA ---------- */
  document.querySelectorAll("canvas.chispas").forEach(function (cv) {
    var ctx = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, parts = [], activo = true;
    var cantidad = window.innerWidth < 700 ? 28 : 70;
    function medir() { var r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function nueva(inicio) {
      return { x: Math.random() * w, y: inicio ? Math.random() * h : h + 10, r: Math.random() * 2.2 + .6,
        vy: -(Math.random() * .7 + .25), vx: (Math.random() - .5) * .35, vida: Math.random() * 300 + 200, t: 0,
        tono: Math.random() < .75 ? [255, 120 + Math.random() * 80 | 0, 30] : [150, 110, 255] };
    }
    medir(); for (var i = 0; i < cantidad; i++) parts.push(nueva(true));
    window.addEventListener("resize", medir);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { activo = e[0].isIntersecting; if (activo) requestAnimationFrame(cuadro); }).observe(cv);
    function cuadro() {
      if (!activo) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      parts.forEach(function (p, i) {
        p.t++; p.x += p.vx + Math.sin((p.t + i * 20) / 40) * .25; p.y += p.vy;
        var a = Math.max(0, 1 - p.t / p.vida);
        if (a <= 0 || p.y < -10) { parts[i] = nueva(false); return; }
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, "rgba(" + p.tono.join(",") + "," + a + ")");
        g.addColorStop(1, "rgba(" + p.tono.join(",") + ",0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill();
      });
      requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);
  });

  /* ---------- Foco de luz que sigue al puntero en tarjetas ---------- */
  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest && e.target.closest(".foco");
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty("--mx", (e.clientX - r.left) + "px");
    t.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  if (!escritorio) return;

  /* ---------- Inclinación 3D ---------- */
  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tilt], .producto");
    if (!t) return;
    var r = t.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    t.style.transform = "perspective(900px) rotateY(" + (x * 8) + "deg) rotateX(" + (-y * 8) + "deg) translateY(-6px)";
  }, { passive: true });
  document.addEventListener("pointerout", function (e) {
    var t = e.target.closest && e.target.closest("[data-tilt], .producto");
    if (t && !t.contains(e.relatedTarget)) t.style.transform = "";
  });

  /* ---------- Botones magnéticos ---------- */
  document.querySelectorAll("[data-magnetico]").forEach(function (b) {
    b.addEventListener("pointermove", function (e) {
      var r = b.getBoundingClientRect();
      b.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * .25 + "px," + (e.clientY - r.top - r.height / 2) * .35 + "px)";
    });
    b.addEventListener("pointerleave", function () { b.style.transform = ""; });
  });

  /* ---------- Parallax del hero ---------- */
  var heroTexto = document.querySelector(".hero__grid > div:first-child");
  var tel = document.querySelector(".telefono-wrap");
  var suelo = document.querySelector(".hero__suelo");
  if (heroTexto) {
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      if (y > innerHeight) return;
      heroTexto.style.transform = "translateY(" + y * .25 + "px)";
      heroTexto.style.opacity = String(Math.max(0, 1 - y / (innerHeight * .8)));
      if (tel) tel.style.translate = "0 " + y * .12 + "px";
      if (suelo) suelo.style.opacity = String(Math.max(0, 1 - y / 500));
    }, { passive: true });
  }
})();
