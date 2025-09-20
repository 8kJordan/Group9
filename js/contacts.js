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

/* ========= Pagination: lightweight client state ========= */
const pager = {
  page: 1,          // 1-based index
  pageSize: 10,     // adjust if your API expects a different size
  lastQuery: "",    // mirrors #search input
  loading: false
};

// Build the request body, keeping keys simple & stable.
// If your PHP expects offset/limit, switch to those in this function only.
function buildSearchPayload(extra = {}) {
  const u = requireUser(); if (!u) return {};
  return {
    userId: u.id,
    search: pager.lastQuery,
    page: pager.page,
    pageSize: pager.pageSize,
    ...extra
  };
}

// Enable/disable prev/next buttons
function updatePagerButtons(hasPrev, hasNext) {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = !hasNext;
}
function setPagerButtonsDisabled(disabled) {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = disabled || pager.page <= 1;
  if (nextBtn) nextBtn.disabled = disabled;
}

// Fetch and render contacts for current pager state
async function loadContactsForCurrentPage(extraBody = {}) {
  if (pager.loading) return;
  pager.loading = true;
  setPagerButtonsDisabled(true);

  try {
    const res = await api('SearchContacts.php', buildSearchPayload(extraBody));
    if (res.status !== 'success') {
      renderResults([]);
      document.querySelector('#resultsBody').innerHTML =
        `<tr><td colspan="5" class="muted">${esc(res.desc || 'Search failed')}</td></tr>`;
      // allow retry: prev enabled if page>1; next enabled to try again
      updatePagerButtons(pager.page > 1, true);
      return;
    }

    const rows = Array.isArray(res.results) ? res.results
               : Array.isArray(res.contacts) ? res.contacts
               : Array.isArray(res) ? res
               : [];

    renderResults(rows);

    // Basic hasNext heuristic without total count
    let hasPrev = pager.page > 1;
    let hasNext = rows.length === pager.pageSize;

    // If your API returns total, uncomment for precise next/prev:
    // const total = Number.isFinite(res.total) ? res.total : null;
    // if (total != null) {
    //   hasNext = (pager.page * pager.pageSize) < total;
    // }

    updatePagerButtons(hasPrev, hasNext);
  } catch (err) {
    console.error('Failed to load contacts:', err);
    document.querySelector('#resultsBody').innerHTML =
      '<tr><td colspan="5" class="muted">Network error.</td></tr>';
    updatePagerButtons(pager.page > 1, true);
  } finally {
    pager.loading = false;
    setPagerButtonsDisabled(false);
  }
}
/* ========= End pagination additions ========= */

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

  // Wire Prev/Next buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (pager.page > 1) {
        pager.page -= 1;
        loadContactsForCurrentPage();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      pager.page += 1;
      loadContactsForCurrentPage();
    });
  }

  // Initial search & load page 1
  searchContacts(); // keeps your existing entry point
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

// NOTE: If called via a UI event (e.g., pressing Enter in #search or a form submit),
// we reset to page 1. Programmatic calls (initial load, save/delete) keep current page.
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
    // Stay on the same page after delete; if the page empties, step back a page
    // (Optional nicety—commented out minimal version keeps current page)
    // await loadContactsForCurrentPage().then(() => {
    //   const rows = document.querySelectorAll('#resultsBody tr');
    //   const onlyNoResults = rows.length === 1 && rows[0].querySelector('.muted');
    //   if (onlyNoResults && pager.page > 1) {
    //     pager.page -= 1;
    //     return loadContactsForCurrentPage();
    //   }
    // });

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
