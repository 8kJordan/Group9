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
        "desc"    => "Invalid JSON payload"
    ]);
    exit();
}

if (!isset($payload["userId"], $payload["contactId"])) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidSchema",
        "desc"    => "Missing userId or contactId"
    ]);
    exit();
}

$userId    = (int)$payload["userId"];
$contactId = (int)$payload["contactId"];

//DB connect
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
        "desc"    => "Failed to connect to database"
    ]);
    exit();
}

try {
    // Scoped delete: only delete if owned by this user
    $stmt = $db->prepare("DELETE FROM Contacts WHERE ID = ? AND UserId = ?");
    $stmt->bind_param("ii", $contactId, $userId);
    $stmt->execute();

    if ($stmt->affected_rows > 0) {
        http_response_code(200);
        echo json_encode([
            "status"        => "success",
            "contactDeleted"=> true,
            "id"            => $contactId
        ]);
    } else {
        http_response_code(400);
        echo json_encode([
            "status"        => "error",
            "contactDeleted"=> false,
            "errType"       => "NonExistentContactError",
            "desc"          => "Contact not found for this user"
        ]);
    }

    $stmt->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"        => "error",
        "contactDeleted"=> false,
        "errType"       => "ContactDeletionError",
        "desc"          => "Failed to delete contact"
    ]);
} finally {
    $db->close();
}
