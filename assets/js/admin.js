/* =====================================================================
   Panel de administración (admin.html)
   - Con backend: la contraseña se valida en el servidor (api/config.php)
   - Sin backend: se compara la huella SHA-256 de config.js y se
     gestionan las reservas guardadas en este navegador.
   ===================================================================== */
(function () {
  "use strict";
  var CLAVE_LOCAL = "torke_reservas";
  var hayApi = false;
  var clave = "";
  var reservas = [];
  var $ = function (id) { return document.getElementById(id); };

  function sha256(texto) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error("sin-crypto"));
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  function locales() { try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL)) || []; } catch (e) { return []; } }
  function guardarLocales(l) { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(l)); } catch (e) { /* nada */ } }
  function fechaCorta(s) {
    var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function faltantes() {
    var N = TY.negocio, f = [];
    var campos = { titular: "Titular", nit: "NIT/RUC", pais: "País", ciudad: "Ciudad", direccion: "Dirección", correo: "Correo", whatsapp: "WhatsApp" };
    Object.keys(campos).forEach(function (k) { if (!N[k]) f.push(campos[k] + " (negocio." + k + ")"); });
    if (!TY.cfg.DLOCAL_PAYMENT_URL && !hayApi) f.push("DLOCAL_PAYMENT_URL o backend con llaves de dLocal Go");
    if (TY.cfg.ADMIN_PASSWORD_SHA256 === "ed5e254969677e4f6f9aa33e2722efe444acbe4401ac82488502558c4ce37eb3" && !hayApi) f.push("Cambiar la contraseña del panel (ADMIN_PASSWORD_SHA256)");
    $("faltantes").innerHTML = f.length
      ? '<div class="faltantes"><strong>Antes de publicar, completa en assets/js/config.js:</strong><ul>' + f.map(function (x) { return "<li>" + TY.escapar(x) + "</li>"; }).join("") + "</ul></div>"
      : "";
  }

  /* ---------- Acceso ---------- */
  function entrar(e) {
    e.preventDefault();
    var c = $("clave").value;
    var salida = $("login-msg");
    salida.innerHTML = "";
    if (!c) return;
    if (hayApi) {
      TY.api("reservas.php", { accion: "listar", clave: c }).then(function (r) {
        if (!r.ok) { salida.innerHTML = '<p class="mensaje mensaje--error">' + TY.escapar(r.error || "Contraseña incorrecta.") + "</p>"; return; }
        clave = c; try { sessionStorage.setItem("torke_admin", c); } catch (x) { /* nada */ }
        reservas = r.reservas; mostrarPanel();
      }).catch(function () { salida.innerHTML = '<p class="mensaje mensaje--error">No se pudo conectar con el servidor.</p>'; });
    } else {
      sha256(c).then(function (h) {
        if (h !== TY.cfg.ADMIN_PASSWORD_SHA256) { salida.innerHTML = '<p class="mensaje mensaje--error">Contraseña incorrecta.</p>'; return; }
        clave = c; try { sessionStorage.setItem("torke_admin", c); } catch (x) { /* nada */ }
        reservas = locales(); mostrarPanel();
      }).catch(function () {
        salida.innerHTML = '<p class="mensaje mensaje--error">Tu navegador necesita HTTPS (o localhost) para validar la contraseña.</p>';
      });
    }
  }

  function mostrarPanel() {
    $("login").hidden = true;
    $("panel").hidden = false;
    $("modo-texto").textContent = hayApi
      ? "Conectado al servidor: ves todas las reservas recibidas en el sitio."
      : "Modo local: ves solo las reservas hechas desde este navegador. Instala el backend PHP para centralizarlas (ver README).";
    faltantes();
    pintar();
  }

  function recargar() {
    if (hayApi) {
      return TY.api("reservas.php", { accion: "listar", clave: clave }).then(function (r) {
        if (r.ok) { reservas = r.reservas; pintar(); } else TY.aviso(r.error || "No se pudo actualizar.");
      });
    }
    reservas = locales(); pintar(); return Promise.resolve();
  }

  /* ---------- Listado ---------- */
  function filtradas() {
    var est = $("f-estado").value, desde = $("f-fecha").value, q = $("f-buscar").value.trim().toLowerCase();
    return reservas.filter(function (r) {
      if (est && r.estado !== est) return false;
      if (desde && r.fecha < desde) return false;
      if (q) {
        var t = [r.codigo, r.cliente.nombre, r.cliente.telefono, r.cliente.correo, r.vehiculo.placa, r.vehiculo.marca, r.vehiculo.modelo, r.servicioNombre].join(" ").toLowerCase();
        if (t.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return (a.fecha + a.hora).localeCompare(b.fecha + b.hora); });
  }

  function pintar() {
    var cuenta = { total: reservas.length, pendiente: 0, confirmada: 0, cancelada: 0 };
    reservas.forEach(function (r) { cuenta[r.estado] = (cuenta[r.estado] || 0) + 1; });
    $("stats").innerHTML = [["Total", cuenta.total], ["Pendientes", cuenta.pendiente], ["Confirmadas", cuenta.confirmada], ["Canceladas", cuenta.cancelada]]
      .map(function (s) { return '<div class="stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>"; }).join("");

    var lista = filtradas();
    if (!lista.length) { $("lista").innerHTML = '<p class="vacio">No hay reservas con estos filtros.</p>'; return; }
    $("lista").innerHTML = lista.map(function (r) {
      var e = TY.escapar;
      var wa = "https://wa.me/" + String(r.cliente.telefono).replace(/\D/g, "");
      var sint = (r.sintomas || []).join(", ") + (r.otroSintoma ? " (" + r.otroSintoma + ")" : "");
      return '<article class="reserva-item">' +
        "<div>" +
          "<h3>" + e(r.codigo) + ' <span class="estado estado--' + e(r.estado) + '">' + e(r.estado) + "</span>" +
            (r.pagado ? '<span class="estado estado--pagado">Adelanto pagado</span>' : "") + "</h3>" +
          "<p><strong>" + e(fechaCorta(r.fecha)) + " · " + e(r.hora) + "</strong> — " + e(r.servicioNombre) + " · Adelanto " + TY.moneda(r.adelanto) + " de " + TY.moneda(r.precio) + "</p>" +
          "<p>" + e(r.cliente.nombre) + " · " + e(r.cliente.telefono) + " · " + e(r.cliente.correo) + "</p>" +
          "<p>" + e([r.vehiculo.marca, r.vehiculo.modelo, r.vehiculo.anio].join(" ")) + " · Placa " + e(r.vehiculo.placa) + "</p>" +
          (sint ? "<p>Síntomas: " + e(sint) + "</p>" : "") +
        "</div>" +
        '<div class="reserva-item__acciones">' +
          (r.estado !== "confirmada" ? '<button type="button" class="btn btn--ok btn--sm" data-accion="confirmada" data-codigo="' + e(r.codigo) + '">Confirmar</button>' : "") +
          (r.estado !== "cancelada" ? '<button type="button" class="btn btn--peligro btn--sm" data-accion="cancelada" data-codigo="' + e(r.codigo) + '">Cancelar</button>' : "") +
          '<button type="button" class="btn btn--borde btn--sm" data-accion="pagado" data-codigo="' + e(r.codigo) + '">' + (r.pagado ? "Quitar pago" : "Marcar pagado") + "</button>" +
          '<a class="btn btn--borde btn--sm" href="' + e(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' +
        "</div></article>";
    }).join("");
  }

  function accion(codigo, tipo) {
    var r = reservas.filter(function (x) { return x.codigo === codigo; })[0];
    if (!r) return;
    if (tipo === "cancelada" && !confirm("¿Cancelar la reserva " + codigo + "? La hora quedará libre.")) return;
    if (hayApi) {
      var datos = tipo === "pagado"
        ? { accion: "pagado", clave: clave, codigo: codigo, pagado: !r.pagado }
        : { accion: "estado", clave: clave, codigo: codigo, estado: tipo };
      TY.api("reservas.php", datos).then(function (res) {
        if (res.ok) { TY.aviso("Reserva actualizada" + (res.correoEnviado ? " y cliente notificado por correo" : "")); recargar(); }
        else TY.aviso(res.error || "No se pudo actualizar.");
      });
    } else {
      var l = locales();
      l.forEach(function (x) {
        if (x.codigo !== codigo) return;
        if (tipo === "pagado") x.pagado = !x.pagado; else x.estado = tipo;
      });
      guardarLocales(l); reservas = l; pintar(); TY.aviso("Reserva actualizada");
    }
  }

  function exportarCSV() {
    var filas = [["Código", "Estado", "Pagado", "Fecha", "Hora", "Servicio", "Precio", "Adelanto", "Cliente", "Teléfono", "Correo", "Marca", "Modelo", "Año", "Placa", "Síntomas"]];
    filtradas().forEach(function (r) {
      filas.push([r.codigo, r.estado, r.pagado ? "Sí" : "No", r.fecha, r.hora, r.servicioNombre, r.precio, r.adelanto, r.cliente.nombre, r.cliente.telefono, r.cliente.correo,
        r.vehiculo.marca, r.vehiculo.modelo, r.vehiculo.anio, r.vehiculo.placa, (r.sintomas || []).join(" | ") + (r.otroSintoma ? " | " + r.otroSintoma : "")]);
    });
    var csv = "﻿" + filas.map(function (f) { return f.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "reservas-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener("DOMContentLoaded", function () {
    TY.apiDisponible().then(function (ok) {
      hayApi = ok;
      var guardada = null;
      try { guardada = sessionStorage.getItem("torke_admin"); } catch (e) { /* nada */ }
      if (guardada) { $("clave").value = guardada; $("form-login").requestSubmit ? $("form-login").requestSubmit() : entrar({ preventDefault: function () {} }); }
    });
    $("form-login").addEventListener("submit", entrar);
    $("btn-huella").addEventListener("click", function () {
      var v = $("nueva-clave").value;
      if (v.length < 10) { $("huella").textContent = "Usa al menos 10 caracteres."; return; }
      sha256(v).then(function (h) { $("huella").textContent = h; }).catch(function () { $("huella").textContent = "Abre el panel con HTTPS o localhost para generar la huella."; });
    });
    ["f-estado", "f-fecha", "f-buscar"].forEach(function (id) { $(id).addEventListener("input", pintar); });
    $("btn-actualizar").addEventListener("click", function () { recargar().then(function () { TY.aviso("Lista actualizada"); }); });
    $("btn-csv").addEventListener("click", exportarCSV);
    $("btn-salir").addEventListener("click", function () {
      try { sessionStorage.removeItem("torke_admin"); } catch (e) { /* nada */ }
      location.reload();
    });
    $("lista").addEventListener("click", function (e) {
      var b = e.target.closest("[data-accion]");
      if (b) accion(b.getAttribute("data-codigo"), b.getAttribute("data-accion"));
    });
  });
})();
