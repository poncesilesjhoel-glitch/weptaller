# TORKE: sitio web con reservas y tienda

Sitio en HTML, CSS y JavaScript puros (sin frameworks), responsive, con:

- Página principal con hero, beneficios, servicios, tienda con carrito y contacto.
- Sistema de reservas en 5 pasos con calendario, horas bloqueadas y adelanto pagado con **dLocal Go**.
- Panel `admin.html` protegido con contraseña para ver, confirmar o cancelar reservas.
- Páginas legales completas: términos, envíos, reembolsos y privacidad.
- Backend PHP opcional (`api/`) para guardar reservas en el servidor y enviar correos.

---

## 1. Estructura

```
/
├── index.html            Página principal (una sola página con menú fijo)
├── reservar.html         Sistema de reservas
├── admin.html            Panel de reservas (privado)
├── terminos.html  envios.html  reembolsos.html  privacidad.html
├── creditos.html         Autores y licencias de las fotos
├── productos.json        ← Catálogo de la tienda (editable)
├── reservas.json         ← Servicios, precios, horario y reglas de la agenda (editable)
├── robots.txt  .htaccess
├── assets/
│   ├── css/styles.css
│   ├── img/logo-torke.svg         Logo completo para fondos oscuros (menú, pie, entrada)
│   ├── img/logo-torke-oscuro.svg  Logo completo para fondos claros
│   ├── img/logo-torke-icono.svg   Ícono (favicon, hero y app)
│   ├── img/productos/                Fotos reales de productos (WebP)
│   ├── img/fotos/                    Fotos reales del hero, servicios y banda de reserva
│   └── js/
│       ├── config.js     ← DATOS DEL NEGOCIO (edítalo primero)
│       ├── common.js  inicio.js  tienda.js  reservar.js  admin.js
│       └── anim.js       Animaciones: entrada, scroll, contadores, botones
└── api/                  Backend PHP (opcional, recomendado)
    ├── config.php        ← Contraseña admin, correos y llaves de dLocal Go (privado)
    ├── config.example.php ← Plantilla de config.php (la que se sube a git)
    ├── reservas.php  pago.php  webhook-dlocal.php  contacto.php  _lib.php
    └── datos/            Aquí se guardan las reservas (protegido)
```

## 2. Antes de publicar: los 4 archivos que debes editar

| Archivo | Qué contiene |
|---|---|
| `assets/js/config.js` | Nombre, titular, NIT/RUC, país, ciudad, dirección, correo, WhatsApp, moneda y enlace de pago de dLocal Go. **Los campos vacíos se ocultan en el sitio**, así que no habrá textos de ejemplo visibles, pero la identidad del pie de página quedará incompleta hasta que los llenes. |
| `reservas.json` | Servicios y precios, duración del turno (60 min), % de adelanto (30 %), horas de anticipación para cancelar (24 h), horario, pausa de almuerzo, días laborables y feriados. |
| `productos.json` | Productos de la tienda (las instrucciones están dentro del archivo). |
| `api/config.php` | Contraseña del panel, correo del taller, zona horaria y llaves de dLocal Go. |

> Los JSON no admiten comentarios: las instrucciones están en la clave `_instrucciones`, que el sitio ignora. Después de editarlos, valídalos en <https://jsonlint.com>.

**Contraseña inicial del panel:** `CambiaEstaClave2026`. Cámbiala en `api/config.php` (con backend) y en `ADMIN_PASSWORD_SHA256` de `config.js` (modo local: genera la huella en admin.html › «Generar huella»).

Al entrar en `admin.html`, el panel muestra en amarillo la lista de datos que aún faltan en la configuración.

## 3. Probar en tu computador

Los archivos `.json` no cargan si abres el HTML con doble clic. Usa un servidor local:

```bash
# Con Python
python -m http.server 8000
# o, si tienes PHP instalado (así también funciona el backend):
php -S localhost:8000
```

Abre <http://localhost:8000>.

## 4. Productos y fotos

