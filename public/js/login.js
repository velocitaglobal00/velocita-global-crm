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
