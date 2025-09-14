<?php
declare(strict_types=1);

header('Content-Type: application/json');

$method = $_SERVER["REQUEST_METHOD"];

// Make sure the request method is GET
if ($method !== "GET") {
    $data = [
        "status" => "error",
        "errType" => "InvalidRequest",
        "desc" => "Method $method is invalid"
    ];

    http_response_code(400);
    echo json_encode($data);
    exit();
}

// Get the payload for query params 
$payload = getRequestPayload();

$userId = filter_input(INPUT_GET, 'userId', FILTER_VALIDATE_INT);
if ($userId === null) {
    http_response_code(400); // Bad Request
    echo json_encode([
        "status" => "error",
        "errType" => "InvalidInputData",
        "desc" => "A valid userId is required."
    ]);
    exit();
}