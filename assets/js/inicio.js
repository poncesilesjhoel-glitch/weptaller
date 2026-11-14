/* =====================================================================
   Página principal: precios de servicios y formulario de contacto
   ===================================================================== */
(function () {
  "use strict";

  function pintarPrecios() {
    TY.cargarReservas().then(function (R) {
      document.querySelectorAll("[data-servicio]").forEach(function (art) {
        var s = (R.servicios || []).filter(function (x) { return x.id === art.getAttribute("data-servicio"); })[0];
        var el = art.querySelector("[data-precio]");
        if (s && el) el.textContent = TY.moneda(s.precio);
      });
    });
  }

  function mensaje(el, tipo, texto) {
    el.innerHTML = '<p class="mensaje mensaje--' + tipo + '">' + TY.escapar(texto) + "</p>";
  }

  function iniciarContacto() {
    var form = document.getElementById("form-contacto");
    if (!form) return;
    var salida = document.getElementById("contacto-msg");

    // Botones que preseleccionan un asunto
    document.querySelectorAll("[data-asunto]").forEach(function (a) {
      a.addEventListener("click", function () { form.asunto.value = a.getAttribute("data-asunto"); });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var invalido = null;
      ["nombre", "telefono", "correo", "mensaje"].forEach(function (n) {
        var c = form[n];
        var ok = c.value.trim() && (n !== "correo" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value.trim()));
        c.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok && !invalido) invalido = c;
      });
      if (invalido) { mensaje(salida, "error", "Revisa los campos marcados en rojo."); invalido.focus(); return; }
      if (!form.acepto.checked) { mensaje(salida, "error", "Debes aceptar la Política de Privacidad para enviar el mensaje."); return; }
      if (form.sitio_web.value) return; // antispam

      var datos = {
        nombre: form.nombre.value.trim(), telefono: form.telefono.value.trim(), correo: form.correo.value.trim(),
        asunto: form.asunto.value, mensaje: form.mensaje.value.trim()
      };
      var boton = form.querySelector("button[type=submit]");
      boton.disabled = true; boton.textContent = "Enviando…";

      TY.apiDisponible().then(function (hayApi) {
        if (hayApi) {
          return TY.api("contacto.php", datos).then(function (r) {
            if (r.ok) { form.reset(); mensaje(salida, "ok", "¡Gracias! Recibimos tu mensaje y te responderemos pronto."); }
            else mensaje(salida, "error", r.error || "No se pudo enviar. Inténtalo por WhatsApp.");
          });
        }
        // Sin backend: enviamos por WhatsApp o correo
        var texto = "Hola " + TY.negocio.nombre + ", soy " + datos.nombre + ".\nAsunto: " + datos.asunto +
          "\n\n" + datos.mensaje + "\n\nTeléfono: " + datos.telefono + "\nCorreo: " + datos.correo;
        var wa = TY.enlaceWhatsApp(texto);
        if (wa) { window.open(wa, "_blank", "noopener"); mensaje(salida, "info", "Abrimos WhatsApp con tu mensaje listo para enviar."); }
        else if (TY.negocio.correo) { location.href = "mailto:" + TY.negocio.correo + "?subject=" + encodeURIComponent(datos.asunto) + "&body=" + encodeURIComponent(texto); }
        else mensaje(salida, "error", "El formulario aún no tiene un destino configurado.");
      }).catch(function () {
        mensaje(salida, "error", "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
      }).then(function () {
        boton.disabled = false; boton.textContent = "Enviar mensaje";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    pintarPrecios();
    iniciarContacto();
  });
})();
