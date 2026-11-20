<?php
/* =====================================================================
   Cuentas de clientes (compradores)
   POST {accion:"registrar", nombre, correo, telefono, clave}
   POST {accion:"login", correo, clave}
   POST {accion:"perfil"}                                   (X-Cliente)
   POST {accion:"actualizar", nombre, telefono, direccion}   (X-Cliente)
   POST {accion:"clave", actual, nueva}                     (X-Cliente)
   --- Panel admin (X-Token) ---
   POST {accion:"listar"}
   POST {accion:"activo", codigo, activo}
   POST {accion:"restablecer", codigo}   -> devuelve una clave temporal
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
$in = entrada();
$accion = (string)($in['accion'] ?? '');

function exigirCliente(): array {
    $c = clienteActual();
    if (!$c) responder(['ok' => false, 'error' => 'Inicia sesión para continuar.', 'sesionCliente' => false], 401);
    return $c;
}

function validarClave(string $clave): void {
    if (mb_strlen($clave) < 8) responder(['ok' => false, 'error' => 'La contraseña debe tener al menos 8 caracteres.'], 422);
    if (mb_strlen($clave) > 200) responder(['ok' => false, 'error' => 'La contraseña es demasiado larga.'], 422);
}

switch ($accion) {

    case 'registrar':
        $nombre = texto($in['nombre'] ?? '', 80);
        $correo = mb_strtolower(texto($in['correo'] ?? '', 120));
        $telefono = texto($in['telefono'] ?? '', 20);
        $clave = (string)($in['clave'] ?? '');
        if (mb_strlen($nombre) < 3) responder(['ok' => false, 'error' => 'Escribe tu nombre completo.'], 422);
        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) responder(['ok' => false, 'error' => 'El correo no es válido.'], 422);
        if (strlen(preg_replace('/\D/', '', $telefono)) < 7) responder(['ok' => false, 'error' => 'Escribe un teléfono válido.'], 422);
        validarClave($clave);
        $nuevo = null;
        $r = conColeccion('clientes', function (array &$l) use ($nombre, $correo, $telefono, $clave, &$nuevo) {
            foreach ($l as $x) if ($x['correo'] === $correo) return 'existe';
            $nuevo = [
                'codigo' => codigoNuevo('CL-', array_column($l, 'codigo')), 'nombre' => $nombre, 'correo' => $correo,
                'telefono' => $telefono, 'direccion' => '', 'hash' => password_hash($clave, PASSWORD_DEFAULT),
                'activo' => true, 'creada' => date('c'),
            ];
            $l[] = $nuevo;
            return 'ok';
        }, true);
        if ($r === 'existe') responder(['ok' => false, 'error' => 'Ya existe una cuenta con ese correo. Inicia sesión.'], 409);
        $taller = correoTaller();
        enviarCorreo($correo, 'Bienvenido a ' . negocio()['nombre'],
            '<p>Hola ' . htmlspecialchars($nombre) . ', tu cuenta quedó creada. Desde «Mi cuenta» puedes ver tus pedidos y reservas.</p>', $taller);
        responder(['ok' => true, 'token' => tokenCliente($nuevo), 'cliente' => clientePublico($nuevo)]);

    case 'login':
        $correo = mb_strtolower(texto($in['correo'] ?? '', 120));
        $clave = (string)($in['clave'] ?? '');
        $c = conColeccion('clientes', function (array $l) use ($correo) {
            foreach ($l as $x) if ($x['correo'] === $correo) return $x;
            return null;
        });
        if (!$c || !password_verify($clave, (string)$c['hash'])) {
            usleep(600000);
            responder(['ok' => false, 'error' => 'Correo o contraseña incorrectos.'], 401);
        }
        if (empty($c['activo'])) responder(['ok' => false, 'error' => 'Tu cuenta está desactivada. Escríbenos para ayudarte.'], 403);
        responder(['ok' => true, 'token' => tokenCliente($c), 'cliente' => clientePublico($c)]);

    case 'perfil':
        $c = exigirCliente();
        $k = $c['codigo'];
        $pedidos = conPedidos(fn(array $l) => array_values(array_filter($l, fn($p) => ($p['clienteId'] ?? '') === $k)));
        $reservas = conReservas(fn(array $l) => array_values(array_filter($l, fn($r) => ($r['clienteId'] ?? '') === $k)));
        responder([
            'ok' => true, 'cliente' => clientePublico($c),
            'pedidos' => array_reverse(array_map('pedidoPublico', $pedidos)),
            'reservas' => array_reverse(array_map('publica', $reservas)),
        ]);

    case 'actualizar':
        $c = exigirCliente();
        $nombre = texto($in['nombre'] ?? '', 80);
        $telefono = texto($in['telefono'] ?? '', 20);
        $direccion = texto($in['direccion'] ?? '', 200);
        if (mb_strlen($nombre) < 3) responder(['ok' => false, 'error' => 'Escribe tu nombre completo.'], 422);
        if (strlen(preg_replace('/\D/', '', $telefono)) < 7) responder(['ok' => false, 'error' => 'Escribe un teléfono válido.'], 422);
        $r = actualizarRegistro('clientes', $c['codigo'], function (array &$x) use ($nombre, $telefono, $direccion) {
            $x['nombre'] = $nombre; $x['telefono'] = $telefono; $x['direccion'] = $direccion; return true;
        });
        responder(['ok' => true, 'cliente' => clientePublico($r)]);

    case 'clave':
        $c = exigirCliente();
        if (!password_verify((string)($in['actual'] ?? ''), (string)$c['hash'])) {
            usleep(500000);
            responder(['ok' => false, 'error' => 'La contraseña actual no es correcta.'], 422);
        }
        $nueva = (string)($in['nueva'] ?? '');
        validarClave($nueva);
        $r = actualizarRegistro('clientes', $c['codigo'], function (array &$x) use ($nueva) {
            $x['hash'] = password_hash($nueva, PASSWORD_DEFAULT); return true;
        });
        responder(['ok' => true, 'token' => tokenCliente($r)]);

    /* ---------------- Panel admin ---------------- */
    case 'listar':
        verificarSesion($in);
        $pedidos = conPedidos(fn(array $l) => $l);
        $reservas = conReservas(fn(array $l) => $l);
        $lista = conColeccion('clientes', fn(array $l) => $l);
        $salida = [];
        foreach (array_reverse($lista) as $c) {
            $k = $c['codigo'];
            $susPedidos = array_filter($pedidos, fn($p) => ($p['clienteId'] ?? '') === $k);
            $salida[] = clientePublico($c) + [
                'activo' => !empty($c['activo']),
                'pedidos' => count($susPedidos),
                'reservas' => count(array_filter($reservas, fn($r) => ($r['clienteId'] ?? '') === $k)),
                'comprado' => array_sum(array_map(fn($p) => $p['pagado'] && $p['estado'] !== 'cancelado' ? (float)$p['total'] : 0, $susPedidos)),
            ];
        }
        responder(['ok' => true, 'clientes' => $salida]);

    case 'activo':
        verificarSesion($in);
        $r = actualizarRegistro('clientes', texto($in['codigo'] ?? '', 12), function (array &$x) use ($in) {
            $x['activo'] = !empty($in['activo']); return true;
        });
        if (!is_array($r)) responder(['ok' => false, 'error' => 'Cliente no encontrado.'], 404);
        responder(['ok' => true]);

    case 'restablecer':
        verificarSesion($in);
        $abc = 'abcdefghjkmnpqrstuvwxyz23456789';
        $temp = '';
        for ($i = 0; $i < 10; $i++) $temp .= $abc[random_int(0, strlen($abc) - 1)];
        $r = actualizarRegistro('clientes', texto($in['codigo'] ?? '', 12), function (array &$x) use ($temp) {
            $x['hash'] = password_hash($temp, PASSWORD_DEFAULT); return true;
        });
        if (!is_array($r)) responder(['ok' => false, 'error' => 'Cliente no encontrado.'], 404);
        responder(['ok' => true, 'clave' => $temp, 'cliente' => clientePublico($r)]);

    default:
        responder(['ok' => false, 'error' => 'Acción no válida.'], 400);
}
