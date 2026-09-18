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

async function init() {
  if (!useTurso) {
    cache = readSeedFile();
    return;
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS crm_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
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

function read() {
  if (!cache) cache = readSeedFile();
  return JSON.parse(JSON.stringify(cache));
}

function write(data) {
  cache = data;
  if (!useTurso) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return;
  }
  client
    .execute({
      sql: `INSERT INTO crm_data (id, data, updated_at) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(data), Date.now()]
    })
    .catch((err) => console.error('Falha ao persistir dados do CRM no Turso:', err.message));
}

module.exports = { init, read, write };
