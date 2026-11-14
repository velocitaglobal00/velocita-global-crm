// Service worker do portal Velocita Parcerias: recebe os avisos (vendas, chat, ordens, pagamentos, notas) e abre o portal ao tocar.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
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
