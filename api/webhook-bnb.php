<?php
/* =====================================================================
   Aviso de pago del BNB (QR Simple).
   Registra esta URL en el BNB como URL de notificación:
       https://TU-DOMINIO/api/webhook-bnb.php
   No confiamos en el contenido: tomamos el id del QR y consultamos su
   estado al BNB con nuestras credenciales antes de marcar el pago.
   (El sitio también consulta el estado cada pocos segundos mientras
   el cliente tiene el QR abierto, así que funciona aunque no se registre.)
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$in = entrada();
if (!$in) $in = $_POST;
$qrId = texto($in['QRId'] ?? ($in['qrId'] ?? ($in['id'] ?? '')), 80);
if ($qrId === '') responder(['success' => false, 'message' => 'Falta el id del QR.'], 400);

$encontrado = null;
foreach (['reservas' => 'reserva', 'pedidos' => 'pedido'] as $col => $tipo) {
    $x = conColeccion($col, function (array $l) use ($qrId) {
        foreach ($l as $r) if (in_array($qrId, $r['qrIds'] ?? [], true)) return $r;
        return null;
    });
    if ($x) { $encontrado = [$tipo, $x]; break; }
}

if ($encontrado && bnbQrPagado($qrId)) {
    [$tipo, $x] = $encontrado;
    $monto = $tipo === 'pedido' ? (float)$x['total'] : (float)$x['adelanto'];
    marcarPagado($tipo, $x['codigo'], 'QR BNB', $qrId, $monto);
}
responder(['success' => true, 'message' => 'OK']);
