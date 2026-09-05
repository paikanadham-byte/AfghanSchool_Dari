'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { get, all, insert, update, run, remove } = require('../db');
const U = require('../util');
const A = require('../auth');
const N = require('../notify');
const { ok, fail, wrap, q, upload, paginate, logAction } = require('../http');
const { UPLOAD_DIR } = require('../db');

const router = express.Router();
const LOC = ['title', 'body', 'subject', 'name'];

/** Is `user` allowed to see this announcement / calendar event? */
function inAudience(item, user) {
  const aud = U.J.parse(item.audience, {});
  if (A.moduleOf(user.role) !== (item.module || 'school')) return false;
  if (item.scope === 'org' || (!aud.userIds?.length && !aud.roles?.length && !aud.classIds?.length)) return true;
  if (aud.userIds?.includes(user.id)) return true;
  if (aud.roles?.includes(user.role)) return true;
  if (aud.classIds?.length) {
    if (user.role === 'student') {
      return all('SELECT class_id FROM enrollments WHERE student_id = ?', [user.id]).some((r) => aud.classIds.includes(r.class_id));
    }
    if (user.role === 'parent') {
      const kids = A.studentIdsForParent(user.id);
      return all(
        `SELECT class_id, student_id FROM enrollments WHERE student_id IN (${kids.map(() => '?').join(',') || "''"})`,
        kids
      ).some((r) => aud.classIds.includes(r.class_id));
    }
    if (user.role === 'teacher') {
      const mine = A.classIdsForTeacher(user.id);
      return aud.classIds.some((c) => mine.includes(c));
    }
  }
  return false;
}

const decorate = (row, lang) => {
  const out = { ...row };
  for (const f of LOC) {
    if (typeof out[f] === 'string') {
      const parsed = U.J.parse(out[f], null);
      if (parsed && typeof parsed === 'object') { out[f] = parsed; out[`${f}_text`] = parsed[lang] || parsed.fa || parsed.en || ''; }
    }
  }
  return out;
};

// ------------------------------------------------------------ dashboard -----
router.get('/dashboard', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view, org } = req.auth;
  const lang = q.str(req.query.lang, user.lang || 'fa');
  const module = A.moduleOf(view.role);
  const today = U.ymd();
  const unread = N.unreadCount(user.id);
  const announcements = all(
    `SELECT * FROM announcements WHERE org_id = ? AND module = ? AND (expires_at IS NULL OR expires_at >= ?) ORDER BY is_pinned DESC, published_at DESC LIMIT 12`,
    [user.org_id, module, today]
  ).filter((a) => inAudience(a, user)).slice(0, 8).map((a) => decorate(a, lang));

  const events = all(
    `SELECT * FROM calendar_events WHERE org_id = ? AND module = ? AND date >= ? ORDER BY date ASC LIMIT 10`,
    [user.org_id, module, today]
  ).filter((e) => inAudience(e, user)).map((e) => decorate(e, lang));

  return ok(res, {
    module,
    today: { iso: today, jalali: U.jalali(today, lang, { digits: true }), weekday: U.weekdayName(today, lang) },
    unread,
    announcements,
    events,
    org: { id: org?.id, type: org?.type, name: U.tr({ fa: org?.name_fa, ps: org?.name_ps, en: org?.name_en }, lang) }
  });
}));

// ---------------------------------------------------------- announcements ---
router.get('/announcements', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  const lang = q.str(req.query.lang, user.lang || 'fa');
  const rows = all(
    `SELECT a.*, (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS is_read
     FROM announcements a WHERE a.org_id = ? AND a.module = ? ORDER BY a.is_pinned DESC, a.published_at DESC LIMIT ?`,
    [user.id, user.org_id, q.str(req.query.module, A.moduleOf(user.role)), q.int(req.query.limit, 40)]
  ).filter((a) => inAudience(a, user)).map((a) => decorate(a, lang));
  return ok(res, { announcements: rows });
}));

