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

// Pagination
let currentPage = 1;
let pageLimit   = 5; // match default in SearchContacts.php (was 20, now 5)

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

  const btnPrev  = document.getElementById('btnPrev');
  const btnNext  = document.getElementById('btnNext');
  if (btnPrev) btnPrev.addEventListener('click', () => searchContacts(null, currentPage - 1));
  if (btnNext) btnNext.addEventListener('click', () => searchContacts(null, currentPage + 1));

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

function updatePager(hasPrev, hasNext, labelText){
  const pager    = document.getElementById('pager');
  const btnPrev  = document.getElementById('btnPrev');
  const btnNext  = document.getElementById('btnNext');
  const pageInfo = document.getElementById('pageInfo');

  if (pager)    pager.style.display = labelText === '' ? 'none' : '';

  if (btnPrev) {
    btnPrev.classList.toggle('is-off', !hasPrev);
    btnPrev.setAttribute('aria-disabled', String(!hasPrev));
  }
  if (btnNext) {
    btnNext.classList.toggle('is-off', !hasNext);
    btnNext.setAttribute('aria-disabled', String(!hasNext));
  }

  if (pageInfo) pageInfo.textContent = labelText || '';
}


async function searchContacts(e, pageOverride){
  if(e) e.preventDefault();
  const u = requireUser(); if(!u) return;

  // If caller passed an explicit page, honor it; otherwise keep current
  if (typeof pageOverride === 'number') {
    currentPage = Math.max(1, pageOverride);
  }

  const term = document.querySelector('#search').value.trim();
  try{
    const res = await api('SearchContacts.php', {
      userId: u.id,
      search: term,
      page:  currentPage,
      limit: pageLimit
    });

    if (res.status !== 'success') {
      renderResults([]);
      document.querySelector('#resultsBody').innerHTML =
        `<tr><td colspan="5" class="muted">${esc(res.desc || 'Search failed')}</td></tr>`;
      updatePager(false, false, ''); // disable/hide pager on error
      return;
    }

    const rows = res.results || [];
    renderResults(rows);

    // Update pager state
    const hasPrev = currentPage > 1;
    let hasNext, label;

    if (typeof res.totalCount === 'number') {
      const totalPages = Math.max(1, Math.ceil(res.totalCount / pageLimit));
      hasNext = currentPage < totalPages;
      label   = `${currentPage} / ${totalPages}`;
    } else {
      // Infer "next" when we received a full page
      hasNext = rows.length === pageLimit;
      label   = rows.length ? `Page ${currentPage}` : '';
    }

    updatePager(hasPrev, hasNext, label);

  }catch(err){
    document.querySelector('#resultsBody').innerHTML =
      '<tr><td colspan="5" class="muted">Network error.</td></tr>';
    updatePager(false, false, ''); // disable/hide pager on error
  }
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
  await searchContacts();
  }catch(err){
    alert('Network error.');
  }

//ensure globals
window.saveContact    = saveContact;
window.searchContacts = searchContacts;
window.deleteContact  = deleteContact;
window.resetForm      = resetForm;
window.logout         = logout;

}
