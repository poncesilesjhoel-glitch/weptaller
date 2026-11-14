<?php
/* =====================================================================
   Crea un checkout de dLocal Go con el monto exacto del adelanto.
   POST {codigo} -> {ok, url}
   Si no hay llaves configuradas responde {ok:false} y el sitio usa
   DLOCAL_PAYMENT_URL (enlace de pago fijo) de assets/js/config.js.
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
if (!$CONFIG['dlocal_api_key'] || !$CONFIG['dlocal_secret_key']) responder(['ok' => false, 'error' => 'dLocal Go no configurado.']);
if (!function_exists('curl_init')) responder(['ok' => false, 'error' => 'El servidor no tiene cURL habilitado.'], 500);

$in = entrada();
$codigo = strtoupper(texto($in['codigo'] ?? '', 12));
$r = conReservas(function (array $l) use ($codigo) {
    foreach ($l as $x) if ($x['codigo'] === $codigo) return $x;
    return null;
});
if (!$r) responder(['ok' => false, 'error' => 'Reserva no encontrada.'], 404);
if ($r['pagado']) responder(['ok' => false, 'error' => 'Esta reserva ya está pagada.']);
if ($r['estado'] === 'cancelada') responder(['ok' => false, 'error' => 'La reserva está cancelada.']);

$base = $CONFIG['sitio_url'] ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
$base = rtrim($base, '/');

$pago = dlocalPeticion('POST', '/v1/payments', [
    'amount'           => $r['adelanto'],
    'currency'         => $CONFIG['moneda'],
    'country'          => $CONFIG['pais'],
    'order_id'         => $r['codigo'],
    'description'      => 'Adelanto ' . $r['porcentaje'] . '% – ' . $r['servicioNombre'] . ' (' . $r['codigo'] . ')',
    'success_url'      => $base . '/reservar.html?codigo=' . rawurlencode($r['codigo']) . '&pago=ok',
    'back_url'         => $base . '/reservar.html?codigo=' . rawurlencode($r['codigo']),
    'notification_url' => $base . '/api/webhook-dlocal.php',
]);

if (!$pago || empty($pago['redirect_url'])) responder(['ok' => false, 'error' => 'No se pudo crear el pago en dLocal Go.']);

conReservas(function (array &$l) use ($codigo, $pago) {
    foreach ($l as &$x) if ($x['codigo'] === $codigo) $x['pagoId'] = (string)($pago['id'] ?? '');
}, true);

responder(['ok' => true, 'url' => $pago['redirect_url']]);
