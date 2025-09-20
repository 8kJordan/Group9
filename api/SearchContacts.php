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
// check user id exists 
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

// make sure the query wont cook the DB 
if (strlen($search) > 100) {
    http_response_code(400);
    echo json_encode([
        "status"  => "error",
        "errType" => "InvalidInput",
        "desc"    => "Search term too long"
    ]);
    exit();
}
// pagination params
$page  = isset($payload["page"])  ? (int)$payload["page"]  : 1;
$limit = isset($payload["limit"]) ? (int)$payload["limit"] : 5;

// definitely don't allow division by zero or invalids
if ($page < 1)  { $page = 1; }
// keep limit reasonable (backstop to avoid giant pulls)
if ($limit < 1) { $limit = 5; }
if ($limit > 100) { $limit = 100; }

// calc pagination
$offset = ($page - 1) * $limit;  
$actualLimit = $limit + 1;

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
         ORDER BY LastName, FirstName, ID
         LIMIT ? OFFSET ?"
    );
    $stmt->bind_param("iii", $userId, $actualLimit, $offset);
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
         ORDER BY LastName, FirstName, ID
         LIMIT ? OFFSET ?"
    );
    $stmt->bind_param("issssii", $userId, $like, $like, $like, $like, $actualLimit, $offset);
}

//module for page counter
$totalCount = 0;
if ($search === "") {
    $stmtCount = $db->prepare(
        "SELECT COUNT(*) AS cnt
         FROM Contacts
         WHERE UserId = ?"
    );
    $stmtCount->bind_param("i", $userId);
} else {
    $likeCount = "%".$search."%";
    $stmtCount = $db->prepare(
        "SELECT COUNT(*) AS cnt
         FROM Contacts
         WHERE UserId = ?
           AND (FirstName LIKE ? OR LastName LIKE ? OR Phone LIKE ? OR Email LIKE ?)"
    );
    $stmtCount->bind_param("issss", $userId, $likeCount, $likeCount, $likeCount, $likeCount);
}
$stmtCount->execute();
$resCount = $stmtCount->get_result();
if ($rowCnt = $resCount->fetch_assoc()) {
    $totalCount = (int)$rowCnt['cnt'];
}
$stmtCount->close();

try {
    $stmt->execute();
    $res = $stmt->get_result();

   $rows = [];
    while ($row = $res->fetch_assoc()) {
        $rows[] = $row;
    }

    // check if we get more than one page of results, remove the last one if so
    $hasNextPage = count($rows) > $limit;
    if ($hasNextPage) {
        array_pop($rows);
    }

    $totalPages = max(1, (int)ceil($totalCount / max(1, $limit)));

echo json_encode([
    "status"  => "success",
    "results" => $rows,
    "pagination" => [
        "currentPage" => $page,
        "hasNextPage" => $hasNextPage,
        "totalCount"  => $totalCount,
        "totalPages"  => $totalPages
    ]
]);

} catch (mysqli_sql_exception $e) {
    // uh oh something went wrong
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "errType" => "DatabaseError", 
        "desc" => "Search query failed"
    ]);
    error_log("Search query error: " . $e->getMessage());
}


$stmt->close();
$db->close();