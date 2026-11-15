<?php
/* =====================================================================
   Pedidos de la tienda
   POST {accion:"crear", items:[{id,cantidad}], cliente{nombre,telefono,correo},
         entrega:"retiro"|"envio", direccion, nota}
        -> el total se calcula en el servidor con los precios del catálogo
   GET  ?accion=consultar&codigo=PD-XXXXXX
   POST {accion:"estado", codigo, estado}   (panel)
   POST {accion:"pagado", codigo, pagado}   (panel)
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$in = $metodo === 'POST' ? entrada() : $_GET;
$accion = (string)($in['accion'] ?? '');

switch ($accion) {
    case 'crear':
        if ($metodo !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
        $cat = catalogo();
        $porId = [];
        foreach ($cat['productos'] as $p) $porId[$p['id']] = $p;

        $items = [];
        foreach ((array)($in['items'] ?? []) as $it) {
            $id = texto($it['id'] ?? '', 80);
            $cant = (int)($it['cantidad'] ?? 0);
            if (!isset($porId[$id]) || $cant < 1) continue;
            $p = $porId[$id];
            if (($p['disponible'] ?? true) === false) responder(['ok' => false, 'error' => $p['nombre'] . ' está agotado.'], 409);
            $items[] = ['id' => $id, 'nombre' => $p['nombre'], 'precio' => (float)$p['precio'], 'cantidad' => min($cant, 99)];
        }
        if (!$items) responder(['ok' => false, 'error' => 'Tu carrito está vacío.'], 422);

        $c = is_array($in['cliente'] ?? null) ? $in['cliente'] : [];
        $cliente = ['nombre' => texto($c['nombre'] ?? '', 80), 'telefono' => texto($c['telefono'] ?? '', 20), 'correo' => texto($c['correo'] ?? '', 120)];
        $entrega = ($in['entrega'] ?? '') === 'envio' ? 'envio' : 'retiro';
        $direccion = texto($in['direccion'] ?? '', 200);
        if (mb_strlen($cliente['nombre']) < 3 || strlen(preg_replace('/\D/', '', $cliente['telefono'])) < 7
            || !filter_var($cliente['correo'], FILTER_VALIDATE_EMAIL) || ($entrega === 'envio' && mb_strlen($direccion) < 6)) {
            responder(['ok' => false, 'error' => 'Completa tu nombre, teléfono, correo válido' . ($entrega === 'envio' ? ' y dirección de envío' : '') . '.'], 422);
        }

        $total = 0.0;
        foreach ($items as $i) $total += $i['precio'] * $i['cantidad'];
        $pedido = [
            'codigo' => '', 'items' => $items, 'total' => round($total, 2), 'cliente' => $cliente,
            'entrega' => $entrega, 'direccion' => $entrega === 'envio' ? $direccion : '', 'nota' => textoLargo($in['nota'] ?? '', 500),
            'estado' => 'pendiente', 'pagado' => false, 'pagoReportado' => false, 'creada' => date('c'),
        ];
        conPedidos(function (array &$l) use (&$pedido) {
            $pedido['codigo'] = codigoNuevo('PD-', array_column($l, 'codigo'));
            $l[] = $pedido;
        }, true);

        $taller = correoTaller();
        enviarCorreo($cliente['correo'], 'Pedido ' . $pedido['codigo'] . ' recibido',
            '<p>Hola ' . htmlspecialchars($cliente['nombre']) . ', recibimos tu pedido.</p>' . tablaPedido($pedido)
            . '<p><a href="' . htmlspecialchars(urlBase()) . '/pedido.html?codigo=' . $pedido['codigo'] . '">Ver mi pedido y pagar</a></p>', $taller);
        if ($taller) enviarCorreo($taller, 'Nuevo pedido ' . $pedido['codigo'], '<p>Nuevo pedido desde la tienda.</p>' . tablaPedido($pedido), $cliente['correo']);

        responder(['ok' => true, 'pedido' => pedidoPublico($pedido), 'metodos' => metodosPago()]);

    case 'consultar':
        $p = buscarRegistro('pedidos', strtoupper(texto($in['codigo'] ?? '', 12)));
        if (!$p) responder(['ok' => false, 'error' => 'Pedido no encontrado.'], 404);
        responder(['ok' => true, 'pedido' => pedidoPublico($p), 'metodos' => metodosPago()]);

    case 'estado':
    case 'pagado':
        verificarSesion($in);
        $codigo = texto($in['codigo'] ?? '', 12);
        $nuevo = texto($in['estado'] ?? '', 12);
        if ($accion === 'estado' && !in_array($nuevo, ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado'], true)) {
            responder(['ok' => false, 'error' => 'Estado no válido.'], 422);
        }
        $r = actualizarRegistro('pedidos', $codigo, function (array &$x) use ($accion, $nuevo, $in) {
            if ($accion === 'estado') { $x['estado'] = $nuevo; return true; }
            $x['pagado'] = (bool)($in['pagado'] ?? false);
            if ($x['pagado'] && empty($x['pago'])) $x['pago'] = ['metodo' => 'manual', 'referencia' => 'Marcado en el panel', 'monto' => $x['total'], 'fecha' => date('c')];
            if ($x['pagado'] && $x['estado'] === 'pendiente') $x['estado'] = 'pagado';
            return true;
        });
        if (!is_array($r)) responder(['ok' => false, 'error' => 'Pedido no encontrado.'], 404);
        $correo = false;
        if ($accion === 'estado' && in_array($nuevo, ['enviado', 'entregado', 'cancelado'], true)) {
            $txt = ['enviado' => 'fue <b>enviado</b>', 'entregado' => 'fue <b>entregado</b>. ¡Gracias por tu compra!', 'cancelado' => 'fue <b>cancelado</b>. Si pagaste, te contactaremos para la devolución.'][$nuevo];
            $correo = enviarCorreo($r['cliente']['correo'], 'Pedido ' . $r['codigo'] . ' – ' . $nuevo,
                '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', tu pedido ' . $txt . '</p>' . tablaPedido($r), correoTaller());
        }
        responder(['ok' => true, 'correoEnviado' => $correo]);

    default:
        responder(['ok' => false, 'error' => 'Acción no válida.'], 400);
}
