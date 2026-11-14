<?php
/* =====================================================================
   Notificación de dLocal Go (notification_url).
   dLocal Go envía el identificador del pago; por seguridad NO confiamos
   en el contenido recibido: consultamos el pago directamente a la API
   con nuestras llaves y solo si su estado es PAID marcamos la reserva.
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
$codigo = (string)($pago['order_id'] ?? '');

if ($estado === 'PAID' && $codigo !== '') {
    $r = conReservas(function (array &$l) use ($codigo, $pagoId, $pago) {
        foreach ($l as &$x) {
            if ($x['codigo'] !== $codigo || $x['pagado']) continue;
            if ((float)($pago['amount'] ?? 0) + 0.01 < (float)$x['adelanto']) return null; // monto insuficiente
            $x['pagado'] = true;
            $x['pagoId'] = $pagoId;
            if ($x['estado'] === 'pendiente') $x['estado'] = 'confirmada';
            $x['actualizada'] = date('c');
            return $x;
        }
        return null;
    }, true);

    if ($r) {
        enviarCorreo($r['cliente']['correo'], 'Pago recibido – reserva ' . $r['codigo'] . ' confirmada',
            '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', recibimos el pago de tu adelanto. Tu reserva está <b>confirmada</b>.</p>' . tablaReserva($r),
            $CONFIG['correo_taller']);
        if ($CONFIG['correo_taller']) {
            enviarCorreo($CONFIG['correo_taller'], 'Adelanto pagado – ' . $r['codigo'], '<p>dLocal Go confirmó el pago del adelanto.</p>' . tablaReserva($r));
        }
    }
}
responder(['ok' => true]);
