<?php
/* Formulario de contacto: envía el mensaje al correo del taller. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
if (!$CONFIG['correo_taller']) responder(['ok' => false, 'error' => 'El correo del taller no está configurado.'], 500);

$in = entrada();
$d = [
    'nombre' => texto($in['nombre'] ?? '', 80), 'telefono' => texto($in['telefono'] ?? '', 20),
    'correo' => texto($in['correo'] ?? '', 120), 'asunto' => texto($in['asunto'] ?? 'Consulta', 80),
    'mensaje' => mb_substr(trim((string)($in['mensaje'] ?? '')), 0, 2000),
];
if (mb_strlen($d['nombre']) < 2 || !filter_var($d['correo'], FILTER_VALIDATE_EMAIL) || mb_strlen($d['mensaje']) < 5) {
    responder(['ok' => false, 'error' => 'Completa nombre, correo válido y mensaje.'], 422);
}

$h = fn($v) => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
$ok = enviarCorreo($CONFIG['correo_taller'], 'Contacto web: ' . $d['asunto'],
    '<p><b>Nombre:</b> ' . $h($d['nombre']) . '<br><b>Teléfono:</b> ' . $h($d['telefono']) . '<br><b>Correo:</b> ' . $h($d['correo'])
    . '<br><b>Asunto:</b> ' . $h($d['asunto']) . '</p><p>' . nl2br($h($d['mensaje'])) . '</p>', $d['correo']);

responder($ok ? ['ok' => true] : ['ok' => false, 'error' => 'No se pudo enviar el correo. Escríbenos por WhatsApp.'], $ok ? 200 : 500);
