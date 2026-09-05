'use strict';
const express = require('express');
const { get, all, insert, update, run, remove } = require('../db');
const U = require('../util');
const A = require('../auth');
const N = require('../notify');
const { ok, fail, wrap, q, logAction } = require('../http');

const router = express.Router();
const STAFF = ['clinic_admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech'];
const CLINICAL = ['doctor', 'nurse', 'clinic_admin'];

const j = (v, def) => (typeof v === 'string' ? U.J.parse(v, def) : (v === undefined || v === null ? def : v));
const isStaff = (auth) => STAFF.includes(auth.user.role);

/** A patient app-user may only touch records they are linked to. */
function assertPatientAccess(auth, patientId) {
  if (isStaff(auth)) return true;
  return A.canViewPatient(auth, patientId);
}

function nextMrn(orgId) {
  const count = get('SELECT COUNT(*) AS c FROM patients WHERE org_id = ?', [orgId]).c;
  const org = get('SELECT name_en FROM orgs WHERE id = ?', [orgId]);
  const prefix = (org?.name_en || 'CLINIC').split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'CL';
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// --------------------------------------------------------------- overview ---
router.get('/overview', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, org } = req.auth;
  const today = U.ymd();
  const base = { kind: user.role };

  if (user.role === 'patient') {
    const links = all(`SELECT p.* FROM patients p LEFT JOIN patient_guardians g ON g.patient_id = p.id
      WHERE p.org_id = ? AND (p.user_id = ? OR g.user_id = ?) GROUP BY p.id`, [user.org_id, user.id, user.id]);
    const patients = links.map((p) => {
      const token = get(`SELECT * FROM queue_tokens WHERE patient_id = ? AND date = ? AND status IN ('waiting','called') ORDER BY token_no LIMIT 1`, [p.id, today]);
      const waiting = get(`SELECT COUNT(*) AS c FROM queue_tokens WHERE date = ? AND org_id = ? AND status = 'waiting' AND token_no < ?`, [today, p.org_id, token?.token_no ?? 999999])?.c || 0;
      return {
        ...p,
        allergies: j(p.allergies, []), conditions: j(p.conditions, []),
        today_token: token, people_ahead: waiting,
        next_appointment: get(`SELECT * FROM appointments WHERE patient_id = ? AND date >= ? AND status = 'booked' ORDER BY date, time_slot LIMIT 1`, [p.id, today]),
        active_prescriptions: all(`SELECT * FROM prescriptions WHERE patient_id = ? AND status != 'dispensed' ORDER BY created_at DESC LIMIT 3`, [p.id]).map((r) => ({ ...r, items: j(r.items, []) })),
        due_vaccines: all(`SELECT * FROM vaccinations WHERE patient_id = ? AND given_date IS NULL ORDER BY due_date LIMIT 5`, [p.id])
      };
    });
    return ok(res, { overview: { ...base, patients } });
  }

  if (user.role === 'pharmacist' || user.role === 'clinic_admin') {
    const soon = U.ymdPlus(60);
    const lowStock = all('SELECT * FROM medications WHERE org_id = ? AND stock_qty <= reorder_level ORDER BY stock_qty ASC LIMIT 20', [user.org_id]);
    const expiring = all('SELECT * FROM medications WHERE org_id = ? AND expiry_date IS NOT NULL AND expiry_date <= ? ORDER BY expiry_date ASC LIMIT 20', [user.org_id, soon]);
    const pendingRx = all(`SELECT r.*, p.full_name FROM prescriptions r JOIN patients p ON p.id = r.patient_id WHERE r.org_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC LIMIT 20`, [user.org_id]).map((r) => ({ ...r, items: j(r.items, []) }));
    return ok(res, { overview: { ...base, low_stock: lowStock, expiring, pending_prescriptions: pendingRx } });
  }

  if (user.role === 'doctor') {
    const queue = all(
      `SELECT t.*, p.full_name, p.sex, p.dob FROM queue_tokens t JOIN patients p ON p.id = t.patient_id
       WHERE t.org_id = ? AND t.date = ? AND (t.doctor_id = ? OR t.doctor_id IS NULL) AND t.status IN ('waiting','called','in_consult')
       ORDER BY t.priority DESC, t.token_no ASC LIMIT 40`, [user.org_id, today, user.id]
    );
    return ok(res, {
      overview: {
        ...base,
        my_queue: queue,
        waiting: queue.filter((t) => t.status === 'waiting').length,
        appointments_today: all(`SELECT a.*, p.full_name FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.org_id = ? AND a.date = ? AND a.doctor_id = ? ORDER BY a.time_slot`, [user.org_id, today, user.id]),
        follow_ups: all(`SELECT e.*, p.full_name FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.org_id = ? AND e.doctor_id = ? AND e.follow_up_date IS NOT NULL AND e.follow_up_date <= ? ORDER BY e.follow_up_date LIMIT 20`, [user.org_id, user.id, U.ymdPlus(7)])
      }
    });
  }

  if (user.role === 'receptionist' || user.role === 'nurse') {
    const queue = all(
      `SELECT t.*, p.full_name, u.name_fa AS doctor_fa FROM queue_tokens t JOIN patients p ON p.id = t.patient_id
       LEFT JOIN users u ON u.id = t.doctor_id WHERE t.org_id = ? AND t.date = ? ORDER BY t.token_no DESC LIMIT 60`, [user.org_id, today]
    );
    return ok(res, {
      overview: {
        ...base,
        queue,
        stats: {
          waiting: queue.filter((t) => t.status === 'waiting').length,
          done: queue.filter((t) => t.status === 'done').length,
          issued: queue.length,
          avg_wait_min: queue.filter((t) => t.called_at).length
            ? Math.round(queue.filter((t) => t.called_at).reduce((a, t) => a + (Date.parse(t.called_at) - Date.parse(t.issued_at)), 0) / queue.filter((t) => t.called_at).length / 60000)
            : null
        },
        appointments: all(`SELECT a.*, p.full_name FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.org_id = ? AND a.date = ? ORDER BY a.time_slot`, [user.org_id, today]),
        departments: all('SELECT * FROM departments WHERE org_id = ?', [user.org_id])
      }
    });
  }

  // clinic_admin
  return ok(res, {
    overview: {
      ...base,
      counts: {
        patients: get('SELECT COUNT(*) AS c FROM patients WHERE org_id = ?', [user.org_id]).c,
        today_tokens: get('SELECT COUNT(*) AS c FROM queue_tokens WHERE org_id = ? AND date = ?', [user.org_id, today]).c,
        today_seen: get(`SELECT COUNT(*) AS c FROM queue_tokens WHERE org_id = ? AND date = ? AND status = 'done'`, [user.org_id, today]).c,
        appointments_today: get(`SELECT COUNT(*) AS c FROM appointments WHERE org_id = ? AND date = ?`, [user.org_id, today]).c,
        low_stock: get('SELECT COUNT(*) AS c FROM medications WHERE org_id = ? AND stock_qty <= reorder_level', [user.org_id]).c
      },
      departments: all('SELECT * FROM departments WHERE org_id = ?', [user.org_id]),
      recent_encounters: all(`SELECT e.*, p.full_name FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.org_id = ? ORDER BY e.created_at DESC LIMIT 10`, [user.org_id])
    }
  });
}));

