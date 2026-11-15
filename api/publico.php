<?php
/* =====================================================================
   Datos públicos del sitio en una sola llamada:
   negocio, servicios y agenda, catálogo y métodos de pago activos.
   Lo que se edita en el panel admin se ve aquí al instante.
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$p = pagosConfig();
responder([
    'ok' => true,
    'negocio' => (object)negocioGuardado(),
    'reglas' => reglas(),
    'catalogo' => catalogo(),
    'pagos' => [
        'metodos' => metodosPago(),
        'qrFijo' => in_array('qrfijo', metodosPago(), true) ? ['imagen' => $p['qrFijo']['imagen'], 'titular' => $p['qrFijo']['titular'], 'banco' => $p['qrFijo']['banco']] : null,
    ],
]);
