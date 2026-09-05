'use strict';
const express = require('express');
const { get, all, insert, update, run } = require('../db');
const U = require('../util');
const A = require('../auth');
const N = require('../notify');
const { ok, fail, wrap, q } = require('../http');

const router = express.Router();

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, org_id: user.org_id, role: user.role, username: user.username,
    name: user.name_fa || user.name_en || user.username,
    name_fa: user.name_fa, name_ps: user.name_ps, name_en: user.name_en,
    avatar: user.avatar, lang: user.lang, phone: user.phone, email: user.email,
    prefs: U.J.parse(user.prefs, {}), created_at: user.created_at
  };
}

function sessionPayload(auth, req) {
  const { user, view, org, token } = auth;
  const children = user.role === 'parent'
    ? all(
        `SELECT u.id, u.name_fa, u.name_ps, u.name_en, u.avatar, g.relation,
                (SELECT GROUP_CONCAT(c.grade || '-' || c.section) FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = u.id) AS class_label
         FROM guardians g JOIN users u ON u.id = g.student_id
         WHERE g.parent_id = ? ORDER BY u.name_fa`,
        [user.id]
      ).map((c) => ({ ...c, has_pin: Boolean(get('SELECT pin_hash AS p FROM guardians WHERE parent_id = ? AND student_id = ?', [user.id, c.id])?.p) }))
    : [];
  const linkedPatients = A.moduleOf(user.role) === 'clinic'
    ? all(`SELECT p.id, p.full_name, p.mrn, pg.relation FROM patient_guardians pg JOIN patients p ON p.id = pg.patient_id WHERE pg.user_id = ?`, [user.id])
    : [];
  return {
    ok: true,
    token,
    user: publicUser(user),
    view: publicUser(view),
    is_viewing_child: view.id !== user.id,
    org: org ? { id: org.id, type: org.type, name_fa: org.name_fa, name_ps: org.name_ps, name_en: org.name_en, city: org.city, province: org.province, settings: U.J.parse(org.settings, {}) } : null,
    module: A.moduleOf(view.role),
    children,
    linked_patients: linkedPatients,
    unread: {
      total: N.unreadCount(user.id),
      school: N.unreadCount(user.id, 'school'),
      clinic: N.unreadCount(user.id, 'clinic')
    },
    server_time: U.nowISO()
  };
}

// ------------------------------------------------------------------ login ---
router.post('/login', wrap((req, res) => {
  const username = q.str(req.body.username).trim().toLowerCase();
  const password = q.str(req.body.password);
  if (!username || !password) return fail(res, 'username_password_required');
  const user = get('SELECT * FROM users WHERE lower(username) = ? OR phone = ?', [username, username]);
  if (!user || !U.verifyPassword(password, user.pass_salt, user.pass_hash)) return fail(res, 'bad_credentials', 401);
  if (!user.is_active) return fail(res, 'account_disabled', 403);
  const session = A.createSession(user.id, null, q.str(req.headers['user-agent']));
  A.setSessionCookie(res, session.token);
  update('users', user.id, { last_login: U.nowISO() });
  const auth = A.loadSession(session.token);
  return ok(res, sessionPayload(auth, req));
}));

router.post('/logout', wrap((req, res) => {
  if (req.auth) A.destroySession(req.auth.token);
  A.clearSessionCookie(res);
  return ok(res, { logged_out: true });
}));

router.get('/me', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  return ok(res, sessionPayload(req.auth, req));
}));

// ----------------------------------------------------- parent ⇄ child view --
router.post('/switch-view', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  const targetId = q.str(req.body.userId || req.body.studentId);
  const pin = q.str(req.body.pin);
  if (user.role !== 'parent') return fail(res, 'only_parents_can_switch', 403);
  const link = get('SELECT * FROM guardians WHERE parent_id = ? AND student_id = ?', [user.id, targetId]);
  if (!link) return fail(res, 'not_your_child', 403);
  if (link.pin_hash) {
    const calc = U.hashPassword(pin, link.pin_hash.split(':')[0]).hash;
    if (calc !== link.pin_hash.split(':')[1]) return fail(res, 'wrong_pin', 403);
  }
  run('UPDATE sessions SET view_user_id = ? WHERE token = ?', [targetId, req.auth.token]);
  return ok(res, sessionPayload(A.loadSession(req.auth.token), req));
}));

router.post('/clear-view', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  run('UPDATE sessions SET view_user_id = NULL WHERE token = ?', [req.auth.token]);
  return ok(res, sessionPayload(A.loadSession(req.auth.token), req));
}));

/** Parent sets (or clears) a PIN required to open their child's account. */
router.post('/child-pin', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (user.role !== 'parent') return fail(res, 'only_parents', 403);
  const studentId = q.str(req.body.studentId);
  const pin = q.str(req.body.pin);
  const link = get('SELECT * FROM guardians WHERE parent_id = ? AND student_id = ?', [user.id, studentId]);
  if (!link) return fail(res, 'not_your_child', 403);
  const { hash: pinHashValue, salt: pinSalt } = pin ? U.hashPassword(pin) : { hash: null, salt: null };
  const pinHash = pin ? `${pinSalt}:${pinHashValue}` : null;
  update('guardians', link.id, { pin_hash: pinHash || '' });
  N.audit(req.auth, 'child_pin_set', 'guardian', link.id, { studentId, set: Boolean(pin) });
  return ok(res, { has_pin: Boolean(pin) });
}));

