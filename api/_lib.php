<?php
/* =====================================================================
   Funciones comunes del backend. No se accede directamente.
   - Almacenamiento: PostgreSQL (DATABASE_URL) o archivos en api/datos/
   - Ajustes editables desde el panel: negocio, reglas, catálogo, pagos
   - Sesión del panel admin (token firmado)
   - Clientes de las APIs de pago: BNB QR Simple y dLocal Go
   ===================================================================== */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_lib.php') { http_response_code(403); exit; }

$CONFIG = require __DIR__ . (is_file(__DIR__ . '/config.php') ? '/config.php' : '/config.example.php');
date_default_timezone_set($CONFIG['zona_horaria'] ?: 'America/La_Paz');

if (!defined('SIN_JSON')) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
}
header('X-Content-Type-Options: nosniff');

const DIR_DATOS = __DIR__ . '/datos';

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */
function responder(array $datos, int $codigo = 200): void {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function entrada(): array {
    static $datos = null;
    if ($datos === null) {
        $datos = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($datos)) $datos = [];
    }
    return $datos;
}

function texto($v, int $max = 200): string {
    $v = is_scalar($v) ? trim((string)$v) : '';
    $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v) ?? '';
    return mb_substr($v, 0, $max);
}

function textoLargo($v, int $max = 2000): string {
    $v = is_scalar($v) ? trim((string)$v) : '';
    $v = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', ' ', $v) ?? '';
    return mb_substr($v, 0, $max);
}

function numero($v, float $min = 0, float $max = 1e9): float {
    $n = is_numeric($v) ? (float)$v : 0.0;
    return round(max($min, min($max, $n)), 2);
}