1. Sube tus fotos a `assets/img/productos/` (JPG/WEBP, unos 600×600 px, menos de 150 KB).
2. En `productos.json`, copia un bloque `{ ... }`, cambia `id`, `nombre`, `categoria`, `precio`, `descripcion`, `foto` y `disponible`.
3. Categorías válidas: `repuestos`, `aceites`, `filtros`, `frenos`, `baterias`, `llantas`, `accesorios`.

El carrito se guarda en el navegador del cliente. «Finalizar pedido» envía el detalle al WhatsApp del taller (o por correo si no hay WhatsApp), donde se confirma la compatibilidad, el envío y el pago.

### Fotos reales y créditos

Las fotos de productos y servicios son fotografías reales con licencia libre (dominio público, CC BY y CC BY-SA) de Wikimedia Commons. Las recorté y optimicé en WebP. La licencia exige mencionar a los autores, y eso está en `creditos.html`, enlazada desde el pie de página.

Cuando tengas fotos propias de tu taller y de tus productos, reemplaza los archivos en `assets/img/productos/` y `assets/img/fotos/` con el mismo nombre (o cambia la ruta en `productos.json`) y actualiza o elimina `creditos.html`.

## 5. Publicar en tu dominio propio

### Opción A (recomendada): hosting con PHP (cPanel, Hostinger, Banahosting, SiteGround, etc.)

