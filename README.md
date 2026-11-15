# AUTOMAX: sitio web con reservas, tienda y panel de administración

Sitio en HTML, CSS y JavaScript puros (sin frameworks) con backend PHP y precios en **bolivianos (Bs)**:

- Página principal con hero animado, beneficios, servicios, tienda con carrito y contacto.
- Reservas en 5 pasos: servicio, síntomas, calendario con horas bloqueadas, datos y pago del adelanto.
- Tienda con carrito, checkout y página de pedido (`pedido.html`).
- Pagos en línea con **QR Simple del BNB** (pagable desde cualquier banco), **tarjeta con dLocal Go** y, como respaldo, el **QR fijo** de tu cuenta.
- **Panel `admin.html`** con usuario y contraseña propios: reservas, pedidos, catálogo con fotos, servicios y precios, horarios, medios de pago y datos del negocio.
- Páginas legales completas: términos, envíos, reembolsos y privacidad.

Publicado en Render: <https://automax.poncesiles.com>

---

## 1. Panel de administración

Entra a `https://automax.poncesiles.com/admin.html`.

**Primer ingreso:** usuario `admin` y la clave inicial (variable `ADMIN_CLAVE` en Render, o `admin_clave` en `api/config.php`). El panel te pide crear tu propio usuario y contraseña; desde ese momento la clave inicial deja de funcionar. Puedes cambiarlos cuando quieras en **Mi cuenta**.

| Pestaña | Qué haces ahí |
|---|---|
| **Reservas** | Ver, confirmar, completar o cancelar citas; marcar adelantos pagados; ver comprobantes; exportar a CSV. |
| **Pedidos** | Pedidos de la tienda: estado (pagado, en preparación, enviado, entregado), pagos y comprobantes. |
| **Catálogo** | Agregar, editar y eliminar productos, cambiar precios, subir fotos, marcar agotados y administrar categorías. |
| **Servicios y agenda** | Servicios reservables y sus precios, horario, duración del turno, pausa, días de atención, feriados, % de adelanto y horas para cancelar. |
| **Pagos** | Conectar el QR del BNB, dLocal Go y el QR fijo. Botón **Probar conexión** para cada uno. |
| **Negocio** | Nombre, titular, NIT, ciudad, dirección, correo, WhatsApp y horario que se muestran en todo el sitio. |

Todo lo que guardas en el panel se ve en el sitio al instante, sin tocar código.

## 2. Pagos

### QR Simple del BNB

1. Pide a tu ejecutivo del BNB el acceso a la **API QR Simple (Open Banking)**. Te entregan un `accountId` y un `authorizationId`, primero de pruebas y luego de producción.
2. En **Panel › Pagos › QR Simple — BNB** pégalos, elige el entorno (pruebas o producción), marca **Activar** y pulsa **Probar conexión**.
3. Si el BNB te pide una URL de notificación, registra la que muestra el panel: `https://automax.poncesiles.com/api/webhook-bnb.php`. Es opcional: mientras el cliente tiene el QR abierto, el sitio consulta el estado cada 5 segundos.

Para cada reserva o pedido, el sitio genera un QR de un solo uso por el monto exacto. Cuando el cliente paga desde la app de su banco, la reserva se confirma sola y llegan los correos.

> Endpoints usados: `POST /ClientAuthentication.API/api/v1/auth/token`, `POST /QRSimple.API/api/v1/main/getQRWithImageAsync` y `POST /QRSimple.API/api/v1/main/getQRStatusAsync` sobre `https://test.bnb.com.bo` (pruebas) o `https://marketapi.bnb.com.bo` (producción). Si el BNB te indica otra dirección, ponla en el campo **URL base** del panel. El código está en `api/_lib.php` (funciones `bnb…`).

### Tarjeta con dLocal Go

1. Cuando tu cuenta de dLocal Go esté aprobada, ve a **Integraciones › API** y copia la **API Key** y la **Secret Key**.
2. En **Panel › Pagos › Tarjeta — dLocal Go** pégalas, deja **sandbox** marcado para probar, elige la moneda de cobro (BOB, o USD con conversión según el tipo de cambio) y pulsa **Probar conexión**.
3. Cuando todo funcione, desmarca **sandbox** y pon las llaves de producción.

El cliente paga en el checkout seguro de dLocal Go y vuelve al sitio. dLocal Go avisa a `api/webhook-dlocal.php`; el servidor consulta el pago a la API (no confía en el aviso) y, si el estado es `PAID` y el monto es correcto, lo marca como pagado.

