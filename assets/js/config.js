/* =====================================================================
   CONFIGURACIÓN GENERAL DEL SITIO
   ---------------------------------------------------------------------
   Edita SOLO este archivo para poner los datos reales de tu negocio.
   Todos los textos del sitio (menú, pie de página, páginas legales,
   contacto, reservas) se completan automáticamente con estos valores.

   IMPORTANTE: los campos vacíos ("") se ocultan en el sitio. Antes de
   publicar, completa TODOS los campos de "negocio". El panel admin.html
   te muestra una lista de los que faltan.
   ===================================================================== */
window.TALLER_CONFIG = {

  /* ---------- 1. Identidad del negocio ---------- */
  negocio: {
    nombre: "TORKE",            // Nombre comercial
    titular: "",                   // Nombre completo del titular o razón social
    nit: "",                       // NIT / RUC / identificación comercial
    pais: "",                      // Ej.: "Colombia"
    ciudad: "",                    // Ej.: "Medellín"
    direccion: "",                 // Dirección física del taller
    correo: "",                    // Correo de contacto (también recibe las reservas)
    whatsapp: "",                  // Solo números con código de país. Ej.: "573001234567"
    horarioTexto: "Lunes a viernes, de 8:00 a 17:00",
    dominio: "https://taller.poncesiles.com"                 // Ej.: "https://www.tutaller.com" (para enlaces en correos)
  },

  /* ---------- 2. Moneda y formato ---------- */
  moneda: "USD",                   // Código ISO: COP, PEN, MXN, CLP, USD, ARS...
  locale: "es",                    // Formato de números: "es-CO", "es-PE", "es-MX"...

  /* ---------- 3. Pagos con dLocal Go ----------
     Opción A (más simple): crea un "Link de pago" en tu panel de dLocal Go
     y pégalo aquí. El cliente abrirá ese enlace al pulsar "Pagar adelanto".
     Opción B (recomendada): configura tus llaves en api/config.php; el
     sitio creará un checkout con el monto exacto de cada reserva.
     Si la opción B está configurada, tiene prioridad sobre esta URL. */
  DLOCAL_PAYMENT_URL: "",

  /* ---------- 4. Backend ----------
     Carpeta del backend PHP (guarda reservas y envía correos).
     Si tu hosting no tiene PHP, deja API_URL en "" y el sitio funcionará
     en "modo local": las reservas se guardan en el navegador y se envían
     al taller por WhatsApp (ver README). */
  API_URL: "api/",

  /* Solo para "modo local" (sin backend): huella SHA-256 de la contraseña
     del panel admin. Genera la tuya en admin.html > "Generar huella".
     La huella incluida corresponde a la contraseña: CambiaEstaClave2026
     ¡Cámbiala antes de publicar! */
  ADMIN_PASSWORD_SHA256: "ed5e254969677e4f6f9aa33e2722efe444acbe4401ac82488502558c4ce37eb3"
};