router.post('/announcements', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (!['admin', 'principal', 'teacher', 'clinic_admin', 'doctor', 'receptionist'].includes(user.role)) return fail(res, 'forbidden', 403);
  const module = A.moduleOf(user.role);
  const title = req.body.title;
  const body = req.body.body;
  if (!title) return fail(res, 'title_required');
  const row = insert('announcements', {
    id: U.id('ann'),
    org_id: user.org_id,
    module,
    scope: q.str(req.body.scope, 'org'),
    audience: U.J.stringify(req.body.audience || {}),
    title: typeof title === 'string' ? title : U.J.stringify(title),
    body: U.J.stringify(body || {}),
    priority: q.str(req.body.priority, 'normal'),
    is_pinned: q.bool(req.body.pinned) ? 1 : 0,
    published_at: U.nowISO(),
    expires_at: req.body.expires_at || null,
    created_by: user.id,
    created_at: U.nowISO()
  });
  const audience = req.body.audience || {};
  const targets = N.audienceUserIds(user.org_id, {
    ...(audience.roles ? { roles: audience.roles } : {}),
    ...(audience.classIds ? { classIds: audience.classIds } : {}),
    ...(audience.userIds ? { userIds: audience.userIds } : {})
  }).filter((i) => i !== user.id);
  N.notify(targets, {
    org_id: user.org_id, module, kind: 'announcement', priority: row.priority,
    title: typeof title === 'string' ? title : U.J.stringify(title),
    body: U.J.stringify(body || {}),
    data: { announcementId: row.id }
  });
  logAction(req.auth, 'announcement_created', 'announcement', row.id, { scope: row.scope });
  return ok(res, { announcement: row }, 201);
}));

router.post('/announcements/:id/read', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  run('INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)', [req.params.id, req.auth.user.id, U.nowISO()]);
  return ok(res, { read: true });
}));

router.delete('/announcements/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const ann = get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!ann) return fail(res, 'not_found', 404);
  if (ann.created_by !== req.auth.user.id && !['admin', 'principal', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  remove('announcements', ann.id);
  logAction(req.auth, 'announcement_deleted', 'announcement', ann.id);
  return ok(res, { deleted: true });
}));

// -------------------------------------------------------------- calendar ----
router.get('/calendar', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  const lang = q.str(req.query.lang, user.lang || 'fa');
  const from = q.str(req.query.from, U.ymdPlus(-30));
  const to = q.str(req.query.to, U.ymdPlus(120));
  const rows = all(
    `SELECT * FROM calendar_events WHERE org_id = ? AND module = ? AND date BETWEEN ? AND ? ORDER BY date ASC LIMIT 300`,
    [user.org_id, q.str(req.query.module, A.moduleOf(user.role)), from, to]
  ).filter((e) => inAudience(e, user)).map((e) => decorate(e, lang));
  return ok(res, { events: rows });
}));

router.post('/calendar', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (!['admin', 'principal', 'clinic_admin', 'receptionist'].includes(user.role)) return fail(res, 'forbidden', 403);
  if (!req.body.date || !req.body.title) return fail(res, 'date_and_title_required');
  const row = insert('calendar_events', {
    id: U.id('evt'),
    org_id: user.org_id,
    module: q.str(req.body.module, A.moduleOf(user.role)),
    date: q.str(req.body.date).slice(0, 10),
    end_date: req.body.end_date || null,
    type: q.str(req.body.type, 'event'),
    title: typeof req.body.title === 'string' ? req.body.title : U.J.stringify(req.body.title),
    body: req.body.body ? (typeof req.body.body === 'string' ? req.body.body : U.J.stringify(req.body.body)) : null,
    audience: U.J.stringify(req.body.audience || {}),
    all_day: q.bool(req.body.all_day, true) ? 1 : 0,
    created_by: user.id,
    created_at: U.nowISO()
  });
  if (['holiday', 'vacation', 'exam'].includes(row.type)) {
    N.notifyAudience(user.org_id, req.body.audience || {}, {
      module: row.module, kind: 'calendar_event',
      title: U.ltext('رویداد تازه در تقویم', 'په کالنډر کې نوې پېښه', 'New calendar event'),
      body: row.title,
      data: { eventId: row.id }
    });
  }
  logAction(req.auth, 'calendar_event_created', 'calendar_event', row.id, { type: row.type });
  return ok(res, { event: row }, 201);
}));

