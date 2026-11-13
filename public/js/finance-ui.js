/* BI > Financeiro: caixa, a pagar e a receber (preenchidos pela diretoria) + o que vem dos orçamentos, ligados à meta do mês. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const numRaw = (v) => { const s = String(v == null ? '' : v).trim(); if (/,/.test(s)) return num(s); const n = Number(s); return Number.isFinite(n) ? n : 0; };
  const isAdmin = () => window.state && window.state.me && ['matriz', 'admin'].includes(window.state.me.role);
  let F = null; let loading = false;

  window.renderBiFinanceiro = async function renderBiFinanceiro(force) {
    const box = $('bi-financeiro-container'); if (!box) return;
    if (!isAdmin()) { box.innerHTML = '<p class="mt-note">Os números financeiros são só da administração.</p>'; return; }
    if (!force && F && box.contains(document.activeElement) && document.activeElement.tagName !== 'BODY') return; // não apaga o que está sendo digitado
    if (loading) return; loading = true;
    try { F = await api('/api/finance'); draw(box); } catch (e) { box.innerHTML = `<p>Não foi possível carregar o financeiro: ${esc(e.message)}</p>`; } finally { loading = false; }
  };

  function draw(box) {
    const s = F.summary; const q = s.quotes; const pct = s.goalPct;
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
    box.innerHTML = `
      <div class="fi-goal"><div class="fi-goal-top"><div><span>Meta de ${esc(mes)}</span><b>${brl(s.receivedMonth)} <small>de ${brl(s.goal)}</small></b></div><div class="fi-goal-miss"><span>Falta para a meta</span><b>${brl(s.missingToGoal)}</b></div></div>
        <div class="fi-bar"><i style="width:${pct}%"></i></div><p class="mt-note">"Recebido no mês" soma os recebimentos registrados nos orçamentos e os recebimentos avulsos marcados abaixo. Para mudar a meta, use o lápis na Meta do mês do Dashboard.</p></div>
      <div class="fi-cards">
        <div class="fi-card"><span>No caixa</span><b>${brl(s.cash)}</b><div class="fi-edit"><input id="fi-cash" inputmode="decimal" placeholder="Valor no caixa (R$)" value="${F.cash.value || ''}"><input id="fi-cashnote" placeholder="Observação (conta, data...)" value="${esc(F.cash.note || '')}"><button class="btn-primary btn-sm" id="fi-cashsave">Salvar caixa</button></div>${F.cash.updatedAt ? `<small>Atualizado em ${new Date(F.cash.updatedAt).toLocaleString('pt-BR')}</small>` : ''}</div>
        <div class="fi-card"><span>A receber</span><b class="oc-o">${brl(s.toReceiveTotal)}</b><small>Orçamentos: ${brl(q.toReceive)} · Avulsos: ${brl(s.toReceiveTotal - q.toReceive)}</small></div>
        <div class="fi-card"><span>A pagar</span><b class="oc-r">${brl(s.payablesOpen)}</b><small>Contas: ${brl(s.payablesManual)} · Material dos orçamentos: ${brl(q.materialToPay)}</small></div>
        <div class="fi-card fi-proj"><span>Saldo projetado</span><b class="${s.projected >= 0 ? 'oc-g' : 'oc-r'}">${brl(s.projected)}</b><small>caixa + a receber − a pagar</small></div>
      </div>
      <div class="mt-card"><h3>O que vem dos orçamentos</h3><div class="oc-kpis"><div><span>Orçado (enviados e aprovados)</span><b>${brl(q.quoted)}</b></div><div><span>Já recebido</span><b class="oc-g">${brl(q.received)}</b></div><div><span>Gasto com material</span><b>${brl(q.materialCost)}</b></div><div><span>Material já pago ao fornecedor</span><b class="oc-g">${brl(q.materialPaid)}</b></div><div><span>Material a pagar (fornecedores)</span><b class="oc-o">${brl(q.materialToPay)}</b></div><div><span>Sobra da receita</span><b class="oc-g">${brl(q.profit)}</b></div><div><span>Sobra já recebida</span><b class="oc-g">${brl(q.profitReceived)}</b></div><div><span>Rascunhos (ainda não enviados)</span><b>${brl(q.drafts)}</b></div></div></div>
      <div class="mt-card"><h3>O que vem do Pipeline <small style="font-weight:400;color:var(--vg-text-muted)">(valor já pago pelo cliente em cada negócio)</small></h3>
        <div class="oc-kpis"><div><span>Negócios no quadro</span><b>${s.pipeline.deals}</b></div><div><span>Valor dos negócios</span><b>${brl(s.pipeline.value)}</b></div><div><span>Já pago pelos clientes</span><b class="oc-g">${brl(s.pipeline.paid)}</b></div><div><span>Falta receber</span><b class="oc-o">${brl(s.pipeline.remaining)}</b></div></div>
        <p class="mt-note">Preencha o campo "Valor já pago pelo cliente" ao editar um negócio no Pipeline. ${s.pipeline.linkedToQuotes ? `Negócios ligados a um orçamento (${s.pipeline.linkedToQuotes}) entram pelo orçamento, para não contar duas vezes.` : ''}</p>
        ${s.pipeline.list.length ? `<div class="oc-items-wrap"><table class="data-table"><thead><tr><th>Negócio</th><th>Etapa</th><th>Valor</th><th>Já pago</th><th>Falta</th></tr></thead><tbody>${s.pipeline.list.map((d) => `<tr><td>${esc(d.title)}${d.status === 'won' ? ' <span class="lg-pill oc-pay-pago">ganho</span>' : ''}</td><td>${esc(d.stage)}</td><td>${brl(d.value)}</td><td><b class="oc-g">${brl(d.paid)}</b></td><td>${brl(d.remaining)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
      <div class="mt-card"><h3>Contas a pagar</h3><p class="mt-note">Aluguel, fornecedores, impostos, ferramentas... Marque como pago quando quitar. Marque <b>Todo mês</b> nas contas fixas (ex.: assinatura com vencimento dia 22): o mês seguinte aparece sozinho.</p><div id="fi-pay"></div><div class="mt-actions"><button class="btn-secondary" id="fi-payadd">+ Adicionar conta</button><button class="btn-primary" id="fi-paysave">Salvar contas a pagar</button></div></div>
      <div class="mt-card"><h3>Outros valores a receber (avulsos)</h3><p class="mt-note">Recebimentos que não estão em orçamento. Os valores dos orçamentos já entram sozinhos.</p><div id="fi-rec"></div><div class="mt-actions"><button class="btn-secondary" id="fi-recadd">+ Adicionar recebimento</button><button class="btn-primary" id="fi-recsave">Salvar a receber</button></div></div>`;
    rows('fi-pay', F.payables, 'paid', 'Pago', { desc: 'Conta (ex.: fornecedor, aluguel)', value: 'Valor (R$)', due: 'Vencimento' });
    rows('fi-rec', F.receivables, 'received', 'Recebido', { desc: 'Descrição (ex.: cliente, serviço)', value: 'Valor (R$)', due: 'Previsão' });
    $('fi-cashsave').onclick = async () => { try { F = await api('/api/finance', { method: 'PUT', body: JSON.stringify({ cash: { value: numRaw($('fi-cash').value), note: $('fi-cashnote').value } }) }); toast('Caixa salvo.'); window.renderBiFinanceiro(true); } catch (e) { toast(e.message); } };
    $('fi-payadd').onclick = () => { collect('fi-pay', F.payables, 'paid'); F.payables.push({ id: '', desc: '', value: 0, due: '', paid: false }); draw(box); };
    $('fi-recadd').onclick = () => { collect('fi-rec', F.receivables, 'received'); F.receivables.push({ id: '', desc: '', value: 0, due: '', received: false }); draw(box); };
    $('fi-paysave').onclick = async () => { collect('fi-pay', F.payables, 'paid'); try { F = await api('/api/finance', { method: 'PUT', body: JSON.stringify({ payables: F.payables }) }); toast('Contas a pagar salvas.'); window.renderBiFinanceiro(true); } catch (e) { toast(e.message); } };
    $('fi-recsave').onclick = async () => { collect('fi-rec', F.receivables, 'received'); try { F = await api('/api/finance', { method: 'PUT', body: JSON.stringify({ receivables: F.receivables }) }); toast('Valores a receber salvos.'); window.renderBiFinanceiro(true); } catch (e) { toast(e.message); } };
  }

  function rows(id, list, flag, flagLabel, ph) {
    $(id).innerHTML = list.length ? `<div class="fi-head"><span>${ph.desc.split(' (')[0]}</span><span>Valor</span><span>${ph.due}</span><span>${flagLabel}?</span>${id === 'fi-pay' ? '<span>Repete?</span>' : ''}<span></span></div>` + list.map((x, i) => `<div class="fi-row" data-i="${i}"><input data-k="desc" placeholder="${esc(ph.desc)}" value="${esc(x.desc)}"><input data-k="value" inputmode="decimal" placeholder="${ph.value}" value="${x.value || ''}"><input type="date" data-k="due" value="${esc(x.due)}"><label class="fi-chk"><input type="checkbox" data-k="${flag}" ${x[flag] ? 'checked' : ''}> ${flagLabel}</label>${id === 'fi-pay' ? `<label class="fi-chk"><input type="checkbox" data-k="recurring" ${x.recurring ? 'checked' : ''}> Todo mês</label>` : ''}<button class="btn-secondary btn-sm" data-del aria-label="Remover">✕</button></div>`).join('') : '<p class="mt-note">Nada cadastrado ainda.</p>';
    $(id).querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { const row = b.closest('.fi-row'); const arr = id === 'fi-pay' ? F.payables : F.receivables; collect(id, arr, flag); arr.splice(Number(row.dataset.i), 1); draw($('bi-financeiro-container')); }; });
  }
  function collect(id, list, flag) {
    $(id).querySelectorAll('.fi-row').forEach((row) => {
      const it = list[Number(row.dataset.i)]; if (!it) return;
      row.querySelectorAll('[data-k]').forEach((el) => { const k = el.dataset.k; it[k] = el.type === 'checkbox' ? el.checked : k === 'value' ? numRaw(el.value) : el.value; });
      if (flag === 'received' && it.received && !it.receivedDate) it.receivedDate = new Date().toLocaleDateString('sv-SE');
    });
  }

  window.addEventListener('crm-ready', () => { const tab = document.querySelector('[data-bitab=financeiro]'); if (tab && !isAdmin()) tab.style.display = 'none'; });
})();
