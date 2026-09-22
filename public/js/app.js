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
  currentOrgId: null,
  currentActivityFilter: 'all',
  showClosedDeals: false,
  attendantId: null,
  leadChatChannel: 'whatsapp',
  aiChatDealId: null,
  aiChatHistory: [],
  notifications: [],
  shownNotificationIds: new Set(),
  commsLeadId: null,
  commsChannel: 'whatsapp',
  leadActivitiesCache: {},
  leadActivityFilter: 'all',
  emailComposeLeadId: null,
  emailInboxLeadId: null,
  emailAttachments: [],
  emailSignatureInserted: false,
  teamChatMessages: [],
  teamChatSeenCount: 0,
  teamChatPollHandle: null,
  teamChatPendingAttachment: null,
  teamChatRecorder: null,
  teamChatRecordedChunks: [],
  teamChatTarget: null, // null = Geral; caso contrário, id do usuário do chat privado
  biTab: 'geral',
  biPollHandle: null
};

const ATTENDANT_KEY = 'vg_attendant_id';
const CURRENCY_SYMBOL = { BRL: 'R$', USD: '$', EUR: '€' };

// ============ Ícones (SVG padronizado, substitui emojis soltos na interface) ============
const ICON_PATHS = {
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
  email: '<path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2z"></path><polyline points="22 6 12 13 2 6"></polyline>',
  call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"></path>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>',
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
  attach: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
  globe: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"></line>',
  warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
  errorX: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
  target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
  clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  sparkle: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>',
  clipboard: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
  smile: '<circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>'
};

function svgIcon(name, size) {
  const s = size || 14;
  const path = ICON_PATHS[name] || ICON_PATHS.note;
  return `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;">${path}</svg>`;
}

const ACTIVITY_ICON = { note: svgIcon('note'), email: svgIcon('email'), call: svgIcon('call'), meeting: svgIcon('calendar'), task: svgIcon('check') };
const ACTIVITY_LABEL = { note: 'Nota', email: 'E-mail', call: 'Chamada', meeting: 'Reunião', task: 'Tarefa' };
const SOURCE_LABEL = {
  facebook_ads: 'Facebook Ads',
  instagram_ads: 'Instagram Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads / Spark Ads',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  organico: 'Orgânico / Site'
};
const TRAFEGO_PAGO_CHANNELS = ['facebook_ads', 'instagram_ads', 'google_ads', 'tiktok_ads'];
const MARKETPLACE_PLATFORMS = ['Mercado Livre', 'Shopee', 'Amazon', 'TikTok Shop'];
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', email: 'E-mail', site: 'Site' };

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
  addUser: (name, ramal) => api('/api/users', { method: 'POST', body: JSON.stringify({ name, ramal }) }),
  updateUser: (id, payload) => api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id) => api(`/api/users/${id}`, { method: 'DELETE' }),
  tags: () => api('/api/tags'),
  addTag: (name, color, type) => api('/api/tags', { method: 'POST', body: JSON.stringify({ name, color, type }) }),
  deleteTag: (id) => api(`/api/tags/${id}`, { method: 'DELETE' }),
  reminders: () => api('/api/reminders'),
  settings: () => api('/api/settings'),
  updateSettings: (payload) => api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  addField: (name) => api('/api/settings/custom-fields', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteField: (id) => api(`/api/settings/custom-fields/${id}`, { method: 'DELETE' }),
  activities: (dealId) => api(`/api/deals/${dealId}/activities`),
  addActivity: (dealId, payload) => api(`/api/deals/${dealId}/activities`, { method: 'POST', body: JSON.stringify(payload) }),
  updateActivity: (id, payload) => api(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  leadMessages: (leadId, channel) => api(`/api/leads/${leadId}/messages?channel=${channel}`),
  sendLeadMessage: (leadId, channel, text, attendantId) =>
    api(`/api/leads/${leadId}/messages`, { method: 'POST', body: JSON.stringify({ channel, text, attendantId }) }),
  sendEmail: (leadId, payload) => api(`/api/leads/${leadId}/messages`, { method: 'POST', body: JSON.stringify({ channel: 'email', ...payload }) }),
  callLead: (leadId, attendantId) => api(`/api/leads/${leadId}/call`, { method: 'POST', body: JSON.stringify({ attendantId }) }),
  aiTips: () => api('/api/ai/tips'),
  aiSmartTips: () => api('/api/ai/smart-tips', { method: 'POST' }),
  aiChat: (dealId, message, history) => api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ dealId, message, history }) }),
  leadHistory: (leadId) => api(`/api/leads/${leadId}/history`),
  orgHistory: (orgId) => api(`/api/organizations/${orgId}/history`),
  allMessages: () => api('/api/messages'),
  notifications: () => api('/api/notifications'),
  unreadCount: () => api('/api/notifications/unread-count'),
  markNotifRead: (id) => api(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotifRead: () => api('/api/notifications/read-all', { method: 'POST' }),
  allActivities: () => api('/api/activities'),
  leadActivities: (leadId) => api(`/api/leads/${leadId}/activities`),
  addLeadActivity: (leadId, payload) => api(`/api/leads/${leadId}/activities`, { method: 'POST', body: JSON.stringify(payload) }),
  syncCalendar: (activityId) => api(`/api/activities/${activityId}/sync-calendar`, { method: 'POST' }),
  teamChat: (attendantId) => api(`/api/team-chat?attendantId=${encodeURIComponent(attendantId || '')}`),
  sendTeamChat: (payload) => api('/api/team-chat', { method: 'POST', body: JSON.stringify(payload) }),
  markTeamChatRead: (id, attendantId) => api(`/api/team-chat/${id}/read`, { method: 'POST', body: JSON.stringify({ attendantId }) }),
  calendarEvents: () => api('/api/calendar/events'),
  addCalendarEvent: (payload) => api('/api/activities', { method: 'POST', body: JSON.stringify(payload) }),
  googleDisconnect: (userId) => api(`/api/users/${userId}/google-disconnect`, { method: 'POST' }),
  gmailInboxMessages: () => api('/api/email-inbox/gmail/messages'),
  gmailInboxMessage: (id) => api(`/api/email-inbox/gmail/messages/${id}`),
  gmailInboxDisconnect: () => api('/api/settings/gmail-inbox-disconnect', { method: 'POST' }),
  myInboxMessages: (attendantId) => api(`/api/email-inbox/my/messages?attendantId=${encodeURIComponent(attendantId || '')}`),
  myInboxMessage: (attendantId, id) => api(`/api/email-inbox/my/messages/${id}?attendantId=${encodeURIComponent(attendantId || '')}`)
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

  renderDashboard();
  renderKanban();
  renderLeads();
  renderOrgs();
  renderSettings();

  bindNav();
  bindSidebarToggle();
  bindThemeToggle();
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
  bindAttendant();
  bindLeadChat();
  bindAiAssistant();
  bindOrgDetailModal();
  bindExtraInfo();
  bindNotifications();
  bindComms();
  bindEmailInbox();
  bindEmailCompose();
  bindUserSignatureModal();
  bindRoteiro();
  bindTeamChat();
  bindBiTabs();
  bindGoogleCalendarPopup();
  bindCalendarioPage();

  ensureAttendant();
  pollNotifications();
  setInterval(pollNotifications, 25000);
  pollTeamChatBadge();
  setInterval(pollTeamChatBadge, 25000);
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
  document.querySelectorAll('.sidebar-link').forEach((t) => t.classList.toggle('active', t.dataset.view === viewName));

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'pipeline') renderKanban();
  if (viewName === 'leads') renderLeads();
  if (viewName === 'orgs') renderOrgs();
  if (viewName === 'comunicacoes') renderComms();
  if (viewName === 'email') renderEmailInbox();
  if (viewName === 'mensagens') renderMensagens();
  if (viewName === 'bi') {
    renderBiActiveTab();
    startBiPolling();
  } else {
    stopBiPolling();
  }
  if (viewName === 'roteiro') renderRoteiro();
  if (viewName === 'calendario') renderCalendario();
  if (viewName === 'chatequipe') {
    renderTeamChat();
    startTeamChatPolling();
  } else {
    stopTeamChatPolling();
  }
}

function bindNav() {
  document.querySelectorAll('.sidebar-link[data-view]').forEach((link) => {
    link.addEventListener('click', () => {
      switchView(link.dataset.view);
      if (isMobileViewport()) setSidebarOpen(false);
    });
  });
}

const MOBILE_BREAKPOINT = 900;

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function setSidebarOpen(open) {
  document.getElementById('sidebar').classList.toggle('collapsed', !open);
  document.getElementById('sidebar-backdrop').classList.toggle('show', open && isMobileViewport());
}

function bindSidebarToggle() {
  if (isMobileViewport()) setSidebarOpen(false);

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const isOpen = !document.getElementById('sidebar').classList.contains('collapsed');
    setSidebarOpen(!isOpen);
  });

  document.getElementById('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
}

// Tema claro/escuro — chave compartilhada com o Gerador de Roteiros (mesmo site).
const THEME_KEY = 'vg_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function initTheme() {
  let saved = 'light';
  try {
    saved = localStorage.getItem(THEME_KEY) || 'light';
  } catch (e) {
    // localStorage indisponível — segue com o tema claro padrão
  }
  applyTheme(saved);
}

function bindThemeToggle() {
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      // sem localStorage, a escolha só vale para esta sessão
    }
  });
}

initTheme();

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
    if (overlay.id === 'modal-attendant') return; // seleção de atendente é obrigatória
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}

// ============ Atendente (identidade de quem está usando o CRM) ============
function currentAttendant() {
  return state.users.find((u) => u.id === state.attendantId);
}

function updateAttendantTopbar() {
  const attendant = currentAttendant();
  document.getElementById('attendant-name').textContent = attendant ? attendant.name : '-';
}

function ensureAttendant() {
  const stored = localStorage.getItem(ATTENDANT_KEY);
  if (stored && state.users.some((u) => u.id === stored)) {
    state.attendantId = stored;
    updateAttendantTopbar();
    return;
  }
  openAttendantPicker();
}

function openAttendantPicker() {
  const select = document.getElementById('attendant-select');
  select.innerHTML = state.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  if (state.attendantId) select.value = state.attendantId;
  openModal('modal-attendant');
}

function bindAttendant() {
  document.getElementById('btn-switch-attendant').addEventListener('click', openAttendantPicker);
  document.getElementById('btn-confirm-attendant').addEventListener('click', () => {
    const id = document.getElementById('attendant-select').value;
    if (!id) return;
    state.attendantId = id;
    localStorage.setItem(ATTENDANT_KEY, id);
    updateAttendantTopbar();
    closeModal('modal-attendant');
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
    container.innerHTML = '<div class="empty-state">Nenhum lembrete pendente.</div>';
    return;
  }
  container.innerHTML = reminders
    .slice(0, 8)
    .map(
      (r) => `
    <div class="reminder-item ${r.overdue ? 'overdue' : ''}" data-open-deal="${r.dealId || ''}" data-open-lead="${r.leadId || ''}">
      <div>
        <div class="rt-text">${r.overdue ? svgIcon('warning') + ' ' : ''}${escapeHtml(r.text)}</div>
        <div class="rt-deal">${escapeHtml(r.dealTitle)}</div>
      </div>
      <div class="rt-date">${fmtDateTime(r.date)}</div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.reminder-item').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.openDeal) {
        switchView('pipeline');
        openDealDetail(el.dataset.openDeal);
      } else if (el.dataset.openLead) {
        switchView('leads');
        openLeadDetail(el.dataset.openLead);
      }
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
  const contact = state.contacts.find((c) => c.id === deal.personId);
  const dealCategories = contact ? contactCategoryObjects(contact) : [];
  const categoryBadges = dealCategories
    .map((cat) => `<span class="category-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>`)
    .join('');

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
    ${categoryBadges ? `<div class="deal-badges">${categoryBadges}</div>` : ''}
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
  document.getElementById('deal-platform').value = deal && deal.platform ? deal.platform : '';
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
    closeDate: document.getElementById('deal-close-date').value || null,
    platform: document.getElementById('deal-platform').value || null
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

function renderDealTagChecks(deal) {
  const container = document.getElementById('dd-tags-checks');
  const selected = Array.isArray(deal.tags) ? deal.tags : [];
  if (state.tags.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:4px 0;">Nenhuma etiqueta cadastrada. Crie em Configurações > Etiquetas.</div>';
    return;
  }
  container.className = 'tag-chip-group';
  container.innerHTML = state.tags
    .map(
      (t) => `
    <label class="tag-chip" style="--chip-color:${t.color}">
      <input type="checkbox" value="${t.id}" data-deal-tag-check ${selected.includes(t.id) ? 'checked' : ''} />
      <span class="tag-chip-label">${escapeHtml(t.name)}</span>
    </label>
  `
    )
    .join('');

  container.querySelectorAll('[data-deal-tag-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => saveDealTags(deal.id));
  });
}

async function saveDealTags(dealId) {
  const container = document.getElementById('dd-tags-checks');
  const checkedIds = Array.from(container.querySelectorAll('[data-deal-tag-check]:checked')).map((c) => c.value);
  try {
    const updated = await Api.updateDeal(dealId, { tags: checkedIds });
    const deal = state.deals.find((d) => d.id === dealId);
    if (deal) deal.tags = updated.tags || checkedIds;
  } catch (err) {
    showToast('Erro ao salvar etiquetas do negócio');
  }
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
  renderExtraInfoList('dd-extra-info', deal.extraInfo, (itemId) => deleteExtraInfo('deal', dealId, itemId));
  renderDealTagChecks(deal);

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

async function renderActivityFeed() {
  const dealId = state.currentDealId;
  const feed = document.getElementById('activity-feed');

  if (state.currentActivityFilter === 'email') {
    const deal = state.deals.find((d) => d.id === dealId);
    const contact = deal ? state.contacts.find((c) => c.id === deal.personId) : null;
    if (!contact) {
      feed.innerHTML = '<div class="empty-state">Este negócio não tem um contato vinculado.</div>';
      return;
    }
    feed.innerHTML = '<div class="empty-state">Carregando e-mails...</div>';
    try {
      const messages = await Api.leadMessages(contact.id, 'email');
      feed.innerHTML = renderEmailList(messages, contact.name);
    } catch (err) {
      feed.innerHTML = '<div class="empty-state">Erro ao carregar e-mails.</div>';
    }
    return;
  }

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
    .map((a) => {
      const canSync = a.type === 'meeting' || a.type === 'task';
      const syncBtn = canSync
        ? a.googleEventLink
          ? `<a href="${a.googleEventLink}" target="_blank" class="gcal-sync-btn">${svgIcon('calendar')} Ver no Calendar</a>`
          : `<button class="gcal-sync-btn" data-sync-deal-activity="${a.id}">${svgIcon('calendar')} Sincronizar</button>`
        : '';
      return `
    <div class="activity-item">
      <button class="activity-check ${a.done ? 'done' : ''}" data-toggle-activity="${a.id}" title="${a.done ? 'Marcar como pendente' : 'Marcar como feito'}">${a.done ? '✓' : ''}</button>
      <div class="activity-icon">${ACTIVITY_ICON[a.type] || svgIcon('note')}</div>
      <div class="activity-content">
        <div class="type">${ACTIVITY_LABEL[a.type] || a.type}${a.done ? ' · concluída' : ' · pendente'}</div>
        <div class="text">${escapeHtml(a.text)}</div>
        <div class="date">${a.attendantName ? escapeHtml(a.attendantName) + ' · ' : ''}${fmtDateTime(a.date)} ${syncBtn}</div>
      </div>
    </div>
  `;
    })
    .join('');

  feed.querySelectorAll('[data-sync-deal-activity]').forEach((btn) => {
    btn.addEventListener('click', () => syncActivityToCalendar(btn.dataset.syncDealActivity, renderActivityFeed));
  });
  feed.querySelectorAll('[data-toggle-activity]').forEach((btn) => {
    btn.addEventListener('click', () => toggleActivityDone(btn.dataset.toggleActivity, renderActivityFeed));
  });
}

async function toggleActivityDone(activityId, refreshFn) {
  const activity = findCachedActivity(activityId);
  if (!activity) return;
  const newDone = !activity.done;
  try {
    const updated = await Api.updateActivity(activityId, { done: newDone });
    Object.assign(activity, updated);
    if (refreshFn) refreshFn();
    renderKanban();
    state.reminders = await Api.reminders();
    if (document.getElementById('view-dashboard').classList.contains('active')) renderReminders();
  } catch (err) {
    showToast('Erro ao atualizar atividade');
  }
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
    const activity = await Api.addActivity(dealId, {
      type,
      text,
      date: new Date().toISOString(),
      done: type !== 'task',
      attendantId: state.attendantId
    });
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
    showToast(status === 'won' ? 'Negócio marcado como Ganho' : 'Negócio marcado como Perdido');
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
    const matchesCategory = !categoryFilter || contactCategoryIds(c).includes(categoryFilter);
    return matchesText && matchesCategory;
  });

  const tbody = document.getElementById('leads-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Nenhum lead encontrado.</div></td></tr>';
  } else {
    tbody.innerHTML = filtered
      .map((c) => {
        const cats = contactCategoryObjects(c);
        const catBadge =
          cats.map((cat) => `<span class="category-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>`).join(' ') || '-';
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
              <button class="icon-btn" data-edit-contact="${c.id}" title="Editar">${svgIcon('edit')}</button>
              <button class="icon-btn danger" data-del-contact="${c.id}" title="Excluir">${svgIcon('trash')}</button>
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
  document.getElementById('btn-call-lead').addEventListener('click', async () => {
    const leadId = state.currentLeadId;
    try {
      await Api.callLead(leadId, state.attendantId);
      showToast('Ligação originada pela Vivo PABX');
    } catch (err) {
      showToast(err.message || 'Erro ao originar ligação');
    }
  });

  document.querySelectorAll('#lead-tabs [data-ldtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#lead-tabs [data-ldtab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.ldtab;
      const isChatChannel = ['whatsapp', 'facebook', 'instagram', 'email'].includes(tab);
      document.getElementById('ld-tab-deals').style.display = tab === 'deals' ? '' : 'none';
      document.getElementById('ld-tab-atividades').style.display = tab === 'atividades' ? '' : 'none';
      document.getElementById('ld-tab-chat').style.display = isChatChannel ? '' : 'none';
      document.getElementById('ld-tab-historico').style.display = tab === 'historico' ? '' : 'none';
      if (isChatChannel) {
        state.leadChatChannel = tab;
        loadLeadChat();
      } else if (tab === 'historico') {
        loadLeadHistory();
      } else if (tab === 'atividades') {
        loadLeadActivities();
      }
    });
  });

  document.querySelectorAll('#ld-activity-subtabs [data-latype]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ld-activity-subtabs [data-latype]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.leadActivityFilter = btn.dataset.latype;
      renderLeadActivityFeed();
    });
  });
  document.getElementById('ld-btn-add-activity').addEventListener('click', addLeadActivity);
}

