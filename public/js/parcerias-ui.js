/* Aba "Parcerias" do CRM: controle administrativo dos parceiros (fornecedores / dropshipping) do portal parcerias.velocitaglobal.com.br */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = (iso) => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—');
  const hm = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const P = { list: [], open: null, timer: null, canEdit: false };
  const PORTAL = () => `${location.origin}/parcerias/`;
  const ST = { pendente: 'Aguardando contrato', ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada' };
  P.filter = 'ativas';

  window.initParcerias = async function () {
    P.canEdit = !!(window.state && window.state.me && ['matriz', 'admin'].includes(window.state.me.role));
    clearInterval(P.timer);
    P.timer = setInterval(() => { const v = $('view-parcerias'); if (v && v.classList.contains('active') && !document.hidden && !document.activeElement.matches('input,textarea,select')) refresh(true); }, 8000);
    await refresh(false);
  };

  async function refresh(silent) {
    try {
      const prev = P.list; P.list = await api('/api/parcerias'); if (P.open) P.cur = await api(`/api/parcerias/${P.open}`);
      if (silent && prev && prev.length && window.VGSound) { // novidade com a aba aberta: toca o som da Velocita (alerta se alguém pausou)
        const sum = (f) => P.list.reduce((a, x) => a + f(x), 0); const was = (f) => prev.reduce((a, x) => a + f(x), 0);
        if (sum((x) => (x.paused.on ? 1 : 0)) > was((x) => (x.paused.on ? 1 : 0))) window.VGSound.play('alert');
        else if (sum((x) => x.summary.unreadFromPartner) > was((x) => x.summary.unreadFromPartner) || sum((x) => x.summary.openOrders) > was((x) => x.summary.openOrders)) window.VGSound.play('ok');
      }
      draw();
    } catch (e) { if (!silent) $('pc-root').innerHTML = `<p>${esc(e.message)}</p>`; }
  }

  function draw() { if (P.open && P.cur) return drawDetail(); drawList(); }

  function drawList() {
    const all = P.list; const wait = all.filter((p) => p.status === 'pendente'); const L = P.filter === 'espera' ? wait : P.filter === 'todas' ? all : all.filter((p) => p.status !== 'pendente');
    const act = all.filter((p) => p.status === 'ativa').length; const pau = all.filter((p) => p.status === 'pausada').length;
    const rec = all.reduce((a, p) => a + p.summary.toReceive, 0); const ord = all.reduce((a, p) => a + p.summary.openOrders, 0); const unr = all.reduce((a, p) => a + p.summary.unreadFromPartner, 0); const com = all.reduce((a, p) => a + p.summary.month.commission, 0);
    const k = (l, v, c) => `<div class="mt-card pc-k"><span>${l}</span><b class="${c || ''}">${v}</b></div>`;
    $('pc-root').innerHTML = `<div class="pc-kpis">${k('Parcerias ativas', act, 'oc-g')}${k('Pausadas', pau, pau ? 'oc-r' : '')}${k('Comissão Velocita no mês', brl(com), 'oc-g')}${k('A pagar aos parceiros', brl(rec))}${k('Ordens abertas', ord)}${k('Mensagens novas', unr, unr ? 'oc-r' : '')}</div>
      <div class="mt-card"><div class="pc-head"><h3>Parceiros</h3><div class="pc-actions" style="margin:0"><button class="btn-secondary btn-sm ${P.filter === 'ativas' ? 'pc-on' : ''}" data-f="ativas">Ativas</button><button class="btn-secondary btn-sm ${P.filter === 'espera' ? 'pc-on' : ''}" data-f="espera">Aguardando contrato (${wait.length})</button><button class="btn-secondary btn-sm ${P.filter === 'todas' ? 'pc-on' : ''}" data-f="todas">Todas</button>${P.canEdit ? '<button class="btn-primary btn-sm" id="pc-new">Nova parceria</button>' : ''}</div></div>
      <p class="mt-note">Portal do parceiro: <b>${esc(PORTAL())}</b>. Toda empresa que entra no Pipeline recebe uma matrícula automática. Depois de assinar o contrato, mude a situação para <b>Ativa</b>: o parceiro entra com a matrícula e define a própria senha.</p>
      ${L.length ? `<div class="pc-scroll"><table class="data-table pc-list"><thead><tr><th>Parceiro</th><th>Matrícula</th><th>Situação</th><th>Vendido no mês</th><th>Comissão</th><th>A pagar</th><th>Ordens</th><th>Chat</th><th>Último acesso</th><th></th></tr></thead><tbody>${L.map((p) => `<tr><td data-l="Parceiro"><b>${esc(p.company || p.name)}</b><br><small>${esc(p.name)}</small></td><td data-l="Matrícula"><code>${esc(p.matricula)}</code></td><td data-l="Situação"><span class="pc-st pc-${p.status}">${ST[p.status]}</span>${p.paused.on ? `<br><small>pausou: ${esc(p.paused.reason || 'sem motivo')}</small>` : ''}${p.status !== 'pendente' && !p.activated ? '<br><small>aguardando 1º acesso</small>' : ''}</td><td data-l="Vendido no mês">${brl(p.summary.month.revenue)}</td><td data-l="Comissão">${p.commissionPct}% <small>(${brl(p.summary.month.commission)})</small></td><td data-l="A pagar">${brl(p.summary.toReceive)}</td><td data-l="Ordens">${p.summary.openOrders || '—'}</td><td data-l="Chat">${p.summary.unreadFromPartner ? `<span class="pc-dot">${p.summary.unreadFromPartner}</span>` : '—'}</td><td data-l="Último acesso">${p.lastSeen ? hm(p.lastSeen) : 'nunca'}</td><td class="pc-act"><button class="btn-secondary btn-sm" data-open="${p.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note" style="padding:14px 0">Nenhuma parceria nesta lista.</p>'}</div>`;
    $('pc-root').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { P.filter = b.dataset.f; drawList(); }));
    $('pc-root').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => { P.open = b.dataset.open; P.cur = await api(`/api/parcerias/${P.open}`); drawDetail(); }));
    if ($('pc-new')) $('pc-new').onclick = newForm;
  }

  function newForm() {
    $('pc-root').insertAdjacentHTML('afterbegin', `<div class="mt-card" id="pc-newbox"><h3>Nova parceria ${helpBox('new', HELP_NEW)}</h3><div class="pc-form"><label>Nome do responsável<input id="n-name"></label><label>Empresa / loja<input id="n-company"></label><label>E-mail<input id="n-email" type="email"></label><label>Telefone / WhatsApp<input id="n-phone"></label><label>Contrato assinado em<input id="n-date" type="date"></label><label>Observações<input id="n-notes"></label><label>Comissão da Velocita (% das vendas)<input id="n-pct" type="number" min="0" max="100" step="0.5" value="0"></label></div><div class="pc-actions"><button class="btn-primary btn-sm" id="n-save">Gerar matrícula</button><button class="btn-secondary btn-sm" id="n-cancel">Cancelar</button></div></div>`);
    bindHelp($('pc-newbox')); $('n-cancel').onclick = () => $('pc-newbox').remove();
    $('n-save').onclick = async () => { try { const p = await api('/api/parcerias', { method: 'POST', body: JSON.stringify({ name: $('n-name').value, company: $('n-company').value, email: $('n-email').value, phone: $('n-phone').value, contractDate: $('n-date').value, notes: $('n-notes').value, commissionPct: $('n-pct').value }) }); P.open = p.id; P.cur = p; toast('Parceria criada.'); drawDetail(); } catch (e) { toast(e.message); } };
  }

  // ---------- Conexões de API (lojas e anúncios) deste parceiro ----------
  const CS = { conectada: ['Conectada', 'oc-g'], pendente: ['Aguardando teste', ''], erro: ['Com erro', 'oc-r'] };
  async function loadConns(p) {
    const box = $('d-conn'); if (!box) return;
    let r; try { r = await api(`/api/parcerias/${p.id}/connections`); } catch (e) { return; } const e = P.canEdit;
    const rows = r.connections.map((c) => { const [lb, cl] = CS[c.status] || CS.pendente; const mt = Object.entries(c.metrics || {}); return `<div class="pc-conn" data-c="${c.id}"><div class="pc-conn-h"><div><b>${esc(c.label)}</b> <small>${esc(c.platformName)} · ${c.kind === 'ads' ? 'anúncios' : 'loja'}</small></div><span class="${cl}"><b>${lb}</b></span></div><p class="mt-note" style="margin:4px 0">${esc(c.statusMsg || '')}${c.lastTestAt ? ` (${hm(c.lastTestAt)})` : ''}</p>${mt.length ? `<div class="pc-conn-m">${mt.map(([k, v]) => `<span><small>${esc(k)}</small> <b>${esc(v)}</b></span>`).join('')}</div>` : ''}${e ? `<div class="pc-actions"><button class="btn-primary btn-sm" data-ctest="${c.id}">${c.canTest ? 'Testar conexão' : 'Salvar e marcar'}</button><button class="btn-secondary btn-sm" data-cedit="${c.id}">Editar credenciais</button><button class="btn-secondary btn-sm" data-cdel="${c.id}">Remover</button></div><div class="pc-cform" id="cf-${c.id}"></div>` : ''}</div>`; }).join('');
    const plats = Object.entries(r.catalog);
    box.innerHTML = section('Conexões de API: lojas e anúncios', `${helpBox('conn', HELP_CONN)}<p class="mt-note">Somente a equipe Velocita conecta as APIs de cada contrato. O parceiro só vê o resultado no painel dele. Depois de salvar as credenciais, use <b>Testar conexão</b> para conferir se a loja ou a conta de anúncios entrega dados e métricas.</p>${rows || '<p class="mt-note">Nenhuma conexão ainda.</p>'}${e ? `<div class="pc-add"><b>Adicionar conexão</b><div class="pc-form"><select id="cn-plat"><option value="">Escolha a plataforma...</option><optgroup label="Lojas / marketplaces">${plats.filter(([, v]) => v.kind === 'store').map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</optgroup><optgroup label="Anúncios">${plats.filter(([, v]) => v.kind === 'ads').map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</optgroup></select><input id="cn-label" placeholder="Nome da conexão (opcional)"></div><div id="cn-fields"></div></div>` : ''}`);
    bindHelp(box);
    const fieldsHtml = (cat, vals, fil) => `${cat.help ? `<p class="mt-note" style="margin:2px 0 6px">${esc(cat.help)}</p>` : ''}<div class="pc-form">${cat.fields.map((f) => `<label>${esc(f.l)}${f.secret && (fil || []).includes(f.k) ? ' <small>(já salvo: deixe vazio para manter)</small>' : ''}<input data-f="${f.k}" ${f.secret ? 'type="password" autocomplete="off"' : ''} value="${esc((vals || {})[f.k] || '')}" placeholder="${f.secret ? '••••••••' : ''}"></label>`).join('')}</div>`;
    const read = (root) => Object.fromEntries([...root.querySelectorAll('[data-f]')].map((i) => [i.dataset.f, i.value.trim()]));
    if ($('cn-plat')) $('cn-plat').onchange = () => { const cat = r.catalog[$('cn-plat').value]; $('cn-fields').innerHTML = cat ? `${fieldsHtml(cat)}<div class="pc-actions"><button class="btn-primary btn-sm" id="cn-save">Salvar conexão</button></div>` : ''; if (cat) $('cn-save').onclick = async () => { try { const c = await api(`/api/parcerias/${p.id}/connections`, { method: 'POST', body: JSON.stringify({ platform: $('cn-plat').value, label: $('cn-label').value, fields: read($('cn-fields')) }) }); toast('Conexão salva. Agora clique em Testar conexão.'); loadConns(p); } catch (er) { toast(er.message); } }; };
    box.querySelectorAll('[data-cdel]').forEach((b) => { b.onclick = async () => { if (!confirm('Remover esta conexão?')) return; await api(`/api/parcerias/${p.id}/connections/${b.dataset.cdel}`, { method: 'DELETE' }); loadConns(p); }; });
    box.querySelectorAll('[data-cedit]').forEach((b) => { b.onclick = () => { const c = r.connections.find((x) => x.id === b.dataset.cedit); const f = $('cf-' + c.id); if (f.innerHTML) { f.innerHTML = ''; return; } f.innerHTML = `${fieldsHtml(r.catalog[c.platform], c.values, c.filled)}<div class="pc-actions"><button class="btn-primary btn-sm" id="cs-${c.id}">Salvar alterações</button></div>`; $('cs-' + c.id).onclick = async () => { try { await api(`/api/parcerias/${p.id}/connections/${c.id}`, { method: 'PUT', body: JSON.stringify({ fields: read(f) }) }); toast('Credenciais salvas. Teste de novo.'); loadConns(p); } catch (er) { toast(er.message); } }; }; });
    box.querySelectorAll('[data-ctest]').forEach((b) => { b.onclick = async () => { b.disabled = true; b.textContent = 'Testando...'; try { const o = await api(`/api/parcerias/${p.id}/connections/${b.dataset.ctest}/test`, { method: 'POST' }); toast(o.ok ? o.message : o.message); } catch (er) { toast(er.message); } loadConns(p); }; });
  }

  // Trocar matrícula: só a pedido do parceiro; exige a senha do CRM ou o Face ID de quem está trocando
  async function swapBox(p, afterDone) {
    const host = $('d-swapbox') || $('dd-mat-swap'); if (!host) return;
    const faceOk = window.VGPasskey && (await window.VGPasskey.available()) && window.state && window.state.me && window.state.me.hasPasskey !== false;
    host.innerHTML = `<div class="pc-swap"><b>Trocar a matrícula de ${esc(p.company || p.name)}</b> ${helpBox('swap', HELP_SWAP)}<p class="mt-note" style="margin:4px 0">Só troque se o parceiro pediu. A matrícula antiga deixa de funcionar. Confirme que é você:</p>
      <input id="sw-reason" placeholder="Motivo (opcional)" style="width:100%;margin-bottom:6px"><div class="pc-actions" style="margin:0"><input id="sw-pass" type="password" placeholder="Sua senha do CRM" autocomplete="current-password" style="flex:1;min-width:160px"><button class="btn-primary btn-sm" id="sw-ok">Confirmar com senha</button>${faceOk ? '<button class="btn-secondary btn-sm" id="sw-face">Confirmar com Face ID</button>' : ''}<button class="btn-secondary btn-sm" id="sw-cancel">Cancelar</button></div></div>`;
    const done = async (body) => { try { const r = await api(`/api/parcerias/${p.id}/change-matricula`, { method: 'POST', body: JSON.stringify({ ...body, reason: $('sw-reason').value }) }); toast(`Nova matrícula: ${r.matricula}`); host.innerHTML = ''; if (afterDone) afterDone(r); else { P.cur = r; refresh(); } } catch (er) { toast(er.message); } };
    bindHelp(host); $('sw-cancel').onclick = () => { host.innerHTML = ''; };
    $('sw-ok').onclick = () => { if (!$('sw-pass').value) return toast('Digite a sua senha.'); done({ password: $('sw-pass').value }); };
    if ($('sw-face')) $('sw-face').onclick = async () => { try { done({ confirmToken: await window.VGPasskey.confirm() }); } catch (er) { toast('Face ID não confirmado.'); } };
  }

  // E-mail de convite: layout da marca, estilos inline (funciona no Gmail, Outlook e celular)
  function inviteEmailHtml(p, link, auto) {
    const nome = esc((p.name || p.company || '').split(' ')[0] || 'tudo bem'); const logo = `${location.origin}/img/icon-192.png`;
    const passo = auto
      ? `<li style="margin:0 0 8px">Clique no botão abaixo: você já entra logado neste aparelho (o link vale por 7 dias e só pode ser usado uma vez).</li>${p.activated ? '' : '<li style="margin:0 0 8px">Na primeira vez, crie a sua senha de acesso (de 6 a 32 caracteres).</li>'}`
      : `<li style="margin:0 0 8px">Clique no botão abaixo. A sua matrícula já vem preenchida.</li><li style="margin:0 0 8px">${p.activated ? 'Informe a senha que você criou e entre.' : `No <b>Primeiro acesso</b>, informe${p.email ? ' o e-mail do seu contrato e' : ''} crie a sua senha (de 6 a 32 caracteres).`}</li>`;
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#eef0f3"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<tr><td style="background:#1b2a4e;padding:22px 28px;border-bottom:4px solid #f4821f"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${logo}" width="48" height="48" alt="" style="display:block;border-radius:10px"></td><td style="padding-left:14px"><div style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#ffffff">VELOCITA</div><div style="font-size:11px;letter-spacing:6px;color:#ff9a3d">GLOBAL</div></td></tr></table></td></tr>
<tr><td style="padding:30px 28px 8px"><div style="font-size:13px;letter-spacing:2px;color:#f4821f;font-weight:bold">PORTAL DE PARCERIAS</div><h1 style="margin:6px 0 14px;font-size:24px;line-height:1.25;color:#1b2a4e">Olá, ${nome}! Seu acesso está pronto.</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Bem-vindo à parceria com a <b>Velocita Global</b>. No portal você acompanha a sua operação em tempo real: vendas, valores a receber, custos e produtos mais vendidos. Também gera ordens para a Velocita, envia notas fiscais, pausa a operação quando precisar e fala direto com a nossa equipe.</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6ec;border:1px solid #f9d3ac;border-radius:12px"><tr><td style="padding:16px 18px"><div style="font-size:12px;color:#8a5a1f;letter-spacing:1px">SUA MATRÍCULA</div><div style="font-size:26px;font-weight:bold;letter-spacing:3px;color:#1b2a4e;margin-top:4px">${esc(p.matricula)}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">É a identidade da sua empresa na Velocita. Guarde com cuidado.</div></td></tr></table></td></tr>
<tr><td style="padding:20px 28px 4px"><div style="font-size:15px;font-weight:bold;color:#1b2a4e;margin-bottom:8px">Como entrar</div><ol style="margin:0;padding-left:20px;font-size:14.5px;line-height:1.55">${passo}</ol></td></tr>
<tr><td align="center" style="padding:22px 28px 10px"><a href="${esc(link)}" style="display:inline-block;background:#f4821f;color:#1b2a4e;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 34px;border-radius:10px">Acessar o Portal de Parcerias</a><div style="font-size:12px;color:#6b7280;margin-top:10px">Se o botão não abrir, copie este endereço no navegador:<br><a href="${esc(link)}" style="color:#d96e0f;word-break:break-all">${esc(link)}</a></div></td></tr>
<tr><td style="padding:14px 28px 6px"><p style="margin:0;font-size:13px;line-height:1.55;color:#4b5563">Dá para instalar o portal como aplicativo no celular (Android e iPhone) e receber avisos de vendas, mensagens e pagamentos. ${auto ? '<b>Este link é pessoal: não encaminhe para outras pessoas.</b>' : ''}</p></td></tr>
<tr><td style="padding:22px 28px 26px"><div style="border-top:1px solid #e5e7eb;padding-top:16px"><div style="font-size:14px;color:#1f2937">Qualquer dúvida, é só responder este e-mail ou falar com a gente pelo chat do portal.</div><div style="margin-top:14px;font-size:14px"><b style="color:#1b2a4e">Equipe Velocita Global LTDA</b><br><span style="color:#6b7280">velocitaglobal.com.br</span></div></div></td></tr>
</table><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9ca3af;margin-top:12px;max-width:600px">Você recebeu este e-mail porque a Velocita Global liberou o seu acesso ao Portal de Parcerias.</div></td></tr></table></body></html>`;
  }

  // Botão "?" com ajuda dentro de cada popup/painel de Parcerias
  const helpBox = (id, html) => `<button type="button" class="p-q-crm" data-hq="${id}" title="Ajuda" aria-label="Ajuda">?</button><div class="pc-help" id="hq-${id}" hidden>${html}</div>`;
  const bindHelp = (root) => root.querySelectorAll('[data-hq]').forEach((b) => { b.onclick = () => { const bx = root.querySelector('#hq-' + b.dataset.hq); bx.hidden = !bx.hidden; }; });
  const HELP_INVITE = '<b>Link de acesso</b><p>Gera o link para o parceiro entrar no portal. O <b>link simples</b> abre o portal com a matrícula já preenchida e o parceiro entra com a senha dele. O <b>link que já entra logado</b> vale 7 dias, só funciona uma vez e deixa o parceiro logado naquele aparelho; envie só para ele.</p><p>A mensagem pronta pode ser editada, copiada ou enviada por WhatsApp. O e-mail sai com o layout da Velocita, assinado como Equipe Velocita Global LTDA, pela caixa compartilhada (precisa estar conectada em E-mail). Use <b>Pré-visualizar</b> antes de enviar. O acesso só funciona se a situação do parceiro for <b>Ativa</b>.</p>';
  const HELP_SWAP = '<b>Trocar matrícula</b><p>A matrícula é como o RG da empresa na parceria. Troque só se o parceiro pedir. A antiga deixa de funcionar na hora. É preciso confirmar com a sua senha do CRM ou com o Face ID, e a troca fica no histórico do parceiro.</p>';
  const HELP_CONN = '<b>Conexões de API</b><p>Cada parceiro tem as próprias conexões com marketplaces e plataformas de anúncios, feitas só por administradores. Escolha a plataforma, cole as credenciais e clique em <b>Testar conexão</b> para ver se a loja ou a conta entrega dados e métricas. As credenciais ficam criptografadas e não voltam para a tela. O parceiro vê só o status e as métricas, na aba Operação do portal.</p>';
  const HELP_NEW = '<b>Nova parceria</b><p>Toda empresa que entra no Pipeline já recebe uma matrícula automática. Use este formulário só para um parceiro que não esteja no Pipeline. A comissão da Velocita é o percentual sobre as vendas do parceiro, usado no painel dele e no seu.</p>';

  // Popup "Link de acesso": link do portal já com a matrícula, mensagem pronta e envio por WhatsApp ou e-mail
  function invitePop(p) {
    const link = `${PORTAL()}?m=${encodeURIComponent(p.matricula)}${p.activated ? '' : '&p=1'}`; const first = (p.name || p.company || '').split(' ')[0] || 'tudo bem';
    const msg = `Olá, ${first}! Aqui é da Velocita Global.\n\nSeu acesso ao Portal de Parcerias está pronto: ${link}\n\nSua matrícula: ${p.matricula}\n${p.activated ? 'Entre com a matrícula e a senha que você criou.' : `No primeiro acesso, informe a matrícula${p.email ? ' e o e-mail do seu contrato' : ''} e crie a sua senha (6 a 32 caracteres).`}\n\nPelo portal você acompanha vendas, valores a receber, gera ordens, envia notas fiscais e fala com a nossa operação em tempo real. Dá para instalar como app no celular.`;
    document.getElementById('pc-pop')?.remove();
    const el = document.createElement('div'); el.id = 'pc-pop'; el.className = 'pc-pop';
    el.innerHTML = `<div class="pc-pop-box" role="dialog" aria-modal="true" aria-label="Link de acesso do parceiro"><div class="pc-head"><h3 style="margin:0">Link de acesso: ${esc(p.company || p.name)} ${helpBox('inv', HELP_INVITE)}</h3><button class="btn-secondary btn-sm" id="pp-close">Fechar</button></div>
      ${p.status === 'pendente' ? '<p class="pc-warn">O acesso ainda não está liberado. Depois do contrato assinado, mude a situação para <b>Ativa</b> na aba Parcerias; até lá o portal recusa o login.</p>' : ''}
      <div class="pc-mode"><button class="btn-secondary btn-sm pc-on" id="pp-m1">Link simples (o parceiro digita a senha)</button><button class="btn-secondary btn-sm" id="pp-m2" ${p.status === 'pendente' ? 'disabled title="Libere o acesso primeiro"' : ''}>Link que já entra logado</button></div>
      <p class="mt-note" id="pp-hint" style="margin:6px 0">Abre o portal com a matrícula preenchida. O parceiro entra com a senha dele.</p>
      <label class="mt-note">Link do portal</label><div class="pc-actions" style="margin-top:4px"><input id="pp-link" readonly value="${esc(link)}" style="flex:1;min-width:220px"><button class="btn-primary btn-sm" id="pp-copy">Copiar link</button></div>
      <label class="mt-note" style="display:block;margin-top:10px">Mensagem pronta</label><textarea id="pp-msg" rows="9" style="width:100%">${esc(msg)}</textarea>
      <div class="pc-actions"><button class="btn-secondary btn-sm" id="pp-copymsg">Copiar mensagem</button><a class="btn-primary btn-sm" id="pp-wa" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
      <div class="pc-mailbox"><b>Enviar por e-mail</b><p class="mt-note" style="margin:2px 0 6px">E-mail com o layout da Velocita, assinado como Equipe Velocita Global LTDA, enviado pela caixa compartilhada.</p>
        <div class="pc-form" style="margin:0"><input id="pp-to" type="email" placeholder="E-mail do fornecedor" value="${esc(p.email || '')}"><input id="pp-subj" value="Seu acesso ao Portal de Parcerias da Velocita Global"></div>
        <div class="pc-actions"><button class="btn-secondary btn-sm" id="pp-prev">Pré-visualizar e-mail</button><button class="btn-primary btn-sm" id="pp-send">Enviar e-mail agora</button></div><iframe id="pp-frame" title="Pré-visualização do e-mail" style="display:none;width:100%;height:520px;border:1px solid var(--vg-border);border-radius:10px;margin-top:8px;background:#fff"></iframe></div></div>`;
    document.body.appendChild(el); bindHelp(el);
    const text = () => $('pp-msg').value; const num = String(p.phone || '').replace(/\D/g, ''); const wa = num ? `https://wa.me/${num.length <= 11 ? '55' + num : num}` : 'https://wa.me/';
    const sync = () => { $('pp-wa').href = `${wa}?text=${encodeURIComponent(text())}`; if ($('pp-frame').style.display !== 'none') $('pp-frame').srcdoc = inviteEmailHtml(p, $('pp-link').value, $('pp-link').value.includes('/p/')); };
    sync(); $('pp-msg').addEventListener('input', sync);
    // "Link que já entra logado": uso único, 7 dias; deixa o parceiro logado no computador/celular dele
    const swap = (from, to) => { $('pp-msg').value = $('pp-msg').value.split(from).join(to); sync(); };
    $('pp-m1').onclick = () => { $('pp-m1').classList.add('pc-on'); $('pp-m2').classList.remove('pc-on'); const cur = $('pp-link').value; if (cur !== link) { swap(cur, link); $('pp-link').value = link; } $('pp-hint').textContent = 'Abre o portal com a matrícula preenchida. O parceiro entra com a senha dele.'; };
    $('pp-m2').onclick = async () => {
      try {
        const r = await api(`/api/parcerias/${p.id}/magic-link`, { method: 'POST' }); const auto = `${location.origin}/p/${r.token}`; const cur = $('pp-link').value;
        $('pp-m2').classList.add('pc-on'); $('pp-m1').classList.remove('pc-on'); swap(cur, auto); $('pp-link').value = auto;
        $('pp-msg').value = $('pp-msg').value.replace(/(No primeiro acesso|Entre com a matrícula)[^\n]*/, 'Ao abrir o link, você já entra logado neste aparelho.' + (p.activated ? '' : ' Ele vai pedir para você criar uma senha.')); sync();
        $('pp-hint').innerHTML = `Uso único, válido até <b>${dt(r.expiresAt)}</b>. Quem abrir o link entra logado nesse aparelho (30 dias, renova com o uso). <b>Envie só para o parceiro.</b>`;
      } catch (er) { toast(er.message); }
    };
    const copy = async (v, ok) => { try { await navigator.clipboard.writeText(v); toast(ok); } catch (e) { toast(v); } };
    $('pp-prev').onclick = () => { const f = $('pp-frame'); const show = f.style.display === 'none'; f.style.display = show ? '' : 'none'; $('pp-prev').textContent = show ? 'Esconder pré-visualização' : 'Pré-visualizar e-mail'; if (show) sync(); };
    $('pp-send').onclick = async () => {
      const to = $('pp-to').value.trim(); if (!/^\S+@\S+\.\S+$/.test(to)) return toast('Informe um e-mail válido do fornecedor.');
      if (!window.confirm(`Enviar o e-mail de acesso para ${to}?`)) return; const b = $('pp-send'); b.disabled = true; b.textContent = 'Enviando...';
      try {
        const link = $('pp-link').value; await api('/api/mail/gmail/send', { method: 'POST', body: JSON.stringify({ to, subject: $('pp-subj').value, html: inviteEmailHtml(p, link, link.includes('/p/')), noSignature: true, fromName: 'Equipe Velocita Global LTDA', attendantId: (window.state && window.state.attendantId) || null }) });
        toast('E-mail enviado para ' + to + '.'); b.textContent = 'E-mail enviado';
      } catch (er) { toast(er.code === 'GOOGLE_RECONNECT' || /conect/i.test(er.message) ? 'Conecte o Gmail da caixa compartilhada em E-mail (Reconectar Google) e tente de novo.' : er.message); b.disabled = false; b.textContent = 'Enviar e-mail agora'; }
    };
    $('pp-copy').onclick = () => copy($('pp-link').value, 'Link copiado.'); $('pp-copymsg').onclick = () => copy(text(), 'Mensagem copiada.');
    const close = () => el.remove(); $('pp-close').onclick = close; el.addEventListener('click', (e) => { if (e.target === el) close(); }); document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); } });
  }

  const section = (title, body) => `<div class="mt-card"><h3>${title}</h3>${body}</div>`;
  function drawDetail() {
    const p = P.cur; const s = p.summary; const e = P.canEdit;
    const fld = (id, ph, t) => `<input id="${id}" placeholder="${ph}" ${t ? `type="${t}"` : ''}>`;
    $('pc-root').innerHTML = `<div class="pc-head"><button class="btn-secondary btn-sm" id="pc-back">Voltar</button><h3 style="margin:0">${esc(p.company || p.name)}</h3><span class="pc-st pc-${p.status}">${ST[p.status]}</span></div>
      ${section('Acesso e contrato', `<p style="margin:0 0 8px">Matrícula: <b><code style="font-size:18px">${esc(p.matricula)}</code></b> ${p.status === 'pendente' ? '· <span class="oc-r">acesso ainda não liberado</span>' : p.activated ? '· <span class="oc-g">senha definida pelo parceiro</span>' : '· aguardando o parceiro criar a senha'}</p>
        <p class="mt-note">Entregue ao parceiro o endereço <b>${esc(PORTAL())}</b> e a matrícula. No primeiro acesso ele informa a matrícula${p.email ? ' e o e-mail do contrato' : ''} e cria a própria senha. Último acesso: ${p.lastSeen ? hm(p.lastSeen) : 'nunca'}.</p>
        ${p.activated ? `<p style="margin:6px 0">Senha do parceiro: <b id="d-pw" style="font-family:monospace;font-size:16px">••••••</b> <button class="btn-secondary btn-sm" id="d-showpw">Mostrar</button></p>` : ''}
        ${e ? `<div class="pc-actions"><label style="display:flex;gap:6px;align-items:center">Situação <select id="d-status"><option value="pendente">Aguardando contrato</option><option value="ativa">Ativa (contrato assinado)</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada (derruba o acesso)</option></select></label><label style="display:flex;gap:6px;align-items:center">Comissão da Velocita (%) <input id="d-pct" type="number" min="0" max="100" step="0.5" value="${p.commissionPct}" style="width:90px"></label><button class="btn-secondary btn-sm" id="d-savepct">Salvar comissão</button></div>
        <div class="pc-actions"><button class="btn-primary btn-sm" id="d-invite">Gerar link de acesso</button><button class="btn-secondary btn-sm" id="d-reset">Apagar senha (parceiro cria outra)</button><button class="btn-secondary btn-sm" id="d-swap">Trocar matrícula</button><button class="btn-secondary btn-sm" id="d-del">Excluir parceria</button></div><div id="d-swapbox"></div>` : ''}
        ${(p.audit || []).length ? `<details style="margin-top:8px"><summary class="mt-note">Histórico de acessos e trocas</summary>${p.audit.slice().reverse().map((x) => `<p class="mt-note" style="margin:2px 0">${hm(x.at)} · ${esc(x.by)} · ${esc(x.what)}</p>`).join('')}</details>` : ''}`)}
      <div class="pc-kpis"><div class="mt-card pc-k"><span>Vendido no mês</span><b>${brl(s.month.revenue)}</b></div><div class="mt-card pc-k"><span>Custos no mês</span><b>${brl(s.month.cost)}</b></div><div class="mt-card pc-k"><span>Resultado do mês</span><b class="${s.month.profit >= 0 ? 'oc-g' : 'oc-r'}">${brl(s.month.profit)}</b></div><div class="mt-card pc-k"><span>Comissão Velocita (${p.commissionPct}%)</span><b class="oc-g">${brl(s.month.commission)}</b></div><div class="mt-card pc-k"><span>A pagar ao parceiro</span><b>${brl(s.toReceive)}</b></div></div>
      <div id="d-conn"></div>
      ${section('Chat com o parceiro', `<div class="pc-chat" id="d-chat">${p.messages.slice(-60).map((m) => `<div class="pc-m ${m.from === 'velocita' ? 'me' : 'them'}"><b>${esc(m.name)}</b> ${esc(m.text)}<small>${hm(m.at)}</small></div>`).join('') || '<p class="mt-note">Sem mensagens.</p>'}</div><div class="pc-actions"><input id="d-msg" placeholder="Responder ao parceiro..." style="flex:1"><button class="btn-primary btn-sm" id="d-send">Enviar</button></div>`)}
      ${section(`Ordens do parceiro (${p.orders.length})`, p.orders.length ? `<div class="pc-scroll"><table class="data-table"><thead><tr><th>#</th><th>Pedido</th><th>Data</th><th>Situação</th></tr></thead><tbody>${p.orders.slice().reverse().map((o) => `<tr><td>${o.number}</td><td>${esc(o.items)}${o.note ? `<br><small>${esc(o.note)}</small>` : ''}</td><td>${dt(o.createdAt)}</td><td>${e ? `<select data-ord="${o.id}">${['nova', 'andamento', 'concluida', 'cancelada'].map((x) => `<option value="${x}" ${o.status === x ? 'selected' : ''}>${({ nova: 'Nova', andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' })[x]}</option>`).join('')}</select>` : o.status}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note">Nenhuma ordem.</p>')}
      ${section('Vendas do parceiro', `${e ? `<div class="pc-form">${fld('s-order', 'Nº do pedido (marketplace)')}${fld('s-prod', 'Produto')}${fld('s-qty', 'Qtd', 'number')}${fld('s-val', 'Valor vendido (R$)')}${fld('s-cost', 'Custo (R$)')}${fld('s-date', 'Data', 'date')}<button class="btn-primary btn-sm" id="s-add">Lançar venda</button></div>` : ''}${p.sales.length ? `<div class="pc-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Pedido</th><th>Produto</th><th>Un.</th><th>Vendido</th><th>Custo</th><th></th></tr></thead><tbody>${p.sales.slice(-30).reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(x.orderNumber || '—')}</td><td>${esc(x.product)}</td><td>${x.qty}</td><td>${brl(x.value)}</td><td>${brl(x.cost)}</td><td>${e ? `<button class="btn-secondary btn-sm" data-delsale="${x.id}">Remover</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note">Sem vendas lançadas.</p>'}`)}
      ${section('Pagamentos ao parceiro', `${e ? `<div class="pc-form">${fld('y-val', 'Valor (R$)')}${fld('y-date', 'Data', 'date')}${fld('y-note', 'Observação')}<select id="y-st"><option value="previsto">Previsto</option><option value="recebido">Pago</option></select><button class="btn-primary btn-sm" id="y-add">Lançar</button></div>` : ''}${p.payouts.length ? `<table class="data-table"><thead><tr><th>Data</th><th>Valor</th><th>Situação</th><th>Obs.</th><th></th></tr></thead><tbody>${p.payouts.slice().reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${brl(x.value)}</td><td>${x.status === 'recebido' ? 'Pago' : 'Previsto'}</td><td>${esc(x.note)}</td><td>${e ? `${x.status !== 'recebido' ? `<button class="btn-secondary btn-sm" data-paid="${x.id}">Marcar pago</button> ` : ''}<button class="btn-secondary btn-sm" data-delpay="${x.id}">Remover</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="mt-note">Nenhum pagamento lançado.</p>'}`)}
      ${section('Notas fiscais', `${e ? `<div class="pc-form">${fld('i-num', 'Número')}<select id="i-kind"><option value="produto">Produto</option><option value="servico">Serviço</option></select>${fld('i-val', 'Valor (R$)')}<input id="i-file" type="file"><button class="btn-primary btn-sm" id="i-add">Enviar NF ao parceiro</button></div>` : ''}${p.invoices.length ? `<table class="data-table"><tbody>${p.invoices.slice().reverse().map((n) => `<tr><td>NF ${esc(n.number || '—')} · ${n.kind === 'servico' ? 'Serviço' : 'Produto'}${n.orderNumber ? `<br><small>pedido ${esc(n.orderNumber)}</small>` : ''}</td><td>${brl(n.value)}</td><td>${n.from === 'partner' ? 'do parceiro' : 'da Velocita'} · ${dt(n.date)}</td><td>${n.fileId ? `<a href="/api/parcerias-files/${n.fileId}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="mt-note">Nenhuma nota.</p>'}`)}
      ${section('Lojas, anúncios e painéis do parceiro', `${e ? `<div class="pc-form">${fld('l-label', 'Nome (ex.: Loja Mercado Livre, Power BI)')}${fld('l-url', 'Link https://...')}<button class="btn-primary btn-sm" id="l-add">Adicionar</button></div>` : ''}${p.links.map((l) => `<div class="pc-link"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a>${e ? `<button class="btn-secondary btn-sm" data-dellink="${l.id}">Remover</button>` : ''}</div>`).join('') || '<p class="mt-note">Nenhum link.</p>'}`)}
      ${p.suggestions.length ? section('Sugestões do parceiro', p.suggestions.slice().reverse().map((x) => `<p style="margin:6px 0">${esc(x.text)} <small>${hm(x.at)}</small></p>`).join('')) : ''}`;
    const sel = $('d-status'); if (sel) { sel.value = p.status; sel.onchange = async () => { try { await api(`/api/parcerias/${p.id}`, { method: 'PUT', body: JSON.stringify({ status: sel.value }) }); toast('Situação atualizada.'); refresh(); } catch (er) { toast(er.message); } }; }
    const act = (id, fn) => { const el = $(id); if (el) el.onclick = async () => { try { await fn(); await refresh(); } catch (er) { toast(er.message); } }; };
    const post = (k, body) => api(`/api/parcerias/${p.id}/${k}`, { method: 'POST', body: JSON.stringify(body) });
    $('pc-back').onclick = () => { P.open = null; P.cur = null; refresh(); };
    act('d-reset', async () => { if (!confirm('Apagar a senha do parceiro? Ele cria uma nova no próximo acesso.')) return; await post('reset-access', {}); toast('Senha apagada.'); });
    act('d-savepct', async () => { await api(`/api/parcerias/${p.id}`, { method: 'PUT', body: JSON.stringify({ commissionPct: $('d-pct').value }) }); toast('Comissão salva.'); });
    if ($('d-showpw')) $('d-showpw').onclick = async () => { try { const r = await api(`/api/parcerias/${p.id}/password`); $('d-pw').textContent = r.password || r.note || '—'; $('d-showpw').style.display = 'none'; } catch (er) { toast(er.message); } };
    if ($('d-swap')) $('d-swap').onclick = () => swapBox(p);
    if ($('d-invite')) $('d-invite').onclick = () => invitePop(p);
    act('d-del', async () => { if (!confirm('Excluir esta parceria e todos os dados dela? Não dá para desfazer.')) return; await api(`/api/parcerias/${p.id}`, { method: 'DELETE' }); P.open = null; P.cur = null; });
    act('d-send', async () => { const t = $('d-msg').value.trim(); if (!t) return; await post('messages', { text: t }); });
    act('s-add', async () => { await post('sales', { orderNumber: $('s-order').value, product: $('s-prod').value, qty: $('s-qty').value, value: $('s-val').value, cost: $('s-cost').value, date: $('s-date').value }); toast('Venda lançada. O parceiro foi avisado.'); });
    act('y-add', async () => { await post('payouts', { value: $('y-val').value, date: $('y-date').value, note: $('y-note').value, status: $('y-st').value }); toast('Pagamento lançado. O parceiro foi avisado.'); });
    act('l-add', async () => { await post('links', { label: $('l-label').value, url: $('l-url').value }); });
    act('i-add', async () => {
      const f = $('i-file').files[0]; const body = { number: $('i-num').value, kind: $('i-kind').value, value: $('i-val').value };
      if (f) { body.mime = f.type; body.name = f.name; body.dataBase64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); }); }
      await post('invoices', body); toast('Nota enviada ao parceiro.');
    });
    document.querySelectorAll('[data-delsale]').forEach((b) => { b.onclick = async () => { await api(`/api/parcerias/${p.id}/sales/${b.dataset.delsale}`, { method: 'DELETE' }); refresh(); }; });
    document.querySelectorAll('[data-delpay]').forEach((b) => { b.onclick = async () => { await api(`/api/parcerias/${p.id}/payouts/${b.dataset.delpay}`, { method: 'DELETE' }); refresh(); }; });
    document.querySelectorAll('[data-dellink]').forEach((b) => { b.onclick = async () => { await api(`/api/parcerias/${p.id}/links/${b.dataset.dellink}`, { method: 'DELETE' }); refresh(); }; });
    document.querySelectorAll('[data-paid]').forEach((b) => { b.onclick = async () => { await api(`/api/parcerias/${p.id}/payouts/${b.dataset.paid}`, { method: 'PUT', body: JSON.stringify({ status: 'recebido' }) }); refresh(); }; });
    document.querySelectorAll('[data-ord]').forEach((s2) => { s2.onchange = async () => { await api(`/api/parcerias/${p.id}/orders/${s2.dataset.ord}`, { method: 'PUT', body: JSON.stringify({ status: s2.value }) }); toast('Ordem atualizada. O parceiro foi avisado.'); refresh(); }; });
    loadConns(p);
    const chat = $('d-chat'); if (chat) { chat.scrollTop = chat.scrollHeight; if (p.summary.unreadFromPartner) api(`/api/parcerias/${p.id}/read`, { method: 'POST' }).catch(() => {}); }
  }

  // ---------- Pipeline: matrícula da empresa dentro do negócio ----------
  async function dealBlock(dealId) {
    try {
      const p = await api(`/api/parcerias/by-deal/${dealId}`); const anchor = $('dd-org-address'); if (!anchor) return;
      let box = $('dd-mat'); if (!box) { box = document.createElement('div'); box.id = 'dd-mat'; box.className = 'dd-pay'; anchor.closest('.dd-meta-item').after(box); }
      const canSwap = !!(window.state && window.state.me && ['matriz', 'admin'].includes(window.state.me.role));
      box.innerHTML = `<div class="dd-pay-head"><b>Matrícula da empresa</b> <small>(a "identidade" da parceria)</small></div><div class="dd-mat-row"><code>${esc(p.matricula)}</code><button type="button" class="btn-secondary btn-sm" id="dd-mat-copy">Copiar</button><button type="button" class="btn-primary btn-sm" id="dd-mat-link">Link de acesso</button>${canSwap ? '<button type="button" class="btn-secondary btn-sm" id="dd-mat-chg">Trocar</button>' : ''}<small>${p.status === 'pendente' ? 'acesso ao portal aguardando contrato' : p.activated ? 'portal ativo' : 'aguardando 1º acesso'}</small></div><div id="dd-mat-swap"></div>`;
      $('dd-mat-copy').onclick = () => { try { navigator.clipboard.writeText(p.matricula); toast('Matrícula copiada.'); } catch (e) { toast(p.matricula); } };
      $('dd-mat-link').onclick = () => invitePop(p);
      if ($('dd-mat-chg')) $('dd-mat-chg').onclick = () => swapBox({ id: p.id, company: p.company }, (r) => dealBlock(dealId));
    } catch (e) { /* negócio sem permissão ou removido */ }
  }
  window.addEventListener('crm-ready', () => {
    const base = window.openDealDetail;
    if (typeof base === 'function') window.openDealDetail = async function openDealDetail(id) { const r = await base(id); dealBlock(id); return r; };
  });
})();
