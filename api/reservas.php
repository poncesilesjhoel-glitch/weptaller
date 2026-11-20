<?php
/* =====================================================================
   API de reservas
   GET  ?accion=ping                      -> comprueba que el backend funciona
   GET  ?accion=ocupados&fecha=AAAA-MM-DD -> horas ya reservadas
   GET  ?accion=consultar&codigo=AM-XXX   -> estado público de una reserva
   POST {accion:"crear", ...}             -> crea una reserva y envía correos
   POST {accion:"estado", codigo, estado} -> (panel) confirmar/cancelar
   POST {accion:"pagado", codigo, pagado} -> (panel) marcar adelanto pagado
   ===================================================================== */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$in = $metodo === 'POST' ? entrada() : $_GET;
$accion = (string)($in['accion'] ?? '');

/** Turnos válidos de una fecha (vacío si el día no es hábil). */
function aMin(string $h): int { [$a, $b] = array_map('intval', explode(':', $h . ':0')); return $a * 60 + $b; }
function aHora(int $m): string { return sprintf('%02d:%02d', intdiv($m, 60), $m % 60); }
function turnos(string $fecha): array {
    $R = reglas();
    $d = DateTime::createFromFormat('!Y-m-d', $fecha);
    if (!$d || $d->format('Y-m-d') !== $fecha) return [];
    $hoy = new DateTime('today');
    $limite = (clone $hoy)->modify('+' . (int)($R['diasMaximosAnticipacion'] ?? 45) . ' days');
    if ($d < $hoy || $d > $limite) return [];
    if (!in_array((int)$d->format('w'), array_map('intval', $R['diasLaborables']), true)) return [];
    if (in_array($fecha, $R['feriados'] ?? [], true)) return [];
    $dur = max(15, (int)$R['duracionMinutos']);
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

switch ($accion) {

    case 'ping':
        responder(['ok' => true, 'almacen' => bd() ? 'base de datos' : 'archivo']);

    case 'ocupados':
        $fecha = texto($in['fecha'] ?? '', 10);
        $horas = conReservas(function (array $l) use ($fecha) {
            $h = [];
            foreach ($l as $r) if ($r['fecha'] === $fecha && $r['estado'] !== 'cancelada') $h[] = $r['hora'];
            return $h;
        });
        responder(['ok' => true, 'horas' => array_values(array_unique($horas))]);

    case 'consultar':
        $r = buscarRegistro('reservas', strtoupper(texto($in['codigo'] ?? '', 12)));
        if (!$r) responder(['ok' => false, 'error' => 'Reserva no encontrada.'], 404);
        responder(['ok' => true, 'reserva' => publica($r), 'metodos' => metodosPago()]);

    case 'crear':
        if ($metodo !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
        $R = reglas();
        $s = servicio(texto($in['servicio'] ?? '', 40));
        if (!$s) responder(['ok' => false, 'error' => 'Servicio no válido.'], 422);

        $fecha = texto($in['fecha'] ?? '', 10);
        $hora = texto($in['hora'] ?? '', 5);
        if (!in_array($hora, turnos($fecha), true)) {
            responder(['ok' => false, 'codigo' => 'ocupado', 'error' => 'La fecha u hora elegida no está disponible.'], 409);
        }

        $c = is_array($in['cliente'] ?? null) ? $in['cliente'] : [];
        $v = is_array($in['vehiculo'] ?? null) ? $in['vehiculo'] : [];
        $cliente = ['nombre' => texto($c['nombre'] ?? '', 80), 'telefono' => texto($c['telefono'] ?? '', 20), 'correo' => texto($c['correo'] ?? '', 120)];
        $vehiculo = ['marca' => texto($v['marca'] ?? '', 40), 'modelo' => texto($v['modelo'] ?? '', 40), 'anio' => texto($v['anio'] ?? '', 4), 'placa' => strtoupper(texto($v['placa'] ?? '', 12))];
        if (mb_strlen($cliente['nombre']) < 3 || strlen(preg_replace('/\D/', '', $cliente['telefono'])) < 7
            || !filter_var($cliente['correo'], FILTER_VALIDATE_EMAIL) || $vehiculo['marca'] === '' || $vehiculo['modelo'] === ''
            || !preg_match('/^\d{4}$/', $vehiculo['anio']) || strlen($vehiculo['placa']) < 4) {
            responder(['ok' => false, 'error' => 'Revisa tus datos: hay campos incompletos o no válidos.'], 422);
        }

        $sintomas = [];
        foreach ((array)($in['sintomas'] ?? []) as $x) { $t = texto($x, 60); if ($t !== '') $sintomas[] = $t; }
        $sintomas = array_slice(array_unique($sintomas), 0, 12);

        $precio = (float)$s['precio'];
        $porcentaje = (float)$R['porcentajeAdelanto'];
        $reserva = [
            'codigo' => '', 'servicio' => $s['id'], 'servicioNombre' => $s['nombre'],
            'sintomas' => $sintomas, 'otroSintoma' => texto($in['otroSintoma'] ?? '', 500),
            'fecha' => $fecha, 'hora' => $hora, 'cliente' => $cliente, 'vehiculo' => $vehiculo,
            'precio' => $precio, 'porcentaje' => $porcentaje, 'adelanto' => round($precio * $porcentaje / 100, 2),
            'estado' => 'pendiente', 'pagado' => false, 'pagoReportado' => false, 'creada' => date('c'),
        ];
        $cli = clienteActual();
        if ($cli) $reserva['clienteId'] = $cli['codigo'];

        $resultado = conReservas(function (array &$l) use (&$reserva) {
            foreach ($l as $x) {
                if ($x['fecha'] === $reserva['fecha'] && $x['hora'] === $reserva['hora'] && $x['estado'] !== 'cancelada') return false;
            }
            $reserva['codigo'] = codigoNuevo('AM-', array_column($l, 'codigo'));
            $l[] = $reserva;
            return true;
        }, true);
        if (!$resultado) responder(['ok' => false, 'codigo' => 'ocupado', 'error' => 'Esa hora acaba de ser reservada por otra persona.'], 409);

        $horas = (int)$R['horasCancelacion'];
        $politica = '<p style="font-size:13px;color:#5b5670">Política: si cancelas o reprogramas con al menos ' . $horas
            . ' horas de anticipación, te devolvemos el adelanto o reprogramamos sin costo. Con menos de ' . $horas
            . ' horas el adelanto no es reembolsable, pero puedes usarlo una vez para reprogramar dentro de 30 días.</p>';
        $enlace = '<p><a href="' . htmlspecialchars(urlBase()) . '/reservar.html?codigo=' . $reserva['codigo'] . '">Ver mi reserva y pagar</a></p>';
        $taller = correoTaller();

        $okCliente = enviarCorreo($cliente['correo'], 'Reserva ' . $reserva['codigo'] . ' registrada',
            '<p>Hola ' . htmlspecialchars($cliente['nombre']) . ',</p><p>Registramos tu reserva. Para confirmarla, paga el adelanto de <b>'
            . dinero($reserva['adelanto']) . '</b>. El saldo se paga en el taller.</p>' . tablaReserva($reserva) . $enlace . $politica, $taller);
        if ($taller) {
            enviarCorreo($taller, 'Nueva reserva ' . $reserva['codigo'] . ' – ' . $fecha . ' ' . $hora,
                '<p>Nueva reserva recibida desde el sitio web.</p>' . tablaReserva($reserva)
                . '<p>Gestiónala en el panel: ' . htmlspecialchars(urlBase()) . '/admin.html</p>', $cliente['correo']);
        }
        responder(['ok' => true, 'reserva' => publica($reserva), 'metodos' => metodosPago(), 'correoEnviado' => $okCliente]);

    case 'estado':
    case 'pagado':
        verificarSesion($in);
        $codigo = texto($in['codigo'] ?? '', 12);
        $nuevo = texto($in['estado'] ?? '', 12);
        if ($accion === 'estado' && !in_array($nuevo, ['pendiente', 'confirmada', 'cancelada', 'completada'], true)) {
            responder(['ok' => false, 'error' => 'Estado no válido.'], 422);
        }
        $r = conReservas(function (array &$l) use ($codigo, $accion, $nuevo, $in) {
            foreach ($l as &$x) {
                if ($x['codigo'] !== $codigo) continue;
                if ($accion === 'estado') {
                    if ($nuevo !== 'cancelada' && $x['estado'] === 'cancelada') {
                        foreach ($l as $y) if ($y['codigo'] !== $codigo && $y['fecha'] === $x['fecha'] && $y['hora'] === $x['hora'] && $y['estado'] !== 'cancelada') return 'ocupada';
                    }
                    $x['estado'] = $nuevo;
                } else {
                    $x['pagado'] = (bool)($in['pagado'] ?? false);
                    if ($x['pagado'] && empty($x['pago'])) $x['pago'] = ['metodo' => 'manual', 'referencia' => 'Marcado en el panel', 'monto' => $x['adelanto'], 'fecha' => date('c')];
                    if ($x['pagado'] && $x['estado'] === 'pendiente') $x['estado'] = 'confirmada';
                }
                $x['actualizada'] = date('c');
                return $x;
            }
            return null;
        }, true);
        if ($r === 'ocupada') responder(['ok' => false, 'error' => 'Esa hora ya fue tomada por otra reserva.'], 409);
        if (!$r) responder(['ok' => false, 'error' => 'Reserva no encontrada.'], 404);

        $correo = false;
        $taller = correoTaller();
        if ($accion === 'estado' && $nuevo === 'confirmada') {
            $correo = enviarCorreo($r['cliente']['correo'], 'Reserva ' . $r['codigo'] . ' confirmada',
                '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', tu reserva está <b>confirmada</b>. ¡Te esperamos!</p>' . tablaReserva($r), $taller);
        } elseif ($accion === 'estado' && $nuevo === 'cancelada') {
            $correo = enviarCorreo($r['cliente']['correo'], 'Reserva ' . $r['codigo'] . ' cancelada',
                '<p>Hola ' . htmlspecialchars($r['cliente']['nombre']) . ', tu reserva fue <b>cancelada</b>. Si pagaste un adelanto, te contactaremos para la devolución o reprogramación según nuestra política.</p>' . tablaReserva($r), $taller);
        }
        responder(['ok' => true, 'correoEnviado' => $correo]);

    default:
        responder(['ok' => false, 'error' => 'Acción no válida.'], 400);
}
