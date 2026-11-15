<?php
/* =====================================================================
   API del panel de administración (admin.html)
   POST {accion:"login", usuario, clave}
   POST {accion:"cuenta", usuario, claveNueva, claveActual}     (token)
   POST {accion:"datos"}                                         (token)
   POST {accion:"guardar", seccion, valor}                       (token)
        seccion: negocio | reglas | catalogo | pagos
   POST {accion:"imagen", imagen:"data:image/...;base64,..."}    (token)
   POST {accion:"probar", servicio:"bnb"|"dlocal"}               (token)
   El token va en la cabecera X-Token.
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
$in = entrada();
$accion = (string)($in['accion'] ?? '');
const SECRETOS = ['bnb' => ['authorizationId'], 'dlocal' => ['secretKey', 'apiKey']];

function enmascarar(string $v): string {
    return $v === '' ? '' : '••••••' . mb_substr($v, -4);
}

function token(string $usuario, bool $configurar): string {
    return firmar(['u' => $usuario, 'c' => $configurar, 'exp' => time() + 12 * 3600]);
}

function pagosParaPanel(): array {
    $p = pagosConfig();
    foreach (SECRETOS as $grupo => $campos) foreach ($campos as $c) $p[$grupo][$c] = enmascarar((string)$p[$grupo][$c]);
    return $p;
}

function slug(string $t): string {
    $t = strtolower(trim(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $t) ?: $t));
    return trim(preg_replace('/[^a-z0-9]+/', '-', $t) ?? '', '-');
}

function hora(string $h, string $defecto): string {
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $h) ? $h : $defecto;
}

function fotoValida(string $f): string {
    return (preg_match('#^assets/img/[a-z0-9/_\-.]+\.(webp|jpg|jpeg|png|svg)$#i', $f) || preg_match('#^api/imagen\.php\?id=[a-f0-9]{20}\.(webp|jpg|png)$#', $f)) ? $f : '';
}

switch ($accion) {

    case 'login':
        $usuario = mb_strtolower(texto($in['usuario'] ?? '', 60));
        $clave = (string)($in['clave'] ?? '');
        $c = cuentaAdmin();
        if (empty($c['hash'])) {
            // Primer ingreso: usuario "admin" + clave inicial (ADMIN_CLAVE / config.php)
            if ($usuario === 'admin' && $clave !== '' && hash_equals((string)$CONFIG['admin_clave'], $clave)) {
                responder(['ok' => true, 'token' => token('admin', true), 'configurar' => true, 'usuario' => 'admin']);
            }
        } elseif ($usuario === mb_strtolower((string)$c['usuario']) && password_verify($clave, (string)$c['hash'])) {
            responder(['ok' => true, 'token' => token((string)$c['usuario'], false), 'configurar' => false, 'usuario' => $c['usuario']]);
        }
        usleep(700000);
        responder(['ok' => false, 'error' => 'Usuario o contraseña incorrectos.'], 401);

    case 'cuenta':
        verificarSesion($in);
        $c = cuentaAdmin();
        $usuario = texto($in['usuario'] ?? '', 60);
        $nueva = (string)($in['claveNueva'] ?? '');
        if (!empty($c['hash']) && !password_verify((string)($in['claveActual'] ?? ''), (string)$c['hash'])) {
            usleep(500000);
            responder(['ok' => false, 'error' => 'La contraseña actual no es correcta.'], 422);
        }
        if (!preg_match('/^[A-Za-z0-9._@-]{3,60}$/', $usuario)) responder(['ok' => false, 'error' => 'El usuario debe tener de 3 a 60 caracteres (letras, números, punto, guion o @).'], 422);
        if (mb_strlen($nueva) < 8) responder(['ok' => false, 'error' => 'La contraseña debe tener al menos 8 caracteres.'], 422);
        if (hash_equals((string)$CONFIG['admin_clave'], $nueva)) responder(['ok' => false, 'error' => 'Usa una contraseña distinta de la clave inicial.'], 422);
        $c['usuario'] = $usuario;
        $c['hash'] = password_hash($nueva, PASSWORD_DEFAULT);
        guardarAjuste('admin', $c);
        responder(['ok' => true, 'token' => token($usuario, false), 'usuario' => $usuario]);

    case 'datos':
        $s = verificarSesion($in);
        if (!empty($s['c'])) responder(['ok' => false, 'error' => 'Primero crea tu usuario y contraseña.', 'configurar' => true], 403);
        $base = urlBase();
        responder([
            'ok' => true,
            'usuario' => $s['u'],
            'negocio' => (object)ajuste('negocio', []),
            'reglas' => reglas(),
            'catalogo' => catalogo(),
            'pagos' => pagosParaPanel(),
            'reservas' => conReservas(fn(array $l) => $l),
            'pedidos' => conPedidos(fn(array $l) => $l),
            'info' => [
                'almacen' => bd() ? 'Base de datos PostgreSQL' : 'Archivos del servidor (api/datos/)',
                'webhookBnb' => $base . '/api/webhook-bnb.php',
                'webhookDlocal' => $base . '/api/webhook-dlocal.php',
                'sitio' => $base,
                'correo' => function_exists('mail') && ini_get('sendmail_path') ? 'mail() disponible' : 'sin servidor de correo',
            ],
        ]);

    case 'guardar':
        $s = verificarSesion($in);
        if (!empty($s['c'])) responder(['ok' => false, 'error' => 'Primero crea tu usuario y contraseña.'], 403);
        $v = is_array($in['valor'] ?? null) ? $in['valor'] : [];
        $seccion = (string)($in['seccion'] ?? '');

        if ($seccion === 'negocio') {
            $n = [];
            foreach (['nombre' => 60, 'titular' => 120, 'nit' => 40, 'pais' => 60, 'ciudad' => 60, 'direccion' => 200, 'correo' => 120, 'whatsapp' => 20, 'horarioTexto' => 120] as $k => $max) {
                $n[$k] = texto($v[$k] ?? '', $max);
            }
            if ($n['correo'] !== '' && !filter_var($n['correo'], FILTER_VALIDATE_EMAIL)) responder(['ok' => false, 'error' => 'El correo no es válido.'], 422);
            $n['whatsapp'] = preg_replace('/\D/', '', $n['whatsapp']);
            guardarAjuste('negocio', $n);
            responder(['ok' => true]);
        }

        if ($seccion === 'reglas') {
            $servicios = [];
            $ids = [];
            foreach ((array)($v['servicios'] ?? []) as $sv) {
                $nombre = texto($sv['nombre'] ?? '', 80);
                if ($nombre === '') continue;
                $id = slug(texto($sv['id'] ?? '', 40)) ?: slug($nombre);
                while (in_array($id, $ids, true)) $id .= '-2';
                $ids[] = $id;
                $servicios[] = ['id' => $id, 'nombre' => $nombre, 'precio' => numero($sv['precio'] ?? 0, 0, 1000000), 'descripcion' => texto($sv['descripcion'] ?? '', 300)];
            }
            if (!$servicios) responder(['ok' => false, 'error' => 'Debe haber al menos un servicio.'], 422);
            $dias = array_values(array_unique(array_filter(array_map('intval', (array)($v['diasLaborables'] ?? [])), fn($d) => $d >= 0 && $d <= 6)));
            if (!$dias) responder(['ok' => false, 'error' => 'Elige al menos un día de atención.'], 422);
            $feriados = array_values(array_filter(array_map(fn($f) => texto($f, 10), (array)($v['feriados'] ?? [])), fn($f) => (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)));
            $pausas = [];
            foreach ((array)($v['pausas'] ?? []) as $p) {
                $d = hora(texto($p['desde'] ?? '', 5), ''); $h = hora(texto($p['hasta'] ?? '', 5), '');
                if ($d && $h && $d < $h) $pausas[] = ['desde' => $d, 'hasta' => $h];
            }
            $r = [
                'duracionMinutos' => (int)numero($v['duracionMinutos'] ?? 60, 15, 480),
                'porcentajeAdelanto' => numero($v['porcentajeAdelanto'] ?? 30, 0, 100),
                'horasCancelacion' => (int)numero($v['horasCancelacion'] ?? 24, 0, 720),
                'horaApertura' => hora(texto($v['horaApertura'] ?? '', 5), '08:00'),
                'horaCierre' => hora(texto($v['horaCierre'] ?? '', 5), '17:00'),
                'pausas' => $pausas, 'diasLaborables' => $dias,
                'diasMaximosAnticipacion' => (int)numero($v['diasMaximosAnticipacion'] ?? 45, 1, 365),
                'feriados' => $feriados, 'servicios' => $servicios,
            ];
            if ($r['horaApertura'] >= $r['horaCierre']) responder(['ok' => false, 'error' => 'La hora de cierre debe ser posterior a la de apertura.'], 422);
            guardarAjuste('reglas', $r);
            responder(['ok' => true, 'reglas' => $r]);
        }

        if ($seccion === 'catalogo') {
            $cats = [];
            foreach ((array)($v['categorias'] ?? []) as $k => $nombre) {
                $k = slug((string)$k); $nombre = texto($nombre, 60);
                if ($k !== '' && $nombre !== '') $cats[$k] = $nombre;
            }
            $prods = []; $ids = [];
            foreach ((array)($v['productos'] ?? []) as $p) {
                $nombre = texto($p['nombre'] ?? '', 120);
                if ($nombre === '') continue;
                $id = slug(texto($p['id'] ?? '', 80)) ?: slug($nombre);
                while (in_array($id, $ids, true)) $id .= '-2';
                $ids[] = $id;
                $cat = slug(texto($p['categoria'] ?? '', 40));
                if (!isset($cats[$cat])) { $cat = $cat ?: 'otros'; $cats[$cat] = $cats[$cat] ?? ucfirst(str_replace('-', ' ', $cat)); }
                $prods[] = [
                    'id' => $id, 'nombre' => $nombre, 'categoria' => $cat, 'precio' => numero($p['precio'] ?? 0, 0, 10000000),
                    'descripcion' => texto($p['descripcion'] ?? '', 400), 'foto' => fotoValida(texto($p['foto'] ?? '', 200)) ?: 'assets/img/logo-automax-icono.svg',
                    'etiqueta' => texto($p['etiqueta'] ?? '', 40), 'disponible' => !empty($p['disponible']),
                ];
            }
            guardarAjuste('catalogo', ['categorias' => $cats, 'productos' => $prods]);
            responder(['ok' => true, 'catalogo' => catalogo()]);
        }

        if ($seccion === 'pagos') {
            $actual = pagosConfig();
            $b = (array)($v['bnb'] ?? []); $d = (array)($v['dlocal'] ?? []); $q = (array)($v['qrFijo'] ?? []);
            $nuevo = [
                'bnb' => [
                    'activo' => !empty($b['activo']), 'entorno' => ($b['entorno'] ?? '') === 'produccion' ? 'produccion' : 'prueba',
                    'accountId' => texto($b['accountId'] ?? '', 120), 'authorizationId' => texto($b['authorizationId'] ?? '', 200),
                    'cuentaDestino' => texto($b['cuentaDestino'] ?? '1', 10) ?: '1',
                    'urlBase' => preg_match('#^https://[a-z0-9.\-]+(:\d+)?(/[\w\-./]*)?$#i', texto($b['urlBase'] ?? '', 200)) ? texto($b['urlBase'], 200) : '',
                    'vigenciaHoras' => (int)numero($b['vigenciaHoras'] ?? 24, 1, 720),
                ],
                'dlocal' => [
                    'activo' => !empty($d['activo']), 'apiKey' => texto($d['apiKey'] ?? '', 200), 'secretKey' => texto($d['secretKey'] ?? '', 200),
                    'sandbox' => !empty($d['sandbox']), 'moneda' => ($d['moneda'] ?? '') === 'USD' ? 'USD' : 'BOB',
                    'tasa' => numero($d['tasa'] ?? 6.96, 0.01, 1000), 'pais' => 'BO',
                ],
                'qrFijo' => [
                    'activo' => !empty($q['activo']), 'imagen' => fotoValida(texto($q['imagen'] ?? '', 200)),
                    'titular' => texto($q['titular'] ?? '', 120), 'banco' => texto($q['banco'] ?? '', 80),
                ],
            ];
            // Campos secretos: si llegan vacíos o enmascarados se conserva el valor guardado
            foreach (SECRETOS as $grupo => $campos) foreach ($campos as $c) {
                if ($nuevo[$grupo][$c] === '' || strpos($nuevo[$grupo][$c], '•') !== false) $nuevo[$grupo][$c] = (string)$actual[$grupo][$c];
            }
            if (!empty($b['borrar'])) { $nuevo['bnb']['accountId'] = ''; $nuevo['bnb']['authorizationId'] = ''; $nuevo['bnb']['activo'] = false; }
            if (!empty($d['borrar'])) { $nuevo['dlocal']['apiKey'] = ''; $nuevo['dlocal']['secretKey'] = ''; $nuevo['dlocal']['activo'] = false; }
            guardarAjuste('pagos', $nuevo);
            responder(['ok' => true, 'pagos' => pagosParaPanel(), 'metodos' => metodosPago()]);
        }
        responder(['ok' => false, 'error' => 'Sección no válida.'], 400);

    case 'imagen':
        verificarSesion($in);
        responder(['ok' => true, 'url' => guardarImagen((string)($in['imagen'] ?? ''))]);

    case 'probar':
        verificarSesion($in);
        if (!function_exists('curl_init')) responder(['ok' => false, 'error' => 'El servidor no tiene cURL.']);
        $p = pagosConfig();
        if (($in['servicio'] ?? '') === 'bnb') {
            if (!$p['bnb']['accountId'] || !$p['bnb']['authorizationId']) responder(['ok' => false, 'error' => 'Guarda primero el accountId y el authorizationId.']);
            $error = '';
            $t = bnbToken($p['bnb'], $error);
            responder($t ? ['ok' => true, 'mensaje' => 'Conexión correcta con el BNB (' . ($p['bnb']['entorno'] === 'produccion' ? 'producción' : 'pruebas') . ').'] : ['ok' => false, 'error' => $error]);
        }
        if (($in['servicio'] ?? '') === 'dlocal') {
            $d = $p['dlocal'];
            if (!$d['apiKey'] || !$d['secretKey']) responder(['ok' => false, 'error' => 'Guarda primero la API Key y la Secret Key.']);
            $base = $d['sandbox'] ? 'https://api-sbx.dlocalgo.com' : 'https://api.dlocalgo.com';
            peticionJson('GET', $base . '/v1/payments/prueba-conexion', null, ['Authorization: Bearer ' . $d['apiKey'] . ':' . $d['secretKey']], $estado);
            if ($estado === 401 || $estado === 403) responder(['ok' => false, 'error' => 'dLocal Go rechazó las llaves (HTTP ' . $estado . ').']);
            if ($estado === 0) responder(['ok' => false, 'error' => 'No se pudo conectar con dLocal Go.']);
            responder(['ok' => true, 'mensaje' => 'Llaves aceptadas por dLocal Go (' . ($d['sandbox'] ? 'sandbox' : 'producción') . ').']);
        }
        responder(['ok' => false, 'error' => 'Servicio no válido.'], 400);

    default:
        responder(['ok' => false, 'error' => 'Acción no válida.'], 400);
}
