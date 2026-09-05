'use strict';
const { all, get, insert, update, run } = require('./db');
const U = require('./util');

// ------------------------------------------------------------- dispatch -----
function notify(userIds, payload) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return [];
  const created = U.nowISO();
  const rows = [];
  for (const userId of ids) {
    const user = get('SELECT id, org_id FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) continue;
    rows.push(insert('notifications', {
      id: U.id('ntf'),
      org_id: payload.org_id || user.org_id,
      user_id: userId,
      module: payload.module || 'school',
      kind: payload.kind || 'general',
      title: typeof payload.title === 'string' ? payload.title : U.J.stringify(payload.title || {}),
      body: typeof payload.body === 'string' ? payload.body : U.J.stringify(payload.body || {}),
      data: U.J.stringify(payload.data || {}),
      priority: payload.priority || 'normal',
      created_at: created
    }));
  }
  return rows;
}

function audienceUserIds(orgId, audience = {}) {
  const clauses = ['org_id = ?', 'is_active = 1'];
  const params = [orgId];
  if (audience.roles?.length) {
    clauses.push(`role IN (${audience.roles.map(() => '?').join(',')})`);
    params.push(...audience.roles);
  }
  if (audience.classIds?.length) {
    const ids = all(
      `SELECT student_id FROM enrollments WHERE class_id IN (${audience.classIds.map(() => '?').join(',')})`,
      audience.classIds
    ).map((r) => r.student_id);
    if (!ids.length) return [];
    clauses.push(`id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (audience.userIds?.length) {
    clauses.push(`id IN (${audience.userIds.map(() => '?').join(',')})`);
    params.push(...audience.userIds);
  }
  return all(`SELECT id FROM users WHERE ${clauses.join(' AND ')}`, params).map((r) => r.id);
}

function notifyAudience(orgId, audience, payload) {
  return notify(audienceUserIds(orgId, audience), { ...payload, org_id: orgId });
}

/** Notify parents (and optionally the student) about something that happened to a student. */
function notifyParentsOf(studentIds, payload, { includeStudents = true } = {}) {
  const ids = new Set();
  for (const sid of [].concat(studentIds)) {
    if (includeStudents) ids.add(sid);
    all('SELECT parent_id FROM guardians WHERE student_id = ?', [sid]).forEach((r) => ids.add(r.parent_id));
  }
  if (!ids.size) return [];
  const student = get('SELECT id, org_id FROM users WHERE id = ?', [[].concat(studentIds)[0]]);
  return notify([...ids], { ...payload, org_id: payload.org_id || student?.org_id });
}

// ----------------------------------------------------------------- read -----
function listFor(userId, { limit = 50, module = null, unreadOnly = false } = {}) {
  const clauses = ['user_id = ?'];
  const params = [userId];
  if (module) { clauses.push('module = ?'); params.push(module); }
  if (unreadOnly) clauses.push('read_at IS NULL');
  return all(
    `SELECT * FROM notifications WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );
}
function unreadCount(userId, module = null) {
  return module
    ? get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND module = ? AND read_at IS NULL', [userId, module]).c
    : get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]).c;
}
function markRead(userId, ids) {
  const now = U.nowISO();
  if (!ids?.length) {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now, userId]);
    return { updated: true };
  }
  ids.forEach((nid) => run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', [now, nid, userId]));
  return { updated: true };
}

// ------------------------------------------------------------- reminders ----
/** Idempotent: one reminder per (kind, ref) per day. */
function alreadySent(kind, ref, day = U.ymd()) {
  return Boolean(get('SELECT 1 AS ok FROM notifications WHERE kind = ? AND data LIKE ? AND date(created_at) = ?', [kind, `%${ref}%`, day]));
}

