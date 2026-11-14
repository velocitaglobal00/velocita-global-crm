/* Portal Velocita Parcerias — tela do parceiro. Dados em tempo real por consulta periódica + avisos push no celular. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '');
  const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const S = { me: null, tab: 'geral', dash: null, msgs: [], unread: 0, lastMsg: '', timers: [] };
  const TABS = [['geral', 'Visão geral'], ['vendas', 'Vendas'], ['financeiro', 'Financeiro'], ['ordens', 'Ordens'], ['notas', 'Notas fiscais'], ['chat', 'Chat'], ['sugestoes', 'Sugestões'], ['operacao', 'Operação']];

  async function api(url, opt = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opt });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && S.me) { S.me = null; showLogin(); throw new Error('Sessão encerrada'); }
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  }
  let tt; function toast(t) { const el = $('p-toast'); el.textContent = t; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3200); }

  // ---------- carregamento + sessão ----------
  const hideSplash = () => { const s = $('vg-splash'); if (s) { s.classList.add('out'); setTimeout(() => s.remove(), 600); } };
  async function boot() {
    const t0 = Date.now(); let me = null; let magicErr = '';
    try { const tk = new URLSearchParams(location.search).get('t'); if (tk) { history.replaceState(null, '', location.pathname + location.hash); try { await api('/api/p/magic', { method: 'POST', body: JSON.stringify({ token: tk }) }); } catch (e) { magicErr = e.message; } } } catch (e) { /* sem parâmetro */ }
    try { me = await api('/api/p/me'); } catch (e) { /* não logado */ }
    setTimeout(() => { me ? showApp(me) : showLogin(); if (!me && magicErr) { $('p-err').textContent = magicErr; $('p-err').classList.add('show'); } hideSplash(); }, Math.max(0, 1700 - (Date.now() - t0)));
    if ('serviceWorker' in navigator) { const sub = /^parcerias\./i.test(location.hostname); navigator.serviceWorker.register('/parcerias/sw.js', { scope: sub ? '/' : '/parcerias/' }).catch(() => {}); }
  }

  // ---------- login ----------
  let mode = 'login';
  function setMode(m) {
    mode = m; document.querySelectorAll('.p-tabs2 button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    document.querySelectorAll('[data-f=first]').forEach((e) => { e.style.display = m === 'first' ? '' : 'none'; });
    $('p-passlbl').textContent = m === 'first' ? 'Crie a sua senha (6 a 32 caracteres)' : 'Senha'; $('p-pass').autocomplete = m === 'first' ? 'new-password' : 'current-password'; $('p-go').textContent = m === 'first' ? 'Ativar meu acesso' : 'Entrar'; $('p-err').classList.remove('show');
  }
  function fromLink() { try { const q = new URLSearchParams(location.search); const m = q.get('m'); if (m) { $('p-mat').value = m.toUpperCase(); if (q.get('p') === '1') setMode('first'); history.replaceState(null, '', location.pathname + location.hash); } } catch (e) { /* sem parâmetros */ } }
  function showLogin() { stopTimers(); $('ai-fab').hidden = true; $('ai-panel').classList.remove('show'); $('p-app').hidden = true; $('p-login').hidden = false; setMode('login'); fromLink(); }
  document.querySelectorAll('.p-tabs2 button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  $('p-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('p-err'); err.classList.remove('show'); $('p-go').disabled = true;
    try {
      if (mode === 'first') await api('/api/p/activate', { method: 'POST', body: JSON.stringify({ matricula: $('p-mat').value, email: $('p-mail').value, password: $('p-pass').value }) });
      else await api('/api/p/login', { method: 'POST', body: JSON.stringify({ matricula: $('p-mat').value, password: $('p-pass').value }) });
      $('p-pass').value = ''; showApp(await api('/api/p/me'));
    } catch (er) { err.textContent = er.message; err.classList.add('show'); } finally { $('p-go').disabled = false; }
  });
  $('p-out').addEventListener('click', async () => { try { await api('/api/p/logout', { method: 'POST' }); } catch (e) { /* ok */ } S.me = null; showLogin(); });

  // ---------- app ----------
  function showApp(me) {
    S.me = me; $('p-login').hidden = true; $('p-app').hidden = false; $('ai-fab').hidden = false; loadTips(); if (!me.hasPassword) askPassword(); $('p-company').textContent = me.company || me.name;
    renderNav(); go(location.hash.replace('#', '') || 'geral'); stopTimers();
    S.timers.push(setInterval(() => { if (!document.hidden) { refreshMsgs(); if (S.tab === 'geral' || S.tab === 'financeiro' || S.tab === 'vendas') loadTab(true); } }, 6000));
    refreshMsgs();
  }
  // quem entrou pelo link ainda não tem senha: cria agora (para poder entrar de novo com matrícula e senha)
  function askPassword() {
    if ($('p-setpw')) return; const box = document.createElement('div'); box.id = 'p-setpw'; box.className = 'p-card p-pause'; box.style.margin = '0 0 14px';
    box.innerHTML = '<h3>Crie a sua senha de acesso</h3><p style="margin:0 0 10px;color:#b7c2d9;font-size:13.5px">Você entrou pelo link da Velocita. Crie uma senha (6 a 32 caracteres) para poder entrar depois com a sua matrícula.</p><form class="p-form" id="pw-form" style="grid-template-columns:1fr auto;align-items:end"><label>Nova senha<input id="pw-new" type="password" autocomplete="new-password"></label><button class="btn-primary" type="submit">Salvar senha</button></form>';
    $('p-app').insertBefore(box, $('p-main'));
    $('pw-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/p/set-password', { method: 'POST', body: JSON.stringify({ password: $('pw-new').value }) }); S.me.hasPassword = true; box.remove(); toast('Senha criada.'); } catch (er) { toast(er.message); } };
  }
  function stopTimers() { S.timers.forEach(clearInterval); S.timers = []; }
  function renderNav() {
    $('p-nav').innerHTML = TABS.map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${l}${k === 'chat' && S.unread ? `<span class="dot">${S.unread}</span>` : ''}</button>`).join('');
    $('p-nav').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => go(b.dataset.t)));
    const paused = S.me && S.me.paused && S.me.paused.on; $('p-pill').textContent = paused ? 'Operação pausada' : 'Operação ativa'; $('p-pill').classList.toggle('off', !!paused);
  }
  function go(t) { S.tab = TABS.some((x) => x[0] === t) ? t : 'geral'; history.replaceState(null, '', '#' + S.tab); renderNav(); loadTab(false); }
  async function loadTab(silent) {
    const t = S.tab; const m = $('p-main');
    try {
      if (t === 'geral' || t === 'financeiro' || t === 'operacao') { S.dash = await api('/api/p/dashboard'); S.me.paused = S.dash.paused; renderNav(); }
      if (S.tab !== t) return;
      if (t === 'geral') m.innerHTML = vGeral(); else if (t === 'financeiro') m.innerHTML = vFin(); else if (t === 'operacao') { m.innerHTML = vOp(); bindOp(); }
      else if (t === 'vendas') { const v = await api('/api/p/sales'); if (S.tab === t) m.innerHTML = vVendas(v); }
      else if (t === 'ordens') { if (silent) return; const v = await api('/api/p/orders'); m.innerHTML = vOrdens(v); bindOrdens(); }
      else if (t === 'notas') { if (silent) return; const v = await api('/api/p/invoices'); m.innerHTML = vNotas(v); bindNotas(); }
      else if (t === 'chat') { if (silent) return; m.innerHTML = vChat(); bindChat(); await refreshMsgs(true); }
      else if (t === 'sugestoes') { if (silent) return; m.innerHTML = vSug(); bindSug(); }
    } catch (e) { if (!silent) m.innerHTML = `<div class="p-card">${esc(e.message)}</div>`; }
  }
  const kpi = (l, v, c, s) => `<div class="p-card p-kpi"><span>${l}</span><b class="${c || ''}">${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

  function vGeral() {
    const d = S.dash; const s = d.summary; const max = Math.max(1, ...s.days.map((x) => x.value));
    return `${d.paused.on ? '<div class="p-card p-pause" style="margin-bottom:14px"><b>Sua operação está pausada.</b> Retome em “Operação” quando quiser voltar a vender.</div>' : ''}
      <div class="p-grid">${kpi('Vendido no mês', brl(s.month.revenue), '', `${s.month.qty} unidades`)}${kpi('Custos no mês', brl(s.month.cost), 'o')}${kpi('Resultado do mês', brl(s.month.net), s.month.net >= 0 ? 'g' : 'r', s.commissionPct ? `já descontada a comissão da Velocita (${s.commissionPct}%)` : '')}${kpi('A receber', brl(s.toReceive), 'o', `já recebido: ${brl(s.received)}`)}</div>
      <div class="p-two"><div class="p-card"><h3>Vendas dos últimos 14 dias</h3><div class="bars">${s.days.map((x) => `<div title="${dt(x.day)}: ${brl(x.value)}"><i style="height:${Math.max(3, Math.round((x.value / max) * 112))}px"></i><small>${x.day.slice(8)}</small></div>`).join('')}</div></div>
      <div class="p-card"><h3>Sugestões do Velocito</h3>${d.tips.map((t) => `<div class="p-tip"><span><b>${esc(t.tag)}.</b> ${esc(t.text)}</span></div>`).join('')}</div></div>
      <div class="p-two"><div class="p-card"><h3>Produtos mais vendidos</h3>${s.top.length ? `<div class="p-scroll"><table class="p-table"><thead><tr><th>Produto</th><th>Un.</th><th>Vendido</th><th>Margem</th></tr></thead><tbody>${s.top.map((t) => `<tr><td>${esc(t.product)}</td><td>${t.qty}</td><td>${brl(t.revenue)}</td><td class="${t.margin < 20 ? 'r' : 'g'}">${t.margin}%</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:#93a0ba">Ainda sem vendas registradas.</p>'}</div>
      <div class="p-card"><h3>Últimas vendas</h3>${d.recent.length ? d.recent.map((x) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)"><span>${esc(x.product || 'Produto')} <small style="color:#93a0ba">${x.qty} un. · ${dt(x.date)}</small></span><b>${brl(x.value)}</b></div>`).join('') : '<p style="color:#93a0ba">Sem vendas ainda.</p>'}</div></div>
      ${d.links.length ? `<div class="p-card p-links"><h3>Minhas lojas e painéis</h3>${d.links.map((l) => `<a class="btn-secondary btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a>`).join('')}</div>` : ''}`;
  }
  function vFin() {
    const s = S.dash.summary; const pays = S.dash.payouts;
    return `<div class="p-grid">${kpi('A receber', brl(s.toReceive), 'o')}${kpi('Já recebido', brl(s.received), 'g')}${kpi(`Comissão Velocita${s.commissionPct ? ' (' + s.commissionPct + '%)' : ''}`, brl(s.total.commission), '', `no mês: ${brl(s.month.commission)}`)}${kpi('Resultado (total)', brl(s.total.net), s.total.net >= 0 ? 'g' : 'r', `custos: ${brl(s.total.cost)}`)}</div>
      <div class="p-card"><h3>Pagamentos da Velocita</h3>${pays.length ? `<div class="p-scroll"><table class="p-table"><thead><tr><th>Data</th><th>Valor</th><th>Situação</th><th>Obs.</th></tr></thead><tbody>${pays.map((x) => `<tr><td>${dt(x.date)}</td><td>${brl(x.value)}</td><td><span class="st ${x.status}">${x.status === 'recebido' ? 'Recebido' : 'Previsto'}</span></td><td>${esc(x.note)}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:#93a0ba">Nenhum pagamento lançado ainda.</p>'}</div>`;
  }
  function vVendas(v) {
    return `<div class="p-card"><h3>Vendas</h3>${v.length ? `<div class="p-scroll"><table class="p-table"><thead><tr><th>Data</th><th>Produto</th><th>Un.</th><th>Vendido</th><th>Custo</th><th>Resultado</th></tr></thead><tbody>${v.map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(x.product)}${x.channel ? ` <small style="color:#93a0ba">· ${esc(x.channel)}</small>` : ''}</td><td>${x.qty}</td><td>${brl(x.value)}</td><td>${brl(x.cost)}</td><td class="${x.value - x.cost >= 0 ? 'g' : 'r'}">${brl(x.value - x.cost)}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:#93a0ba">Nenhuma venda registrada ainda.</p>'}</div>`;
  }
  const OST = { nova: 'Nova', andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
  function vOrdens(v) {
    return `<div class="p-two"><div class="p-card"><h3>Gerar ordem para a Velocita</h3><form class="p-form" id="o-form"><label>Produtos e quantidades<textarea id="o-items" placeholder="Ex.: 50 un. Kit Cozinha SKU 123; 20 un. Panela 5L"></textarea></label><label>Observação (opcional)<input id="o-note" placeholder="Prazo, endereço de entrega, urgência..."></label><button class="btn-primary" type="submit">Enviar ordem</button></form></div>
      <div class="p-card"><h3>Minhas ordens</h3>${v.length ? v.map((o) => `<div style="padding:9px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between;gap:8px"><b>#${o.number}</b><span class="st ${o.status}">${OST[o.status]}</span></div><div style="font-size:13.5px;margin-top:4px">${esc(o.items)}</div><small style="color:#93a0ba">${dt(o.createdAt)}${o.note ? ' · ' + esc(o.note) : ''}</small></div>`).join('') : '<p style="color:#93a0ba">Nenhuma ordem ainda.</p>'}</div></div>`;
  }
  function bindOrdens() { $('o-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/p/orders', { method: 'POST', body: JSON.stringify({ items: $('o-items').value, note: $('o-note').value }) }); toast('Ordem enviada para a Velocita.'); loadTab(false); } catch (er) { toast(er.message); } }; }
  function vNotas(v) {
    return `<div class="p-two"><div class="p-card"><h3>Enviar nota fiscal para a Velocita</h3><form class="p-form" id="n-form"><div class="p-row2"><label>Número<input id="n-num"></label><label>Tipo<select id="n-kind"><option value="produto">Produto</option><option value="servico">Serviço</option></select></label></div><div class="p-row2"><label>Valor (R$)<input id="n-val" inputmode="decimal" placeholder="0,00"></label><label>Data<input id="n-date" type="date"></label></div><label>Observação<input id="n-note"></label><label>Arquivo (PDF, XML ou imagem, até 6 MB)<input id="n-file" type="file" accept="application/pdf,text/xml,application/xml,image/png,image/jpeg,image/webp"></label><button class="btn-primary" type="submit">Enviar nota</button></form></div>
      <div class="p-card"><h3>Notas trocadas</h3>${v.length ? v.map((n) => `<div style="padding:9px 0;border-top:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between;gap:8px"><b>NF ${esc(n.number || '—')} · ${n.kind === 'servico' ? 'Serviço' : 'Produto'}</b><b>${brl(n.value)}</b></div><small style="color:#93a0ba">${n.from === 'partner' ? 'Enviada por você' : 'Enviada pela Velocita'} · ${dt(n.date)}${n.note ? ' · ' + esc(n.note) : ''}</small>${n.fileId ? ` · <a href="/api/p/files/${n.fileId}" target="_blank" rel="noopener">abrir arquivo</a>` : ''}</div>`).join('') : '<p style="color:#93a0ba">Nenhuma nota ainda.</p>'}</div></div>`;
  }
  function bindNotas() {
    $('n-form').onsubmit = async (e) => {
      e.preventDefault(); const f = $('n-file').files[0]; const body = { number: $('n-num').value, kind: $('n-kind').value, value: $('n-val').value, date: $('n-date').value, note: $('n-note').value };
      try {
        if (f) { if (f.size > 6 * 1024 * 1024) return toast('O arquivo precisa ter até 6 MB.'); body.mime = f.type || (/\.xml$/i.test(f.name) ? 'text/xml' : ''); body.name = f.name; body.dataBase64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); }); }
        await api('/api/p/invoices', { method: 'POST', body: JSON.stringify(body) }); toast('Nota enviada.'); loadTab(false);
      } catch (er) { toast(er.message); }
    };
  }
  // ---------- chat em tempo real ----------
  function vChat() { return `<div class="p-card p-chat"><div class="p-msgs" id="c-list"></div><form class="p-send" id="c-form"><input id="c-text" placeholder="Escreva para a operação da Velocita..." autocomplete="off"><button class="btn-primary" type="submit">Enviar</button></form></div>`; }
  function drawMsgs() { const l = $('c-list'); if (!l) return; const near = l.scrollHeight - l.scrollTop - l.clientHeight < 80; l.innerHTML = S.msgs.map((m) => `<div class="p-msg ${m.from === 'partner' ? 'me' : 'them'}">${m.from === 'velocita' ? `<b style="font-size:12px">${esc(m.name)}</b><br>` : ''}${esc(m.text)}<small>${hm(m.at)}</small></div>`).join('') || '<p style="color:#93a0ba;text-align:center">Comece a conversa com a Velocita.</p>'; if (near) l.scrollTop = l.scrollHeight; }
  async function refreshMsgs(markRead) {
    try {
      const r = await api('/api/p/messages'); const fresh = r.messages.filter((m) => m.from === 'velocita' && m.at > (S.lastMsg || '9')).length;
      if (S.lastMsg && fresh && S.tab !== 'chat') toast('Nova mensagem da Velocita.');
      S.msgs = r.messages; S.lastMsg = (r.messages.filter((m) => m.from === 'velocita').pop() || {}).at || S.lastMsg; S.unread = r.unread;
      if (S.tab === 'chat') { drawMsgs(); if (r.unread || markRead) { await api('/api/p/messages/read', { method: 'POST' }); S.unread = 0; } }
      renderNav();
    } catch (e) { /* offline */ }
  }
  function bindChat() { $('c-form').onsubmit = async (e) => { e.preventDefault(); const t = $('c-text').value.trim(); if (!t) return; $('c-text').value = ''; try { await api('/api/p/messages', { method: 'POST', body: JSON.stringify({ text: t }) }); await refreshMsgs(); } catch (er) { toast(er.message); } }; }
  // ---------- Sugestões ----------
  function vSug() { return `<div class="p-card" style="max-width:640px"><h3>Enviar sugestão para a Velocita</h3><p style="color:#93a0ba;font-size:13.5px;margin-top:0">Produto novo, mudança de preço, campanha ou melhoria no processo. A nossa equipe recebe na hora.</p><form class="p-form" id="s-form"><label>Sua ideia ou pedido<textarea id="s-text" placeholder="Escreva aqui..."></textarea></label><button class="btn-primary" type="submit">Enviar sugestão</button></form></div>`; }
  function bindSug() { $('s-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/p/suggestions', { method: 'POST', body: JSON.stringify({ text: $('s-text').value }) }); $('s-text').value = ''; toast('Sugestão enviada. Obrigado.'); } catch (er) { toast(er.message); } }; }

  // ---------- Velo-Cito: balão flutuante (mesma IA do CRM, restrita à operação do parceiro) ----------
  const AI = { hist: [], greeted: false };
  async function loadTips() { try { const d = await api('/api/p/dashboard'); $('ai-tips-list').innerHTML = d.tips.map((x) => `<div class="ai-tip-item"><span><b>${esc(x.tag)}.</b> ${esc(x.text)}</span></div>`).join(''); } catch (e) { /* ok */ } }
  function aiMsg(who, text) { const th = $('ai-chat-thread'); th.insertAdjacentHTML('beforeend', `<div class="chat-bubble-row ${who}"><div class="chat-bubble">${esc(text)}</div></div>`); th.scrollTop = th.scrollHeight; return th.lastElementChild.firstElementChild; }
  $('ai-fab').addEventListener('click', () => { const pn = $('ai-panel'); pn.classList.toggle('show'); if (pn.classList.contains('show')) { loadTips(); if (!AI.greeted) { AI.greeted = true; aiMsg('in', 'Olá! Sou o Velo-Cito. Posso ajudar com as suas vendas, margem, produtos, pagamentos e ordens.'); } } });
  $('ai-panel-close').addEventListener('click', () => $('ai-panel').classList.remove('show'));
  document.querySelectorAll('#ai-panel .tab-pill').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#ai-panel .tab-pill').forEach((x) => x.classList.toggle('active', x === b)); $('ai-tab-tips').style.display = b.dataset.aitab === 'tips' ? '' : 'none'; $('ai-tab-chat').style.display = b.dataset.aitab === 'chat' ? 'flex' : 'none'; }));
  async function aiSend() {
    const inp = $('ai-chat-input'); const q = inp.value.trim(); if (!q) return; inp.value = ''; aiMsg('out', q); const el = aiMsg('in', '...'); $('ai-chat-send').disabled = true;
    try { const r = await api('/api/p/ask', { method: 'POST', body: JSON.stringify({ message: q, history: AI.hist.slice(-6) }) }); el.textContent = r.reply; AI.hist.push({ role: 'user', content: q }, { role: 'assistant', content: r.reply }); } catch (er) { el.textContent = er.message; } finally { $('ai-chat-send').disabled = false; }
  }
  $('ai-chat-send').addEventListener('click', aiSend);
  $('ai-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); } });
  // ---------- operação (pausar) ----------
  function vOp() { const p = S.dash.paused; return `<div class="p-card ${p.on ? 'p-pause' : ''}"><h3>${p.on ? 'Operação pausada' : 'Operação ativa'}</h3><p style="color:#b7c2d9;line-height:1.5;margin-top:0">${p.on ? `Pausada em ${dt(p.at)}${p.reason ? ` · Motivo: ${esc(p.reason)}` : ''}. Enquanto estiver pausada, você não gera novas ordens e a Velocita é avisada.` : 'Se precisar interromper as vendas (falta de estoque, férias, problema na loja), pause aqui. A Velocita é avisada na hora.'}</p>
    ${p.on ? '<button class="btn-primary" id="op-resume">Retomar operação</button>' : '<form class="p-form" id="op-form"><label>Motivo (opcional)<input id="op-reason" placeholder="Ex.: sem estoque do produto principal"></label><button class="btn-primary" type="submit">Pausar operação</button></form>'}</div>`; }
  function bindOp() {
    const set = async (on, reason) => { try { await api('/api/p/pause', { method: 'POST', body: JSON.stringify({ on, reason }) }); toast(on ? 'Operação pausada. A Velocita foi avisada.' : 'Operação retomada.'); loadTab(false); } catch (er) { toast(er.message); } };
    if ($('op-resume')) $('op-resume').onclick = () => set(false); if ($('op-form')) $('op-form').onsubmit = (e) => { e.preventDefault(); if (confirm('Pausar a operação? A Velocita será avisada.')) set(true, $('op-reason').value); };
  }
  // ---------- avisos no celular ----------
  $('p-notif').addEventListener('click', async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Para receber avisos no iPhone, instale o app: Compartilhar › Adicionar à Tela de Início.');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return toast('Permissão negada. Libere as notificações nas configurações do navegador.');
      const reg = await navigator.serviceWorker.ready; const { publicKey } = await api('/api/p/push/key');
      const b64 = publicKey.replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)); const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await api('/api/p/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) }); toast('Avisos ativados neste aparelho.');
    } catch (e) { toast('Não foi possível ativar os avisos: ' + e.message); }
  });
  boot();
})();