router.delete('/calendar/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!['admin', 'principal', 'clinic_admin', 'receptionist'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  remove('calendar_events', req.params.id);
  return ok(res, { deleted: true });
}));

// ---------------------------------------------------------- notifications ---
router.get('/notifications', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const lang = q.str(req.query.lang, req.auth.user.lang || 'fa');
  const rows = N.listFor(req.auth.user.id, { limit: q.int(req.query.limit, 50), module: req.query.module || null })
    .map((n) => ({ ...decorate(n, lang), data: U.J.parse(n.data, {}) }));
  return ok(res, { notifications: rows, unread: N.unreadCount(req.auth.user.id) });
}));

router.post('/notifications/read', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  N.markRead(req.auth.user.id, req.body.ids || null);
  return ok(res, { read: true });
}));

// --------------------------------------------------------------- messages ---
router.get('/threads', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const me = req.auth.user.id;
  const rows = all(`SELECT * FROM threads WHERE participants LIKE ? ORDER BY last_message_at DESC LIMIT ?`, [`%${me}%`, q.int(req.query.limit, 40)]);
  const withMeta = rows.map((t) => {
    const participants = U.J.parse(t.participants, []);
    const last = get('SELECT body, created_at, sender_id FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1', [t.id]);
    const unread = get('SELECT COUNT(*) AS c FROM messages WHERE thread_id = ? AND sender_id != ? AND created_at > ?', [t.id, me, '1970-01-01']);
    const others = participants.filter((p) => p !== me).map((p) => {
      const u = get('SELECT id, name_fa, name_ps, name_en, role, avatar FROM users WHERE id = ?', [p]);
      return u ? { id: u.id, name: u.name_fa || u.name_en, role: u.role, avatar: u.avatar } : null;
    }).filter(Boolean);
    return { ...t, participants, others, last_message: last, unread_count: 0 };
  });
  return ok(res, { threads: withMeta });
}));

router.post('/threads', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const me = req.auth.user.id;
  const participants = [...new Set([me, ...(req.body.participants || [])])];
  if (participants.length < 2) return fail(res, 'participants_required');
  const thread = insert('threads', {
    id: U.id('thr'), org_id: req.auth.user.org_id, module: q.str(req.body.module, A.moduleOf(req.auth.user.role)),
    subject: q.str(req.body.subject), participants: U.J.stringify(participants),
    created_by: me, created_at: U.nowISO(), last_message_at: U.nowISO()
  });
  if (req.body.message) {
    insert('messages', { id: U.id('msg'), thread_id: thread.id, sender_id: me, body: q.str(req.body.message), created_at: U.nowISO() });
  }
  N.notify(participants.filter((p) => p !== me), {
    org_id: req.auth.user.org_id, module: thread.module, kind: 'message',
    title: U.ltext('پیام جدید', 'نوی پیغام', 'New message'),
    body: U.ltext(`${req.auth.user.name_fa}: ${q.str(req.body.message).slice(0, 80)}`, `${req.auth.user.name_fa}: ${q.str(req.body.message).slice(0, 80)}`, `${req.auth.user.name_en || req.auth.user.name_fa}: ${q.str(req.body.message).slice(0, 80)}`),
    data: { threadId: thread.id }
  });
  return ok(res, { thread }, 201);
}));

router.get('/threads/:id/messages', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const thread = get('SELECT * FROM threads WHERE id = ?', [req.params.id]);
  if (!thread || !(U.J.parse(thread.participants, []) || []).includes(req.auth.user.id)) return fail(res, 'forbidden', 403);
  const rows = all('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200', [thread.id])
    .map((m) => ({ ...m, attachments: U.J.parse(m.attachments, []), sender: get('SELECT id, name_fa, name_ps, name_en, role, avatar FROM users WHERE id = ?', [m.sender_id]) }));
  return ok(res, { thread, messages: rows });
}));

