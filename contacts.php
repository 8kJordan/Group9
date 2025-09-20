<?php
declare(strict_types=1);
session_start();

// prevent serving cached copies of a protected page
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if (empty($_SESSION['user']['id'])) {
  header('Location: /');
  exit;
}
$user = $_SESSION['user'];
?>

<!doctype html>
<html lang="en" data-bs-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">

  <!-- Bootstrap CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <!-- Bootstrap Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
  <!-- Theme overrides -->
  <link rel="stylesheet" href="css/theme.css?v=1">

<script>
  (function(){
    try{
      if(!localStorage.getItem('cmUser')){
        const u = <?php echo json_encode([
          'id'=>$user['id'],
          'firstName'=>$user['firstName'] ?? '',
          'lastName'=>$user['lastName'] ?? '',
          'username'=>$user['username'] ?? ''
        ], JSON_UNESCAPED_SLASHES); ?>;
        if (u && u.id) localStorage.setItem('cmUser', JSON.stringify(u));
      }
    }catch(e){}
  })();
</script>

  <!-- EARLY AUTH GUARD: block cached renders before JS loads -->
  <script>
    (function () {
      try {
        if (!localStorage.getItem('cmUser')) {
          // no login -> bounce to root/login
          window.location.replace('/');
        }
      } catch (_) {
        window.location.replace('/');
      }
    })();
  </script>

<script>
  if (location.hostname === 'www.group9-contacts.com') {
    location.replace('https://group9-contacts.com' + location.pathname + location.search + location.hash);
  }
</script>

<script defer src="/js/contacts.js?v=7"></script>

  <!-- JS Script -->

</head>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const nb = document.querySelector('.navbar .container');
    let small = false;
    window.addEventListener('scroll', () => {
      const s = window.scrollY > 8;
      if (s !== small) {
        small = s;
        if (s) {
          nb.style.padding = '.25rem .6rem';
          nb.style.borderRadius = '8px';
          nb.style.backdropFilter = 'blur(4px)';
          nb.style.boxShadow = '0 4px 12px rgba(0,0,0,.2)';
        } else {
          nb.style.padding = '.5rem .85rem';
          nb.style.borderRadius = '14px';
          nb.style.backdropFilter = 'blur(8px)';
          nb.style.boxShadow = '0 6px 18px rgba(0,0,0,.12)';
        }
      }
    });
  });
</script>

<body>
  <nav class="navbar bg-body-tertiary">
    <div class="container d-flex justify-content-between align-items-center">
      <a class="navbar-brand d-flex align-items-center gap-2" >
        <i class="bi bi-journal-bookmark"></i> Contact Manager
      </a>
      <div class="d-flex align-items-center gap-3">
        <span id="who" class="text-secondary"></span>
        <a id="logoutBtn" href="/" role="button"
           class="btn btn-outline-danger btn-sm">
          <i class="bi bi-box-arrow-right"></i> Log out
        </a>
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- Add / Edit -->
    <section class="mb-4">
      <div class="card">
        <div class="card-body">
          <h2 class="h5">Add / Edit Contact Version 10:53</h2>
          <form onsubmit="saveContact(event)" class="row g-3 mt-1">
            <input type="hidden" id="contactId">
            <div class="col-md-6">
              <label for="cFirst" class="form-label">First name</label>
              <input id="cFirst" class="form-control" placeholder="first name" required>
            </div>
            <div class="col-md-6">
              <label for="cLast" class="form-label">Last name</label>
              <input id="cLast" class="form-control" placeholder="last name" required>
            </div>
            <div class="col-md-6">
              <label for="cPhone" class="form-label">Phone</label>
              <input id="cPhone" class="form-control" placeholder="(optional)">
            </div>
            <div class="col-md-6">
              <label for="cEmail" class="form-label">Email</label>
              <input id="cEmail" class="form-control" placeholder="(optional)">
            </div>
            <div class="col-12 d-flex gap-2">
              <button id="saveBtn" class="btn btn-outline-green">
                <i class="bi bi-save me-1"></i> Save
              </button>
              <button type="button" class="btn btn-outline-grey" onclick="resetForm()">
                <i class="bi bi-eraser me-1"></i> Clear
              </button>
            </div>
          </form>
          <div id="saveOut" class="form-text mt-2"></div>
        </div>
      </div>
    </section>

    <!-- Search + Results -->
<section>
  <div class="card">
    <div class="card-body">

      <!-- Header row -->
<div class="d-flex align-items-center justify-content-between mb-3">
  <h2 class="h5 m-0">Search</h2>
</div>

<!-- Search bar -->
<form onsubmit="searchContacts(event)" class="mb-3">
  <div class="input-group">
    <input id="search" class="form-control" placeholder="name, phone, or email">
    <button class="btn btn-outline-darkblue" type="submit">
      <i class="bi bi-search"></i> Search
    </button>
  </div>
</form>

      <!-- Table -->
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>First</th>
              <th>Last</th>
              <th>Phone</th>
              <th>Email</th>
              <th style="width:160px">Actions</th>
            </tr>
          </thead>
          <tbody id="resultsBody">
            <tr><td colspan="5" class="text-secondary">(no results)</td></tr>
          </tbody>
        </table>
<!-- Pagination row -->
<div class="d-flex align-items-center gap-2 mt-3">
  <button id="prevBtn" type="button" class="btn btn-outline-secondary">Prev</button>
  <button id="nextBtn" type="button" class="btn btn-outline-secondary">Next</button>
  <span id="pageInfo" class="ms-2 text-muted"></span>
</div>
</div>
      </div>
    </div>
  </div>
</section>
  </main>

  <!-- Delete confirm modal -->
  <div class="modal fade" id="confirmDeleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Delete contact</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          Are you sure you want to delete this contact?
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-danger" id="confirmDeleteBtn">
            <i class="bi bi-trash"></i> Delete
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast container -->
  <div class="position-fixed bottom-0 end-0 p-3" style="z-index: 1100;">
    <div id="toast" class="toast align-items-center text-bg-primary border-0" role="status" aria-live="polite" aria-atomic="true" data-bs-delay="2000">
      <div class="d-flex">
        <div class="toast-body"></div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  </div>

  <!-- Bootstrap JS bundle -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    function toast(msg, variant){
      const t = document.getElementById('toast');
      t.className = 'toast align-items-center text-bg-' + (variant||'primary') + ' border-0';
      t.querySelector('.toast-body').textContent = msg;
      new bootstrap.Toast(t).show();
    }
  </script>

<!-- Shrink navbar script -->
  <script>
  const nb = document.querySelector('.navbar .container');
  let small = false;
  window.addEventListener('scroll', () => {
    const s = window.scrollY > 8;
    if (s !== small) {
      small = s;
      nb.style.padding = s ? '.35rem .75rem' : '.5rem .85rem';
      nb.style.boxShadow = s ? '0 8px 20px rgba(0,0,0,.16)' : '0 6px 18px rgba(0,0,0,.12)';
    }
  });
</script>

<!-- ADDITIVE: ensure logout calls server, clears client, then redirects -->
<script>
document.addEventListener('DOMContentLoaded', function(){
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async function(e){
    e.preventDefault();
    try { await fetch('/api/Logout.php', { method:'POST' }); } catch(e) {}
    try { localStorage.removeItem('cmUser'); } catch(e) {}
    window.location.replace('/');
  });
});
</script>
</body>
</html>