// -------------------------------------------------------------- preferences --
router.post('/language', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const lang = ['fa', 'ps', 'en'].includes(q.str(req.body.lang)) ? q.str(req.body.lang) : 'fa';
  update('users', req.auth.user.id, { lang });
  return ok(res, { lang });
}));

router.post('/prefs', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const current = U.J.parse(req.auth.user.prefs, {});
  const prefs = { ...current, ...(req.body.prefs || {}) };
  update('users', req.auth.user.id, { prefs: U.J.stringify(prefs) });
  return ok(res, { prefs });
}));

router.post('/password', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (!U.verifyPassword(q.str(req.body.current), user.pass_salt, user.pass_hash)) return fail(res, 'wrong_password', 403);
  const next = q.str(req.body.next);
  if (next.length < 6) return fail(res, 'password_too_short');
  const { hash, salt } = U.hashPassword(next);
  update('users', user.id, { pass_hash: hash, pass_salt: salt });
  N.audit(req.auth, 'password_changed', 'user', user.id);
  return ok(res, { changed: true });
}));

// --------------------------------------------------------- self registration -
/** A patient (or parent of a patient) creates their own clinic login. */
router.post('/self-register', wrap((req, res) => {
  const orgId = q.str(req.body.orgId);
  const org = get('SELECT * FROM orgs WHERE id = ? AND type = \'clinic\'', [orgId]);
  if (!org) return fail(res, 'unknown_clinic');
  const username = q.str(req.body.username).trim().toLowerCase();
  const password = q.str(req.body.password);
  const phone = q.str(req.body.phone).trim();
  if (!username || password.length < 6) return fail(res, 'username_password_required');
  if (get('SELECT 1 AS x FROM users WHERE lower(username) = ?', [username])) return fail(res, 'username_taken');
  const { hash, salt } = U.hashPassword(password);
  const userId = U.id('usr');
  insert('users', {
    id: userId, org_id: orgId, role: 'patient', username, phone, pass_hash: hash, pass_salt: salt,
    name_fa: q.str(req.body.name), name_ps: q.str(req.body.name), name_en: q.str(req.body.name),
    lang: q.str(req.body.lang, 'fa'), prefs: '{}', is_active: 1, created_at: U.nowISO()
  });
  // link to an existing patient record when MRN + phone match
  const patient = get('SELECT * FROM patients WHERE org_id = ? AND mrn = ? AND phone = ?', [orgId, q.str(req.body.mrn), phone])
    || get('SELECT * FROM patients WHERE org_id = ? AND phone = ?', [orgId, phone]);
  if (patient) {
    insert('patient_guardians', { id: U.id('pg'), patient_id: patient.id, user_id: userId, relation: 'self', created_at: U.nowISO() });
    update('patients', patient.id, { user_id: patient.user_id || userId });
  }
  const session = A.createSession(userId, null, q.str(req.headers['user-agent']));
  A.setSessionCookie(res, session.token);
  N.notify(all(`SELECT id FROM users WHERE org_id = ? AND role IN ('receptionist','clinic_admin')`, [orgId]).map((r) => r.id), {
    module: 'clinic', kind: 'new_patient_login',
    title: U.ltext('مریض جدید در اپ ثبت شد', 'نوی ناروغ په اپ کې ثبت شو', 'New patient registered in the app'),
    body: U.ltext(`${username} حساب ساخت.`, `${username} حساب جوړ کړ.`, `${username} created an account.`),
    data: { userId }
  });
  return ok(res, sessionPayload(A.loadSession(session.token), req), 201);
}));

// --------------------------------------------------------- demo accounts ----
router.get('/demo', wrap((req, res) => {
  const rows = all(
    `SELECT u.username, u.role, u.name_fa, u.name_en, o.type, o.name_fa AS org_fa, o.name_en AS org_en
     FROM users u JOIN orgs o ON o.id = u.org_id
     WHERE u.username LIKE 'demo.%' ORDER BY o.type, u.role, u.username`
  );
  return ok(res, { accounts: rows, password: 'demo1234', note: 'Seeded demo accounts for the preview build.' });
}));

router.post('/demo-login', wrap((req, res) => {
  const role = q.str(req.body.role, 'student');
  const user = get(`SELECT * FROM users WHERE username = ?`, [`demo.${role}`])
    || get(`SELECT * FROM users WHERE role = ? AND username LIKE 'demo.%'`, [role]);
  if (!user) return fail(res, 'no_demo_account', 404);
  const session = A.createSession(user.id, null, q.str(req.headers['user-agent']));
  A.setSessionCookie(res, session.token);
  return ok(res, sessionPayload(A.loadSession(session.token), req));
}));

module.exports = router;
