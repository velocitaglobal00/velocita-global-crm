// ============ State ============
const state = {
  stages: [],
  deals: [],
  contacts: [],
  organizations: [],
  users: [],
  tags: [],
  reminders: [],
  settings: { customFields: [], monthlyGoal: 0, categories: [], integrations: {} },
  activitiesCache: {}, // dealId -> activities[]
  currentDealId: null,
  currentLeadId: null,
  currentActivityFilter: 'all',
  showClosedDeals: false
};

const CURRENCY_SYMBOL = { BRL: 'R$', USD: '$', EUR: '€' };
const ACTIVITY_ICON = { note: '📝', email: '✉️', call: '📞', meeting: '📅', task: '✅' };
const ACTIVITY_LABEL = { note: 'Nota', email: 'E-mail', call: 'Chamada', meeting: 'Reunião', task: 'Tarefa' };
const SOURCE_LABEL = {
  facebook_ads: 'Facebook Ads',
  instagram_ads: 'Instagram Ads',
  google_ads: 'Google Ads',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  organico: 'Orgânico / Site'
};

function fmtMoney(value, currency = 'BRL') {
  const symbol = CURRENCY_SYMBOL[currency] || 'R$';
  const num = Number(value) || 0;
  return `${symbol} ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysBetween(startStr, endStr) {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ============ API helpers ============
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro' }));
    throw new Error(err.error || 'Erro na requisição');
  }
  if (res.status === 204) return null;
  return res.json();
}

const Api = {
  session: () => api('/api/session'),
  logout: () => api('/api/logout', { method: 'POST' }),
  stages: () => api('/api/stages'),
  addStage: (name) => api('/api/stages', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteStage: (id) => api(`/api/stages/${id}`, { method: 'DELETE' }),
  reorderStages: (orderedIds) => api('/api/stages-reorder', { method: 'PUT', body: JSON.stringify({ orderedIds }) }),
  deals: () => api('/api/deals'),
  addDeal: (payload) => api('/api/deals', { method: 'POST', body: JSON.stringify(payload) }),
  updateDeal: (id, payload) => api(`/api/deals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteDeal: (id) => api(`/api/deals/${id}`, { method: 'DELETE' }),
  contacts: () => api('/api/contacts'),
  addContact: (payload) => api('/api/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  updateContact: (id, payload) => api(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteContact: (id) => api(`/api/contacts/${id}`, { method: 'DELETE' }),
  organizations: () => api('/api/organizations'),
  addOrg: (payload) => api('/api/organizations', { method: 'POST', body: JSON.stringify(payload) }),
  updateOrg: (id, payload) => api(`/api/organizations/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteOrg: (id) => api(`/api/organizations/${id}`, { method: 'DELETE' }),
  users: () => api('/api/users'),
  addUser: (name) => api('/api/users', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteUser: (id) => api(`/api/users/${id}`, { method: 'DELETE' }),
  tags: () => api('/api/tags'),
  addTag: (name, color) => api('/api/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  deleteTag: (id) => api(`/api/tags/${id}`, { method: 'DELETE' }),
  reminders: () => api('/api/reminders'),
  settings: () => api('/api/settings'),
  updateSettings: (payload) => api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  addField: (name) => api('/api/settings/custom-fields', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteField: (id) => api(`/api/settings/custom-fields/${id}`, { method: 'DELETE' }),
  activities: (dealId) => api(`/api/deals/${dealId}/activities`),
  addActivity: (dealId, payload) => api(`/api/deals/${dealId}/activities`, { method: 'POST', body: JSON.stringify(payload) }),
  updateActivity: (id, payload) => api(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
};

// ============ Init ============
async function init() {
  try {
    const session = await Api.session();
    if (!session.authenticated) {
      window.location.href = '/login.html';
      return;
    }
  } catch (e) {
    return;
  }

  await loadAllData();
  document.getElementById('user-name').textContent = (state.users[0] && state.users[0].name) || 'Admin1';

  renderDashboard();
  renderKanban();
  renderLeads();
  renderOrgs();
  renderSettings();

  bindNav();
  bindSidebarToggle();
  bindDealModal();
  bindDealDetailModal();
  bindContactModal();
  bindOrgModal();
  bindLeadDetailModal();
  bindSettingsPanel();
  bindLeadsPage();
  bindOrgsPage();
  bindLogout();
  bindModalCloseButtons();
}

async function loadAllData() {
  const [stages, deals, contacts, organizations, users, settings, tags, reminders] = await Promise.all([
    Api.stages(),
    Api.deals(),
    Api.contacts(),
    Api.organizations(),
    Api.users(),
    Api.settings(),
    Api.tags(),
    Api.reminders()
  ]);
  state.stages = stages;
  state.deals = deals;
  state.contacts = contacts;
  state.organizations = organizations;
  state.users = users;
  state.settings = settings;
  state.tags = tags;
  state.reminders = reminders;
}

// ============ Navigation ============
function switchView(viewName) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === viewName));
  document.querySelectorAll('.sidebar-link').forEach((t) => t.classList.toggle('active', t.dataset.view === viewName));

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'pipeline') renderKanban();
  if (viewName === 'leads') renderLeads();
  if (viewName === 'orgs') renderOrgs();
}

function bindNav() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });
}

function bindSidebarToggle() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.logout();
    window.location.href = '/login.html';
  });
}

function bindModalCloseButtons() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ============ Dashboard ============
function renderDashboard() {
  const openDeals = state.deals.filter((d) => d.status === 'open');
  const wonDeals = state.deals.filter((d) => d.status === 'won');
  const lostDeals = state.deals.filter((d) => d.status === 'lost');

  const openValue = openDeals.reduce((sum, d) => sum + Number(d.value), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + Number(d.value), 0);
  const closedCount = wonDeals.length + lostDeals.length;
  const conversion = closedCount === 0 ? 0 : Math.round((wonDeals.length / closedCount) * 100);

  document.getElementById('stat-open-count').textContent = openDeals.length;
  document.getElementById('stat-open-value').textContent = fmtMoney(openValue);
  document.getElementById('stat-won-value').textContent = fmtMoney(wonValue);
  document.getElementById('stat-conversion').textContent = `${conversion}%`;

  const goal = Number(state.settings.monthlyGoal) || 0;
  const goalPct = goal === 0 ? 0 : Math.min(100, Math.round((wonValue / goal) * 100));
  document.getElementById('goal-fill').style.width = `${goalPct}%`;
  document.getElementById('goal-text').textContent = `${fmtMoney(wonValue)} de ${fmtMoney(goal)} (${goalPct}%)`;

  renderReminders();

  const container = document.getElementById('funnel-container');
  container.innerHTML = '';
  const maxCount = Math.max(1, ...state.stages.map((s) => state.deals.filter((d) => d.stage === s.id).length));
  state.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((stage) => {
      const count = state.deals.filter((d) => d.stage === stage.id).length;
      const pct = Math.round((count / maxCount) * 100);
      const row = document.createElement('div');
      row.className = 'funnel-row';
      row.innerHTML = `
        <div class="funnel-label">${stage.name}</div>
        <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%"></div></div>
        <div class="funnel-count">${count} negócio${count === 1 ? '' : 's'}</div>
      `;
      container.appendChild(row);
    });
}

function renderReminders() {
  const container = document.getElementById('reminders-container');
  const reminders = state.reminders || [];
  if (reminders.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum lembrete pendente. 🎉</div>';
    return;
  }
  container.innerHTML = reminders
    .slice(0, 8)
    .map(
      (r) => `
    <div class="reminder-item ${r.overdue ? 'overdue' : ''}" data-open-deal="${r.dealId}">
      <div>
        <div class="rt-text">${r.overdue ? '⚠️ ' : ''}${escapeHtml(r.text)}</div>
        <div class="rt-deal">${escapeHtml(r.dealTitle)}</div>
      </div>
      <div class="rt-date">${fmtDateTime(r.date)}</div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('[data-open-deal]').forEach((el) => {
    el.addEventListener('click', () => {
      switchView('pipeline');
      openDealDetail(el.dataset.openDeal);
    });
  });
}

// ============ Kanban / Pipeline ============
function contactName(id) {
  const c = state.contacts.find((c) => c.id === id);
  return c ? c.name : '-';
}
function orgName(id) {
  const o = state.organizations.find((o) => o.id === id);
  return o ? o.name : '-';
}
function userName(id) {
  const u = state.users.find((u) => u.id === id);
  return u ? u.name : '-';
}
function stageName(id) {
  const s = state.stages.find((s) => s.id === id);
  return s ? s.name : '-';
}
function tagById(id) {
  return state.tags.find((t) => t.id === id);
}
function categoryById(id) {
  return (state.settings.categories || []).find((c) => c.id === id);
}
function dealHasPendingActivity(dealId) {
  const acts = state.activitiesCache[dealId];
  if (!acts) return false;
  return acts.some((a) => a.type === 'task' && !a.done);
}

function currentStageDays(deal) {
  if (!Array.isArray(deal.stageHistory)) return 0;
  const open = deal.stageHistory.find((h) => !h.exitedAt);
  if (!open) return 0;
  return daysBetween(open.enteredAt, null);
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';

  let toggleBar = document.getElementById('kanban-toggle-bar');
  if (!toggleBar) {
    toggleBar = document.createElement('button');
    toggleBar.id = 'kanban-toggle-bar';
    toggleBar.className = 'btn-secondary toggle-closed-btn';
    board.parentElement.insertBefore(toggleBar, board);
    toggleBar.addEventListener('click', () => {
      state.showClosedDeals = !state.showClosedDeals;
      renderKanban();
    });
  }
  const closedCount = state.deals.filter((d) => d.status !== 'open').length;
  toggleBar.textContent = state.showClosedDeals
    ? `Ocultar Ganhos/Perdidos (${closedCount})`
    : `Mostrar Ganhos/Perdidos (${closedCount})`;

  const sortedStages = state.stages.slice().sort((a, b) => a.order - b.order);
  const visibleDeals = state.deals.filter((d) => state.showClosedDeals || d.status === 'open');

  sortedStages.forEach((stage) => {
    const stageDeals = visibleDeals.filter((d) => d.stage === stage.id);
    const total = stageDeals.filter((d) => d.status === 'open').reduce((sum, d) => sum + Number(d.value), 0);

    const col = document.createElement('div');
    col.className = 'kanban-column';
    col.innerHTML = `
      <div class="kanban-column-header">
        <div class="stage-name">${stage.name}</div>
        <div class="stage-meta"><span>${stageDeals.length} negócio${stageDeals.length === 1 ? '' : 's'}</span><span>${fmtMoney(total)}</span></div>
      </div>
      <div class="kanban-cards" data-stage-id="${stage.id}"></div>
    `;
    board.appendChild(col);

    const cardsWrap = col.querySelector('.kanban-cards');
    stageDeals.forEach((deal) => cardsWrap.appendChild(buildDealCard(deal)));

    cardsWrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      cardsWrap.classList.add('drag-over');
    });
    cardsWrap.addEventListener('dragleave', () => cardsWrap.classList.remove('drag-over'));
    cardsWrap.addEventListener('drop', async (e) => {
      e.preventDefault();
      cardsWrap.classList.remove('drag-over');
      const dealId = e.dataTransfer.getData('text/plain');
      const deal = state.deals.find((d) => d.id === dealId);
      if (!deal || deal.stage === stage.id) return;
      deal.stage = stage.id;
      renderKanban();
      try {
        const updated = await Api.updateDeal(dealId, { stage: stage.id });
        Object.assign(deal, updated);
        renderKanban();
        showToast('Negócio movido para ' + stage.name);
      } catch (err) {
        showToast('Erro ao mover negócio');
      }
    });
  });
}