// ------------------------------------------------------------------ queue ---
router.get('/queue', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const date = q.str(req.query.date, U.ymd());
  const rows = all(
    `SELECT t.*, p.full_name, p.mrn, p.sex, p.dob, u.name_fa AS doctor_fa
     FROM queue_tokens t JOIN patients p ON p.id = t.patient_id LEFT JOIN users u ON u.id = t.doctor_id
     WHERE t.org_id = ? AND t.date = ? ORDER BY t.priority DESC, t.token_no ASC`, [req.auth.user.org_id, date]
  );
  return ok(res, {
    queue: rows,
    stats: {
      waiting: rows.filter((r) => r.status === 'waiting').length,
      called: rows.filter((r) => r.status === 'called').length,
      in_consult: rows.filter((r) => r.status === 'in_consult').length,
      done: rows.filter((r) => r.status === 'done').length
    },
    now_serving: rows.filter((r) => ['called', 'in_consult'].includes(r.status)).map((r) => r.token_no)
  });
}));

router.post('/queue', wrap((req, res) => {
  if (!req.auth || !isStaff(req.auth)) return fail(res, 'forbidden', 403);
  const date = q.str(req.body.date, U.ymd());
  const patientId = q.str(req.body.patient_id);
  if (!patientId) return fail(res, 'patient_required');
  const patient = get('SELECT * FROM patients WHERE id = ? AND org_id = ?', [patientId, req.auth.user.org_id]);
  if (!patient) return fail(res, 'patient_not_found', 404);
  const existing = get('SELECT * FROM queue_tokens WHERE org_id = ? AND date = ? AND patient_id = ?', [req.auth.user.org_id, date, patientId]);
  if (existing) return ok(res, { token: existing, already: true });
  const maxNo = get('SELECT MAX(token_no) AS m FROM queue_tokens WHERE org_id = ? AND date = ?', [req.auth.user.org_id, date])?.m || 0;
  const row = insert('queue_tokens', {
    id: U.id('qtk'), org_id: req.auth.user.org_id, patient_id: patientId, doctor_id: req.body.doctor_id || null,
    department: q.str(req.body.department), date, token_no: maxNo + 1,
    priority: q.bool(req.body.priority) ? 1 : 0,
    status: 'waiting', issued_at: U.nowISO()
  });
  N.notify([patient.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [patientId]).map((r) => r.user_id)].filter(Boolean), {
    module: 'clinic', kind: 'token_issued',
    title: U.ltext('نوبت شما', 'ستاسو نوبت', 'Your queue token'),
    body: U.ltext(`نوبت شماره ${row.token_no}`, `د نوبت ګڼه ${row.token_no}`, `Token number ${row.token_no}`),
    data: { tokenId: row.id }
  });
  return ok(res, { token: row }, 201);
}));