### QR fijo (respaldo)

En **Panel › Pagos › QR fijo** sube la imagen del QR de cobro de tu cuenta. El cliente paga, adjunta su comprobante y tú lo verificas y marcas como pagado en **Reservas** o **Pedidos**.

Si no hay ningún medio activo, la reserva queda apartada y el sitio indica que coordinarás el pago.

Las llaves secretas se guardan en la base de datos y el panel solo muestra los últimos 4 caracteres.

## 3. Estructura

```
/
├── index.html  reservar.html  pedido.html  admin.html
├── terminos.html  envios.html  reembolsos.html  privacidad.html  creditos.html
├── productos.json  reservas.json   Valores iniciales (luego se editan en el panel)
├── Dockerfile                      PHP 8.3 + Apache para Render
├── assets/
│   ├── css/styles.css
│   ├── img/                        Logo, fotos reales y productos
│   └── js/
│       ├── config.js               Datos base del negocio, moneda y backend
│       ├── common.js               Datos del sitio, formato Bs, utilidades
│       ├── pagos.js                Pantalla de pago (QR BNB, tarjeta, QR fijo)
│       ├── reservar.js  tienda.js  pedido.js  admin.js  inicio.js  anim.js
└── api/
    ├── _lib.php                    Base de datos, ajustes, sesión, BNB y dLocal
    ├── publico.php                 Datos públicos (negocio, catálogo, servicios, pagos)
    ├── admin.php                   API del panel
    ├── reservas.php  pedidos.php  pago.php  imagen.php  contacto.php
    ├── webhook-bnb.php  webhook-dlocal.php
    └── config.example.php          Plantilla de configuración (copia como config.php)
```

## 4. Dónde se guardan los datos

- **En Render:** en PostgreSQL, a través de la variable `DATABASE_URL`. Las tablas son `automax_reservas`, `automax_pedidos`, `automax_ajustes` (panel, catálogo, pagos y cuenta) y `automax_imagenes` (fotos subidas).
- **En un hosting PHP sin base de datos:** en archivos dentro de `api/datos/`, protegidos por `.htaccess`.

> ⚠️ La base `ponceshop-db` del plan gratis de Render vence el **20 de noviembre de 2026**. Antes de esa fecha, pásala a un plan de pago o cambia `DATABASE_URL` por otra base PostgreSQL (por ejemplo Neon, gratis).

## 5. Variables de entorno (Render)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL. |
| `ADMIN_CLAVE` | Clave inicial del panel (solo para el primer ingreso). |
| `SITIO_URL` | `https://automax.poncesiles.com`, usada en correos y para volver de los pagos. |
| `CORREO_REMITENTE`, `CORREO_TALLER` | Correos (opcional; el correo del taller también se edita en el panel). |
| `DLOCAL_API_KEY`, `DLOCAL_SECRET_KEY`, `DLOCAL_SANDBOX` | Opcional; lo recomendado es cargarlas desde el panel. |

## 6. Publicar cambios

Render publica la rama `main` de GitHub. Para subir cambios: `git add -A`, `git commit -m "..."`, `git push` y luego **Manual Deploy** en Render (o conecta GitHub en Render para que se publique solo).

En otro hosting con PHP 8 y Apache, sube todo a `public_html/`, copia `api/config.example.php` como `api/config.php`, complétalo y da permisos de escritura a `api/datos/`.

## 7. Correos

Con un servidor de correo disponible se envían avisos al crear una reserva o pedido, al recibir el pago y al confirmar, cancelar o enviar desde el panel. **Render no incluye servidor de correo**, así que ahí `mail()` no envía nada. Para activarlos, conecta un servicio SMTP o de API (Resend, Brevo) reemplazando `enviarCorreo()` en `api/_lib.php`.

## 8. Seguridad

- La contraseña del panel se guarda con `password_hash`, y las sesiones usan un token firmado que vence a las 12 horas.
- El servidor recalcula precios, totales y disponibilidad: el cliente no puede alterar montos desde el navegador.
- Los pagos solo se marcan como pagados después de consultar al BNB o a dLocal Go con tus credenciales.
- `admin.html` y `pedido.html` están excluidos de los buscadores.

## 9. Fotos y créditos

Las fotos son reales, con licencia libre, de Wikimedia Commons; los autores figuran en `creditos.html`. Desde el panel puedes reemplazar las fotos de productos por fotos propias.
