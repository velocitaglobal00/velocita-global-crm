const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// Em produção (Render): defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN (banco gratuito
// em turso.tech) para os dados sobreviverem a redeploys. O disco do Render free tier
// é apagado a cada deploy, então sem essas variáveis o db.json volta ao estado do
// último commit toda vez que o serviço reinicia.
// Pode reaproveitar o MESMO banco Turso já usado pelo Gerador de Roteiros — os dados
// ficam em tabelas separadas, sem conflito.
const DB_PATH = path.join(__dirname, 'db.json');
const FILES_DIR = path.join(__dirname, 'uploads');
const useTurso = !!process.env.TURSO_DATABASE_URL;

const client = useTurso
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined })
  : null;

// read()/write() continuam síncronos porque o server.js inteiro os chama assim
// (~60 rotas fazem `const data = db.read(); ...; db.write(data);` sem await).
// Por isso mantemos os dados completos em memória (cache) e persistimos no Turso
// de forma assíncrona, em segundo plano, a cada write().
let cache = null;

function readSeedFile() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initTurso() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS crm_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS crm_files (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  const result = await client.execute('SELECT data FROM crm_data WHERE id = 1');
  if (result.rows.length > 0) {
    cache = JSON.parse(result.rows[0].data);
  } else {
    // Primeiro boot com Turso configurado: usa o db.json do repositório como
    // semente inicial e já grava no banco para os próximos redeploys reaproveitarem.
    cache = readSeedFile();
    await client.execute({
      sql: 'INSERT INTO crm_data (id, data, updated_at) VALUES (1, ?, ?)',
      args: [JSON.stringify(cache), Date.now()]
    });
  }
}

// Com Turso, NUNCA cair para o db.json do repositório se o banco falhar no boot:
// o próximo write() gravaria os dados de exemplo por cima dos dados reais. Tenta
// algumas vezes e, se não der, deixa o erro subir para o servidor não subir.
async function init() {
  if (!useTurso) {
    cache = readSeedFile();
    fs.mkdirSync(FILES_DIR, { recursive: true });
    return;
  }
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await initTurso();
      return;
    } catch (err) {
      lastErr = err;
      console.error(`Turso indisponível no boot (tentativa ${attempt}/6): ${err.message}`);
      await sleep(Math.min(2000 * attempt, 10000));
    }
  }
  throw lastErr;
}

function read() {
  if (!cache) {
    if (useTurso) throw new Error('Banco de dados ainda não carregado');
    cache = readSeedFile();
  }
  return JSON.parse(JSON.stringify(cache));
}

// Leitura SEM cópia, só para rotas que apenas consultam (não alteram nem devolvem para write()).
// read() copia o banco inteiro a cada chamada; com muitos leads isso pesava bastante.
function view() {
  if (!cache) {
    if (useTurso) throw new Error('Banco de dados ainda não carregado');
    cache = readSeedFile();
  }
  return cache;
}

// Gravações no Turso: uma por vez e sempre a versão mais recente. Se várias
// chegarem enquanto uma está em andamento, só a última é enviada (as anteriores
// já estão contidas nela). Sem isso, duas gravações simultâneas podiam terminar
// fora de ordem e deixar no banco uma versão mais antiga dos dados.
let pendingJson = null;
let flushing = null;

