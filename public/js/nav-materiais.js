/* Menu em grupos (abre/fecha, lembra a escolha, rola até o item ativo) + aba "Materiais e Preços". */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- grupos do menu ----------
  const KEY = 'vg_nav_closed';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* sem armazenamento */ } };
  function setGroup(g, open) {
    g.classList.toggle('closed', !open);
    g.querySelector('.nav-group-head').setAttribute('aria-expanded', String(open));
    const closed = [...document.querySelectorAll('.nav-group.closed')].map((x) => x.dataset.group); save(closed);
  }
  function revealActive() {
    const a = document.querySelector('.sidebar-link.active'); if (!a) return;
    const g = a.closest('.nav-group'); if (g && g.classList.contains('closed')) setGroup(g, true);
    a.scrollIntoView({ block: 'nearest' });
  }
  function initNav() {
    const closed = load();
    document.querySelectorAll('.nav-group').forEach((g) => {
      if (closed.includes(g.dataset.group)) { g.classList.add('closed'); g.querySelector('.nav-group-head').setAttribute('aria-expanded', 'false'); }
      g.querySelector('.nav-group-head').addEventListener('click', () => setGroup(g, g.classList.contains('closed')));
    });
    document.addEventListener('click', (e) => { if (e.target.closest('.sidebar-link[data-view]')) setTimeout(revealActive, 0); });
    window.addEventListener('hashchange', () => setTimeout(revealActive, 0));
    setTimeout(revealActive, 300);
  }

  // ---------- Materiais e Preços ----------
  const M = { data: null, tab: 'precos', dirty: false };
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);

  window.initMateriais = async function initMateriais() {
    if (!M.data) { try { M.data = await api('/api/materials'); } catch (e) { $('mt-root').innerHTML = `<p>Não foi possível carregar: ${esc(e.message)}</p>`; return; } }
    render();
  };

  function render() {
    const tabs = [['precos', 'Tabela de preços'], ['modelos', 'Modelos de mensagem'], ['drive', 'Drive e arquivos']];
    $('mt-root').innerHTML = `<div class="mt-tabs" role="tablist">${tabs.map(([k, v]) => `<button class="mt-tab" role="tab" aria-selected="${M.tab === k}" data-tab="${k}">${v}</button>`).join('')}</div><div id="mt-body"></div>`;
    $('mt-root').querySelectorAll('.mt-tab').forEach((b) => b.addEventListener('click', () => { collect(); M.tab = b.dataset.tab; render(); }));
    body();
  }

  function body() {
    const d = M.data; let h = '';
    if (M.tab === 'precos') {
      h = `<div class="mt-card"><h3>Tabela de preços</h3><p class="mt-note">Uso interno da equipe. Não divulgar valores em peças públicas, site ou redes sociais.</p>
        <div id="mt-list">${d.prices.map((p, i) => `<div class="mt-row" data-i="${i}"><input data-f="name" value="${esc(p.name)}" placeholder="Serviço"><input data-f="desc" value="${esc(p.desc)}" placeholder="O que inclui"><input data-f="value" value="${esc(p.value)}" placeholder="Valor"><button class="btn-secondary btn-sm" data-del="${i}" aria-label="Remover">Remover</button></div>`).join('')}</div>
        <div class="mt-actions"><button class="btn-secondary" id="mt-add">+ Adicionar linha</button><button class="btn-primary" id="mt-save">Salvar tabela</button></div></div>`;
    } else if (M.tab === 'modelos') {
      h = `<div class="mt-card"><h3>Modelos de mensagem</h3><p class="mt-note">Troque {nome}, {empresa} e {atendente} antes de enviar. Use "Copiar" e cole no WhatsApp ou no e-mail.</p>
        <div id="mt-list">${d.templates.map((t, i) => `<div class="mt-row t" data-i="${i}"><input data-f="title" value="${esc(t.title)}" placeholder="Título"><textarea data-f="text" placeholder="Mensagem">${esc(t.text)}</textarea><button class="btn-primary btn-sm" data-copy="${i}">Copiar</button><button class="btn-secondary btn-sm" data-del="${i}">Remover</button></div>`).join('')}</div>
        <div class="mt-actions"><button class="btn-secondary" id="mt-add">+ Novo modelo</button><button class="btn-primary" id="mt-save">Salvar modelos</button></div></div>`;
    } else {
      h = `<div class="mt-card"><h3>Drive e arquivos</h3><p class="mt-note">Atalhos para as pastas e documentos da empresa. O botão abre direto no Google Drive.</p>
        <div id="mt-list">${d.drive.map((x, i) => `<div class="mt-row d" data-i="${i}"><input data-f="title" value="${esc(x.title)}" placeholder="Nome"><input data-f="url" value="${esc(x.url)}" placeholder="https://drive.google.com/..."><a class="btn-primary btn-sm" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a><button class="btn-secondary btn-sm" data-del="${i}">Remover</button></div>`).join('')}</div>
        <div class="mt-actions"><button class="btn-secondary" id="mt-add">+ Adicionar atalho</button><button class="btn-primary" id="mt-save">Salvar atalhos</button></div></div>`;
    }
    $('mt-body').innerHTML = h;
    const key = { precos: 'prices', modelos: 'templates', drive: 'drive' }[M.tab];
    const blank = { precos: { name: '', desc: '', value: '' }, modelos: { title: '', text: '' }, drive: { title: '', url: '' } }[M.tab];
    $('mt-add').addEventListener('click', () => { collect(); M.data[key].push({ ...blank }); body(); });
    $('mt-save').addEventListener('click', async () => { collect(); try { M.data = await api('/api/materials', { method: 'PUT', body: JSON.stringify(M.data) }); toast('Salvo.'); body(); } catch (e) { toast(e.message); } });
    $('mt-body').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { collect(); M.data[key].splice(Number(b.dataset.del), 1); body(); }));
    $('mt-body').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      collect(); const t = M.data.templates[Number(b.dataset.copy)].text;
      try { await navigator.clipboard.writeText(t); toast('Mensagem copiada.'); } catch (e) { toast('Não foi possível copiar. Selecione o texto e copie.'); }
    }));
  }

  function collect() {
    const key = { precos: 'prices', modelos: 'templates', drive: 'drive' }[M.tab];
    document.querySelectorAll('#mt-list .mt-row').forEach((row) => {
      const i = Number(row.dataset.i); const item = M.data[key][i]; if (!item) return;
      row.querySelectorAll('[data-f]').forEach((el) => { item[el.dataset.f] = el.value; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNav); else initNav();
})();
