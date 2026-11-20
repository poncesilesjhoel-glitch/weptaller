/* =====================================================================
   Panel de administración (admin.html)
   Requiere el backend PHP (api/admin.php). Secciones:
   reservas, pedidos, catálogo, servicios y agenda, pagos, negocio, cuenta.
   ===================================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var e = function (t) { return TY.escapar(t); };
  var CLAVE_SESION = "automax_admin_token";
  var D = null; // datos del panel
  var DIAS = [[1, "Lunes"], [2, "Martes"], [3, "Miércoles"], [4, "Jueves"], [5, "Viernes"], [6, "Sábado"], [0, "Domingo"]];
  var EST_PEDIDO = { pendiente: "Pendiente de pago", pagado: "Pagado", preparando: "En preparación", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };

  function aviso(t) { TY.aviso(t); }
  function msgEn(el, texto, tipo) { el.innerHTML = texto ? '<p class="mensaje mensaje--' + (tipo || "error") + '">' + e(texto) + "</p>" : ""; }
  function fechaCorta(s) {
    var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }
  function fechaHora(iso) { try { return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (x) { return iso; } }
  function slug(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function wa(tel) { var d = String(tel || "").replace(/\D/g, ""); if (d.length === 8) d = "591" + d; return "https://wa.me/" + d; }

  function guardarSesion(t) { try { sessionStorage.setItem(CLAVE_SESION, t); } catch (x) { /* nada */ } TY.usarToken(t); }
  function salir() { try { sessionStorage.removeItem(CLAVE_SESION); } catch (x) { /* nada */ } location.reload(); }

  function llamar(datos, archivo) {
    return TY.api(archivo || "admin.php", datos).then(function (r) {
      if (r && r.sesion === false) { aviso("Tu sesión expiró."); setTimeout(salir, 900); throw new Error(r.error); }
      return r;
    });
  }

  function vista(cual) {
    $("login").hidden = cual !== "login";
    $("configurar").hidden = cual !== "configurar";
    $("panel").hidden = cual !== "panel";
  }

  /* =================== Acceso =================== */
  function entrar(ev) {
    ev.preventDefault();
    var salida = $("login-msg"); salida.innerHTML = "";
    var u = $("usuario").value.trim(), c = $("clave").value;
    if (!u || !c) { msgEn(salida, "Escribe tu usuario y contraseña."); return; }
    var b = ev.target.querySelector("button[type=submit]"); b.disabled = true;
    TY.api("admin.php", { accion: "login", usuario: u, clave: c }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { msgEn(salida, r.error || "No se pudo entrar."); return; }
      guardarSesion(r.token);
      if (r.configurar) { vista("configurar"); $("cf-usuario").focus(); return; }
      cargar();
    }).catch(function () { b.disabled = false; msgEn(salida, "No se pudo conectar con el servidor."); });
  }

  function configurar(ev) {
    ev.preventDefault();
    var salida = $("configurar-msg");
    var u = $("cf-usuario").value.trim(), c1 = $("cf-clave").value, c2 = $("cf-clave2").value;
    if (c1 !== c2) { msgEn(salida, "Las contraseñas no coinciden."); return; }
    llamar({ accion: "cuenta", usuario: u, claveNueva: c1 }).then(function (r) {
      if (!r.ok) { msgEn(salida, r.error); return; }
      guardarSesion(r.token); aviso("✓ Acceso creado"); cargar();
    }).catch(function () { /* sesión */ });
  }

  function cargar() {
    return llamar({ accion: "datos" }).then(function (r) {
      if (r.configurar) { vista("configurar"); return; }
      if (!r.ok) { aviso(r.error || "No se pudieron cargar los datos."); return; }
      D = r;
      vista("panel");
      $("admin-usuario").textContent = r.usuario;
      $("admin-almacen").textContent = r.info.almacen;
      $("ct-usuario").value = r.usuario;
      pintarTodo();
    }).catch(function () { /* sesión */ });
  }

  function pintarTodo() {
    faltantes();
    cargarClientes();
    pintarReservas();
    pintarPedidos();
    pintarCatalogo();
    pintarServicios();
    pintarPagos();
    pintarNegocio();
  }

  function faltantes() {
    var N = Object.assign({}, TY.negocio, D.negocio || {}), f = [];
    var campos = { titular: "Titular o razón social", nit: "NIT", ciudad: "Ciudad", direccion: "Dirección", correo: "Correo", whatsapp: "WhatsApp" };
    Object.keys(campos).forEach(function (k) { if (!N[k]) f.push(campos[k]); });
    var p = D.pagos, metodos = 0;
    if (p.bnb.activo && p.bnb.accountId) metodos++;
    if (p.dlocal.activo && p.dlocal.apiKey) metodos++;
    if (p.qrFijo.activo && p.qrFijo.imagen) metodos++;
    var html = "";
    if (f.length) html += "<li>Completa en <b>Negocio</b>: " + f.map(e).join(", ") + ".</li>";
    if (!metodos) html += "<li>Activa al menos un medio de pago en <b>Pagos</b> (QR BNB, tarjeta dLocal o QR del taller).</li>";
    $("faltantes").innerHTML = html ? '<div class="faltantes"><strong>Pendiente para dejar el sitio completo:</strong><ul>' + html + "</ul></div>" : "";
  }

  /* =================== Pestañas =================== */
  function tab(nombre) {
    document.querySelectorAll(".admin-tabs [data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === nombre ? "true" : "false"); });
    document.querySelectorAll(".admin-sec").forEach(function (s) { s.hidden = s.getAttribute("data-sec") !== nombre; });
    try { sessionStorage.setItem("automax_admin_tab", nombre); } catch (x) { /* nada */ }
  }

  /* =================== Reservas =================== */
  function reservasFiltradas() {
    var est = $("f-estado").value, desde = $("f-fecha").value, q = $("f-buscar").value.trim().toLowerCase();
    return D.reservas.filter(function (r) {
      if (est && r.estado !== est) return false;
      if (desde && r.fecha < desde) return false;
      if (q) {
        var t = [r.codigo, r.cliente.nombre, r.cliente.telefono, r.cliente.correo, r.vehiculo.placa, r.vehiculo.marca, r.vehiculo.modelo, r.servicioNombre].join(" ").toLowerCase();
        if (t.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return (b.fecha + b.hora).localeCompare(a.fecha + a.hora); });
  }

  function etiquetaPago(x) {
    if (x.pagado) return '<span class="estado estado--pagado">Pagado' + (x.pago && x.pago.metodo ? " · " + e(x.pago.metodo) : "") + "</span>";
    if (x.pagoReportado) return '<span class="estado estado--pendiente">Pago reportado: verificar</span>';
    return "";
  }

  function pintarReservas() {
    var c = { total: D.reservas.length, pendiente: 0, confirmada: 0, cancelada: 0, pagadas: 0 };
    D.reservas.forEach(function (r) { c[r.estado] = (c[r.estado] || 0) + 1; if (r.pagado) c.pagadas++; });
    var hoy = new Date().toISOString().slice(0, 10);
    var proximas = D.reservas.filter(function (r) { return r.fecha >= hoy && r.estado !== "cancelada"; }).length;
    $("n-reservas").textContent = c.pendiente ? c.pendiente : "";
    $("stats").innerHTML = [["Próximas", proximas], ["Pendientes", c.pendiente], ["Confirmadas", c.confirmada], ["Adelantos pagados", c.pagadas]]
      .map(function (s) { return '<div class="stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>"; }).join("");
    var lista = reservasFiltradas();
    if (!lista.length) { $("lista").innerHTML = '<p class="vacio">No hay reservas con estos filtros.</p>'; return; }
    $("lista").innerHTML = lista.map(function (r) {
      var sint = (r.sintomas || []).join(", ") + (r.otroSintoma ? " (" + r.otroSintoma + ")" : "");
      return '<article class="reserva-item">' +
        "<div>" +
          "<h3>" + e(r.codigo) + ' <span class="estado estado--' + e(r.estado) + '">' + e(r.estado) + "</span>" + etiquetaPago(r) + "</h3>" +
          "<p><strong>" + e(fechaCorta(r.fecha)) + " · " + e(r.hora) + "</strong> — " + e(r.servicioNombre) + " · Adelanto " + TY.moneda(r.adelanto) + " de " + TY.moneda(r.precio) + "</p>" +
          "<p>" + e(r.cliente.nombre) + " · " + e(r.cliente.telefono) + " · " + e(r.cliente.correo) + "</p>" +
          "<p>" + e([r.vehiculo.marca, r.vehiculo.modelo, r.vehiculo.anio].join(" ")) + " · Placa " + e(r.vehiculo.placa) + "</p>" +
          (sint ? "<p>Síntomas: " + e(sint) + "</p>" : "") +
          (r.comprobante ? '<p><a href="' + e(r.comprobante) + '" target="_blank" rel="noopener">Ver comprobante de pago</a></p>' : "") +
        "</div>" +
        '<div class="reserva-item__acciones">' +
          (r.estado !== "confirmada" && r.estado !== "completada" ? '<button type="button" class="btn btn--ok btn--sm" data-r="estado" data-v="confirmada" data-c="' + e(r.codigo) + '">Confirmar</button>' : "") +
          (r.estado === "confirmada" ? '<button type="button" class="btn btn--ok btn--sm" data-r="estado" data-v="completada" data-c="' + e(r.codigo) + '">Completada</button>' : "") +
          (r.estado !== "cancelada" ? '<button type="button" class="btn btn--peligro btn--sm" data-r="estado" data-v="cancelada" data-c="' + e(r.codigo) + '">Cancelar</button>' : "") +
          '<button type="button" class="btn btn--borde btn--sm" data-r="pagado" data-c="' + e(r.codigo) + '">' + (r.pagado ? "Quitar pago" : "Marcar pagado") + "</button>" +
          '<a class="btn btn--borde btn--sm" href="' + e(wa(r.cliente.telefono)) + '" target="_blank" rel="noopener">WhatsApp</a>' +
        "</div></article>";
    }).join("");
  }

  function accionReserva(b) {
    var codigo = b.getAttribute("data-c"), tipo = b.getAttribute("data-r");
    var r = D.reservas.filter(function (x) { return x.codigo === codigo; })[0];
    if (!r) return;
    var datos = tipo === "pagado" ? { accion: "pagado", codigo: codigo, pagado: !r.pagado } : { accion: "estado", codigo: codigo, estado: b.getAttribute("data-v") };
    if (datos.estado === "cancelada" && !confirm("¿Cancelar la reserva " + codigo + "? La hora quedará libre.")) return;
    b.disabled = true;
    llamar(datos, "reservas.php").then(function (res) {
      if (res.ok) { aviso("Reserva actualizada" + (res.correoEnviado ? " y cliente notificado" : "")); cargar(); }
      else { b.disabled = false; aviso(res.error || "No se pudo actualizar."); }
    }).catch(function () { b.disabled = false; });
  }

  function exportarCSV() {
    var filas = [["Código", "Estado", "Pagado", "Método", "Fecha", "Hora", "Servicio", "Precio (Bs)", "Adelanto (Bs)", "Cliente", "Teléfono", "Correo", "Marca", "Modelo", "Año", "Placa", "Síntomas"]];
    reservasFiltradas().forEach(function (r) {
      filas.push([r.codigo, r.estado, r.pagado ? "Sí" : "No", r.pago ? r.pago.metodo : "", r.fecha, r.hora, r.servicioNombre, r.precio, r.adelanto, r.cliente.nombre, r.cliente.telefono, r.cliente.correo,
        r.vehiculo.marca, r.vehiculo.modelo, r.vehiculo.anio, r.vehiculo.placa, (r.sintomas || []).join(" | ") + (r.otroSintoma ? " | " + r.otroSintoma : "")]);
    });
    var csv = "﻿" + filas.map(function (f) { return f.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "reservas-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* =================== Pedidos =================== */
  function pintarPedidos() {
    var P = D.pedidos || [];
    var pend = P.filter(function (p) { return p.estado === "pendiente"; }).length;
    var porAtender = P.filter(function (p) { return p.estado === "pagado" || p.estado === "preparando" || p.pagoReportado && !p.pagado; }).length;
    var vendido = P.filter(function (p) { return p.pagado && p.estado !== "cancelado"; }).reduce(function (s, p) { return s + p.total; }, 0);
    $("n-pedidos").textContent = porAtender ? porAtender : "";
    $("stats-pedidos").innerHTML = [["Pedidos", P.length], ["Sin pagar", pend], ["Por atender", porAtender], ["Vendido", TY.moneda(vendido)]]
      .map(function (s) { return '<div class="stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>"; }).join("");
    var est = $("fp-estado").value, q = $("fp-buscar").value.trim().toLowerCase();
    var lista = P.filter(function (p) {
      if (est && p.estado !== est) return false;
      if (q && [p.codigo, p.cliente.nombre, p.cliente.telefono, p.cliente.correo, p.items.map(function (i) { return i.nombre; }).join(" ")].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).slice().reverse();
    if (!lista.length) { $("lista-pedidos").innerHTML = '<p class="vacio">' + (P.length ? "No hay pedidos con estos filtros." : "Aún no hay pedidos de la tienda.") + "</p>"; return; }
    $("lista-pedidos").innerHTML = lista.map(function (p) {
      return '<article class="reserva-item">' +
        "<div>" +
          "<h3>" + e(p.codigo) + ' <span class="estado estado--' + (p.estado === "cancelado" ? "cancelada" : p.estado === "pendiente" ? "pendiente" : "confirmada") + '">' + e(EST_PEDIDO[p.estado] || p.estado) + "</span>" + etiquetaPago(p) + "</h3>" +
          "<p><strong>" + TY.moneda(p.total) + "</strong> · " + e(fechaHora(p.creada)) + " · " + (p.entrega === "envio" ? "Envío: " + e(p.direccion) : "Retiro en taller") + "</p>" +
          "<p>" + p.items.map(function (i) { return e(i.cantidad + " × " + i.nombre); }).join("<br>") + "</p>" +
          "<p>" + e(p.cliente.nombre) + " · " + e(p.cliente.telefono) + " · " + e(p.cliente.correo) + "</p>" +
          (p.nota ? "<p>Nota: " + e(p.nota) + "</p>" : "") +
          (p.comprobante ? '<p><a href="' + e(p.comprobante) + '" target="_blank" rel="noopener">Ver comprobante de pago</a></p>' : "") +
        "</div>" +
        '<div class="reserva-item__acciones">' +
          '<select class="mini-select" data-p="estado" data-c="' + e(p.codigo) + '" aria-label="Estado del pedido ' + e(p.codigo) + '">' +
            Object.keys(EST_PEDIDO).map(function (k) { return '<option value="' + k + '"' + (k === p.estado ? " selected" : "") + ">" + EST_PEDIDO[k] + "</option>"; }).join("") +
          "</select>" +
          '<button type="button" class="btn btn--borde btn--sm" data-p="pagado" data-c="' + e(p.codigo) + '">' + (p.pagado ? "Quitar pago" : "Marcar pagado") + "</button>" +
          '<a class="btn btn--borde btn--sm" href="' + e(wa(p.cliente.telefono)) + '" target="_blank" rel="noopener">WhatsApp</a>' +
        "</div></article>";
    }).join("");
  }

  function accionPedido(el) {
    var codigo = el.getAttribute("data-c");
    var p = (D.pedidos || []).filter(function (x) { return x.codigo === codigo; })[0];
    if (!p) return;
    var datos = el.getAttribute("data-p") === "pagado" ? { accion: "pagado", codigo: codigo, pagado: !p.pagado } : { accion: "estado", codigo: codigo, estado: el.value };
    if (datos.estado === "cancelado" && !confirm("¿Cancelar el pedido " + codigo + "?")) { el.value = p.estado; return; }
    el.disabled = true;
    llamar(datos, "pedidos.php").then(function (res) {
      if (res.ok) { aviso("Pedido actualizado" + (res.correoEnviado ? " y cliente notificado" : "")); cargar(); }
      else { el.disabled = false; aviso(res.error || "No se pudo actualizar."); }
    }).catch(function () { el.disabled = false; });
  }

  /* =================== Clientes =================== */
  var clientes = [];

  function cargarClientes() {
    return llamar({ accion: "listar" }, "clientes.php").then(function (r) {
      if (r.ok) { clientes = r.clientes; pintarClientes(); }
    }).catch(function () { /* sesión */ });
  }

  function pintarClientes() {
    var hace30 = Date.now() - 30 * 86400000;
    var nuevos = clientes.filter(function (c) { return new Date(c.creada).getTime() > hace30; }).length;
    var conCompra = clientes.filter(function (c) { return c.pedidos > 0; }).length;
    $("n-clientes").textContent = "";
    $("stats-clientes").innerHTML = [["Clientes", clientes.length], ["Nuevos (30 días)", nuevos], ["Con pedidos", conCompra], ["Total comprado", TY.moneda(clientes.reduce(function (s, c) { return s + c.comprado; }, 0))]]
      .map(function (s) { return '<div class="stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>"; }).join("");
    var q = $("fc-buscar").value.trim().toLowerCase();
    var lista = clientes.filter(function (c) { return !q || [c.nombre, c.correo, c.telefono, c.codigo].join(" ").toLowerCase().indexOf(q) > -1; });
    if (!lista.length) { $("lista-clientes").innerHTML = '<p class="vacio">' + (clientes.length ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes registrados.") + "</p>"; return; }
    $("lista-clientes").innerHTML = lista.map(function (c) {
      return '<article class="reserva-item">' +
        "<div>" +
          "<h3>" + e(c.nombre) + ' <span class="estado estado--' + (c.activo ? "confirmada" : "cancelada") + '">' + (c.activo ? "Activo" : "Desactivado") + "</span></h3>" +
          "<p>" + e(c.correo) + " · " + e(c.telefono) + (c.direccion ? " · " + e(c.direccion) : "") + "</p>" +
          "<p>" + e(c.codigo) + " · Registrado el " + e(fechaHora(c.creada)) + " · " + c.pedidos + " pedido(s), " + c.reservas + " reserva(s) · Comprado " + TY.moneda(c.comprado) + "</p>" +
        "</div>" +
        '<div class="reserva-item__acciones">' +
          '<button type="button" class="btn btn--borde btn--sm" data-cl="clave" data-c="' + e(c.codigo) + '">Clave temporal</button>' +
          '<button type="button" class="btn ' + (c.activo ? "btn--peligro" : "btn--ok") + ' btn--sm" data-cl="activo" data-c="' + e(c.codigo) + '">' + (c.activo ? "Desactivar" : "Activar") + "</button>" +
          '<a class="btn btn--borde btn--sm" href="' + e(wa(c.telefono)) + '" target="_blank" rel="noopener">WhatsApp</a>' +
        "</div></article>";
    }).join("");
  }

  function accionCliente(b) {
    var codigo = b.getAttribute("data-c");
    var c = clientes.filter(function (x) { return x.codigo === codigo; })[0];
    if (!c) return;
    if (b.getAttribute("data-cl") === "activo") {
      if (c.activo && !confirm("¿Desactivar la cuenta de " + c.nombre + "? No podrá ingresar hasta que la actives.")) return;
      llamar({ accion: "activo", codigo: codigo, activo: !c.activo }, "clientes.php").then(function (r) {
        if (r.ok) { aviso("Cliente actualizado"); cargarClientes(); } else aviso(r.error || "No se pudo actualizar.");
      }).catch(function () { /* sesión */ });
      return;
    }
    if (!confirm("¿Crear una contraseña temporal para " + c.nombre + "? Su contraseña actual dejará de funcionar.")) return;
    llamar({ accion: "restablecer", codigo: codigo }, "clientes.php").then(function (r) {
      if (!r.ok) { aviso(r.error || "No se pudo."); return; }
      var texto = "Hola " + c.nombre.split(" ")[0] + ", tu contraseña temporal para ingresar a tu cuenta en " + TY.negocio.nombre + " es: " + r.clave + " . Cámbiala en «Mi cuenta» después de ingresar.";
      prompt("Contraseña temporal de " + c.nombre + " (cópiala y envíasela):", r.clave);
      if (confirm("¿Enviársela ahora por WhatsApp?")) window.open(wa(c.telefono) + "?text=" + encodeURIComponent(texto), "_blank", "noopener");
    }).catch(function () { /* sesión */ });
  }

  /* =================== Catálogo =================== */
  var cat = null;

  function pintarCatalogo() {
    cat = JSON.parse(JSON.stringify(D.catalogo));
    if (Array.isArray(cat.categorias)) cat.categorias = {};
    pintarCategorias();
    pintarProductos();
  }

  function opcionesCategorias(sel) {
    return Object.keys(cat.categorias).map(function (k) { return '<option value="' + e(k) + '"' + (k === sel ? " selected" : "") + ">" + e(cat.categorias[k]) + "</option>"; }).join("");
  }

  function pintarCategorias() {
    var ks = Object.keys(cat.categorias);
    $("ed-categorias").innerHTML = ks.length ? ks.map(function (k) {
      var usados = cat.productos.filter(function (p) { return p.categoria === k; }).length;
      return '<div class="ed-fila ed-fila--cat" data-k="' + e(k) + '">' +
        '<div class="campo"><label>Nombre visible</label><input data-f="nombre" value="' + e(cat.categorias[k]) + '" maxlength="60"></div>' +
        '<span class="ed-meta">' + usados + " producto" + (usados === 1 ? "" : "s") + "</span>" +
        '<button type="button" class="btn btn--peligro btn--sm" data-quitar-cat="' + e(k) + '"' + (usados ? ' disabled title="Mueve primero sus productos a otra categoría"' : "") + ">Quitar</button>" +
      "</div>";
    }).join("") : '<p class="vacio">Sin categorías.</p>';
  }

  function tarjetaProducto(p, i) {
    return '<article class="ed-producto" data-i="' + i + '">' +
      '<div class="ed-producto__foto"><img src="' + e(p.foto || "assets/img/logo-automax-icono.svg") + '" alt="" width="120" height="120">' +
        '<label class="btn btn--borde btn--sm">Cambiar foto<input type="file" accept="image/*" data-foto hidden></label></div>' +
      '<div class="ed-producto__campos">' +
        '<div class="campo campo--ancho"><label>Nombre</label><input data-f="nombre" value="' + e(p.nombre) + '" maxlength="120"></div>' +
        '<div class="campo"><label>Precio (Bs)</label><input data-f="precio" type="number" min="0" step="0.5" value="' + e(p.precio) + '"></div>' +
        '<div class="campo"><label>Categoría</label><select data-f="categoria">' + opcionesCategorias(p.categoria) + "</select></div>" +
        '<div class="campo"><label>Etiqueta (opcional)</label><input data-f="etiqueta" value="' + e(p.etiqueta || "") + '" maxlength="40" placeholder="Ej.: Oferta"></div>' +
        '<div class="campo campo--ancho"><label>Descripción</label><textarea data-f="descripcion" maxlength="400" rows="2">' + e(p.descripcion || "") + "</textarea></div>" +
        '<label class="check"><input type="checkbox" data-f="disponible"' + (p.disponible !== false ? " checked" : "") + "> <span>Disponible (si lo desmarcas aparece como agotado)</span></label>" +
        '<button type="button" class="btn btn--peligro btn--sm" data-quitar-prod>Eliminar producto</button>' +
      "</div></article>";
  }

  function pintarProductos() {
    $("n-productos").textContent = cat.productos.length;
    $("ed-productos").innerHTML = cat.productos.length ? cat.productos.map(tarjetaProducto).join("") : '<p class="vacio">No hay productos. Agrega el primero.</p>';
  }

  function leerCatalogo() {
    document.querySelectorAll("#ed-categorias [data-k]").forEach(function (f) {
      var v = f.querySelector('[data-f="nombre"]').value.trim();
      if (v) cat.categorias[f.getAttribute("data-k")] = v;
    });
    document.querySelectorAll("#ed-productos [data-i]").forEach(function (f) {
      var p = cat.productos[+f.getAttribute("data-i")];
      f.querySelectorAll("[data-f]").forEach(function (c) {
        var k = c.getAttribute("data-f");
        p[k] = c.type === "checkbox" ? c.checked : k === "precio" ? parseFloat(c.value) || 0 : c.value.trim();
      });
    });
  }

  function guardarCatalogo() {
    leerCatalogo();
    var sinNombre = cat.productos.filter(function (p) { return !p.nombre; }).length;
    if (sinNombre) { $("est-catalogo").textContent = "Hay " + sinNombre + " producto(s) sin nombre."; return; }
    var b = $("guardar-catalogo"); b.disabled = true; $("est-catalogo").textContent = "Guardando…";
    llamar({ accion: "guardar", seccion: "catalogo", valor: cat }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { $("est-catalogo").textContent = r.error || "No se pudo guardar."; return; }
      D.catalogo = r.catalogo; pintarCatalogo();
      $("est-catalogo").textContent = "✓ Guardado. La tienda ya muestra los cambios.";
      aviso("✓ Catálogo guardado");
    }).catch(function () { b.disabled = false; $("est-catalogo").textContent = ""; });
  }

  function subirFoto(input) {
    var art = input.closest("[data-i]"); var i = +art.getAttribute("data-i");
    var img = art.querySelector("img");
    if (!input.files[0]) return;
    leerCatalogo();
    img.style.opacity = ".4";
    TY.comprimirImagen(input.files[0], 900, 0.84).then(function (data) {
      return llamar({ accion: "imagen", imagen: data });
    }).then(function (r) {
      img.style.opacity = "";
      if (!r.ok) { aviso(r.error || "No se pudo subir la imagen."); return; }
      cat.productos[i].foto = r.url; img.src = r.url;
      $("est-catalogo").textContent = "Foto subida. Pulsa «Guardar catálogo» para publicarla.";
    }).catch(function (err) { img.style.opacity = ""; aviso(err.message || "Error al subir la imagen."); });
  }

  /* =================== Servicios y agenda =================== */
  var reg = null;

  function pintarServicios() {
    reg = JSON.parse(JSON.stringify(D.reglas));
    pintarFilasServicios();
    var pausa = (reg.pausas && reg.pausas[0]) || { desde: "", hasta: "" };
    $("ed-agenda").innerHTML =
      campo("Hora de apertura", '<input type="time" data-a="horaApertura" value="' + e(reg.horaApertura) + '">') +
      campo("Hora de cierre", '<input type="time" data-a="horaCierre" value="' + e(reg.horaCierre) + '">') +
      campo("Duración de cada turno (min)", '<input type="number" min="15" max="480" step="5" data-a="duracionMinutos" value="' + e(reg.duracionMinutos) + '">') +
      campo("Pausa desde (almuerzo)", '<input type="time" data-a="pausaDesde" value="' + e(pausa.desde) + '">') +
      campo("Pausa hasta", '<input type="time" data-a="pausaHasta" value="' + e(pausa.hasta) + '">') +
      campo("Días de anticipación máxima", '<input type="number" min="1" max="365" data-a="diasMaximosAnticipacion" value="' + e(reg.diasMaximosAnticipacion) + '">') +
      campo("Adelanto al reservar (%)", '<input type="number" min="0" max="100" data-a="porcentajeAdelanto" value="' + e(reg.porcentajeAdelanto) + '">') +
      campo("Horas para cancelar sin perder el adelanto", '<input type="number" min="0" max="720" data-a="horasCancelacion" value="' + e(reg.horasCancelacion) + '">') +
      '<fieldset class="campo campo--todo"><legend>Días de atención</legend><div class="dias-check">' +
        DIAS.map(function (d) { return '<label class="check"><input type="checkbox" data-dia="' + d[0] + '"' + (reg.diasLaborables.indexOf(d[0]) > -1 ? " checked" : "") + "> <span>" + d[1] + "</span></label>"; }).join("") +
      "</div></fieldset>" +
      '<div class="campo campo--todo"><label>Feriados y días cerrados (uno por línea, AAAA-MM-DD)</label><textarea data-a="feriados" rows="3" placeholder="2026-12-25">' + e((reg.feriados || []).join("\n")) + "</textarea></div>";
  }

  function campo(etiqueta, control) { return '<div class="campo"><label>' + etiqueta + "</label>" + control + "</div>"; }

  function pintarFilasServicios() {
    $("ed-servicios").innerHTML = reg.servicios.map(function (s, i) {
      return '<div class="ed-fila ed-fila--serv" data-s="' + i + '">' +
        '<div class="campo"><label>Servicio</label><input data-f="nombre" value="' + e(s.nombre) + '" maxlength="80"></div>' +
        '<div class="campo"><label>Precio (Bs)</label><input data-f="precio" type="number" min="0" step="1" value="' + e(s.precio) + '"></div>' +
        '<div class="campo"><label>Descripción</label><input data-f="descripcion" value="' + e(s.descripcion || "") + '" maxlength="300"></div>' +
        '<button type="button" class="btn btn--peligro btn--sm" data-quitar-serv="' + i + '" aria-label="Quitar ' + e(s.nombre) + '">Quitar</button>' +
      "</div>";
    }).join("");
  }

  function leerServicios() {
    document.querySelectorAll("#ed-servicios [data-s]").forEach(function (f) {
      var s = reg.servicios[+f.getAttribute("data-s")];
      f.querySelectorAll("[data-f]").forEach(function (c) { var k = c.getAttribute("data-f"); s[k] = k === "precio" ? parseFloat(c.value) || 0 : c.value.trim(); });
    });
  }

  function guardarServicios() {
    leerServicios();
    var a = {};
    document.querySelectorAll("#ed-agenda [data-a]").forEach(function (c) { a[c.getAttribute("data-a")] = c.value.trim(); });
    var valor = {
      servicios: reg.servicios, horaApertura: a.horaApertura, horaCierre: a.horaCierre, duracionMinutos: +a.duracionMinutos,
      diasMaximosAnticipacion: +a.diasMaximosAnticipacion, porcentajeAdelanto: +a.porcentajeAdelanto, horasCancelacion: +a.horasCancelacion,
      pausas: a.pausaDesde && a.pausaHasta ? [{ desde: a.pausaDesde, hasta: a.pausaHasta }] : [],
      diasLaborables: Array.prototype.map.call(document.querySelectorAll("#ed-agenda [data-dia]:checked"), function (c) { return +c.getAttribute("data-dia"); }),
      feriados: a.feriados.split(/[\s,;]+/).filter(Boolean)
    };
    var b = $("guardar-servicios"); b.disabled = true; $("est-servicios").textContent = "Guardando…";
    llamar({ accion: "guardar", seccion: "reglas", valor: valor }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { $("est-servicios").textContent = r.error || "No se pudo guardar."; return; }
      D.reglas = r.reglas; pintarServicios();
      $("est-servicios").textContent = "✓ Guardado. La página de reservas ya usa estos precios y horarios.";
      aviso("✓ Servicios y agenda guardados");
    }).catch(function () { b.disabled = false; $("est-servicios").textContent = ""; });
  }

  /* =================== Pagos =================== */
  function pintarPagos() {
    var p = D.pagos, b = p.bnb, d = p.dlocal, q = p.qrFijo;
    var chk = function (v) { return v ? " checked" : ""; };
    $("ed-pagos").innerHTML =
      '<div class="admin-caja pago-caja">' +
        '<div class="admin-caja__cab"><h2>QR Simple — BNB</h2><span class="estado ' + (b.activo && b.accountId ? "estado--confirmada\">Activo" : "estado--pendiente\">Inactivo") + "</span></div>" +
        '<p class="ayuda-admin">Genera un QR por el monto exacto de cada reserva o pedido. El cliente lo paga desde la app de <b>cualquier banco</b> y el sitio lo confirma solo. Pide tus credenciales de la API QR Simple (Open Banking) a tu ejecutivo del BNB.</p>' +
        '<div class="campos">' +
          '<label class="check campo--todo"><input type="checkbox" data-pb="activo"' + chk(b.activo) + "> <span><b>Activar pago con QR BNB</b></span></label>" +
          campo("Account ID (accountId)", '<input data-pb="accountId" value="' + e(b.accountId) + '" autocomplete="off" spellcheck="false">') +
          campo("Authorization ID (authorizationId)", '<input data-pb="authorizationId" value="' + e(b.authorizationId) + '" autocomplete="off" spellcheck="false" placeholder="' + (b.authorizationId ? "Guardado — escribe para reemplazar" : "") + '">') +
          campo("Entorno", '<select data-pb="entorno"><option value="prueba"' + (b.entorno !== "produccion" ? " selected" : "") + '>Pruebas (test.bnb.com.bo)</option><option value="produccion"' + (b.entorno === "produccion" ? " selected" : "") + ">Producción (marketapi.bnb.com.bo)</option></select>") +
          campo("Cuenta destino (destinationAccountId)", '<input data-pb="cuentaDestino" value="' + e(b.cuentaDestino) + '" maxlength="10"><small class="ayuda">Normalmente 1 = cuenta en bolivianos. Confírmalo con el BNB.</small>') +
          campo("Vigencia del QR (horas)", '<input type="number" min="1" max="720" data-pb="vigenciaHoras" value="' + e(b.vigenciaHoras) + '">') +
          campo("URL base (solo si el BNB te indica otra)", '<input data-pb="urlBase" value="' + e(b.urlBase) + '" placeholder="Vacío = automática según el entorno">') +
        "</div>" +
        '<p class="ayuda-admin">URL de notificación para registrar en el BNB (opcional): <code class="copiar">' + e(D.info.webhookBnb) + "</code></p>" +
        '<div class="pago-caja__acciones"><button type="button" class="btn btn--borde btn--sm" data-probar="bnb">Probar conexión</button>' +
        (b.accountId ? '<button type="button" class="btn btn--peligro btn--sm" data-borrar="bnb">Borrar credenciales</button>' : "") + '<span class="admin-estado" id="prueba-bnb"></span></div>' +
      "</div>" +

      '<div class="admin-caja pago-caja">' +
        '<div class="admin-caja__cab"><h2>Tarjeta — dLocal Go</h2><span class="estado ' + (d.activo && d.apiKey ? "estado--confirmada\">Activo" : "estado--pendiente\">Inactivo") + "</span></div>" +
        '<p class="ayuda-admin">Cobros con tarjeta de débito o crédito. En tu panel de dLocal Go ve a <b>Integraciones › API</b> y copia la API Key y la Secret Key. Usa primero el modo sandbox para probar.</p>' +
        '<div class="campos">' +
          '<label class="check campo--todo"><input type="checkbox" data-pd="activo"' + chk(d.activo) + "> <span><b>Activar pago con tarjeta</b></span></label>" +
          campo("API Key", '<input data-pd="apiKey" value="' + e(d.apiKey) + '" autocomplete="off" spellcheck="false">') +
          campo("Secret Key", '<input data-pd="secretKey" value="' + e(d.secretKey) + '" autocomplete="off" spellcheck="false">') +
          campo("Moneda de cobro", '<select data-pd="moneda"><option value="BOB"' + (d.moneda !== "USD" ? " selected" : "") + '>Bolivianos (BOB)</option><option value="USD"' + (d.moneda === "USD" ? " selected" : "") + ">Dólares (USD), convertir desde Bs</option></select><small class=\"ayuda\">Usa la que tu cuenta de dLocal Go tenga habilitada para Bolivia.</small>") +
          campo("Tipo de cambio (Bs por 1 USD)", '<input type="number" min="0.01" step="0.01" data-pd="tasa" value="' + e(d.tasa) + '">') +
          '<label class="check campo--todo"><input type="checkbox" data-pd="sandbox"' + chk(d.sandbox) + "> <span>Modo sandbox (pruebas, no cobra de verdad)</span></label>" +
        "</div>" +
        '<p class="ayuda-admin">URL de notificación (se envía sola en cada pago): <code class="copiar">' + e(D.info.webhookDlocal) + "</code></p>" +
        '<div class="pago-caja__acciones"><button type="button" class="btn btn--borde btn--sm" data-probar="dlocal">Probar conexión</button>' +
        (d.apiKey ? '<button type="button" class="btn btn--peligro btn--sm" data-borrar="dlocal">Borrar llaves</button>' : "") + '<span class="admin-estado" id="prueba-dlocal"></span></div>' +
      "</div>" +

      '<div class="admin-caja pago-caja">' +
        '<div class="admin-caja__cab"><h2>QR fijo de tu cuenta (respaldo)</h2><span class="estado ' + (q.activo && q.imagen ? "estado--confirmada\">Activo" : "estado--pendiente\">Inactivo") + "</span></div>" +
        '<p class="ayuda-admin">Sube la imagen del QR de cobro de tu cuenta bancaria. El cliente paga, adjunta su comprobante y tú confirmas el pago en Reservas o Pedidos. Útil mientras activas la API del BNB.</p>' +
        '<div class="qr-fijo">' +
          '<div class="qr-fijo__img">' + (q.imagen ? '<img src="' + e(q.imagen) + '" alt="QR actual" width="160" height="160">' : '<span class="vacio">Sin imagen</span>') +
            '<label class="btn btn--borde btn--sm">Subir QR<input type="file" accept="image/*" data-qrfijo hidden></label></div>' +
          '<div class="campos" style="flex:1">' +
            '<label class="check campo--todo"><input type="checkbox" data-pq="activo"' + chk(q.activo) + "> <span><b>Mostrar QR fijo como medio de pago</b></span></label>" +
            campo("Titular de la cuenta", '<input data-pq="titular" value="' + e(q.titular) + '" maxlength="120">') +
            campo("Banco", '<input data-pq="banco" value="' + e(q.banco) + '" maxlength="80" placeholder="Ej.: BNB">') +
            '<input type="hidden" data-pq="imagen" value="' + e(q.imagen) + '">' +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function leerPagos() {
    var v = { bnb: {}, dlocal: {}, qrFijo: {} };
    [["pb", "bnb"], ["pd", "dlocal"], ["pq", "qrFijo"]].forEach(function (g) {
      document.querySelectorAll("#ed-pagos [data-" + g[0] + "]").forEach(function (c) {
        v[g[1]][c.getAttribute("data-" + g[0])] = c.type === "checkbox" ? c.checked : c.value.trim();
      });
    });
    return v;
  }

  function guardarPagos(extra) {
    var v = leerPagos();
    if (extra) Object.keys(extra).forEach(function (k) { v[k].borrar = true; });
    var b = $("guardar-pagos"); b.disabled = true; $("est-pagos").textContent = "Guardando…";
    return llamar({ accion: "guardar", seccion: "pagos", valor: v }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { $("est-pagos").textContent = r.error || "No se pudo guardar."; return false; }
      D.pagos = r.pagos; pintarPagos(); faltantes();
      var nombres = { qr: "QR BNB", tarjeta: "Tarjeta", qrfijo: "QR fijo" };
      $("est-pagos").textContent = "✓ Guardado. Medios activos en el sitio: " + (r.metodos.length ? r.metodos.map(function (m) { return nombres[m]; }).join(", ") : "ninguno");
      aviso("✓ Pagos guardados");
      return true;
    }).catch(function () { b.disabled = false; $("est-pagos").textContent = ""; return false; });
  }

  function probar(servicio) {
    var out = $("prueba-" + servicio);
    out.textContent = "Guardando y probando…";
    guardarPagos().then(function (ok) {
      if (!ok) { out.textContent = ""; return; }
      out = $("prueba-" + servicio);
      out.textContent = "Probando…";
      return llamar({ accion: "probar", servicio: servicio }).then(function (r) {
        out.textContent = r.ok ? "✓ " + r.mensaje : "✗ " + r.error;
        out.className = "admin-estado " + (r.ok ? "admin-estado--ok" : "admin-estado--error");
      });
    }).catch(function () { out.textContent = ""; });
  }

  function subirQrFijo(input) {
    if (!input.files[0]) return;
    TY.comprimirImagen(input.files[0], 1000, 0.92).then(function (data) {
      return llamar({ accion: "imagen", imagen: data });
    }).then(function (r) {
      if (!r.ok) { aviso(r.error || "No se pudo subir."); return; }
      var v = leerPagos(); v.qrFijo.imagen = r.url; v.qrFijo.activo = true;
      D.pagos.qrFijo = Object.assign(D.pagos.qrFijo, v.qrFijo);
      D.pagos.bnb = Object.assign(D.pagos.bnb, v.bnb); D.pagos.dlocal = Object.assign(D.pagos.dlocal, v.dlocal);
      pintarPagos();
      $("est-pagos").textContent = "QR subido. Pulsa «Guardar configuración de pagos».";
    }).catch(function (err) { aviso(err.message || "Error al subir la imagen."); });
  }

  /* =================== Negocio =================== */
  var CAMPOS_NEGOCIO = [
    ["nombre", "Nombre comercial", "AUTOMAX"], ["titular", "Titular o razón social", "Nombre completo o empresa"], ["nit", "NIT", ""],
    ["pais", "País", "Bolivia"], ["ciudad", "Ciudad", "Ej.: Santa Cruz de la Sierra"], ["direccion", "Dirección del taller", "Calle, número, zona"],
    ["correo", "Correo (recibe reservas y pedidos)", "taller@poncesiles.com"], ["whatsapp", "WhatsApp (con código de país)", "59170000000"],
    ["horarioTexto", "Horario (texto)", "Lunes a viernes, de 8:00 a 17:00"]
  ];

  function pintarNegocio() {
    var N = D.negocio || {};
    $("ed-negocio").innerHTML = CAMPOS_NEGOCIO.map(function (c) {
      var actual = N[c[0]] != null && N[c[0]] !== "" ? N[c[0]] : (TY.cfg.negocio[c[0]] || "");
      return '<div class="campo' + (c[0] === "direccion" ? " completo" : "") + '"><label for="ng-' + c[0] + '">' + c[1] + '</label><input id="ng-' + c[0] + '" data-n="' + c[0] + '" value="' + e(actual) + '" placeholder="' + e(c[2]) + '"></div>';
    }).join("");
  }

  function guardarNegocio() {
    var v = {};
    document.querySelectorAll("#ed-negocio [data-n]").forEach(function (c) { v[c.getAttribute("data-n")] = c.value.trim(); });
    var b = $("guardar-negocio"); b.disabled = true; $("est-negocio").textContent = "Guardando…";
    llamar({ accion: "guardar", seccion: "negocio", valor: v }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { $("est-negocio").textContent = r.error || "No se pudo guardar."; return; }
      D.negocio = v; faltantes();
      $("est-negocio").textContent = "✓ Guardado. El sitio ya muestra estos datos.";
      aviso("✓ Datos del negocio guardados");
    }).catch(function () { b.disabled = false; $("est-negocio").textContent = ""; });
  }

  /* =================== Cuenta =================== */
  function guardarCuenta(ev) {
    ev.preventDefault();
    var salida = $("cuenta-msg");
    llamar({ accion: "cuenta", usuario: $("ct-usuario").value.trim(), claveActual: $("ct-actual").value, claveNueva: $("ct-nueva").value }).then(function (r) {
      if (!r.ok) { msgEn(salida, r.error); return; }
      guardarSesion(r.token);
      $("admin-usuario").textContent = r.usuario;
      $("ct-actual").value = ""; $("ct-nueva").value = "";
      msgEn(salida, "✓ Datos de acceso actualizados.", "ok");
    }).catch(function () { /* sesión */ });
  }

  /* =================== Inicio =================== */
  document.addEventListener("DOMContentLoaded", function () {
    $("form-login").addEventListener("submit", entrar);
    $("form-configurar").addEventListener("submit", configurar);
    $("form-cuenta").addEventListener("submit", guardarCuenta);
    $("btn-salir").addEventListener("click", salir);
    $("btn-actualizar").addEventListener("click", function () { cargar().then(function () { aviso("Datos actualizados"); }); });
    $("btn-csv").addEventListener("click", exportarCSV);

    document.querySelector(".admin-tabs").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-tab]"); if (b) tab(b.getAttribute("data-tab"));
    });
    ["f-estado", "f-fecha", "f-buscar"].forEach(function (id) { $(id).addEventListener("input", pintarReservas); });
    ["fp-estado", "fp-buscar"].forEach(function (id) { $(id).addEventListener("input", pintarPedidos); });
    $("fc-buscar").addEventListener("input", pintarClientes);
    $("lista-clientes").addEventListener("click", function (ev) { var b = ev.target.closest("[data-cl]"); if (b) accionCliente(b); });
    $("lista").addEventListener("click", function (ev) { var b = ev.target.closest("[data-r]"); if (b) accionReserva(b); });
    $("lista-pedidos").addEventListener("click", function (ev) { var b = ev.target.closest("button[data-p]"); if (b) accionPedido(b); });
    $("lista-pedidos").addEventListener("change", function (ev) { if (ev.target.matches("select[data-p]")) accionPedido(ev.target); });

    // Catálogo
    $("add-categoria").addEventListener("click", function () {
      leerCatalogo();
      var nombre = prompt("Nombre de la nueva categoría (ej.: Lubricantes):");
      if (!nombre || !nombre.trim()) return;
      var k = slug(nombre) || "categoria";
      while (cat.categorias[k]) k += "-2";
      cat.categorias[k] = nombre.trim();
      pintarCategorias(); pintarProductos();
    });
    $("ed-categorias").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-quitar-cat]"); if (!b || b.disabled) return;
      leerCatalogo(); delete cat.categorias[b.getAttribute("data-quitar-cat")]; pintarCategorias(); pintarProductos();
    });
    $("add-producto").addEventListener("click", function () {
      leerCatalogo();
      var primera = Object.keys(cat.categorias)[0] || "otros";
      if (!cat.categorias[primera]) cat.categorias[primera] = "Otros";
      cat.productos.unshift({ id: "", nombre: "", categoria: primera, precio: 0, descripcion: "", foto: "", etiqueta: "", disponible: true });
      pintarCategorias(); pintarProductos();
      var primero = document.querySelector('#ed-productos [data-i="0"] [data-f="nombre"]'); if (primero) primero.focus();
    });
    $("ed-productos").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-quitar-prod]"); if (!b) return;
      leerCatalogo();
      var i = +b.closest("[data-i]").getAttribute("data-i");
      if (!confirm("¿Eliminar «" + (cat.productos[i].nombre || "producto sin nombre") + "»? Se quitará de la tienda al guardar.")) return;
      cat.productos.splice(i, 1); pintarCategorias(); pintarProductos();
    });
    $("ed-productos").addEventListener("change", function (ev) { if (ev.target.matches("[data-foto]")) subirFoto(ev.target); });
    $("guardar-catalogo").addEventListener("click", guardarCatalogo);

    // Servicios
    $("add-servicio").addEventListener("click", function () {
      leerServicios(); reg.servicios.push({ id: "", nombre: "", precio: 0, descripcion: "" }); pintarFilasServicios();
      var ult = document.querySelector("#ed-servicios [data-s]:last-child [data-f=nombre]"); if (ult) ult.focus();
    });
    $("ed-servicios").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-quitar-serv]"); if (!b) return;
      leerServicios(); reg.servicios.splice(+b.getAttribute("data-quitar-serv"), 1); pintarFilasServicios();
    });
    $("guardar-servicios").addEventListener("click", guardarServicios);

    // Pagos
    $("ed-pagos").addEventListener("click", function (ev) {
      var p = ev.target.closest("[data-probar]"); if (p) { probar(p.getAttribute("data-probar")); return; }
      var b = ev.target.closest("[data-borrar]");
      if (b && confirm("¿Borrar las credenciales guardadas? El medio de pago quedará desactivado.")) { var x = {}; x[b.getAttribute("data-borrar")] = true; guardarPagos(x); }
    });
    $("ed-pagos").addEventListener("change", function (ev) { if (ev.target.matches("[data-qrfijo]")) subirQrFijo(ev.target); });
    $("guardar-pagos").addEventListener("click", function () { guardarPagos(); });

    $("guardar-negocio").addEventListener("click", guardarNegocio);

    var t = null; try { t = sessionStorage.getItem(CLAVE_SESION); } catch (x) { /* nada */ }
    try { var tb = sessionStorage.getItem("automax_admin_tab"); if (tb) tab(tb); } catch (x) { /* nada */ }

    TY.apiDisponible().then(function (ok) {
      if (!ok) {
        $("login-msg").innerHTML = '<p class="mensaje mensaje--error">El panel necesita el servidor (backend PHP). Abre el sitio publicado o inicia el servidor local con PHP.</p>';
        return;
      }
      if (t) { TY.usarToken(t); cargar(); }
    });
  });
})();