1. Contrata un hosting con PHP 7.4 o superior (casi todos lo incluyen) y conecta tu dominio. Si compraste el dominio en otro proveedor, cambia sus **DNS** a los que te indique el hosting.
2. Activa el **certificado SSL gratuito** (Let's Encrypt / AutoSSL) en el panel del hosting.
3. Sube **todo el contenido** de esta carpeta a `public_html/` con el Administrador de archivos o por FTP (FileZilla). Incluye los archivos ocultos `.htaccess`.
4. Asegúrate de que la carpeta `api/datos/` tenga permisos de escritura (755 o 775).
5. Copia `api/config.example.php` como `api/config.php` (este último no se sube a git) y edítalo: `admin_clave`, `correo_taller`, `correo_remitente` (por ejemplo `no-responder@tudominio.com`, créalo en el hosting), `sitio_url` (`https://www.tudominio.com`) y `zona_horaria`.
6. Cuando el SSL funcione, descomenta el bloque «Fuerza HTTPS» en `.htaccess`.
7. Prueba: haz una reserva, revisa que lleguen los correos y entra a `https://tudominio.com/admin.html`.

**Si los correos no llegan o caen en spam:** usa un remitente de tu propio dominio y activa SPF/DKIM en el panel del hosting (sección «Email Deliverability» o «Autenticación de correo»). La función `enviarCorreo()` de `api/_lib.php` usa `mail()` de PHP; si prefieres SMTP, puedes reemplazarla por PHPMailer.

### Opción B: hosting estático sin PHP (Netlify, GitHub Pages, Cloudflare Pages)

El sitio funciona igual, pero en **modo local**:

- Las reservas se guardan en el navegador del cliente, y la pantalla de confirmación ofrece enviarlas al taller por **WhatsApp**.
- Las horas bloqueadas solo reflejan las reservas hechas desde ese mismo navegador: **no evitan reservas duplicadas entre clientes**.
- El panel admin solo ve las reservas de ese navegador.
- No se envían correos automáticos.

Para un negocio real, la **opción A** es la recomendada. En modo estático puedes dejar `API_URL: "api/"`: el sitio detecta que no hay PHP y cambia solo al modo local. También puedes ponerlo en `""`.

Netlify: arrastra la carpeta a <https://app.netlify.com/drop> y luego, en *Domain settings*, agrega tu dominio.

## 6. Conectar dLocal Go

Crea tu cuenta en <https://dlocalgo.com> y completa la verificación del negocio.

### Opción 1: link de pago fijo (sin programar)

1. En el panel de dLocal Go crea un **Link de pago**. Puede ser de monto abierto o con el monto del adelanto.
2. Pega la URL en `assets/js/config.js`:
   ```js
   DLOCAL_PAYMENT_URL: "https://checkout.dlocalgo.com/...",
   ```
3. En la confirmación, el cliente verá «Pagar adelanto en dLocal Go» y se le pedirá indicar su código de reserva.
4. Verifica el pago en dLocal Go y márcalo en `admin.html` con **Marcar pagado** y **Confirmar** (el cliente recibe un correo).

### Opción 2: checkout automático con el monto exacto (requiere la opción A de hosting)

1. En dLocal Go ve a **Integraciones › API** y copia tu **API Key** y tu **Secret Key**.
2. Pégalas en `api/config.php`:
   ```php
   'dlocal_api_key'    => 'TU_API_KEY',
   'dlocal_secret_key' => 'TU_SECRET_KEY',
   'dlocal_sandbox'    => true,   // false en producción
   'moneda' => 'COP', 'pais' => 'CO',
   ```
3. Al pulsar «Pagar adelanto», `api/pago.php` crea un pago por el monto exacto del adelanto, con el código de reserva como `order_id`, y redirige al checkout.
4. Al terminar el pago, el cliente vuelve a `reservar.html?codigo=...&pago=ok`.
5. dLocal Go notifica a `https://tudominio.com/api/webhook-dlocal.php`. El servidor **consulta el pago a la API** (no confía en la notificación recibida) y, si su estado es `PAID` y el monto es correcto, marca la reserva como pagada y confirmada y envía los correos.
6. Prueba primero con `dlocal_sandbox => true` y las tarjetas de prueba de dLocal Go; luego cambia a `false` con las llaves de producción.

> La integración usa `POST /v1/payments` y `GET /v1/payments/{id}` con la cabecera `Authorization: Bearer API_KEY:SECRET_KEY`. Si dLocal Go cambia su API, revisa su documentación oficial (<https://docs.dlocalgo.com>) y ajusta `api/pago.php` y `api/webhook-dlocal.php`.

Si las llaves están vacías, el sitio usa automáticamente el link fijo de la opción 1.

## 7. Correos de reservas

Con el backend PHP se envían automáticamente:

- **Al crear la reserva:** un correo al cliente (resumen, adelanto y política de cancelación) y otro al taller.
- **Al confirmar o cancelar desde el panel:** un aviso al cliente.
- **Al recibir el pago (webhook):** una confirmación al cliente y al taller.

## 8. Personalización rápida

- **Colores:** variables al inicio de `assets/css/styles.css` (`--morado-800`, `--azul-800`, `--naranja`…).
- **Logo:** el logo (auto + nombre) está en `assets/img/logo-torke*.svg`, con las letras convertidas en trazos para que se vea igual en cualquier dispositivo. Para cambiarlo, reemplaza esos tres archivos con el mismo nombre.
- **Animaciones:** se definen en `assets/js/anim.js` y en la sección «REDISEÑO v2» de `styles.css`. La pantalla de entrada se muestra solo la primera vez en cada sesión, y todas las animaciones se desactivan si el sistema del usuario tiene activado «reducir movimiento».
- **Horario:** `horaApertura`, `horaCierre`, `pausas`, `diasLaborables` y `feriados` en `reservas.json`, más `horarioTexto` en `config.js`.
- **Envíos:** costos y zonas en `envios.html`. Los montos `data-dinero="4"` se muestran con la moneda configurada.

## 9. Seguridad y privacidad

- Las contraseñas y llaves secretas solo van en `api/config.php`, nunca en `config.js`, que es público.
- `api/datos/` y `api/config.php` están bloqueados con `.htaccess`. Si tu servidor es **Nginx**, agrega una regla equivalente (`location ^~ /api/datos/ { deny all; }`).
- El backend vuelve a validar en el servidor el servicio, el precio, la fecha, el horario y la disponibilidad, así que un cliente no puede alterar el monto del adelanto desde el navegador.
- `admin.html` está excluido de buscadores (`noindex` y `robots.txt`).
