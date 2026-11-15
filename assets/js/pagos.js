/* =====================================================================
   Pagos en línea (reservas y pedidos)
   - QR BNB: genera un QR por el monto exacto (cualquier app bancaria
     de Bolivia lo puede pagar) y detecta el pago automáticamente.
   - Tarjeta: checkout seguro de dLocal Go.
   - QR del taller: QR fijo; el cliente avisa que pagó y adjunta su
     comprobante; el taller lo valida en el panel.
   Uso: TY.pagos.mostrar(elemento, { tipo, codigo, monto, metodos, qrFijo, alPagar })
   ===================================================================== */
(function () {
  "use strict";

  var NOMBRES = {
    qr: { t: "QR (BNB y cualquier banco)", d: "Escanea con la app de tu banco. Se confirma solo.", i: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>' },
    tarjeta: { t: "Tarjeta de débito o crédito", d: "Pago seguro con dLocal Go.", i: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' },
    qrfijo: { t: "QR del taller", d: "Paga con el QR de nuestra cuenta y envía tu comprobante.", i: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z"/>' }
  };

  function icono(p) {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  function mostrar(cont, op) {
    var e = TY.escapar;
    var metodos = (op.metodos || []).filter(function (m) { return NOMBRES[m]; });
    var sondeo = null;

    function detener() { if (sondeo) { clearInterval(sondeo); sondeo = null; } }
    function msg(texto, tipo) { cont.querySelector(".pago__msg").innerHTML = texto ? '<p class="mensaje mensaje--' + (tipo || "info") + '">' + texto + "</p>" : ""; }

    if (!metodos.length) {
      cont.innerHTML = '<div class="pago"><p class="mensaje mensaje--info">Te contactaremos para coordinar el pago de <strong>' + TY.moneda(op.monto) + "</strong>.</p></div>";
      return;
    }

    cont.innerHTML = '<div class="pago">' +
      '<p class="pago__monto">Monto a pagar <strong>' + TY.moneda(op.monto) + "</strong></p>" +
      '<div class="pago__metodos" role="group" aria-label="Elige cómo pagar">' +
        metodos.map(function (m) {
          return '<button type="button" class="pago__metodo" data-metodo="' + m + '">' + icono(NOMBRES[m].i) +
            "<span><b>" + NOMBRES[m].t + "</b><small>" + NOMBRES[m].d + "</small></span></button>";
        }).join("") +
      "</div>" +
      '<div class="pago__detalle" aria-live="polite"></div>' +
      '<div class="pago__msg" role="status"></div>' +
      "</div>";

    var detalle = cont.querySelector(".pago__detalle");

    function marcar(boton) {
      cont.querySelectorAll(".pago__metodo").forEach(function (b) { b.setAttribute("aria-pressed", b === boton ? "true" : "false"); });
    }

    function pagado() {
      detener();
      cont.innerHTML = '<div class="pago"><p class="mensaje mensaje--ok">✓ ¡Pago recibido! Gracias.</p></div>';
      if (op.alPagar) op.alPagar();
    }

    function qrBnb(boton) {
      detalle.innerHTML = '<div class="pago__cargando"><span class="giro"></span> Generando tu QR…</div>';
      msg("");
      boton.disabled = true;
      TY.api("pago.php", { accion: "iniciar", tipo: op.tipo, codigo: op.codigo, metodo: "qr" }).then(function (r) {
        boton.disabled = false;
        if (r.pagado) return pagado();
        if (!r.ok) { detalle.innerHTML = ""; msg(e(r.error || "No se pudo generar el QR."), "error"); return; }
        detalle.innerHTML = '<div class="pago__qr">' +
          '<img src="' + e(r.qr) + '" alt="Código QR para pagar ' + e(TY.moneda(r.monto)) + '" width="260" height="260">' +
          "<p><strong>" + TY.moneda(r.monto) + "</strong> · " + e(op.codigo) + "</p>" +
          '<a class="btn btn--borde btn--sm" href="' + e(r.qr) + '" download="QR-' + e(op.codigo) + '.png">Descargar QR</a>' +
          '<p class="pago__espera"><span class="giro"></span> Esperando el pago… esta pantalla se actualiza sola.</p>' +
          '<button type="button" class="btn btn--sm btn--borde" data-verificar>Ya pagué, verificar</button>' +
          "</div>";
        var intentos = 0;
        detener();
        sondeo = setInterval(function () {
          if (++intentos > 180) { detener(); msg("El QR sigue esperando. Si ya pagaste, pulsa «Ya pagué, verificar»."); return; }
          verificar(false);
        }, 5000);
      }).catch(function () { boton.disabled = false; detalle.innerHTML = ""; msg("Error de conexión. Inténtalo de nuevo.", "error"); });
    }

    function verificar(manual) {
      return TY.api("pago.php", { accion: "verificar", tipo: op.tipo, codigo: op.codigo }).then(function (r) {
        if (r.pagado) pagado();
        else if (manual) msg("Aún no vemos el pago. Puede tardar unos segundos; volvemos a revisar automáticamente.");
      }).catch(function () { if (manual) msg("Error de conexión.", "error"); });
    }

    function tarjeta(boton) {
      detener();
      detalle.innerHTML = '<div class="pago__cargando"><span class="giro"></span> Abriendo el pago seguro…</div>';
      msg("");
      boton.disabled = true;
      TY.api("pago.php", { accion: "iniciar", tipo: op.tipo, codigo: op.codigo, metodo: "tarjeta" }).then(function (r) {
        if (r.pagado) return pagado();
        if (r.ok && r.url) { location.href = r.url; return; }
        boton.disabled = false; detalle.innerHTML = "";
        msg(e(r.error || "No se pudo iniciar el pago con tarjeta."), "error");
      }).catch(function () { boton.disabled = false; detalle.innerHTML = ""; msg("Error de conexión.", "error"); });
    }

    function qrFijo() {
      detener();
      var q = op.qrFijo || {};
      detalle.innerHTML = '<div class="pago__qr">' +
        '<img src="' + e(q.imagen) + '" alt="QR de pago del taller" width="260" height="260">' +
        "<p>Paga exactamente <strong>" + TY.moneda(op.monto) + "</strong> e indica <strong>" + e(op.codigo) + "</strong> en la glosa." +
        (q.titular ? "<br>Titular: " + e(q.titular) : "") + (q.banco ? " · " + e(q.banco) : "") + "</p>" +
        '<div class="campo" style="text-align:left"><label for="comprobante-' + e(op.codigo) + '">Comprobante (foto o captura, opcional)</label>' +
        '<input type="file" id="comprobante-' + e(op.codigo) + '" accept="image/*" data-comprobante></div>' +
        '<button type="button" class="btn btn--primario" data-reportar>Ya pagué</button>' +
        "</div>";
    }

    function reportar(boton) {
      var input = cont.querySelector("[data-comprobante]");
      var archivo = input && input.files && input.files[0];
      boton.disabled = true; boton.textContent = "Enviando…";
      var prep = archivo ? TY.comprimirImagen(archivo, 1400, 0.82) : Promise.resolve("");
      prep.then(function (img) {
        return TY.api("pago.php", { accion: "reportar", tipo: op.tipo, codigo: op.codigo, comprobante: img });
      }).then(function (r) {
        if (r.pagado) return pagado();
        if (!r.ok) throw new Error(r.error || "No se pudo enviar.");
        detalle.innerHTML = "";
        cont.querySelector(".pago__metodos").hidden = true;
        msg("✓ Recibimos tu aviso. Verificaremos el pago en nuestra cuenta y te confirmaremos por correo o WhatsApp.", "ok");
      }).catch(function (err) {
        boton.disabled = false; boton.textContent = "Ya pagué";
        msg(e(err.message || "Error de conexión."), "error");
      });
    }

    if (cont._alClic) cont.removeEventListener("click", cont._alClic);
    if (cont._detener) cont._detener();
    cont._detener = detener;
    cont._alClic = function (ev) {
      var b = ev.target.closest(".pago__metodo");
      if (b) {
        marcar(b);
        var m = b.getAttribute("data-metodo");
        if (m === "qr") qrBnb(b);
        else if (m === "tarjeta") tarjeta(b);
        else qrFijo();
        return;
      }
      if (ev.target.closest("[data-verificar]")) verificar(true);
      var r = ev.target.closest("[data-reportar]");
      if (r) reportar(r);
    };
    cont.addEventListener("click", cont._alClic);

    if (metodos.length === 1) cont.querySelector(".pago__metodo").click();
  }

  window.TY = window.TY || {};
  TY.pagos = { mostrar: mostrar };
})();
