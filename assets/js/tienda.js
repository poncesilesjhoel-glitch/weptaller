/* =====================================================================
   Tienda: catálogo (productos.json), filtros, buscador y carrito
   ===================================================================== */
(function () {
  "use strict";
  var CLAVE = "torke_carrito";
  var productos = [];
  var categorias = {};
  var filtro = "todas";
  var busqueda = "";
  var carrito = leer();
  var hayApi = false;
  var enCheckout = false;

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(carrito)); } catch (e) { /* sin almacenamiento */ }
  }
  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function porId(id) {
    for (var i = 0; i < productos.length; i++) if (productos[i].id === id) return productos[i];
    return null;
  }

  /* ---------- Catálogo ---------- */
  function cargar() {
    var cont = document.getElementById("productos");
    TY.cargarDatos()
      .then(function (datos) {
        hayApi = datos.api;
        var d = datos.catalogo;
        if (!d) throw new Error("sin catálogo");
        productos = (d.productos || []).filter(function (p) { return p && p.id && p.nombre; });
        categorias = d.categorias || {};
        // Limpia del carrito productos que ya no existen
        Object.keys(carrito).forEach(function (id) { if (!porId(id)) delete carrito[id]; });
        guardar();
        pintarFiltros();
        pintar();
        pintarCarrito();
      })
      .catch(function () {
        cont.innerHTML = '<p class="vacio">No se pudo cargar el catálogo. Si abriste el archivo con doble clic, usa un servidor local (ver README) o visita el sitio publicado.</p>';
      });
  }

  function pintarFiltros() {
    var cont = document.getElementById("filtros");
    var usadas = {};
    productos.forEach(function (p) { usadas[p.categoria] = true; });
    var html = '<button type="button" class="filtro" data-cat="todas" aria-pressed="true">Todo</button>';
    Object.keys(categorias).forEach(function (k) {
      if (usadas[k]) html += '<button type="button" class="filtro" data-cat="' + TY.escapar(k) + '" aria-pressed="false">' + TY.escapar(categorias[k]) + "</button>";
    });
    cont.innerHTML = html;
    cont.addEventListener("click", function (e) {
      var b = e.target.closest(".filtro");
      if (!b) return;
      filtro = b.getAttribute("data-cat");
      cont.querySelectorAll(".filtro").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      pintar();
    });
  }

  function pintar() {
    var cont = document.getElementById("productos");
    var q = normalizar(busqueda);
    var lista = productos.filter(function (p) {
      var okCat = filtro === "todas" || p.categoria === filtro;
      var texto = normalizar(p.nombre + " " + p.descripcion + " " + (categorias[p.categoria] || ""));
      return okCat && (!q || texto.indexOf(q) > -1);
    });
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio">No encontramos productos con esa búsqueda. Escríbenos y te lo conseguimos.</p>';
      return;
    }
    cont.innerHTML = lista.map(function (p, i) {
      var disponible = p.disponible !== false;
      return '<article class="producto foco entra" style="--i:' + i + '">' +
        '<div class="producto__foto"><img src="' + TY.escapar(p.foto) + '" alt="' + TY.escapar(p.nombre) + '" loading="lazy" width="300" height="300">' +
          (p.etiqueta ? '<span class="producto__etiqueta">' + TY.escapar(p.etiqueta) + "</span>" : "") + "</div>" +
        '<div class="producto__cuerpo">' +
          '<span class="producto__cat">' + TY.escapar(categorias[p.categoria] || p.categoria) + "</span>" +
          "<h3>" + TY.escapar(p.nombre) + "</h3>" +
          "<p>" + TY.escapar(p.descripcion) + "</p>" +
          '<div class="producto__pie">' +
            '<span class="producto__precio">' + TY.moneda(p.precio) + "</span>" +
            (disponible
              ? '<button type="button" class="btn btn--primario btn--sm btn--bloque producto__agregar" data-agregar="' + TY.escapar(p.id) + '">Agregar al carrito</button>'
              : '<span class="producto__agotado">Agotado temporalmente</span>') +
          "</div>" +
        "</div></article>";
    }).join("");
  }

  /* ---------- Carrito ---------- */
  function total() {
    return Object.keys(carrito).reduce(function (s, id) {
      var p = porId(id); return p ? s + p.precio * carrito[id] : s;
    }, 0);
  }
  function unidades() {
    return Object.keys(carrito).reduce(function (s, id) { return s + carrito[id]; }, 0);
  }

  function pintarCarrito() {
    var n = unidades();
    document.querySelectorAll("[data-carrito-n]").forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    var lista = document.getElementById("carrito-lista");
    if (!lista) return;
    var ids = Object.keys(carrito);
    if (!ids.length) {
      lista.innerHTML = '<li class="vacio">Tu carrito está vacío.</li>';
    } else {
      lista.innerHTML = ids.map(function (id) {
        var p = porId(id); if (!p) return "";
        return '<li class="carrito__item">' +
          '<img src="' + TY.escapar(p.foto) + '" alt="" width="56" height="56">' +
          "<div><b>" + TY.escapar(p.nombre) + "</b><small>" + TY.moneda(p.precio) + " c/u</small><br>" +
            '<span class="cantidad"><button type="button" data-menos="' + id + '" aria-label="Quitar una unidad">−</button><span>' + carrito[id] + '</span><button type="button" data-mas="' + id + '" aria-label="Añadir una unidad">+</button></span></div>' +
          '<div style="text-align:right"><b>' + TY.moneda(p.precio * carrito[id]) + '</b><button type="button" class="quitar" data-quitar="' + id + '">Quitar</button></div>' +
        "</li>";
      }).join("");
    }
    document.getElementById("carrito-total").textContent = TY.moneda(total());
    document.getElementById("carrito-finalizar").disabled = !ids.length;
    if (!ids.length && enCheckout) modoCheckout(false);
    document.getElementById("carrito-vaciar").disabled = !ids.length;
  }

  function cambiar(id, delta) {
    carrito[id] = (carrito[id] || 0) + delta;
    if (carrito[id] <= 0) delete carrito[id];
    guardar(); pintarCarrito();
  }

  /* Animación: la foto del producto vuela hasta el ícono del carrito */
  function volarAlCarrito(img) {
    var destino = document.querySelector(".carrito-btn");
    var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!img || !destino || reducir || !img.animate) { saltar(destino); return; }
    var a = img.getBoundingClientRect(), b = destino.getBoundingClientRect();
    var c = img.cloneNode();
    c.className = "vuela";
    c.style.left = a.left + "px"; c.style.top = a.top + "px"; c.style.width = a.width + "px"; c.style.height = a.height + "px";
    document.body.appendChild(c);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    c.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 80) + "px) scale(.45)", opacity: 1, offset: 0.55 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.08)", opacity: 0.4 }
    ], { duration: 750, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }).onfinish = function () { c.remove(); saltar(destino); };
    setTimeout(function () { if (c.isConnected) { c.remove(); saltar(destino); } }, 900);
  }
  function saltar(el) {
    if (!el) return;
    el.classList.remove("salta"); void el.offsetWidth; el.classList.add("salta");
  }

  var ultimoFoco = null;
  function abrir() {
    ultimoFoco = document.activeElement;
    document.getElementById("carrito").hidden = false;
    document.body.style.overflow = "hidden";
    document.querySelector("#carrito .cerrar").focus();
  }
  function cerrar() {
    if (enCheckout) modoCheckout(false);
    document.getElementById("carrito").hidden = true;
    document.body.style.overflow = "";
    if (ultimoFoco) ultimoFoco.focus();
  }

  /* ---------- Checkout: crea el pedido y lleva a la página de pago ---------- */
  function modoCheckout(si) {
    enCheckout = si;
    document.getElementById("carrito-lista").hidden = si;
    document.getElementById("checkout").hidden = !si;
    document.getElementById("carrito-vaciar").hidden = si;
    document.getElementById("carrito-finalizar").textContent = si ? "Confirmar pedido y pagar" : "Finalizar pedido";
    document.getElementById("checkout-msg").innerHTML = "";
    if (si) document.getElementById("ck-nombre").focus();
  }

  function confirmarPedido() {
    var f = document.getElementById("checkout");
    var salida = document.getElementById("checkout-msg");
    var envio = f.entrega.value === "envio";
    var reglas = {
      nombre: function (v) { return v.length >= 3; },
      telefono: function (v) { return v.replace(/\D/g, "").length >= 7; },
      correo: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
      direccion: function (v) { return !envio || v.length >= 6; }
    };
    var malo = null;
    Object.keys(reglas).forEach(function (k) {
      var ok = reglas[k](f[k].value.trim());
      f[k].setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !malo) malo = f[k];
    });
    if (malo) { salida.innerHTML = '<p class="mensaje mensaje--error">Revisa los campos marcados en rojo.</p>'; malo.focus(); return; }
    var boton = document.getElementById("carrito-finalizar");
    boton.disabled = true; boton.textContent = "Creando pedido…";
    TY.api("pedidos.php", {
      accion: "crear",
      items: Object.keys(carrito).map(function (id) { return { id: id, cantidad: carrito[id] }; }),
      cliente: { nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim(), correo: f.correo.value.trim() },
      entrega: f.entrega.value, direccion: f.direccion.value.trim(), nota: f.nota.value.trim()
    }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "No se pudo crear el pedido.");
      carrito = {}; guardar();
      location.href = "pedido.html?codigo=" + encodeURIComponent(r.pedido.codigo);
    }).catch(function (err) {
      boton.disabled = false; boton.textContent = "Confirmar pedido y pagar";
      salida.innerHTML = '<p class="mensaje mensaje--error">' + TY.escapar(err.message || "Error de conexión.") + "</p>";
    });
  }

  function finalizar() {
    var ids = Object.keys(carrito);
    if (!ids.length) return;
    if (hayApi) { if (enCheckout) confirmarPedido(); else modoCheckout(true); return; }
    var lineas = ids.map(function (id) {
      var p = porId(id); return "• " + carrito[id] + " x " + p.nombre + " — " + TY.moneda(p.precio * carrito[id]);
    });
    var texto = "Hola " + TY.negocio.nombre + ", quiero hacer este pedido:\n\n" + lineas.join("\n") +
      "\n\nTotal productos: " + TY.moneda(total()) + "\n\nNombre:\nDirección de envío o retiro en taller:";
    var wa = TY.enlaceWhatsApp(texto);
    if (wa) { window.open(wa, "_blank", "noopener"); return; }
    if (TY.negocio.correo) {
      location.href = "mailto:" + TY.negocio.correo + "?subject=" + encodeURIComponent("Pedido desde la tienda") + "&body=" + encodeURIComponent(texto);
      return;
    }
    TY.aviso("Configura WhatsApp o correo en assets/js/config.js para recibir pedidos.");
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("productos")) return;
    cargar();
    var buscar = document.getElementById("buscar");
    var t;
    buscar.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { busqueda = buscar.value; pintar(); }, 120);
    });

    document.addEventListener("click", function (e) {
      var el;
      if ((el = e.target.closest("[data-agregar]"))) {
        var p = porId(el.getAttribute("data-agregar"));
        if (!p) return;
        cambiar(p.id, 1);
        volarAlCarrito(el.closest(".producto").querySelector("img"));
        el.classList.add("agregado"); el.textContent = "✓ Agregado";
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.classList.remove("agregado"); el.textContent = "Agregar al carrito"; }, 1400);
        TY.aviso("✓ " + p.nombre + " agregado al carrito");
      } else if ((el = e.target.closest("[data-mas]"))) cambiar(el.getAttribute("data-mas"), 1);
      else if ((el = e.target.closest("[data-menos]"))) cambiar(el.getAttribute("data-menos"), -1);
      else if ((el = e.target.closest("[data-quitar]"))) cambiar(el.getAttribute("data-quitar"), -Infinity);
      else if (e.target.closest("[data-abrir-carrito]")) abrir();
      else if (e.target.closest("[data-cerrar-carrito]")) cerrar();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !document.getElementById("carrito").hidden) cerrar();
    });
    document.getElementById("carrito-finalizar").addEventListener("click", finalizar);
    document.getElementById("checkout-volver").addEventListener("click", function () { modoCheckout(false); });
    document.getElementById("checkout").addEventListener("submit", function (e) { e.preventDefault(); confirmarPedido(); });
    document.getElementById("checkout").addEventListener("change", function (e) {
      if (e.target.name === "entrega") document.getElementById("ck-direccion-campo").hidden = e.target.value !== "envio";
    });
    document.getElementById("checkout").addEventListener("input", function (e) { e.target.removeAttribute("aria-invalid"); });
    document.getElementById("carrito-vaciar").addEventListener("click", function () {
      carrito = {}; guardar(); pintarCarrito();
    });
    pintarCarrito();
  });
})();
