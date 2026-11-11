/* Gerador de Leads — tela do CRM (usa as rotas de leadgen.js). */
(() => {
  'use strict';
  const S = { cfg: null, items: [], ref: null, shown: 40, polling: null, loaded: false };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => (window.escapeHtml ? window.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const call = (u, o) => window.api(u, o);
  const attendant = () => (window.state && window.state.attendantId) || null;

  const STATUS = { novo: 'Novo', em_contato: 'Em contato', qualificado: 'Qualificado', sem_resposta: 'Sem resposta', sem_interesse: 'Sem interesse', descartado: 'Descartado' };
  const OUTCOMES = [
    ['interessado', 'Falou e tem interesse'], ['reuniao', 'Reunião marcada'], ['retornar', 'Pediu para retornar'],
    ['sem_resposta', 'Não atendeu / sem resposta'], ['sem_interesse', 'Sem interesse'], ['numero_errado', 'Número errado / outra empresa'], ['contato_errado', 'Não é o contato certo']
  ];

  function km(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const r = (x) => (x * Math.PI) / 180; const R = 6371;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  window.initLeadgen = async function initLeadgen() {
    if (!S.loaded) {
      try { S.cfg = await call('/api/leadgen/config'); } catch (e) { $('lg-root').innerHTML = `<p>Não foi possível abrir o gerador: ${esc(e.message)}</p>`; return; }
      buildShell(); S.loaded = true;
    }
    refresh();
  };

  async function refresh() {
    try { S.items = await call('/api/leadgen/items'); S.cfg = await call('/api/leadgen/config'); } catch (e) { return; }
    renderMeta(); renderList();
  }

  function buildShell() {
    const c = S.cfg;
    const ufOpts = Object.entries(c.ufs).map(([k, v]) => `<option value="${k}">${k} — ${esc(v)}</option>`).join('');
    const segs = Object.entries(c.segments).map(([k, v]) => `<label class="lg-check"><input type="checkbox" name="lg-seg" value="${k}" checked> ${esc(v)}</label>`).join('');
    $('lg-root').innerHTML = `
      ${c.google ? '' : `<div class="lg-warn"><b>Fonte gratuita ativa (OpenStreetMap).</b> Ela traz telefone e site de parte das empresas, mas <b>não traz nota nem avaliações</b>.
        Para pontuar por estrelas e comentários, ligue o Google Places: crie uma chave de API (Places API New) e salve como <code>GOOGLE_PLACES_API_KEY</code> nas variáveis do Render.</div>`}
      <div class="lg-meta" id="lg-meta"></div>
      <div class="lg-card">
        <h3>1. Gerar novos leads</h3>
        <div class="lg-grid">
          <label>País<select id="lg-country"><option value="BR">Brasil</option><option value="PT">Portugal</option><option value="US">Estados Unidos</option><option value="AR">Argentina</option><option value="PY">Paraguai</option><option value="UY">Uruguai</option><option value="CL">Chile</option></select></label>
          <label>Estado<select id="lg-uf"><option value="">— escolha —</option>${ufOpts}</select></label>
          <label>Cidade <small>(opcional)</small><input id="lg-city" list="lg-cities" placeholder="Ex.: Ribeirão Preto" autocomplete="off"><datalist id="lg-cities"></datalist></label>
          <label>Raio a partir da cidade<select id="lg-radius"><option value="0">Sem limite</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option><option value="300">300 km</option><option value="1000">1.000 km</option></select></label>
          <label>Quantidade<input id="lg-limit" type="number" min="10" max="300" value="${c.dailyTarget}"></label>
          <label>Nota mínima<select id="lg-minrating"><option value="0">Qualquer</option><option value="3.5">3,5+</option><option value="4">4,0+</option><option value="4.5">4,5+</option></select></label>
          <label>Avaliações mínimas<select id="lg-minrev"><option value="0">Qualquer</option><option value="5">5+</option><option value="20">20+</option><option value="50">50+</option><option value="200">200+</option></select></label>
          <label>Outro termo <small>(opcional)</small><input id="lg-term" placeholder="Ex.: cosméticos, ferramentas"></label>
        </div>
        <div class="lg-checks">${segs}
          <label class="lg-check"><input type="checkbox" id="lg-needphone" checked> Só com telefone</label>
          <label class="lg-check"><input type="checkbox" id="lg-needsite"> Só com site</label></div>
        <div class="lg-actions"><button class="btn-primary" id="lg-go">Gerar leads qualificados</button><span id="lg-status" class="lg-status"></span></div>
      </div>
      <div class="lg-card">
        <h3>2. Leads gerados <small id="lg-count"></small></h3>
        <div class="lg-grid lg-filters">
          <label>Buscar<input id="f-q" placeholder="Nome, cidade, telefone..."></label>
          <label>Estado<select id="f-uf"><option value="">Todos</option>${ufOpts}</select></label>
          <label>Cidade<input id="f-city" placeholder="Filtrar cidade"></label>
          <label>Temperatura<select id="f-tier"><option value="">Todas</option><option value="quente">Quente (70+)</option><option value="morno">Morno (50 a 69)</option><option value="frio">Frio</option></select></label>
          <label>Status<select id="f-status"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === 'novo' ? '' : ''}>${v}</option>`).join('')}</select></label>
          <label>Nota mínima<select id="f-rating"><option value="0">Qualquer</option><option value="3.5">3,5+</option><option value="4">4,0+</option><option value="4.5">4,5+</option></select></label>
          <label>Avaliações mínimas<select id="f-rev"><option value="0">Qualquer</option><option value="5">5+</option><option value="20">20+</option><option value="50">50+</option><option value="200">200+</option></select></label>
          <label>Segmento<select id="f-seg"><option value="">Todos</option>${Object.entries(c.segments).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Perto de <small>(cidade)</small><span class="lg-ref"><input id="f-ref" placeholder="Ex.: Campinas SP"><button type="button" class="btn-secondary btn-sm" id="f-ref-go">Localizar</button></span></label>
          <label>Distância máxima<select id="f-dist"><option value="0">Qualquer</option><option value="25">até 25 km</option><option value="50">até 50 km</option><option value="100">até 100 km</option><option value="300">até 300 km</option><option value="1000">até 1.000 km</option></select></label>
          <label>Aderência<select id="f-fit"><option value="0">Todas</option><option value="65">Alta (65+): melhor para ligar</option><option value="50">Média ou alta (50+)</option></select></label>
          <label>Ordenar por<select id="f-sort"><option value="score">Maior pontuação</option><option value="rating">Melhor nota</option><option value="reviews">Mais avaliações</option><option value="near">Mais perto</option><option value="far">Mais longe</option><option value="new">Mais recentes</option></select></label>
        </div>
        <div id="f-refinfo" class="lg-refinfo"></div>
        <div id="lg-list"></div>
      </div>`;
    $('lg-uf').addEventListener('change', fillCities);
    $('lg-go').addEventListener('click', startSearch);
    $('f-ref-go').addEventListener('click', locateRef);
    ['f-q', 'f-uf', 'f-city', 'f-tier', 'f-status', 'f-rating', 'f-rev', 'f-seg', 'f-dist', 'f-sort', 'f-fit'].forEach((id) => $(id).addEventListener('input', () => { S.shown = 40; renderList(); }));
    $('lg-list').addEventListener('click', onListClick);
    $('lg-list').addEventListener('change', onListChange);
  }

  function fillCities() {
    const uf = $('lg-uf').value;
    $('lg-cities').innerHTML = (S.cfg.cities[uf] || []).map((c) => `<option value="${esc(c)}">`).join('');
  }

  function renderMeta() {
    const c = S.cfg; const pct = Math.min(100, Math.round((c.generatedToday / c.dailyTarget) * 100));
    const hot = S.items.filter((i) => i.tier === 'quente' && i.status === 'novo').length;
    $('lg-meta').innerHTML = `<div class="lg-metric"><b>${c.generatedToday}</b><span>gerados hoje (meta ${c.dailyTarget})</span><div class="lg-bar"><i style="width:${pct}%"></i></div></div>
      <div class="lg-metric"><b>${S.items.filter((i) => i.status === 'novo').length}</b><span>novos para contatar</span></div>
      <div class="lg-metric"><b>${hot}</b><span>quentes esperando</span></div>
      <div class="lg-metric"><b>${S.items.filter((i) => i.dealId).length}</b><span>já no pipeline</span></div>`;
  }

  async function startSearch() {
    const uf = $('lg-uf').value; const city = $('lg-city').value.trim(); const country = $('lg-country').value;
    if (!city && !(country === 'BR' && uf)) { window.showToast && window.showToast('Escolha um estado ou digite uma cidade.'); return; }
    const segments = [...document.querySelectorAll('input[name="lg-seg"]:checked')].map((x) => x.value);
    if (!segments.length && !$('lg-term').value.trim()) { window.showToast && window.showToast('Marque pelo menos um segmento.'); return; }
    $('lg-go').disabled = true; $('lg-status').textContent = 'Buscando empresas reais... pode levar até 1 minuto.';
    try {
      const { jobId } = await call('/api/leadgen/search', {
        method: 'POST',
        body: JSON.stringify({
          country, uf, city, segments, term: $('lg-term').value, limit: Number($('lg-limit').value) || 100, minRating: $('lg-minrating').value, minReviews: $('lg-minrev').value,
          radiusKm: $('lg-radius').value, needPhone: $('lg-needphone').checked, needSite: $('lg-needsite').checked, attendantId: attendant()
        })
      });
      clearInterval(S.polling);
      S.polling = setInterval(async () => {
        try {
          const j = await call(`/api/leadgen/jobs/${jobId}`);
          $('lg-status').textContent = j.msg;
          if (j.status !== 'rodando') { clearInterval(S.polling); $('lg-go').disabled = false; if (j.status === 'ok') refresh(); }
        } catch (e) { clearInterval(S.polling); $('lg-go').disabled = false; $('lg-status').textContent = e.message; }
      }, 2000);
    } catch (e) { $('lg-go').disabled = false; $('lg-status').textContent = e.message; }
  }

  async function locateRef() {
    const q = $('f-ref').value.trim(); if (!q) { S.ref = null; $('f-refinfo').textContent = ''; return renderList(); }
    $('f-refinfo').textContent = 'Localizando...';
    try {
      const r = await call(`/api/leadgen/geocode?q=${encodeURIComponent(q)}`);
      if (!r.length) { S.ref = null; $('f-refinfo').textContent = 'Lugar não encontrado.'; return; }
      S.ref = { lat: r[0].lat, lon: r[0].lon, label: r[0].label }; $('f-refinfo').textContent = `Distâncias calculadas a partir de: ${r[0].label}`;
      if ($('f-sort').value === 'score') $('f-sort').value = 'near';
      renderList();
    } catch (e) { $('f-refinfo').textContent = e.message; }
  }

  function filtered() {
    const q = $('f-q').value.trim().toLowerCase(); const uf = $('f-uf').value; const city = $('f-city').value.trim().toLowerCase();
    const tier = $('f-tier').value; const st = $('f-status').value; const mr = Number($('f-rating').value); const mv = Number($('f-rev').value);
    const seg = $('f-seg').value; const fit = Number($('f-fit').value); const maxd = Number($('f-dist').value); const sort = $('f-sort').value;
    let rows = S.items.filter((i) => {
      if (!st && i.status === 'descartado') return false;
      if (st && i.status !== st) return false;
      if (fit && i.score < fit) return false; if (uf && i.uf !== uf) return false; if (tier && i.tier !== tier) return false; if (seg && i.segment !== seg) return false;
      if (city && !(i.city || '').toLowerCase().includes(city)) return false;
      if (mr && (i.rating || 0) < mr) return false; if (mv && (i.reviews || 0) < mv) return false;
      if (q && !`${i.name} ${i.city} ${i.phone} ${i.address}`.toLowerCase().includes(q)) return false;
      if (S.ref) { i._d = km(S.ref, i); if (maxd && (i._d == null || i._d > maxd)) return false; } else i._d = null;
      return true;
    });
    const by = { score: (a, b) => b.score - a.score, rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.score - a.score, reviews: (a, b) => (b.reviews || 0) - (a.reviews || 0), new: (a, b) => String(b.createdAt).localeCompare(a.createdAt),
      near: (a, b) => (a._d == null) - (b._d == null) || a._d - b._d, far: (a, b) => (a._d == null) - (b._d == null) || b._d - a._d };
    return rows.sort(by[sort] || by.score);
  }

  function card(i) {
    const wa = i.whatsapp ? `https://wa.me/55${String(i.phone).replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Aqui é da Velocita Global. Vi a ' + i.name + ' e queria conversar sobre vender mais em marketplaces.')}` : '';
    const tel = i.phone ? `tel:+55${String(i.phone).replace(/\D/g, '')}` : '';
    const ra = `https://www.reclameaqui.com.br/busca/?q=${encodeURIComponent(i.name)}`;
    const stars = i.rating ? `<span class="lg-stars" title="Nota no Google">★ ${String(i.rating).replace('.', ',')} <small>(${i.reviews} aval.)</small></span>` : '<span class="lg-muted">sem avaliações</span>';
    const dist = i._d != null ? `<span class="lg-pill">${i._d < 10 ? i._d.toFixed(1) : Math.round(i._d)} km</span>` : '';
    const done = i.dealId ? `<span class="lg-pill lg-ok">no pipeline</span>` : '';
    return `<div class="lg-lead lg-${i.tier}" data-id="${i.id}">
      <div class="lg-score" title="${esc((i.reasons || []).join(' · '))}"><b>${i.score}</b><small>${i.tier}</small></div>
      <div class="lg-body">
        <div class="lg-title"><b>${esc(i.name)}</b> <span class="lg-pill">${esc(STATUS[i.status] || i.status)}</span> ${done} ${dist}</div>
        <div class="lg-line">${stars} · ${esc(i.city || '')}${i.uf ? '/' + esc(i.uf) : ''} · <span class="lg-muted">${esc(((window.__lgSeg || {})[i.segment]) || S.cfg.segments[i.segment] || '')} · ${i.source === 'google' ? 'Google' : 'OpenStreetMap'}</span></div>
        <div class="lg-line">${i.phone ? `<a href="${tel}">${esc(i.phone)}</a>` : '<span class="lg-muted">sem telefone</span>'}
          ${wa ? `<a class="lg-btn lg-wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${i.website ? `<a class="lg-btn" href="${esc(i.website)}" target="_blank" rel="noopener">Site</a>` : ''}
          ${i.email ? `<a class="lg-btn" href="mailto:${esc(i.email)}">E-mail</a>` : ''}
          ${i.mapsUrl ? `<a class="lg-btn" href="${esc(i.mapsUrl)}" target="_blank" rel="noopener">Mapa</a>` : ''}
          <a class="lg-btn" href="${ra}" target="_blank" rel="noopener" title="Abre a busca no Reclame Aqui">Reclame Aqui</a>
          <label class="lg-ra">nota RA <input type="number" min="0" max="10" step="0.1" value="${esc((i.ra && i.ra.nota) === '' ? '' : (i.ra || {}).nota)}" data-act="ra" placeholder="0-10"></label></div>
        ${i.pitch ? `<div class="lg-pitch"><b>Como abordar:</b> ${esc(i.pitch)}</div>` : ''}
        <div class="lg-line lg-muted">${esc(i.address || '')}</div>
        ${i.outcome ? `<div class="lg-line lg-muted">Último contato: ${esc(i.outcome.label)}${i.outcome.note ? ' — ' + esc(i.outcome.note) : ''}</div>` : ''}
        <div class="lg-line lg-outcome"><select data-act="result"><option value="">Registrar resultado do contato...</option>${OUTCOMES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <input data-act="note" placeholder="Observação (opcional)"><button class="btn-primary btn-sm" data-act="save">Salvar e subir ao pipeline</button>
          <button class="btn-secondary btn-sm" data-act="discard" title="Tirar da lista">Descartar</button></div>
      </div></div>`;
  }

  function renderList() {
    const rows = filtered(); $('lg-count').textContent = `(${rows.length} de ${S.items.length})`;
    if (!rows.length) { $('lg-list').innerHTML = '<p class="lg-muted" style="padding:14px">Nenhum lead com esses filtros. Gere novos leads acima ou afrouxe os filtros.</p>'; return; }
    $('lg-list').innerHTML = rows.slice(0, S.shown).map(card).join('') + (rows.length > S.shown ? `<button class="btn-secondary" id="lg-more" style="margin:12px auto;display:block">Mostrar mais (${rows.length - S.shown})</button>` : '');
    const m = $('lg-more'); if (m) m.addEventListener('click', () => { S.shown += 40; renderList(); });
  }

  async function onListClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const root = b.closest('.lg-lead'); const id = root.dataset.id;
    if (b.dataset.act === 'discard') {
      try { await call(`/api/leadgen/items/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'descartado' }) }); refresh(); } catch (er) { window.showToast && window.showToast(er.message); }
    }
    if (b.dataset.act === 'save') {
      const result = root.querySelector('[data-act="result"]').value; const note = root.querySelector('[data-act="note"]').value;
      if (!result) { window.showToast && window.showToast('Escolha o resultado do contato.'); return; }
      b.disabled = true;
      try {
        const r = await call(`/api/leadgen/items/${id}/outcome`, { method: 'POST', body: JSON.stringify({ result, note, attendantId: attendant() }) });
        window.showToast && window.showToast(r.lost ? 'Registrado. Negócio criado e marcado como perdido.' : `Registrado. Negócio criado em "${r.stage}".`);
        refresh();
      } catch (er) { b.disabled = false; window.showToast && window.showToast(er.message); }
    }
  }

  async function onListChange(e) {
    if (e.target.dataset.act !== 'ra') return;
    const id = e.target.closest('.lg-lead').dataset.id;
    try { await call(`/api/leadgen/items/${id}`, { method: 'PUT', body: JSON.stringify({ ra: { nota: e.target.value, url: '' } }) }); window.showToast && window.showToast('Nota do Reclame Aqui salva. Pontuação atualizada.'); refresh(); } catch (er) { window.showToast && window.showToast(er.message); }
  }
})();
