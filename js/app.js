async function api(path, body) {
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  let data;
  try { data = await r.json(); }
  catch { data = { status:'ERROR', errType:'BadResponse', desc:'Non-JSON response' }; }
  return data;
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  //turn ArrayBuffer -> hex string
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Login
async function doLogin(e) {
  e.preventDefault();
  const username = document.querySelector('#login').value.trim();
  const password = document.querySelector('#password').value;
  const out = document.querySelector('#out');
  if (!username || !password) {
    out.textContent = 'Please enter your username and password.';
    return;
  }
  try {
    const passwordHash = await sha256Hex(password);
    const res = await api('Auth.php', { username, passwordHash });

    // expect the new shape from Auth.php
    if (res && res.status === 'success' && res.isAuthenticated === true && res.userId) {
      const user = {
        id: res.userId,
        firstName: res.firstName || '',
        lastName: res.lastName || '',
        username
      };
      localStorage.setItem('cmUser', JSON.stringify(user));
      out.textContent = `Welcome, ${user.firstName || username}! Redirecting...`;
      window.location.href = '/contacts.html';
      return;
    }

    // handle failure cases
    if (res && res.status === 'success' && res.isAuthenticated === false) {
      if (res.userExists === false) {
        out.textContent = 'No account found for that username.';
      } else {
        out.textContent = 'Incorrect password.';
      }
      return;
    }

    // fallback
    out.textContent = res?.desc || res?.error || 'Login failed.';
  } catch (err) {
    out.textContent = 'Network error while logging in.';
  }
}

// Register
async function doRegister(e) {
  e.preventDefault();
  const firstName = document.querySelector('#firstName').value.trim();
  const lastName = document.querySelector('#lastName').value.trim();
  const username = document.querySelector('#regUsername').value.trim();
  const password = document.querySelector('#regPassword').value;
  const confirm  = document.querySelector('#regConfirm').value;
  const out = document.querySelector('#registerOut');
  if (!firstName || !lastName || !username || !password) {
    out.textContent = 'Please fill out all fields.';
    return;
  }
  if (password !== confirm) {
    out.textContent = 'Passwords do not match.';
    return;
  }

  try {
    const passwordHash = await sha256Hex(password);
    const res = await api('Register.php', { firstName, lastName, username, passwordHash });

    // expect the new shape from Register.php
    if (res && res.status === 'success' && res.userCreated === true) {
      out.textContent = `Account created for ${firstName} ${lastName}. You can log in now.`;
      const loginEl = document.querySelector('#login');
      const passEl  = document.querySelector('#password');
      if (loginEl) loginEl.value = username;
      if (passEl)  passEl.value  = password;
      return;
    }

    if (res && res.status === 'success' && res.userCreated === false && res.reason === 'UserAlreadyExists') {
      out.textContent = 'That username is already taken.';
      return;
    }

    out.textContent = res?.desc || res?.error || 'Registration failed.';
  } catch (err) {
    out.textContent = 'Network error while registering.';
  }
}

// -------- wire up on DOM ready --------
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('#loginForm');
  const registerForm = document.querySelector('#registerForm');
  if (loginForm) loginForm.addEventListener('submit', doLogin);
  if (registerForm) registerForm.addEventListener('submit', doRegister);
});
