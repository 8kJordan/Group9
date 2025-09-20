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

/* ================== Pagination state ================== */
const pager = {
  page: 1,          // 1-based index
  pageSize: 20,     // match api default
  lastQuery: "",    // mirrors #search input
  loading: false
};

// Build the request body; server expects offset/limit.
function buildSearchPayload(extra = {}) {
  const u = requireUser(); if (!u) return {};
  const offset = (pager.page - 1) * pager.pageSize;
  const limit  = pager.pageSize;

  return {
    userId: u.id,
    search: pager.lastQuery,
    offset, // typical PHP expects these
    limit,
    ...extra
  };
}

// Buttons: keep Next enabled for now; Prev only when page > 1.
function updatePagerButtons(hasPrev /* ignore hasNext for now */) {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = false; // always allow Next for now
}
function setPagerButtonsDisabled(disabled) {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = disabled || pager.page <= 1;
  if (nextBtn) nextBtn.disabled = !!disabled; // re-enable on finish
}

/* --- Button handlers with logs (verify in DevTools Console) --- */
function onPrevClick(e){
  if (e) e.preventDefault();
  console.log('[pager] Prev click, page=', pager.page, '->', Math.max(1, pager.page - 1));
  if (pager.page > 1) {
    pager.page -= 1;
    loadContactsForCurrentPage();
  }
}
function onNextClick(e){
  if (e) e.preventDefault();
  console.log('[pager] Next click, page=', pager.page, '->', pager.page + 1);
  pager.page += 1;
  loadContactsForCurrentPage();
}

/* Fetch & render current page */
async function loadContactsForCurrentPage(extraBody = {}) {
  if (pager.loading) return;
  pager.loading = true;
  setPagerButtonsDisabled(true);

  // debug: confirm payload sent
  const payload = buildSearchPayload(extraBody);
  console.log('[pager] load page', pager.page, 'payload:', payload);

  try {
    const res = await api('SearchContacts.php', payload);

    if (res.status !== 'success') {
      renderResults([]);
      document.querySelector('#resultsBody').innerHTML =
        `<tr><td colspan="5" class="muted">${esc(res.desc || 'Search failed')}</td></tr>`;
      updatePagerButtons(pager.page > 1);
      return;
    }

    const rows = Array.isArray(res.results) ? res.results
               : Array.isArray(res.contacts) ? res.contacts
               : Array.isArray(res) ? res
               : [];

    console.log('[pager] results length=', rows.length);
    renderResults(rows);

    // Heuristic: keep Next enabled; Prev only if page > 1
    updatePagerButtons(pager.page > 1);
  } catch (err) {
    console.error('Failed to load contacts:', err);
    document.querySelector('#resultsBody').innerHTML =
      '<tr><td colspan="5" class="muted">Network error.</td></tr>';
    updatePagerButtons(pager.page > 1);
  } finally {
    pager.loading = false;
    setPagerButtonsDisabled(false);
  }
}

/* ================== Lifecycle ================== */
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

  // Direct binding (if buttons exist at load time)
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.addEventListener('click', onPrevClick);
  if (nextBtn) nextBtn.addEventListener('click', onNextClick);

  // Fallback: event delegation (handles late/rehydrated DOM)
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'prevBtn') onPrevClick(e);
    if (t.id === 'nextBtn') onNextClick(e);
  });

  // Initial search & load page 1 (resets pager via event call below if form submit)
  searchContacts(); // keeps your existing entry point
});

// Fires when page is restored from Back/Forward Cache
window.addEventListener('pageshow', (e) => {
  enforceAuth();
});

window.logout = logout; //make global

/* ================== CRUD & UI ================== */
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
    // Stay on the same page after add/update
    await loadContactsForCurrentPage();
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
    editBtn.className = 'btn'; editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      editContact(r);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      deleteContact(r.id);
    });
    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  });
}

async function searchContacts(e){
  if(e) e.preventDefault();
  const u = requireUser(); if(!u) return;

  const term = document.querySelector('#search') ? document.querySelector('#search').value.trim() : '';
  // When user triggers a fresh search (there is an event), go back to page 1
  if (e) pager.page = 1;
  pager.lastQuery = term;

  await loadContactsForCurrentPage();
}

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
    await loadContactsForCurrentPage();
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
