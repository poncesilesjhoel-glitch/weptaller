<?php
/* =====================================================================
   Notificación de dLocal Go (notification_url).
   No confiamos en el contenido recibido: consultamos el pago a la API
   con nuestras llaves y solo si su estado es PAID marcamos el pago.
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$in = entrada();
if (!$in) $in = $_POST;
$pagoId = texto($in['payment_id'] ?? ($in['id'] ?? ''), 80);
if ($pagoId === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $pagoId)) responder(['ok' => false], 400);

$pago = dlocalPeticion('GET', '/v1/payments/' . rawurlencode($pagoId));
if (!$pago) responder(['ok' => false], 502);

$estado = strtoupper((string)($pago['status'] ?? ''));
$orden = (string)($pago['order_id'] ?? '');
$codigo = preg_replace('/-[a-f0-9]{6}$/', '', $orden);

if ($estado === 'PAID' && preg_match('/^(TK|AM|PD)-[A-Z0-9]{6}$/', $codigo)) {
    $tipo = strpos($codigo, 'PD-') === 0 ? 'pedido' : 'reserva';
    $bs = montoDlocalABs((float)($pago['amount'] ?? 0), (string)($pago['currency'] ?? 'BOB'));
    marcarPagado($tipo, $codigo, 'Tarjeta (dLocal Go)', $pagoId, $bs);
}
responder(['ok' => true]);