// ---- Atividades gerais do lead (não vinculadas a um negócio) ----
async function loadLeadActivities() {
  const leadId = state.currentLeadId;
  state.leadActivityFilter = 'all';
  document.querySelectorAll('#ld-activity-subtabs [data-latype]').forEach((b) => b.classList.toggle('active', b.dataset.latype === 'all'));
  if (!state.leadActivitiesCache) state.leadActivitiesCache = {};
  state.leadActivitiesCache[leadId] = await Api.leadActivities(leadId);
  renderLeadActivityFeed();
}

function renderLeadActivityFeed() {
  const leadId = state.currentLeadId;
  const feed = document.getElementById('ld-activity-feed');
  let activities = ((state.leadActivitiesCache && state.leadActivitiesCache[leadId]) || []).slice();
  if (state.leadActivityFilter !== 'all') activities = activities.filter((a) => a.type === state.leadActivityFilter);
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (activities.length === 0) {
    feed.innerHTML = '<div class="empty-state">Nenhuma atividade registrada ainda.</div>';
    return;
  }

  feed.innerHTML = activities
    .map((a) => {
      const canSync = a.type === 'meeting' || a.type === 'task';
      const syncBtn = canSync
        ? a.googleEventLink
          ? `<a href="${a.googleEventLink}" target="_blank" class="gcal-sync-btn">${svgIcon('calendar')} Ver no Calendar</a>`
          : `<button class="gcal-sync-btn" data-sync-activity="${a.id}">${svgIcon('calendar')} Sincronizar</button>`
        : '';
      return `
      <div class="activity-item">
        <button class="activity-check ${a.done ? 'done' : ''}" data-toggle-lead-activity="${a.id}" title="${a.done ? 'Marcar como pendente' : 'Marcar como feito'}">${a.done ? '✓' : ''}</button>
        <div class="activity-icon">${ACTIVITY_ICON[a.type] || svgIcon('note')}</div>
        <div class="activity-content">
          <div class="type">${ACTIVITY_LABEL[a.type] || a.type}${a.done ? ' · concluída' : ' · pendente'}</div>
          <div class="text">${escapeHtml(a.text)}</div>
          <div class="date">${a.attendantName ? escapeHtml(a.attendantName) + ' · ' : ''}${fmtDateTime(a.date)} ${syncBtn}</div>
        </div>
      </div>
    `;
    })
    .join('');

  feed.querySelectorAll('[data-sync-activity]').forEach((btn) => {
    btn.addEventListener('click', () => syncActivityToCalendar(btn.dataset.syncActivity, loadLeadActivities));
  });
  feed.querySelectorAll('[data-toggle-lead-activity]').forEach((btn) => {
    btn.addEventListener('click', () => toggleActivityDone(btn.dataset.toggleLeadActivity, renderLeadActivityFeed));
  });
}

async function addLeadActivity() {
  const leadId = state.currentLeadId;
  const type = document.getElementById('ld-new-activity-type').value;
  const textEl = document.getElementById('ld-new-activity-text');
  const text = textEl.value.trim();
  if (!text) {
    showToast('Escreva algo antes de adicionar');
    return;
  }
  try {
    const activity = await Api.addLeadActivity(leadId, {
      type,
      text,
      date: new Date().toISOString(),
      done: type !== 'task',
      attendantId: state.attendantId
    });
    if (!state.leadActivitiesCache) state.leadActivitiesCache = {};
    if (!state.leadActivitiesCache[leadId]) state.leadActivitiesCache[leadId] = [];
    state.leadActivitiesCache[leadId].push(activity);
    textEl.value = '';
    renderLeadActivityFeed();
    if (type === 'task') state.reminders = await Api.reminders();
    showToast('Atividade adicionada');
  } catch (err) {
    showToast('Erro ao adicionar atividade');
  }
}

function findCachedActivity(activityId) {
  for (const list of Object.values(state.activitiesCache)) {
    const found = list.find((a) => a.id === activityId);
    if (found) return found;
  }
  if (state.leadActivitiesCache) {
    for (const list of Object.values(state.leadActivitiesCache)) {
      const found = list.find((a) => a.id === activityId);
      if (found) return found;
    }
  }
  return null;
}

async function syncActivityToCalendar(activityId, refreshFn) {
  try {
    const result = await Api.syncCalendar(activityId);
    const cached = findCachedActivity(activityId);
    if (cached) cached.googleEventLink = result.eventLink;
    showToast('Evento criado no Google Calendar!');
    if (refreshFn) refreshFn();
  } catch (err) {
    showToast(err.message || 'Erro ao sincronizar com o Google Calendar');
  }
}

async function loadLeadHistory() {
  const container = document.getElementById('ld-history-list');
  container.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const history = await Api.leadHistory(state.currentLeadId);
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhuma alteração registrada ainda.</div>';
      return;
    }
    container.innerHTML = history
      .map(
        (h) => `
      <div class="history-item">
        <div class="hi-who">${escapeHtml(h.attendantName)}</div>
        <div>${escapeHtml(h.summary)}</div>
        <div class="hi-time">${fmtDateTime(h.timestamp)}</div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
  }
}

function renderExtraInfoList(containerId, items, onDelete) {
  const container = document.getElementById(containerId);
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:6px 0;">Nenhuma informação adicional.</div>';
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
    <div class="extra-info-row">
      <span class="ei-label">${escapeHtml(item.label)}</span>
      <span class="ei-value">${escapeHtml(item.value)} <button class="icon-btn danger" data-del-extra="${item.id}" title="Remover">${svgIcon('trash')}</button></span>
    </div>
  `
    )
    .join('');
  container.querySelectorAll('[data-del-extra]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.delExtra));
  });
}

function openLeadDetail(leadId) {
  const lead = state.contacts.find((c) => c.id === leadId);
  if (!lead) return;
  state.currentLeadId = leadId;

  document.querySelectorAll('#lead-tabs [data-ldtab]').forEach((b) => b.classList.toggle('active', b.dataset.ldtab === 'deals'));
  document.getElementById('ld-tab-deals').style.display = '';
  document.getElementById('ld-tab-atividades').style.display = 'none';
  document.getElementById('ld-tab-chat').style.display = 'none';
  document.getElementById('ld-tab-historico').style.display = 'none';

  document.getElementById('ld-name').textContent = lead.name;
  document.getElementById('ld-email').textContent = lead.email || '-';
  document.getElementById('ld-phone').textContent = lead.phone || '-';
  document.getElementById('ld-org').textContent = lead.orgId ? orgName(lead.orgId) : '-';

  const leadCats = contactCategoryObjects(lead);
  document.getElementById('ld-category').innerHTML =
    leadCats.map((cat) => `<span class="category-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>`).join(' ') || '-';

  const tagsHtml = (lead.tags || [])
    .map((tid) => tagById(tid))
    .filter(Boolean)
    .map((t) => `<span class="tag-pill" style="background:${t.color}">${escapeHtml(t.name)}</span>`)
    .join('');
  document.getElementById('ld-tags').innerHTML = tagsHtml || '-';

  const ch = lead.channels || {};
  const channelRows = [];
  if (ch.whatsapp) channelRows.push(`<div class="channel-row">${svgIcon('call')} WhatsApp: ${escapeHtml(ch.whatsapp)}</div>`);
  if (ch.facebookPsid) channelRows.push(`<div class="channel-row">${svgIcon('facebook')} Facebook ID: ${escapeHtml(ch.facebookPsid)}</div>`);
  if (ch.instagramId) channelRows.push(`<div class="channel-row">${svgIcon('instagram')} Instagram ID: ${escapeHtml(ch.instagramId)}</div>`);
  if (lead.email) channelRows.push(`<div class="channel-row">${svgIcon('email')} ${escapeHtml(lead.email)}</div>`);
  document.getElementById('ld-channels').innerHTML = channelRows.join('') || '-';

  const sourceLabel = lead.source ? SOURCE_LABEL[lead.source.channel] || lead.source.channel : '-';
  const campaign = lead.source && lead.source.campaign ? ` — ${escapeHtml(lead.source.campaign)}` : '';
  document.getElementById('ld-source').textContent = sourceLabel === '-' ? '-' : `${sourceLabel}${campaign}`;

  document.getElementById('ld-owner').textContent = lead.ownerId ? userName(lead.ownerId) : '-';
  renderExtraInfoList('ld-extra-info', lead.extraInfo, (itemId) => deleteExtraInfo('lead', leadId, itemId));

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

// ---- Conversas por canal (WhatsApp / Facebook / Instagram / E-mail) ----
function bindLeadChat() {
  document.getElementById('ld-chat-send').addEventListener('click', sendLeadChatMessage);
  document.getElementById('ld-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendLeadChatMessage();
    }
  });
  document.getElementById('ld-btn-new-email').addEventListener('click', () => openEmailCompose(state.currentLeadId));
}

function renderEmailList(messages, leadName) {
  if (messages.length === 0) {
    return `<div class="empty-state">Nenhum e-mail em ${leadName} ainda.</div>`;
  }
  return messages
    .slice()
    .reverse()
    .map((m) => {
      const isOut = m.direction === 'out';
      const sender = isOut ? m.attendantName || 'Atendente' : leadName;
      let statusBadge = '';
      let opensDetail = '';
      if (isOut) {
        if (m.deliveryStatus === 'simulated') statusBadge = '<span class="badge-simulated">Simulado</span>';
        else if (m.deliveryStatus === 'failed') statusBadge = '<span class="badge-simulated">Falhou</span>';
        else if ((m.openCount || 0) > 0) {
          statusBadge = `<span class="badge-opened">${svgIcon('eye')} Aberto ${m.openCount}x</span>`;
          const opens = Array.isArray(m.opens) ? m.opens : [];
          if (opens.length) {
            opensDetail = `<div class="eli-opens">${opens.map((o) => `Visto em ${fmtDateTime(o.timestamp)}`).join('<br>')}</div>`;
          }
        } else statusBadge = '<span class="badge-unopened">Não aberto</span>';
      }
      return `
      <div class="email-list-item">
        <div class="eli-top">
          <strong>${escapeHtml(m.subject || '(sem assunto)')}</strong>
          <span class="eli-date">${fmtDateTime(m.timestamp)}</span>
        </div>
        <div class="eli-snippet">${escapeHtml(m.text)}</div>
        <div class="eli-meta">
          <span class="eli-sender">De: ${escapeHtml(sender)}</span>
          ${statusBadge}
        </div>
        ${opensDetail}
      </div>
    `;
    })
    .join('');
}

function renderChatBubble(msg, leadName) {
  const isOut = msg.direction === 'out';
  const sender = isOut ? msg.attendantName || 'Atendente' : leadName;
  let noteHtml = '';
  if (isOut && msg.deliveryStatus === 'simulated') {
    noteHtml = `<div class="chat-delivery-note">${svgIcon('warning')} Simulado — ${escapeHtml(msg.deliveryNote || 'integração não configurada')}</div>`;
  } else if (isOut && msg.deliveryStatus === 'failed') {
    noteHtml = `<div class="chat-delivery-note">${svgIcon('errorX')} Falha no envio — ${escapeHtml(msg.deliveryNote || '')}</div>`;
  }
  return `
    <div class="chat-bubble-row ${isOut ? 'out' : 'in'}">
      <div class="chat-bubble">${escapeHtml(msg.text)}</div>
      <div class="chat-meta">${escapeHtml(sender)} · ${fmtDateTime(msg.timestamp)}</div>
      ${noteHtml}
    </div>
  `;
}

async function loadLeadChat() {
  const leadId = state.currentLeadId;
  const lead = state.contacts.find((c) => c.id === leadId);
  const channel = state.leadChatChannel;
  const thread = document.getElementById('ld-chat-thread');
  const isEmail = channel === 'email';
  document.getElementById('ld-btn-new-email').style.display = isEmail ? '' : 'none';
  document.getElementById('ld-chat-input-row').style.display = isEmail ? 'none' : '';
  thread.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const messages = await Api.leadMessages(leadId, channel);
    if (isEmail) {
      thread.innerHTML = renderEmailList(messages, lead.name);
    } else if (messages.length === 0) {
      thread.innerHTML = `<div class="empty-state">Nenhuma mensagem em ${CHANNEL_LABEL[channel]} ainda.</div>`;
    } else {
      thread.innerHTML = messages.map((m) => renderChatBubble(m, lead.name)).join('');
      thread.scrollTop = thread.scrollHeight;
    }
  } catch (err) {
    thread.innerHTML = '<div class="empty-state">Erro ao carregar conversa.</div>';
  }
}

