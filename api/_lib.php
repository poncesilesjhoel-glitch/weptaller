<?php
/* Funciones comunes del backend. No se accede directamente. */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_lib.php') { http_response_code(403); exit; }

$CONFIG = require __DIR__ . (is_file(__DIR__ . '/config.php') ? '/config.php' : '/config.example.php');
date_default_timezone_set($CONFIG['zona_horaria'] ?: 'UTC');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const ARCHIVO_RESERVAS = __DIR__ . '/datos/reservas.json';

function responder(array $datos, int $codigo = 200): void {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function entrada(): array {
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo ?: '[]', true);
    return is_array($datos) ? $datos : [];
}

function texto($v, int $max = 200): string {
    $v = is_scalar($v) ? trim((string)$v) : '';
    $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v) ?? '';
    return mb_substr($v, 0, $max);
}

function reglas(): array {
    static $r = null;
    if ($r === null) {
        $r = json_decode((string)file_get_contents(dirname(__DIR__) . '/reservas.json'), true);
        if (!is_array($r)) responder(['ok' => false, 'error' => 'No se pudo leer reservas.json.'], 500);
    }
    return $r;
}

function servicio(string $id): ?array {
    foreach (reglas()['servicios'] as $s) if ($s['id'] === $id) return $s;
    return null;
}

function aMin(string $h): int { [$a, $b] = array_map('intval', explode(':', $h)); return $a * 60 + $b; }
function aHora(int $m): string { return sprintf('%02d:%02d', intdiv($m, 60), $m % 60); }

/** Turnos válidos de una fecha (vacío si el día no es hábil). */
function turnos(string $fecha): array {
    $R = reglas();
    $d = DateTime::createFromFormat('!Y-m-d', $fecha);
    if (!$d || $d->format('Y-m-d') !== $fecha) return [];
    $hoy = new DateTime('today');
    $limite = (clone $hoy)->modify('+' . (int)($R['diasMaximosAnticipacion'] ?? 45) . ' days');
    if ($d < $hoy || $d > $limite) return [];
    if (!in_array((int)$d->format('w'), $R['diasLaborables'], true)) return [];
    if (in_array($fecha, $R['feriados'] ?? [], true)) return [];

    $dur = (int)$R['duracionMinutos'];
    $ini = aMin($R['horaApertura']); $fin = aMin($R['horaCierre']);
    $esHoy = $fecha === $hoy->format('Y-m-d');
    $ahora = (int)date('G') * 60 + (int)date('i') + 60;
    $lista = [];
    for ($m = $ini; $m + $dur <= $fin; $m += $dur) {
        foreach ($R['pausas'] ?? [] as $p) {
            if ($m < aMin($p['hasta']) && $m + $dur > aMin($p['desde'])) continue 2;
        }
        if ($esHoy && $m < $ahora) continue;
        $lista[] = aHora($m);
    }
    return $lista;
}

/** Abre el archivo de reservas con bloqueo exclusivo y ejecuta $fn. */
function conReservas(callable $fn, bool $escribir = false) {
    if (!is_dir(__DIR__ . '/datos')) mkdir(__DIR__ . '/datos', 0750, true);
    $fp = fopen(ARCHIVO_RESERVAS, 'c+');
    if (!$fp) responder(['ok' => false, 'error' => 'No se puede escribir en api/datos/. Revisa los permisos.'], 500);
    flock($fp, $escribir ? LOCK_EX : LOCK_SH);
    $contenido = stream_get_contents($fp);
    $lista = json_decode($contenido ?: '[]', true) ?: [];
    $resultado = $fn($lista);
    if ($escribir) {
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp);
    }
    flock($fp, LOCK_UN); fclose($fp);
    return $resultado;
}

function verificarAdmin(array $in): void {
    global $CONFIG;
    $clave = (string)($in['clave'] ?? '');
    if ($clave === '' || !hash_equals((string)$CONFIG['admin_clave'], $clave)) {
        usleep(400000); // frena ataques de fuerza bruta
        responder(['ok' => false, 'error' => 'Contraseña incorrecta.'], 401);
    }
}

