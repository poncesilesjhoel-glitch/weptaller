/* =====================================================================
   Cuenta del cliente (cuenta.html)
   Ingresar, crear cuenta, ver pedidos y reservas, editar datos y clave.
   Admite ?volver=pagina para regresar después de ingresar (ej. checkout).
   ===================================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var e = function (t) { return TY.escapar(t); };
  var EST_PEDIDO = { pendiente: "Pendiente de pago", pagado: "Pagado", preparando: "En preparación", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };
  var EST_RESERVA = { pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada" };

  function msg(form, texto, tipo) {
    form.querySelector(".msg").innerHTML = texto ? '<p class="mensaje mensaje--' + (tipo || "error") + '">' + e(texto) + "</p>" : "";
  }
  function volver() {
    var v = new URLSearchParams(location.search).get("volver") || "";
    return /^[a-z0-9_-]+\.html(#[a-z0-9_-]+)?$/i.test(v) ? v : "";
  }
  function fecha(s) {
    var p = String(s).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  }
  function fechaHora(iso) { try { return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }); } catch (x) { return ""; } }

  function vista(conSesion) {
    $("acceso").hidden = conSesion;
    $("panel-cliente").hidden = !conSesion;
    $("cuenta-sub").textContent = conSesion ? "Tus pedidos, reservas y datos en un solo lugar." : "Ingresa o crea tu cuenta para comprar más rápido y ver tus pedidos y reservas.";
  }

  function tab(cual) {
    var reg = cual === "registro";
    $("tab-ingresar").setAttribute("aria-selected", reg ? "false" : "true");
    $("tab-registro").setAttribute("aria-selected", reg ? "true" : "false");
    $("form-ingresar").hidden = reg;
    $("form-registro").hidden = !reg;
    (reg ? $("rg-nombre") : $("in-correo")).focus();
  }

  function sesionIniciada(r) {
    TY.cliente.guardar(r.token, r.cliente);
    var v = volver();
    if (v) { location.href = v; return; }
    cargarPerfil();
  }

  function ingresar(ev) {
    ev.preventDefault();
    var f = ev.target, b = f.querySelector("button[type=submit]");
    if (!f.correo.value.trim() || !f.clave.value) { msg(f, "Escribe tu correo y contraseña."); return; }
    b.disabled = true; msg(f, "");
    TY.api("clientes.php", { accion: "login", correo: f.correo.value.trim(), clave: f.clave.value }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { msg(f, r.error || "No se pudo ingresar."); return; }
      sesionIniciada(r);
    }).catch(function () { b.disabled = false; msg(f, "Error de conexión. Inténtalo de nuevo."); });
  }

  function registrar(ev) {
    ev.preventDefault();
    var f = ev.target, b = f.querySelector("button[type=submit]");
    var malo = null;
    var reglas = {
      nombre: function (v) { return v.length >= 3; },
      correo: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
      telefono: function (v) { return v.replace(/\D/g, "").length >= 7; },
      clave: function (v) { return v.length >= 8; }
    };
    Object.keys(reglas).forEach(function (k) {
      var ok = reglas[k](f[k].value.trim());
      f[k].setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !malo) malo = f[k];
    });
    if (malo) { msg(f, "Revisa los campos marcados en rojo (la contraseña necesita al menos 8 caracteres)."); malo.focus(); return; }
    if (!f.acepto.checked) { msg(f, "Debes aceptar los términos y la política de privacidad."); return; }
    b.disabled = true; msg(f, "");
    TY.api("clientes.php", { accion: "registrar", nombre: f.nombre.value.trim(), correo: f.correo.value.trim(), telefono: f.telefono.value.trim(), clave: f.clave.value }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { msg(f, r.error || "No se pudo crear la cuenta."); return; }
      TY.aviso("✓ ¡Cuenta creada! Bienvenido");
      sesionIniciada(r);
    }).catch(function () { b.disabled = false; msg(f, "Error de conexión. Inténtalo de nuevo."); });
  }

  function pintarPerfil(r) {
    var c = r.cliente;
    TY.cliente.guardar(null, c);
    vista(true);
    $("cuenta-titulo").textContent = "Mi cuenta";
    $("cl-hola").textContent = "Hola, " + c.nombre.split(" ")[0];
    $("cl-correo").textContent = c.correo + " · Cliente desde " + fechaHora(c.creada);
    $("cl-avatar").textContent = c.nombre.trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join("");
    $("pf-nombre").value = c.nombre; $("pf-telefono").value = c.telefono; $("pf-direccion").value = c.direccion || "";

    $("cl-pedidos").innerHTML = r.pedidos.length ? r.pedidos.map(function (p) {
      var pendiente = !p.pagado && p.estado !== "cancelado";
      return '<a class="cuenta-item" href="pedido.html?codigo=' + encodeURIComponent(p.codigo) + '">' +
        "<div><b>" + e(p.codigo) + '</b><span class="estado estado--' + (p.estado === "cancelado" ? "cancelada" : pendiente ? "pendiente" : "confirmada") + '">' + e(EST_PEDIDO[p.estado] || p.estado) + "</span>" +
        "<small>" + p.items.map(function (i) { return e(i.cantidad + " × " + i.nombre); }).join(" · ") + "</small></div>" +
        "<strong>" + TY.moneda(p.total) + (pendiente ? '<em>Pagar →</em>' : "") + "</strong></a>";
    }).join("") : '<p class="vacio">Aún no tienes pedidos. <a href="index.html#tienda">Visita la tienda</a>.</p>';

    $("cl-reservas").innerHTML = r.reservas.length ? r.reservas.map(function (x) {
      var pendiente = !x.pagado && x.estado !== "cancelada";
      return '<a class="cuenta-item" href="reservar.html?codigo=' + encodeURIComponent(x.codigo) + '">' +
        "<div><b>" + e(x.codigo) + '</b><span class="estado estado--' + e(x.estado) + '">' + e(EST_RESERVA[x.estado] || x.estado) + "</span>" +
        "<small>" + e(x.servicioNombre) + " · " + e(fecha(x.fecha)) + " " + e(x.hora) + " · " + e([x.vehiculo.marca, x.vehiculo.modelo].join(" ")) + "</small></div>" +
        "<strong>" + TY.moneda(x.adelanto) + (pendiente ? "<em>Pagar adelanto →</em>" : x.pagado ? "<em>Adelanto pagado</em>" : "") + "</strong></a>";
    }).join("") : '<p class="vacio">Aún no tienes reservas. <a href="reservar.html">Reserva una revisión</a>.</p>';
  }

  function cargarPerfil() {
    return TY.api("clientes.php", { accion: "perfil" }).then(function (r) {
      if (!r.ok) { TY.cliente.salir(); vista(false); return; }
      pintarPerfil(r);
    }).catch(function () { TY.aviso("Error de conexión."); });
  }

  function guardarPerfil(ev) {
    ev.preventDefault();
    var f = ev.target;
    TY.api("clientes.php", { accion: "actualizar", nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim(), direccion: f.direccion.value.trim() }).then(function (r) {
      if (!r.ok) { msg(f, r.error); return; }
      TY.cliente.guardar(null, r.cliente);
      $("cl-hola").textContent = "Hola, " + r.cliente.nombre.split(" ")[0];
      msg(f, "✓ Datos guardados.", "ok");
    });
  }

  function cambiarClave(ev) {
    ev.preventDefault();
    var f = ev.target;
    if (f.nueva.value.length < 8) { msg(f, "La nueva contraseña debe tener al menos 8 caracteres."); return; }
    TY.api("clientes.php", { accion: "clave", actual: f.actual.value, nueva: f.nueva.value }).then(function (r) {
      if (!r.ok) { msg(f, r.error); return; }
      TY.cliente.guardar(r.token, null);
      f.reset();
      msg(f, "✓ Contraseña actualizada.", "ok");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("tab-ingresar").addEventListener("click", function () { tab("ingresar"); });
    $("tab-registro").addEventListener("click", function () { tab("registro"); });
    $("form-ingresar").addEventListener("submit", ingresar);
    $("form-registro").addEventListener("submit", registrar);
    $("form-registro").addEventListener("input", function (ev) { ev.target.removeAttribute("aria-invalid"); });
    $("form-perfil").addEventListener("submit", guardarPerfil);
    $("form-clave").addEventListener("submit", cambiarClave);
    $("btn-salir-cliente").addEventListener("click", function () { TY.cliente.salir(); TY.aviso("Sesión cerrada"); vista(false); tab("ingresar"); });
    document.querySelectorAll(".ver-clave").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = b.previousElementSibling, ver = i.type === "password";
        i.type = ver ? "text" : "password"; b.textContent = ver ? "Ocultar" : "Ver";
        b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
      });
    });

    TY.apiDisponible().then(function (ok) {
      if (!ok) {
        vista(false);
        $("acceso").innerHTML = '<p class="mensaje mensaje--info">Las cuentas de clientes no están disponibles en este momento.</p>';
        return;
      }
      if (TY.cliente.token()) cargarPerfil();
      else {
        vista(false);
        if (new URLSearchParams(location.search).get("modo") === "registro") tab("registro");
      }
    });
  });
})();
