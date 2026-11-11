(async function init() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.authenticated) {
      window.location.href = '/app';
    }
  } catch (e) {
    // ignore, show login normally
  }
})();

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const card = document.querySelector('.login-card');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  errorBox.classList.remove('show');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      window.location.href = '/app';
    } else {
      const body = await res.json().catch(() => ({}));
      errorBox.textContent = res.status === 429 && body.error ? body.error : 'Usuário ou senha incorretos. Tente novamente.';
      errorBox.classList.add('show');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
  } catch (err) {
    errorBox.textContent = 'Erro de conexão com o servidor.';
    errorBox.classList.add('show');
  }
});


// Entrar com Face ID / biometria (passkey cadastrada neste aparelho)
(async function faceId() {
  const btn = document.getElementById('faceid-btn'); if (!btn || !window.VGPasskey) return;
  if (!(await window.VGPasskey.available())) return;
  btn.style.display = 'block';
  btn.addEventListener('click', async () => {
    errorBox.classList.remove('show'); btn.disabled = true;
    try { await window.VGPasskey.login(); window.location.href = '/app'; }
    catch (e) {
      btn.disabled = false;
      if (e && e.name === 'NotAllowedError') return; // a pessoa cancelou
      errorBox.textContent = e.message && !/credential|WebAuthn|operation/i.test(e.message) ? e.message : 'Não foi possível usar o Face ID. Entre com usuário e senha e ative de novo.';
      errorBox.classList.add('show');
    }
  });
})();
