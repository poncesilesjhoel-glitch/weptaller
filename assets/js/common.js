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
      { id: "revision", nombre: "Revisión general", precio: 40, descripcion: "Inspección de 40 puntos con reporte escrito." },
      { id: "aceite", nombre: "Cambio de aceite", precio: 25, descripcion: "Cambio de aceite y filtro, revisión de niveles." },
      { id: "frenos", nombre: "Frenos", precio: 35, descripcion: "Diagnóstico de pastillas, discos y líquido." },
      { id: "suspension", nombre: "Suspensión", precio: 35, descripcion: "Amortiguadores, rótulas, bujes y terminales." },
      { id: "bateria", nombre: "Batería", precio: 15, descripcion: "Prueba de carga, alternador y arranque." },
      { id: "escaner", nombre: "Escáner / diagnóstico", precio: 30, descripcion: "Lectura de códigos de falla con escáner." },
      { id: "otro", nombre: "Otro", precio: 30, descripcion: "Revisión de diagnóstico para cualquier otra falla." }
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
      return new Intl.NumberFormat(CFG.locale || "es", { style: "currency", currency: CFG.moneda || "USD", maximumFractionDigits: 2 }).format(valor);
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
      if (!v) el.hidden = true;
    });
    raiz.querySelectorAll("[data-cfg-link]").forEach(function (el) {
      var tipo = el.getAttribute("data-cfg-link");
      var href = "";
      if (tipo === "whatsapp") href = enlaceWhatsApp(el.getAttribute("data-wa-texto") || "Hola " + N.nombre + ", quiero más información.");
      if (tipo === "correo" && N.correo) href = "mailto:" + N.correo;
      if (tipo === "mapa" && N.direccion) href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(N.direccion + " " + ubicacion());
      if (href) {
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

  /* ---------- Configuración de reservas ---------- */
  var promesaReservas = null;
  function cargarReservas() {
    if (!promesaReservas) {
      promesaReservas = fetch("reservas.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) { return Object.assign({}, RESERVAS_DEFECTO, d); })
        .catch(function () { return RESERVAS_DEFECTO; });
    }
    return promesaReservas;
  }

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
  var promesaApi = null;
  function apiDisponible() {
    if (!CFG.API_URL) return Promise.resolve(false);
    if (!promesaApi) {
      promesaApi = fetch(CFG.API_URL + "reservas.php?accion=ping", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return !!(d && d.ok); })
        .catch(function () { return false; });
    }
    return promesaApi;
  }

  function api(archivo, datos, metodo) {
    var url = CFG.API_URL + archivo;
    var opciones = { method: metodo || "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" };
    if (opciones.method === "GET") {
      if (datos) url += (url.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(datos).toString();
      delete opciones.headers;
    } else {
      opciones.body = JSON.stringify(datos || {});
    }
    return fetch(url, opciones).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Respuesta no válida del servidor." }; });
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
    ubicacion: ubicacion, cargarReservas: cargarReservas, apiDisponible: apiDisponible, api: api,
    aviso: aviso, rellenarConfig: rellenarConfig
  };

  document.addEventListener("DOMContentLoaded", function () {
    rellenarConfig();
    rellenarReservas();
    iniciarMenu();
  });
})();
