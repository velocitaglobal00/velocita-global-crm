// Service worker do portal Velocita Parcerias: recebe os avisos (vendas, chat, ordens, pagamentos, notas) e abre o portal ao tocar.
// A "casca" do portal (tela, estilos, scripts, ícones) fica guardada no aparelho: o app abre na hora com a tela da Velocita,
// mesmo que o servidor esteja dormindo (plano gratuito do Render leva até 1 minuto para acordar). Os dados (/api) sempre vêm da rede.
const SHELL = 'vgp-shell-v1';
const ASSETS = ['/parcerias/', '/config.js', '/parcerias/p.css', '/parcerias/p.js', '/css/style.css', '/css/tema-v2.css', '/js/vg-sound.js', '/parcerias/icons/icon-192.png', '/img/logo.webp', '/img/mascot/01_neutro.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/p/')) return;
  const isPage = req.mode === 'navigate' && (url.pathname === '/parcerias/' || url.pathname === '/');
  if (!isPage && !ASSETS.includes(url.pathname)) return;
  const key = isPage ? '/parcerias/' : url.pathname;
  event.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(isPage ? new Request('/parcerias/', { cache: 'no-cache' }) : req).then((r) => { if (r && r.ok) c.put(key, r.clone()); return r; }).catch(() => null); // atualiza em segundo plano
    if (hit) { event.waitUntil(net); return hit; }
    return (await net) || new Response('Sem conexão', { status: 503 });
  }));
});
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Velocita Parcerias', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Velocita Parcerias', {
      body: d.body || '',
      icon: '/parcerias/icons/icon-192.png',
      badge: '/parcerias/icons/badge-72.png',
      tag: d.tag,
      renotify: !!d.tag,
      vibrate: d.tone === 'alert' ? [420, 140, 420] : [90, 50, 90, 50, 200],
      silent: false,
      data: { url: d.url || '/parcerias/' }
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => ws.forEach((w) => w.postMessage({ type: 'vg-sound', tone: d.tone || 'ok' })))
  ]));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); const url = (event.notification.data && event.notification.data.url) || '/parcerias/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((w) => { const o = w.find((x) => /parcerias/i.test(x.url) || new URL(x.url).pathname === '/'); return o ? o.focus() : self.clients.openWindow(url); }));
});