async function sendLeadChatMessage() {
  const leadId = state.currentLeadId;
  const channel = state.leadChatChannel;
  const input = document.getElementById('ld-chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (!state.attendantId) {
    showToast('Selecione seu nome de atendente primeiro');
    openAttendantPicker();
    return;
  }
  try {
    const msg = await Api.sendLeadMessage(leadId, channel, text, state.attendantId);
    input.value = '';
    await loadLeadChat();
    showToast(msg.deliveryStatus === 'sent' ? 'Mensagem enviada!' : 'Mensagem registrada no CRM (integração não configurada)');
  } catch (err) {
    showToast(err.message || 'Erro ao enviar mensagem');
  }
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
    orgsBody.innerHTML = '<tr><td colspan="5"><div class="empty-state">Nenhuma empresa encontrada.</div></td></tr>';
  } else {
    orgsBody.innerHTML = filteredOrgs
      .map((o) => {
        const linkedCount = state.contacts.filter((c) => c.orgId === o.id).length;
        return `
        <tr class="clickable" data-org-id="${o.id}">
          <td>${escapeHtml(o.name)}</td>
          <td>${escapeHtml(o.cnpj || '-')}</td>
          <td>${escapeHtml(o.setor || '-')}</td>
          <td>${linkedCount} lead${linkedCount === 1 ? '' : 's'}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-edit-org="${o.id}" title="Editar">${svgIcon('edit')}</button>
              <button class="icon-btn danger" data-del-org="${o.id}" title="Excluir">${svgIcon('trash')}</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  document.querySelectorAll('#orgs-tbody tr[data-org-id]').forEach((row) => {
    row.addEventListener('click', () => openOrgDetail(row.dataset.orgId));
  });
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
  document.getElementById('btn-contact-create-org').addEventListener('click', openOrgModalForContact);
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

function populateUserSelect(selectId, selectedId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Sem proprietário</option>';
  state.users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

// Chip multi-select genérico, usado por categorias, etiquetas de lead e etiquetas de empresa.
function renderChipChecks(containerId, items, selectedIds, emptyMessage) {
  const container = document.getElementById(containerId);
  const selected = selectedIds || [];
  if (!items.length) {
    container.innerHTML = `<div class="empty-state" style="padding:4px 0;">${emptyMessage}</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
    <label class="tag-chip" style="--chip-color:${item.color}">
      <input type="checkbox" value="${item.id}" ${selected.includes(item.id) ? 'checked' : ''} />
      <span class="tag-chip-label">${escapeHtml(item.name)}</span>
    </label>
  `
    )
    .join('');
}

function checkedChipValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map((el) => el.value);
}

function populateCategoryChecks(selectedIds) {
  renderChipChecks(
    'contact-category-checks',
    state.settings.categories || [],
    contactCategoryIds({ categories: selectedIds }),
    'Nenhuma categoria cadastrada em Configurações.'
  );
}

// Compatível com leads antigos que ainda têm só `category` (string) em vez de `categories` (array).
function contactCategoryIds(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.categories)) return contact.categories;
  if (contact.category) return [contact.category];
  return [];
}

function contactCategoryObjects(contact) {
  return contactCategoryIds(contact)
    .map((id) => categoryById(id))
    .filter(Boolean);
}

function populateTagChecks(selectedIds) {
  const leadTags = state.tags.filter((t) => (t.type || 'lead') === 'lead');
  renderChipChecks('contact-tags-checks', leadTags, selectedIds, 'Nenhuma etiqueta de lead cadastrada. Crie em Configurações > Etiquetas.');
}

function populateOrgTagChecks(selectedIds) {
  const orgTags = state.tags.filter((t) => t.type === 'org');
  renderChipChecks('org-tags-checks', orgTags, selectedIds, 'Nenhuma etiqueta de empresa cadastrada. Crie em Configurações > Etiquetas.');
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
  populateCategoryChecks(contact ? contactCategoryIds(contact) : []);
  populateTagChecks(contact ? contact.tags : []);
  populateUserSelect('contact-owner', contact ? contact.ownerId : state.attendantId);
  openModal('modal-contact');
}

async function saveContact() {
  const id = document.getElementById('contact-id').value;
  const name = document.getElementById('contact-name').value.trim();
  if (!name) {
    showToast('Informe o nome do lead');
    return;
  }
  const checkedTags = checkedChipValues('contact-tags-checks');
  const checkedCategories = checkedChipValues('contact-category-checks');
  const existing = state.contacts.find((c) => c.id === id);
  const payload = {
    name,
    email: document.getElementById('contact-email').value.trim(),
    phone: document.getElementById('contact-phone').value.trim(),
    orgId: document.getElementById('contact-org').value || null,
    notes: document.getElementById('contact-notes').value.trim(),
    categories: checkedCategories,
    tags: checkedTags,
    ownerId: document.getElementById('contact-owner').value || null,
    attendantId: state.attendantId,
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

state.orgModalReturnToContact = false;

function openOrgModal(org) {
  state.orgModalReturnToContact = false;
  document.getElementById('org-modal-title').textContent = org ? 'Editar Empresa' : 'Adicionar Empresa';
  document.getElementById('org-id').value = org ? org.id : '';
  document.getElementById('org-name').value = org ? org.name : '';
  document.getElementById('org-cnpj').value = org ? org.cnpj || '' : '';
  document.getElementById('org-razaosocial').value = org ? org.razaoSocial || '' : '';
  document.getElementById('org-setor').value = org ? org.setor || '' : '';
  document.getElementById('org-phone').value = org ? org.phone || '' : '';
  document.getElementById('org-mobile').value = org ? org.mobile || '' : '';
  document.getElementById('org-address').value = org ? org.address : '';
  document.getElementById('org-notes').value = org ? org.notes || '' : '';
  populateUserSelect('org-owner', org ? org.ownerId : state.attendantId);
  populateOrgTagChecks(org ? org.tags : []);
  openModal('modal-org');
}

function openOrgModalForContact() {
  openOrgModal(null);
  state.orgModalReturnToContact = true;
}

async function saveOrg() {
  const id = document.getElementById('org-id').value;
  const name = document.getElementById('org-name').value.trim();
  if (!name) {
    showToast('Informe o nome da empresa');
    return;
  }
  const payload = {
    name,
    cnpj: document.getElementById('org-cnpj').value.trim(),
    razaoSocial: document.getElementById('org-razaosocial').value.trim(),
    setor: document.getElementById('org-setor').value.trim(),
    phone: document.getElementById('org-phone').value.trim(),
    mobile: document.getElementById('org-mobile').value.trim(),
    address: document.getElementById('org-address').value.trim(),
    notes: document.getElementById('org-notes').value.trim(),
    tags: checkedChipValues('org-tags-checks'),
    ownerId: document.getElementById('org-owner').value || null,
    attendantId: state.attendantId
  };
  try {
    let savedOrg;
    if (id) {
      savedOrg = await Api.updateOrg(id, payload);
      const idx = state.organizations.findIndex((o) => o.id === id);
      state.organizations[idx] = savedOrg;
      showToast('Empresa atualizada');
    } else {
      savedOrg = await Api.addOrg(payload);
      state.organizations.push(savedOrg);
      showToast('Empresa adicionada');
    }
    closeModal('modal-org');
    renderOrgs();
    if (document.getElementById('modal-org-detail').classList.contains('show') && state.currentOrgId) {
      openOrgDetail(state.currentOrgId);
    }
    if (state.orgModalReturnToContact && document.getElementById('modal-contact').classList.contains('show')) {
      populateOrgSelect('contact-org', savedOrg.id);
    }
    state.orgModalReturnToContact = false;
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
      if (tab.dataset.stab === 'ai') loadAiSettingsForm();
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
    const ramalInput = document.getElementById('new-user-ramal');
    const name = input.value.trim();
    if (!name) return;
    try {
      const user = await Api.addUser(name, ramalInput.value.trim());
      state.users.push(user);
      input.value = '';
      ramalInput.value = '';
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
    const typeInput = document.getElementById('new-tag-type');
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const tag = await Api.addTag(name, colorInput.value, typeInput.value);
      state.tags.push(tag);
      nameInput.value = '';
      renderSettings();
      showToast('Etiqueta adicionada');
    } catch (err) {
      showToast('Erro ao adicionar etiqueta');
    }
  });

  document.getElementById('btn-save-integrations').addEventListener('click', saveIntegrations);

  document.getElementById('ai-provider').addEventListener('change', updateAiProviderFieldVisibility);
  document.getElementById('btn-save-ai').addEventListener('click', saveAiSettings);
}

function updateAiProviderFieldVisibility() {
  const provider = document.getElementById('ai-provider').value;
  document.getElementById('ai-baseurl-group').style.display = provider === 'ollama' ? '' : 'none';
  document.getElementById('ai-apikey-group').style.display = provider === 'groq' || provider === 'gemini' || provider === 'anthropic' ? '' : 'none';
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
        <button class="icon-btn danger" data-del-stage="${s.id}" title="Excluir">${svgIcon('trash')}</button>
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
    <div class="list-row" style="flex-wrap:wrap; gap:8px;">
      <span class="name">${escapeHtml(u.name)}${u.ramal ? ` <span style="color:#8a94a6; font-weight:400;">· ramal ${escapeHtml(u.ramal)}</span>` : ''}</span>
      <div class="row-actions">
        <input type="text" class="filter-input" style="max-width:110px; padding:5px 8px;" placeholder="ramal" value="${escapeHtml(u.ramal || '')}" data-ramal-for="${u.id}" />
        <input type="email" class="filter-input" style="max-width:190px; padding:5px 8px;" placeholder="e-mail (Google Calendar)" value="${escapeHtml(u.email || '')}" data-email-for="${u.id}" />
        ${
          u.googleEmail
            ? `<span style="font-size:12px; color:var(--vg-text-muted);">${svgIcon('calendar')} ${escapeHtml(u.googleEmail)}</span>
               <button class="icon-btn danger" data-gcal-disconnect="${u.id}" title="Desconectar Google Calendar">${svgIcon('trash')}</button>`
            : `<button class="btn-secondary" data-gcal-connect="${u.id}" type="button" style="padding:5px 10px; font-size:12px;">${svgIcon('calendar')} Conectar Google Calendar</button>`
        }
        <button class="icon-btn" data-edit-signature="${u.id}" title="Assinatura de e-mail">${svgIcon('edit')}</button>
        <button class="icon-btn danger" data-del-user="${u.id}" title="Excluir">${svgIcon('trash')}</button>
      </div>
    </div>
  `
    )
    .join('');
  usersList.querySelectorAll('[data-edit-signature]').forEach((btn) => {
    btn.addEventListener('click', () => openUserSignatureModal(btn.dataset.editSignature));
  });
  usersList.querySelectorAll('[data-email-for]').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        const updated = await Api.updateUser(input.dataset.emailFor, { email: input.value.trim() });
        const u = state.users.find((u) => u.id === input.dataset.emailFor);
        if (u) u.email = updated.email;
        showToast('E-mail atualizado');
      } catch (err) {
        showToast('Erro ao atualizar e-mail');
      }
    });
  });
  usersList.querySelectorAll('[data-ramal-for]').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        const updated = await Api.updateUser(input.dataset.ramalFor, { ramal: input.value.trim() });
        const u = state.users.find((u) => u.id === input.dataset.ramalFor);
        if (u) u.ramal = updated.ramal;
        renderSettings();
        showToast('Ramal atualizado');
      } catch (err) {
        showToast('Erro ao atualizar ramal');
      }
    });
  });
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
  usersList.querySelectorAll('[data-gcal-connect]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.gcalConnect;
      window.open(`/api/google/oauth-start?userId=${encodeURIComponent(userId)}`, 'gcal-connect', 'width=520,height=650');
    });
  });
  usersList.querySelectorAll('[data-gcal-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Desconectar esta conta do Google Calendar?')) return;
      try {
        await Api.googleDisconnect(btn.dataset.gcalDisconnect);
        const u = state.users.find((u) => u.id === btn.dataset.gcalDisconnect);
        if (u) { delete u.googleEmail; delete u.googleRefreshToken; }
        renderSettings();
        showToast('Google Calendar desconectado');
      } catch (err) {
        showToast(err.message || 'Erro ao desconectar');
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
        <button class="icon-btn danger" data-del-field="${f.id}" title="Excluir">${svgIcon('trash')}</button>
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

  renderTagsSettingsList('tags-list-lead', state.tags.filter((t) => (t.type || 'lead') === 'lead'), 'Nenhuma etiqueta de lead cadastrada.');
  renderTagsSettingsList('tags-list-org', state.tags.filter((t) => t.type === 'org'), 'Nenhuma etiqueta de empresa cadastrada.');
}

