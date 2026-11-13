/* Tela do negócio: "Pagamentos do cliente" ao vivo (orçamentos ligados + lançamentos com comprovante). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const brl = (n, cur) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: cur || 'BRL' });
  const numBR = (v) => { const s = String(v == null ? '' : v).trim(); if (/,/.test(s)) { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; } const n = Number(s); return Number.isFinite(n) ? n : 0; };
  const dBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '—');
  const PAYST = { pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago' };
  let dealId = null; let F = null; let timer = null; let busy = false;

  function host() {
    let box = $('dd-pay'); if (box) return box;
    const anchor = $('dd-org-address'); if (!anchor) return null;
    box = document.createElement('div'); box.id = 'dd-pay'; box.className = 'dd-pay';
    anchor.closest('.dd-meta-item').after(box); return box;
  }

  async function load(force) {
    const box = host(); if (!box || !dealId) return;
    if (!force && box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; // não atrapalha quem está digitando
    if (busy) return; busy = true;
    try { F = await api(`/api/deals/${dealId}/financial`); draw(box); } catch (e) { box.innerHTML = `<div class="dd-pay-h">Pagamentos do cliente</div><p class="mt-note">Não foi possível carregar: ${esc(e.message)}</p>`; } finally { busy = false; }
  }

  function draw(box) {
    const c = F.currency; const iso = new Date().toLocaleDateString('sv-SE');
    box.innerHTML = `<div class="dd-pay-h">Pagamentos do cliente <span class="dd-live" title="Atualiza sozinho a cada 15 segundos">● ao vivo</span></div>
      <div class="dd-pay-big"><div><span>Já pagou</span><b class="oc-g">${brl(F.paid, c)}</b></div><div><span>${F.value > 0 || F.quotes.length ? 'Valor total' : 'Valor do negócio'}</span><b>${brl(F.reference, c)}</b></div><div><span>Falta</span><b class="${F.remaining > 0 ? 'oc-o' : 'oc-g'}">${brl(F.remaining, c)}</b></div></div>
      <div class="fi-bar"><i style="width:${F.pct}%"></i></div><small class="dd-pay-pct">${F.pct}% pago${F.value === 0 && !F.quotes.length ? ' · defina o valor do negócio para ver o percentual' : ''}</small>
      <div class="dd-pay-sub">Orçamentos deste negócio</div>
      ${F.quotes.length ? F.quotes.map((q) => `<div class="dd-pay-q"><div><b>${esc(q.number)}</b> <span class="lg-pill oc-pay-${q.payStatus}">${PAYST[q.payStatus]}</span><div class="eq-sub">${brl(q.received, c)} de ${brl(q.total, c)}</div></div><button class="btn-secondary btn-sm" data-openq="${q.id}">Abrir</button></div>`).join('') : '<p class="mt-note">Nenhum orçamento ligado. No orçamento, escolha este negócio em "Negócio do Pipeline".</p>'}
      <button class="btn-secondary btn-sm" id="dd-newq" style="margin:6px 0 10px">+ Criar orçamento para este negócio</button>
      <div class="dd-pay-sub">Lançamentos feitos aqui <small>(use só para o que não está no orçamento)</small></div>
      <div id="dd-pays">${F.payments.length ? F.payments.map((x) => `<div class="dd-payrow" data-id="${esc(x.id)}"><input type="date" data-k="date" value="${esc(x.date)}"><input data-k="amount" inputmode="decimal" value="${x.amount}" aria-label="Valor"><input data-k="note" value="${esc(x.note)}" placeholder="Observação"><div class="dd-payfile">${x.fileId ? `<a href="/api/deal-files/${esc(x.fileId)}" target="_blank" rel="noopener" title="${esc(x.fileName)}">📎 Ver comprovante</a>` : `<label class="btn-secondary btn-sm">📎 Anexar<input type="file" data-file accept="application/pdf,image/*" hidden></label>`}<button class="btn-secondary btn-sm" data-del aria-label="Remover pagamento">✕</button></div></div>`).join('') : '<p class="mt-note">Nenhum lançamento.</p>'}</div>
      <div class="dd-payadd"><input type="date" id="dp-date" value="${iso}"><input id="dp-amount" inputmode="decimal" placeholder="Valor pago (R$)"><input id="dp-note" placeholder="Observação (Pix, boleto...)"><label class="btn-secondary btn-sm">📎 Comprovante<input type="file" id="dp-file" accept="application/pdf,image/*" hidden></label><button class="btn-primary btn-sm" id="dp-add">Registrar pagamento</button></div><small id="dp-file-name" class="mt-note"></small>`;
    $('dp-file').onchange = () => { const f = $('dp-file').files[0]; $('dp-file-name').textContent = f ? `Anexo: ${f.name}` : ''; };
    $('dd-newq').onclick = () => { window.closeModal && window.closeModal('modal-deal-detail'); window.newQuoteForDeal && window.newQuoteForDeal(dealId); };
    box.querySelectorAll('[data-openq]').forEach((b) => { b.onclick = () => { window.closeModal && window.closeModal('modal-deal-detail'); window.openQuoteById && window.openQuoteById(b.dataset.openq); }; });
    $('dp-add').onclick = addPayment;
    box.querySelectorAll('.dd-payrow').forEach((row) => {
      const id = row.dataset.id;
      row.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('change', () => saveRows()));
      row.querySelector('[data-del]').onclick = async () => { if (!confirm('Remover este lançamento?')) return; row.remove(); await saveRows(); };
      const fi = row.querySelector('[data-file]'); if (fi) fi.onchange = () => upload(id, fi.files[0]);
    });
  }

  const collect = () => [...document.querySelectorAll('#dd-pays .dd-payrow')].map((row) => ({ id: row.dataset.id, date: row.querySelector('[data-k=date]').value, amount: numBR(row.querySelector('[data-k=amount]').value), note: row.querySelector('[data-k=note]').value }));
  async function saveRows(extra) {
    try { const r = await api(`/api/deals/${dealId}/payments`, { method: 'PUT', body: JSON.stringify({ payments: collect().concat(extra || []) }) }); syncDeal(r.paidAmount); await load(true); return r; } catch (e) { toast(e.message); }
  }
  function syncDeal(paid) { const d = window.state && window.state.deals.find((x) => x.id === dealId); if (d) { d.paidAmount = paid; if (window.renderKanban) window.renderKanban(); } }
  async function addPayment() {
    const amount = numBR($('dp-amount').value); if (!(amount > 0)) return toast('Digite o valor pago.');
    const file = $('dp-file').files[0]; const r = await saveRows([{ id: '', date: $('dp-date').value, amount, note: $('dp-note').value }]); if (!r) return;
    toast('Pagamento registrado. O BI já está atualizado.');
    if (file) { const last = r.payments[r.payments.length - 1]; if (last) await upload(last.id, file); }
  }
  function upload(pid, file) {
    return new Promise((resolve) => {
      if (!file) return resolve(); if (file.size > 6 * 1024 * 1024) { toast('O arquivo precisa ter até 6 MB.'); return resolve(); }
      const rd = new FileReader();
      rd.onload = async () => { try { await api(`/api/deals/${dealId}/payments/${pid}/file`, { method: 'POST', body: JSON.stringify({ name: file.name, mime: file.type, dataBase64: String(rd.result).split(',')[1] }) }); toast('Comprovante anexado.'); await load(true); } catch (e) { toast(e.message); } resolve(); };
      rd.readAsDataURL(file);
    });
  }

  function start(id) { dealId = id; clearInterval(timer); load(true); timer = setInterval(() => { const m = $('modal-deal-detail'); if (m && m.classList.contains('show')) load(false); else { clearInterval(timer); } }, 15000); }

  window.addEventListener('crm-ready', () => {
    const base = window.openDealDetail;
    if (typeof base === 'function') window.openDealDetail = async function openDealDetail(id) { const r = await base(id); start(id); return r; };
  });
})();
