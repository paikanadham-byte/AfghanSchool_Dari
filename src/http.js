'use strict';
const multer = require('multer');
const path = require('node:path');
const U = require('./util');
const { run } = require('./db');
const { audit } = require('./notify');
const { UPLOAD_DIR } = require('./db');

function ok(res, data = {}, status = 200) { return res.status(status).json({ ok: true, ...data }); }
function fail(res, error, status = 400, extra = {}) { return res.status(status).json({ ok: false, error, ...extra }); }

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error('[api]', req.method, req.originalUrl, err.message);
  return fail(res, err.message || 'server_error', err.status || 500);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname || 'file').replace(/[^\w.\-ء-یګپڅچځژډړڼېۍ]/g, '_').slice(-60);
    cb(null, `${U.id('f')}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const bad = /\.(exe|bat|cmd|sh|apk|ipa|msi|dll)$/i.test(file.originalname || '');
    cb(bad ? new Error('file_type_not_allowed') : null, !bad);
  }
});

/** Common query helpers */
const q = {
  str: (v, def = '') => (v === undefined || v === null ? def : String(v)),
  int: (v, def = 0) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  },
  num: (v, def = 0) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : def;
  },
  bool: (v, def = false) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())),
  list: (v) => (Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean)),
  json: (v, def) => (typeof v === 'string' ? U.J.parse(v, def) : (v === undefined ? def : v))
};

const paginate = (req, defLimit = 100, maxLimit = 500) => ({
  limit: Math.min(maxLimit, q.int(req.query.limit, defLimit)),
  offset: Math.max(0, q.int(req.query.offset, 0))
});

function logAction(auth, action, entity, entityId, details) {
  audit(auth, action, entity, entityId, details);
}

module.exports = { ok, fail, wrap, upload, q, paginate, logAction, audit };