function flushLoop() {
  if (flushing) return flushing;
  flushing = (async () => {
    let failures = 0;
    while (pendingJson !== null) {
      const json = pendingJson;
      pendingJson = null;
      try {
        await client.execute({
          sql: `INSERT INTO crm_data (id, data, updated_at) VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
          args: [json, Date.now()]
        });
        failures = 0;
      } catch (err) {
        failures++;
        console.error(`Falha ao persistir dados do CRM no Turso (tentativa ${failures}):`, err.message);
        // devolve para a fila, a menos que já exista uma versão mais nova esperando
        if (pendingJson === null) pendingJson = json;
        await sleep(Math.min(1000 * 2 ** failures, 30000));
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

function write(data) {
  cache = data;
  if (!useTurso) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return;
  }
  pendingJson = JSON.stringify(data);
  flushLoop();
}

// Espera as gravações pendentes terminarem (usado antes de o servidor desligar).
async function flush() {
  if (!useTurso) return;
  while (pendingJson !== null || flushing) await (flushing || flushLoop());
}

// ---------- Arquivos (fotos, áudios e anexos do Chat da Equipe) ----------
// Ficam fora do JSON principal: antes iam em base64 dentro dele, o que fazia cada
// leitura/gravação do CRM copiar megabytes de mídia e deixava tudo lento.
const safeId = (id) => /^[a-z0-9-]{4,64}$/i.test(id || '');

async function putFile(id, mime, buffer) {
  if (!safeId(id)) throw new Error('id de arquivo inválido');
  if (useTurso) {
    await client.execute({
      sql: 'INSERT OR REPLACE INTO crm_files (id, mime, data, created_at) VALUES (?, ?, ?, ?)',
      args: [id, mime, buffer, Date.now()]
    });
    return;
  }
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(FILES_DIR, id), buffer);
  fs.writeFileSync(path.join(FILES_DIR, id + '.mime'), mime);
}

async function getFile(id) {
  if (!safeId(id)) return null;
  if (useTurso) {
    const r = await client.execute({ sql: 'SELECT mime, data FROM crm_files WHERE id = ?', args: [id] });
    if (!r.rows.length) return null;
    const raw = r.rows[0].data;
    return { mime: String(r.rows[0].mime), buffer: Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw) };
  }
  const file = path.join(FILES_DIR, id);
  if (!fs.existsSync(file)) return null;
  const mimeFile = file + '.mime';
  return { mime: fs.existsSync(mimeFile) ? fs.readFileSync(mimeFile, 'utf-8') : 'application/octet-stream', buffer: fs.readFileSync(file) };
}

async function deleteFiles(ids) {
  const list = (ids || []).filter(safeId);
  if (!list.length) return;
  if (useTurso) {
    await client.execute({ sql: `DELETE FROM crm_files WHERE id IN (${list.map(() => '?').join(',')})`, args: list });
    return;
  }
  for (const id of list) {
    for (const f of [id, id + '.mime']) fs.rmSync(path.join(FILES_DIR, f), { force: true });
  }
}


// ---------- Backups diários ----------
// Um instantâneo por dia (horário de São Paulo), guardado por 30 dias: no Turso, numa tabela própria; sem Turso, em ./backups.
const BACKUP_KEEP = 30;
const BACKUP_DIR = path.join(__dirname, 'backups');
const dayBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

async function ensureBackupTable() {
  await client.execute('CREATE TABLE IF NOT EXISTS crm_backups (day TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)');
}
async function createBackup(day, { overwrite = false } = {}) {
  const key = day || dayBR(); const json = JSON.stringify(cache);
  if (useTurso) {
    await ensureBackupTable();
    if (overwrite) await client.execute({ sql: 'INSERT OR REPLACE INTO crm_backups (day, data, created_at) VALUES (?, ?, ?)', args: [key, json, Date.now()] });
    else await client.execute({ sql: 'INSERT OR IGNORE INTO crm_backups (day, data, created_at) VALUES (?, ?, ?)', args: [key, json, Date.now()] });
    await client.execute({ sql: 'DELETE FROM crm_backups WHERE day NOT IN (SELECT day FROM crm_backups ORDER BY day DESC LIMIT ?)', args: [BACKUP_KEEP] });
  } else {
    fs.mkdirSync(BACKUP_DIR, { recursive: true }); const f = path.join(BACKUP_DIR, `db-${key}.json`);
    if (overwrite || !fs.existsSync(f)) fs.writeFileSync(f, json, 'utf-8');
    const all = fs.readdirSync(BACKUP_DIR).filter((n) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
    all.slice(BACKUP_KEEP).forEach((n) => fs.rmSync(path.join(BACKUP_DIR, n), { force: true }));
  }
  return key;
}
async function listBackups() {
  if (useTurso) { await ensureBackupTable(); const r = await client.execute('SELECT day, length(data) AS size, created_at FROM crm_backups ORDER BY day DESC'); return r.rows.map((x) => ({ day: String(x.day), size: Number(x.size), createdAt: Number(x.created_at) })); }
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((n) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().map((n) => { const st = fs.statSync(path.join(BACKUP_DIR, n)); return { day: n.slice(3, 13), size: st.size, createdAt: st.mtimeMs }; });
}
async function getBackup(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (useTurso) { await ensureBackupTable(); const r = await client.execute({ sql: 'SELECT data FROM crm_backups WHERE day = ?', args: [day] }); return r.rows.length ? String(r.rows[0].data) : null; }
  const f = path.join(BACKUP_DIR, `db-${day}.json`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null;
}
// Só o instantâneo de hoje, se ainda não existir (chamado ao ligar e a cada 30 minutos).
async function backupIfNeeded() { if (!cache) return null; return createBackup(dayBR()); }

module.exports = { backupIfNeeded, createBackup, listBackups, getBackup, init, read, view, write, flush, putFile, getFile, deleteFiles, useTurso };