function runReminders() {
  const today = U.ymd();
  const tomorrow = U.ymdPlus(1);
  const created = [];

  // 1. Homework due tomorrow / due today / overdue --------------------------
  const dueRows = all(
    `SELECT h.*, c.grade, c.section FROM homework h JOIN classes c ON c.id = h.class_id
     WHERE h.status = 'published' AND date(h.due_at) IN (?, ?)`,
    [today, tomorrow]
  );
  for (const hw of dueRows) {
    const isToday = hw.due_at.slice(0, 10) === today;
    const key = `${isToday ? 'hw_due_today' : 'hw_due_tomorrow'}:${hw.id}:${today}`;
    if (alreadySent('homework_due', hw.id, today)) continue;
    const title = hw.title;
    const enrolled = all('SELECT student_id FROM enrollments WHERE class_id = ?', [hw.class_id]).map((r) => r.student_id);
    const submitted = new Set(all('SELECT student_id FROM homework_submissions WHERE homework_id = ?', [hw.id]).map((r) => r.student_id));
    const pending = enrolled.filter((s) => !submitted.has(s));
    if (!pending.length) continue;
    created.push(...notifyParentsOf(pending, {
      kind: 'homework_due',
      module: 'school',
      priority: isToday ? 'high' : 'normal',
      title: U.ltext(
        isToday ? 'کار خانه امروز باید تسلیم شود' : 'یادآوری کار خانه',
        isToday ? 'نن باید کورنۍ دنده وسپارل شي' : 'د کورنۍ دندې یاداښت',
        isToday ? 'Homework due today' : 'Homework reminder'
      ),
      body: U.ltext(
        `${title} — ${isToday ? 'تا امروز' : 'تا فردا'}`,
        `${title} — ${isToday ? 'تر ننه' : 'تر سبا'}`,
        `${title} — due ${isToday ? 'today' : 'tomorrow'}`
      ),
      data: { homeworkId: hw.id, classId: hw.class_id, type: 'homework_due', ref: key }
    }));
  }

  // 2. Clinic: appointments tomorrow ---------------------------------------
  const appts = all(
    `SELECT a.*, p.full_name FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE a.date = ? AND a.status IN ('booked')`,
    [tomorrow]
  );
  for (const appt of appts) {
    if (alreadySent('appointment_reminder', appt.id, today)) continue;
    const userIds = [appt.patient_id && get('SELECT user_id FROM patients WHERE id = ?', [appt.patient_id])?.user_id];
    const guardianIds = all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [appt.patient_id]).map((r) => r.user_id);
    created.push(...notify([...new Set([...userIds, ...guardianIds].filter(Boolean))], {
      kind: 'appointment_reminder', module: 'clinic', priority: 'high',
      title: U.ltext('یادآوری ملاقات', 'د ملاقات یاداښت', 'Appointment reminder'),
      body: U.ltext(
        `ملاقات شما فردا در کلینیک است (${appt.time_slot || '—'})`,
        `ستاسو ملاقات سبا په کلینیک کې دی (${appt.time_slot || '—'})`,
        `Your appointment is tomorrow at ${appt.time_slot || 'the clinic'}`
      ),
      data: { appointmentId: appt.id, type: 'appointment_reminder', ref: appt.id }
    }));
  }

  // 3. Follow-up visits due -------------------------------------------------
  const followUps = all(
    `SELECT e.*, p.full_name, p.user_id FROM encounters e JOIN patients p ON p.id = e.patient_id
     WHERE e.follow_up_date IS NOT NULL AND date(e.follow_up_date) <= ?`,
    [tomorrow]
  );
  for (const enc of followUps) {
    if (alreadySent('followup_due', enc.id, today)) continue;
    const owner = [enc.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [enc.patient_id]).map((r) => r.user_id)].filter(Boolean);
    created.push(...notify(owner, {
      kind: 'followup_due', module: 'clinic', priority: 'normal',
      title: U.ltext('وقت مراجعهٔ دوباره', 'د بیا مراجعې وخت', 'Follow-up visit due'),
      body: U.ltext('وقت مراجعهٔ دوبارهٔ شما رسیده است.', 'ستاسو د بیا مراجعې وخت رارسېدلی دی.', 'You are due for a follow-up visit.'),
      data: { encounterId: enc.id, type: 'followup_due', ref: enc.id }
    }));
  }

  // 4. Pharmacy: low stock / expiring medicines -----------------------------
  const orgs = all('SELECT id FROM orgs');
  for (const org of orgs) {
    const soon = U.ymdPlus(60);
    const meds = all(
      `SELECT * FROM medications WHERE org_id = ? AND (stock_qty <= reorder_level OR (expiry_date IS NOT NULL AND expiry_date <= ?))`,
      [org.id, soon]
    );
    if (!meds.length) continue;
    if (alreadySent('stock_alert', `${org.id}:${today}`, today)) continue;
    const staff = all(
      `SELECT id FROM users WHERE org_id = ? AND role IN ('pharmacist','clinic_admin','admin')`,
      [org.id]
    ).map((r) => r.id);
    created.push(...notify(staff, {
      kind: 'stock_alert', module: 'clinic', priority: 'high',
      title: U.ltext('هشدار دواخانه', 'د درملتون خبرتیا', 'Pharmacy alert'),
      body: U.ltext(
        `${meds.length} قلم دوا کمبود یا تاریخ تیریدو نزدیک دارد.`,
        `${meds.length} ډوله درمل کم یا د ختمېدو نېټې ته نږدې دي.`,
        `${meds.length} medicines are low in stock or expiring soon.`
      ),
      data: { orgId: org.id, type: 'stock_alert', ref: `${org.id}:${today}` }
    }));
  }

  // 5. Vaccinations due ------------------------------------------------------
  const vacs = all(
    `SELECT v.*, p.full_name, p.user_id FROM vaccinations v JOIN patients p ON p.id = v.patient_id
     WHERE v.given_date IS NULL AND v.due_date IS NOT NULL AND date(v.due_date) <= ?`,
    [U.ymdPlus(14)]
  );
  for (const vac of vacs) {
    if (alreadySent('vaccination_due', vac.id, today)) continue;
    const owner = [vac.user_id, ...all('SELECT user_id FROM patient_guardians WHERE patient_id = ?', [vac.patient_id]).map((r) => r.user_id)].filter(Boolean);
    created.push(...notify(owner, {
      kind: 'vaccination_due', module: 'clinic', priority: 'normal',
      title: U.ltext('یادآوری واکسین', 'د واکسین یاداښت', 'Vaccination reminder'),
      body: U.ltext(
        `نوبت واکسین ${vac.vaccine} نزدیک است.`,
        `د ${vac.vaccine} واکسین نوبت نږدې دی.`,
        `A dose of ${vac.vaccine} is due.`
      ),
      data: { vaccinationId: vac.id, type: 'vaccination_due', ref: vac.id }
    }));
  }

  return created.length;
}

// ------------------------------------------------------------ audit log -----
function audit(auth, action, entity = null, entityId = null, details = {}) {
  try {
    insert('audit_logs', {
      id: U.id('log'),
      org_id: auth?.user?.org_id || null,
      user_id: auth?.user?.id || null,
      action, entity, entity_id: entityId,
      details: U.J.stringify(details),
      created_at: U.nowISO()
    });
  } catch (err) {
    console.warn('[audit] failed', err.message);
  }
}

module.exports = { notify, notifyAudience, notifyParentsOf, audienceUserIds, listFor, unreadCount, markRead, runReminders, audit, alreadySent };