function renderTagsSettingsList(containerId, tags, emptyMessage) {
  const container = document.getElementById(containerId);
  container.innerHTML = tags.length
    ? tags
        .map(
          (t) => `
    <span class="tag-pill" style="background:${t.color}; display:inline-flex; align-items:center; gap:6px; padding:6px 8px 6px 12px;">
      ${escapeHtml(t.name)}
      <button class="tag-pill-delete" data-del-tag="${t.id}" title="Excluir" style="background:none; border:none; color:#fff; opacity:0.75; cursor:pointer; font-size:14px; line-height:1; padding:0 2px;">&times;</button>
    </span>
  `
        )
        .join('')
    : `<div class="empty-state" style="padding:4px 0;">${emptyMessage}</div>`;
  container.querySelectorAll('[data-del-tag]').forEach((btn) => {
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

  const pabx = i.vivoPabx || {};
  document.getElementById('int-pabx-url').value = pabx.apiUrl || '';
  document.getElementById('int-pabx-token').value = pabx.apiToken || '';

  const gcal = i.googleCalendar || {};
  document.getElementById('int-gcal-clientid').value = gcal.clientId || '';
  document.getElementById('int-gcal-secret').value = gcal.clientSecret || '';
  document.getElementById('int-gcal-calendarid').value = gcal.calendarId || '';
  document.getElementById('gcal-redirect-uri').value = window.location.origin + '/api/google/oauth-callback';

  document.getElementById('wa-webhook-url').textContent = window.location.origin + '/api/webhooks/whatsapp';

  const gmailInbox = i.gmailInbox || {};
  const gmailStatus = document.getElementById('int-gmail-inbox-status');
  if (gmailInbox.email) {
    gmailStatus.innerHTML = `${svgIcon('calendar')} Conectado: <strong>${escapeHtml(gmailInbox.email)}</strong> <button class="btn-secondary" id="btn-gmail-inbox-disconnect" type="button" style="margin-left:8px; padding:5px 10px; font-size:12px;">Desconectar</button>`;
    document.getElementById('btn-gmail-inbox-disconnect').addEventListener('click', async () => {
      if (!confirm('Desconectar a caixa de entrada do Gmail?')) return;
      await Api.gmailInboxDisconnect();
      loadIntegrationsForm();
      showToast('Caixa de entrada do Gmail desconectada');
    });
  } else {
    gmailStatus.innerHTML = `<button class="btn-secondary" id="btn-gmail-inbox-connect" type="button">${svgIcon('calendar')} Conectar caixa de entrada do Gmail</button>`;
    document.getElementById('btn-gmail-inbox-connect').addEventListener('click', () => {
      window.open('/api/google/gmail-oauth-start', 'gmail-connect', 'width=520,height=650');
    });
  }
}

async function saveIntegrations() {
  const integrations = {
    ...state.settings.integrations,
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
    },
    vivoPabx: {
      apiUrl: document.getElementById('int-pabx-url').value.trim(),
      apiToken: document.getElementById('int-pabx-token').value.trim()
    },
    googleCalendar: {
      clientId: document.getElementById('int-gcal-clientid').value.trim(),
      clientSecret: document.getElementById('int-gcal-secret').value.trim(),
      calendarId: document.getElementById('int-gcal-calendarid').value.trim()
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

// ---- Assistente de IA (configurações) ----
function loadAiSettingsForm() {
  const ai = (state.settings.integrations && state.settings.integrations.ai) || {};
  document.getElementById('ai-provider').value = ai.provider || 'auto';
  document.getElementById('ai-baseurl').value = ai.baseUrl || 'http://localhost:11434';
  document.getElementById('ai-model').value = ai.model || 'llama3.1';
  document.getElementById('ai-apikey').value = ai.apiKey || '';
  updateAiProviderFieldVisibility();
}

async function saveAiSettings() {
  const integrations = {
    ...state.settings.integrations,
    ai: {
      provider: document.getElementById('ai-provider').value,
      baseUrl: document.getElementById('ai-baseurl').value.trim(),
      model: document.getElementById('ai-model').value.trim(),
      apiKey: document.getElementById('ai-apikey').value.trim()
    }
  };
  try {
    const updated = await Api.updateSettings({ integrations });
    state.settings = updated;
    showToast('Assistente de IA salvo');
  } catch (err) {
    showToast('Erro ao salvar assistente de IA');
  }
}

// ============ Assistente de IA (widget flutuante) ============
// ---- Mascote Velo-Cito ----
const MASCOT_POSES = {
  neutro: '/img/mascot/01_neutro.png',
  aceno: '/img/mascot/02_aceno.png',
  apontando: '/img/mascot/03_apontando.png',
  comemorando: '/img/mascot/04_comemorando.png',
  pensando: '/img/mascot/05_pensando.png',
  positivo: '/img/mascot/06_positivo.png',
  duvida: '/img/mascot/07_duvida.png',
  triste: '/img/mascot/08_triste.png',
  escrevendo: '/img/mascot/09_escrevendo.png',
  pesquisando: '/img/mascot/10_pesquisando.png',
  apontando_nuvem: '/img/mascot/11_apontando_nuvem.png',
  pulando: '/img/mascot/12_pulando.png'
};

function setMascotPose(pose, revertMs) {
  const img = document.getElementById('mascot-fab-img');
  if (!img || !MASCOT_POSES[pose]) return;
  img.src = MASCOT_POSES[pose];
  clearTimeout(setMascotPose._t);
  if (revertMs) {
    setMascotPose._t = setTimeout(() => {
      img.src = MASCOT_POSES.neutro;
    }, revertMs);
  }
}

function showMascotBubble(text, durationMs) {
  const bubble = document.getElementById('mascot-bubble');
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(showMascotBubble._t);
  showMascotBubble._t = setTimeout(() => {
    bubble.classList.remove('show');
  }, durationMs || 5000);
}

const MASCOT_INTRO =
  'Oi! Eu sou o Velo-Cito 👋 Te ajudo com dicas de venda, posso agendar reuniões no Google Calendar, ligar pro cliente pela Vivo PABX e analisar seus negócios em aberto. É só me chamar!';

function bindAiAssistant() {
  document.getElementById('ai-fab').addEventListener('click', () => {
    const panel = document.getElementById('ai-panel');
    const opening = !panel.classList.contains('show');
    panel.classList.toggle('show');
    if (opening) {
      setMascotPose('aceno', 2500);
      showMascotBubble(MASCOT_INTRO, 6000);
      loadAiTips();
    } else {
      document.getElementById('mascot-bubble').classList.remove('show');
    }
  });
  document.getElementById('ai-panel-close').addEventListener('click', () => {
    document.getElementById('ai-panel').classList.remove('show');
  });

  document.querySelectorAll('#ai-panel .tab-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ai-panel .tab-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const tab = pill.dataset.aitab;
      document.getElementById('ai-tab-tips').style.display = tab === 'tips' ? '' : 'none';
      document.getElementById('ai-tab-chat').style.display = tab === 'chat' ? '' : 'none';
      if (tab === 'chat') populateAiDealSelect();
    });
  });

  document.getElementById('ai-chat-deal-select').addEventListener('change', (e) => {
    state.aiChatDealId = e.target.value || null;
    state.aiChatHistory = [];
    document.getElementById('ai-chat-thread').innerHTML = '';
  });

  document.getElementById('btn-ai-smart-tips').addEventListener('click', loadAiSmartTips);

  document.getElementById('ai-chat-send').addEventListener('click', sendAiChatMessage);
  document.getElementById('ai-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiChatMessage();
    }
  });
  const aiChatInput = document.getElementById('ai-chat-input');
  aiChatInput.addEventListener('input', () => {
    setMascotPose(aiChatInput.value.trim() ? 'escrevendo' : 'neutro');
  });
  aiChatInput.addEventListener('blur', () => setMascotPose('neutro'));
}

async function loadAiTips() {
  const container = document.getElementById('ai-tips-list');
  container.innerHTML = '<div class="empty-state">Analisando seu funil...</div>';
  try {
    const tips = await Api.aiTips();
    container.innerHTML = tips
      .map(
        (t) => `
      <div class="ai-tip-item ${t.dealId ? 'clickable' : ''}" ${t.dealId ? `data-tip-deal="${t.dealId}"` : ''}>
        <span class="ai-tip-icon">${t.icon}</span>
        <span>${escapeHtml(t.text)}</span>
      </div>
    `
      )
      .join('');
    container.querySelectorAll('[data-tip-deal]').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById('ai-panel').classList.remove('show');
        switchView('pipeline');
        openDealDetail(el.dataset.tipDeal);
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar dicas.</div>';
  }
}

async function loadAiSmartTips() {
  const container = document.getElementById('ai-smart-tips-result');
  const btn = document.getElementById('btn-ai-smart-tips');
  btn.disabled = true;
  btn.textContent = 'Analisando com IA...';
  container.innerHTML = '<div class="empty-state">Lendo os negócios em aberto e as anotações de cada um...</div>';
  setMascotPose('pesquisando');
  try {
    const { reply } = await Api.aiSmartTips();
    const html = escapeHtml(reply)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    container.innerHTML = `<div class="ai-smart-tips-text">${html}</div>`;
    setMascotPose('positivo', 2500);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${svgIcon('warning')} ${escapeHtml(err.message || 'Erro ao analisar os negócios')}</div>`;
    setMascotPose('duvida', 2500);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analisar meus negócios com IA';
  }
}

function populateAiDealSelect() {
  const select = document.getElementById('ai-chat-deal-select');
  const current = select.value;
  select.innerHTML =
    '<option value="">Conversa geral (sem negócio específico)</option>' +
    state.deals.map((d) => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join('');
  select.value = current || '';
}

function renderAiBubble(role, text) {
  const isUser = role === 'user';
  const actionMatch = text.match(/\[ACAO:([A-Z_]+)(?::(.+))?\]/);
  const cleanText = text.replace(/\[ACAO:[A-Z_]+(?::.+)?\]/, '').trim();
  let actionHtml = '';
  if (!isUser && actionMatch) {
    actionHtml = buildAiActionSuggestion(actionMatch[1], actionMatch[2]);
  }
  return `
    <div class="chat-bubble-row ${isUser ? 'out' : 'in'}">
      <div class="chat-bubble">${escapeHtml(cleanText)}</div>
      <div class="chat-meta">${isUser ? 'Você' : 'Assistente IA'}</div>
      ${actionHtml}
    </div>
  `;
}

function buildAiActionSuggestion(type, value) {
  const dealId = state.aiChatDealId;
  if (!dealId) return '';
  let label = '';
  if (type === 'MOVER_ETAPA') label = `Mover para "${stageName(value)}"`;
  else if (type === 'MARCAR_GANHO') label = 'Marcar como Ganho';
  else if (type === 'MARCAR_PERDIDO') label = 'Marcar como Perdido';
  else if (type === 'ADICIONAR_TAREFA') label = `Criar tarefa: "${value}"`;
  else if (type === 'AGENDAR_REUNIAO') {
    const [isoDate, titulo] = (value || '').split('|');
    label = `Agendar reunião "${titulo || 'Reunião'}" em ${fmtDateTime(isoDate)} (cria no Google Calendar)`;
  } else if (type === 'LIGAR') label = 'Ligar para o contato (Vivo PABX)';
  else return '';

  return `
    <div class="ai-suggested-action">
      ${svgIcon('sparkle')} Sugestão: ${escapeHtml(label)}<br/>
      <button class="btn-secondary" data-ai-action="${type}" data-ai-value="${escapeHtml(value || '')}">Aplicar sugestão</button>
    </div>
  `;
}

async function applyAiAction(type, value) {
  const dealId = state.aiChatDealId;
  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal) return;
  try {
    if (type === 'MOVER_ETAPA') {
      const updated = await Api.updateDeal(dealId, { stage: value });
      Object.assign(deal, updated);
    } else if (type === 'MARCAR_GANHO') {
      const updated = await Api.updateDeal(dealId, { status: 'won' });
      Object.assign(deal, updated);
    } else if (type === 'MARCAR_PERDIDO') {
      const updated = await Api.updateDeal(dealId, { status: 'lost' });
      Object.assign(deal, updated);
    } else if (type === 'ADICIONAR_TAREFA') {
      const activity = await Api.addActivity(dealId, { type: 'task', text: value, date: new Date().toISOString(), done: false });
      if (!state.activitiesCache[dealId]) state.activitiesCache[dealId] = [];
      state.activitiesCache[dealId].push(activity);
      state.reminders = await Api.reminders();
    } else if (type === 'AGENDAR_REUNIAO') {
      const [isoDate, titulo] = (value || '').split('|');
      const activity = await Api.addActivity(dealId, {
        type: 'meeting',
        text: titulo || 'Reunião',
        date: isoDate || new Date().toISOString(),
        attendantId: state.attendantId,
        done: false
      });
      if (!state.activitiesCache[dealId]) state.activitiesCache[dealId] = [];
      state.activitiesCache[dealId].push(activity);
      state.reminders = await Api.reminders();
      await syncActivityToCalendar(activity.id);
    } else if (type === 'LIGAR') {
      const lead = state.contacts.find((c) => c.id === deal.personId);
      if (!lead) throw new Error('Este negócio não tem um contato vinculado.');
      await Api.callLead(lead.id, state.attendantId);
    }
    renderKanban();
    renderDashboard();
    showToast('Sugestão aplicada!');
    setMascotPose('comemorando', 3000);
  } catch (err) {
    showToast(err.message || 'Erro ao aplicar sugestão');
    setMascotPose('triste', 2500);
  }
}

async function sendAiChatMessage() {
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text) return;
  const thread = document.getElementById('ai-chat-thread');
  thread.insertAdjacentHTML('beforeend', renderAiBubble('user', text));
  input.value = '';
  thread.scrollTop = thread.scrollHeight;

  const typingId = 'ai-typing-' + Date.now();
  thread.insertAdjacentHTML(
    'beforeend',
    `<div class="chat-bubble-row in" id="${typingId}"><div class="chat-bubble">Pensando...</div></div>`
  );
  thread.scrollTop = thread.scrollHeight;
  setMascotPose('pensando');

  try {
    const res = await Api.aiChat(state.aiChatDealId, text, state.aiChatHistory);
    document.getElementById(typingId).remove();
    state.aiChatHistory.push({ role: 'user', content: text });
    state.aiChatHistory.push({ role: 'assistant', content: res.reply });
    thread.insertAdjacentHTML('beforeend', renderAiBubble('assistant', res.reply));
    thread.querySelectorAll('[data-ai-action]').forEach((btn) => {
      btn.addEventListener('click', () => applyAiAction(btn.dataset.aiAction, btn.dataset.aiValue));
    });
    thread.scrollTop = thread.scrollHeight;
    setMascotPose('positivo', 2500);
  } catch (err) {
    document.getElementById(typingId).remove();
    thread.insertAdjacentHTML(
      'beforeend',
      `<div class="chat-bubble-row in"><div class="chat-bubble">${svgIcon('warning')} ${escapeHtml(err.message || 'Erro ao consultar a IA')}</div></div>`
    );
    setMascotPose('duvida', 2500);
  }
}

// ============ Informações adicionais (Lead / Empresa / Negócio) ============
state.extraInfoTarget = null; // { type: 'lead'|'org'|'deal', id }

function bindExtraInfo() {
  document.getElementById('btn-add-extra-info').addEventListener('click', () => {
    state.extraInfoTarget = { type: 'lead', id: state.currentLeadId };
    openExtraInfoModal();
  });
  document.getElementById('btn-add-org-extra-info').addEventListener('click', () => {
    state.extraInfoTarget = { type: 'org', id: state.currentOrgId };
    openExtraInfoModal();
  });
  document.getElementById('btn-add-deal-extra-info').addEventListener('click', () => {
    state.extraInfoTarget = { type: 'deal', id: state.currentDealId };
    openExtraInfoModal();
  });
  document.getElementById('btn-save-extra-info').addEventListener('click', saveExtraInfo);
}

function openExtraInfoModal() {
  document.getElementById('extra-info-label').value = '';
  document.getElementById('extra-info-value').value = '';
  openModal('modal-extra-info');
}

function getEntityExtraInfo(type, id) {
  if (type === 'lead') return state.contacts.find((c) => c.id === id);
  if (type === 'org') return state.organizations.find((o) => o.id === id);
  if (type === 'deal') return state.deals.find((d) => d.id === id);
  return null;
}

async function saveExtraInfo() {
  const label = document.getElementById('extra-info-label').value.trim();
  const value = document.getElementById('extra-info-value').value.trim();
  if (!label || !value) {
    showToast('Preencha título e valor');
    return;
  }
  const { type, id } = state.extraInfoTarget;
  const entity = getEntityExtraInfo(type, id);
  if (!entity) return;
  const newItem = { id: 'ei-' + Date.now(), label, value };
  const extraInfo = [...(entity.extraInfo || []), newItem];

  try {
    if (type === 'lead') {
      const updated = await Api.updateContact(id, { extraInfo, attendantId: state.attendantId });
      Object.assign(entity, updated);
      renderExtraInfoList('ld-extra-info', entity.extraInfo, (itemId) => deleteExtraInfo('lead', id, itemId));
    } else if (type === 'org') {
      const updated = await Api.updateOrg(id, { extraInfo, attendantId: state.attendantId });
      Object.assign(entity, updated);
      renderExtraInfoList('od-extra-info', entity.extraInfo, (itemId) => deleteExtraInfo('org', id, itemId));
    } else if (type === 'deal') {
      const updated = await Api.updateDeal(id, { extraInfo });
      Object.assign(entity, updated);
      renderExtraInfoList('dd-extra-info', entity.extraInfo, (itemId) => deleteExtraInfo('deal', id, itemId));
    }
    closeModal('modal-extra-info');
    showToast('Informação adicionada');
  } catch (err) {
    showToast('Erro ao adicionar informação');
  }
}

async function deleteExtraInfo(type, id, itemId) {
  const entity = getEntityExtraInfo(type, id);
  if (!entity) return;
  const extraInfo = (entity.extraInfo || []).filter((i) => i.id !== itemId);
  try {
    if (type === 'lead') {
      const updated = await Api.updateContact(id, { extraInfo, attendantId: state.attendantId });
      Object.assign(entity, updated);
      renderExtraInfoList('ld-extra-info', entity.extraInfo, (iid) => deleteExtraInfo('lead', id, iid));
    } else if (type === 'org') {
      const updated = await Api.updateOrg(id, { extraInfo, attendantId: state.attendantId });
      Object.assign(entity, updated);
      renderExtraInfoList('od-extra-info', entity.extraInfo, (iid) => deleteExtraInfo('org', id, iid));
    } else if (type === 'deal') {
      const updated = await Api.updateDeal(id, { extraInfo });
      Object.assign(entity, updated);
      renderExtraInfoList('dd-extra-info', entity.extraInfo, (iid) => deleteExtraInfo('deal', id, iid));
    }
    showToast('Informação removida');
  } catch (err) {
    showToast('Erro ao remover informação');
  }
}

// ============ Organization Detail modal ============
function bindOrgDetailModal() {
  document.getElementById('btn-edit-org-from-detail').addEventListener('click', () => {
    const org = state.organizations.find((o) => o.id === state.currentOrgId);
    closeModal('modal-org-detail');
    openOrgModal(org);
  });

  document.querySelectorAll('#org-tabs [data-odtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#org-tabs [data-odtab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.odtab;
      document.getElementById('od-tab-leads').style.display = tab === 'leads' ? '' : 'none';
      document.getElementById('od-tab-historico').style.display = tab === 'historico' ? '' : 'none';
      if (tab === 'historico') loadOrgHistory();
    });
  });
}

async function loadOrgHistory() {
  const container = document.getElementById('od-history-list');
  container.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const history = await Api.orgHistory(state.currentOrgId);
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhuma alteração registrada ainda.</div>';
      return;
    }
    container.innerHTML = history
      .map(
        (h) => `
      <div class="history-item">
        <div class="hi-who">${escapeHtml(h.attendantName)}</div>
        <div>${escapeHtml(h.summary)}</div>
        <div class="hi-time">${fmtDateTime(h.timestamp)}</div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
  }
}

