<?php
declare(strict_types=1);

header("Content-Type: application/json");

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

if (isset($payload["username"], $payload["passwordHash"]) === false){
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "errType" => "InvalidSchema",
        "desc" => "Invalid request schema"
    ]);
    exit();
}

try{
    // make mysqli throw exceptions v.s. silent failures
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    // setting up db connection
    $dbUser = getenv("CONTACTS_APP_DB_USER");
    $dbPassword = getenv("CONTACTS_APP_DB_PASS");
    $dbName = getenv("CONTACTS_APP_DB_NAME");
    $db = new mysqli("localhost", $dbUser, $dbPassword, $dbName);
    $db->set_charset('utf8mb4');

} catch (Exception $e){
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "errType" => "ServerError",
        "desc" => "Failed to make DB connection"
    ]);
    exit();
}

$query = $db->prepare("SELECT ID, FirstName, LastName, Password FROM Users WHERE (Login=?) LIMIT 1");
$query->bind_param("s", $payload["username"]);


try {
    $query->execute();
} catch (mysqli_sql_exception $e){
    http_response_code(500);

    $err = $e->getTraceAsString();
    error_log("SQL query execution error: $err");

    echo json_encode([
        "status" => "error",
        "isAuthenticated" => false,
        "errType" => "UserAuthenticationError",
        "desc" => "Failed to authenticate user"
    ]);
}

$result = $query->get_result();

processQueryResult($result, $payload["passwordHash"], $payload["username"]);

$query->close();
$db->close();


function getRequestPayload(): array{
    return json_decode(file_get_contents("php://input"), true) ?? [];
}

function processQueryResult(mysqli_result $result, string $passHash, string $login){

    $row = $result->fetch_assoc();
    if ($row && hash_equals($row["Password"], $passHash)) { // user is auth'd
        http_response_code(200);
    // start a real login session and store user identity
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
    $_SESSION['user'] = [
        'id'        => (int)$row['ID'],
        'firstName' => $row['FirstName'],
  'lastName'  => $row['LastName'],
  'login'     => $login
];
        echo json_encode([
            "status" => "success",
            "isAuthenticated" => true,
            "firstName" => $row["FirstName"],
            "lastName" => $row["LastName"],
            "userId" => $row["ID"]
        ]);
    } elseif($row){ // user exists put password is incorrect
        http_response_code(200);

        echo json_encode([
            "status"=> "success",
            "isAuthenticated" => false,
            "userExists" => true
        ]);
    } else{ // sent user does not exist
        http_response_code(200);

        echo json_encode([
            "status" => "success",
            "isAuthenticated" => false,
            "userExists" => false
        ]);
    }
}