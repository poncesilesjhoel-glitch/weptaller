/* =====================================================================
   Funciones compartidas por todas las páginas
   - Rellena los datos del negocio desde config.js
   - Menú móvil, formato de moneda, avisos, acceso al backend
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.TALLER_CONFIG || { negocio: {} };
  var N = CFG.negocio || {};

  /* Valores por defecto de reservas.json (se usan si el archivo no carga,
     por ejemplo al abrir el sitio con doble clic sin servidor). */
  var RESERVAS_DEFECTO = {
    duracionMinutos: 60, porcentajeAdelanto: 30, horasCancelacion: 24,
    horaApertura: "08:00", horaCierre: "17:00", pausas: [{ desde: "12:00", hasta: "13:00" }],
    diasLaborables: [1, 2, 3, 4, 5], diasMaximosAnticipacion: 45, feriados: [],
    servicios: [
      { id: "revision", nombre: "Revisión general", precio: 300, descripcion: "Inspección de 40 puntos con reporte escrito." },
      { id: "aceite", nombre: "Cambio de aceite", precio: 100, descripcion: "Cambio de aceite y filtro, revisión de niveles." },
      { id: "frenos", nombre: "Frenos", precio: 200, descripcion: "Diagnóstico de pastillas, discos y líquido." },
      { id: "suspension", nombre: "Suspensión", precio: 200, descripcion: "Amortiguadores, rótulas, bujes y terminales." },
      { id: "bateria", nombre: "Batería", precio: 100, descripcion: "Prueba de carga, alternador y arranque." },
      { id: "escaner", nombre: "Escáner / diagnóstico", precio: 200, descripcion: "Lectura de códigos de falla con escáner." },
      { id: "electrico", nombre: "Electrónica y electricidad", precio: 200, descripcion: "Diagnóstico eléctrico y electrónico: alternador, arranque, luces, sensores, computadora y cableado." },
      { id: "otro", nombre: "Otro", precio: 180, descripcion: "Revisión de diagnóstico para cualquier otra falla." }
    ]
  };

  function obtener(ruta, obj) {
    return ruta.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function soloDigitos(t) { return String(t || "").replace(/\D/g, ""); }

  function enlaceWhatsApp(texto) {
    var n = soloDigitos(N.whatsapp);
    if (!n) return "";
    return "https://wa.me/" + n + (texto ? "?text=" + encodeURIComponent(texto) : "");
  }

  function formatoWhatsApp(n) {
    var d = soloDigitos(n);
    return d ? "+" + d : "";
  }

  function moneda(valor) {
    try {
      return new Intl.NumberFormat(CFG.locale || "es", { style: "currency", currency: CFG.moneda || "BOB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(valor);
    } catch (e) {
      return (CFG.moneda || "") + " " + Number(valor).toFixed(2);
    }
  }

  function escapar(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ubicacion() {
    return [N.ciudad, N.pais].filter(Boolean).join(", ");
  }

  /* ---------- Rellenar datos del negocio ---------- */
  function rellenarConfig(raiz) {
    raiz = raiz || document;
    var extra = { "negocio.ubicacion": ubicacion(), "negocio.whatsappFormato": formatoWhatsApp(N.whatsapp) };

    raiz.querySelectorAll("[data-cfg]").forEach(function (el) {
      var k = el.getAttribute("data-cfg");
      var v = k in extra ? extra[k] : obtener(k, CFG);
      if (v) el.textContent = v;
    });
    // Oculta bloques cuyo dato está vacío
    raiz.querySelectorAll("[data-cfg-si]").forEach(function (el) {
      var k = el.getAttribute("data-cfg-si");
      var v = k in extra ? extra[k] : obtener(k, CFG);
      el.hidden = !v;
    });
    raiz.querySelectorAll("[data-cfg-link]").forEach(function (el) {
      var tipo = el.getAttribute("data-cfg-link");
      var href = "";
      if (tipo === "whatsapp") href = enlaceWhatsApp(el.getAttribute("data-wa-texto") || "Hola " + N.nombre + ", quiero más información.");
      if (tipo === "correo" && N.correo) href = "mailto:" + N.correo;
      if (tipo === "mapa" && N.direccion) href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(N.direccion + " " + ubicacion());
      if (href) {
        el.hidden = false;
        el.setAttribute("href", href);
        if (tipo !== "correo") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
      } else {
        el.hidden = true;
      }
    });
    raiz.querySelectorAll("[data-anio]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    // Montos fijos escritos en el HTML: <span data-dinero="5"></span>
    raiz.querySelectorAll("[data-dinero]").forEach(function (el) { el.textContent = moneda(+el.getAttribute("data-dinero")); });
  }

  /* ---------- Datos del sitio (panel admin → api/publico.php) ----------
     Con backend: negocio, servicios, agenda, catálogo y métodos de pago
     vienen de lo que guardas en el panel. Sin backend: reservas.json y
     productos.json. */
  function leerJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  var promesaDatos = null;
  function cargarDatos() {
    if (!promesaDatos) {
      var desdeApi = CFG.API_URL
        ? fetch(CFG.API_URL + "publico.php", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        : Promise.resolve(null);
      promesaDatos = desdeApi.then(function (d) {
        if (d && d.ok) {
          Object.keys(d.negocio || {}).forEach(function (k) { if (d.negocio[k]) N[k] = d.negocio[k]; });
          return { api: true, reglas: Object.assign({}, RESERVAS_DEFECTO, d.reglas), catalogo: d.catalogo, pagos: d.pagos || { metodos: [] } };
        }
        return Promise.all([
          leerJson("reservas.json").catch(function () { return {}; }),
          leerJson("productos.json").catch(function () { return null; })
        ]).then(function (r) {
          return { api: false, reglas: Object.assign({}, RESERVAS_DEFECTO, r[0]), catalogo: r[1], pagos: { metodos: [] } };
        });
      });
    }
    return promesaDatos;
  }
  function cargarReservas() { return cargarDatos().then(function (d) { return d.reglas; }); }

  function rellenarReservas() {
    if (!document.querySelector("[data-res]")) return;
    cargarReservas().then(function (R) {
      document.querySelectorAll("[data-res]").forEach(function (el) {
        var v = R[el.getAttribute("data-res")];
        if (v != null) el.textContent = v;
      });
    });
  }

  /* ---------- Backend (PHP) con detección automática ---------- */
  function apiDisponible() {
    return cargarDatos().then(function (d) { return d.api; });
  }

  /* ---------- Cuenta del cliente (comprador) ---------- */
  var CLAVE_CLIENTE = "automax_cliente", CLAVE_CLIENTE_DATOS = "automax_cliente_datos";
  var cliente = {
    token: function () { try { return localStorage.getItem(CLAVE_CLIENTE) || ""; } catch (e) { return ""; } },
    datos: function () { try { return JSON.parse(localStorage.getItem(CLAVE_CLIENTE_DATOS)) || null; } catch (e) { return null; } },
    guardar: function (token, datos) {
      try {
        if (token) localStorage.setItem(CLAVE_CLIENTE, token);
        if (datos) localStorage.setItem(CLAVE_CLIENTE_DATOS, JSON.stringify(datos));
      } catch (e) { /* sin almacenamiento */ }
      pintarBotonCuenta();
    },
    salir: function () {
      try { localStorage.removeItem(CLAVE_CLIENTE); localStorage.removeItem(CLAVE_CLIENTE_DATOS); } catch (e) { /* nada */ }
      pintarBotonCuenta();
    }
  };

  function iniciales(nombre) {
    return String(nombre || "").trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "•";
  }

  function pintarBotonCuenta() {
    var acc = document.querySelector(".header__acciones");
    if (!acc || !CFG.API_URL || /admin\.html$/.test(location.pathname)) return;
    var b = acc.querySelector(".cuenta-btn");
    if (!b) {
      b = document.createElement("a");
      b.className = "cuenta-btn";
      b.href = "cuenta.html";
      var antes = acc.querySelector(".nav-toggle");
      acc.insertBefore(b, antes);
    }
    if (!acc.querySelector(".admin-btn")) {
      var ad = document.createElement("a");
      ad.className = "admin-btn";
      ad.href = "admin.html";
      ad.title = "Panel de administración";
      ad.setAttribute("aria-label", "Panel de administración");
      ad.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5z"/><path d="M9 12l2 2 4-4"/></svg><span class="admin-btn__txt">Admin</span>';
      acc.insertBefore(ad, b);
    }
    var d = cliente.token() ? cliente.datos() : null;
    if (d) {
      b.classList.add("cuenta-btn--activa");
      b.setAttribute("aria-label", "Mi cuenta: " + d.nombre);
      b.title = "Mi cuenta";
      b.innerHTML = '<span class="cuenta-btn__ini">' + escapar(iniciales(d.nombre)) + "</span>";
    } else {
      b.classList.remove("cuenta-btn--activa");
      b.setAttribute("aria-label", "Ingresar o crear cuenta");
      b.title = "Ingresar o crear cuenta";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span class="cuenta-btn__txt">Ingresar</span>';
    }
    if (/cuenta\.html$/.test(location.pathname)) b.setAttribute("aria-current", "page");
  }

  var tokenAdmin = "";
  function api(archivo, datos, metodo) {
    var url = CFG.API_URL + archivo;
    var opciones = { method: metodo || "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" };
    if (tokenAdmin) opciones.headers["X-Token"] = tokenAdmin;
    var tc = cliente.token();
    if (tc && !tokenAdmin) opciones.headers["X-Cliente"] = tc;
    if (opciones.method === "GET") {
      if (datos) url += (url.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(datos).toString();
      if (!tokenAdmin && !tc) delete opciones.headers;
    } else {
      opciones.body = JSON.stringify(datos || {});
    }
    return fetch(url, opciones).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Respuesta no válida del servidor." }; });
    }).then(function (d) {
      if (d && d.sesionCliente === false) cliente.salir();
      return d;
    });
  }

  /* Reduce una foto en el navegador antes de subirla (máx. lado en px). */
  function comprimirImagen(archivo, lado, calidad) {
    return new Promise(function (ok, mal) {
      if (!archivo || !/^image\//.test(archivo.type)) { mal(new Error("Elige una imagen JPG, PNG o WebP.")); return; }
      var lector = new FileReader();
      lector.onerror = function () { mal(new Error("No se pudo leer la imagen.")); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { mal(new Error("La imagen no es válida.")); };
        img.onload = function () {
          var max = lado || 900, w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, max / Math.max(w, h));
          var c = document.createElement("canvas");
          c.width = Math.round(w * f); c.height = Math.round(h * f);
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/webp", calidad || 0.85);
          if (url.indexOf("data:image/webp") !== 0) url = c.toDataURL("image/jpeg", calidad || 0.85);
          ok(url);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  /* ---------- Avisos ---------- */
  var temporizador;
  function aviso(texto) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = texto; t.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- Menú móvil ---------- */
  function iniciarMenu() {
    var boton = document.querySelector(".nav-toggle");
    var nav = document.getElementById("nav");
    if (!boton || !nav) return;
    boton.addEventListener("click", function () {
      var abierto = nav.classList.toggle("abierto");
      boton.setAttribute("aria-expanded", abierto ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("abierto");
        boton.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("abierto")) {
        nav.classList.remove("abierto"); boton.setAttribute("aria-expanded", "false"); boton.focus();
      }
    });
  }

  window.TY = {
    cfg: CFG, negocio: N, moneda: moneda, escapar: escapar, enlaceWhatsApp: enlaceWhatsApp,
    ubicacion: ubicacion, cargarReservas: cargarReservas, cargarDatos: cargarDatos, apiDisponible: apiDisponible, api: api,
    aviso: aviso, rellenarConfig: rellenarConfig, comprimirImagen: comprimirImagen,
    usarToken: function (t) { tokenAdmin = t || ""; },
    cliente: cliente
  };

  document.addEventListener("DOMContentLoaded", function () {
    rellenarConfig();
    pintarBotonCuenta();
    iniciarMenu();
    cargarDatos().then(function () { rellenarConfig(); rellenarReservas(); });
  });
})();
