/* Equipe e acessos: presença online, troca de senha e painel da matriz. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const T = { range: 'hoje', timer: null };

  const fmtDur = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`; };
  const ago = (iso) => { if (!iso) return 'nunca acessou'; const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 90) return 'agora'; if (s < 3600) return `há ${Math.round(s / 60)} min`; if (s < 86400) return `há ${Math.round(s / 3600)} h`; return `há ${Math.round(s / 86400)} dia(s)`; };
  const VIEWS = { dashboard: 'Dashboard', roteiro: 'Roteiro do Dia', pipeline: 'Pipeline', leads: 'Leads', leadgen: 'Gerador de Leads', orgs: 'Empresas', email: 'E-mail', mensagens: 'Notificações', bi: 'BI', margem: 'Margem', calendario: 'Calendário', chatequipe: 'Chat da Equipe', materiais: 'Materiais', settings: 'Configurações', ajuda: 'Ajuda', equipe: 'Equipe' };

  // ---------- presença: avisa o servidor, a cada 45 s, que esta pessoa está com o CRM aberto ----------
  function startPresence() {
    const send = () => { if (document.hidden) return; const v = (location.hash || '').replace('#', '') || 'dashboard'; api('/api/presence/ping', { method: 'POST', body: JSON.stringify({ view: v }) }).catch(() => {}); };
    send(); setInterval(send, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) send(); });
  }

  // ---------- topo: nome, perfil, troca de senha ----------
  function setupTopbar() {
    const me = window.state && window.state.me; if (!me) return;
    const nameEl = $('attendant-name'); const label = nameEl && nameEl.previousSibling;
    if (me.role === 'matriz') { if (label) label.textContent = 'Modo administrador · '; if (nameEl) nameEl.textContent = 'matriz'; }
    else if (nameEl) { if (label) label.textContent = 'Olá, '; nameEl.textContent = me.name; }
    const sw = $('btn-switch-attendant'); if (sw) { sw.textContent = 'Minha senha'; sw.title = 'Trocar a minha senha'; sw.replaceWith(sw.cloneNode(true)); $('btn-switch-attendant').addEventListener('click', openPassword); }
    const admin = me.role === 'matriz' || me.role === 'admin';
    const link = document.querySelector('[data-view=equipe]'); if (link && admin) link.hidden = false;
    // perfil limitado: sem acesso a Configurações
    const cfg = document.querySelector('[data-view=settings]'); if (cfg && !admin) cfg.hidden = true;
    if (!admin && /#settings/.test(location.hash)) location.hash = '#dashboard';
    if (me.role !== 'matriz' && !me.hasPassword) setTimeout(() => toast('Defina uma senha só sua: clique em "Minha senha" no topo.'), 1500);
  }

  function modal(html) {
    const wrap = document.createElement('div'); wrap.className = 'modal-overlay show'; wrap.style.zIndex = 400;
    wrap.innerHTML = `<div class="modal" style="max-width:420px">${html}</div>`;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap); return wrap;
  }
  function openPassword() {
    const m = modal(`<div class="modal-header"><h3>Minha senha</h3></div><div class="modal-body" style="padding:16px;display:grid;gap:10px">
      <label>Nova senha <small>(mínimo 8 caracteres)</small><input id="pw1" type="password" autocomplete="new-password" style="width:100%"></label>
      <label>Repita a nova senha<input id="pw2" type="password" autocomplete="new-password" style="width:100%"></label>
      <div class="mt-actions"><button class="btn-primary" id="pw-save">Salvar senha</button><button class="btn-secondary" id="pw-cancel">Cancelar</button></div></div>`);
    m.querySelector('#pw-cancel').onclick = () => m.remove();
    m.querySelector('#pw-save').onclick = async () => {
      const a = m.querySelector('#pw1').value; const b = m.querySelector('#pw2').value;
      if (a !== b) return toast('As senhas não são iguais.');
      try { await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ newPassword: a }) }); window.state.me.hasPassword = true; toast('Senha alterada.'); m.remove(); } catch (e) { toast(e.message); }
    };
  }

  // ---------- painel da matriz ----------
  window.initEquipe = async function initEquipe() {
    if (!window.state.me || !['matriz', 'admin'].includes(window.state.me.role)) { $('eq-root').innerHTML = '<p>Somente administradores veem esta tela.</p>'; return; }
    await draw(); clearInterval(T.timer); T.timer = setInterval(() => { if (document.getElementById('view-equipe').classList.contains('active')) draw(); else clearInterval(T.timer); }, 30000);
  };

  async function draw() {
    let rep; let users;
    try { [rep, users] = await Promise.all([api(`/api/team/report?range=${T.range}`), api('/api/team/users')]); } catch (e) { $('eq-root').innerHTML = `<p>${esc(e.message)}</p>`; return; }
    const ranges = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês']];
    const A = (a, k) => a[k] || 0;
    const cards = rep.users.map((u) => {
      const a = u.act; const prosp = A(a, 'prospeccao') + A(a, 'geracao'); const upd = A(a, 'negocio') + A(a, 'cadastro') + A(a, 'atividade');
      const bars = u.byDay.slice(-14).map((d) => `<i class="${d.acted ? 'on' : ''}" title="${d.date}: ${d.acted ? fmtDur(d.sec) + ' · ' + d.actions + ' ações' : 'sem acesso'}"></i>`).join('');
      return `<div class="eq-card"><div class="eq-top"><div class="eq-av">${esc(u.name[0] || '?')}</div><div><b>${esc(u.name)}</b><div class="eq-sub">${u.online ? `<span class="eq-dot on"></span>Online agora${u.view ? ' · ' + esc(VIEWS[u.view] || u.view) : ''}` : `<span class="eq-dot"></span>Offline · visto ${ago(u.lastSeen)}`}</div></div></div>
        <div class="eq-grid"><div><b>${fmtDur(u.sec)}</b><span>tempo online</span></div><div><b>${u.activeDays}/${u.daysInRange}</b><span>dias com acesso</span></div><div><b>${u.logins}</b><span>logins</span></div>
        <div><b>${prosp}</b><span>prospecções</span></div><div><b>${A(a, 'ligacao')}</b><span>ligações</span></div><div><b>${upd}</b><span>atualizações</span></div><div><b>${A(a, 'contato')}</b><span>e-mails e mensagens</span></div></div>
        <div class="eq-bars" aria-label="Últimos dias">${bars}</div>
        <div class="eq-sub">${u.activeDays ? '' : '<b>Não acessou o CRM neste período.</b> '}${A(a, 'prospeccao') + A(a, 'ligacao') === 0 && u.activeDays ? 'Acessou, mas sem prospecção ou ligação registrada.' : ''}</div></div>`;
    }).join('') || '<p class="mt-note">Nenhum sócio cadastrado.</p>';
    const rows = users.map((u) => `<div class="mt-row eq-user" data-id="${u.id}"><div><b>${esc(u.name)}</b> <span class="lg-pill">${{ matriz: 'matriz', admin: 'administrador', socio: 'limitado' }[u.role] || u.role}</span>${u.active ? '' : ' <span class="lg-pill">desativado</span>'}</div>
      <div><input data-f="username" value="${esc(u.username)}" aria-label="Usuário"></div>
      <div class="eq-pw">${u.hasPassword ? '<span class="lg-pill lg-ok">senha própria</span>' : '<span class="lg-pill">usa a senha antiga</span>'}<input data-f="password" type="password" placeholder="nova senha (8+)" autocomplete="new-password"></div>
      <div class="mt-actions" style="margin:0"><button class="btn-primary btn-sm" data-save>Salvar</button>${u.role === 'matriz' ? '' : `<button class="btn-secondary btn-sm" data-role="${u.role === 'admin' ? 'socio' : 'admin'}">${u.role === 'admin' ? 'Tornar limitado' : 'Tornar administrador'}</button><button class="btn-secondary btn-sm" data-toggle="${u.active ? 0 : 1}">${u.active ? 'Desativar' : 'Reativar'}</button>`}</div></div>`).join('');
    $('eq-root').innerHTML = `<div class="mt-tabs">${ranges.map(([k, v]) => `<button class="mt-tab" aria-selected="${T.range === k}" data-r="${k}">${v}</button>`).join('')}</div>
      <p class="mt-note">Mostra os sócios. A conta matriz não aparece aqui nem em nenhum histórico. Atualiza sozinho a cada 30 segundos.</p>
      <div class="eq-cards">${cards}</div>
      <div class="mt-card"><h3>Acessos e senhas</h3><p class="mt-note">Quem ainda está em "usa a senha antiga" entra com o próprio usuário e a senha antiga do CRM. Ao definir uma senha aqui, a antiga deixa de valer para essa pessoa.</p>${rows}
      <h3 style="margin-top:18px">Novo usuário</h3><div class="mt-row eq-new"><input id="nu-name" placeholder="Nome"><input id="nu-user" placeholder="Usuário (sem espaços)"><input id="nu-pw" type="password" placeholder="Senha (8+)" autocomplete="new-password"><select id="nu-role"><option value="socio">Perfil limitado</option><option value="admin">Administrador</option></select><button class="btn-primary" id="nu-add">Criar usuário</button></div></div>`;
    $('eq-root').querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { T.range = b.dataset.r; draw(); }));
    $('eq-root').querySelectorAll('.eq-user').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-save]').addEventListener('click', async () => {
        const body = { username: row.querySelector('[data-f=username]').value }; const pw = row.querySelector('[data-f=password]').value; if (pw) body.password = pw;
        try { await api(`/api/team/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }); toast('Salvo.'); draw(); } catch (e) { toast(e.message); }
      });
      const rb = row.querySelector('[data-role]');
      if (rb) rb.addEventListener('click', async () => { try { await api(`/api/team/users/${id}`, { method: 'PUT', body: JSON.stringify({ role: rb.dataset.role }) }); toast('Perfil alterado.'); draw(); } catch (e) { toast(e.message); } });
      const t = row.querySelector('[data-toggle]');
      if (t) t.addEventListener('click', async () => { try { await api(`/api/team/users/${id}`, { method: 'PUT', body: JSON.stringify({ active: t.dataset.toggle === '1' }) }); draw(); } catch (e) { toast(e.message); } });
    });
    $('nu-add').addEventListener('click', async () => {
      try { await api('/api/team/users', { method: 'POST', body: JSON.stringify({ name: $('nu-name').value, username: $('nu-user').value, password: $('nu-pw').value, role: $('nu-role').value }) }); toast('Usuário criado.'); draw(); if (window.refreshUsers) window.refreshUsers(); } catch (e) { toast(e.message); }
    });
  }

  window.addEventListener('crm-ready', () => { setupTopbar(); startPresence(); });
})();
