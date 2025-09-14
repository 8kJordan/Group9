<?php
declare(strict_types=1);
header('Content-Type: application/json');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// method gate
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidRequest",
        "desc"    => "Only POST allowed"
    ]);
    exit();
}

// parse payload
$raw = file_get_contents("php://input");
$payload = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidJson",
        "desc"    => "Invalid payload sent"
    ]);
    exit();
}

if (!isset($payload["userId"])) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidSchema",
        "desc"    => "Missing userId"
    ]);
    exit();
}

$userId = (int)$payload["userId"];
$search = trim((string)($payload["search"] ?? ""));

// DB connect
try {
    $db = new mysqli(
        "localhost",
        getenv("CONTACTS_APP_DB_USER"),
        getenv("CONTACTS_APP_DB_PASS"),
        getenv("CONTACTS_APP_DB_NAME")
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "errType" => "ServerError",
        "desc"    => "Failed to make DB connection"
    ]);
    exit();
}

// query
if ($search === "") {
    $stmt = $db->prepare(
        "SELECT ID AS id,
                FirstName AS firstName,
                LastName  AS lastName,
                Phone     AS phone,
                Email     AS email
         FROM Contacts
         WHERE UserId = ?
         ORDER BY LastName, FirstName"
    );
    $stmt->bind_param("i", $userId);
} else {
    $like = "%".$search."%";
    $stmt = $db->prepare(
        "SELECT ID AS id,
                FirstName AS firstName,
                LastName  AS lastName,
                Phone     AS phone,
                Email     AS email
         FROM Contacts
         WHERE UserId = ?
           AND (FirstName LIKE ? OR LastName LIKE ? OR Phone LIKE ? OR Email LIKE ?)
         ORDER BY LastName, FirstName"
    );
    $stmt->bind_param("issss", $userId, $like, $like, $like, $like);
}

$stmt->execute();
$res = $stmt->get_result();

$rows = [];
while ($row = $res->fetch_assoc()) {
    $rows[] = $row;
}

echo json_encode([
    "status"  => "success",
    "results" => $rows
]);

$stmt->close();
$db->close();
