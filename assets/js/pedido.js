/* =====================================================================
   Página del pedido (pedido.html?codigo=PD-XXXXXX)
   Muestra el detalle y permite pagarlo con QR o tarjeta.
   ===================================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var ESTADOS = { pendiente: "Pendiente de pago", pagado: "Pagado", preparando: "En preparación", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };

  function pintar(p, metodos, qrFijo) {
    $("pedido-cargando").hidden = true;
    $("pedido-contenido").hidden = false;
    $("pedido-codigo").textContent = p.codigo;
    var filas = p.items.map(function (i) { return [i.cantidad + " × " + i.nombre, TY.moneda(i.precio * i.cantidad)]; });
    filas.push(["Entrega", p.entrega === "envio" ? "Envío a domicilio" : "Retiro en el taller"]);
    filas.push(["Estado", ESTADOS[p.estado] || p.estado]);
    $("pedido-resumen").innerHTML = filas.map(function (f) {
      return "<div><dt>" + TY.escapar(f[0]) + "</dt><dd>" + TY.escapar(f[1]) + "</dd></div>";
    }).join("") + '<div class="total"><dt>Total</dt><dd>' + TY.moneda(p.total) + "</dd></div>";

    var cont = $("pedido-pago");
    function ok() {
      $("pedido-titulo").textContent = "¡Pedido pagado!";
      cont.innerHTML = '<p class="mensaje mensaje--ok">Recibimos tu pago. Te avisaremos cuando tu pedido esté listo' + (p.entrega === "envio" ? " para el envío" : " para retirar") + ".</p>";
    }
    if (p.estado === "cancelado") {
      $("pedido-titulo").textContent = "Pedido cancelado";
      cont.innerHTML = '<p class="mensaje mensaje--error">Este pedido fue cancelado.</p>';
    } else if (p.pagado) ok();
    else if (p.pagoReportado) cont.innerHTML = '<p class="mensaje mensaje--info">Recibimos tu aviso de pago. Lo estamos verificando.</p>';
    else {
      cont.innerHTML = '<p class="conf-pago__titulo"><strong>Elige cómo pagar tu pedido:</strong></p><div id="pedido-pago-caja"></div>';
      TY.pagos.mostrar($("pedido-pago-caja"), { tipo: "pedido", codigo: p.codigo, monto: p.total, metodos: metodos, qrFijo: qrFijo, alPagar: ok });
    }

    var wa = TY.enlaceWhatsApp("Hola " + TY.negocio.nombre + ", tengo una consulta sobre mi pedido " + p.codigo + ".");
    if (wa) { $("pedido-wa").href = wa; $("pedido-wa").target = "_blank"; $("pedido-wa").rel = "noopener"; $("pedido-wa").hidden = false; }
  }

  function error(t) {
    $("pedido-cargando").textContent = t;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var q = new URLSearchParams(location.search);
    var codigo = q.get("codigo");
    if (!codigo) { error("No indicaste un código de pedido."); return; }
    TY.cargarDatos().then(function (d) {
      if (!d.api) { error("La tienda en línea no está disponible en este momento."); return; }
      function consultar() {
        return TY.api("pedidos.php", { accion: "consultar", codigo: codigo }, "GET");
      }
      consultar().then(function (r) {
        if (!r.ok) { error(r.error || "Pedido no encontrado."); return; }
        if (!r.pedido.pagado && q.get("pago") === "ok") {
          pintar(r.pedido, [], null);
          $("pedido-pago").innerHTML = '<p class="mensaje mensaje--info"><span class="giro"></span> Estamos confirmando tu pago con la tarjeta…</p>';
          var n = 0, t = setInterval(function () {
            consultar().then(function (x) {
              if (x.ok && x.pedido.pagado) { clearInterval(t); pintar(x.pedido, [], null); }
              else if (++n > 20) { clearInterval(t); $("pedido-pago").innerHTML = '<p class="mensaje mensaje--info">Tu pago está en verificación. Te enviaremos la confirmación por correo.</p>'; }
            });
          }, 3000);
          return;
        }
        pintar(r.pedido, r.metodos || [], d.pagos && d.pagos.qrFijo);
      }).catch(function () { error("Error de conexión. Recarga la página."); });
    });
  });
})();
