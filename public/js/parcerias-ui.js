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
  const PORTAL = () => (location.hostname.includes('localhost') ? `${location.origin}/parcerias/` : 'https://parcerias.velocitaglobal.com.br');
  const ST = { ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada' };

  window.initParcerias = async function () {
    P.canEdit = !!(window.state && window.state.me && ['matriz', 'admin'].includes(window.state.me.role));
    clearInterval(P.timer);
    P.timer = setInterval(() => { const v = $('view-parcerias'); if (v && v.classList.contains('active') && !document.hidden && !document.activeElement.matches('input,textarea,select')) refresh(true); }, 8000);
    await refresh(false);
  };

  async function refresh(silent) {
    try { P.list = await api('/api/parcerias'); if (P.open) P.cur = await api(`/api/parcerias/${P.open}`); draw(); } catch (e) { if (!silent) $('pc-root').innerHTML = `<p>${esc(e.message)}</p>`; }
  }

  function draw() { if (P.open && P.cur) return drawDetail(); drawList(); }

  function drawList() {
    const L = P.list; const act = L.filter((p) => p.status === 'ativa').length; const pau = L.filter((p) => p.status === 'pausada').length;
    const rec = L.reduce((a, p) => a + p.summary.toReceive, 0); const ord = L.reduce((a, p) => a + p.summary.openOrders, 0); const unr = L.reduce((a, p) => a + p.summary.unreadFromPartner, 0);
    const k = (l, v, c) => `<div class="mt-card pc-k"><span>${l}</span><b class="${c || ''}">${v}</b></div>`;
    $('pc-root').innerHTML = `<div class="pc-kpis">${k('Parcerias ativas', act, 'oc-g')}${k('Pausadas', pau, pau ? 'oc-r' : '')}${k('A pagar aos parceiros', brl(rec))}${k('Ordens abertas', ord)}${k('Mensagens novas', unr, unr ? 'oc-r' : '')}</div>
      <div class="mt-card"><div class="pc-head"><h3>Parceiros</h3>${P.canEdit ? '<button class="btn-primary btn-sm" id="pc-new">+ Nova parceria</button>' : ''}</div>
      <p class="mt-note">Portal do parceiro: <b>${esc(PORTAL())}</b> · O parceiro entra com a matrícula + código de ativação que você gera aqui, depois da assinatura do contrato.</p>
      ${L.length ? `<div class="pc-scroll"><table class="data-table"><thead><tr><th>Parceiro</th><th>Matrícula</th><th>Situação</th><th>Vendido no mês</th><th>A pagar</th><th>Ordens</th><th>Chat</th><th>Último acesso</th><th></th></tr></thead><tbody>${L.map((p) => `<tr><td><b>${esc(p.company || p.name)}</b><br><small>${esc(p.name)}</small></td><td><code>${esc(p.matricula)}</code></td><td><span class="pc-st pc-${p.status}">${ST[p.status]}</span>${p.paused.on ? `<br><small>pausou: ${esc(p.paused.reason || 'sem motivo')}</small>` : ''}${p.activated ? '' : '<br><small>aguardando 1º acesso</small>'}</td><td>${brl(p.summary.month.revenue)}</td><td>${brl(p.summary.toReceive)}</td><td>${p.summary.openOrders || '—'}</td><td>${p.summary.unreadFromPartner ? `<span class="pc-dot">${p.summary.unreadFromPartner}</span>` : '—'}</td><td>${p.lastSeen ? hm(p.lastSeen) : 'nunca'}</td><td><button class="btn-secondary btn-sm" data-open="${p.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note" style="padding:14px 0">Nenhuma parceria ainda. Clique em <b>Nova parceria</b> para gerar a primeira matrícula.</p>'}</div>`;
    $('pc-root').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => { P.open = b.dataset.open; P.cur = await api(`/api/parcerias/${P.open}`); drawDetail(); }));
    if ($('pc-new')) $('pc-new').onclick = newForm;
  }

  function newForm() {
    $('pc-root').insertAdjacentHTML('afterbegin', `<div class="mt-card" id="pc-newbox"><h3>Nova parceria</h3><div class="pc-form"><label>Nome do responsável<input id="n-name"></label><label>Empresa / loja<input id="n-company"></label><label>E-mail<input id="n-email" type="email"></label><label>Telefone / WhatsApp<input id="n-phone"></label><label>Contrato assinado em<input id="n-date" type="date"></label><label>Observações<input id="n-notes"></label></div><div class="pc-actions"><button class="btn-primary btn-sm" id="n-save">Gerar matrícula</button><button class="btn-secondary btn-sm" id="n-cancel">Cancelar</button></div></div>`);
    $('n-cancel').onclick = () => $('pc-newbox').remove();
    $('n-save').onclick = async () => { try { const p = await api('/api/parcerias', { method: 'POST', body: JSON.stringify({ name: $('n-name').value, company: $('n-company').value, email: $('n-email').value, phone: $('n-phone').value, contractDate: $('n-date').value, notes: $('n-notes').value }) }); P.open = p.id; P.cur = p; toast('Parceria criada.'); drawDetail(); } catch (e) { toast(e.message); } };
  }

  const section = (title, body) => `<div class="mt-card"><h3>${title}</h3>${body}</div>`;
  function drawDetail() {
    const p = P.cur; const s = p.summary; const e = P.canEdit;
    const fld = (id, ph, t) => `<input id="${id}" placeholder="${ph}" ${t ? `type="${t}"` : ''}>`;
    $('pc-root').innerHTML = `<div class="pc-head"><button class="btn-secondary btn-sm" id="pc-back">← Parcerias</button><h3 style="margin:0">${esc(p.company || p.name)}</h3><span class="pc-st pc-${p.status}">${ST[p.status]}</span></div>
      ${section('Acesso do parceiro', `<p style="margin:0 0 8px">Matrícula: <b><code style="font-size:18px">${esc(p.matricula)}</code></b> ${p.activated ? '· <span class="oc-g">já ativada</span>' : `· Código de ativação: <b><code style="font-size:18px">${esc(p.pendingCode)}</code></b>`}</p><p class="mt-note">Entregue ao parceiro: o endereço <b>${esc(PORTAL())}</b>, a matrícula${p.activated ? '' : ' e o código (uso único; ele cria a própria senha)'}. Último acesso: ${p.lastSeen ? hm(p.lastSeen) : 'nunca'}.</p>
        ${e ? `<div class="pc-actions"><button class="btn-secondary btn-sm" id="d-reset">Gerar novo código / resetar acesso</button><select id="d-status"><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada (derruba o acesso)</option></select><button class="btn-secondary btn-sm" id="d-del">Excluir parceria</button></div>` : ''}`)}
      <div class="pc-kpis"><div class="mt-card pc-k"><span>Vendido no mês</span><b>${brl(s.month.revenue)}</b></div><div class="mt-card pc-k"><span>Custos no mês</span><b>${brl(s.month.cost)}</b></div><div class="mt-card pc-k"><span>Resultado do mês</span><b class="${s.month.profit >= 0 ? 'oc-g' : 'oc-r'}">${brl(s.month.profit)}</b></div><div class="mt-card pc-k"><span>A pagar ao parceiro</span><b>${brl(s.toReceive)}</b></div></div>
      ${section('Chat com o parceiro', `<div class="pc-chat" id="d-chat">${p.messages.slice(-60).map((m) => `<div class="pc-m ${m.from === 'velocita' ? 'me' : 'them'}"><b>${esc(m.name)}</b> ${esc(m.text)}<small>${hm(m.at)}</small></div>`).join('') || '<p class="mt-note">Sem mensagens.</p>'}</div><div class="pc-actions"><input id="d-msg" placeholder="Responder ao parceiro..." style="flex:1"><button class="btn-primary btn-sm" id="d-send">Enviar</button></div>`)}
      ${section(`Ordens do parceiro (${p.orders.length})`, p.orders.length ? `<div class="pc-scroll"><table class="data-table"><thead><tr><th>#</th><th>Pedido</th><th>Data</th><th>Situação</th></tr></thead><tbody>${p.orders.slice().reverse().map((o) => `<tr><td>${o.number}</td><td>${esc(o.items)}${o.note ? `<br><small>${esc(o.note)}</small>` : ''}</td><td>${dt(o.createdAt)}</td><td>${e ? `<select data-ord="${o.id}">${['nova', 'andamento', 'concluida', 'cancelada'].map((x) => `<option value="${x}" ${o.status === x ? 'selected' : ''}>${({ nova: 'Nova', andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' })[x]}</option>`).join('')}</select>` : o.status}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note">Nenhuma ordem.</p>')}
      ${section('Vendas do parceiro', `${e ? `<div class="pc-form">${fld('s-prod', 'Produto')}${fld('s-qty', 'Qtd', 'number')}${fld('s-val', 'Valor vendido (R$)')}${fld('s-cost', 'Custo (R$)')}${fld('s-date', 'Data', 'date')}<button class="btn-primary btn-sm" id="s-add">Lançar venda</button></div>` : ''}${p.sales.length ? `<div class="pc-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Produto</th><th>Un.</th><th>Vendido</th><th>Custo</th><th></th></tr></thead><tbody>${p.sales.slice(-30).reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(x.product)}</td><td>${x.qty}</td><td>${brl(x.value)}</td><td>${brl(x.cost)}</td><td>${e ? `<button class="btn-secondary btn-sm" data-delsale="${x.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note">Sem vendas lançadas.</p>'}`)}
      ${section('Pagamentos ao parceiro', `${e ? `<div class="pc-form">${fld('y-val', 'Valor (R$)')}${fld('y-date', 'Data', 'date')}${fld('y-note', 'Observação')}<select id="y-st"><option value="previsto">Previsto</option><option value="recebido">Pago</option></select><button class="btn-primary btn-sm" id="y-add">Lançar</button></div>` : ''}${p.payouts.length ? `<table class="data-table"><thead><tr><th>Data</th><th>Valor</th><th>Situação</th><th>Obs.</th><th></th></tr></thead><tbody>${p.payouts.slice().reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${brl(x.value)}</td><td>${x.status === 'recebido' ? 'Pago' : 'Previsto'}</td><td>${esc(x.note)}</td><td>${e ? `${x.status !== 'recebido' ? `<button class="btn-secondary btn-sm" data-paid="${x.id}">Marcar pago</button> ` : ''}<button class="btn-secondary btn-sm" data-delpay="${x.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="mt-note">Nenhum pagamento lançado.</p>'}`)}
      ${section('Notas fiscais', `${e ? `<div class="pc-form">${fld('i-num', 'Número')}<select id="i-kind"><option value="produto">Produto</option><option value="servico">Serviço</option></select>${fld('i-val', 'Valor (R$)')}<input id="i-file" type="file"><button class="btn-primary btn-sm" id="i-add">Enviar NF ao parceiro</button></div>` : ''}${p.invoices.length ? `<table class="data-table"><tbody>${p.invoices.slice().reverse().map((n) => `<tr><td>NF ${esc(n.number || '—')} · ${n.kind === 'servico' ? 'Serviço' : 'Produto'}</td><td>${brl(n.value)}</td><td>${n.from === 'partner' ? 'do parceiro' : 'da Velocita'} · ${dt(n.date)}</td><td>${n.fileId ? `<a href="/api/parcerias-files/${n.fileId}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="mt-note">Nenhuma nota.</p>'}`)}
      ${section('Lojas, anúncios e painéis do parceiro', `${e ? `<div class="pc-form">${fld('l-label', 'Nome (ex.: Loja Mercado Livre, Power BI)')}${fld('l-url', 'Link https://...')}<button class="btn-primary btn-sm" id="l-add">Adicionar</button></div>` : ''}${p.links.map((l) => `<div class="pc-link"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a>${e ? `<button class="btn-secondary btn-sm" data-dellink="${l.id}">✕</button>` : ''}</div>`).join('') || '<p class="mt-note">Nenhum link.</p>'}`)}
      ${p.suggestions.length ? section('Sugestões do parceiro', p.suggestions.slice().reverse().map((x) => `<p style="margin:6px 0">💡 ${esc(x.text)} <small>${hm(x.at)}</small></p>`).join('')) : ''}`;
    const sel = $('d-status'); if (sel) { sel.value = p.status; sel.onchange = async () => { try { await api(`/api/parcerias/${p.id}`, { method: 'PUT', body: JSON.stringify({ status: sel.value }) }); toast('Situação atualizada.'); refresh(); } catch (er) { toast(er.message); } }; }
    const act = (id, fn) => { const el = $(id); if (el) el.onclick = async () => { try { await fn(); await refresh(); } catch (er) { toast(er.message); } }; };
    const post = (k, body) => api(`/api/parcerias/${p.id}/${k}`, { method: 'POST', body: JSON.stringify(body) });
    $('pc-back').onclick = () => { P.open = null; P.cur = null; refresh(); };
    act('d-reset', async () => { if (!confirm('Gerar um novo código e derrubar o acesso atual do parceiro?')) return; await post('reset-access', {}); toast('Novo código gerado.'); });
    act('d-del', async () => { if (!confirm('Excluir esta parceria e todos os dados dela? Não dá para desfazer.')) return; await api(`/api/parcerias/${p.id}`, { method: 'DELETE' }); P.open = null; P.cur = null; });
    act('d-send', async () => { const t = $('d-msg').value.trim(); if (!t) return; await post('messages', { text: t }); });
    act('s-add', async () => { await post('sales', { product: $('s-prod').value, qty: $('s-qty').value, value: $('s-val').value, cost: $('s-cost').value, date: $('s-date').value }); toast('Venda lançada. O parceiro foi avisado.'); });
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
    const chat = $('d-chat'); if (chat) { chat.scrollTop = chat.scrollHeight; if (p.summary.unreadFromPartner) api(`/api/parcerias/${p.id}/read`, { method: 'POST' }).catch(() => {}); }
  }
})();
