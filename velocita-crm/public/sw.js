// Service worker do app Velocita (PWA): permite instalar no celular e receber
// notificações mesmo com o app fechado. Os dados do CRM sempre vêm da rede (nada
// sensível fica em cache); só a tela de "sem conexão" é guardada.
const OFFLINE_CACHE = 'velocita-offline-v1';
const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Velocita · sem conexão</title><body style="margin:0;font-family:system-ui,sans-serif;background:#1B2A4E;color:#fff;display:grid;place-items:center;height:100vh;text-align:center">
<div><img src="/img/icon-192.png" width="96" height="96" style="border-radius:20px"><h2>Sem conexão</h2><p style="opacity:.8">Verifique a internet e toque para tentar de novo.</p>
<button onclick="location.reload()" style="background:#F4821F;color:#1B2A4E;border:0;border-radius:10px;padding:12px 22px;font-weight:700">Tentar de novo</button></div></body>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.addAll(['/img/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Velocita Global', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Velocita Global', {
      body: data.body || '',
      icon: '/img/icon-192.png',
      badge: '/img/badge-72.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/app' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).pathname === '/app');
      if (open) {
        open.postMessage({ navigate: url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