router.post('/threads/:id/messages', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const thread = get('SELECT * FROM threads WHERE id = ?', [req.params.id]);
  if (!thread) return fail(res, 'not_found', 404);
  const participants = U.J.parse(thread.participants, []) || [];
  if (!participants.includes(req.auth.user.id)) return fail(res, 'forbidden', 403);
  const body = q.str(req.body.body);
  if (!body) return fail(res, 'message_required');
  const msg = insert('messages', {
    id: U.id('msg'), thread_id: thread.id, sender_id: req.auth.user.id, body,
    attachments: U.J.stringify(req.body.attachments || []), created_at: U.nowISO()
  });
  update('threads', thread.id, { last_message_at: U.nowISO() });
  N.notify(participants.filter((p) => p !== req.auth.user.id), {
    org_id: req.auth.user.org_id, module: thread.module, kind: 'message',
    title: U.ltext('پیام جدید', 'نوی پیغام', 'New message'),
    body: U.ltext(body.slice(0, 120), body.slice(0, 120), body.slice(0, 120)),
    data: { threadId: thread.id }
  });
  return ok(res, { message: msg }, 201);
}));

// ------------------------------------------------------------------ files ---
router.post('/files', upload.single('file'), wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!req.file) return fail(res, 'file_required');
  const row = insert('attachments', {
    id: U.id('att'),
    org_id: req.auth.user.org_id,
    module: q.str(req.body.module, A.moduleOf(req.auth.user.role)),
    ref_type: q.str(req.body.ref_type, 'temp'),
    ref_id: q.str(req.body.ref_id, 'temp'),
    name: req.file.originalname, mime: req.file.mimetype, size: req.file.size,
    path: req.file.filename, uploaded_by: req.auth.user.id, created_at: U.nowISO()
  });
  return ok(res, { attachment: row }, 201);
}));

