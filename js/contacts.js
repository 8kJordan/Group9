let currentPage = 1;
let hasNextPage = false;
let currentSearchTerm = '';

async function api(path, body){
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body||{})
  });
  let data;
  try { data = await r.json(); }
  catch { data = { status:'ERROR', desc:'Non-JSON response' }; }
  return data;
}

let user = null;

function getUser(){
  try {
    const raw = localStorage.getItem('cmUser');
    if (!raw) { user = null; return null; }
    user = JSON.parse(raw);
    return user;
  } catch {
    user = null;
    return null;
  }
}

function requireUser(){
  const u = getUser();
  if(!u || !u.id){
    window.location.href = '/';
    return null;
  }
  return u;
}

async function logout(){
  try { await fetch('/api/Logout.php', { method:'POST' }); } catch {}
  localStorage.removeItem('cmUser'); // keep client state clean for UI
  window.location.replace('/');      // replace() so Back won't return to contacts
}

function enforceAuth(){
  const u = getUser();
  if (!u || !u.id) {
    // replace() so Back cannot return to contacts.html
    window.location.replace('/');
    return false;
  }
  return true;
}

window.addEventListener('DOMContentLoaded', () => {
  if (!enforceAuth()) return;

  const u = getUser();
  const who = document.querySelector('#who');
  if (who) who.textContent = `Signed in as ${u.firstName} ${u.lastName}`;

  const lb = document.getElementById('logoutBtn');
  if (lb) lb.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  searchContacts();
});

// Fires when page is restored from Back/Forward Cache
window.addEventListener('pageshow', (e) => {
  // On bfcache restore, re-enforce auth
  enforceAuth();
});

window.logout = logout; //make global

function resetForm(){
  document.querySelector('#contactId').value = '';
  document.querySelector('#cFirst').value = '';
  document.querySelector('#cLast').value = '';
  document.querySelector('#cPhone').value = '';
  document.querySelector('#cEmail').value = '';
  document.querySelector('#saveOut').textContent = '';
}

async function saveContact(e){
  if(e) e.preventDefault();
  const u = requireUser(); if(!u) return;

  const id = Number(document.querySelector('#contactId').value || 0);
  const firstName = document.querySelector('#cFirst').value.trim();
  const lastName  = document.querySelector('#cLast').value.trim();
  const phone     = document.querySelector('#cPhone').value.trim();
  const email     = document.querySelector('#cEmail').value.trim();

  const out = document.querySelector('#saveOut');
  if(!firstName || !lastName){
    out.textContent = 'first/last required';
    return;
  }

  try{
    let res;
    if(id > 0){
      res = await api('UpdateContact.php', { userId: u.id, contactId: id, firstName, lastName, phone, email });
    }else{
      res = await api('AddContact.php', { userId: u.id, firstName, lastName, phone, email });
    }
    if (res.status !== 'success') {
    out.textContent = res.desc || 'Error';
    return;
    }
    out.textContent = id ? 'Contact updated.' : `Added contact #${res.id ?? res.contactId ?? ''}.`;

    resetForm();
    await searchContacts();
  }catch(err){
    out.textContent = 'Network error.';
  }
}

