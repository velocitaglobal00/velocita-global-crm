// Servidor local do site estático da Velocita (uso só para pré-visualizar).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]), port = Number(process.argv[3] || 4321);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript' };
http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p === '') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404, { 'Content-Type': 'text/plain' }); return s.end('nao encontrado'); }
    s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    s.end(d);
  });
}).listen(port, () => console.log(`Site Velocita em http://localhost:${port}`));
