const TYPE_ICON = { meeting: '📅', task: '✅', call: '📞' };
const TYPE_LABEL = { meeting: 'Reunião', task: 'Tarefa', call: 'Chamada' };

function fmtTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

document.getElementById('rt-date').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
});

async function loadUsers() {
  const res = await fetch('/api/public/users');
  const users = await res.json();
  const select = document.getElementById('rt-attendant-filter');
  users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });

  const stored = localStorage.getItem('vg_roteiro_attendant');
  if (stored) select.value = stored;

  select.addEventListener('change', () => {
    localStorage.setItem('vg_roteiro_attendant', select.value);
    loadRoteiro();
  });
}

async function loadRoteiro() {
  const list = document.getElementById('rt-list');
  list.innerHTML = '<div class="empty-state">Carregando...</div>';
  const attendantId = document.getElementById('rt-attendant-filter').value;
  const url = attendantId ? `/api/public/roteiro?attendantId=${attendantId}` : '/api/public/roteiro';
  try {
    const res = await fetch(url);
    const items = await res.json();
    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum compromisso para hoje. 🎉</div>';
      return;
    }
    list.innerHTML = items
      .map((it) => {
        const who = it.leadName || it.orgName || it.dealTitle || 'Sem contato vinculado';
        const sub = [it.dealTitle && it.dealTitle !== who ? it.dealTitle : null, it.orgName && it.orgName !== who ? it.orgName : null]
          .filter(Boolean)
          .join(' · ');
        return `
        <div class="rt-item ${it.done ? 'rt-done' : ''}">
          <div class="rt-time">${fmtTime(it.date)}</div>
          <div class="rt-icon">${TYPE_ICON[it.type] || '📝'}</div>
          <div>
            <div class="rt-title">${escapeHtml(who)}</div>
            ${sub ? `<div class="rt-sub">${escapeHtml(sub)}</div>` : ''}
            <div class="rt-sub">${escapeHtml(it.text)}</div>
            <div class="rt-meta">${TYPE_LABEL[it.type] || it.type}${it.attendantName ? ' · ' + escapeHtml(it.attendantName) : ''}</div>
          </div>
        </div>
      `;
      })
      .join('');
  } catch (err) {
    list.innerHTML = '<div class="empty-state">Erro ao carregar o roteiro.</div>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

loadUsers().then(loadRoteiro);