function esc(s){
  return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function renderResults(rows){
  const tbody = document.querySelector('#resultsBody');
  tbody.innerHTML = '';
  if(!rows || !rows.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.className='muted'; td.textContent='(no results)';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;

    const tdFirst = document.createElement('td'); tdFirst.textContent = r.firstName || ''; tr.appendChild(tdFirst);
    const tdLast  = document.createElement('td'); tdLast.textContent  = r.lastName || '';  tr.appendChild(tdLast);
    const tdPhone = document.createElement('td'); tdPhone.textContent = r.phone || '';    tr.appendChild(tdPhone);
    const tdEmail = document.createElement('td'); tdEmail.textContent = r.email || '';    tr.appendChild(tdEmail);

    const tdAct = document.createElement('td');

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outlne-primary me-2';  
    editBtn.innerHTML = '<i class="bi bi-pencil-square me-1"></i>Edit'; 
    editBtn.addEventListener('click', () => {
      editContact(r);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-outline-danger btn-sm';          
    delBtn.innerHTML = '<i class="bi bi-trash me-1"></i>Delete';
    delBtn.addEventListener('click', () => {
      deleteContact(r.id);
    });

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  });
}


async function searchContacts(e, page = 1){
  if (e) e.preventDefault();
  const u = requireUser(); if (!u) return;

  const term = document.querySelector('#search').value.trim();
  currentSearchTerm = term;

  // clamp page to 1+
  if (typeof page === 'number' && !Number.isNaN(page)) {
    currentPage = Math.max(1, page);
  }

  console.log("Searching contacts, page:", currentPage); // Debug

  try{
    const res = await api('SearchContacts.php', { 
      userId: u.id, 
      search: term,
      page:  currentPage,
      limit: 5
    });

    console.log("API response:", res); // Debug

    if (res.status !== 'success') {
      renderResults([]);
      document.querySelector('#resultsBody').innerHTML =
        `<tr><td colspan="5" class="muted">${esc(res.desc || 'Search failed')}</td></tr>`;
      hasNextPage = false;
      updatePaginationUI(1); // fallback label: Page (current/1)
      return;
    }

    const rows = Array.isArray(res.results) ? res.results : [];
    renderResults(rows);

    let totalPages = 1;
    if (res.pagination && typeof res.pagination.totalPages === 'number') {
      totalPages = Math.max(1, res.pagination.totalPages);
    } else if (res.pagination && typeof res.pagination.totalCount === 'number') {
      totalPages = Math.max(1, Math.ceil(res.pagination.totalCount / 5));
    } else {
      // Fallback: infer whether another page likely exists
      totalPages = rows.length === 5 ? currentPage + 1 : currentPage;
    }

    // set hasNextPage from totals (preferred) or server flag
    if (res.pagination && typeof res.pagination.hasNextPage === 'boolean') {
      hasNextPage = res.pagination.hasNextPage;
    } else {
      hasNextPage = currentPage < totalPages;
    }

    console.log("Has next page:", hasNextPage, "Total pages:", totalPages); // Debug

    // Show "Page (X/Y)"
    updatePaginationUI(totalPages);

  } catch(err){
    console.error("Search error:", err); // Debug
    document.querySelector('#resultsBody').innerHTML =
      '<tr><td colspan="5" class="muted">Network error.</td></tr>';
    hasNextPage = false;
    updatePaginationUI(1);
  }
}

function updatePaginationUI(totalPages) { 
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');
  
  console.log("UI elements:", {prevBtn, nextBtn, pageInfo}); // Debug log
  
  if (prevBtn && nextBtn && pageInfo) {
    // Enable/disable buttons
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = !hasNextPage;

    // Show "Page (X/Y)"
    if (typeof totalPages === 'number' && totalPages > 0) {
      pageInfo.textContent = `Page (${currentPage}/${totalPages})`;
    } else {
      pageInfo.textContent = `Page ${currentPage}`;
    }

    console.log("Updated page info to:", pageInfo.textContent); // Debug log
  } else {
    console.error("Could not find pagination elements"); // Debug log
  }
}


function nextPage() {
  console.log("Next button clicked, hasNextPage:", hasNextPage); // Debug log
  if (hasNextPage) {
    searchContacts(null, currentPage + 1);
  }
}

function prevPage() {
  console.log("Prev button clicked, currentPage:", currentPage); // Debug log
  if (currentPage > 1) {
    searchContacts(null, currentPage - 1);
  }
}

// Initialize event listeners when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  if (!enforceAuth()) return;

  const u = getUser();
  const who = document.querySelector('#who');
  if (who) who.textContent = `Signed in as ${u.firstName} ${u.lastName}`;

  const lb = document.getElementById('logoutBtn');
  if (lb) lb.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  // Add event listeners to pagination buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  console.log("DOM loaded, buttons:", {prevBtn, nextBtn}); // Debug log
  
  if (prevBtn) {
    prevBtn.addEventListener('click', prevPage);
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', nextPage);
  }

  searchContacts(null, 1);
});

function editContact(data){
  document.querySelector('#contactId').value = data.id || '';
  document.querySelector('#cFirst').value = data.firstName || '';
  document.querySelector('#cLast').value  = data.lastName || '';
  document.querySelector('#cPhone').value = data.phone || '';
  document.querySelector('#cEmail').value = data.email || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteContact(id){
  const u = requireUser(); if(!u) return;
  if(!confirm('Delete this contact?')) return;
  try{
  const res = await api('DeleteContact.php', { userId: u.id, contactId: id });
  if (res.status !== 'success') { alert(res.desc || 'Delete failed.'); return; }
  await searchContacts();
  }catch(err){
    alert('Network error.');
  }

}
//ensure globals
window.saveContact    = saveContact;
window.searchContacts = searchContacts;
window.deleteContact  = deleteContact;
window.resetForm      = resetForm;
window.logout         = logout;