router.patch('/queue/:id', wrap((req, res) => {
  if (!req.auth || !isStaff(req.auth)) return fail(res, 'forbidden', 403);
  const token = get('SELECT * FROM queue_tokens WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!token) return fail(res, 'not_found', 404);
  const status = q.str(req.body.status, token.status);
  const patch = { status };
  if (status === 'called' && !token.called_at) patch.called_at = U.nowISO();
  if (status === 'done') patch.done_at = U.nowISO();
  if (req.body.doctor_id) patch.doctor_id = req.body.doctor_id;
  const row = update('queue_tokens', token.id, patch);
  const patient = get('SELECT user_id FROM patients WHERE id = ?', [token.patient_id]);
  if (['called', 'done', 'skipped'].includes(status)) {
    N.notify([patient?.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [token.patient_id]).map((r) => r.user_id)].filter(Boolean), {
      module: 'clinic', kind: 'queue_update', priority: status === 'called' ? 'high' : 'normal',
      title: status === 'called'
        ? U.ltext('نوبت شما رسید', 'ستاسو نوبت راغی', 'You are being called')
        : U.ltext('به‌روزرسانی نوبت', 'د نوبت تازه والی', 'Queue update'),
      body: U.ltext(`نوبت ${token.token_no}: ${status}`, `نوبت ${token.token_no}: ${status}`, `Token ${token.token_no}: ${status}`),
      data: { tokenId: token.id }
    });
  }
  return ok(res, { token: row });
}));