function urlBase(): string {
    global $CONFIG;
    $https = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $b = $CONFIG['sitio_url'] ?: (($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    return rtrim($b, '/');
}

function codigoNuevo(string $prefijo, array $existentes): string {
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $c = $prefijo;
        for ($i = 0; $i < 6; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    } while (in_array($c, $existentes, true));
    return $c;
}

/* ---------------------------------------------------------------------
   Base de datos (opcional)
   --------------------------------------------------------------------- */
function bd(): ?PDO {
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    $url = getenv('DATABASE_URL') ?: '';
    if ($url === '') return $pdo = null;
    $u = parse_url($url);
    parse_str($u['query'] ?? '', $q);
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s', $u['host'], $u['port'] ?? 5432,
        ltrim($u['path'] ?? '', '/'), $q['sslmode'] ?? 'prefer');
    try {
        $pdo = new PDO($dsn, urldecode($u['user'] ?? ''), urldecode($u['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        foreach (['torke_reservas', 'torke_pedidos'] as $t) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS $t (
                id BIGSERIAL, codigo TEXT PRIMARY KEY, datos JSONB NOT NULL,
                creada TIMESTAMPTZ NOT NULL DEFAULT now(), actualizada TIMESTAMPTZ NOT NULL DEFAULT now())");
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS torke_ajustes (clave TEXT PRIMARY KEY, valor JSONB NOT NULL, actualizada TIMESTAMPTZ NOT NULL DEFAULT now())');
        $pdo->exec('CREATE TABLE IF NOT EXISTS torke_imagenes (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, datos BYTEA NOT NULL, creada TIMESTAMPTZ NOT NULL DEFAULT now())');
    } catch (Throwable $e) {
        error_log('BD: ' . $e->getMessage());
        responder(['ok' => false, 'error' => 'No se pudo conectar con la base de datos.'], 500);
    }
    return $pdo;
}

function asegurarDirDatos(): void {
    if (!is_dir(DIR_DATOS)) mkdir(DIR_DATOS, 0750, true);
}

/* ---------------------------------------------------------------------
   Colecciones: reservas y pedidos
   --------------------------------------------------------------------- */
function conColeccion(string $nombre, callable $fn, bool $escribir = false) {
    if (!in_array($nombre, ['reservas', 'pedidos'], true)) throw new InvalidArgumentException($nombre);
    $tabla = 'torke_' . $nombre;
    $pdo = bd();
    if ($pdo) {
        try {
            $pdo->beginTransaction();
            if ($escribir) $pdo->query('SELECT pg_advisory_xact_lock(' . ($nombre === 'reservas' ? 7421001 : 7421002) . ')');
            $lista = [];
            foreach ($pdo->query("SELECT datos FROM $tabla ORDER BY id") as $f) $lista[] = json_decode($f['datos'], true);
            $antes = array_column($lista, 'codigo');
            $resultado = $fn($lista);
            if ($escribir) {
                $ins = $pdo->prepare("INSERT INTO $tabla (codigo, datos) VALUES (?, ?::jsonb)
                    ON CONFLICT (codigo) DO UPDATE SET datos = EXCLUDED.datos, actualizada = now()
                    WHERE $tabla.datos IS DISTINCT FROM EXCLUDED.datos");
                foreach ($lista as $r) $ins->execute([$r['codigo'], json_encode($r, JSON_UNESCAPED_UNICODE)]);
                $borrar = array_diff($antes, array_column($lista, 'codigo'));
                if ($borrar) {
                    $del = $pdo->prepare("DELETE FROM $tabla WHERE codigo = ?");
                    foreach ($borrar as $c) $del->execute([$c]);
                }
            }
            $pdo->commit();
            return $resultado;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('BD: ' . $e->getMessage());
            responder(['ok' => false, 'error' => 'Error en la base de datos.'], 500);
        }
    }

    asegurarDirDatos();
    $fp = fopen(DIR_DATOS . '/' . $nombre . '.json', 'c+');
    if (!$fp) responder(['ok' => false, 'error' => 'No se puede escribir en api/datos/. Revisa los permisos.'], 500);
    flock($fp, $escribir ? LOCK_EX : LOCK_SH);
    $lista = json_decode(stream_get_contents($fp) ?: '[]', true) ?: [];
    $resultado = $fn($lista);
    if ($escribir) {
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp);
    }
    flock($fp, LOCK_UN); fclose($fp);
    return $resultado;
}

function conReservas(callable $fn, bool $escribir = false) { return conColeccion('reservas', $fn, $escribir); }
function conPedidos(callable $fn, bool $escribir = false) { return conColeccion('pedidos', $fn, $escribir); }

/** Busca un registro por código; $cambiar lo modifica (devuelve false para no guardar). */
function actualizarRegistro(string $coleccion, string $codigo, callable $cambiar) {
    return conColeccion($coleccion, function (array &$l) use ($codigo, $cambiar) {
        foreach ($l as &$x) {
            if ($x['codigo'] !== $codigo) continue;
            $copia = $x;
            $r = $cambiar($copia);
            if ($r === false) return false;
            if (is_string($r)) return $r;
            $copia['actualizada'] = date('c');
            $x = $copia;
            return $x;
        }
        return null;
    }, true);
}

function buscarRegistro(string $coleccion, string $codigo): ?array {
    return conColeccion($coleccion, function (array $l) use ($codigo) {
        foreach ($l as $x) if ($x['codigo'] === $codigo) return $x;
        return null;
    });
}

/* ---------------------------------------------------------------------
   Ajustes (editables desde el panel)
   --------------------------------------------------------------------- */
$GLOBALS['_ajustes'] = [];

function ajuste(string $clave, $defecto = null) {
    if (array_key_exists($clave, $GLOBALS['_ajustes'])) return $GLOBALS['_ajustes'][$clave] ?? $defecto;
    $pdo = bd();
    $valor = null;
    if ($pdo) {
        $st = $pdo->prepare('SELECT valor FROM torke_ajustes WHERE clave = ?');
        $st->execute([$clave]);
        $v = $st->fetchColumn();
        if ($v !== false) $valor = json_decode($v, true);
    } else {
        $f = DIR_DATOS . '/ajustes.json';
        if (is_file($f)) $valor = (json_decode((string)file_get_contents($f), true) ?: [])[$clave] ?? null;
    }
    $GLOBALS['_ajustes'][$clave] = $valor;
    return $valor ?? $defecto;
}

function guardarAjuste(string $clave, $valor): void {
    $GLOBALS['_ajustes'][$clave] = $valor;
    $pdo = bd();
    if ($pdo) {
        $st = $pdo->prepare('INSERT INTO torke_ajustes (clave, valor) VALUES (?, ?::jsonb)
            ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizada = now()');
        $st->execute([$clave, json_encode($valor, JSON_UNESCAPED_UNICODE)]);
        return;
    }
    asegurarDirDatos();
    $fp = fopen(DIR_DATOS . '/ajustes.json', 'c+');
    if (!$fp) responder(['ok' => false, 'error' => 'No se puede escribir en api/datos/.'], 500);
    flock($fp, LOCK_EX);
    $todo = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
    $todo[$clave] = $valor;
    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($todo, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    flock($fp, LOCK_UN); fclose($fp);
}

function archivoJson(string $nombre): array {
    $d = json_decode((string)@file_get_contents(dirname(__DIR__) . '/' . $nombre), true);
    if (!is_array($d)) return [];
    unset($d['_instrucciones']);
    return $d;
}

/** Reglas de agenda y servicios (panel › Servicios y agenda, o reservas.json). */
function reglas(): array {
    $r = ajuste('reglas') ?: archivoJson('reservas.json');
    if (!$r || empty($r['servicios'])) responder(['ok' => false, 'error' => 'No hay servicios configurados.'], 500);
    return $r;
}

/** Catálogo de la tienda (panel › Catálogo, o productos.json). */
function catalogo(): array {
    $c = ajuste('catalogo') ?: archivoJson('productos.json');
    return ['categorias' => (object)($c['categorias'] ?? []), 'productos' => array_values($c['productos'] ?? [])];
}

/** Datos del negocio (panel › Negocio). Los vacíos no se envían y el sitio usa los de config.js. */
function negocioGuardado(): array {
    return array_filter((array)ajuste('negocio', []), fn($v) => $v !== '' && $v !== null);
}

function negocio(): array {
    global $CONFIG;
    $base = ['nombre' => $CONFIG['negocio_nombre'] ?: 'TORKE', 'titular' => '', 'nit' => '', 'pais' => '', 'ciudad' => '',
        'direccion' => '', 'correo' => '', 'whatsapp' => '', 'horarioTexto' => ''];
    return array_merge($base, negocioGuardado());
}

function correoTaller(): string {
    global $CONFIG;
    return negocio()['correo'] ?: (string)$CONFIG['correo_taller'];
}

function servicio(string $id): ?array {
    foreach (reglas()['servicios'] as $s) if ($s['id'] === $id) return $s;
    return null;
}

/** Configuración de pagos. Las variables de entorno sirven de respaldo. */
function pagosConfig(): array {
    global $CONFIG;
    $p = (array)ajuste('pagos', []);
    $bnb = array_merge(['activo' => false, 'entorno' => 'prueba', 'accountId' => '', 'authorizationId' => '',
        'cuentaDestino' => '1', 'urlBase' => '', 'vigenciaHoras' => 24], (array)($p['bnb'] ?? []));
    $dl = array_merge(['activo' => false, 'apiKey' => '', 'secretKey' => '', 'sandbox' => true, 'moneda' => 'BOB',
        'tasa' => 6.96, 'pais' => 'BO'], (array)($p['dlocal'] ?? []));
    if ($dl['apiKey'] === '' && !empty($CONFIG['dlocal_api_key'])) {
        $dl['apiKey'] = $CONFIG['dlocal_api_key']; $dl['secretKey'] = $CONFIG['dlocal_secret_key'];
        $dl['sandbox'] = (bool)$CONFIG['dlocal_sandbox']; $dl['activo'] = true;
    }
    $qf = array_merge(['activo' => false, 'imagen' => '', 'titular' => '', 'banco' => ''], (array)($p['qrFijo'] ?? []));
    return ['bnb' => $bnb, 'dlocal' => $dl, 'qrFijo' => $qf];
}

/** Métodos de pago disponibles para el público. */
function metodosPago(): array {
    $p = pagosConfig();
    $m = [];
    if ($p['bnb']['activo'] && $p['bnb']['accountId'] && $p['bnb']['authorizationId']) $m[] = 'qr';
    if ($p['dlocal']['activo'] && $p['dlocal']['apiKey'] && $p['dlocal']['secretKey']) $m[] = 'tarjeta';
    if ($p['qrFijo']['activo'] && $p['qrFijo']['imagen']) $m[] = 'qrfijo';
    return $m;
}

/* ---------------------------------------------------------------------
   Imágenes subidas desde el panel
   --------------------------------------------------------------------- */
function guardarImagen(string $dataUrl): string {
    if (!preg_match('#^data:(image/(webp|jpeg|png));base64,(.+)$#s', $dataUrl, $m)) responder(['ok' => false, 'error' => 'Formato de imagen no válido (usa JPG, PNG o WebP).'], 422);
    $bin = base64_decode($m[3], true);
    if ($bin === false || strlen($bin) > 2500000) responder(['ok' => false, 'error' => 'La imagen es demasiado grande (máx. 2,5 MB).'], 422);
    if (function_exists('getimagesizefromstring') && !@getimagesizefromstring($bin)) responder(['ok' => false, 'error' => 'El archivo no es una imagen válida.'], 422);
    $id = bin2hex(random_bytes(10)) . '.' . ($m[2] === 'jpeg' ? 'jpg' : $m[2]);
    $pdo = bd();
    if ($pdo) {
        $st = $pdo->prepare('INSERT INTO torke_imagenes (id, tipo, datos) VALUES (?, ?, ?)');
        $st->bindValue(1, $id); $st->bindValue(2, $m[1]); $st->bindValue(3, $bin, PDO::PARAM_LOB);
        $st->execute();
    } else {
        asegurarDirDatos();
        if (!is_dir(DIR_DATOS . '/img')) mkdir(DIR_DATOS . '/img', 0750, true);
        file_put_contents(DIR_DATOS . '/img/' . $id, $bin);
    }
    return 'api/imagen.php?id=' . $id;
}

/* ---------------------------------------------------------------------
   Sesión del panel admin
   Usuario y contraseña se guardan con hash (password_hash). La primera
   vez se entra con el usuario "admin" y la clave inicial (variable
   ADMIN_CLAVE o config.php); el panel pide crear credenciales propias.
   --------------------------------------------------------------------- */
function cuentaAdmin(): array {
    $c = (array)ajuste('admin', []);
    if (empty($c['secreto'])) {
        $c['secreto'] = bin2hex(random_bytes(32));
        guardarAjuste('admin', $c);
    }
    return $c;
}

function firmar(array $datos): string {
    $c = cuentaAdmin();
    $cuerpo = rtrim(strtr(base64_encode(json_encode($datos)), '+/', '-_'), '=');
    return $cuerpo . '.' . hash_hmac('sha256', $cuerpo, $c['secreto'] . ($c['hash'] ?? ''));
}

function sesionDesdeToken(string $t): ?array {
    if (strpos($t, '.') === false) return null;
    [$cuerpo, $firma] = explode('.', $t, 2);
    $c = cuentaAdmin();
    if (!hash_equals(hash_hmac('sha256', $cuerpo, $c['secreto'] . ($c['hash'] ?? '')), $firma)) return null;
    $d = json_decode((string)base64_decode(strtr($cuerpo, '-_', '+/')), true);
    if (!is_array($d) || ($d['exp'] ?? 0) < time()) return null;
    return $d;
}

function verificarSesion(array $in = []): array {
    $t = (string)($_SERVER['HTTP_X_TOKEN'] ?? ($in['token'] ?? ''));
    $s = $t !== '' ? sesionDesdeToken($t) : null;
    if (!$s) responder(['ok' => false, 'error' => 'Tu sesión expiró. Vuelve a ingresar.', 'sesion' => false], 401);
    return $s;
}

/* ---------------------------------------------------------------------
   Formato y correos
   --------------------------------------------------------------------- */
function dinero(float $v): string {
    return 'Bs ' . number_format($v, 2, ',', '.');
}

function enviarCorreo(string $para, string $asunto, string $html, string $responderA = ''): bool {
    global $CONFIG;
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
    $N = negocio();
    $de = $CONFIG['correo_remitente'] ?: (correoTaller() ?: 'no-responder@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $nombre = '=?UTF-8?B?' . base64_encode($N['nombre']) . '?=';
    $cab = ['MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', "From: $nombre <$de>"];
    if ($responderA && filter_var($responderA, FILTER_VALIDATE_EMAIL)) $cab[] = "Reply-To: $responderA";
    $cuerpo = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d1a2b">'
        . '<div style="background:#2a1b4d;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">'
        . htmlspecialchars($N['nombre']) . '</div><div style="border:1px solid #e4e0ef;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
        . $html . '</div></div>';
    return @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, implode("\r\n", $cab));
}

function tablaHtml(array $filas): string {
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $t = '<table style="width:100%;border-collapse:collapse;font-size:14px">';
    foreach ($filas as $k => $v) {
        if ($v === '' || $v === ' ()') continue;
        $t .= '<tr><td style="padding:7px 0;color:#5b5670;border-bottom:1px dashed #e4e0ef">' . $h($k) . '</td><td style="padding:7px 0;text-align:right;font-weight:bold;border-bottom:1px dashed #e4e0ef">' . $h($v) . '</td></tr>';
    }
    return $t . '</table>';
}

function tablaReserva(array $r): string {
    return tablaHtml([
        'Código' => $r['codigo'], 'Servicio' => $r['servicioNombre'], 'Fecha' => $r['fecha'], 'Hora' => $r['hora'],
        'Cliente' => $r['cliente']['nombre'], 'Teléfono' => $r['cliente']['telefono'], 'Correo' => $r['cliente']['correo'],
        'Vehículo' => $r['vehiculo']['marca'] . ' ' . $r['vehiculo']['modelo'] . ' ' . $r['vehiculo']['anio'] . ' · ' . $r['vehiculo']['placa'],
        'Síntomas' => implode(', ', $r['sintomas']) . ($r['otroSintoma'] ? ' (' . $r['otroSintoma'] . ')' : ''),
        'Costo de la revisión' => dinero($r['precio']), 'Adelanto (' . $r['porcentaje'] . '%)' => dinero($r['adelanto']),
        'Saldo en el taller' => dinero($r['precio'] - $r['adelanto']),
    ]);
}

function tablaPedido(array $p): string {
    $f = ['Pedido' => $p['codigo']];
    foreach ($p['items'] as $i) $f[$i['cantidad'] . ' × ' . $i['nombre']] = dinero($i['precio'] * $i['cantidad']);
    $f['Total'] = dinero($p['total']);
    $f['Entrega'] = $p['entrega'] === 'envio' ? 'Envío a: ' . $p['direccion'] : 'Retiro en el taller';
    $f['Cliente'] = $p['cliente']['nombre'] . ' · ' . $p['cliente']['telefono'];
    return tablaHtml($f);
}

function publica(array $r): array {
    return [
        'codigo' => $r['codigo'], 'servicioNombre' => $r['servicioNombre'], 'fecha' => $r['fecha'], 'hora' => $r['hora'],
        'precio' => $r['precio'], 'adelanto' => $r['adelanto'], 'porcentaje' => $r['porcentaje'],
        'estado' => $r['estado'], 'pagado' => $r['pagado'], 'pagoReportado' => $r['pagoReportado'] ?? false,
        'sintomas' => $r['sintomas'], 'otroSintoma' => $r['otroSintoma'],
        'cliente' => ['nombre' => $r['cliente']['nombre'], 'correo' => $r['cliente']['correo'], 'telefono' => ''],
        'vehiculo' => $r['vehiculo'],
    ];
}

function pedidoPublico(array $p): array {
    return [
        'codigo' => $p['codigo'], 'items' => $p['items'], 'total' => $p['total'], 'entrega' => $p['entrega'],
        'estado' => $p['estado'], 'pagado' => $p['pagado'], 'pagoReportado' => $p['pagoReportado'] ?? false,
        'cliente' => ['nombre' => $p['cliente']['nombre']],
    ];
}

/** Marca como pagado una reserva o pedido y avisa por correo. */
function marcarPagado(string $tipo, string $codigo, string $metodo, string $referencia, float $montoBs): ?array {
    $col = $tipo === 'pedido' ? 'pedidos' : 'reservas';
    $r = actualizarRegistro($col, $codigo, function (array &$x) use ($tipo, $metodo, $referencia, $montoBs) {
        if ($x['pagado']) return false;
        $esperado = $tipo === 'pedido' ? (float)$x['total'] : (float)$x['adelanto'];
        if ($montoBs + 0.01 < $esperado) return false;
        $x['pagado'] = true;
        $x['pago'] = ['metodo' => $metodo, 'referencia' => $referencia, 'monto' => $montoBs, 'fecha' => date('c')];
        if ($tipo === 'reserva' && $x['estado'] === 'pendiente') $x['estado'] = 'confirmada';
        if ($tipo === 'pedido' && $x['estado'] === 'pendiente') $x['estado'] = 'pagado';
        return true;
    });
    if (!is_array($r)) return null;
    $taller = correoTaller();
    if ($tipo === 'reserva') {
        enviarCorreo($r['cliente']['correo'], 'Pago recibido – reserva ' . $r['codigo'] . ' confirmada',
            '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', recibimos el pago de tu adelanto. Tu reserva está <b>confirmada</b>.</p>' . tablaReserva($r), $taller);
        if ($taller) enviarCorreo($taller, 'Adelanto pagado – ' . $r['codigo'], '<p>Pago confirmado (' . htmlspecialchars($metodo) . ').</p>' . tablaReserva($r));
    } else {
        enviarCorreo($r['cliente']['correo'], 'Pago recibido – pedido ' . $r['codigo'],
            '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', recibimos el pago de tu pedido. Te avisaremos cuando esté listo.</p>' . tablaPedido($r), $taller);
        if ($taller) enviarCorreo($taller, 'Pedido pagado – ' . $r['codigo'], '<p>Pago confirmado (' . htmlspecialchars($metodo) . ').</p>' . tablaPedido($r));
    }
    return $r;
}

/* ---------------------------------------------------------------------
   Peticiones HTTP
   --------------------------------------------------------------------- */
function peticionJson(string $metodo, string $url, ?array $cuerpo, array $cabeceras = [], ?int &$estado = null): ?array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json', 'Accept: application/json'], $cabeceras),
    ]);
    if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cuerpo, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $estado = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) { error_log("HTTP $metodo $url: $err"); return null; }
    if ($estado >= 400) error_log("HTTP $metodo $url -> $estado: " . mb_substr((string)$resp, 0, 500));
    $d = json_decode((string)$resp, true);
    if (is_array($d)) return $d;
    return ['_texto' => trim((string)$resp)];
}

/* ---------------------------------------------------------------------
   BNB — API QR Simple (Open Banking)
   Credenciales: accountId y authorizationId que entrega el BNB.
   La URL base se puede cambiar en el panel si el banco indica otra.
   --------------------------------------------------------------------- */
function bnbBase(array $b): string {
    if (!empty($b['urlBase'])) return rtrim($b['urlBase'], '/');
    return $b['entorno'] === 'produccion' ? 'https://marketapi.bnb.com.bo' : 'https://test.bnb.com.bo';
}

function bnbToken(array $b, ?string &$error = null): ?string {
    $d = peticionJson('POST', bnbBase($b) . '/ClientAuthentication.API/api/v1/auth/token',
        ['accountId' => $b['accountId'], 'authorizationId' => $b['authorizationId']], [], $estado);
    if (!$d || $estado >= 400) { $error = 'No se pudo autenticar con el BNB (HTTP ' . $estado . ')' . (!empty($d['message']) && is_string($d['message']) ? ': ' . $d['message'] : '.'); return null; }
    if (isset($d['success']) && !$d['success']) { $error = 'El BNB rechazó las credenciales' . (is_string($d['message'] ?? null) ? ': ' . $d['message'] : '.'); return null; }
    $t = $d['message'] ?? ($d['token'] ?? ($d['_texto'] ?? ''));
    $t = is_string($t) ? trim($t, "\" \n") : '';
    if ($t === '') { $error = 'El BNB no devolvió un token.'; return null; }
    return $t;
}

/** Genera un QR de cobro. Devuelve ['id', 'imagen' (base64)] o null. */
function bnbGenerarQr(float $monto, string $glosa, string $referencia, ?string &$error = null): ?array {
    $b = pagosConfig()['bnb'];
    $t = bnbToken($b, $error);
    if (!$t) return null;
    $vence = date('Y-m-d', time() + max(1, (int)$b['vigenciaHoras']) * 3600);
    $d = peticionJson('POST', bnbBase($b) . '/QRSimple.API/api/v1/main/getQRWithImageAsync', [
        'currency' => 'BOB', 'gloss' => mb_substr($glosa, 0, 60), 'amount' => round($monto, 2),
        'singleUse' => true, 'expirationDate' => $vence, 'additionalData' => $referencia,
        'destinationAccountId' => (string)($b['cuentaDestino'] ?: '1'),
    ], ['Authorization: Bearer ' . $t], $estado);
    if (!$d || empty($d['qr'])) { $error = 'El BNB no generó el QR' . (is_string($d['message'] ?? null) && $d['message'] !== '' ? ': ' . $d['message'] : '.'); return null; }
    return ['id' => (string)($d['id'] ?? ''), 'imagen' => (string)$d['qr']];
}

/** Consulta al BNB si un QR ya fue pagado. */
function bnbQrPagado(string $qrId): bool {
    if ($qrId === '') return false;
    $b = pagosConfig()['bnb'];
    $t = bnbToken($b);
    if (!$t) return false;
    $d = peticionJson('POST', bnbBase($b) . '/QRSimple.API/api/v1/main/getQRStatusAsync', ['qrId' => $qrId], ['Authorization: Bearer ' . $t]);
    if (!$d) return false;
    $s = $d['statusQRCode'] ?? ($d['status'] ?? null);
    return $s === 1 || $s === '1' || (is_string($s) && in_array(strtolower($s), ['usado', 'pagado', 'paid', 'used'], true));
}

/* ---------------------------------------------------------------------
   dLocal Go — pagos con tarjeta
   --------------------------------------------------------------------- */
function dlocalPeticion(string $metodo, string $ruta, ?array $cuerpo = null, ?array $cfg = null): ?array {
    $d = $cfg ?? pagosConfig()['dlocal'];
    $base = $d['sandbox'] ? 'https://api-sbx.dlocalgo.com' : 'https://api.dlocalgo.com';
    $r = peticionJson($metodo, $base . $ruta, $cuerpo, ['Authorization: Bearer ' . $d['apiKey'] . ':' . $d['secretKey']], $estado);
    return ($r && $estado < 400 && !isset($r['_texto'])) ? $r : null;
}

/** Convierte un monto en Bs a la moneda de cobro de dLocal. */
function montoDlocal(float $bs): array {
    $d = pagosConfig()['dlocal'];
    if (strtoupper($d['moneda']) === 'USD') return [round($bs / max(0.01, (float)$d['tasa']), 2), 'USD'];
    return [round($bs, 2), 'BOB'];
}

/** Monto cobrado por dLocal convertido de vuelta a Bs. */
function montoDlocalABs(float $monto, string $moneda): float {
    $d = pagosConfig()['dlocal'];
    return strtoupper($moneda) === 'USD' ? round($monto * (float)$d['tasa'], 2) : $monto;
}
