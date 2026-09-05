'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('\n[db] node:sqlite is unavailable. This app needs Node 22.5+ run with "npm start".\n');
  throw err;
}

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(DATA_DIR, 'app.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

// ------------------------------------------------------------- helpers ------
function normalise(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params.map(normalise)).map((r) => ({ ...r }));
}
function get(sql, params = []) {
  const row = db.prepare(sql).get(...params.map(normalise));
  return row ? { ...row } : null;
}
function run(sql, params = []) {
  const res = db.prepare(sql).run(...params.map(normalise));
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}
function exec(sql) { return db.exec(sql); }

function insert(table, values) {
  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  run(sql, cols.map((c) => values[c]));
  const row = get(`SELECT * FROM ${table} WHERE rowid = last_insert_rowid()`);
  return row;
}

function update(table, idValue, values, idColumn = 'id') {
  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  if (!cols.length) return get(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, [idValue]);
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${idColumn} = ?`;
  run(sql, [...cols.map((c) => values[c]), idValue]);
  return get(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, [idValue]);
}

function upsert(table, values, uniqueCols) {
  const existing = get(
    `SELECT * FROM ${table} WHERE ${uniqueCols.map((c) => `${c} = ?`).join(' AND ')}`,
    uniqueCols.map((c) => values[c])
  );
  if (existing) {
    const patch = { ...values };
    uniqueCols.forEach((c) => delete patch[c]);
    return update(table, existing.id, patch);
  }
  return insert(table, values);
}

function remove(table, idValue, idColumn = 'id') {
  return run(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [idValue]);
}

function count(sql, params = []) {
  const row = get(sql, params);
  return row ? Number(Object.values(row)[0]) : 0;
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

/** Expand localised JSON columns for API responses. */
function localise(row, fields, lang = 'fa') {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) {
    if (typeof out[f] === 'string' && (out[f].startsWith('{') || out[f].startsWith('['))) {
      let parsed = null;
      try { parsed = JSON.parse(out[f]); } catch { parsed = null; }
      if (parsed && typeof parsed === 'object') {
        out[f] = parsed;
        out[`${f}_text`] = parsed[lang] || parsed.fa || parsed.en || Object.values(parsed)[0] || '';
      }
    }
  }
  return out;
}

async function resetData() {
  await fsp.rm(DATA_DIR, { recursive: true, force: true });
}

module.exports = {
  db, migrate, all, get, run, exec, insert, update, upsert, remove, count, transaction, localise,
  DATA_DIR, UPLOAD_DIR, DB_PATH, ROOT
};
