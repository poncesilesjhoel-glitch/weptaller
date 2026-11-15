<?php
/* Sirve las imágenes subidas desde el panel (productos, QR fijo). */
declare(strict_types=1);
define('SIN_JSON', true);
require __DIR__ . '/_lib.php';

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[a-f0-9]{20}\.(webp|jpg|png)$/', $id)) { http_response_code(404); exit; }

$tipos = ['webp' => 'image/webp', 'jpg' => 'image/jpeg', 'png' => 'image/png'];
$bin = null;
$pdo = bd();
if ($pdo) {
    $st = $pdo->prepare('SELECT datos FROM torke_imagenes WHERE id = ?');
    $st->execute([$id]);
    $v = $st->fetchColumn();
    if ($v !== false) $bin = is_resource($v) ? stream_get_contents($v) : (string)$v;
} elseif (is_file(DIR_DATOS . '/img/' . $id)) {
    $bin = file_get_contents(DIR_DATOS . '/img/' . $id);
}
if ($bin === null || $bin === false) { http_response_code(404); exit; }

header('Content-Type: ' . $tipos[pathinfo($id, PATHINFO_EXTENSION)]);
header('Cache-Control: public, max-age=31536000, immutable');
header('Content-Length: ' . strlen($bin));
echo $bin;