function openOrgDetail(orgId) {
  const org = state.organizations.find((o) => o.id === orgId);
  if (!org) return;
  state.currentOrgId = orgId;

  document.querySelectorAll('#org-tabs [data-odtab]').forEach((b) => b.classList.toggle('active', b.dataset.odtab === 'leads'));
  document.getElementById('od-tab-leads').style.display = '';
  document.getElementById('od-tab-historico').style.display = 'none';

  document.getElementById('od-name').textContent = org.name;
  document.getElementById('od-address').textContent = org.address || '-';
  document.getElementById('od-owner').textContent = org.ownerId ? userName(org.ownerId) : '-';
  renderExtraInfoList('od-extra-info', org.extraInfo, (itemId) => deleteExtraInfo('org', orgId, itemId));

  const linkedLeads = state.contacts.filter((c) => c.orgId === orgId);
  const container = document.getElementById('od-leads-list');
  container.innerHTML = linkedLeads.length
    ? linkedLeads
        .map(
          (lead) => `
      <div class="list-row" data-goto-lead="${lead.id}" style="cursor:pointer;">
        <span class="name">${escapeHtml(lead.name)}</span>
        <span style="color:#8a94a6; font-size:12px;">${escapeHtml(lead.email || '')}</span>
      </div>
    `
        )
        .join('')
    : '<div class="empty-state">Nenhum lead vinculado a esta empresa ainda.</div>';
  container.querySelectorAll('[data-goto-lead]').forEach((row) => {
    row.addEventListener('click', () => {
      closeModal('modal-org-detail');
      openLeadDetail(row.dataset.gotoLead);
    });
  });

  openModal('modal-org-detail');
}

// ============ Comunicações (hub central de conversas) ============
function bindComms() {
  document.getElementById('comms-filter').addEventListener('input', renderComms);
  document.querySelectorAll('#comms-channel-tabs [data-commschannel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#comms-channel-tabs [data-commschannel]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.commsChannel = btn.dataset.commschannel;
      loadCommsChat();
    });
  });
  document.getElementById('comms-chat-send').addEventListener('click', sendCommsMessage);
  document.getElementById('comms-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommsMessage();
    }
  });
}

async function renderComms() {
  const container = document.getElementById('comms-thread-list');
  container.innerHTML = '<div class="empty-state">Carregando conversas...</div>';
  try {
    const threads = await Api.allMessages();
    const filter = (document.getElementById('comms-filter').value || '').toLowerCase();
    const filtered = threads.filter((t) => t.channel !== 'email' && t.leadName.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhuma conversa ainda.</div>';
      return;
    }

    container.innerHTML = filtered
      .map(
        (t) => `
      <div class="comms-thread-item" data-thread-lead="${t.leadId}" data-thread-channel="${t.channel}">
        <div class="owner-avatar">${initials(t.leadName)}</div>
        <div style="min-width:0;">
          <div class="ct-name">${escapeHtml(t.leadName)} <span style="font-weight:400; color:#8a94a6;">· ${CHANNEL_LABEL[t.channel] || t.channel}</span></div>
          <div class="ct-preview">${escapeHtml(t.lastMessage.text)}</div>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('[data-thread-lead]').forEach((el) => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.comms-thread-item').forEach((i) => i.classList.remove('active'));
        el.classList.add('active');
        openCommsThread(el.dataset.threadLead, el.dataset.threadChannel);
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar conversas.</div>';
  }
}

function openCommsThread(leadId, channel) {
  const lead = state.contacts.find((c) => c.id === leadId);
  if (!lead) return;
  state.commsLeadId = leadId;
  state.commsChannel = channel;

  document.getElementById('comms-empty-state').style.display = 'none';
  document.getElementById('comms-chat-panel').style.display = 'flex';
  document.getElementById('comms-chat-panel').style.flexDirection = 'column';
  document.getElementById('comms-chat-panel').style.flex = '1';
  document.getElementById('comms-chat-panel').style.minHeight = '0';
  document.getElementById('comms-chat-lead-name').textContent = lead.name;
  document.querySelectorAll('#comms-channel-tabs [data-commschannel]').forEach((b) =>
    b.classList.toggle('active', b.dataset.commschannel === channel)
  );

  loadCommsChat();
}

async function loadCommsChat() {
  if (!state.commsLeadId) return;
  const lead = state.contacts.find((c) => c.id === state.commsLeadId);
  const thread = document.getElementById('comms-chat-thread');
  document.getElementById('comms-chat-input-row').style.display = '';
  thread.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const messages = await Api.leadMessages(state.commsLeadId, state.commsChannel);
    if (messages.length === 0) {
      thread.innerHTML = `<div class="empty-state">Nenhuma mensagem em ${CHANNEL_LABEL[state.commsChannel]} ainda.</div>`;
    } else {
      thread.innerHTML = messages.map((m) => renderChatBubble(m, lead.name)).join('');
      thread.scrollTop = thread.scrollHeight;
    }
  } catch (err) {
    thread.innerHTML = '<div class="empty-state">Erro ao carregar conversa.</div>';
  }
}

async function sendCommsMessage() {
  const input = document.getElementById('comms-chat-input');
  const text = input.value.trim();
  if (!text || !state.commsLeadId) return;
  if (!state.attendantId) {
    showToast('Selecione seu nome de atendente primeiro');
    openAttendantPicker();
    return;
  }
  try {
    await Api.sendLeadMessage(state.commsLeadId, state.commsChannel, text, state.attendantId);
    input.value = '';
    await loadCommsChat();
    renderComms();
  } catch (err) {
    showToast(err.message || 'Erro ao enviar mensagem');
  }
}

// ============ E-mail (caixa de entrada dedicada) ============
function bindEmailInbox() {
  document.getElementById('email-inbox-filter').addEventListener('input', renderEmailInbox);
  document.getElementById('btn-new-email-inbox').addEventListener('click', () => {
    const selected = document.getElementById('email-inbox-new-select').value || state.emailInboxLeadId;
    if (selected) openEmailCompose(selected);
    else showToast('Cadastre um lead com e-mail primeiro');
  });
  bindEmailTabs();
}

function populateEmailNewSelect() {
  const select = document.getElementById('email-inbox-new-select');
  const withEmail = state.contacts.filter((c) => c.email);
  select.innerHTML = withEmail.length
    ? withEmail.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.email)}</option>`).join('')
    : '<option value="">Nenhum lead com e-mail cadastrado</option>';
}

function bindEmailTabs() {
  document.querySelectorAll('#view-email .settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-email .settings-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const emailTab = tab.dataset.emailtab;
      document.getElementById('email-tab-leads').style.display = emailTab === 'leads' ? '' : 'none';
      document.getElementById('email-tab-my').style.display = emailTab === 'my' ? '' : 'none';
      document.getElementById('email-tab-gmail').style.display = emailTab === 'gmail' ? '' : 'none';
      if (emailTab === 'my') renderMyInbox();
      if (emailTab === 'gmail') renderGmailInbox();
    });
  });
}

// Caixas de e-mail baseadas no Gmail: a compartilhada (velocitaglobal@gmail.com) e a
// pessoal de quem está "Atendendo como X". Mesma UI, fontes de dados diferentes.
async function renderGenericGmailInbox(opts) {
  const status = document.getElementById(opts.statusId);
  const list = document.getElementById(opts.listId);
  status.innerHTML = '';
  list.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const { email, messages } = await opts.fetchMessages();
    status.innerHTML = opts.connectedStatusHtml(email);
    if (opts.bindDisconnect) opts.bindDisconnect();

    if (!messages.length) {
      list.innerHTML = '<div class="empty-state">Nenhuma mensagem na caixa de entrada.</div>';
      return;
    }
    list.innerHTML = messages
      .map(
        (m) => `
      <div class="list-row clickable" data-inbox-msg="${m.id}" style="align-items:flex-start; ${m.unread ? 'font-weight:700;' : ''}">
        <div>
          <div class="name">${escapeHtml(m.from)}</div>
          <div style="font-size:12px;">${escapeHtml(m.subject)}</div>
          <div style="font-size:11px; color:var(--vg-text-muted); font-weight:400;">${escapeHtml(m.snippet)}</div>
        </div>
      </div>
    `
      )
      .join('');
    list.querySelectorAll('[data-inbox-msg]').forEach((row) => {
      row.addEventListener('click', () => loadGenericGmailMessage(opts, row.dataset.inboxMsg));
    });
  } catch (err) {
    status.innerHTML = '';
    list.innerHTML = `
      <div class="empty-state" style="text-align:left;">
        ${escapeHtml(err.message || 'Caixa de entrada não conectada.')}
      </div>
      ${opts.connectButtonHtml || ''}
    `;
    if (opts.bindConnect) opts.bindConnect();
  }
}

async function loadGenericGmailMessage(opts, id) {
  const view = document.getElementById(opts.viewId);
  view.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const msg = await opts.fetchMessage(id);
    view.innerHTML = `
      <div style="padding:16px;">
        <h3 style="margin:0 0 6px;">${escapeHtml(msg.subject)}</h3>
        <div style="font-size:12px; color:var(--vg-text-muted); margin-bottom:14px;">
          De: ${escapeHtml(msg.from)}<br/>Para: ${escapeHtml(msg.to)}<br/>${escapeHtml(msg.date)}
        </div>
        <iframe sandbox="" style="width:100%; min-height:400px; border:1px solid var(--vg-border); border-radius:8px; background:#fff;" srcdoc="${escapeHtml(msg.body || '(sem conteúdo)')}"></iframe>
      </div>
    `;
  } catch (err) {
    view.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Erro ao carregar mensagem')}</div>`;
  }
}

function renderGmailInbox() {
  return renderGenericGmailInbox({
    statusId: 'gmail-inbox-status',
    listId: 'gmail-inbox-list',
    viewId: 'gmail-message-view',
    fetchMessages: () => Api.gmailInboxMessages(),
    fetchMessage: (id) => Api.gmailInboxMessage(id),
    connectedStatusHtml: (email) =>
      `${svgIcon('calendar')} Conectado: <strong>${escapeHtml(email)}</strong> <button class="icon-btn danger" id="btn-gmail-disconnect" title="Desconectar" style="margin-left:6px;">${svgIcon('trash')}</button>`,
    bindDisconnect: () => {
      document.getElementById('btn-gmail-disconnect').addEventListener('click', async () => {
        if (!confirm('Desconectar a caixa de entrada do Gmail?')) return;
        await Api.gmailInboxDisconnect();
        renderGmailInbox();
      });
    },
    connectButtonHtml: '<button class="btn-primary" id="btn-gmail-connect" style="width:100%; margin-top:10px;">Conectar Gmail</button>',
    bindConnect: () => {
      document.getElementById('btn-gmail-connect').addEventListener('click', () => {
        window.open('/api/google/gmail-oauth-start', 'gmail-connect', 'width=520,height=650');
      });
    }
  });
}

function renderMyInbox() {
  const attendant = state.users.find((u) => u.id === state.attendantId);
  document.getElementById('email-my-tab-name').textContent = attendant ? attendant.name : '-';
  return renderGenericGmailInbox({
    statusId: 'my-inbox-status',
    listId: 'my-inbox-list',
    viewId: 'my-message-view',
    fetchMessages: () => Api.myInboxMessages(state.attendantId),
    fetchMessage: (id) => Api.myInboxMessage(state.attendantId, id),
    connectedStatusHtml: (email) => `${svgIcon('calendar')} Conectado: <strong>${escapeHtml(email)}</strong>`,
    connectButtonHtml:
      '<p style="font-size:12px; color:var(--vg-text-muted);">Conecte sua conta Google em Configurações &gt; Usuários (o mesmo botão usado para o Google Calendar já dá acesso à sua caixa de entrada).</p>'
  });
}

