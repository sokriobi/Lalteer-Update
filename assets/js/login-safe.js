const API_URL = 'http://127.0.0.1:8080/api/v1/login';
const form = document.getElementById('loginForm');
const email = document.getElementById('email');
const password = document.getElementById('password');
const remember = document.getElementById('rememberMe');
const alertBox = document.getElementById('alert');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');

(function () {
  const saved = localStorage.getItem('remembered_email');
  if (saved) {
    email.value = saved;
    remember.checked = true;
  }
})();

function showAlert(msg, type = 'error') {
  alertBox.className = `alert ${type}`;
  alertBox.textContent = msg;
}

async function readLoginResponse(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();
  const isJsonLike = contentType.includes('application/json') || /^[\s]*[\[{]/.test(raw);

  if (!isJsonLike) {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      snippet
        ? `Login failed: expected JSON but received ${contentType || 'non-JSON'} (${snippet})`
        : `Login failed: expected JSON but received ${contentType || 'non-JSON'}`
    );
  }

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Login failed: invalid JSON response');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  btnText.textContent = 'Signing in...';
  btnSpinner.classList.remove('hidden');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        device_name: navigator.userAgent || 'dashboard-browser'
      })
    });

    const data = await readLoginResponse(res);
    if (!res.ok) throw new Error(data?.message || 'Login failed');

    const token = data?.data?.token || data?.token || data?.access_token;
    const user = data?.data?.user || data?.user || {};
    if (!token) throw new Error('Login failed: token missing from response');

    const storage = remember.checked ? localStorage : sessionStorage;
    storage.setItem('auth_token', token);
    storage.setItem('user_name', user?.name || email.value.split('@')[0]);
    storage.setItem('user_role', user?.role || user?.user_type || 'Member');

    if (remember.checked) {
      localStorage.setItem('remembered_email', email.value.trim());
    }

    showAlert('Login successful. Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'sales-dashboard.html';
    }, 700);
  } catch (err) {
    showAlert(err.message || 'Unable to connect.');
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = 'Sign In';
    btnSpinner.classList.add('hidden');
  }
});
