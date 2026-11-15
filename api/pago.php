<?php
/* =====================================================================
   Pagos de reservas (adelanto) y pedidos de la tienda
   POST {accion:"iniciar", tipo:"reserva"|"pedido", codigo, metodo:"qr"|"tarjeta"}
        qr      -> genera un QR del BNB por el monto exacto  {qr, qrId, monto}
        tarjeta -> crea un checkout de dLocal Go             {url}
   POST {accion:"verificar", tipo, codigo}  -> consulta al BNB si el QR se pagó
   POST {accion:"reportar", tipo, codigo, comprobante?}
        -> el cliente avisa que pagó con el QR fijo; el taller lo valida en el panel
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
if (!function_exists('curl_init')) responder(['ok' => false, 'error' => 'El servidor no tiene cURL habilitado.'], 500);

$in = entrada();
$accion = (string)($in['accion'] ?? 'iniciar');
$tipo = ($in['tipo'] ?? 'reserva') === 'pedido' ? 'pedido' : 'reserva';
$col = $tipo === 'pedido' ? 'pedidos' : 'reservas';
$codigo = strtoupper(texto($in['codigo'] ?? '', 12));

$x = buscarRegistro($col, $codigo);
if (!$x) responder(['ok' => false, 'error' => ($tipo === 'pedido' ? 'Pedido' : 'Reserva') . ' no encontrado.'], 404);
$monto = $tipo === 'pedido' ? (float)$x['total'] : (float)$x['adelanto'];
$cancelado = in_array($x['estado'], ['cancelada', 'cancelado'], true);
$glosa = $tipo === 'pedido' ? 'Pedido ' . $codigo : 'Adelanto reserva ' . $codigo;
$metodos = metodosPago();

switch ($accion) {
    case 'iniciar':
        if ($x['pagado']) responder(['ok' => true, 'pagado' => true]);
        if ($cancelado) responder(['ok' => false, 'error' => 'Está cancelado.']);
        $metodo = (string)($in['metodo'] ?? '');

        if ($metodo === 'qr') {
            if (!in_array('qr', $metodos, true)) responder(['ok' => false, 'error' => 'El pago con QR no está disponible.']);
            $error = '';
            $qr = bnbGenerarQr($monto, $glosa, $codigo, $error);
            if (!$qr) responder(['ok' => false, 'error' => $error ?: 'No se pudo generar el QR.']);
            actualizarRegistro($col, $codigo, function (array &$r) use ($qr) {
                $r['qrIds'] = array_slice(array_merge($r['qrIds'] ?? [], [$qr['id']]), -5);
                return true;
            });
            $img = $qr['imagen'];
            if (strpos($img, 'data:') !== 0) $img = 'data:image/png;base64,' . $img;
            responder(['ok' => true, 'qr' => $img, 'qrId' => $qr['id'], 'monto' => $monto]);
        }

        if ($metodo === 'tarjeta') {
            if (!in_array('tarjeta', $metodos, true)) responder(['ok' => false, 'error' => 'El pago con tarjeta no está disponible.']);
            [$cobro, $moneda] = montoDlocal($monto);
            $base = urlBase();
            $volver = $tipo === 'pedido' ? '/pedido.html?codigo=' : '/reservar.html?codigo=';
            $pago = dlocalPeticion('POST', '/v1/payments', [
                'amount' => $cobro, 'currency' => $moneda, 'country' => pagosConfig()['dlocal']['pais'] ?: 'BO',
                'order_id' => $codigo . '-' . substr(bin2hex(random_bytes(3)), 0, 6),
                'description' => $glosa,
                'success_url' => $base . $volver . rawurlencode($codigo) . '&pago=ok',
                'back_url' => $base . $volver . rawurlencode($codigo),
                'notification_url' => $base . '/api/webhook-dlocal.php',
            ]);
            if (!$pago || empty($pago['redirect_url'])) responder(['ok' => false, 'error' => 'No se pudo crear el pago con tarjeta en dLocal Go.']);
            actualizarRegistro($col, $codigo, function (array &$r) use ($pago) { $r['pagoId'] = (string)($pago['id'] ?? ''); return true; });
            responder(['ok' => true, 'url' => $pago['redirect_url']]);
        }
        responder(['ok' => false, 'error' => 'Método de pago no válido.'], 422);

    case 'verificar':
        if ($x['pagado']) responder(['ok' => true, 'pagado' => true]);
        if (in_array('qr', $metodos, true)) {
            foreach (array_reverse($x['qrIds'] ?? []) as $id) {
                if (bnbQrPagado((string)$id)) {
                    marcarPagado($tipo, $codigo, 'QR BNB', (string)$id, $monto);
                    responder(['ok' => true, 'pagado' => true]);
                }
            }
        }
        responder(['ok' => true, 'pagado' => false, 'reportado' => $x['pagoReportado'] ?? false]);

    case 'reportar':
        if ($x['pagado']) responder(['ok' => true, 'pagado' => true]);
        if (!in_array('qrfijo', $metodos, true)) responder(['ok' => false, 'error' => 'Método no disponible.']);
        $comp = '';
        if (!empty($in['comprobante']) && is_string($in['comprobante'])) $comp = guardarImagen($in['comprobante']);
        $r = actualizarRegistro($col, $codigo, function (array &$r) use ($comp) {
            $r['pagoReportado'] = true;
            $r['comprobante'] = $comp ?: ($r['comprobante'] ?? '');
            $r['reportadoEn'] = date('c');
            return true;
        });
        $taller = correoTaller();
        if ($taller && is_array($r)) {
            enviarCorreo($taller, 'Pago por QR reportado – ' . $codigo,
                '<p>El cliente indica que pagó ' . dinero($monto) . ' con el QR. Verifica en tu banco y márcalo como pagado en el panel.</p>'
                . ($comp ? '<p><a href="' . htmlspecialchars(urlBase() . '/' . $comp) . '">Ver comprobante</a></p>' : ''));
        }
        responder(['ok' => true, 'reportado' => true]);

    default:
        responder(['ok' => false, 'error' => 'Acción no válida.'], 400);
}
