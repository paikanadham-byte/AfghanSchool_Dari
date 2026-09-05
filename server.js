'use strict';
require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fse = require('fs-extra');

const { migrate, get, all } = require('./src/db');
const { attach } = require('./src/auth');
const { runReminders } = require('./src/notify');
const U = require('./src/util');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '::';   // '::' = dual stack (IPv6 + IPv4)

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
if (process.env.LOG_FORMAT !== 'none') app.use(morgan(process.env.LOG_FORMAT || 'tiny'));
app.use(attach);

// ------------------------------------------------------------ database ------
migrate();
const needsSeed = !get('SELECT 1 AS x FROM orgs LIMIT 1');
if (needsSeed) {
  console.log('[boot] empty database — seeding demo data…');
  require('./src/seed')();
}

// -------------------------------------------------------------- legacy ------
// The original prototype endpoints (books.json / quizzes.json) stay available.
const DATA_BOOKS = path.join(__dirname, 'books.json');
const DATA_QUIZZES = path.join(__dirname, 'quizzes.json');
async function readJson(p, fallback) {
  try { return await fse.readJson(p); } catch { return fallback; }
}
app.get('/api/books', async (req, res) => {
  const data = await readJson(DATA_BOOKS, { books: [] });
  const q = String(req.query.q || '').toLowerCase();
  const grade = req.query.grade;
  let books = data.books || [];
  if (q) books = books.filter((b) => String(b.title || '').toLowerCase().includes(q) || String(b.subject || '').toLowerCase().includes(q));
  if (grade) books = books.filter((b) => String(b.grade) === String(grade));
  res.json({ ok: true, books });
});
app.get('/api/quizzes', async (req, res) => {
  const data = await readJson(DATA_QUIZZES, { quizzes: [] });
  res.json({ ok: true, quizzes: data.quizzes || [] });
});

// ----------------------------------------------------------------- api ------
app.use('/api', require('./src/routes'));

// ---------------------------------------------------------------- static ----
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use('/legacy', express.static(path.join(PUBLIC_DIR, 'legacy')));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-store');
  }
}));

// SPA fallback — only for navigation requests, so missing assets still 404
app.get(/^\/(?!api).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();                       // .png, .js, .css …
  if (!String(req.headers.accept || '').includes('text/html')) return next();
  const file = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(file)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(file);
});

// --------------------------------------------------------------- errors -----
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'server_error' });
});

// ------------------------------------------------------------- reminders ----
const REMINDER_MS = Number(process.env.REMINDER_INTERVAL_MIN || 30) * 60000;
function tickReminders() {
  try {
    const created = runReminders();
    if (created) console.log(`[reminders] ${created} notification(s) created`);
  } catch (err) {
    console.warn('[reminders] failed', err.message);
  }
}
setTimeout(tickReminders, 15000);
setInterval(tickReminders, REMINDER_MS);

if (require.main === module) {
  const ready = () => {
    const orgs = all('SELECT id, type, name_en FROM orgs');
    console.log(`\n  Afghan Care & School running on http://localhost:${PORT}`);
    orgs.forEach((o) => console.log(`   • [${o.type}] ${o.name_en || o.id}`));
    console.log(`   • demo login: any seeded "demo.*" account, password: demo1234`);
    console.log(`   • AI tutor: ${process.env.OPENAI_API_KEY || process.env.AI_API_KEY ? 'LLM enabled' : 'offline engine (set OPENAI_API_KEY to upgrade)'}\n`);
  };
  // Prefer dual-stack; fall back to IPv4-only hosts where IPv6 is unavailable
  const server = app.listen(PORT, HOST, ready);
  server.on('error', (err) => {
    if (err && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL' || err.code === 'EINVAL')) {
      app.listen(PORT, '0.0.0.0', ready);
    } else { console.error(err); process.exit(1); }
  });
}

module.exports = app;