function buildDealCard(deal) {
  const card = document.createElement('div');
  card.className = `deal-card status-${deal.status}`;
  card.draggable = true;
  card.dataset.dealId = deal.id;

  const owner = userName(deal.ownerId);
  const pending = dealHasPendingActivity(deal.id);
  const days = currentStageDays(deal);
  const daysWarn = days >= 6;

  card.innerHTML = `
    <div class="deal-title">${escapeHtml(deal.title)}</div>
    <div class="deal-value">${fmtMoney(deal.value, deal.currency)}</div>
    <div class="deal-meta">
      <div class="deal-owner">
        <div class="owner-avatar">${initials(owner)}</div>
        <span>${escapeHtml(owner)}</span>
      </div>
      ${pending ? '<div class="activity-dot" title="Atividade pendente"></div>' : ''}
    </div>
    <div class="deal-meta" style="margin-top:6px;">
      <span class="days-badge ${daysWarn ? 'warn' : ''}">${days} dia${days === 1 ? '' : 's'} nesta etapa</span>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', deal.id);
    setTimeout(() => card.classList.add('dragging'), 0);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => openDealDetail(deal.id));

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ============ Add/Edit Deal Modal ============
function bindDealModal() {
  document.getElementById('btn-add-deal').addEventListener('click', () => openDealModal());
  document.getElementById('btn-save-deal').addEventListener('click', saveDeal);
}

function populateDealPersonSelect(selectedId) {
  const select = document.getElementById('deal-person');
  select.innerHTML = '<option value="">Selecionar...</option>';
  state.contacts.forEach((c) => {
    const org = c.orgId ? orgName(c.orgId) : '';
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = org ? `${c.name} — ${org}` : c.name;
    if (c.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateDealStageSelect(selectedId) {
  const select = document.getElementById('deal-stage');
  select.innerHTML = '';
  state.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
}

function openDealModal(deal, presetPersonId) {
  document.getElementById('deal-modal-title').textContent = deal ? 'Editar Negócio' : 'Adicionar Negócio';
  document.getElementById('deal-id').value = deal ? deal.id : '';
  document.getElementById('deal-title').value = deal ? deal.title : '';
  document.getElementById('deal-value').value = deal ? deal.value : '';
  document.getElementById('deal-currency').value = deal ? deal.currency : 'BRL';
  populateDealPersonSelect(deal ? deal.personId : presetPersonId || null);
  populateDealStageSelect(deal ? deal.stage : (state.stages[0] && state.stages[0].id));
  document.getElementById('deal-close-date').value = deal && deal.closeDate ? deal.closeDate.slice(0, 10) : '';
  openModal('modal-deal');
}

async function saveDeal() {
  const id = document.getElementById('deal-id').value;
  const title = document.getElementById('deal-title').value.trim();
  if (!title) {
    showToast('Informe o título do negócio');
    return;
  }
  const personId = document.getElementById('deal-person').value || null;
  const contact = state.contacts.find((c) => c.id === personId);
  const payload = {
    title,
    value: Number(document.getElementById('deal-value').value) || 0,
    currency: document.getElementById('deal-currency').value,
    personId,
    orgId: contact ? contact.orgId : null,
    stage: document.getElementById('deal-stage').value,
    closeDate: document.getElementById('deal-close-date').value || null
  };

  try {
    if (id) {
      const updated = await Api.updateDeal(id, payload);
      const idx = state.deals.findIndex((d) => d.id === id);
      state.deals[idx] = updated;
      showToast('Negócio atualizado');
    } else {
      const created = await Api.addDeal(payload);
      state.deals.push(created);
      showToast('Negócio adicionado');
    }
    closeModal('modal-deal');
    renderKanban();
    renderDashboard();
  } catch (err) {
    showToast('Erro ao salvar negócio');
  }
}

// ============ Deal Detail Modal ============
function bindDealDetailModal() {
  document.getElementById('btn-mark-won').addEventListener('click', () => setDealStatus('won'));
  document.getElementById('btn-mark-lost').addEventListener('click', () => setDealStatus('lost'));
  document.getElementById('btn-delete-deal').addEventListener('click', deleteCurrentDeal);
  document.getElementById('btn-add-activity').addEventListener('click', addActivityToCurrentDeal);

  document.querySelectorAll('.activity-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.activity-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentActivityFilter = tab.dataset.atype;
      renderActivityFeed();
    });
  });
}

function renderStageDurations(deal) {
  const container = document.getElementById('dd-stage-durations');
  const history = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:8px 0;">Sem histórico</div>';
    return;
  }
  container.innerHTML = history
    .map((h) => {
      const isCurrent = !h.exitedAt;
      const days = daysBetween(h.enteredAt, h.exitedAt);
      return `
      <div class="stage-duration-row ${isCurrent ? 'current' : ''}">
        <span class="sd-name">${escapeHtml(stageName(h.stageId))}${isCurrent ? ' (atual)' : ''}</span>
        <span class="sd-days">${days} dia${days === 1 ? '' : 's'}</span>
      </div>
    `;
    })
    .join('');
}

async function openDealDetail(dealId) {
  state.currentDealId = dealId;
  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal) return;

  document.getElementById('dd-title').textContent = deal.title;
  document.getElementById('dd-value').textContent = fmtMoney(deal.value, deal.currency);
  document.getElementById('dd-stage-name').textContent = stageName(deal.stage);
  document.getElementById('dd-close-date').textContent = fmtDate(deal.closeDate);
  document.getElementById('dd-owner').textContent = userName(deal.ownerId);
  renderStageDurations(deal);

  const statusLabel = deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Em aberto';
  document.getElementById('dd-status-badge').innerHTML = `<span class="status-badge ${deal.status}">${statusLabel}</span>`;

  const contact = state.contacts.find((c) => c.id === deal.personId);
  const org = state.organizations.find((o) => o.id === deal.orgId);
  document.getElementById('dd-contact-name').textContent = contact ? contact.name : '-';
  document.getElementById('dd-contact-email').textContent = contact ? contact.email || '-' : '-';
  document.getElementById('dd-contact-phone').textContent = contact ? contact.phone || '-' : '-';
  document.getElementById('dd-org-name').textContent = org ? org.name : '-';
  document.getElementById('dd-org-address').textContent = org ? org.address || '-' : '-';

  state.currentActivityFilter = 'all';
  document.querySelectorAll('.activity-tab').forEach((t) => t.classList.toggle('active', t.dataset.atype === 'all'));

  if (!state.activitiesCache[dealId]) {
    state.activitiesCache[dealId] = await Api.activities(dealId);
  }
  renderActivityFeed();

  openModal('modal-deal-detail');
}

function renderActivityFeed() {
  const dealId = state.currentDealId;
  const feed = document.getElementById('activity-feed');
  let activities = (state.activitiesCache[dealId] || []).slice();
  if (state.currentActivityFilter !== 'all') {
    activities = activities.filter((a) => a.type === state.currentActivityFilter);
  }
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (activities.length === 0) {
    feed.innerHTML = '<div class="empty-state">Nenhuma atividade registrada ainda.</div>';
    return;
  }

  feed.innerHTML = activities
    .map(
      (a) => `
    <div class="activity-item">
      <div class="activity-icon">${ACTIVITY_ICON[a.type] || '📝'}</div>
      <div class="activity-content">
        <div class="type">${ACTIVITY_LABEL[a.type] || a.type}${a.type === 'task' ? (a.done ? ' · concluída' : ' · pendente') : ''}</div>
        <div class="text">${escapeHtml(a.text)}</div>
        <div class="date">${fmtDateTime(a.date)}</div>
      </div>
    </div>
  `
    )
    .join('');
}

async function addActivityToCurrentDeal() {
  const dealId = state.currentDealId;
  const type = document.getElementById('new-activity-type').value;
  const textEl = document.getElementById('new-activity-text');
  const text = textEl.value.trim();
  if (!text) {
    showToast('Escreva algo antes de adicionar');
    return;
  }
  try {
    const activity = await Api.addActivity(dealId, { type, text, date: new Date().toISOString(), done: type !== 'task' });
    if (!state.activitiesCache[dealId]) state.activitiesCache[dealId] = [];
    state.activitiesCache[dealId].push(activity);
    textEl.value = '';
    renderActivityFeed();
    renderKanban();
    if (type === 'task') {
      state.reminders = await Api.reminders();
    }
    showToast('Atividade adicionada');
  } catch (err) {
    showToast('Erro ao adicionar atividade');
  }
}

async function setDealStatus(status) {
  const dealId = state.currentDealId;
  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal) return;

  try {
    const updated = await Api.updateDeal(dealId, { status });
    Object.assign(deal, updated);
    showToast(status === 'won' ? 'Negócio marcado como Ganho 🎉' : 'Negócio marcado como Perdido');
    closeModal('modal-deal-detail');
    renderKanban();
    renderDashboard();
  } catch (err) {
    showToast('Erro ao atualizar negócio');
  }
}

async function deleteCurrentDeal() {
  const dealId = state.currentDealId;
  if (!confirm('Tem certeza que deseja excluir este negócio?')) return;
  try {
    await Api.deleteDeal(dealId);
    state.deals = state.deals.filter((d) => d.id !== dealId);
    delete state.activitiesCache[dealId];
    closeModal('modal-deal-detail');
    renderKanban();
    renderDashboard();
    showToast('Negócio excluído');
  } catch (err) {
    showToast('Erro ao excluir negócio');
  }
}

// ============ Leads (people) ============
function bindLeadsPage() {
  document.getElementById('leads-filter').addEventListener('input', renderLeads);
  document.getElementById('leads-category-filter').addEventListener('change', renderLeads);
  document.getElementById('btn-add-contact').addEventListener('click', () => openContactModal());
}

function populateCategoryFilter() {
  const select = document.getElementById('leads-category-filter');
  const current = select.value;
  select.innerHTML = '<option value="">Todas as categorias</option>';
  (state.settings.categories || []).forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderLeads() {
  populateCategoryFilter();
  const filter = (document.getElementById('leads-filter').value || '').toLowerCase();
  const categoryFilter = document.getElementById('leads-category-filter').value;

  const filtered = state.contacts.filter((c) => {
    const org = c.orgId ? orgName(c.orgId) : '';
    const matchesText =
      c.name.toLowerCase().includes(filter) ||
      (c.email || '').toLowerCase().includes(filter) ||
      org.toLowerCase().includes(filter);
    const matchesCategory = !categoryFilter || c.category === categoryFilter;
    return matchesText && matchesCategory;
  });

  const tbody = document.getElementById('leads-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Nenhum lead encontrado.</div></td></tr>';
  } else {
    tbody.innerHTML = filtered
      .map((c) => {
        const cat = categoryById(c.category);
        const catBadge = cat ? `<span class="category-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>` : '-';
        const tagsHtml = (c.tags || [])
          .map((tid) => tagById(tid))
          .filter(Boolean)
          .map((t) => `<span class="tag-pill" style="background:${t.color}">${escapeHtml(t.name)}</span>`)
          .join('') || '-';
        const sourceLabel = c.source ? SOURCE_LABEL[c.source.channel] || c.source.channel : '-';
        return `
        <tr class="clickable" data-lead-id="${c.id}">
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.orgId ? orgName(c.orgId) : '-')}</td>
          <td>${catBadge}</td>
          <td>${escapeHtml(sourceLabel)}</td>
          <td>${tagsHtml}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary" data-gerar-negocio="${c.id}" style="padding:5px 10px; font-size:11.5px;">+ Negócio</button>
              <button class="icon-btn" data-edit-contact="${c.id}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-del-contact="${c.id}" title="Excluir">🗑️</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  bindLeadRowActions();
}

function bindLeadRowActions() {
  document.querySelectorAll('#leads-tbody tr[data-lead-id]').forEach((row) => {
    row.addEventListener('click', () => openLeadDetail(row.dataset.leadId));
  });
  document.querySelectorAll('[data-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = state.contacts.find((c) => c.id === btn.dataset.editContact);
      openContactModal(c);
    });
  });
  document.querySelectorAll('[data-del-contact]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir este lead?')) return;
      try {
        await Api.deleteContact(btn.dataset.delContact);
        state.contacts = state.contacts.filter((c) => c.id !== btn.dataset.delContact);
        renderLeads();
        showToast('Lead excluído');
      } catch (err) {
        showToast('Erro ao excluir lead');
      }
    });
  });
  document.querySelectorAll('[data-gerar-negocio]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDealModal(null, btn.dataset.gerarNegocio);
    });
  });
}

// ---- Lead Detail modal ----
function bindLeadDetailModal() {
  document.getElementById('btn-gerar-negocio').addEventListener('click', () => {
    const leadId = state.currentLeadId;
    closeModal('modal-lead-detail');
    openDealModal(null, leadId);
  });
  document.getElementById('btn-edit-lead-from-detail').addEventListener('click', () => {
    const lead = state.contacts.find((c) => c.id === state.currentLeadId);
    closeModal('modal-lead-detail');
    openContactModal(lead);
  });
}

function openLeadDetail(leadId) {
  const lead = state.contacts.find((c) => c.id === leadId);
  if (!lead) return;
  state.currentLeadId = leadId;

  document.getElementById('ld-name').textContent = lead.name;
  document.getElementById('ld-email').textContent = lead.email || '-';
  document.getElementById('ld-phone').textContent = lead.phone || '-';
  document.getElementById('ld-org').textContent = lead.orgId ? orgName(lead.orgId) : '-';

  const cat = categoryById(lead.category);
  document.getElementById('ld-category').innerHTML = cat
    ? `<span class="category-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>`
    : '-';

  const tagsHtml = (lead.tags || [])
    .map((tid) => tagById(tid))
    .filter(Boolean)
    .map((t) => `<span class="tag-pill" style="background:${t.color}">${escapeHtml(t.name)}</span>`)
    .join('');
  document.getElementById('ld-tags').innerHTML = tagsHtml || '-';

  const ch = lead.channels || {};
  const channelRows = [];
  if (ch.whatsapp) channelRows.push(`<div class="channel-row">📞 WhatsApp: ${escapeHtml(ch.whatsapp)}</div>`);
  if (ch.facebookPsid) channelRows.push(`<div class="channel-row">📘 Facebook ID: ${escapeHtml(ch.facebookPsid)}</div>`);
  if (ch.instagramId) channelRows.push(`<div class="channel-row">📷 Instagram ID: ${escapeHtml(ch.instagramId)}</div>`);
  if (lead.email) channelRows.push(`<div class="channel-row">✉️ ${escapeHtml(lead.email)}</div>`);
  document.getElementById('ld-channels').innerHTML = channelRows.join('') || '-';

  const sourceLabel = lead.source ? SOURCE_LABEL[lead.source.channel] || lead.source.channel : '-';
  const campaign = lead.source && lead.source.campaign ? ` — ${escapeHtml(lead.source.campaign)}` : '';
  document.getElementById('ld-source').textContent = sourceLabel === '-' ? '-' : `${sourceLabel}${campaign}`;

  const linkedDeals = state.deals.filter((d) => d.personId === leadId);
  const dealsContainer = document.getElementById('ld-deals-list');
  if (linkedDeals.length === 0) {
    dealsContainer.innerHTML = '<div class="empty-state">Nenhum negócio vinculado ainda. Use "+ Gerar Negócio" para criar o primeiro.</div>';
  } else {
    dealsContainer.innerHTML = linkedDeals
      .map((deal) => {
        const statusLabel = deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Em aberto';
        const history = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
        const durationsHtml = history
          .map((h) => {
            const isCurrent = !h.exitedAt;
            const days = daysBetween(h.enteredAt, h.exitedAt);
            return `<div class="stage-duration-row ${isCurrent ? 'current' : ''}"><span class="sd-name">${escapeHtml(
              stageName(h.stageId)
            )}${isCurrent ? ' (atual)' : ''}</span><span class="sd-days">${days} dia${days === 1 ? '' : 's'}</span></div>`;
          })
          .join('');
        return `
        <div class="panel" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong>${escapeHtml(deal.title)}</strong>
            <span class="status-badge ${deal.status}">${statusLabel}</span>
          </div>
          <div style="color:var(--vg-green); font-weight:700; margin-bottom:8px;">${fmtMoney(deal.value, deal.currency)} · ${escapeHtml(
          stageName(deal.stage)
        )}</div>
          <div class="k" style="font-size:11px; color:#8a94a6; text-transform:uppercase; margin-bottom:4px;">Tempo em cada etapa</div>
          ${durationsHtml}
        </div>
      `;
      })
      .join('');
  }

  openModal('modal-lead-detail');
}

