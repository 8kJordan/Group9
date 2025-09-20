<?php
declare(strict_types=1);
header('Content-Type: application/json');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// method gate
if (($method = $_SERVER["REQUEST_METHOD"]) !== "POST") {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidRequest",
        "desc"    => "Method $method is Invalid"
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

// validate schema
$required = ["userId","contactId","firstName","lastName","phone","email"];
foreach ($required as $k) {
    if (!array_key_exists($k, $payload)) {
        http_response_code(400);
        echo json_encode([
            "status"  => "error",
            "errType" => "InvalidSchema",
            "desc"    => "Missing field: $k"
        ]);
        exit();
    }
}

$userId    = filter_var($payload["userId"], FILTER_VALIDATE_INT);
$contactId = filter_var($payload["contactId"], FILTER_VALIDATE_INT);
$firstName = trim((string)$payload["firstName"]);
$lastName  = trim((string)$payload["lastName"]);
$phone     = trim((string)$payload["phone"]);
$email     = trim((string)$payload["email"]);

if($userId === false || $contactId === false) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidSchema",
        "desc"    => "Invalid request schema"
    ]);
    exit();
}

if ($firstName === "" || $lastName === "") {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidSchema",
        "desc"    => "Invalid request schema"
    ]);
    exit();
}

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

try {
    // ensure contact exists and is owned by this user
    $stmt = $db->prepare("SELECT ID FROM Contacts WHERE ID = ? AND UserId = ?");
    $stmt->bind_param("ii", $contactId, $userId);
    $stmt->execute();
    $exists = $stmt->get_result()->fetch_row();
    $stmt->close();

    if (!$exists) {
        http_response_code(400);
        echo json_encode([
            "status"  => "error",
            "errType" => "NonExistentContactError",
            "desc"    => "Contact not found for this user"
        ]);
        $db->close();
        exit();
    }

    // duplicate check TODO do we want to allow duplicates or not??
    $stmt = $db->prepare(
        "SELECT COUNT(*) AS cnt
         FROM Contacts
         WHERE UserId = ?
           AND ID <> ?
           AND (Email = ? OR Phone = ?)"
    );
    $stmt->bind_param("iiss", $userId, $contactId, $email, $phone);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (intval($row["cnt"]) > 0) {
        http_response_code(400);
        echo json_encode([
            "status"  => "error",
            "errType" => "ContactExistsError",
            "desc"    => "Another contact with this email or phone already exists"
        ]);
        $db->close();
        exit();
    }

    //update
    $stmt = $db->prepare(
        "UPDATE Contacts
         SET FirstName = ?, LastName = ?, Phone = ?, Email = ?
         WHERE ID = ? AND UserId = ?"
    );
    $stmt->bind_param("ssssii", $firstName, $lastName, $phone, $email, $contactId, $userId);
    $stmt->execute();
    $stmt->close();

    // even if no rows changed
    echo json_encode([
        "status"        => "success",
        "contactUpdated"=> true,
        "id"            => $contactId
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "errType" => "ContactUpdateError",
        "desc"    => "Failed to update contact"
    ]);
} finally {
    $db->close();
}
