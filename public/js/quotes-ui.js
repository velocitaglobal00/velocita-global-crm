/* Orçamentos: lista, editor, catálogo, empresas emissoras e impressão (A4). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const n2 = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');
  const isAdmin = () => window.state && window.state.me && ['matriz', 'admin'].includes(window.state.me.role);
  const STATUS = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado' };
  const Q = { tab: 'lista', settings: null, catalog: [], list: [], d: null, loaded: false, filter: '', status: '' };

  // mesma conta do servidor (o servidor recalcula ao salvar)
  function calc(q) {
    const mode = q.taxMode === 'included' ? 'included' : 'add'; let gross = 0, itemDiscount = 0, subtotal = 0, tax = 0, itemsTotal = 0;
    const lines = (q.items || []).map((it) => {
      const g = num(it.qty) * num(it.price); const d = g * clamp(num(it.discountPct), 0, 100) / 100; const net = g - d; const rate = clamp(num(it.taxPct), 0, 100) / 100;
      const t = mode === 'add' ? net * rate : net - net / (1 + rate); const total = mode === 'add' ? net + t : net;
      gross += g; itemDiscount += d; subtotal += net; tax += t; itemsTotal += total; return { gross: r2(g), discount: r2(d), net: r2(net), tax: r2(t), total: r2(total) };
    });
    const gd = itemsTotal * clamp(num(q.discountPct), 0, 100) / 100 + Math.max(0, num(q.discountValue)); const fr = Math.max(0, num(q.freight));
    return { lines, gross: r2(gross), itemDiscount: r2(itemDiscount), subtotal: r2(subtotal), tax: r2(tax), itemsTotal: r2(itemsTotal), globalDiscount: r2(gd), freight: r2(fr), total: r2(Math.max(0, itemsTotal - gd) + fr), taxMode: mode };
  }

  window.initOrcamentos = async function () {
    if (!Q.loaded) {
      try { [Q.settings, Q.catalog, Q.list] = await Promise.all([api('/api/quotes/settings'), api('/api/quotes/catalog'), api('/api/quotes')]); } catch (e) { $('oc-root').innerHTML = `<p>Não foi possível abrir os orçamentos: ${esc(e.message)}</p>`; return; }
      Q.loaded = true;
    } else { try { Q.list = await api('/api/quotes'); } catch (e) { /* mantém */ } }
    if (Q.d) return renderEditor(); render();
  };

  function shell(body) {
    const tabs = [['lista', 'Orçamentos'], ['catalogo', 'Catálogo de produtos'], ['empresas', 'Empresas emissoras']];
    $('oc-root').innerHTML = `<div class="mt-tabs" role="tablist">${tabs.map(([k, v]) => `<button class="mt-tab" role="tab" aria-selected="${Q.tab === k}" data-t="${k}">${v}</button>`).join('')}</div>${body}`;
    $('oc-root').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { Q.tab = b.dataset.t; Q.d = null; render(); }));
  }
  function render() { if (Q.tab === 'catalogo') return renderCatalog(); if (Q.tab === 'empresas') return renderIssuers(); renderList(); }

  // ---------------- lista ----------------
  function renderList() {
    const f = Q.filter.toLowerCase(); const rows = Q.list.filter((q) => (!Q.status || q.status === Q.status) && (!f || `${q.number} ${q.customerName}`.toLowerCase().includes(f)));
    const tot = rows.reduce((s, q) => s + (q.total || 0), 0);
    shell(`<div class="oc-bar"><input id="oc-q" class="filter-input" placeholder="Buscar por número ou cliente..." value="${esc(Q.filter)}"><select id="oc-st" class="filter-input"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${Q.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select><button class="btn-primary" id="oc-new">+ Novo orçamento</button></div>
      <div class="mt-card"><p class="mt-note">${rows.length} orçamento(s) · soma ${brl(tot)}</p>
      ${rows.length ? `<table class="data-table oc-table"><thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((q) => `<tr data-id="${q.id}"><td><b>${esc(q.number)}</b></td><td>${esc(q.customerName || '—')}<div class="eq-sub">${esc(q.issuerName)} · ${esc(q.createdByName || '')}</div></td><td>${dBR(q.date)}</td><td><b>${brl(q.total)}</b></td><td><span class="lg-pill oc-st-${q.status}">${STATUS[q.status]}</span></td>
        <td class="oc-acts"><button class="btn-secondary btn-sm" data-a="open">Abrir</button><button class="btn-primary btn-sm" data-a="print">Imprimir</button><button class="btn-secondary btn-sm" data-a="dup">Duplicar</button><button class="btn-secondary btn-sm" data-a="del">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p class="mt-note">Nenhum orçamento ainda. Clique em <b>Novo orçamento</b>.</p>'}</div>`);
    $('oc-new').onclick = () => newQuote();
    $('oc-q').oninput = (e) => { Q.filter = e.target.value; const p = e.target.selectionStart; renderList(); const el = $('oc-q'); el.focus(); el.setSelectionRange(p, p); };
    $('oc-st').onchange = (e) => { Q.status = e.target.value; renderList(); };
    $('oc-root').querySelectorAll('tr[data-id] [data-a]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('tr').dataset.id; const a = b.dataset.a;
      try {
        if (a === 'open') { Q.d = await api(`/api/quotes/${id}`); renderEditor(); }
        if (a === 'print') { printQuote(await api(`/api/quotes/${id}`)); }
        if (a === 'dup') { Q.d = await api(`/api/quotes/${id}/duplicate`, { method: 'POST' }); toast('Cópia criada como rascunho.'); renderEditor(); }
        if (a === 'del' && confirm('Excluir este orçamento? Não dá para desfazer.')) { await api(`/api/quotes/${id}`, { method: 'DELETE' }); Q.list = await api('/api/quotes'); renderList(); }
      } catch (e) { toast(e.message); }
    }));
  }

  // ---------------- editor ----------------
  function newQuote() {
    const df = Q.settings.defaults; const dt = new Date(); const iso = (x) => x.toLocaleDateString('sv-SE'); const v = new Date(dt.getTime() + df.validityDays * 86400000);
    Q.d = { id: null, number: '(novo)', date: iso(dt), validUntil: iso(v), status: 'rascunho', issuerId: Q.settings.issuers[0].id, customer: { orgId: null, contactId: null, name: '', doc: '', contactName: '', email: '', phone: '', address: '' },
      items: [blankItem()], taxMode: df.taxMode, discountPct: 0, discountValue: 0, freight: 0, payment: df.payment, delivery: df.delivery, warranty: df.warranty, notes: '', terms: df.terms, dealId: null };
    renderEditor();
  }
  const blankItem = () => ({ sku: '', name: '', description: '', unit: 'un', qty: 1, price: 0, discountPct: 0, taxPct: 0 });

  function renderEditor() {
    const d = Q.d; const st = window.state; const orgs = st.organizations.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const contacts = st.contacts.filter((c) => !d.customer.orgId || c.orgId === d.customer.orgId);
    const deals = st.deals.filter((x) => x.status === 'open' || x.id === d.dealId);
    shell(`<div class="oc-edit">
      <div class="oc-head"><button class="btn-secondary" id="oc-back">← Voltar</button><h3>${esc(d.number)}</h3><div class="oc-head-acts"><button class="btn-secondary" id="oc-save">Salvar</button><button class="btn-primary" id="oc-print">Salvar e imprimir</button></div></div>

      <section class="dm-step"><div class="dm-h"><span class="dm-n">1</span><div><b>Quem emite e quem recebe</b><small>A empresa emissora aparece no topo do orçamento. O cliente pode vir do CRM ou ser digitado.</small></div></div>
        <div class="form-row"><div class="form-group"><label>Empresa emissora</label><select id="f-issuer">${Q.settings.issuers.map((i) => `<option value="${i.id}"${i.id === d.issuerId ? ' selected' : ''}>${esc(i.name)}${i.cnpj ? ' · ' + esc(i.cnpj) : ''}</option>`).join('')}</select></div>
          <div class="form-group"><label>Cliente já cadastrado (Empresas do CRM)</label><select id="f-org"><option value="">Digitar manualmente</option>${orgs.map((o) => `<option value="${o.id}"${o.id === d.customer.orgId ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div></div>
        <div class="form-row"><div class="form-group"><label>Cliente / razão social *</label><input id="c-name" value="${esc(d.customer.name)}"></div><div class="form-group"><label>CNPJ / CPF</label><input id="c-doc" value="${esc(d.customer.doc)}"></div></div>
        <div class="form-row"><div class="form-group"><label>Contato (pessoa)</label><input id="c-contact" list="oc-contacts" value="${esc(d.customer.contactName)}"><datalist id="oc-contacts">${contacts.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div><div class="form-group"><label>E-mail</label><input id="c-email" value="${esc(d.customer.email)}"></div><div class="form-group"><label>Telefone</label><input id="c-phone" value="${esc(d.customer.phone)}"></div></div>
        <div class="form-group"><label>Endereço</label><input id="c-address" value="${esc(d.customer.address)}"></div>
        <div class="form-row"><div class="form-group"><label>Data</label><input type="date" id="f-date" value="${esc(d.date)}"></div><div class="form-group"><label>Válido até</label><input type="date" id="f-valid" value="${esc(d.validUntil)}"></div><div class="form-group"><label>Status</label><select id="f-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${d.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div><div class="form-group"><label>Negócio do Pipeline</label><select id="f-deal"><option value="">Sem vínculo</option>${deals.map((x) => `<option value="${x.id}"${x.id === d.dealId ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div></div></section>

      <section class="dm-step"><div class="dm-h"><span class="dm-n">2</span><div><b>Itens: produtos, equipamentos e serviços</b><small>Digite o SKU para puxar do catálogo, ou preencha na mão. O total de cada linha atualiza sozinho.</small></div></div>
        <div class="oc-items-wrap"><table class="oc-items"><thead><tr><th>SKU</th><th>Produto / equipamento e descrição</th><th>Un</th><th>Qtd</th><th>Valor unit. (R$)</th><th>Desc. %</th><th>Imposto %</th><th>Total</th><th></th></tr></thead><tbody id="oc-rows"></tbody></table></div>
        <datalist id="oc-skus">${Q.catalog.filter((p) => p.active !== false && p.sku).map((p) => `<option value="${esc(p.sku)}">${esc(p.name)}</option>`).join('')}</datalist>
        <div class="oc-row-acts"><button class="btn-secondary" id="oc-add">+ Adicionar item</button><button class="btn-secondary" id="oc-addcat">+ Do catálogo (por nome)</button></div></section>

      <section class="dm-step"><div class="dm-h"><span class="dm-n">3</span><div><b>Impostos, descontos e condições</b><small>Imposto por item. "Somado" acrescenta ao preço; "incluso" já está dentro do valor.</small></div></div>
        <div class="form-row"><div class="form-group"><label>Imposto</label><select id="f-taxmode"><option value="add"${d.taxMode === 'add' ? ' selected' : ''}>Somado ao valor</option><option value="included"${d.taxMode === 'included' ? ' selected' : ''}>Já incluso no valor</option></select></div><div class="form-group"><label>Desconto geral %</label><input id="f-dpct" inputmode="decimal" value="${d.discountPct || ''}"></div><div class="form-group"><label>Desconto em R$</label><input id="f-dval" inputmode="decimal" value="${d.discountValue || ''}"></div><div class="form-group"><label>Frete / outras despesas (R$)</label><input id="f-freight" inputmode="decimal" value="${d.freight || ''}"></div></div>
        <div class="form-row"><div class="form-group"><label>Condições de pagamento</label><input id="f-pay" value="${esc(d.payment)}"></div><div class="form-group"><label>Prazo de entrega</label><input id="f-del" value="${esc(d.delivery)}"></div><div class="form-group"><label>Garantia</label><input id="f-war" value="${esc(d.warranty)}"></div></div>
        <div class="form-group"><label>Observações (aparecem no orçamento)</label><textarea id="f-notes" rows="2">${esc(d.notes)}</textarea></div><div class="form-group"><label>Termos e condições</label><textarea id="f-terms" rows="2">${esc(d.terms)}</textarea></div></section>
      <div class="oc-total" id="oc-totals"></div></div>`);
    drawRows(); drawTotals();
    $('oc-back').onclick = async () => { Q.d = null; try { Q.list = await api('/api/quotes'); } catch (e) { /* ok */ } render(); };
    $('oc-save').onclick = () => save(false); $('oc-print').onclick = () => save(true);
    $('oc-add').onclick = () => { Q.d.items.push(blankItem()); drawRows(); };
    $('oc-addcat').onclick = () => pickFromCatalog();
    const bind = (id, fn) => { const e = $(id); if (e) { e.addEventListener('input', fn); e.addEventListener('change', fn); } };
    bind('f-issuer', (e) => { Q.d.issuerId = e.target.value; });
    bind('f-org', (e) => {
      const o = window.state.organizations.find((x) => x.id === e.target.value); Q.d.customer.orgId = o ? o.id : null; Q.d.customer.contactId = null;
      if (o) { Object.assign(Q.d.customer, { name: o.name || '', doc: o.cnpj || '', phone: o.phone || o.mobile || '', address: o.address || '' }); } renderEditor();
    });
    [['c-name', 'name'], ['c-doc', 'doc'], ['c-email', 'email'], ['c-phone', 'phone'], ['c-address', 'address']].forEach(([id, k]) => bind(id, (e) => { Q.d.customer[k] = e.target.value; }));
    bind('c-contact', (e) => { Q.d.customer.contactName = e.target.value; const c = window.state.contacts.find((x) => x.name === e.target.value && (!Q.d.customer.orgId || x.orgId === Q.d.customer.orgId)); if (c) { Q.d.customer.contactId = c.id; if (c.email && !$('c-email').value) { $('c-email').value = c.email; Q.d.customer.email = c.email; } if (c.phone && !$('c-phone').value) { $('c-phone').value = c.phone; Q.d.customer.phone = c.phone; } } });
    bind('f-date', (e) => { Q.d.date = e.target.value; }); bind('f-valid', (e) => { Q.d.validUntil = e.target.value; }); bind('f-status', (e) => { Q.d.status = e.target.value; }); bind('f-deal', (e) => { Q.d.dealId = e.target.value || null; });
    bind('f-taxmode', (e) => { Q.d.taxMode = e.target.value; drawRows(); drawTotals(); });
    [['f-dpct', 'discountPct'], ['f-dval', 'discountValue'], ['f-freight', 'freight']].forEach(([id, k]) => bind(id, (e) => { Q.d[k] = num(e.target.value); drawTotals(); }));
    [['f-pay', 'payment'], ['f-del', 'delivery'], ['f-war', 'warranty'], ['f-notes', 'notes'], ['f-terms', 'terms']].forEach(([id, k]) => bind(id, (e) => { Q.d[k] = e.target.value; }));
  }

  function drawRows() {
    const c = calc(Q.d).lines;
    $('oc-rows').innerHTML = Q.d.items.map((it, i) => `<tr data-i="${i}"><td><input data-k="sku" list="oc-skus" value="${esc(it.sku)}" placeholder="SKU" style="min-width:90px"></td>
      <td><input data-k="name" value="${esc(it.name)}" placeholder="Nome do produto ou equipamento"><input data-k="description" value="${esc(it.description)}" placeholder="Descrição detalhada (opcional)" class="oc-desc"></td>
      <td><input data-k="unit" value="${esc(it.unit)}" style="width:54px"></td><td><input data-k="qty" inputmode="decimal" value="${it.qty}" style="width:70px"></td><td><input data-k="price" inputmode="decimal" value="${it.price || ''}" style="width:110px"></td>
      <td><input data-k="discountPct" inputmode="decimal" value="${it.discountPct || ''}" style="width:62px"></td><td><input data-k="taxPct" inputmode="decimal" value="${it.taxPct || ''}" style="width:62px"></td><td class="oc-line-total">${brl((c[i] || {}).total)}</td><td><button class="btn-secondary btn-sm" data-del aria-label="Remover item">✕</button></td></tr>`).join('');
    $('oc-rows').querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      tr.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('input', () => {
        const k = inp.dataset.k; const it = Q.d.items[i]; it[k] = ['qty', 'price', 'discountPct', 'taxPct'].includes(k) ? num(inp.value) : inp.value;
        if (k === 'sku') { const p = Q.catalog.find((x) => x.sku && x.sku.toLowerCase() === inp.value.trim().toLowerCase()); if (p) { fillFromProduct(it, p); drawRows(); } }
        const lines = calc(Q.d).lines; tr.querySelector('.oc-line-total').textContent = brl((lines[i] || {}).total); drawTotals();
      }));
      tr.querySelector('[data-del]').onclick = () => { Q.d.items.splice(i, 1); if (!Q.d.items.length) Q.d.items.push(blankItem()); drawRows(); drawTotals(); };
    });
  }
  function fillFromProduct(it, p) { Object.assign(it, { sku: p.sku || it.sku, name: p.name, description: p.description || '', unit: p.unit || 'un', price: p.price, taxPct: p.taxPct || 0 }); }
  function pickFromCatalog() {
    const list = Q.catalog.filter((p) => p.active !== false); if (!list.length) return toast('O catálogo está vazio. Cadastre os produtos na aba Catálogo.');
    const m = document.createElement('div'); m.className = 'modal-overlay show'; m.style.zIndex = 400;
    m.innerHTML = `<div class="modal" style="max-width:640px"><div class="modal-header"><h3>Adicionar do catálogo</h3><button class="modal-close" aria-label="Fechar">&times;</button></div><div class="modal-body" style="padding:14px"><input class="filter-input" id="pk-q" placeholder="Buscar por SKU ou nome..." style="width:100%;margin-bottom:10px"><div id="pk-list" style="max-height:50vh;overflow:auto"></div></div></div>`;
    document.body.appendChild(m); const close = () => m.remove(); m.querySelector('.modal-close').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
    const draw = () => { const q = $('pk-q').value.toLowerCase(); $('pk-list').innerHTML = list.filter((p) => `${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(q)).slice(0, 80).map((p) => `<button class="oc-pick" data-id="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.sku || 'sem SKU')} · ${brl(p.price)} / ${esc(p.unit)}</span></button>`).join('') || '<p class="mt-note">Nada encontrado.</p>'; $('pk-list').querySelectorAll('.oc-pick').forEach((b) => { b.onclick = () => { const p = Q.catalog.find((x) => x.id === b.dataset.id); const it = blankItem(); fillFromProduct(it, p); const last = Q.d.items[Q.d.items.length - 1]; if (last && !last.name && !last.sku) Q.d.items[Q.d.items.length - 1] = it; else Q.d.items.push(it); close(); drawRows(); drawTotals(); }; }); };
    $('pk-q').oninput = draw; draw(); $('pk-q').focus();
  }
  function drawTotals() {
    const t = calc(Q.d); const inc = t.taxMode === 'included';
    $('oc-totals').innerHTML = `<div class="oc-tot-grid"><div><span>Subtotal dos itens</span><b>${brl(t.subtotal)}</b></div><div><span>Impostos ${inc ? '(inclusos)' : '(somados)'}</span><b>${brl(t.tax)}</b></div><div><span>Descontos</span><b>${brl(t.itemDiscount + t.globalDiscount)}</b></div><div><span>Frete</span><b>${brl(t.freight)}</b></div><div class="oc-grand"><span>TOTAL</span><b>${brl(t.total)}</b></div></div>`;
  }
  async function save(thenPrint) {
    const d = Q.d; if (!d.customer.name.trim()) return toast('Informe o nome do cliente.');
    if (!d.items.some((i) => (i.name || i.sku) && num(i.qty) > 0)) return toast('Adicione pelo menos um item com quantidade.');
    try {
      const saved = d.id ? await api(`/api/quotes/${d.id}`, { method: 'PUT', body: JSON.stringify(d) }) : await api('/api/quotes', { method: 'POST', body: JSON.stringify(d) });
      Q.d = saved; toast(`Orçamento ${saved.number} salvo.`); renderEditor(); if (thenPrint) printQuote(saved);
    } catch (e) { toast(e.message); }
  }

  // ---------------- impressão ----------------
  function printQuote(q) {
    const i = q.issuer || {}; const t = q.totals || calc(q); const c = q.customer || {}; const inc = t.taxMode === 'included';
    const logo = location.origin + '/img/logo.webp';
    const rows = q.items.map((it, n) => { const l = t.lines[n] || {}; return `<tr><td class="c">${n + 1}</td><td>${esc(it.sku)}</td><td><b>${esc(it.name)}</b>${it.description ? `<div class="ds">${esc(it.description)}</div>` : ''}</td><td class="c">${esc(it.unit)}</td><td class="r">${n2(it.qty)}</td><td class="r">${n2(it.price)}</td><td class="r">${it.discountPct ? n2(it.discountPct) + '%' : '—'}</td><td class="r">${it.taxPct ? n2(it.taxPct) + '%' : '—'}</td><td class="r"><b>${n2(l.total)}</b></td></tr>`; }).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(q.number)} - ${esc(c.name)}</title><style>
      @page { size: A4; margin: 12mm 12mm 14mm; } *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#1b2433;font-size:11px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .top{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #f4821f;padding-bottom:10px} .brand{display:flex;gap:10px;align-items:center} .brand img{width:56px;height:56px;object-fit:contain} .brand b{font-size:16px;color:#1b2a4e;display:block} .brand div{line-height:1.45;color:#44506a}
      .doc{text-align:right} .doc h1{margin:0;font-size:20px;color:#1b2a4e;letter-spacing:.04em} .doc .n{font-size:14px;font-weight:700;color:#f4821f} .doc div{line-height:1.5}
      .box{border:1px solid #d5dce9;border-radius:6px;padding:8px 10px;margin-top:10px} .box h2{margin:0 0 4px;font-size:10px;letter-spacing:.12em;color:#f4821f;text-transform:uppercase} .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px} .grid span{color:#66728d}
      table{width:100%;border-collapse:collapse;margin-top:12px} th{background:#1b2a4e;color:#fff;padding:6px 6px;font-size:10px;text-align:left} td{padding:6px;border-bottom:1px solid #e1e6f0;vertical-align:top} tr{page-break-inside:avoid} .c{text-align:center} .r{text-align:right;white-space:nowrap} .ds{color:#66728d;font-size:10px;margin-top:2px;line-height:1.35}
      .tot{margin-left:auto;width:290px;margin-top:10px} .tot div{display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #e1e6f0} .tot .g{background:#f4821f;color:#0c1528;font-weight:800;font-size:14px;border:0;border-radius:4px;margin-top:4px;padding:8px}
      .cond{margin-top:12px} .cond p{margin:3px 0;line-height:1.5} .sign{display:flex;gap:40px;margin-top:46px} .sign div{flex:1;border-top:1px solid #1b2433;text-align:center;padding-top:4px;color:#44506a} .foot{margin-top:18px;text-align:center;color:#66728d;font-size:10px;border-top:1px solid #e1e6f0;padding-top:6px}
    </style></head><body>
      <div class="top"><div class="brand"><img src="${logo}" alt=""><div><b>${esc(i.name)}</b>${i.legalName ? esc(i.legalName) + '<br>' : ''}${i.cnpj ? 'CNPJ ' + esc(i.cnpj) + (i.ie ? ' · IE ' + esc(i.ie) : '') + '<br>' : ''}${esc(i.address)}${i.city ? ' · ' + esc(i.city) + (i.uf ? '/' + esc(i.uf) : '') : ''}${i.cep ? ' · CEP ' + esc(i.cep) : ''}<br>${esc(i.phone)}${i.email ? ' · ' + esc(i.email) : ''}${i.site ? ' · ' + esc(i.site) : ''}</div></div>
      <div class="doc"><h1>ORÇAMENTO</h1><div class="n">${esc(q.number)}</div><div>Data: ${dBR(q.date)}</div>${q.validUntil ? `<div>Válido até: <b>${dBR(q.validUntil)}</b></div>` : ''}<div>Vendedor: ${esc(q.createdByName || '')}</div></div></div>
      <div class="box"><h2>Cliente</h2><div class="grid"><div><b>${esc(c.name)}</b></div><div>${c.doc ? '<span>CNPJ/CPF:</span> ' + esc(c.doc) : ''}</div><div>${c.contactName ? '<span>A/C:</span> ' + esc(c.contactName) : ''}</div><div>${c.phone ? '<span>Telefone:</span> ' + esc(c.phone) : ''}</div><div>${c.email ? '<span>E-mail:</span> ' + esc(c.email) : ''}</div><div style="grid-column:1/-1">${c.address ? '<span>Endereço:</span> ' + esc(c.address) : ''}</div></div></div>
      <table><thead><tr><th class="c" style="width:24px">#</th><th style="width:70px">SKU</th><th>Produto / equipamento</th><th class="c" style="width:32px">Un</th><th class="r" style="width:46px">Qtd</th><th class="r" style="width:76px">Valor unit.</th><th class="r" style="width:48px">Desc.</th><th class="r" style="width:48px">Imposto</th><th class="r" style="width:82px">Total (R$)</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tot"><div><span>Subtotal dos itens</span><span>${brl(t.subtotal)}</span></div><div><span>Impostos ${inc ? '(inclusos no valor)' : '(somados)'}</span><span>${brl(t.tax)}</span></div>${t.itemDiscount + t.globalDiscount > 0 ? `<div><span>Descontos</span><span>- ${brl(t.itemDiscount + t.globalDiscount)}</span></div>` : ''}${t.freight ? `<div><span>Frete / despesas</span><span>${brl(t.freight)}</span></div>` : ''}<div class="g"><span>TOTAL</span><span>${brl(t.total)}</span></div></div>
      <div class="cond">${q.payment ? `<p><b>Pagamento:</b> ${esc(q.payment)}</p>` : ''}${q.delivery ? `<p><b>Prazo de entrega:</b> ${esc(q.delivery)}</p>` : ''}${q.warranty ? `<p><b>Garantia:</b> ${esc(q.warranty)}</p>` : ''}${q.notes ? `<p><b>Observações:</b> ${esc(q.notes).replace(/\n/g, '<br>')}</p>` : ''}${q.terms ? `<p style="color:#66728d">${esc(q.terms).replace(/\n/g, '<br>')}</p>` : ''}</div>
      <div class="sign"><div>${esc(i.name)}</div><div>De acordo: ${esc(c.name)}</div></div><div class="foot">${esc(i.name)} · ${esc(i.phone)} · ${esc(i.email)}${i.site ? ' · ' + esc(i.site) : ''}</div></body></html>`;
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(fr);
    fr.onload = () => { setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Não foi possível abrir a impressão.'); } setTimeout(() => fr.remove(), 60000); }, 350); };
    fr.srcdoc = html;
  }

  // ---------------- catálogo ----------------
  function renderCatalog() {
    const f = (Q.cf || '').toLowerCase(); const rows = Q.catalog.filter((p) => !f || `${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(f));
    shell(`<div class="oc-bar"><input id="cg-q" class="filter-input" placeholder="Buscar por SKU, nome ou categoria..." value="${esc(Q.cf || '')}"><label class="btn-secondary" style="cursor:pointer">Importar planilha (CSV)<input type="file" id="cg-file" accept=".csv,text/csv" hidden></label></div>
      <div class="mt-card"><h3>Novo produto ou equipamento</h3><div class="oc-cat-form"><input id="n-sku" placeholder="SKU"><input id="n-name" placeholder="Nome *"><input id="n-desc" placeholder="Descrição detalhada"><input id="n-unit" placeholder="Un (un, cx, kg...)" value="un"><input id="n-price" inputmode="decimal" placeholder="Valor (R$)"><input id="n-tax" inputmode="decimal" placeholder="Imposto %"><input id="n-cat" placeholder="Categoria"><button class="btn-primary" id="n-add">Adicionar</button></div>
      <p class="mt-note">CSV com colunas: sku; nome; descricao; unidade; valor; imposto; categoria. SKUs repetidos são atualizados.</p></div>
      <div class="mt-card"><p class="mt-note">${rows.length} item(ns)</p>${rows.length ? `<div class="oc-items-wrap"><table class="oc-items oc-cat"><thead><tr><th>SKU</th><th>Nome e descrição</th><th>Un</th><th>Valor (R$)</th><th>Imposto %</th><th>Categoria</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr data-id="${p.id}"><td><input data-k="sku" value="${esc(p.sku)}" style="min-width:90px"></td><td><input data-k="name" value="${esc(p.name)}"><input data-k="description" class="oc-desc" value="${esc(p.description)}"></td><td><input data-k="unit" value="${esc(p.unit)}" style="width:54px"></td><td><input data-k="price" inputmode="decimal" value="${p.price}" style="width:100px"></td><td><input data-k="taxPct" inputmode="decimal" value="${p.taxPct}" style="width:62px"></td><td><input data-k="category" value="${esc(p.category)}"></td><td class="oc-acts"><button class="btn-primary btn-sm" data-save>Salvar</button><button class="btn-secondary btn-sm" data-del>Excluir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mt-note">Nenhum item. Cadastre acima ou importe uma planilha.</p>'}</div>`);
    $('cg-q').oninput = (e) => { Q.cf = e.target.value; const p = e.target.selectionStart; renderCatalog(); const el = $('cg-q'); el.focus(); el.setSelectionRange(p, p); };
    $('n-add').onclick = async () => {
      try { const it = await api('/api/quotes/catalog', { method: 'POST', body: JSON.stringify({ sku: $('n-sku').value, name: $('n-name').value, description: $('n-desc').value, unit: $('n-unit').value, price: num($('n-price').value), taxPct: num($('n-tax').value), category: $('n-cat').value }) }); Q.catalog.push(it); toast('Item adicionado.'); renderCatalog(); } catch (e) { toast(e.message); }
    };
    $('cg-file').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return; const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      const rowsCsv = lines.slice(/sku|nome/i.test(lines[0]) ? 1 : 0).map((l) => { const c = l.split(sep).map((x) => x.replace(/^"|"$/g, '').trim()); return { sku: c[0], name: c[1], description: c[2], unit: c[3], price: num(c[4]), taxPct: num(c[5]), category: c[6] }; });
      try { const r = await api('/api/quotes/catalog/import', { method: 'POST', body: JSON.stringify({ rows: rowsCsv }) }); Q.catalog = await api('/api/quotes/catalog'); toast(`${r.created} novo(s), ${r.updated} atualizado(s).`); renderCatalog(); } catch (er) { toast(er.message); }
    };
    $('oc-root').querySelectorAll('.oc-cat tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector('[data-save]').onclick = async () => { const body = {}; tr.querySelectorAll('input[data-k]').forEach((i) => { body[i.dataset.k] = ['price', 'taxPct'].includes(i.dataset.k) ? num(i.value) : i.value; }); try { const u = await api(`/api/quotes/catalog/${id}`, { method: 'PUT', body: JSON.stringify(body) }); Object.assign(Q.catalog.find((x) => x.id === id), u); toast('Salvo.'); } catch (e) { toast(e.message); } };
      tr.querySelector('[data-del]').onclick = async () => { if (!confirm('Excluir este item do catálogo?')) return; try { await api(`/api/quotes/catalog/${id}`, { method: 'DELETE' }); Q.catalog = Q.catalog.filter((x) => x.id !== id); renderCatalog(); } catch (e) { toast(e.message); } };
    });
  }

  // ---------------- empresas emissoras ----------------
  function renderIssuers() {
    const s = Q.settings; const ro = !isAdmin(); const df = s.defaults;
    shell(`<p class="mt-note">São as empresas que aparecem no topo do orçamento. ${ro ? 'Somente administradores podem alterar.' : 'Preencha com os dados oficiais (Cartão CNPJ). Quando a empresa virar LTDA, é só editar aqui: os orçamentos antigos continuam com os dados da época.'}</p>
      ${s.issuers.map((i, n) => `<div class="mt-card oc-iss" data-n="${n}"><h3>${esc(i.name || 'Nova empresa')}</h3><div class="form-row"><div class="form-group"><label>Nome fantasia *</label><input data-k="name" value="${esc(i.name)}"></div><div class="form-group"><label>Razão social</label><input data-k="legalName" value="${esc(i.legalName)}"></div><div class="form-group"><label>Tipo (MEI, ME, LTDA...)</label><input data-k="regime" value="${esc(i.regime)}" placeholder="Ex.: LTDA"></div><div class="form-group"><label>CNPJ</label><input data-k="cnpj" value="${esc(i.cnpj)}"></div><div class="form-group"><label>Inscrição estadual</label><input data-k="ie" value="${esc(i.ie)}"></div></div>
        <div class="form-row"><div class="form-group" style="flex:2"><label>Endereço</label><input data-k="address" value="${esc(i.address)}"></div><div class="form-group"><label>Cidade</label><input data-k="city" value="${esc(i.city)}"></div><div class="form-group" style="max-width:70px"><label>UF</label><input data-k="uf" value="${esc(i.uf)}" maxlength="2"></div><div class="form-group"><label>CEP</label><input data-k="cep" value="${esc(i.cep)}"></div></div>
        <div class="form-row"><div class="form-group"><label>Telefone</label><input data-k="phone" value="${esc(i.phone)}"></div><div class="form-group"><label>E-mail</label><input data-k="email" value="${esc(i.email)}"></div><div class="form-group"><label>Site</label><input data-k="site" value="${esc(i.site)}"></div></div>
        ${ro ? '' : `<div class="mt-actions"><button class="btn-secondary btn-sm" data-rm>Remover empresa</button></div>`}</div>`).join('')}
      ${ro ? '' : '<div class="mt-actions"><button class="btn-secondary" id="is-add">+ Adicionar empresa</button></div>'}
      <div class="mt-card"><h3>Padrões de todo orçamento novo</h3><div class="form-row"><div class="form-group"><label>Validade (dias)</label><input id="df-val" value="${df.validityDays}"></div><div class="form-group"><label>Imposto</label><select id="df-tax"><option value="add"${df.taxMode === 'add' ? ' selected' : ''}>Somado ao valor</option><option value="included"${df.taxMode === 'included' ? ' selected' : ''}>Já incluso</option></select></div><div class="form-group"><label>Pagamento</label><input id="df-pay" value="${esc(df.payment)}"></div><div class="form-group"><label>Entrega</label><input id="df-del" value="${esc(df.delivery)}"></div></div><div class="form-group"><label>Garantia</label><input id="df-war" value="${esc(df.warranty)}"></div><div class="form-group"><label>Termos</label><textarea id="df-terms" rows="2">${esc(df.terms)}</textarea></div></div>
      ${ro ? '' : '<div class="mt-actions"><button class="btn-primary" id="is-save">Salvar empresas e padrões</button></div>'}`);
    if (ro) { $('oc-root').querySelectorAll('input,select,textarea').forEach((e) => { e.disabled = true; }); return; }
    const collect = () => { $('oc-root').querySelectorAll('.oc-iss').forEach((card) => { const i = s.issuers[Number(card.dataset.n)]; card.querySelectorAll('input[data-k]').forEach((inp) => { i[inp.dataset.k] = inp.value; }); }); s.defaults = { validityDays: num($('df-val').value) || 15, taxMode: $('df-tax').value, payment: $('df-pay').value, delivery: $('df-del').value, warranty: $('df-war').value, terms: $('df-terms').value }; };
    $('is-add').onclick = () => { collect(); s.issuers.push({ id: '', name: 'Nova empresa', legalName: '', regime: '', cnpj: '', ie: '', address: '', city: '', uf: '', cep: '', phone: '', email: '', site: '', notes: '' }); renderIssuers(); };
    $('oc-root').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { collect(); if (s.issuers.length < 2) return toast('Precisa existir pelo menos uma empresa.'); s.issuers.splice(Number(b.closest('.oc-iss').dataset.n), 1); renderIssuers(); }; });
    $('is-save').onclick = async () => { collect(); try { Q.settings = await api('/api/quotes/settings', { method: 'PUT', body: JSON.stringify(s) }); toast('Salvo.'); renderIssuers(); } catch (e) { toast(e.message); } };
  }
})();
