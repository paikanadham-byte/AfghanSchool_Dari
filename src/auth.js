'use strict';
const { get, all, insert, update, run } = require('./db');
const U = require('./util');

const SCHOOL_ROLES = ['admin', 'principal', 'teacher', 'student', 'parent', 'librarian', 'counselor'];
const CLINIC_ROLES = ['clinic_admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech', 'patient'];
const ROLE_MODULE = Object.fromEntries([
  ...SCHOOL_ROLES.map((r) => [r, 'school']),
  ...CLINIC_ROLES.map((r) => [r, 'clinic'])
]);

const COOKIE = 'acs_session';
const SESSION_DAYS = 30;

function cookieHeader(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function setSessionCookie(res, token, days = SESSION_DAYS) {
  const maxAge = days * 24 * 60 * 60;
  // Behind an https proxy (or COOKIE_SECURE=1) the app may be embedded in an
  // iframe, where a Lax cookie is treated as third-party and dropped. Use
  // SameSite=None; Secure there so the session survives.
  const req = res.req;
  const viaHttps = Boolean(req) && (req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  const secure = viaHttps || String(process.env.COOKIE_SECURE || '0') === '1';
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', secure ? 'SameSite=None' : 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const value = parts.join('; ');
  if (existing) {
    const list = Array.isArray(existing) ? existing : [existing];
    res.setHeader('Set-Cookie', [...list, value]);
  } else {
    res.setHeader('Set-Cookie', value);
  }
}
function clearSessionCookie(res) {
  setSessionCookie(res, '', -1);
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return cookieHeader(req)[COOKIE] || null;
}

function createSession(userId, viewUserId = null, userAgent = '') {
  const token = U.randomToken(32);
  const created = U.nowISO();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  insert('sessions', {
    token, user_id: userId, view_user_id: viewUserId, created_at: created, expires_at: expires, user_agent: userAgent
  });
  return { token, expires_at: expires };
}

function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', [token]);
}

function loadSession(token) {
  if (!token) return null;
  const session = get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!session) return null;
  if (Date.parse(session.expires_at) < Date.now()) { run('DELETE FROM sessions WHERE token = ?', [token]); return null; }
  const user = get('SELECT * FROM users WHERE id = ? AND is_active = 1', [session.user_id]);
  if (!user) return null;
  let view = user;
  if (session.view_user_id && session.view_user_id !== user.id) {
    const target = get('SELECT * FROM users WHERE id = ? AND is_active = 1', [session.view_user_id]);
    if (target && target.org_id === user.org_id) view = target;
  }
  const org = get('SELECT * FROM orgs WHERE id = ?', [user.org_id]);
  return { token, session, user, view, org };
}

/** Attaches req.auth = { token, user, view, org, roles[] } when a valid session exists. */
function attach(req, res, next) {
  const token = readToken(req);
  const loaded = loadSession(token);
  req.auth = loaded || null;
  if (loaded) {
    update('users', loaded.user.id, { last_login: U.nowISO() });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ ok: false, error: 'auth_required' });
  return next();
}

/** Allow when the *real* account OR the account being viewed has one of the roles. */
function allow(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ ok: false, error: 'auth_required' });
    const { user, view } = req.auth;
    if (roles.includes(user.role) || roles.includes(view.role) || user.role === 'admin' && roles.includes('admin')) return next();
    return res.status(403).json({ ok: false, error: 'forbidden', need: roles });
  };
}

/** Allow only on the real (logged-in) role — used for actions a parent must not take for a child. */
function allowReal(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ ok: false, error: 'auth_required' });
    if (roles.includes(req.auth.user.role)) return next();
    return res.status(403).json({ ok: false, error: 'forbidden_real', need: roles });
  };
}

const moduleOf = (role) => ROLE_MODULE[role] || 'school';

// --------------------------------------------------------------- scopes -----
function studentIdsForParent(parentId) {
  return all('SELECT student_id FROM guardians WHERE parent_id = ?', [parentId]).map((r) => r.student_id);
}
function classIdsForTeacher(teacherId) {
  return all('SELECT DISTINCT class_id FROM teaching_assignments WHERE teacher_id = ?', [teacherId]).map((r) => r.class_id);
}
function classIdsForStudent(studentId, termId = null) {
  const rows = termId
    ? all('SELECT class_id FROM enrollments WHERE student_id = ? AND (term_id = ? OR term_id IS NULL)', [studentId, termId])
    : all('SELECT class_id FROM enrollments WHERE student_id = ?', [studentId]);
  return rows.map((r) => r.class_id);
}

/** Can this actor read data belonging to `studentId`? */
function canViewStudent(auth, studentId) {
  if (!auth) return false;
  const { user, view, org } = auth;
  if (user.id === studentId || view.id === studentId) return true;
  if (user.role === 'admin' || user.role === 'principal') return user.org_id === (org?.id ?? user.org_id);
  if (user.role === 'parent') return studentIdsForParent(user.id).includes(studentId);
  if (user.role === 'teacher') {
    const targetClasses = classIdsForStudent(studentId);
    const mine = classIdsForTeacher(user.id);
    return targetClasses.some((c) => mine.includes(c));
  }
  return false;
}

/** Guard middleware for /students/:id style routes. */
function requireStudentAccess(param = 'studentId') {
  return (req, res, next) => {
    const studentId = req.params[param] || req.query[param];
    if (!canViewStudent(req.auth, studentId)) {
      return res.status(403).json({ ok: false, error: 'not_your_student' });
    }
    return next();
  };
}

function canViewPatient(auth, patientId) {
  if (!auth) return false;
  const { user } = auth;
  const patient = get('SELECT * FROM patients WHERE id = ?', [patientId]);
  if (!patient) return false;
  if (patient.org_id !== user.org_id) return false;
  if (moduleOf(user.role) === 'clinic' && ['doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech', 'clinic_admin'].includes(user.role)) return true;
  if (patient.user_id === user.id) return true;
  const guardian = get('SELECT 1 AS ok FROM patient_guardians WHERE patient_id = ? AND user_id = ?', [patientId, user.id]);
  return Boolean(guardian);
}

function requirePatientAccess(param = 'patientId') {
  return (req, res, next) => {
    const patientId = req.params[param] || req.query[param] || req.body?.[param];
    if (!canViewPatient(req.auth, patientId)) return res.status(403).json({ ok: false, error: 'not_your_patient' });
    return next();
  };
}

/** The id whose data should be returned: normally the viewer, or the child a parent switched to. */
const actorId = (auth) => auth?.view?.id || auth?.user?.id;
const realId = (auth) => auth?.user?.id;

module.exports = {
  COOKIE, SCHOOL_ROLES, CLINIC_ROLES, ROLE_MODULE, moduleOf,
  attach, requireAuth, allow, allowReal,
  createSession, destroySession, loadSession, setSessionCookie, clearSessionCookie, readToken,
  canViewStudent, requireStudentAccess, canViewPatient, requirePatientAccess,
  studentIdsForParent, classIdsForTeacher, classIdsForStudent, actorId, realId
};
