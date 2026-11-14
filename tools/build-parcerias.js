#!/usr/bin/env node
/* Monta o pacote ESTÁTICO do portal de parcerias, para hospedar fora do CRM (Cloudflare Pages, Netlify, GitHub Pages...).
   A tela fica numa hospedagem que nunca dorme; os dados, o login e o chat continuam vindo da API do CRM.
   Uso:  node tools/build-parcerias.js [endereço-da-API]      (padrão: https://crm.velocitaglobal.com.br)
   Resultado: pasta dist-parcerias/ pronta para publicar (arraste a pasta inteira na hospedagem). */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist-parcerias');
const API = String(process.argv[2] || 'https://crm.velocitaglobal.com.br').replace(/\/$/, '');

const copy = (rel) => { const from = path.join(PUB, rel); const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// arquivos que o portal usa (imagens, estilos, scripts, ícones)
['parcerias/p.css', 'parcerias/p.js', 'parcerias/sw.js', 'parcerias/icons', 'css/style.css', 'css/tema-v2.css', 'js/vg-sound.js', 'img/logo.webp', 'img/mascot/01_neutro.png'].forEach(copy);

// página inicial: o manifesto fica na raiz e o config.js (endereço da API) carrega antes do portal
const html = fs.readFileSync(path.join(PUB, 'parcerias', 'index.html'), 'utf8')
  .replace('/parcerias/manifest.webmanifest', '/manifest.webmanifest')
  .replace('<script src="/js/vg-sound.js"></script>', '<script src="/config.js"></script>\n  <script src="/js/vg-sound.js"></script>');
if (!html.includes('/config.js')) throw new Error('Não achei onde inserir o config.js no index.html do portal.');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'parcerias', 'index.html'), html);

fs.writeFileSync(path.join(OUT, 'config.js'), `// Endereço da API do CRM usada por esta tela do portal.\nwindow.VG_API_BASE = ${JSON.stringify(API)};\n`);
fs.copyFileSync(path.join(PUB, 'parcerias', 'sw.js'), path.join(OUT, 'sw.js')); // service worker na raiz (avisos e abertura instantânea)
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Velocita Parcerias', short_name: 'Parcerias', description: 'Portal do parceiro Velocita Global', id: '/', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#141515', theme_color: '#141515', lang: 'pt-BR',
  icons: [{ src: '/parcerias/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/parcerias/icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/parcerias/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
}, null, 2));
// cabeçalhos (Cloudflare Pages e Netlify leem este arquivo): service worker e config sempre atualizados; sem indexação
fs.writeFileSync(path.join(OUT, '_headers'), ['/sw.js', '  Cache-Control: no-cache', '  Service-Worker-Allowed: /', '/config.js', '  Cache-Control: no-cache', '/*', '  X-Content-Type-Options: nosniff', '  X-Robots-Tag: noindex, nofollow', '  Referrer-Policy: strict-origin-when-cross-origin', ''].join('\n'));
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(OUT, 'LEIA-ME.txt'), `Portal de Parcerias da Velocita Global (versão estática)\nAPI usada: ${API}\n\nPublique ESTA PASTA INTEIRA em Cloudflare Pages ou Netlify e aponte parcerias.velocitaglobal.com.br para ela.\nNo CRM (Render), defina a variável PARTNER_PORTAL_URL com o endereço da tela (ex.: https://parcerias.velocitaglobal.com.br).\n`);

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`Pacote pronto em ${OUT}\nArquivos: ${count(OUT)} · API: ${API}`);
