const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const path = require('path');

// Em produção: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN (banco gratuito em turso.tech).
// Sem essas variáveis, cai para um arquivo SQLite local (data.db nesta pasta) — útil só
// para desenvolvimento; em produção sem elas os dados voltam a não ser persistentes.
// Caminho absoluto (baseado em __dirname) para o arquivo sempre ficar aqui dentro,
// não importa de onde o processo Node foi iniciado (ex: montado por outro servidor).
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'data.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      created_by_admin INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      product TEXT NOT NULL,
      platform TEXT NOT NULL,
      ts INTEGER NOT NULL,
      result_json TEXT
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts)`);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `);
}

// Chave usada para assinar os tokens de login (JWT). Gerada uma vez e guardada no
// próprio banco, para sobreviver a reinícios/deploys sem exigir uma variável de
// ambiente extra do usuário.
let cachedJwtSecret = null;
async function getJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;
  const r = await client.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: ['jwt_secret'] });
  if (r.rows.length) {
    cachedJwtSecret = r.rows[0].value;
    return cachedJwtSecret;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  await client.execute({ sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['jwt_secret', secret] });
  cachedJwtSecret = secret;
  return cachedJwtSecret;
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passHash: row.pass_hash,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    createdByAdmin: !!row.created_by_admin
  };
}

async function findUserByUsername(username) {
  const r = await client.execute({
    sql: 'SELECT * FROM users WHERE lower(username) = lower(?) LIMIT 1',
    args: [username]
  });
  return rowToUser(r.rows[0]);
}

async function findUserByEmail(email) {
  const r = await client.execute({
    sql: 'SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1',
    args: [email]
  });
  return rowToUser(r.rows[0]);
}

async function findUserById(id) {
  const r = await client.execute({ sql: 'SELECT * FROM users WHERE id = ? LIMIT 1', args: [id] });
  return rowToUser(r.rows[0]);
}

async function countAdmins() {
  const r = await client.execute(`SELECT COUNT(*) as n FROM users WHERE role = 'admin'`);
  return Number(r.rows[0].n);
}

async function createUser({ email, username, passHash, role, status, createdByAdmin }) {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, email, username, pass_hash, role, status, created_at, created_by_admin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, email, username, passHash, role, status, createdAt, createdByAdmin ? 1 : 0]
  });
  return findUserById(id);
}

async function updateUserStatus(id, status) {
  await client.execute({ sql: 'UPDATE users SET status = ? WHERE id = ?', args: [status, id] });
}

async function updateUserRole(id, role) {
  await client.execute({ sql: 'UPDATE users SET role = ? WHERE id = ?', args: [role, id] });
}

async function deleteUser(id) {
  await client.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
}

// Atualiza "visto por último" — chamado a cada requisição autenticada, mas o próprio
// servidor evita chamar isso com frequência maior que ~30s por usuário (ver server.js).
async function touchLastSeen(id, ts) {
  await client.execute({ sql: 'UPDATE users SET last_seen_at = ? WHERE id = ?', args: [ts, id] });
}

// Afiliados e moderadores — a tabela gerenciável do painel admin (excluindo admins,
// que não aparecem nessa lista por segurança).
async function listAffiliates() {
  const r = await client.execute(`SELECT * FROM users WHERE role IN ('afiliado','moderador') ORDER BY created_at DESC`);
  return r.rows.map(rowToUser);
}

// Todos os usuários de qualquer papel — usado só para a planilha/exportação.
async function listAllUsers() {
  const r = await client.execute(`SELECT * FROM users ORDER BY created_at DESC`);
  return r.rows.map(rowToUser);
}

async function insertLog({ userId, username, product, platform, ts, result }) {
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO logs (id, user_id, username, product, platform, ts, result_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, username, product, platform, ts, JSON.stringify(result || null)]
  });
  return id;
}

function rowToLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    product: row.product,
    platform: row.platform,
    ts: row.ts,
    result: row.result_json ? JSON.parse(row.result_json) : null
  };
}

async function getUserHistory(userId, { q, limit } = {}) {
  let sql = 'SELECT * FROM logs WHERE user_id = ?';
  const args = [userId];
  if (q) {
    sql += ' AND lower(product) LIKE ?';
    args.push(`%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY ts DESC LIMIT ?';
  args.push(limit || 100);
  const r = await client.execute({ sql, args });
  return r.rows.map(rowToLog);
}

async function getAdminLogs({ q, userId, limit } = {}) {
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const args = [];
  if (userId) { sql += ' AND user_id = ?'; args.push(userId); }
  if (q) {
    sql += ' AND (lower(product) LIKE ? OR lower(username) LIKE ?)';
    args.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY ts DESC LIMIT ?';
  args.push(limit || 50);
  const r = await client.execute({ sql, args });
  return r.rows.map(rowToLog);
}

// Todos os logs de todos os afiliados dos últimos N dias — usado para montar o
// resumo/gráfico do admin. Dataset pequeno o suficiente (uso interno de time) para
// trazer tudo e agregar em memória, igual ao código anterior baseado em arquivo.
async function getRecentLogsForBI(sinceTs) {
  const r = await client.execute({
    sql: 'SELECT * FROM logs WHERE ts >= ? ORDER BY ts ASC',
    args: [sinceTs]
  });
  return r.rows.map(rowToLog);
}

async function countLogsForUser(userId) {
  const r = await client.execute({ sql: 'SELECT COUNT(*) as n FROM logs WHERE user_id = ?', args: [userId] });
  return Number(r.rows[0].n);
}

async function countAllLogs() {
  const r = await client.execute('SELECT COUNT(*) as n FROM logs');
  return Number(r.rows[0].n);
}

async function revokeToken(jti, expiresAt) {
  await client.execute({
    sql: 'INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)',
    args: [jti, expiresAt]
  });
}

async function isTokenRevoked(jti) {
  const r = await client.execute({ sql: 'SELECT 1 FROM revoked_tokens WHERE jti = ? LIMIT 1', args: [jti] });
  return r.rows.length > 0;
}

// Limpeza oportunista de tokens revogados já expirados (evita a tabela crescer para sempre).
async function cleanupExpiredRevocations() {
  await client.execute({ sql: 'DELETE FROM revoked_tokens WHERE expires_at < ?', args: [Date.now()] });
}

module.exports = {
  init, getJwtSecret,
  findUserByUsername, findUserByEmail, findUserById, countAdmins, createUser,
  updateUserStatus, updateUserRole, deleteUser, touchLastSeen, listAffiliates, listAllUsers,
  insertLog, getUserHistory, getAdminLogs, getRecentLogsForBI, countLogsForUser, countAllLogs,
  revokeToken, isTokenRevoked, cleanupExpiredRevocations
};