// --------------------------------------------------------------- patients ---
router.get('/patients', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (!isStaff(req.auth)) {
    const rows = all(`SELECT p.* FROM patients p LEFT JOIN patient_guardians g ON g.patient_id = p.id
      WHERE p.org_id = ? AND (p.user_id = ? OR g.user_id = ?) GROUP BY p.id`, [user.org_id, user.id, user.id]);
    return ok(res, { patients: rows.map((p) => ({ ...p, allergies: j(p.allergies, []), conditions: j(p.conditions, []) })) });
  }
  const term = q.str(req.query.q).trim();
  const params = [user.org_id];
  let sql = 'SELECT * FROM patients WHERE org_id = ?';
  if (term) { sql += ' AND (full_name LIKE ? OR mrn LIKE ? OR phone LIKE ?)'; params.push(`%${term}%`, `%${term}%`, `%${term}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  return ok(res, { patients: all(sql, params).map((p) => ({ ...p, allergies: j(p.allergies, []), conditions: j(p.conditions, []) })) });
}));

router.post('/patients', wrap((req, res) => {
  if (!req.auth || !isStaff(req.auth)) return fail(res, 'forbidden', 403);
  const name = q.str(req.body.full_name);
  if (!name) return fail(res, 'name_required');
  const row = insert('patients', {
    id: U.id('pat'), org_id: req.auth.user.org_id, mrn: q.str(req.body.mrn) || nextMrn(req.auth.user.org_id),
    user_id: req.body.user_id || null, full_name: name, guardian_name: q.str(req.body.guardian_name),
    phone: q.str(req.body.phone), sex: q.str(req.body.sex), dob: req.body.dob || null, blood_group: q.str(req.body.blood_group),
    province: q.str(req.body.province), city: q.str(req.body.city), village: q.str(req.body.village),
    allergies: U.J.stringify(req.body.allergies || []), conditions: U.J.stringify(req.body.conditions || []),
    notes: q.str(req.body.notes), is_pregnant: q.bool(req.body.is_pregnant) ? 1 : 0, created_at: U.nowISO()
  });
  logAction(req.auth, 'patient_registered', 'patient', row.id, { mrn: row.mrn });
  return ok(res, { patient: { ...row, allergies: [], conditions: [] } }, 201);
}));

/** Full chart: encounters, prescriptions, labs, vaccines, appointments, tokens. */
router.get('/patients/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!assertPatientAccess(req.auth, req.params.id)) return fail(res, 'forbidden', 403);
  const patient = get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) return fail(res, 'not_found', 404);
  const encounters = all('SELECT * FROM encounters WHERE patient_id = ? ORDER BY date DESC LIMIT 30', [patient.id]).map((e) => ({ ...e, vitals: j(e.vitals, {}), attachments: j(e.attachments, []) }));
  const prescriptions = all('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY created_at DESC LIMIT 30', [patient.id]).map((r) => ({ ...r, items: j(r.items, []) }));
  const labs = all('SELECT * FROM lab_orders WHERE patient_id = ? ORDER BY created_at DESC LIMIT 30', [patient.id]);
  const vaccines = all('SELECT * FROM vaccinations WHERE patient_id = ? ORDER BY due_date, dose_no', [patient.id]);
  const appointments = all('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC LIMIT 20', [patient.id]);
  const pregnancy = get('SELECT * FROM pregnancies WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1', [patient.id]);
  return ok(res, {
    patient: { ...patient, allergies: j(patient.allergies, []), conditions: j(patient.conditions, []) },
    encounters, prescriptions, labs, vaccines, appointments,
    pregnancy: pregnancy ? { ...pregnancy, risk_flags: j(pregnancy.risk_flags, []), visits: j(pregnancy.visits, []), ...U.pregnancyFromLMP(pregnancy.lmp_date) } : null
  });
}));

router.patch('/patients/:id', wrap((req, res) => {
  if (!req.auth || !isStaff(req.auth)) return fail(res, 'forbidden', 403);
  const patient = get('SELECT * FROM patients WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!patient) return fail(res, 'not_found', 404);
  const patch = {};
  ['full_name', 'guardian_name', 'phone', 'sex', 'dob', 'blood_group', 'province', 'city', 'village', 'notes'].forEach((f) => {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  });
  if (req.body.allergies) patch.allergies = U.J.stringify(req.body.allergies);
  if (req.body.conditions) patch.conditions = U.J.stringify(req.body.conditions);
  if (req.body.is_pregnant !== undefined) patch.is_pregnant = q.bool(req.body.is_pregnant) ? 1 : 0;
  return ok(res, { patient: update('patients', patient.id, patch) });
}));

/** Link a patient record to an app login (self/family). */
router.post('/patients/:id/link', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const patient = get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) return fail(res, 'not_found', 404);
  const username = q.str(req.body.username).trim().toLowerCase();
  const target = get('SELECT id FROM users WHERE lower(username) = ?', [username]) || (isStaff(req.auth) ? get('SELECT id FROM users WHERE id = ?', [q.str(req.body.user_id)]) : null);
  if (!target) return fail(res, 'user_not_found', 404);
  insert('patient_guardians', { id: U.id('pg'), patient_id: patient.id, user_id: target.id, relation: q.str(req.body.relation, 'guardian'), created_at: U.nowISO() });
  if (!patient.user_id) update('patients', patient.id, { user_id: target.id });
  return ok(res, { linked: true });
}));

// ------------------------------------------------------------- encounters ---
router.post('/encounters', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const patientId = q.str(req.body.patient_id);
  if (!patientId) return fail(res, 'patient_required');
  const row = insert('encounters', {
    id: U.id('enc'), org_id: req.auth.user.org_id, patient_id: patientId,
    doctor_id: q.str(req.body.doctor_id, req.auth.user.id), date: q.str(req.body.date, U.nowISO()),
    complaints: q.str(req.body.complaints), history: q.str(req.body.history), exam: q.str(req.body.exam),
    diagnosis: q.str(req.body.diagnosis), plan: q.str(req.body.plan),
    vitals: U.J.stringify(req.body.vitals || {}), follow_up_date: req.body.follow_up_date || null,
    attachments: U.J.stringify(req.body.attachments || []), created_at: U.nowISO()
  });
  (req.body.attachments || []).forEach((aid) => run('UPDATE attachments SET ref_type = ?, ref_id = ? WHERE id = ?', ['encounter', row.id, aid]));
  logAction(req.auth, 'encounter_created', 'encounter', row.id, { patientId });
  return ok(res, { encounter: row }, 201);
}));

router.patch('/encounters/:id', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const enc = get('SELECT * FROM encounters WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!enc) return fail(res, 'not_found', 404);
  const patch = {};
  ['complaints', 'history', 'exam', 'diagnosis', 'plan', 'follow_up_date', 'date'].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
  if (req.body.vitals) patch.vitals = U.J.stringify({ ...j(enc.vitals, {}), ...req.body.vitals });
  const row = update('encounters', enc.id, patch);
  if (req.body.follow_up_date) {
    const patient = get('SELECT user_id FROM patients WHERE id = ?', [enc.patient_id]);
    N.notify([patient?.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [enc.patient_id]).map((r) => r.user_id)].filter(Boolean), {
      module: 'clinic', kind: 'followup_scheduled',
      title: U.ltext('مراجعهٔ بعدی', 'راتلونکې مراجعه', 'Follow-up scheduled'),
      body: U.ltext(`تاریخ مراجعهٔ بعدی: ${req.body.follow_up_date}`, `د راتلونکې مراجعې نېټه: ${req.body.follow_up_date}`, `Next visit: ${req.body.follow_up_date}`),
      data: { encounterId: enc.id }
    });
  }
  return ok(res, { encounter: row });
}));

// ---------------------------------------------------------- prescriptions ---
router.post('/prescriptions', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const items = req.body.items || [];
  if (!items.length) return fail(res, 'items_required');
  const patient = get('SELECT * FROM patients WHERE id = ?', [q.str(req.body.patient_id)]);
  if (!patient) return fail(res, 'patient_not_found', 404);
  const row = insert('prescriptions', {
    id: U.id('rx'), encounter_id: req.body.encounter_id || null, org_id: req.auth.user.org_id,
    patient_id: patient.id, doctor_id: req.auth.user.id, items: U.J.stringify(items),
    notes: q.str(req.body.notes), status: 'pending', created_at: U.nowISO()
  });
  N.notify(all(`SELECT id FROM users WHERE org_id = ? AND role = 'pharmacist'`, [req.auth.user.org_id]).map((r) => r.id), {
    module: 'clinic', kind: 'prescription_created',
    title: U.ltext('نسخهٔ جدید', 'نوې نسخه', 'New prescription'),
    body: U.ltext(`برای ${patient.full_name}`, `د ${patient.full_name} لپاره`, `For ${patient.full_name}`),
    data: { prescriptionId: row.id }
  });
  return ok(res, { prescription: { ...row, items } }, 201);
}));

router.get('/prescriptions', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  let rows;
  if (isStaff(req.auth)) {
    rows = all(`SELECT r.*, p.full_name, p.mrn FROM prescriptions r JOIN patients p ON p.id = r.patient_id WHERE r.org_id = ? ORDER BY r.created_at DESC LIMIT 60`, [user.org_id]);
  } else {
    rows = all(`SELECT r.*, p.full_name FROM prescriptions r JOIN patients p ON p.id = r.patient_id
      LEFT JOIN patient_guardians g ON g.patient_id = r.patient_id
      WHERE (r.patient_id IN (SELECT patient_id FROM patient_guardians WHERE user_id = ?) OR p.user_id = ?) ORDER BY r.created_at DESC LIMIT 30`, [user.id, user.id]);
  }
  return ok(res, { prescriptions: rows.map((r) => ({ ...r, items: j(r.items, []) })) });
}));

router.post('/prescriptions/:id/dispense', wrap((req, res) => {
  if (!req.auth || !['pharmacist', 'clinic_admin', 'nurse'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const rx = get('SELECT * FROM prescriptions WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!rx) return fail(res, 'not_found', 404);
  const items = j(rx.items, []);
  const warnings = [];
  if (q.bool(req.body.deduct_stock, true)) {
    for (const item of items) {
      const med = item.medication_id
        ? get('SELECT * FROM medications WHERE id = ?', [item.medication_id])
        : get('SELECT * FROM medications WHERE org_id = ? AND (lower(name) = ? OR lower(name) LIKE ?)', [req.auth.user.org_id, String(item.name || '').toLowerCase(), `%${String(item.name || '').toLowerCase()}%`]);
      if (!med) { warnings.push(`not_found:${item.name}`); continue; }
      const qty = Number(item.qty || 1);
      update('medications', med.id, { stock_qty: Math.max(0, med.stock_qty - qty), updated_at: U.nowISO() });
      insert('stock_movements', {
        id: U.id('stm'), org_id: req.auth.user.org_id, medication_id: med.id, change_qty: -qty,
        reason: 'dispensed', ref_type: 'prescription', ref_id: rx.id, user_id: req.auth.user.id, created_at: U.nowISO()
      });
      if (med.stock_qty - qty <= med.reorder_level) warnings.push(`low_stock:${med.name}`);
    }
  }
  const row = update('prescriptions', rx.id, {
    status: q.str(req.body.status, 'dispensed'), dispensed_by: req.auth.user.id, dispensed_at: U.nowISO()
  });
  return ok(res, { prescription: row, warnings });
}));

// ------------------------------------------------------------------- labs ---
router.post('/labs', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('lab_orders', {
    id: U.id('lab'), encounter_id: req.body.encounter_id || null, org_id: req.auth.user.org_id,
    patient_id: q.str(req.body.patient_id), test_name: q.str(req.body.test_name),
    status: 'ordered', notes: q.str(req.body.notes), ordered_by: req.auth.user.id, created_at: U.nowISO()
  });
  N.notify(all(`SELECT id FROM users WHERE org_id = ? AND role = 'lab_tech'`, [req.auth.user.org_id]).map((r) => r.id), {
    module: 'clinic', kind: 'lab_ordered',
    title: U.ltext('تست لابراتوار', 'د لابراتوار معاینه', 'Lab test ordered'),
    body: U.ltext(row.test_name, row.test_name, row.test_name),
    data: { labId: row.id }
  });
  return ok(res, { lab: row }, 201);
}));

router.patch('/labs/:id', wrap((req, res) => {
  if (!req.auth || !['lab_tech', 'doctor', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const lab = get('SELECT * FROM lab_orders WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!lab) return fail(res, 'not_found', 404);
  const patch = {};
  if (req.body.status) patch.status = q.str(req.body.status);
  if (req.body.result !== undefined) { patch.result = q.str(req.body.result); patch.status = 'resulted'; patch.resulted_at = U.nowISO(); }
  return ok(res, { lab: update('lab_orders', lab.id, patch) });
}));

// ---------------------------------------------------------- appointments ---
router.get('/appointments', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  const date = req.query.date;
  let rows;
  if (isStaff(req.auth)) {
    const params = [user.org_id];
    let sql = `SELECT a.*, p.full_name, p.mrn, p.phone, u.name_fa AS doctor_fa FROM appointments a
      JOIN patients p ON p.id = a.patient_id LEFT JOIN users u ON u.id = a.doctor_id WHERE a.org_id = ?`;
    if (date) { sql += ' AND a.date = ?'; params.push(date); }
    sql += ' ORDER BY a.date, a.time_slot LIMIT 200';
    rows = all(sql, params);
  } else {
    rows = all(`SELECT a.*, p.full_name, u.name_fa AS doctor_fa FROM appointments a
      JOIN patients p ON p.id = a.patient_id LEFT JOIN users u ON u.id = a.doctor_id
      LEFT JOIN patient_guardians g ON g.patient_id = a.patient_id
      WHERE (g.user_id = ? OR p.user_id = ?) ORDER BY a.date DESC LIMIT 30`, [user.id, user.id]);
  }
  return ok(res, { appointments: rows });
}));

router.post('/appointments', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  let patientId = q.str(req.body.patient_id);
  if (!isStaff(req.auth)) {
    const owned = get(`SELECT p.id FROM patients p LEFT JOIN patient_guardians g ON g.patient_id = p.id
      WHERE p.id = ? AND (p.user_id = ? OR g.user_id = ?) LIMIT 1`, [patientId, user.id, user.id]);
    if (!owned) return fail(res, 'not_your_patient', 403);
  }
  const patient = get('SELECT * FROM patients WHERE id = ?', [patientId]);
  if (!patient) return fail(res, 'patient_not_found', 404);
  const row = insert('appointments', {
    id: U.id('apt'), org_id: patient.org_id, patient_id: patientId, doctor_id: req.body.doctor_id || null,
    department: q.str(req.body.department), date: q.str(req.body.date, U.ymdPlus(1)),
    time_slot: q.str(req.body.time_slot), reason: q.str(req.body.reason),
    status: 'booked', created_by: user.id, created_at: U.nowISO()
  });
  N.notify([patient.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [patientId]).map((r) => r.user_id)].filter(Boolean), {
    module: 'clinic', kind: 'appointment_booked',
    title: U.ltext('ملاقات ثبت شد', 'ملاقات ثبت شو', 'Appointment booked'),
    body: U.ltext(`${row.date} — ${row.time_slot || ''}`, `${row.date} — ${row.time_slot || ''}`, `${row.date} — ${row.time_slot || ''}`),
    data: { appointmentId: row.id }
  });
  return ok(res, { appointment: row }, 201);
}));

router.patch('/appointments/:id', wrap((req, res) => {
  if (!req.auth || !isStaff(req.auth)) return fail(res, 'forbidden', 403);
  const appt = get('SELECT * FROM appointments WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!appt) return fail(res, 'not_found', 404);
  const patch = {};
  ['status', 'doctor_id', 'date', 'time_slot', 'department', 'reason'].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
  const row = update('appointments', appt.id, patch);
  if (patch.status === 'checked_in') {
    const maxNo = get('SELECT MAX(token_no) AS m FROM queue_tokens WHERE org_id = ? AND date = ?', [appt.org_id, U.ymd()])?.m || 0;
    insert('queue_tokens', {
      id: U.id('qtk'), org_id: appt.org_id, patient_id: appt.patient_id, doctor_id: appt.doctor_id,
      department: appt.department, date: U.ymd(), token_no: maxNo + 1, priority: 0, status: 'waiting', issued_at: U.nowISO()
    });
  }
  return ok(res, { appointment: row });
}));

// ------------------------------------------------------------ medications ---
router.get('/medications', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const soon = U.ymdPlus(90);
  const rows = all('SELECT * FROM medications WHERE org_id = ? ORDER BY name', [req.auth.user.org_id]);
  return ok(res, {
    medications: rows.map((m) => ({
      ...m,
      is_low: m.stock_qty <= m.reorder_level,
      expires_soon: Boolean(m.expiry_date && m.expiry_date <= soon),
      expired: Boolean(m.expiry_date && m.expiry_date < U.ymd())
    }))
  });
}));

router.post('/medications', wrap((req, res) => {
  if (!req.auth || !['pharmacist', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  if (!q.str(req.body.name)) return fail(res, 'name_required');
  const row = insert('medications', {
    id: U.id('med'), org_id: req.auth.user.org_id, name: q.str(req.body.name),
    name_fa: q.str(req.body.name_fa), name_ps: q.str(req.body.name_ps), generic: q.str(req.body.generic),
    form: q.str(req.body.form), strength: q.str(req.body.strength), unit: q.str(req.body.unit, 'unit'),
    stock_qty: q.num(req.body.stock_qty, 0), reorder_level: q.num(req.body.reorder_level, 10),
    batch_no: q.str(req.body.batch_no), expiry_date: req.body.expiry_date || null,
    storage: q.str(req.body.storage), created_at: U.nowISO(), updated_at: U.nowISO()
  });
  if (row.stock_qty > 0) {
    insert('stock_movements', { id: U.id('stm'), org_id: req.auth.user.org_id, medication_id: row.id, change_qty: row.stock_qty, reason: 'received', user_id: req.auth.user.id, created_at: U.nowISO() });
  }
  return ok(res, { medication: row }, 201);
}));

router.patch('/medications/:id', wrap((req, res) => {
  if (!req.auth || !['pharmacist', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const med = get('SELECT * FROM medications WHERE id = ? AND org_id = ?', [req.params.id, req.auth.user.org_id]);
  if (!med) return fail(res, 'not_found', 404);
  const patch = { updated_at: U.nowISO() };
  ['name', 'name_fa', 'name_ps', 'generic', 'form', 'strength', 'unit', 'reorder_level', 'batch_no', 'expiry_date', 'storage'].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
  if (req.body.stock_qty !== undefined) {
    const delta = q.num(req.body.stock_qty) - med.stock_qty;
    patch.stock_qty = q.num(req.body.stock_qty);
    insert('stock_movements', { id: U.id('stm'), org_id: req.auth.user.org_id, medication_id: med.id, change_qty: delta, reason: q.str(req.body.reason, 'adjusted'), user_id: req.auth.user.id, created_at: U.nowISO() });
  }
  return ok(res, { medication: update('medications', med.id, patch) });
}));

router.get('/stock-movements', wrap((req, res) => {
  if (!req.auth || !['pharmacist', 'clinic_admin'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  return ok(res, { movements: all(`SELECT s.*, m.name FROM stock_movements s JOIN medications m ON m.id = s.medication_id WHERE s.org_id = ? ORDER BY s.created_at DESC LIMIT 100`, [req.auth.user.org_id]) });
}));

// ----------------------------------------------------------- vaccinations ---
const EPI_SCHEDULE = [
  { vaccine: 'BCG', atBirth: true, doses: [0] },
  { vaccine: 'OPV / Polio', doses: [0, 42, 70, 98] },
  { vaccine: 'Pentavalent (DTP-HepB-Hib)', doses: [42, 70, 98] },
  { vaccine: 'PCV', doses: [42, 70, 98] },
  { vaccine: 'Rotavirus', doses: [42, 70] },
  { vaccine: 'IPV', doses: [98, 252] },
  { vaccine: 'Measles', doses: [270, 450] },
  { vaccine: 'TT (pregnancy)', doses: [] }
];

router.get('/vaccinations/:patientId', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!assertPatientAccess(req.auth, req.params.patientId)) return fail(res, 'forbidden', 403);
  const patient = get('SELECT * FROM patients WHERE id = ?', [req.params.patientId]);
  const given = all('SELECT * FROM vaccinations WHERE patient_id = ? ORDER BY due_date', [patient.id]);
  // build the schedule when the patient is a child with a date of birth
  let schedule = given;
  if (!given.length && patient.dob) {
    const birth = new Date(`${patient.dob}T00:00:00`);
    schedule = [];
    EPI_SCHEDULE.forEach((v) => {
      v.doses.forEach((days, i) => {
        schedule.push({
          id: `plan-${v.vaccine}-${i}`, vaccine: v.vaccine, dose_no: i + 1,
          due_date: U.ymd(new Date(birth.getTime() + days * U.DAY_MS)),
          given_date: null, planned: true
        });
      });
    });
  }
  return ok(res, { vaccinations: schedule, schedule_template: EPI_SCHEDULE });
}));

router.post('/vaccinations', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('vaccinations', {
    id: U.id('vac'), patient_id: q.str(req.body.patient_id), vaccine: q.str(req.body.vaccine),
    dose_no: q.int(req.body.dose_no, 1), due_date: req.body.due_date || null, given_date: req.body.given_date || null,
    batch_no: q.str(req.body.batch_no), given_by: req.auth.user.id, note: q.str(req.body.note), created_at: U.nowISO()
  });
  return ok(res, { vaccination: row }, 201);
}));

router.patch('/vaccinations/:id', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const vac = get('SELECT * FROM vaccinations WHERE id = ?', [req.params.id]);
  if (!vac) return fail(res, 'not_found', 404);
  const patch = {};
  if (req.body.given_date !== undefined) patch.given_date = req.body.given_date;
  if (req.body.due_date !== undefined) patch.due_date = req.body.due_date;
  if (req.body.batch_no !== undefined) patch.batch_no = req.body.batch_no;
  if (req.body.note !== undefined) patch.note = req.body.note;
  return ok(res, { vaccination: update('vaccinations', vac.id, patch) });
}));

// ------------------------------------------------------------ pregnancies ---
router.post('/pregnancies', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const lmp = q.str(req.body.lmp_date);
  if (!lmp) return fail(res, 'lmp_required');
  const calc = U.pregnancyFromLMP(lmp);
  const row = insert('pregnancies', {
    id: U.id('prg'), patient_id: q.str(req.body.patient_id), lmp_date: lmp, edd: calc.edd,
    risk_flags: U.J.stringify(req.body.risk_flags || []), visits: U.J.stringify(req.body.visits || []),
    created_at: U.nowISO()
  });
  const patient = get('SELECT * FROM patients WHERE id = ?', [row.patient_id]);
  if (patient) update('patients', patient.id, { is_pregnant: 1 });
  return ok(res, { pregnancy: { ...row, ...calc } }, 201);
}));

router.patch('/pregnancies/:id', wrap((req, res) => {
  if (!req.auth || !CLINICAL.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const preg = get('SELECT * FROM pregnancies WHERE id = ?', [req.params.id]);
  if (!preg) return fail(res, 'not_found', 404);
  const patch = {};
  if (req.body.risk_flags) patch.risk_flags = U.J.stringify(req.body.risk_flags);
  if (req.body.visits) patch.visits = U.J.stringify(req.body.visits);
  if (req.body.outcome) patch.outcome = q.str(req.body.outcome);
  return ok(res, { pregnancy: update('pregnancies', preg.id, patch) });
}));

// ---------------------------------------------------------- departments -----
router.get('/departments', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  return ok(res, { departments: all('SELECT * FROM departments WHERE org_id = ?', [req.auth.user.org_id]) });
}));

router.post('/departments', wrap((req, res) => {
  if (!req.auth || req.auth.user.role !== 'clinic_admin') return fail(res, 'forbidden', 403);
  const row = insert('departments', {
    id: U.id('dep'), org_id: req.auth.user.org_id, name_fa: q.str(req.body.name), name_ps: q.str(req.body.name_ps, q.str(req.body.name)),
    name_en: q.str(req.body.name_en, q.str(req.body.name)), code: q.str(req.body.code), created_at: U.nowISO()
  });
  return ok(res, { department: row }, 201);
}));

module.exports = router;