router.get('/files/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const att = get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
  if (!att) return fail(res, 'not_found', 404);
  if (att.org_id && att.org_id !== req.auth.user.org_id) return fail(res, 'forbidden', 403);
  const file = path.join(UPLOAD_DIR, path.basename(att.path));
  if (!fs.existsSync(file)) return fail(res, 'file_missing', 404);
  res.setHeader('Content-Type', att.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`);
  return res.sendFile(file);
}));

// ------------------------------------------------------------------ users ---
router.get('/users', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  // Any staff member may list colleagues inside their own organisation
  // (used for messaging, doctor pickers and admin screens).
  if (!['admin', 'principal', 'clinic_admin', 'teacher', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech'].includes(user.role)) {
    return fail(res, 'forbidden', 403);
  }
  const role = req.query.role;
  const rows = all(
    `SELECT id, username, role, name_fa, name_ps, name_en, phone, email, avatar, lang, is_active, created_at
     FROM users WHERE org_id = ? ${role ? 'AND role = ?' : ''} ORDER BY role, name_fa LIMIT 500`,
    role ? [user.org_id, role] : [user.org_id]
  );
  return ok(res, { users: rows });
}));

router.post('/users', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (!['admin', 'principal', 'clinic_admin'].includes(user.role)) return fail(res, 'forbidden', 403);
  const username = q.str(req.body.username).trim().toLowerCase();
  const password = q.str(req.body.password, 'secret123');
  if (!username) return fail(res, 'username_required');
  if (get('SELECT 1 AS x FROM users WHERE lower(username) = ?', [username])) return fail(res, 'username_taken');
  const { hash, salt } = U.hashPassword(password);
  const userId = U.id('usr');
  insert('users', {
    id: userId, org_id: user.org_id, role: q.str(req.body.role, 'student'), username, phone: q.str(req.body.phone),
    pass_hash: hash, pass_salt: salt,
    name_fa: q.str(req.body.name), name_ps: q.str(req.body.name), name_en: q.str(req.body.name_en || req.body.name),
    email: q.str(req.body.email), avatar: q.str(req.body.avatar, 'user'), lang: q.str(req.body.lang, 'fa'),
    prefs: '{}', is_active: 1, created_at: U.nowISO()
  });
  // school links
  if (req.body.class_id && req.body.role === 'student') {
    insert('enrollments', { id: U.id('enr'), class_id: req.body.class_id, student_id: userId, term_id: req.body.term_id || null, created_at: U.nowISO() });
  }
  if (req.body.parent_id && req.body.role === 'student') {
    insert('guardians', { id: U.id('grd'), parent_id: req.body.parent_id, student_id: userId, relation: q.str(req.body.relation, 'parent'), can_message: 1, created_at: U.nowISO() });
  }
  logAction(req.auth, 'user_created', 'user', userId, { role: req.body.role });
  return ok(res, { user: { id: userId, username } }, 201);
}));

router.post('/users/import', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!['admin', 'principal', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const rows = req.body.rows || [];
  const results = { created: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    try {
      const username = String(r.username || '').trim().toLowerCase();
      if (!username || get('SELECT 1 AS x FROM users WHERE lower(username) = ?', [username])) { results.skipped++; continue; }
      const { hash, salt } = U.hashPassword(String(r.password || 'secret123'));
      const userId = U.id('usr');
      insert('users', {
        id: userId, org_id: req.auth.user.org_id, role: r.role || 'student', username, phone: r.phone || null,
        pass_hash: hash, pass_salt: salt, name_fa: r.name || username, name_ps: r.name || username, name_en: r.name_en || r.name || username,
        avatar: r.avatar || 'user', lang: r.lang || 'fa', prefs: '{}', is_active: 1, created_at: U.nowISO()
      });
      if (r.class_id) insert('enrollments', { id: U.id('enr'), class_id: r.class_id, student_id: userId, term_id: null, created_at: U.nowISO() });
      if (r.parent_username) {
        const parent = get('SELECT id FROM users WHERE lower(username) = ?', [String(r.parent_username).toLowerCase()]);
        if (parent) insert('guardians', { id: U.id('grd'), parent_id: parent.id, student_id: userId, relation: r.relation || 'parent', can_message: 1, created_at: U.nowISO() });
      }
      results.created++;
    } catch (err) { results.errors.push(String(err.message)); }
  }
  logAction(req.auth, 'users_imported', 'user', null, results);
  return ok(res, results);
}));

router.get('/audit', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!['admin', 'principal', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const { limit, offset } = paginate(req, 100);
  const rows = all(
    `SELECT l.*, u.name_fa AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.org_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [req.auth.user.org_id, limit, offset]
  ).map((r) => ({ ...r, details: U.J.parse(r.details, {}) }));
  return ok(res, { logs: rows });
}));

// ----------------------------------------------------------------- search ---
router.get('/search', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  const term = `%${q.str(req.query.q).trim()}%`;
  if (term === '%%') return ok(res, { results: [] });
  const results = [];
  if (A.moduleOf(user.role) === 'school') {
    if (['teacher', 'admin', 'principal'].includes(user.role)) {
      all(`SELECT id, name_fa, name_ps, name_en, username FROM users WHERE org_id = ? AND role = 'student' AND (name_fa LIKE ? OR username LIKE ?) LIMIT 15`, [user.org_id, term, term])
        .forEach((u) => results.push({ type: 'student', id: u.id, label: u.name_fa, sub: u.username }));
    }
    all(`SELECT id, title FROM homework WHERE org_id = ? AND title LIKE ? LIMIT 10`, [user.org_id, term])
      .forEach((h) => results.push({ type: 'homework', id: h.id, label: U.tr(h.title, user.lang), sub: '' }));
    all(`SELECT id, title, grade, subject FROM library_books WHERE title LIKE ? LIMIT 10`, [term])
      .forEach((b) => results.push({ type: 'book', id: b.id, label: b.title, sub: b.subject || '' }));
  } else {
    all(`SELECT id, full_name, mrn FROM patients WHERE org_id = ? AND (full_name LIKE ? OR mrn LIKE ?) LIMIT 15`, [user.org_id, term, term])
      .forEach((p) => results.push({ type: 'patient', id: p.id, label: p.full_name, sub: p.mrn }));
  }
  return ok(res, { results });
}));

module.exports = router;
module.exports.inAudience = inAudience;
module.exports.decorate = decorate;
