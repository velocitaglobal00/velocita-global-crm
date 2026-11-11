/* Pipeline v2: o formulário do negócio cadastra pessoa e empresa na mesma tela,
   e o cartão mostra com quem e com qual empresa é o negócio.
   Sobrescreve openDealModal, saveDeal e buildDealCard do app.js (carrega depois dele). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const NEW = '__new__';
  let titleAuto = true; let lastSuggestion = '';

  const ICON_P = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
  const ICON_O = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="12" height="18" rx="1"/><path d="M8 7h1M8 11h1M8 15h1M13 7h1M13 11h1M13 15h1M16 10h4v11h-4"/></svg>';

  function fillPersonSelect(selected) {
    const sel = $('deal-person'); const st = window.state;
    sel.innerHTML = '<option value="">Sem pessoa (só empresa)</option><option value="' + NEW + '">＋ Cadastrar nova pessoa</option>' +
      st.contacts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => `<option value="${c.id}">${esc(c.name)}${c.orgId ? ' — ' + esc(window.orgName(c.orgId)) : ''}</option>`).join('');
    sel.value = selected || '';
  }
  function fillOrgSelect(selected) {
    const sel = $('deal-org'); const st = window.state;
    sel.innerHTML = '<option value="">Sem empresa (só pessoa)</option><option value="' + NEW + '">＋ Cadastrar nova empresa</option>' +
      st.organizations.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    sel.value = selected || '';
  }
  const esc = (v) => (window.escapeHtml ? window.escapeHtml(v) : String(v == null ? '' : v));

  function refreshNewBoxes() {
    $('dm-newperson').hidden = $('deal-person').value !== NEW;
    $('dm-neworg').hidden = $('deal-org').value !== NEW;
    suggestTitle();
    const hint = $('dm-client-hint'); const p = $('deal-person').value; const o = $('deal-org').value;
    if (p === NEW || o === NEW) hint.textContent = 'O que você digitar aqui será cadastrado em Leads e Empresas ao salvar o negócio.';
    else if (!p && !o) hint.textContent = 'Escolha pelo menos a pessoa ou a empresa.';
    else hint.textContent = '';
  }
  function clientLabel() {
    const o = $('deal-org').value; const p = $('deal-person').value; const st = window.state;
    if (o === NEW) return $('no-name').value.trim();
    if (o) return window.orgName(o);
    if (p === NEW) return $('np-name').value.trim();
    if (p) return window.contactName(p);
    return '';
  }
  function suggestTitle() {
    const t = $('deal-title'); if ($('deal-id').value) return;
    if (!titleAuto && t.value && t.value !== lastSuggestion) return;
    const c = clientLabel(); lastSuggestion = c ? `Parceria com ${c}` : ''; t.value = lastSuggestion;
  }

  function onPersonChange() {
    const p = $('deal-person').value; const st = window.state;
    if (p && p !== NEW) {
      const c = st.contacts.find((x) => x.id === p);
      if (c && c.orgId && ($('deal-org').value === '' )) { $('deal-org').value = c.orgId; $('dm-client-hint').textContent = `A empresa "${window.orgName(c.orgId)}" foi preenchida porque essa pessoa trabalha lá.`; refreshNewBoxes(); if (!$('dm-client-hint').textContent) $('dm-client-hint').textContent = `A empresa "${window.orgName(c.orgId)}" foi preenchida porque essa pessoa trabalha lá.`; return; }
    }
    refreshNewBoxes();
  }

  window.openDealModal = function openDealModal(deal, presetPersonId) {
    const st = window.state;
    $('deal-modal-title').textContent = deal ? 'Editar negócio' : 'Adicionar negócio';
    $('deal-id').value = deal ? deal.id : '';
    $('deal-title').value = deal ? deal.title : '';
    $('deal-value').value = deal ? deal.value : '';
    $('deal-currency').value = deal ? deal.currency : 'BRL';
    $('deal-supply-cost').value = deal && deal.supplyCost ? deal.supplyCost : '';
    $('deal-marketing-cost').value = deal && deal.marketingCost ? deal.marketingCost : '';
    const personId = deal ? deal.personId : presetPersonId || null;
    const person = st.contacts.find((c) => c.id === personId);
    fillPersonSelect(personId); fillOrgSelect(deal ? deal.orgId : person ? person.orgId : null);
    window.populateDealStageSelect(deal ? deal.stage : st.stages[0] && st.stages[0].id);
    $('deal-close-date').value = deal && deal.closeDate ? deal.closeDate.slice(0, 10) : '';
    $('deal-platform').value = deal && deal.platform ? deal.platform : '';
    ['np-name', 'np-phone', 'np-email', 'no-name', 'no-cnpj', 'no-phone'].forEach((i) => { $(i).value = ''; });
    titleAuto = !deal; lastSuggestion = '';
    refreshNewBoxes();
    window.openModal('modal-deal');
    setTimeout(() => { const f = deal ? $('deal-title') : $('deal-person'); if (f) f.focus(); }, 50);
  };

  window.saveDeal = async function saveDeal() {
    const st = window.state; const A = window.Api; const id = $('deal-id').value;
    const btn = $('btn-save-deal'); if (btn.disabled) return;
    let personId = $('deal-person').value; let orgId = $('deal-org').value;
    if (!personId && !orgId) { window.showToast('Escolha ou cadastre a pessoa ou a empresa.'); return; }
    if (personId === NEW && !$('np-name').value.trim()) { window.showToast('Digite o nome da nova pessoa.'); $('np-name').focus(); return; }
    if (orgId === NEW && !$('no-name').value.trim()) { window.showToast('Digite o nome da nova empresa.'); $('no-name').focus(); return; }
    const title = $('deal-title').value.trim() || (clientLabel() ? `Parceria com ${clientLabel()}` : '');
    if (!title) { window.showToast('Dê um nome ao negócio.'); $('deal-title').focus(); return; }
    btn.disabled = true;
    try {
      const me = st.attendantId;
      if (orgId === NEW) {
        const org = await A.addOrg({ name: $('no-name').value.trim(), cnpj: $('no-cnpj').value.trim(), phone: $('no-phone').value.trim(), ownerId: me, attendantId: me });
        st.organizations.push(org); orgId = org.id;
      }
      if (personId === NEW) {
        const c = await A.addContact({ name: $('np-name').value.trim(), phone: $('np-phone').value.trim(), email: $('np-email').value.trim(), orgId: orgId || null, ownerId: me, attendantId: me, source: { channel: 'pipeline', campaign: '' } });
        st.contacts.push(c); personId = c.id;
      } else if (personId && orgId) {
        const c = st.contacts.find((x) => x.id === personId);
        if (c && !c.orgId) { const up = await A.updateContact(c.id, { orgId, attendantId: me }); Object.assign(c, up); }
      }
      const payload = {
        title, value: Number($('deal-value').value) || 0, currency: $('deal-currency').value,
        supplyCost: Number($('deal-supply-cost').value) || 0, marketingCost: Number($('deal-marketing-cost').value) || 0,
        personId: personId || null, orgId: orgId || null, stage: $('deal-stage').value, closeDate: $('deal-close-date').value || null, platform: $('deal-platform').value || null
      };
      if (id) { const updated = await A.updateDeal(id, payload); const i = st.deals.findIndex((d) => d.id === id); st.deals[i] = updated; window.showToast('Negócio atualizado.'); }
      else { const created = await A.addDeal(payload); st.deals.push(created); window.showToast('Negócio adicionado ao quadro.'); }
      window.closeModal('modal-deal'); window.renderKanban(); window.renderDashboard();
      if (window.renderLeads) window.renderLeads(); if (window.renderOrgs) window.renderOrgs();
    } catch (e) { window.showToast('Não foi possível salvar: ' + (e.message || 'erro')); } finally { btn.disabled = false; }
  };

  // cartão: mostra a pessoa e a empresa
  const baseCard = window.buildDealCard;
  window.buildDealCard = function buildDealCard(deal) {
    const card = baseCard(deal); const st = window.state;
    const c = st.contacts.find((x) => x.id === deal.personId); const o = st.organizations.find((x) => x.id === (deal.orgId || (c && c.orgId)));
    if (c || o) {
      const div = document.createElement('div'); div.className = 'deal-client';
      div.innerHTML = (c ? `<span>${ICON_P}${esc(c.name)}</span>` : '') + (o ? `<span>${ICON_O}${esc(o.name)}</span>` : '');
      const title = card.querySelector('.deal-title'); if (title) title.after(div);
    }
    return card;
  };

  function wire() {
    const save = $('btn-save-deal'); const fresh = save.cloneNode(true); save.replaceWith(fresh); fresh.addEventListener('click', () => window.saveDeal());
    $('deal-person').addEventListener('change', onPersonChange); $('deal-org').addEventListener('change', refreshNewBoxes);
    ['np-name', 'no-name'].forEach((i) => $(i).addEventListener('input', suggestTitle));
    $('deal-title').addEventListener('input', () => { titleAuto = $('deal-title').value === lastSuggestion; });
    const help = $('pl-help'); try { if (localStorage.getItem('vg_pl_help') === 'seen') help.open = false; else help.open = true; help.addEventListener('toggle', () => { if (!help.open) localStorage.setItem('vg_pl_help', 'seen'); }); } catch (e) { /* sem armazenamento */ }
  }

  // Pipeline em tela cheia: o menu lateral recolhe sozinho nesta tela (e volta ao sair), para o quadro ocupar a largura toda.
  let autoCollapsed = false;
  function autoSidebar(view) {
    const sb = $('sidebar'); if (!sb || typeof window.setSidebarOpen !== 'function') return;
    if (view === 'pipeline' && window.innerWidth >= 900 && !sb.classList.contains('collapsed')) { window.setSidebarOpen(false); autoCollapsed = true; }
    else if (view !== 'pipeline' && autoCollapsed) { window.setSidebarOpen(true); autoCollapsed = false; }
  }
  const baseSwitch = window.switchView;
  window.switchView = function switchView(view) { baseSwitch(view); autoSidebar(view); };
  window.addEventListener('crm-ready', () => autoSidebar((location.hash || '').replace('#', '')));
  window.addEventListener('crm-ready', wire);
})();