function dinero(float $v): string {
    global $CONFIG;
    return $CONFIG['moneda'] . ' ' . number_format($v, 2, ',', '.');
}

function enviarCorreo(string $para, string $asunto, string $html, string $responderA = ''): bool {
    global $CONFIG;
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
    $de = $CONFIG['correo_remitente'] ?: ($CONFIG['correo_taller'] ?: 'no-responder@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $nombre = '=?UTF-8?B?' . base64_encode($CONFIG['negocio_nombre']) . '?=';
    $cab = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        "From: $nombre <$de>",
    ];
    if ($responderA && filter_var($responderA, FILTER_VALIDATE_EMAIL)) $cab[] = "Reply-To: $responderA";
    $cuerpo = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d1a2b">'
        . '<div style="background:#2a1b4d;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">'
        . htmlspecialchars($CONFIG['negocio_nombre']) . '</div><div style="border:1px solid #e4e0ef;border-top:0;padding:22px;border-radius:0 0 12px 12px">'
        . $html . '</div></div>';
    return @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, implode("\r\n", $cab));
}

function tablaReserva(array $r): string {
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $filas = [
        'Código' => $r['codigo'], 'Servicio' => $r['servicioNombre'],
        'Fecha' => $r['fecha'], 'Hora' => $r['hora'],
        'Cliente' => $r['cliente']['nombre'], 'Teléfono' => $r['cliente']['telefono'], 'Correo' => $r['cliente']['correo'],
        'Vehículo' => $r['vehiculo']['marca'] . ' ' . $r['vehiculo']['modelo'] . ' ' . $r['vehiculo']['anio'] . ' · ' . $r['vehiculo']['placa'],
        'Síntomas' => implode(', ', $r['sintomas']) . ($r['otroSintoma'] ? ' (' . $r['otroSintoma'] . ')' : ''),
        'Costo de la revisión' => dinero($r['precio']), 'Adelanto (' . $r['porcentaje'] . '%)' => dinero($r['adelanto']),
        'Saldo en el taller' => dinero($r['precio'] - $r['adelanto']),
    ];
    $t = '<table style="width:100%;border-collapse:collapse;font-size:14px">';
    foreach ($filas as $k => $v) {
        if ($v === '' || $v === ' ()') continue;
        $t .= '<tr><td style="padding:7px 0;color:#5b5670;border-bottom:1px dashed #e4e0ef">' . $h($k) . '</td><td style="padding:7px 0;text-align:right;font-weight:bold;border-bottom:1px dashed #e4e0ef">' . $h($v) . '</td></tr>';
    }
    return $t . '</table>';
}

function publica(array $r): array {
    // Datos que el cliente puede ver al consultar su código
    return [
        'codigo' => $r['codigo'], 'servicioNombre' => $r['servicioNombre'], 'fecha' => $r['fecha'], 'hora' => $r['hora'],
        'precio' => $r['precio'], 'adelanto' => $r['adelanto'], 'porcentaje' => $r['porcentaje'],
        'estado' => $r['estado'], 'pagado' => $r['pagado'], 'sintomas' => $r['sintomas'], 'otroSintoma' => $r['otroSintoma'],
        'cliente' => ['nombre' => $r['cliente']['nombre'], 'correo' => $r['cliente']['correo'], 'telefono' => ''],
        'vehiculo' => $r['vehiculo'],
    ];
}

function dlocalBase(): string {
    global $CONFIG;
    return $CONFIG['dlocal_sandbox'] ? 'https://api-sbx.dlocalgo.com' : 'https://api.dlocalgo.com';
}

function dlocalPeticion(string $metodo, string $ruta, ?array $cuerpo = null): ?array {
    global $CONFIG;
    $ch = curl_init(dlocalBase() . $ruta);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $CONFIG['dlocal_api_key'] . ':' . $CONFIG['dlocal_secret_key'],
        ],
    ]);
    if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cuerpo));
    $resp = curl_exec($ch);
    $estado = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $estado >= 400) {
        error_log("dLocal Go $metodo $ruta -> HTTP $estado: " . (string)$resp);
        return null;
    }
    return json_decode((string)$resp, true);
}