async function renderEmailInbox() {
  populateEmailNewSelect();
  const container = document.getElementById('email-inbox-list');
  container.innerHTML = '<div class="empty-state">Carregando conversas...</div>';
  try {
    const threads = await Api.allMessages();
    const filter = (document.getElementById('email-inbox-filter').value || '').toLowerCase();
    const filtered = threads.filter((t) => t.channel === 'email' && t.leadName.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhum e-mail ainda.</div>';
      return;
    }

    container.innerHTML = filtered
      .map(
        (t) => `
      <div class="comms-thread-item ${state.emailInboxLeadId === t.leadId ? 'active' : ''}" data-email-thread-lead="${t.leadId}">
        <div class="owner-avatar">${initials(t.leadName)}</div>
        <div style="min-width:0;">
          <div class="ct-name">${escapeHtml(t.leadName)}</div>
          <div class="ct-preview">${escapeHtml(t.lastMessage.subject || t.lastMessage.text || '')}</div>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('[data-email-thread-lead]').forEach((el) => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.comms-thread-item').forEach((i) => i.classList.remove('active'));
        el.classList.add('active');
        openEmailThread(el.dataset.emailThreadLead);
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar conversas.</div>';
  }
}

function openEmailThread(leadId) {
  const lead = state.contacts.find((c) => c.id === leadId);
  if (!lead) return;
  state.emailInboxLeadId = leadId;

  document.getElementById('email-empty-state').style.display = 'none';
  document.getElementById('email-thread-panel').style.display = 'flex';
  document.getElementById('email-thread-panel').style.flexDirection = 'column';
  document.getElementById('email-thread-panel').style.flex = '1';
  document.getElementById('email-thread-panel').style.minHeight = '0';
  document.getElementById('email-thread-lead-name').textContent = lead.name;

  loadEmailThread();
}

async function loadEmailThread() {
  if (!state.emailInboxLeadId) return;
  const lead = state.contacts.find((c) => c.id === state.emailInboxLeadId);
  const thread = document.getElementById('email-thread-list');
  thread.innerHTML = '<div class="empty-state">Carregando...</div>';
  try {
    const messages = await Api.leadMessages(state.emailInboxLeadId, 'email');
    thread.innerHTML = renderEmailList(messages, lead.name);
  } catch (err) {
    thread.innerHTML = '<div class="empty-state">Erro ao carregar e-mails.</div>';
  }
}

// ============ Notificações e Mensagens ============
function bindNotifications() {
  document.getElementById('notif-bell-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    const opening = !dropdown.classList.contains('show');
    dropdown.classList.toggle('show');
    if (opening) loadNotifDropdown();
  });
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.notif-bell-wrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('notif-dropdown').classList.remove('show');
    }
  });
  document.getElementById('notif-mark-all').addEventListener('click', async () => {
    await Api.markAllNotifRead();
    state.notifications.forEach((n) => (n.read = true));
    loadNotifDropdown();
    updateNotifBadges();
  });
  document.getElementById('notif-see-all').addEventListener('click', () => {
    document.getElementById('notif-dropdown').classList.remove('show');
    switchView('mensagens');
  });
  document.getElementById('btn-mark-all-messages').addEventListener('click', async () => {
    await Api.markAllNotifRead();
    state.notifications.forEach((n) => (n.read = true));
    renderMensagens();
    updateNotifBadges();
  });

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function updateNotifBadges() {
  const unread = state.notifications.filter((n) => !n.read).length;
  const bellBadge = document.getElementById('notif-badge');
  const sidebarBadge = document.getElementById('sidebar-msg-badge');
  [bellBadge, sidebarBadge].forEach((el) => {
    if (unread > 0) {
      el.textContent = unread > 99 ? '99+' : unread;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

async function loadNotifDropdown() {
  const list = document.getElementById('notif-dropdown-list');
  if (state.notifications.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:20px;">Nenhuma notificação ainda.</div>';
    return;
  }
  list.innerHTML = state.notifications
    .slice(0, 15)
    .map(
      (n) => `
    <button class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-notif-lead="${n.leadId}" data-notif-channel="${n.channel}">
      <div class="ni-lead">${escapeHtml(n.leadName)} · ${CHANNEL_LABEL[n.channel] || n.channel}</div>
      <div class="ni-preview">${escapeHtml(n.preview)}</div>
      <div class="ni-time">${fmtDateTime(n.timestamp)}</div>
    </button>
  `
    )
    .join('');

  list.querySelectorAll('[data-notif-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Api.markNotifRead(btn.dataset.notifId);
      const n = state.notifications.find((n) => n.id === btn.dataset.notifId);
      if (n) n.read = true;
      updateNotifBadges();
      document.getElementById('notif-dropdown').classList.remove('show');
      switchView('comunicacoes');
      setTimeout(() => openCommsThread(btn.dataset.notifLead, btn.dataset.notifChannel), 50);
    });
  });
}

function renderMensagens() {
  const container = document.getElementById('mensagens-list');
  if (state.notifications.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhuma mensagem recebida ainda.</div>';
    return;
  }
  container.innerHTML = state.notifications
    .map(
      (n) => `
    <div class="message-row ${n.read ? '' : 'unread'}" data-msg-id="${n.id}" data-msg-lead="${n.leadId}" data-msg-channel="${n.channel}">
      <div>
        <div class="ni-lead">${escapeHtml(n.leadName)} · ${CHANNEL_LABEL[n.channel] || n.channel}</div>
        <div class="ni-preview">${escapeHtml(n.preview)}</div>
      </div>
      <div class="ni-time">${fmtDateTime(n.timestamp)}</div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('[data-msg-id]').forEach((row) => {
    row.addEventListener('click', async () => {
      await Api.markNotifRead(row.dataset.msgId);
      const n = state.notifications.find((n) => n.id === row.dataset.msgId);
      if (n) n.read = true;
      updateNotifBadges();
      renderMensagens();
      switchView('comunicacoes');
      setTimeout(() => openCommsThread(row.dataset.msgLead, row.dataset.msgChannel), 50);
    });
  });
}

async function pollNotifications() {
  try {
    const notifications = await Api.notifications();
    const isFirstLoad = state.shownNotificationIds.size === 0 && state.notifications.length === 0;
    state.notifications = notifications;
    updateNotifBadges();

    notifications
      .filter((n) => !n.read && !state.shownNotificationIds.has(n.id))
      .forEach((n) => {
        state.shownNotificationIds.add(n.id);
        if (!isFirstLoad) showBrowserNotification(n);
      });

    if (isFirstLoad) {
      notifications.forEach((n) => state.shownNotificationIds.add(n.id));
    }
  } catch (err) {
    // silencioso — próxima verificação tenta de novo
  }
}

function showBrowserNotification(n) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notif = new Notification(`Nova mensagem de ${n.leadName}`, {
    body: `${CHANNEL_LABEL[n.channel] || n.channel}: ${n.preview}`,
    icon: '/img/logo.webp'
  });
  notif.onclick = () => {
    window.focus();
    switchView('comunicacoes');
    openCommsThread(n.leadId, n.channel);
  };
}

// ============ Gmail-style e-mail compose ============
const EMOJI_SET = ['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '✅', '❌', '📌', '📎', '💡', '📅', '⏰', '💰', '📈', '🤝', '👋', '❤️', '⭐', '😉', '🙌', '📞', '✍️'];

function bindEmailCompose() {
  document.getElementById('gc-header').addEventListener('click', (e) => {
    if (e.target.closest('.gc-header-actions')) return;
    document.getElementById('email-compose').classList.toggle('minimized');
  });
  document.getElementById('gc-minimize').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('email-compose').classList.toggle('minimized');
  });
  document.getElementById('gc-expand').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('email-compose').classList.toggle('wide');
  });
  document.getElementById('gc-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeEmailCompose();
  });
  document.getElementById('gc-btn-discard').addEventListener('click', closeEmailCompose);
  document.getElementById('gc-btn-send').addEventListener('click', sendComposedEmail);

  document.getElementById('gc-btn-signature').addEventListener('click', toggleSignatureInBody);

  document.getElementById('gc-attach-input').addEventListener('change', (e) => handleFileSelection(e.target.files));
  document.getElementById('gc-image-input').addEventListener('change', (e) => handleFileSelection(e.target.files));

  document.getElementById('gc-btn-emoji').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('gc-emoji-picker').classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.gc-emoji-wrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('gc-emoji-picker').classList.remove('show');
  });
  const picker = document.getElementById('gc-emoji-picker');
  picker.innerHTML = EMOJI_SET.map((e) => `<span data-emoji="${e}">${e}</span>`).join('');
  picker.querySelectorAll('[data-emoji]').forEach((span) => {
    span.addEventListener('click', () => {
      const textarea = document.getElementById('gc-textarea');
      const pos = textarea.selectionStart || textarea.value.length;
      textarea.value = textarea.value.slice(0, pos) + span.dataset.emoji + textarea.value.slice(pos);
      textarea.focus();
    });
  });
}

function openEmailCompose(leadId) {
  const lead = state.contacts.find((c) => c.id === leadId);
  if (!lead) return;
  if (!state.attendantId) {
    showToast('Selecione seu nome de atendente primeiro');
    openAttendantPicker();
    return;
  }
  state.emailComposeLeadId = leadId;
  state.emailAttachments = [];
  state.emailSignatureInserted = false;

  document.getElementById('gc-to').value = lead.email || '(sem e-mail cadastrado)';
  document.getElementById('gc-subject').value = '';
  document.getElementById('gc-textarea').value = '';
  renderAttachmentChips();

  const panel = document.getElementById('email-compose');
  panel.classList.remove('minimized');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
}

function closeEmailCompose() {
  document.getElementById('email-compose').style.display = 'none';
  state.emailComposeLeadId = null;
  state.emailAttachments = [];
}

function toggleSignatureInBody() {
  const attendant = currentAttendant();
  if (!attendant || !attendant.signature) {
    showToast('Você ainda não tem uma assinatura cadastrada (Configurações > Usuários)');
    return;
  }
  const textarea = document.getElementById('gc-textarea');
  const plainSignature = attendant.signature.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  if (state.emailSignatureInserted) {
    textarea.value = textarea.value.replace(plainSignature, '').replace(/\n{3,}$/, '\n');
    state.emailSignatureInserted = false;
  } else {
    textarea.value = textarea.value.replace(/\n+$/, '') + '\n' + plainSignature;
    state.emailSignatureInserted = true;
  }
}

function handleFileSelection(files) {
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      state.emailAttachments.push({ filename: file.name, size: file.size, dataBase64: base64 });
      renderAttachmentChips();
    };
    reader.readAsDataURL(file);
  });
}

function renderAttachmentChips() {
  const container = document.getElementById('gc-attachments-list');
  container.innerHTML = state.emailAttachments
    .map(
      (a, idx) => `
    <span class="gc-attachment-chip">${svgIcon('attach')} ${escapeHtml(a.filename)} <button data-remove-attachment="${idx}">&times;</button></span>
  `
    )
    .join('');
  container.querySelectorAll('[data-remove-attachment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.emailAttachments.splice(Number(btn.dataset.removeAttachment), 1);
      renderAttachmentChips();
    });
  });
}

async function sendComposedEmail() {
  const leadId = state.emailComposeLeadId;
  const subject = document.getElementById('gc-subject').value.trim();
  const text = document.getElementById('gc-textarea').value.trim();
  if (!text) {
    showToast('Escreva uma mensagem antes de enviar');
    return;
  }
  try {
    const msg = await Api.sendEmail(leadId, {
      subject: subject || '(sem assunto)',
      text,
      attendantId: state.attendantId,
      attachments: state.emailAttachments.map((a) => ({ filename: a.filename, size: a.size, dataBase64: a.dataBase64 }))
    });
    closeEmailCompose();
    showToast(msg.deliveryStatus === 'sent' ? 'E-mail enviado!' : 'E-mail registrado no CRM (integração não configurada)');
    if (state.currentLeadId === leadId && state.leadChatChannel === 'email') loadLeadChat();
    if (state.emailInboxLeadId === leadId) loadEmailThread();
    const openDeal = state.deals.find((d) => d.id === state.currentDealId);
    if (openDeal && openDeal.personId === leadId && state.currentActivityFilter === 'email') renderActivityFeed();
    renderEmailInbox();
  } catch (err) {
    showToast(err.message || 'Erro ao enviar e-mail');
  }
}

// ============ Roteiro do Dia ============
const ROTEIRO_TYPE_ICON = { meeting: svgIcon('calendar'), task: svgIcon('check'), call: svgIcon('call') };
const ROTEIRO_TYPE_LABEL = { meeting: 'Reunião', task: 'Tarefa', call: 'Chamada' };

function bindRoteiro() {
  document.getElementById('roteiro-attendant-filter').addEventListener('change', renderRoteiro);
}