// ============ Organizations page ============
function bindOrgsPage() {
  document.getElementById('orgs-filter').addEventListener('input', renderOrgs);
  document.getElementById('btn-add-org').addEventListener('click', () => openOrgModal());
}

function renderOrgs() {
  const filter = (document.getElementById('orgs-filter').value || '').toLowerCase();
  const orgsBody = document.getElementById('orgs-tbody');
  const filteredOrgs = state.organizations.filter((o) => o.name.toLowerCase().includes(filter));
  if (filteredOrgs.length === 0) {
    orgsBody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Nenhuma empresa encontrada.</div></td></tr>';
  } else {
    orgsBody.innerHTML = filteredOrgs
      .map((o) => {
        const linkedCount = state.contacts.filter((c) => c.orgId === o.id).length;
        return `
        <tr>
          <td>${escapeHtml(o.name)}</td>
          <td>${escapeHtml(o.address || '-')}</td>
          <td>${linkedCount} lead${linkedCount === 1 ? '' : 's'}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-edit-org="${o.id}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-del-org="${o.id}" title="Excluir">🗑️</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  document.querySelectorAll('[data-edit-org]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const o = state.organizations.find((o) => o.id === btn.dataset.editOrg);
      openOrgModal(o);
    });
  });
  document.querySelectorAll('[data-del-org]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir esta empresa?')) return;
      try {
        await Api.deleteOrg(btn.dataset.delOrg);
        state.organizations = state.organizations.filter((o) => o.id !== btn.dataset.delOrg);
        renderOrgs();
        showToast('Empresa excluída');
      } catch (err) {
        showToast('Erro ao excluir empresa');
      }
    });
  });
}

// ---- Contact (Lead) modal ----
function bindContactModal() {
  document.getElementById('btn-save-contact').addEventListener('click', saveContact);
}

function populateOrgSelect(selectId, selectedId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Sem empresa</option>';
  state.organizations.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name;
    if (o.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateCategorySelect(selectedId) {
  const select = document.getElementById('contact-category');
  select.innerHTML = '<option value="">Selecionar...</option>';
  (state.settings.categories || []).forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateTagChecks(selectedIds) {
  const container = document.getElementById('contact-tags-checks');
  const selected = selectedIds || [];
  if (state.tags.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:4px 0;">Nenhuma etiqueta cadastrada. Crie em Configurações > Etiquetas.</div>';
    return;
  }
  container.innerHTML = state.tags
    .map(
      (t) => `
    <label class="tag-check-row">
      <input type="checkbox" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''} />
      <span class="tag-pill" style="background:${t.color}">${escapeHtml(t.name)}</span>
    </label>
  `
    )
    .join('');
}

function openContactModal(contact) {
  document.getElementById('contact-modal-title').textContent = contact ? 'Editar Lead' : 'Adicionar Lead';
  document.getElementById('contact-id').value = contact ? contact.id : '';
  document.getElementById('contact-name').value = contact ? contact.name : '';
  document.getElementById('contact-email').value = contact ? contact.email : '';
  document.getElementById('contact-phone').value = contact ? contact.phone : '';
  document.getElementById('contact-notes').value = contact ? contact.notes || '' : '';
  document.getElementById('contact-source-campaign').value = contact && contact.source ? contact.source.campaign || '' : '';
  if (contact && contact.source) document.getElementById('contact-source-channel').value = contact.source.channel;
  populateOrgSelect('contact-org', contact ? contact.orgId : null);
  populateCategorySelect(contact ? contact.category : null);
  populateTagChecks(contact ? contact.tags : []);
  openModal('modal-contact');
}

async function saveContact() {
  const id = document.getElementById('contact-id').value;
  const name = document.getElementById('contact-name').value.trim();
  if (!name) {
    showToast('Informe o nome do lead');
    return;
  }
  const checkedTags = Array.from(document.querySelectorAll('#contact-tags-checks input:checked')).map((el) => el.value);
  const existing = state.contacts.find((c) => c.id === id);
  const payload = {
    name,
    email: document.getElementById('contact-email').value.trim(),
    phone: document.getElementById('contact-phone').value.trim(),
    orgId: document.getElementById('contact-org').value || null,
    notes: document.getElementById('contact-notes').value.trim(),
    category: document.getElementById('contact-category').value || null,
    tags: checkedTags,
    source: {
      channel: document.getElementById('contact-source-channel').value,
      campaign: document.getElementById('contact-source-campaign').value.trim()
    },
    channels: (existing && existing.channels) || { whatsapp: '', facebookPsid: '', instagramId: '' }
  };
  if (payload.phone) payload.channels = { ...payload.channels, whatsapp: payload.phone.replace(/\D/g, '') };

  try {
    if (id) {
      const updated = await Api.updateContact(id, payload);
      const idx = state.contacts.findIndex((c) => c.id === id);
      state.contacts[idx] = updated;
      showToast('Lead atualizado');
    } else {
      const created = await Api.addContact(payload);
      state.contacts.push(created);
      showToast('Lead adicionado');
    }
    closeModal('modal-contact');
    renderLeads();
  } catch (err) {
    showToast('Erro ao salvar lead');
  }
}

// ---- Organization modal ----
function bindOrgModal() {
  document.getElementById('btn-save-org').addEventListener('click', saveOrg);
}

function openOrgModal(org) {
  document.getElementById('org-modal-title').textContent = org ? 'Editar Empresa' : 'Adicionar Empresa';
  document.getElementById('org-id').value = org ? org.id : '';
  document.getElementById('org-name').value = org ? org.name : '';
  document.getElementById('org-address').value = org ? org.address : '';
  openModal('modal-org');
}

async function saveOrg() {
  const id = document.getElementById('org-id').value;
  const name = document.getElementById('org-name').value.trim();
  if (!name) {
    showToast('Informe o nome da empresa');
    return;
  }
  const payload = { name, address: document.getElementById('org-address').value.trim() };
  try {
    if (id) {
      const updated = await Api.updateOrg(id, payload);
      const idx = state.organizations.findIndex((o) => o.id === id);
      state.organizations[idx] = updated;
      showToast('Empresa atualizada');
    } else {
      const created = await Api.addOrg(payload);
      state.organizations.push(created);
      showToast('Empresa adicionada');
    }
    closeModal('modal-org');
    renderOrgs();
  } catch (err) {
    showToast('Erro ao salvar empresa');
  }
}

// ============ Settings ============
function bindSettingsPanel() {
  document.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach((p) => (p.style.display = 'none'));
      document.getElementById(`stab-${tab.dataset.stab}`).style.display = '';
      if (tab.dataset.stab === 'integrations') loadIntegrationsForm();
    });
  });

  document.getElementById('btn-add-stage').addEventListener('click', async () => {
    const input = document.getElementById('new-stage-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      const stage = await Api.addStage(name);
      state.stages.push(stage);
      input.value = '';
      renderSettings();
      renderKanban();
      showToast('Etapa adicionada');
    } catch (err) {
      showToast('Erro ao adicionar etapa');
    }
  });

  document.getElementById('btn-add-user').addEventListener('click', async () => {
    const input = document.getElementById('new-user-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      const user = await Api.addUser(name);
      state.users.push(user);
      input.value = '';
      renderSettings();
      showToast('Usuário adicionado');
    } catch (err) {
      showToast('Erro ao adicionar usuário');
    }
  });

  document.getElementById('btn-add-field').addEventListener('click', async () => {
    const input = document.getElementById('new-field-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      const field = await Api.addField(name);
      state.settings.customFields.push(field);
      input.value = '';
      renderSettings();
      showToast('Campo adicionado');
    } catch (err) {
      showToast('Erro ao adicionar campo');
    }
  });

  document.getElementById('btn-add-tag').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-tag-name');
    const colorInput = document.getElementById('new-tag-color');
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const tag = await Api.addTag(name, colorInput.value);
      state.tags.push(tag);
      nameInput.value = '';
      renderSettings();
      showToast('Etiqueta adicionada');
    } catch (err) {
      showToast('Erro ao adicionar etiqueta');
    }
  });

  document.getElementById('btn-save-integrations').addEventListener('click', saveIntegrations);
}

function renderSettings() {
  const stagesList = document.getElementById('stages-list');
  const sorted = state.stages.slice().sort((a, b) => a.order - b.order);
  stagesList.innerHTML = sorted
    .map(
      (s, idx) => `
    <div class="list-row">
      <span class="name">${escapeHtml(s.name)}</span>
      <div class="row-actions">
        <button class="icon-btn" data-move-up="${s.id}" ${idx === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
        <button class="icon-btn" data-move-down="${s.id}" ${idx === sorted.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
        <button class="icon-btn danger" data-del-stage="${s.id}" title="Excluir">🗑️</button>
      </div>
    </div>
  `
    )
    .join('');

  stagesList.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => moveStage(btn.dataset.moveUp, -1));
  });
  stagesList.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => moveStage(btn.dataset.moveDown, 1));
  });
  stagesList.querySelectorAll('[data-del-stage]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta etapa? Só é possível se não houver negócios nela.')) return;
      try {
        await Api.deleteStage(btn.dataset.delStage);
        state.stages = state.stages.filter((s) => s.id !== btn.dataset.delStage);
        renderSettings();
        renderKanban();
        showToast('Etapa excluída');
      } catch (err) {
        showToast(err.message || 'Erro ao excluir etapa');
      }
    });
  });

  const usersList = document.getElementById('users-list');
  usersList.innerHTML = state.users
    .map(
      (u) => `
    <div class="list-row">
      <span class="name">${escapeHtml(u.name)}</span>
      <div class="row-actions">
        <button class="icon-btn danger" data-del-user="${u.id}" title="Excluir">🗑️</button>
      </div>
    </div>
  `
    )
    .join('');
  usersList.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este usuário?')) return;
      try {
        await Api.deleteUser(btn.dataset.delUser);
        state.users = state.users.filter((u) => u.id !== btn.dataset.delUser);
        renderSettings();
        showToast('Usuário excluído');
      } catch (err) {
        showToast(err.message || 'Erro ao excluir usuário');
      }
    });
  });

  const fieldsList = document.getElementById('fields-list');
  const fields = state.settings.customFields || [];
  fieldsList.innerHTML = fields.length
    ? fields
        .map(
          (f) => `
    <div class="list-row">
      <span class="name">${escapeHtml(f.name)}</span>
      <div class="row-actions">
        <button class="icon-btn danger" data-del-field="${f.id}" title="Excluir">🗑️</button>
      </div>
    </div>
  `
        )
        .join('')
    : '<div class="empty-state">Nenhum campo personalizado cadastrado.</div>';
  fieldsList.querySelectorAll('[data-del-field]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteField(btn.dataset.delField);
        state.settings.customFields = state.settings.customFields.filter((f) => f.id !== btn.dataset.delField);
        renderSettings();
        showToast('Campo removido');
      } catch (err) {
        showToast('Erro ao remover campo');
      }
    });
  });

  const tagsList = document.getElementById('tags-list');
  tagsList.innerHTML = state.tags.length
    ? state.tags
        .map(
          (t) => `
    <div class="list-row">
      <span class="tag-pill" style="background:${t.color}">${escapeHtml(t.name)}</span>
      <div class="row-actions">
        <button class="icon-btn danger" data-del-tag="${t.id}" title="Excluir">🗑️</button>
      </div>
    </div>
  `
        )
        .join('')
    : '<div class="empty-state">Nenhuma etiqueta cadastrada.</div>';
  tagsList.querySelectorAll('[data-del-tag]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteTag(btn.dataset.delTag);
        state.tags = state.tags.filter((t) => t.id !== btn.dataset.delTag);
        renderSettings();
        showToast('Etiqueta removida');
      } catch (err) {
        showToast('Erro ao remover etiqueta');
      }
    });
  });
}

async function moveStage(id, direction) {
  const sorted = state.stages.slice().sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === id);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
  const orderedIds = sorted.map((s) => s.id);
  try {
    const updatedStages = await Api.reorderStages(orderedIds);
    state.stages = updatedStages;
    renderSettings();
    renderKanban();
  } catch (err) {
    showToast('Erro ao reordenar etapas');
  }
}

// ---- Integrations settings ----
function loadIntegrationsForm() {
  const i = state.settings.integrations || {};
  const wa = i.whatsapp || {};
  const fb = i.facebook || {};
  const ig = i.instagram || {};
  const ga = i.googleAds || {};
  const email = i.email || {};
  const esig = i.eSignature || {};

  document.getElementById('int-wa-phone').value = wa.phoneNumberId || '';
  document.getElementById('int-wa-verify').value = wa.verifyToken || '';
  document.getElementById('int-wa-token').value = wa.accessToken || '';

  document.getElementById('int-fb-appid').value = fb.appId || '';
  document.getElementById('int-fb-secret').value = fb.appSecret || '';
  document.getElementById('int-fb-token').value = fb.pageAccessToken || '';

  document.getElementById('int-ig-token').value = ig.accessToken || '';

  document.getElementById('int-ga-devtoken').value = ga.developerToken || '';
  document.getElementById('int-ga-clientid').value = ga.clientId || '';
  document.getElementById('int-ga-secret').value = ga.clientSecret || '';
  document.getElementById('int-ga-refresh').value = ga.refreshToken || '';

  document.getElementById('int-smtp-host').value = email.smtpHost || '';
  document.getElementById('int-smtp-port').value = email.smtpPort || '';
  document.getElementById('int-smtp-user').value = email.smtpUser || '';
  document.getElementById('int-smtp-pass').value = email.smtpPass || '';

  document.getElementById('int-esig-provider').value = esig.provider || '';
  document.getElementById('int-esig-key').value = esig.apiKey || '';

  document.getElementById('wa-webhook-url').textContent = window.location.origin + '/api/webhooks/whatsapp';
}

async function saveIntegrations() {
  const integrations = {
    whatsapp: {
      phoneNumberId: document.getElementById('int-wa-phone').value.trim(),
      verifyToken: document.getElementById('int-wa-verify').value.trim(),
      accessToken: document.getElementById('int-wa-token').value.trim()
    },
    facebook: {
      appId: document.getElementById('int-fb-appid').value.trim(),
      appSecret: document.getElementById('int-fb-secret').value.trim(),
      pageAccessToken: document.getElementById('int-fb-token').value.trim()
    },
    instagram: {
      accessToken: document.getElementById('int-ig-token').value.trim()
    },
    googleAds: {
      developerToken: document.getElementById('int-ga-devtoken').value.trim(),
      clientId: document.getElementById('int-ga-clientid').value.trim(),
      clientSecret: document.getElementById('int-ga-secret').value.trim(),
      refreshToken: document.getElementById('int-ga-refresh').value.trim()
    },
    email: {
      provider: 'smtp',
      smtpHost: document.getElementById('int-smtp-host').value.trim(),
      smtpPort: document.getElementById('int-smtp-port').value.trim(),
      smtpUser: document.getElementById('int-smtp-user').value.trim(),
      smtpPass: document.getElementById('int-smtp-pass').value.trim()
    },
    eSignature: {
      provider: document.getElementById('int-esig-provider').value,
      apiKey: document.getElementById('int-esig-key').value.trim()
    }
  };

  try {
    const updated = await Api.updateSettings({ integrations });
    state.settings = updated;
    showToast('Integrações salvas');
  } catch (err) {
    showToast('Erro ao salvar integrações');
  }
}

// ============ Boot ============
init();
