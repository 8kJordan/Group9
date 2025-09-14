<?php
declare(strict_types=1);

header('Content-Type: application/json');

$method = $_SERVER["REQUEST_METHOD"];

if ($method !== "POST"){
    $data = [
        "status" => "error",
        "errType" => "InvalidRequest",
        "desc" => "Method $method is invalid"
    ];

    http_response_code(400);
    echo json_encode($data);
    exit();
}

// validating payload
$payload = getRequestPayload();

if (json_last_error() != JSON_ERROR_NONE){
    http_response_code(400);

    echo json_encode([
        "status" => "error",
        "errType" => "InvalidJson",
        "desc" => "Invalid payload sent"
    ]);
    exit();
}

if (isset($payload["firstName"],
        $payload["lastName"],
        $payload["phone"],
        $payload["email"],
        $payload["userId"]) === false){
    http_response_code(400);
    echo json_encode([
        "status" => "ERROR",
        "errType" => "InvalidSchema",
        "desc" => "Invalid request schema"
    ]);
    exit();
}

try{
    // setting up db connection
    $dbUser = getenv("CONTACTS_APP_DB_USER");
    $dbPassword = getenv("CONTACTS_APP_DB_PASS");
    $dbName = getenv("CONTACTS_APP_DB_NAME");
    $db = new mysqli("localhost", $dbUser, $dbPassword, $dbName);

} catch (Exception $e){
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "errType" => "ServerError",
        "desc" => "Failed to make DB connection"
    ]);
    exit();
}

# if the contact we want to create already exists for the given user, return 400 error
if (contactExists($db, $payload)) {
    http_response_code(400);

    echo json_encode([
        "status" => "error",
        "contactCreated" => false,
        "errType" => "ContactExistsError",
        "desc" => "This contact already exists"
    ]);
    exit();
}


$query = $db->prepare("INSERT INTO Contacts (FirstName, LastName, Phone, Email, UserId) VALUES (?,?,?,?,?)");

$query->bind_param("ssssi",
    $payload["firstName"],
    $payload["lastName"],
    $payload["phone"],
    $payload["email"],
    $payload["userId"]);

# performing insert contact operation
try{
    $query->execute();

    http_response_code(200);

    echo json_encode([
    "status" => "success",
    "contactCreated" => true,
    "id" => $db->insert_id
    ]);

} catch (Exception $e){
    $errMessage = $e->getMessage();
    $errCode = $e->getCode();

    if ($errCode == 1452){ # foreign key violation, attempted to bind contact to non-existent userId
        http_response_code(400);

        echo json_encode([
            "status" => "error",
            "contactCreated" => false,
            "errType" => "NonexistentUserIDError",
            "desc" => "The specified user ID does not exist"
        ]);
    } elseif ($errCode == 1062){ # duplicate unique entry error TODO this would be the conditional that checks for duplicate phone or email from a DB err
        $userId = $payload["userId"];
        http_response_code(400);

        echo json_encode([
            "status" => "error",
            "contactCreated" => false,
            "errType" => "ContactExistsError",
            "desc" => "The specified contact already exists for user $userId"
        ]);
    } else{
        http_response_code(500);

        echo json_encode([
            "status" => "error",
            "contactCreated" => false,
            "errType" => "ContactCreationError",
            "desc" => "Failed to to create contact"
        ]);
    }
} finally {
    $db->close();
    $query->close();
}

function contactExists(mysqli $conn, array $payload): bool{
    # gathers count of rows of contacts that meet the given conditions
    $query = $conn->prepare("SELECT COUNT(*) AS cnt FROM Contacts WHERE ((Email = ? OR Phone = ?)AND UserId = ?)");
    $query->bind_param("ssi", $payload["email"], $payload["phone"], $payload["userId"]);

    $query->execute();
    $result = $query->get_result();
    $row = $result->fetch_assoc();
    $returnValue = (intval($row['cnt']) > 0);


    $query->close();
    return $returnValue;
}

function getRequestPayload(): array|null{
    return json_decode(file_get_contents("php://input"), true);
}

# TODO what we need to do is have one table that enforces per user email and phone number uniqueness, don't know if we really want this or not