function fmtTimeOnly(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function renderRoteiro() {
  const filterSelect = document.getElementById('roteiro-attendant-filter');
  if (filterSelect.options.length <= 1) {
    state.users.forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name;
      filterSelect.appendChild(opt);
    });
  }
  const attendantId = filterSelect.value;

  const container = document.getElementById('roteiro-list');
  container.innerHTML = '<div class="empty-state">Carregando...</div>';

  let allActivities;
  try {
    allActivities = await Api.allActivities();
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar o roteiro.</div>';
    return;
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  let items = allActivities.filter((a) => {
    if (a.type !== 'meeting' && a.type !== 'task' && a.type !== 'call') return false;
    const d = new Date(a.date);
    return d >= startOfDay && d < endOfDay;
  });

  if (attendantId) {
    items = items.filter((a) => {
      if (a.attendantId) return a.attendantId === attendantId;
      if (a.dealId) {
        const deal = state.deals.find((d) => d.id === a.dealId);
        return deal && deal.ownerId === attendantId;
      }
      return false;
    });
  }

  items = items
    .map((a) => {
      let leadId = a.leadId || null;
      let leadName = null;
      let dealTitle = null;
      const dealId = a.dealId || null;
      if (a.dealId) {
        const deal = state.deals.find((d) => d.id === a.dealId);
        if (deal) {
          dealTitle = deal.title;
          leadId = deal.personId;
          const lead = state.contacts.find((c) => c.id === deal.personId);
          if (lead) leadName = lead.name;
        }
      } else if (a.leadId) {
        const lead = state.contacts.find((c) => c.id === a.leadId);
        if (lead) leadName = lead.name;
      }
      return { ...a, leadId, dealId, leadName, dealTitle };
    })
    .sort((x, y) => new Date(x.date) - new Date(y.date));

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum compromisso para hoje.</div>';
    return;
  }

  container.innerHTML = items
    .map((it) => {
      const who = it.leadName || it.dealTitle || 'Sem contato vinculado';
      const sub = it.dealTitle && it.dealTitle !== who ? it.dealTitle : '';
      return `
      <div class="roteiro-item ${it.done ? 'done' : ''}" data-roteiro-lead="${it.leadId || ''}" data-roteiro-deal="${it.dealId || ''}">
        <div class="ri-time">${fmtTimeOnly(it.date)}</div>
        <div class="ri-icon">${ROTEIRO_TYPE_ICON[it.type] || svgIcon('note')}</div>
        <div>
          <div class="ri-title">${escapeHtml(who)}</div>
          ${sub ? `<div class="ri-sub">${escapeHtml(sub)}</div>` : ''}
          <div class="ri-sub">${escapeHtml(it.text)}</div>
          <div class="ri-meta">${ROTEIRO_TYPE_LABEL[it.type] || it.type}${it.attendantName ? ' · ' + escapeHtml(it.attendantName) : ''}</div>
        </div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('[data-roteiro-lead], [data-roteiro-deal]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.roteiroDeal) {
        switchView('pipeline');
        openDealDetail(el.dataset.roteiroDeal);
      } else if (el.dataset.roteiroLead) {
        switchView('leads');
        openLeadDetail(el.dataset.roteiroLead);
      }
    });
  });
}

// ============ Chat da Equipe (interno, somente entre admins/atendentes) ============
function bindTeamChat() {
  document.getElementById('team-chat-send').addEventListener('click', sendTeamChatMessage);
  document.getElementById('team-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTeamChatMessage();
    }
  });

  const fileInput = document.getElementById('tc-file-input');
  document.getElementById('tc-btn-attach').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleTeamChatFile(fileInput.files[0]);
    fileInput.value = '';
  });

  bindTeamChatRecordButton();
}

// Botão de áudio com dois jeitos de usar: segurar (grava enquanto pressionado,
// solta e para) ou clicar rapidinho uma vez (começa a gravar, clique de novo para
// parar). Em ambos os casos cai no preview com opção de excluir ou enviar.
function bindTeamChatRecordButton() {
  const btn = document.getElementById('tc-btn-record');
  let pressTimer = null;
  let isHoldGesture = false;

  const isRecording = () => state.teamChatRecorder && state.teamChatRecorder.state === 'recording';

  const onPressStart = (e) => {
    e.preventDefault();
    isHoldGesture = false;
    pressTimer = setTimeout(() => {
      isHoldGesture = true;
      if (!isRecording()) startTeamChatRecording();
    }, 300);
  };

  const onPressEnd = () => {
    clearTimeout(pressTimer);
    if (isHoldGesture) {
      if (isRecording()) stopTeamChatRecording();
      isHoldGesture = false;
    } else if (isRecording()) {
      stopTeamChatRecording();
    } else {
      startTeamChatRecording();
    }
  };

  btn.addEventListener('mousedown', onPressStart);
  btn.addEventListener('mouseup', onPressEnd);
  btn.addEventListener('mouseleave', () => {
    if (isRecording() && isHoldGesture) stopTeamChatRecording();
    clearTimeout(pressTimer);
  });
  btn.addEventListener('touchstart', onPressStart, { passive: false });
  btn.addEventListener('touchend', onPressEnd);
}

const TEAM_CHAT_MAX_FILE_BYTES = 14 * 1024 * 1024; // margem abaixo do limite de 20mb do servidor (o base64 infla ~33%)

function handleTeamChatFile(file) {
  if (file.size > TEAM_CHAT_MAX_FILE_BYTES) {
    showToast('Arquivo muito grande (máx. 14MB). Escolha um arquivo menor.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    state.teamChatPendingAttachment = {
      kind: file.type.startsWith('image/') ? 'image' : 'file',
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      dataBase64: base64
    };
    renderTeamChatAttachmentPreview();
  };
  reader.readAsDataURL(file);
}

function renderTeamChatAttachmentPreview() {
  const box = document.getElementById('team-chat-attachment-preview');
  const att = state.teamChatPendingAttachment;
  if (!att) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const icon = att.kind === 'image' ? svgIcon('image') : att.kind === 'audio' ? svgIcon('mic') : svgIcon('attach');
  const audioPreview = att.kind === 'audio' ? `<audio controls src="data:${att.mime};base64,${att.dataBase64}"></audio>` : '';
  box.style.display = 'flex';
  box.innerHTML = `
    <span>${icon} ${escapeHtml(att.filename)}</span>
    ${audioPreview}
    <button id="tc-remove-attachment" type="button" title="Excluir">${svgIcon('trash')} Excluir</button>
  `;
  document.getElementById('tc-remove-attachment').addEventListener('click', () => {
    state.teamChatPendingAttachment = null;
    renderTeamChatAttachmentPreview();
  });
}

// Safari/iOS geralmente não suporta audio/webm — detecta o primeiro formato
// que o navegador realmente aceita em vez de fixar um só (isso fazia o áudio
// gravar só na aparência: o blob ficava marcado como webm mas o conteúdo real
// era outro formato, e o player não conseguia tocar).
function pickSupportedAudioMime() {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac'];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function startTeamChatRecording() {
  const btn = document.getElementById('tc-btn-record');
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Este navegador não suporta gravação de áudio.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedAudioMime();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const actualMime = recorder.mimeType || mimeType || 'audio/webm';
    const extension = actualMime.includes('mp4') ? 'm4a' : actualMime.includes('ogg') ? 'ogg' : actualMime.includes('aac') ? 'aac' : 'webm';
    state.teamChatRecordedChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.teamChatRecordedChunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      btn.classList.remove('recording');
      const blob = new Blob(state.teamChatRecordedChunks, { type: actualMime });
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        state.teamChatPendingAttachment = {
          kind: 'audio',
          filename: `audio-${Date.now()}.${extension}`,
          mime: actualMime,
          dataBase64: base64
        };
        renderTeamChatAttachmentPreview();
      };
      reader.readAsDataURL(blob);
    };
    recorder.start();
    state.teamChatRecorder = recorder;
    btn.classList.add('recording');
  } catch (err) {
    showToast('Não foi possível acessar o microfone.');
  }
}

function stopTeamChatRecording() {
  if (state.teamChatRecorder && state.teamChatRecorder.state === 'recording') {
    state.teamChatRecorder.stop();
  }
}

async function sendTeamChatMessage() {
  const input = document.getElementById('team-chat-input');
  const text = input.value.trim();
  const attachment = state.teamChatPendingAttachment;
  if (!text && !attachment) return;
  if (!state.attendantId) {
    showToast('Selecione seu nome de atendente primeiro');
    openAttendantPicker();
    return;
  }
  try {
    await Api.sendTeamChat({ text, attendantId: state.attendantId, attachment, recipientId: state.teamChatTarget });
    input.value = '';
    state.teamChatPendingAttachment = null;
    renderTeamChatAttachmentPreview();
    await renderTeamChat();
  } catch (err) {
    showToast(err.message || 'Erro ao enviar mensagem');
  }
}

function startTeamChatPolling() {
  stopTeamChatPolling();
  state.teamChatPollHandle = setInterval(renderTeamChat, 4000);
}

function stopTeamChatPolling() {
  if (state.teamChatPollHandle) {
    clearInterval(state.teamChatPollHandle);
    state.teamChatPollHandle = null;
  }
}

function isTeamChatMsgVisibleInThread(m) {
  if (state.teamChatTarget) {
    return (
      (m.senderId === state.attendantId && m.recipientId === state.teamChatTarget) ||
      (m.senderId === state.teamChatTarget && m.recipientId === state.attendantId)
    );
  }
  return !m.recipientId;
}

async function pollTeamChatBadge() {
  try {
    const messages = await Api.teamChat(state.attendantId);
    state.teamChatMessages = messages;
    const isViewing = document.getElementById('view-chatequipe').classList.contains('active');
    const badge = document.getElementById('sidebar-teamchat-badge');
    const unseen = messages.filter((m) => m.senderId !== state.attendantId && !(m.readBy || []).includes(state.attendantId)).length;
    if (isViewing) {
      badge.style.display = 'none';
      return;
    }
    if (unseen > 0) {
      badge.textContent = String(unseen);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
    renderTeamChatContacts();
  } catch (err) {
    // silencioso — próxima verificação tenta de novo
  }
}

function renderTeamChatContacts() {
  const container = document.getElementById('team-chat-contacts');
  if (!container) return;
  const others = state.users.filter((u) => u.id !== state.attendantId);
  const unreadFor = (target) =>
    state.teamChatMessages.filter(
      (m) => isTeamChatMsgTargeted(m, target) && m.senderId !== state.attendantId && !(m.readBy || []).includes(state.attendantId)
    ).length;

  function isTeamChatMsgTargeted(m, target) {
    if (target === null) return !m.recipientId;
    return (m.senderId === state.attendantId && m.recipientId === target) || (m.senderId === target && m.recipientId === state.attendantId);
  }

  const geralUnread = unreadFor(null);
  let html = `
    <div class="comms-thread-item ${state.teamChatTarget === null ? 'active' : ''}" data-tc-target="">
      <div>
        <div class="ct-name">${svgIcon('globe')} Geral ${geralUnread ? `<span class="notif-badge" style="display:inline-block;">${geralUnread}</span>` : ''}</div>
        <div class="ct-preview">Conversa com todo o time</div>
      </div>
    </div>
  `;
  html += others
    .map((u) => {
      const unread = unreadFor(u.id);
      return `
      <div class="comms-thread-item ${state.teamChatTarget === u.id ? 'active' : ''}" data-tc-target="${u.id}">
        <div>
          <div class="ct-name">${svgIcon('lock')} ${escapeHtml(u.name)} ${unread ? `<span class="notif-badge" style="display:inline-block;">${unread}</span>` : ''}</div>
          <div class="ct-preview">Conversa privada</div>
        </div>
      </div>
    `;
    })
    .join('');
  container.innerHTML = html;

  container.querySelectorAll('[data-tc-target]').forEach((el) => {
    el.addEventListener('click', () => {
      state.teamChatTarget = el.dataset.tcTarget || null;
      const targetUser = state.users.find((u) => u.id === state.teamChatTarget);
      document.getElementById('team-chat-target-name').innerHTML = targetUser ? `${svgIcon('lock')} ${escapeHtml(targetUser.name)}` : `${svgIcon('globe')} Geral`;
      renderTeamChatContacts();
      renderTeamChat();
    });
  });
}

function renderTeamChatBubble(m) {
  const isOut = m.senderId === state.attendantId;
  let attachmentHtml = '';
  if (m.attachment) {
    const src = `data:${m.attachment.mime};base64,${m.attachment.dataBase64}`;
    if (m.attachment.kind === 'image') {
      attachmentHtml = `<div class="tc-image-bubble"><img src="${src}" alt="${escapeHtml(m.attachment.filename)}" /></div>`;
    } else if (m.attachment.kind === 'audio') {
      attachmentHtml = `<div class="tc-audio-bubble"><audio controls src="${src}"></audio></div>`;
    } else {
      attachmentHtml = `<div class="tc-file-bubble"><a href="${src}" download="${escapeHtml(m.attachment.filename)}">${svgIcon('attach')} ${escapeHtml(m.attachment.filename)}</a></div>`;
    }
  }

  let seenHtml = '';
  if (isOut) {
    const readBy = m.readBy || [];
    if (m.recipientId) {
      seenHtml = readBy.includes(m.recipientId)
        ? `<div class="tc-seen-flash">${svgIcon('eye')} Visualizado</div>`
        : '<div class="tc-seen-flash pending">Enviado</div>';
    } else {
      const names = readBy.map((id) => userName(id)).filter(Boolean);
      seenHtml = names.length
        ? `<div class="tc-seen-flash">${svgIcon('eye')} Visualizado por ${escapeHtml(names.join(', '))}</div>`
        : '<div class="tc-seen-flash pending">Enviado</div>';
    }
  }

  return `
    <div class="chat-bubble-row ${isOut ? 'out' : 'in'}" data-tc-msg-id="${m.id}">
      <div class="tc-sender">${escapeHtml(m.senderName)}</div>
      ${m.text ? `<div class="chat-bubble">${escapeHtml(m.text)}</div>` : ''}
      ${attachmentHtml}
      <div class="chat-meta">${fmtDateTime(m.timestamp)}</div>
      ${seenHtml}
    </div>
  `;
}

async function renderTeamChat() {
  const thread = document.getElementById('team-chat-thread');
  try {
    const messages = await Api.teamChat(state.attendantId);
    state.teamChatMessages = messages;
    renderTeamChatContacts();
    document.getElementById('sidebar-teamchat-badge').style.display = 'none';

    const visible = messages.filter(isTeamChatMsgVisibleInThread);

    const unseenIncoming = visible.filter((m) => m.senderId !== state.attendantId && !(m.readBy || []).includes(state.attendantId));
    if (unseenIncoming.length && state.attendantId) {
      await Promise.all(unseenIncoming.map((m) => Api.markTeamChatRead(m.id, state.attendantId).catch(() => {})));
      unseenIncoming.forEach((m) => {
        if (!m.readBy) m.readBy = [];
        m.readBy.push(state.attendantId);
      });
    }

    if (visible.length === 0) {
      thread.innerHTML = '<div class="empty-state">Nenhuma mensagem ainda. Comece a conversa!</div>';
      return;
    }
    const wasAtBottom = thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 40;
    thread.innerHTML = visible.map(renderTeamChatBubble).join('');
    if (wasAtBottom || !thread.dataset.rendered) {
      thread.scrollTop = thread.scrollHeight;
    }
    thread.dataset.rendered = '1';
  } catch (err) {
    thread.innerHTML = '<div class="empty-state">Erro ao carregar o chat da equipe.</div>';
  }
}

// ============ BI — visão geral, tráfego pago e marketplaces ============
function bindBiTabs() {
  document.querySelectorAll('#view-bi .settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#view-bi .settings-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.biTab = tab.dataset.bitab;
      document.getElementById('bi-tab-geral').style.display = state.biTab === 'geral' ? '' : 'none';
      document.getElementById('bi-tab-trafego').style.display = state.biTab === 'trafego' ? '' : 'none';
      document.getElementById('bi-tab-marketplaces').style.display = state.biTab === 'marketplaces' ? '' : 'none';
      renderBiActiveTab();
    });
  });
}

function renderBiActiveTab() {
  if (state.biTab === 'trafego') renderBiTrafegoPago();
  else if (state.biTab === 'marketplaces') renderBiMarketplaces();
  else renderBI();
  document.getElementById('bi-updated-at').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
}

function startBiPolling() {
  stopBiPolling();
  state.biPollHandle = setInterval(async () => {
    try {
      const [deals, contacts] = await Promise.all([Api.deals(), Api.contacts()]);
      state.deals = deals;
      state.contacts = contacts;
      renderBiActiveTab();
    } catch (err) {
      // silencioso — próxima verificação tenta de novo
    }
  }, 20000);
}

function stopBiPolling() {
  if (state.biPollHandle) {
    clearInterval(state.biPollHandle);
    state.biPollHandle = null;
  }
}

// ---------- Google Calendar: popup de conexão por usuário ----------
function bindGoogleCalendarPopup() {
  window.addEventListener('message', async (ev) => {
    if (!ev.data) return;
    if (ev.data.googleCalendarConnected) {
      state.users = await Api.users();
      renderSettings();
      showToast(`Google Calendar conectado (${ev.data.email})`);
    } else if (ev.data.gmailInboxConnected) {
      showToast(`Caixa de entrada do Gmail conectada (${ev.data.email})`);
      if (document.getElementById('view-email').classList.contains('active')) renderGmailInbox();
    } else if (ev.data.googleCalendarError) {
      showToast('Erro ao conectar Google: ' + ev.data.googleCalendarError);
    }
  });
}

// ---------- Calendário (agenda unificada de reuniões/tarefas) ----------
function bindCalendarioPage() {
  const select = document.getElementById('calendario-attendant-filter');
  if (select) select.addEventListener('change', renderCalendario);

  document.getElementById('btn-add-calendar-event').addEventListener('click', openCalendarEventModal);
  document.getElementById('btn-save-calendar-event').addEventListener('click', saveCalendarEvent);
}

function openCalendarEventModal() {
  document.getElementById('cal-event-title').value = '';
  document.getElementById('cal-event-type').value = 'meeting';

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 60);
  document.getElementById('cal-event-date').value = now.toISOString().slice(0, 16);

  const attendantSelect = document.getElementById('cal-event-attendant');
  attendantSelect.innerHTML = state.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  if (state.attendantId) attendantSelect.value = state.attendantId;

  const linkSelect = document.getElementById('cal-event-link');
  const dealOptions = state.deals
    .filter((d) => d.status === 'open')
    .map((d) => `<option value="deal:${d.id}">Negócio: ${escapeHtml(d.title)}</option>`)
    .join('');
  const leadOptions = state.contacts.map((c) => `<option value="lead:${c.id}">Lead: ${escapeHtml(c.name)}</option>`).join('');
  linkSelect.innerHTML = `<option value="">Nenhum</option>${dealOptions}${leadOptions}`;

  openModal('modal-calendar-event');
}

async function saveCalendarEvent() {
  const title = document.getElementById('cal-event-title').value.trim();
  const dateVal = document.getElementById('cal-event-date').value;
  if (!title) return showToast('Informe um título para o evento');
  if (!dateVal) return showToast('Informe a data e hora');

  const [linkType, linkId] = (document.getElementById('cal-event-link').value || '').split(':');

  const payload = {
    type: document.getElementById('cal-event-type').value,
    text: title,
    date: new Date(dateVal).toISOString(),
    attendantId: document.getElementById('cal-event-attendant').value,
    done: false,
    dealId: linkType === 'deal' ? linkId : null,
    leadId: linkType === 'lead' ? linkId : null
  };

  try {
    await Api.addCalendarEvent(payload);
    closeModal('modal-calendar-event');
    showToast('Evento criado!');
    renderCalendario();
  } catch (err) {
    showToast(err.message || 'Erro ao criar evento');
  }
}

async function renderCalendario() {
  const select = document.getElementById('calendario-attendant-filter');
  if (select && !select.dataset.filled) {
    select.innerHTML =
      '<option value="">Todos os responsáveis</option>' +
      state.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
    select.dataset.filled = '1';
  }

  const container = document.getElementById('calendario-list');
  container.innerHTML = '<div class="empty-state">Carregando...</div>';

  let events;
  try {
    events = await Api.calendarEvents();
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Erro ao carregar o calendário: ${escapeHtml(err.message || '')}</div>`;
    return;
  }

  const attendantFilter = select ? select.value : '';
  if (attendantFilter) events = events.filter((e) => e.attendantId === attendantFilter);

  if (!events.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma reunião ou tarefa com data marcada ainda.</div>';
    return;
  }

  const groups = {};
  events.forEach((e) => {
    const day = new Date(e.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });

  container.innerHTML = Object.entries(groups)
    .map(
      ([day, dayEvents]) => `
    <div class="panel" style="margin-bottom:14px;">
      <h3 style="text-transform:capitalize;">${escapeHtml(day)}</h3>
      ${dayEvents
        .map((e) => {
          const time = new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const context = e.dealTitle ? `Negócio: ${escapeHtml(e.dealTitle)}` : e.leadName ? `Lead: ${escapeHtml(e.leadName)}` : '';
          const typeLabel = e.type === 'meeting' ? 'Reunião' : 'Tarefa';
          const syncBtn = e.googleEventLink
            ? `<a href="${e.googleEventLink}" target="_blank" class="gcal-sync-btn">${svgIcon('calendar')} Ver no Google Calendar</a>`
            : `<button class="gcal-sync-btn" data-sync-calendario-activity="${e.id}">${svgIcon('calendar')} Sincronizar com Google Calendar</button>`;
          return `
        <div class="list-row" style="align-items:flex-start;">
          <div>
            <span class="name">${time} · ${escapeHtml(typeLabel)}: ${escapeHtml(e.text || '')}</span><br/>
            <span style="font-size:12px; color:var(--vg-text-muted);">
              ${context}${context && e.attendantName ? ' · ' : ''}${e.attendantName ? 'Responsável: ' + escapeHtml(e.attendantName) : ''}
              ${e.done ? ' · Concluída' : ''}
            </span>
          </div>
          <div class="row-actions">${syncBtn}</div>
        </div>
      `;
        })
        .join('')}
    </div>
  `
    )
    .join('');

  container.querySelectorAll('[data-sync-calendario-activity]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Sincronizando...';
      try {
        await Api.syncCalendar(btn.dataset.syncCalendarioActivity);
        showToast('Evento criado no Google Calendar!');
        renderCalendario();
      } catch (err) {
        showToast(err.message || 'Erro ao sincronizar com o Google Calendar');
        renderCalendario();
      }
    });
  });
}

