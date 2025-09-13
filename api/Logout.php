<?php
declare(strict_types=1);
header("Content-Type: application/json");

// start session with same cookie policy
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => !empty($_SERVER['HTTPS']),
  'httponly' => true,
  'samesite' => 'Lax'
]);
session_start();

// clear session array
$_SESSION = [];

// remove session cookie if present
if (ini_get('session.use_cookies')) {
  $p = session_get_cookie_params();
  setcookie(session_name(), '', time()-42000, $p['path'], $p['domain'] ?? '', $p['secure'] ?? false, $p['httponly'] ?? true);
}

session_destroy();

echo json_encode(["status"=>"success","desc"=>"Logged out"]);
