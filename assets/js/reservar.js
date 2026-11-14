/* =====================================================================
   Sistema de reservas (reservar.html)
   - Con backend PHP (api/): reservas compartidas, horas bloqueadas
     para todos, correos al cliente y al taller, checkout dLocal Go.
   - Sin backend ("modo local"): reservas en este navegador y envío
     de la reserva al taller por WhatsApp.
   ===================================================================== */
(function () {
  "use strict";

  var CLAVE_LOCAL = "torke_reservas";
  var SINTOMAS = [
    "Ruidos al frenar", "Vibración al manejar", "Luz de check engine encendida", "Humo",
    "Pérdida de aceite o líquido", "No enciende", "Sobrecalentamiento",
    "Aire acondicionado no enfría", "Dirección dura", "Otro"
  ];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

  var R = null;          // configuración de reservas.json
  var hayApi = false;
  var paso = 1;
  var estado = { servicio: null, sintomas: [], otroSintoma: "", fecha: null, hora: null };
  var mesVista = null;   // Date del primer día del mes visible

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Utilidades de fecha ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function aMin(h) { var p = h.split(":"); return +p[0] * 60 + +p[1]; }
  function aHora(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function hoy() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function limite() { var d = hoy(); d.setDate(d.getDate() + (R.diasMaximosAnticipacion || 45)); return d; }
  function fechaLarga(s) {
    var p = s.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function diaHabil(d) {
    return R.diasLaborables.indexOf(d.getDay()) > -1 && R.feriados.indexOf(iso(d)) === -1 && d >= hoy() && d <= limite();
  }

  function turnosDelDia(fechaIso) {
    var lista = [];
    var ini = aMin(R.horaApertura), fin = aMin(R.horaCierre), dur = R.duracionMinutos;
    var esHoy = fechaIso === iso(new Date());
    var ahora = new Date(); var minAhora = ahora.getHours() * 60 + ahora.getMinutes() + 60; // 1 h de margen
    for (var m = ini; m + dur <= fin; m += dur) {
      var choca = (R.pausas || []).some(function (p) { return m < aMin(p.hasta) && m + dur > aMin(p.desde); });
      if (choca) continue;
      if (esHoy && m < minAhora) continue;
      lista.push(aHora(m));
    }
    return lista;
  }

  /* ---------- Almacenamiento local (modo sin backend) ---------- */
  function locales() { try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL)) || []; } catch (e) { return []; } }
  function guardarLocales(l) { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(l)); } catch (e) { /* nada */ } }

  function ocupados(fechaIso) {
    if (hayApi) {
      return TY.api("reservas.php", { accion: "ocupados", fecha: fechaIso }, "GET")
        .then(function (r) { return r.ok ? r.horas : []; })
        .catch(function () { return []; });
    }
    return Promise.resolve(locales().filter(function (x) { return x.fecha === fechaIso && x.estado !== "cancelada"; }).map(function (x) { return x.hora; }));
  }

  function codigoNuevo() {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    var a = new Uint32Array(6); (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 6; i++) s += c[a[i] % c.length];
    return "TK-" + s;
  }

  /* ---------- Pintado de pasos ---------- */
  function pintarServicios() {
    var params = new URLSearchParams(location.search);
    var pre = params.get("servicio");
    $("servicios").innerHTML = R.servicios.map(function (s) {
      return '<div class="opcion"><input type="radio" name="servicio" id="s-' + s.id + '" value="' + s.id + '"' + (pre === s.id ? " checked" : "") + '>' +
        '<label for="s-' + s.id + '"><b>' + TY.escapar(s.nombre) + "<span>" + TY.moneda(s.precio) + "</span></b><small>" + TY.escapar(s.descripcion) + "</small></label></div>";
    }).join("");
    if (pre) estado.servicio = servicioPorId(pre);
    $("servicios").addEventListener("change", function (e) {
      estado.servicio = servicioPorId(e.target.value);
      limpiarMsg(); pintarResumen();
    });
  }

  function servicioPorId(id) { return R.servicios.filter(function (s) { return s.id === id; })[0] || null; }

  function pintarSintomas() {
    $("sintomas").innerHTML = SINTOMAS.map(function (t, i) {
      return '<label class="sintoma"><input type="checkbox" value="' + TY.escapar(t) + '" id="sin-' + i + '"> <span>' + TY.escapar(t) + "</span></label>";
    }).join("");
    $("sintomas").addEventListener("change", function () {
      estado.sintomas = Array.prototype.map.call($("sintomas").querySelectorAll("input:checked"), function (c) { return c.value; });
      $("otro-sintoma-campo").hidden = estado.sintomas.indexOf("Otro") === -1;
      pintarResumen();
    });
    $("otro-sintoma").addEventListener("input", function (e) { estado.otroSintoma = e.target.value; });
  }

  function primerDiaHabil() {
    var d = hoy();
    for (var i = 0; i < 60; i++) {
      if (diaHabil(d) && turnosDelDia(iso(d)).length) return d;
      d.setDate(d.getDate() + 1);
    }
    return hoy();
  }

  function pintarCalendario() {
    var y = mesVista.getFullYear(), m = mesVista.getMonth();
    $("mes-titulo").textContent = MESES[m] + " " + y;
    var primero = new Date(y, m, 1);
    var desplaz = (primero.getDay() + 6) % 7; // semana inicia en lunes
    var diasMes = new Date(y, m + 1, 0).getDate();
    var html = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<div class="calendario__dia-sem" aria-hidden="true">' + DIAS[d] + "</div>"; }).join("");
    for (var i = 0; i < desplaz; i++) html += '<span class="dia vacio-dia" aria-hidden="true"></span>';
    var hoyIso = iso(new Date());
    for (var d = 1; d <= diasMes; d++) {
      var f = new Date(y, m, d);
      var fi = iso(f);
      var hab = diaHabil(f) && turnosDelDia(fi).length > 0;
      html += '<button type="button" class="dia' + (fi === hoyIso ? " hoy" : "") + '" data-fecha="' + fi + '"' +
        (hab ? "" : " disabled") + ' aria-pressed="' + (estado.fecha === fi) + '" aria-label="' + fechaLarga(fi) + (hab ? "" : " (no disponible)") + '">' + d + "</button>";
    }
    $("calendario").innerHTML = html;
    var mesHoy = new Date(hoy().getFullYear(), hoy().getMonth(), 1);
    var lim = limite();
    $("mes-ant").disabled = mesVista <= mesHoy;
    $("mes-sig").disabled = new Date(y, m + 1, 1) > lim;
  }

  function pintarHoras() {
    var cont = $("horas");
    if (!estado.fecha) { $("horas-titulo").textContent = "Selecciona un día"; cont.innerHTML = ""; return; }
    $("horas-titulo").textContent = fechaLarga(estado.fecha);
    cont.innerHTML = '<p class="vacio" style="grid-column:1/-1;padding:10px">Cargando horarios…</p>';
    var fechaPedida = estado.fecha;
    ocupados(fechaPedida).then(function (tomadas) {
      if (fechaPedida !== estado.fecha) return;
      var turnos = turnosDelDia(fechaPedida);
      if (estado.hora && tomadas.indexOf(estado.hora) > -1) estado.hora = null;
      if (!turnos.length) { cont.innerHTML = '<p class="vacio" style="grid-column:1/-1">No quedan horarios para este día.</p>'; return; }
      cont.innerHTML = turnos.map(function (h) {
        var ocupado = tomadas.indexOf(h) > -1;
        return '<button type="button" class="hora" data-hora="' + h + '"' + (ocupado ? " disabled" : "") +
          ' aria-pressed="' + (estado.hora === h) + '" aria-label="' + h + (ocupado ? " ocupado" : " disponible") + '">' + h + "</button>";
      }).join("");
      pintarResumen();
    });
  }

  function pintarResumen() {
    var s = estado.servicio;
    var filas = [];
    filas.push(["Servicio", s ? TY.escapar(s.nombre) : "—"]);
    if (estado.sintomas.length) filas.push(["Síntomas", TY.escapar(estado.sintomas.join(", "))]);
    filas.push(["Fecha", estado.fecha ? fechaLarga(estado.fecha) : "—"]);
    filas.push(["Hora", estado.hora ? estado.hora + " (" + R.duracionMinutos + " min)" : "—"]);
    var form = $("form-reserva");
    if (form.marca.value || form.modelo.value) filas.push(["Vehículo", TY.escapar([form.marca.value, form.modelo.value, form.anio.value].filter(Boolean).join(" ")) + (form.placa.value ? " · " + TY.escapar(form.placa.value.toUpperCase()) : "")]);
    var html = filas.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + f[1] + "</dd></div>"; }).join("");
    if (s) {
      var adelanto = calcAdelanto(s.precio);
      html += "<div><dt>Costo de la revisión</dt><dd>" + TY.moneda(s.precio) + "</dd></div>" +
        '<div class="total"><dt>Adelanto (' + R.porcentajeAdelanto + "%)</dt><dd>" + TY.moneda(adelanto) + "</dd></div>" +
        "<div><dt>Saldo a pagar en el taller</dt><dd>" + TY.moneda(Math.round((s.precio - adelanto) * 100) / 100) + "</dd></div>";
    }
    $("resumen").innerHTML = html;
  }

  function calcAdelanto(precio) { return Math.round(precio * R.porcentajeAdelanto) / 100; }

  /* ---------- Navegación entre pasos ---------- */
  function msg(texto, tipo) { $("reserva-msg").innerHTML = '<p class="mensaje mensaje--' + (tipo || "error") + '">' + TY.escapar(texto) + "</p>"; }
  function limpiarMsg() { $("reserva-msg").innerHTML = ""; }

  function validarPaso(n) {
    if (n === 1 && !estado.servicio) { msg("Elige un servicio para continuar."); return false; }
    if (n === 2 && estado.sintomas.indexOf("Otro") > -1 && !estado.otroSintoma.trim()) { msg("Describe el síntoma que marcaste como «Otro»."); $("otro-sintoma").focus(); return false; }
    if (n === 3 && (!estado.fecha || !estado.hora)) { msg("Selecciona un día y una hora disponibles."); return false; }
    if (n === 4) {
      var f = $("form-reserva"), malo = null;
      var reglas = {
        nombre: function (v) { return v.length >= 3; },
        telefono: function (v) { return v.replace(/\D/g, "").length >= 7; },
        correo: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
        marca: function (v) { return v.length >= 2; },
        modelo: function (v) { return v.length >= 1; },
        anio: function (v) { var a = +v; return a >= 1950 && a <= new Date().getFullYear() + 1; },
        placa: function (v) { return v.replace(/[^a-z0-9]/gi, "").length >= 4; }
      };
      Object.keys(reglas).forEach(function (k) {
        var ok = reglas[k](f[k].value.trim());
        f[k].setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok && !malo) malo = f[k];
      });
      if (malo) { msg("Revisa los campos marcados en rojo."); malo.focus(); return false; }
    }
    return true;
  }

  function irA(n) {
    paso = n;
    document.querySelectorAll(".paso").forEach(function (p) { p.classList.toggle("activo", +p.getAttribute("data-paso") === n); });
    document.querySelectorAll("#indicador li").forEach(function (li, i) {
      li.classList.toggle("activo", i + 1 === n);
      li.classList.toggle("hecho", i + 1 < n);
      if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("btn-atras").hidden = n === 1;
    $("btn-siguiente").hidden = n === 5;
    $("btn-pagar").hidden = n !== 5;
    limpiarMsg();
    pintarResumen();
    if (n === 3) { pintarCalendario(); pintarHoras(); }
    var t = document.querySelector('.paso[data-paso="' + n + '"] .paso__titulo');
    if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    document.getElementById("indicador").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Crear la reserva y pagar ---------- */
  function datosReserva() {
    var f = $("form-reserva");
    return {
      servicio: estado.servicio.id,
      sintomas: estado.sintomas,
      otroSintoma: estado.otroSintoma.trim(),
      fecha: estado.fecha,
      hora: estado.hora,
      cliente: { nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim(), correo: f.correo.value.trim() },
      vehiculo: { marca: f.marca.value.trim(), modelo: f.modelo.value.trim(), anio: f.anio.value.trim(), placa: f.placa.value.trim().toUpperCase() }
    };
  }

  function pagar() {
    if (!$("acepto-politica").checked) { msg("Debes aceptar la política de cancelación y los términos para continuar."); return; }
    var boton = $("btn-pagar");
    boton.disabled = true;
    var textoOriginal = boton.innerHTML;
    boton.textContent = "Procesando…";
    var datos = datosReserva();

    var crear = hayApi
      ? TY.api("reservas.php", Object.assign({ accion: "crear" }, datos))
      : ocupados(datos.fecha).then(function (tomadas) {
          if (tomadas.indexOf(datos.hora) > -1) return { ok: false, codigo: "ocupado", error: "Esa hora acaba de ser reservada." };
          var s = estado.servicio;
          var reserva = Object.assign({}, datos, {
            codigo: codigoNuevo(), servicioNombre: s.nombre, precio: s.precio, adelanto: calcAdelanto(s.precio),
            porcentaje: R.porcentajeAdelanto, estado: "pendiente", pagado: false, creada: new Date().toISOString()
          });
          var l = locales(); l.push(reserva); guardarLocales(l);
          return { ok: true, reserva: reserva, local: true };
        });

    crear.then(function (r) {
      if (!r.ok) {
        if (r.codigo === "ocupado") { estado.hora = null; irA(3); msg((r.error || "Esa hora ya no está disponible.") + " Elige otra, por favor."); }
        else msg(r.error || "No pudimos registrar la reserva. Inténtalo de nuevo.");
        return;
      }
      var reserva = r.reserva;
      try { sessionStorage.setItem("torke_ultima", JSON.stringify(reserva)); } catch (e) { /* nada */ }
      return urlDePago(reserva).then(function (url) { mostrarConfirmacion(reserva, url, r); });
    }).catch(function () {
      msg("Error de conexión. Revisa tu internet e inténtalo de nuevo.");
    }).then(function () {
      boton.disabled = false; boton.innerHTML = textoOriginal;
    });
  }

  function urlDePago(reserva) {
    var fija = TY.cfg.DLOCAL_PAYMENT_URL || "";
    if (!hayApi) return Promise.resolve(fija ? { url: fija, tipo: "enlace" } : null);
    return TY.api("pago.php", { codigo: reserva.codigo })
      .then(function (p) {
        if (p.ok && p.url) return { url: p.url, tipo: "checkout" };
        return fija ? { url: fija, tipo: "enlace" } : null;
      })
      .catch(function () { return fija ? { url: fija, tipo: "enlace" } : null; });
  }

  function filasConfirmacion(x) {
    var filas = [
      ["Servicio", x.servicioNombre],
      ["Fecha", fechaLarga(x.fecha)],
      ["Hora", x.hora],
      ["Cliente", x.cliente.nombre],
      ["Vehículo", [x.vehiculo.marca, x.vehiculo.modelo, x.vehiculo.anio].join(" ") + " · " + x.vehiculo.placa],
      ["Costo de la revisión", TY.moneda(x.precio)],
      ["Adelanto (" + x.porcentaje + "%)", TY.moneda(x.adelanto)],
      ["Saldo en el taller", TY.moneda(Math.round((x.precio - x.adelanto) * 100) / 100)]
    ];
    if (x.sintomas && x.sintomas.length) filas.splice(1, 0, ["Síntomas", x.sintomas.join(", ") + (x.otroSintoma ? " (" + x.otroSintoma + ")" : "")]);
    return filas;
  }

  function mostrarConfirmacion(x, pago, respuesta) {
    $("flujo").hidden = true;
    var c = $("confirmada");
    c.hidden = false;
    $("conf-codigo").textContent = x.codigo;
    $("conf-resumen").innerHTML = filasConfirmacion(x).map(function (f) {
      return "<div><dt>" + TY.escapar(f[0]) + "</dt><dd>" + TY.escapar(f[1]) + "</dd></div>";
    }).join("");

    var pagoHtml = "";
    if (x.pagado) {
      $("conf-titulo").textContent = "¡Reserva confirmada!";
      pagoHtml = '<p class="mensaje mensaje--ok">Recibimos el pago de tu adelanto. ¡Te esperamos!</p>';
    } else if (pago) {
      pagoHtml = '<p class="mensaje mensaje--info">Tu turno queda apartado. Para confirmarlo, paga el adelanto de <strong>' + TY.moneda(x.adelanto) +
        '</strong>' + (pago.tipo === "enlace" ? " e indica tu código <strong>" + TY.escapar(x.codigo) + "</strong> en el pago" : "") + ".</p>" +
        '<p><a class="btn btn--primario" href="' + TY.escapar(pago.url) + '"' + (pago.tipo === "enlace" ? ' target="_blank" rel="noopener"' : "") + '>Pagar adelanto en dLocal Go</a></p>';
    } else {
      pagoHtml = '<p class="mensaje mensaje--info">Tu turno queda apartado. Te contactaremos para coordinar el pago del adelanto de <strong>' + TY.moneda(x.adelanto) + "</strong>.</p>";
    }
    $("conf-pago").innerHTML = pagoHtml;

    if (respuesta && respuesta.local) {
      $("conf-correo").textContent = "Envía la reserva al taller por WhatsApp para que la registremos y te confirmemos.";
    } else if (respuesta && respuesta.correoEnviado === false) {
      $("conf-correo").textContent = "No pudimos enviar el correo de confirmación, pero tu reserva quedó registrada. Guarda este código.";
    } else if (respuesta) {
      $("conf-correo").textContent = "Enviamos la confirmación a " + x.cliente.correo + " y al taller. Revisa también la carpeta de spam.";
    }

    var texto = "Hola " + TY.negocio.nombre + ", hice una reserva.\nCódigo: " + x.codigo + "\n" +
      filasConfirmacion(x).map(function (f) { return f[0] + ": " + f[1]; }).join("\n") +
      "\nTeléfono: " + x.cliente.telefono + "\nCorreo: " + x.cliente.correo;
    var wa = TY.enlaceWhatsApp(texto);
    if (wa) { $("conf-wa").href = wa; $("conf-wa").target = "_blank"; $("conf-wa").rel = "noopener"; $("conf-wa").hidden = false; }
    if (respuesta && respuesta.local && wa) $("conf-wa").className = "btn btn--primario";

    c.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Al volver de dLocal Go: reservar.html?codigo=TK-XXXXXX&pago=ok */
  function revisarRetorno() {
    var p = new URLSearchParams(location.search);
    var codigo = p.get("codigo");
    if (!codigo) return false;
    var guardada = null;
    try { guardada = JSON.parse(sessionStorage.getItem("torke_ultima")); } catch (e) { /* nada */ }
    var obtener = hayApi
      ? TY.api("reservas.php", { accion: "consultar", codigo: codigo }, "GET").then(function (r) { return r.ok ? r.reserva : null; })
      : Promise.resolve(guardada && guardada.codigo === codigo ? guardada : null);
    obtener.then(function (x) {
      if (!x) return;
      mostrarConfirmacion(x, null, null);
      if (!x.pagado && p.get("pago") === "ok") {
        $("conf-pago").innerHTML = '<p class="mensaje mensaje--info">Estamos verificando tu pago con dLocal Go. Recibirás un correo cuando quede confirmado.</p>';
      }
    });
    return true;
  }

  /* ---------- Inicio ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    Promise.all([TY.cargarReservas(), TY.apiDisponible()]).then(function (res) {
      R = res[0]; hayApi = res[1];
      if (revisarRetorno()) { /* se muestra la reserva al volver del pago */ }
      pintarServicios();
      pintarSintomas();
      mesVista = primerDiaHabil(); mesVista = new Date(mesVista.getFullYear(), mesVista.getMonth(), 1);
      pintarResumen();

      $("btn-siguiente").addEventListener("click", function () { if (validarPaso(paso)) irA(paso + 1); });
      $("btn-atras").addEventListener("click", function () { irA(paso - 1); });
      $("btn-pagar").addEventListener("click", pagar);
      $("form-reserva").addEventListener("input", function (e) {
        if (e.target.name) { e.target.removeAttribute("aria-invalid"); if (paso === 4) pintarResumen(); }
      });
      $("form-reserva").addEventListener("submit", function (e) { e.preventDefault(); });

      $("mes-ant").addEventListener("click", function () { mesVista = new Date(mesVista.getFullYear(), mesVista.getMonth() - 1, 1); pintarCalendario(); });
      $("mes-sig").addEventListener("click", function () { mesVista = new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 1); pintarCalendario(); });
      $("calendario").addEventListener("click", function (e) {
        var b = e.target.closest(".dia"); if (!b || b.disabled) return;
        estado.fecha = b.getAttribute("data-fecha"); estado.hora = null;
        $("calendario").querySelectorAll(".dia").forEach(function (d) { d.setAttribute("aria-pressed", d === b ? "true" : "false"); });
        limpiarMsg(); pintarHoras(); pintarResumen();
      });
      $("horas").addEventListener("click", function (e) {
        var b = e.target.closest(".hora"); if (!b || b.disabled) return;
        estado.hora = b.getAttribute("data-hora");
        $("horas").querySelectorAll(".hora").forEach(function (h) { h.setAttribute("aria-pressed", h === b ? "true" : "false"); });
        limpiarMsg(); pintarResumen();
      });
    });
  });
})();