// Métricas de leads/negócios ligados a um canal de tráfego pago (Facebook Ads,
// Instagram Ads, Google Ads, TikTok Ads) — cruza contact.source.channel com os
// negócios do respectivo lead.
function biMetricsForChannel(channel) {
  const leadIds = state.contacts.filter((c) => c.source && c.source.channel === channel).map((c) => c.id);
  const deals = state.deals.filter((d) => leadIds.includes(d.personId));
  const openDeals = deals.filter((d) => d.status === 'open');
  const wonDeals = deals.filter((d) => d.status === 'won');
  const lostDeals = deals.filter((d) => d.status === 'lost');
  const openValue = openDeals.reduce((s, d) => s + Number(d.value), 0);
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value), 0);
  const closedCount = wonDeals.length + lostDeals.length;
  const conversion = closedCount === 0 ? 0 : Math.round((wonDeals.length / closedCount) * 100);
  return { leadCount: leadIds.length, openCount: openDeals.length, openValue, wonValue, conversion };
}

function renderBiTrafegoPago() {
  const container = document.getElementById('bi-trafego-container');
  const metrics = TRAFEGO_PAGO_CHANNELS.map((ch) => ({ channel: ch, label: SOURCE_LABEL[ch], ...biMetricsForChannel(ch) }));
  const totalWon = metrics.reduce((s, m) => s + m.wonValue, 0);
  const maxWon = Math.max(1, ...metrics.map((m) => m.wonValue || m.openValue));

  const comparisonRows = metrics
    .map(
      (m) => `
    <div class="funnel-row">
      <div class="funnel-label">${escapeHtml(m.label)}</div>
      <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${Math.round(((m.wonValue || m.openValue) / maxWon) * 100)}%; background:var(--vg-orange)"></div></div>
      <div class="funnel-count wide">${fmtMoney(m.wonValue)}${m.openValue ? ` <span style="font-weight:400; color:var(--vg-text-muted);">(+${fmtMoney(m.openValue)} aberto)</span>` : ''}</div>
    </div>
  `
    )
    .join('');

  const cards = metrics
    .map(
      (m) => `
    <div class="panel">
      <h3>${escapeHtml(m.label)}</h3>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Leads</div><div class="value">${m.leadCount}</div></div>
        <div class="stat-card"><div class="label">Negócios em aberto</div><div class="value">${m.openCount}</div></div>
        <div class="stat-card"><div class="label">Valor em aberto</div><div class="value orange">${fmtMoney(m.openValue)}</div></div>
        <div class="stat-card"><div class="label">Faturamento (Ganho)</div><div class="value green">${fmtMoney(m.wonValue)}</div></div>
        <div class="stat-card"><div class="label">Taxa de conversão</div><div class="value">${m.conversion}%</div></div>
      </div>
    </div>
  `
    )
    .join('');

  container.innerHTML = `
    <div class="panel">
      <h3>Faturamento por Canal de Tráfego Pago</h3>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="label">Faturamento total (Ganho)</div><div class="value green">${fmtMoney(totalWon)}</div></div>
      </div>
      ${comparisonRows || '<div class="empty-state">Nenhum lead vinculado a tráfego pago ainda.</div>'}
    </div>
    ${cards}
  `;
}

function biMetricsForPlatform(platform) {
  const deals = state.deals.filter((d) => d.platform === platform);
  const openDeals = deals.filter((d) => d.status === 'open');
  const wonDeals = deals.filter((d) => d.status === 'won');
  const openValue = openDeals.reduce((s, d) => s + Number(d.value), 0);
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value), 0);
  return { dealCount: deals.length, openCount: openDeals.length, openValue, wonValue };
}

function renderBiMarketplaces() {
  const container = document.getElementById('bi-marketplaces-container');
  const metrics = MARKETPLACE_PLATFORMS.map((p) => ({ platform: p, ...biMetricsForPlatform(p) }));
  const totalWon = metrics.reduce((s, m) => s + m.wonValue, 0);
  const maxWon = Math.max(1, ...metrics.map((m) => m.wonValue || m.openValue));

  const comparisonRows = metrics
    .map(
      (m) => `
    <div class="funnel-row">
      <div class="funnel-label">${escapeHtml(m.platform)}</div>
      <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${Math.round(((m.wonValue || m.openValue) / maxWon) * 100)}%; background:var(--vg-navy)"></div></div>
      <div class="funnel-count wide">${fmtMoney(m.wonValue)}${m.openValue ? ` <span style="font-weight:400; color:var(--vg-text-muted);">(+${fmtMoney(m.openValue)} aberto)</span>` : ''}</div>
    </div>
  `
    )
    .join('');

  const cards = metrics
    .map(
      (m) => `
    <div class="panel">
      <h3>${escapeHtml(m.platform)}</h3>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Negócios</div><div class="value">${m.dealCount}</div></div>
        <div class="stat-card"><div class="label">Em aberto</div><div class="value">${m.openCount}</div></div>
        <div class="stat-card"><div class="label">Valor em aberto</div><div class="value orange">${fmtMoney(m.openValue)}</div></div>
        <div class="stat-card"><div class="label">Faturamento (Ganho)</div><div class="value green">${fmtMoney(m.wonValue)}</div></div>
      </div>
    </div>
  `
    )
    .join('');

  container.innerHTML = `
    <div class="panel">
      <h3>Faturamento por Marketplace</h3>
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="label">Faturamento total (Ganho)</div><div class="value green">${fmtMoney(totalWon)}</div></div>
      </div>
      ${comparisonRows || '<div class="empty-state">Nenhum negócio vinculado a um marketplace ainda.</div>'}
    </div>
    ${cards}
  `;
}

// Gráfico de barras simples em SVG, sem dependências externas.
function buildBarChartSvg(items, opts) {
  opts = opts || {};
  const width = opts.width || 640;
  const height = opts.height || 200;
  const padding = 30;
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  const barWidth = items.length ? (width - padding * 2) / items.length : 0;

  const bars = items
    .map((item, i) => {
      const value = Number(item.value) || 0;
      const barHeight = Math.max(2, (value / max) * (height - padding * 2));
      const x = padding + i * barWidth + barWidth * 0.15;
      const w = Math.max(4, barWidth * 0.7);
      const y = height - padding - barHeight;
      const valueLabel = opts.valueFmt ? opts.valueFmt(value) : String(value);
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="${item.color || '#ff7a1a'}"></rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#8a94a6">${escapeHtml(valueLabel)}</text>
        <text x="${(x + w / 2).toFixed(1)}" y="${(height - padding + 16).toFixed(1)}" text-anchor="middle" font-size="11" fill="#8a94a6">${escapeHtml(item.label)}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible;">${bars}</svg>`;
}

function biMonthlyRevenueChart() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 });
  }
  state.deals
    .filter((d) => d.status === 'won')
    .forEach((d) => {
      const refDate = new Date(d.closeDate || d.createdAt);
      const key = `${refDate.getFullYear()}-${refDate.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.value += Number(d.value) || 0;
    });
  return buildBarChartSvg(months, { valueFmt: (v) => (v ? fmtMoney(v).replace('R$', '').trim() : '') });
}

function biLeadsByChannelChart() {
  const counts = {};
  state.contacts.forEach((c) => {
    const channel = (c.source && c.source.channel) || 'outro';
    counts[channel] = (counts[channel] || 0) + 1;
  });
  const labels = {
    facebook_ads: 'Facebook',
    instagram_ads: 'Instagram',
    google_ads: 'Google',
    tiktok_ads: 'TikTok',
    whatsapp: 'WhatsApp',
    indicacao: 'Indicação',
    organico: 'Orgânico',
    outro: 'Outro'
  };
  const items = Object.entries(counts).map(([channel, count]) => ({
    label: labels[channel] || channel,
    value: count,
    color: '#1a2b4c'
  }));
  return buildBarChartSvg(items, { valueFmt: (v) => String(v), width: 640, height: 180 });
}

function renderBI() {
  const container = document.getElementById('bi-container');
  const categories = state.settings.categories || [];
  if (categories.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhuma categoria cadastrada em Configurações.</div>';
    return;
  }

  const chartsPanel = `
    <div class="panel">
      <h3>Faturamento por mês (últimos 6 meses)</h3>
      ${biMonthlyRevenueChart()}
    </div>
    <div class="panel">
      <h3>Leads por canal de origem</h3>
      ${state.contacts.length ? biLeadsByChannelChart() : '<div class="empty-state">Nenhum lead cadastrado ainda.</div>'}
    </div>
  `;

  container.innerHTML = chartsPanel + categories
    .map((cat) => {
      const leadIds = state.contacts.filter((c) => contactCategoryIds(c).includes(cat.id)).map((c) => c.id);
      const deals = state.deals.filter((d) => leadIds.includes(d.personId));
      const openDeals = deals.filter((d) => d.status === 'open');
      const wonDeals = deals.filter((d) => d.status === 'won');
      const lostDeals = deals.filter((d) => d.status === 'lost');
      const openValue = openDeals.reduce((s, d) => s + Number(d.value), 0);
      const wonValue = wonDeals.reduce((s, d) => s + Number(d.value), 0);
      const closedCount = wonDeals.length + lostDeals.length;
      const conversion = closedCount === 0 ? 0 : Math.round((wonDeals.length / closedCount) * 100);

      const maxCount = Math.max(1, ...state.stages.map((s) => deals.filter((d) => d.stage === s.id).length));
      const funnelRows = state.stages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const count = deals.filter((d) => d.stage === stage.id).length;
          const pct = Math.round((count / maxCount) * 100);
          return `
          <div class="funnel-row">
            <div class="funnel-label">${escapeHtml(stage.name)}</div>
            <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%; background:linear-gradient(90deg, ${cat.color}, ${cat.color})"></div></div>
            <div class="funnel-count">${count} negócio${count === 1 ? '' : 's'}</div>
          </div>
        `;
        })
        .join('');

      const platformRows = revenueBreakdownRows(deals, (d) => d.platform, cat.color);
      const orgRows = revenueBreakdownRows(
        deals,
        (d) => (d.orgId ? orgName(d.orgId) : null),
        cat.color
      );

      return `
      <div class="panel">
        <h3 style="display:flex; align-items:center; gap:8px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${cat.color}; display:inline-block;"></span>
          ${escapeHtml(cat.name)}
        </h3>
        <div class="stat-grid" style="margin-bottom:16px;">
          <div class="stat-card">
            <div class="label">Negócios em aberto</div>
            <div class="value">${openDeals.length}</div>
          </div>
          <div class="stat-card">
            <div class="label">Valor em aberto</div>
            <div class="value orange">${fmtMoney(openValue)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Faturamento (Ganho)</div>
            <div class="value green">${fmtMoney(wonValue)}</div>
          </div>
          <div class="stat-card">
            <div class="label">Taxa de conversão</div>
            <div class="value">${conversion}%</div>
          </div>
        </div>
        <div class="k" style="font-size:11px; color:#8a94a6; text-transform:uppercase; margin-bottom:8px;">Negócios por etapa</div>
        ${funnelRows}
        ${platformRows ? `<div class="k" style="font-size:11px; color:#8a94a6; text-transform:uppercase; margin:16px 0 8px;">Faturamento por Plataforma de Vendas</div>${platformRows}` : ''}
        ${orgRows ? `<div class="k" style="font-size:11px; color:#8a94a6; text-transform:uppercase; margin:16px 0 8px;">Faturamento por Fornecedor</div>${orgRows}` : ''}
      </div>
    `;
    })
    .join('');
}

// Agrupa negócios por uma chave (plataforma, fornecedor, etc.) e mostra valor
// em aberto e faturamento (ganho) de cada grupo.
function revenueBreakdownRows(deals, keyFn, color) {
  const groups = new Map();
  deals.forEach((d) => {
    const key = keyFn(d);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { open: 0, won: 0 });
    const g = groups.get(key);
    if (d.status === 'open') g.open += Number(d.value);
    if (d.status === 'won') g.won += Number(d.value);
  });
  if (groups.size === 0) return '';

  const maxWon = Math.max(1, ...Array.from(groups.values()).map((g) => g.won || g.open));
  return Array.from(groups.entries())
    .sort((a, b) => b[1].won - a[1].won || b[1].open - a[1].open)
    .map(([name, g]) => {
      const pct = Math.round(((g.won || g.open) / maxWon) * 100);
      return `
      <div class="funnel-row">
        <div class="funnel-label">${escapeHtml(name)}</div>
        <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%; background:${color}"></div></div>
        <div class="funnel-count wide">${fmtMoney(g.won)}${g.open ? ` <span style="font-weight:400; color:#8a94a6;">(+${fmtMoney(g.open)} aberto)</span>` : ''}</div>
      </div>
    `;
    })
    .join('');
}

// ============ Assinatura de e-mail (usuários) ============
// undefined = sem alteração na imagem; null = remover; string (data URL) = nova imagem
let pendingSignatureImage;

function renderSignatureImagePreview(dataUrl) {
  const preview = document.getElementById('sig-user-image-preview');
  const removeBtn = document.getElementById('sig-user-image-remove');
  if (dataUrl) {
    preview.innerHTML = `<img src="${dataUrl}" alt="Assinatura" style="max-width:280px; max-height:120px; border-radius:6px; border:1px solid var(--vg-border, #333);" />`;
    removeBtn.style.display = 'inline-block';
  } else {
    preview.innerHTML = '<span style="font-size:12px; color:var(--vg-text-muted);">Nenhuma imagem cadastrada.</span>';
    removeBtn.style.display = 'none';
  }
}

function bindUserSignatureModal() {
  document.getElementById('sig-user-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingSignatureImage = reader.result;
      renderSignatureImagePreview(pendingSignatureImage);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('sig-user-image-remove').addEventListener('click', () => {
    pendingSignatureImage = null;
    document.getElementById('sig-user-image-input').value = '';
    renderSignatureImagePreview(null);
  });

  document.getElementById('btn-save-signature').addEventListener('click', async () => {
    const id = document.getElementById('sig-user-id').value;
    const signature = document.getElementById('sig-user-text').value;
    const payload = { signature };
    if (pendingSignatureImage !== undefined) payload.signatureImage = pendingSignatureImage;
    try {
      const updated = await Api.updateUser(id, payload);
      const user = state.users.find((u) => u.id === id);
      if (user) {
        user.signature = updated.signature;
        user.signatureImage = updated.signatureImage;
      }
      closeModal('modal-user-signature');
      showToast('Assinatura salva');
    } catch (err) {
      showToast('Erro ao salvar assinatura');
    }
  });
}

function openUserSignatureModal(userId) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return;
  pendingSignatureImage = undefined;
  document.getElementById('sig-user-id').value = user.id;
  document.getElementById('sig-user-name').textContent = user.name;
  document.getElementById('sig-user-text').value = (user.signature || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  document.getElementById('sig-user-image-input').value = '';
  renderSignatureImagePreview(user.signatureImage || null);
  openModal('modal-user-signature');
}

// ============ Boot ============
init();
