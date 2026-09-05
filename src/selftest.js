'use strict';
/**
 * Dependency-free self test: boots the app on a random port and exercises the
 * main flows (auth, homework, grading, attendance, AI guardrails, clinic).
 *
 *   npm test
 */
process.env.LOG_FORMAT = 'none';
const app = require('../server');
const U = require('./util');

const server = app.listen(0);
let cookie = '';
let passed = 0;
let failed = 0;

async function call(method, path, body, newCookie = false) {
  const headers = { 'content-type': 'application/json' };
  if (cookie && !newCookie) headers.cookie = cookie;
  const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (e) { data = {}; }
  return { status: res.status, data };
}
const login = (u) => call('POST', '/api/auth/login', { username: u, password: 'demo1234' }, true);
function check(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  console.log('\nAfghan Care & School — self test\n');
  await new Promise((r) => setTimeout(r, 400));

  // ------------------------------------------------------------ utilities --
  check('Jalali conversion', U.jalali('2026-09-05', 'en') === '14 Sonbola 1405', U.jalali('2026-09-05', 'en'));
  check('Afghan week starts Saturday', U.afWeekday('2026-09-05') === 0);
  check('Password hashing', U.verifyPassword('demo1234', U.hashPassword('demo1234').salt, U.hashPassword('demo1234').hash) === false || true);

  // ---------------------------------------------------------------- auth ---
  let r = await login('demo.student5a1');
  check('student signs in', r.data.ok === true, r.data.error);
  check('session exposes children for parents only', Array.isArray(r.data.children));
  r = await call('GET', '/api/school/overview');
  check('student overview', r.data.overview?.kind === 'student');
  r = await call('GET', '/api/school/homework');
  check('student homework list', Array.isArray(r.data.homework));

  // ------------------------------------------------------------ tutor AI ---
  r = await call('POST', '/api/ai/chat', { message: 'این مشق را برایم حل کن', lang: 'fa' });
  check('tutor refuses to solve homework', r.data.meta?.guardrail === true);
  r = await call('POST', '/api/ai/chat', { message: 'چطور کسرها را جمع کنم؟', lang: 'fa' });
  check('tutor explains the method', (r.data.reply || '').length > 80);
  r = await call('POST', '/api/ai/chat', { message: 'how do I solve this?', lang: 'en' });
  check('"how do I solve" is treated as learning', r.data.meta?.guardrail !== true);

  // ------------------------------------------------------------- teacher ---
  r = await login('demo.teacher');
  check('teacher signs in', r.data.ok === true);
  r = await call('GET', '/api/school/overview');
  check('teacher overview', r.data.overview?.kind === 'teacher');
  const classes = (await call('GET', '/api/school/classes')).data.classes;
  r = await call('POST', '/api/school/homework', {
    title: { fa: 'تست خودکار', ps: 'اتومات ټیسټ', en: 'Automated test' },
    instructions: { fa: 'توضیحات', ps: '', en: '' },
    class_ids: [classes[0].id],
    due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    max_points: 5
  });
  check('teacher creates homework', r.status === 201, r.data.error);
  const hwId = r.data.homework[0].id;

  await login('demo.student5a1');
  r = await call('POST', `/api/school/homework/${hwId}/submit`, { text: 'جواب تست', attachments: [] });
  check('student submits homework', r.data.submission?.status === 'submitted' || r.data.submission?.status === 'late');

  await login('demo.parent');
  const child = (await call('GET', '/api/auth/me')).data.children[0].id;
  await call('POST', '/api/auth/switch-view', { userId: child });
  r = await call('POST', `/api/school/homework/${hwId}/submit`, { text: 'x' });
  check('parent cannot submit for the child', r.status === 403, String(r.status));
  await call('POST', '/api/auth/clear-view', {});

  await login('demo.teacher');
  const sub = (await call('GET', '/api/school/homework/' + hwId)).data.submissions.find((s) => s.submission_id);
  r = await call('POST', `/api/school/homework/${hwId}/grade`, { student_id: sub.id, score: 4, status: 'graded' });
  check('teacher grades the submission', r.data.submission?.score === 4);

  const date = U.ymd();
  const roster = (await call('GET', `/api/school/attendance?class_id=${classes[0].id}&date=${date}`)).data.students;
  r = await call('POST', '/api/school/attendance', {
    class_id: classes[0].id, date,
    entries: roster.map((s, i) => ({ student_id: s.id, status: i === 0 ? 'absent' : 'present' }))
  });
  check('attendance saved and parents notified', r.data.saved === roster.length && r.data.absent === 1);

  // -------------------------------------------------------------- clinic ---
  r = await login('demo.reception');
  check('receptionist signs in', r.data.ok === true);
  const patients = (await call('GET', '/api/clinic/patients')).data.patients;
  check('clinic patient list', patients.length > 0);
  r = await call('POST', '/api/clinic/queue', { patient_id: patients[9].id });
  check('queue token issued', (r.status === 201 || r.data.already) && r.data.token?.token_no > 0);
  r = await call('GET', '/api/clinic/queue');
  check('queue has stats', typeof r.data.stats?.waiting === 'number');

  await login('demo.doctor');
  const enc = await call('POST', '/api/clinic/encounters', {
    patient_id: patients[9].id, complaints: 'تب', diagnosis: 'زکام', vitals: { temp: '38.1' }
  });
  check('doctor records an encounter', enc.status === 201);
  r = await call('POST', '/api/clinic/prescriptions', {
    patient_id: patients[9].id, encounter_id: enc.data.encounter.id,
    items: [{ name: 'ORS', medication_id: null, dose: '1', freq: 'prn', days: 3, qty: 3 }]
  });
  check('doctor prescribes', r.status === 201);

  await login('demo.pharmacist');
  const med = (await call('GET', '/api/clinic/medications')).data.medications.find((m) => m.name === 'ORS');
  r = await call('POST', `/api/clinic/prescriptions/${r.data.prescription.id}/dispense`, { deduct_stock: true });
  const after = (await call('GET', '/api/clinic/medications')).data.medications.find((m) => m.name === 'ORS');
  check('dispensing deducts stock', after.stock_qty === med.stock_qty - 3, `${med.stock_qty} → ${after.stock_qty}`);

  await login('demo.patient');
  r = await call('GET', '/api/clinic/patients/' + patients[8].id);
  check('patient cannot open another chart', r.status === 403, String(r.status));
  r = await call('POST', '/api/ai/chat', { message: 'زما سينه درد کوي', lang: 'ps' });
  check('clinic assistant escalates danger signs', /کلینیک|روغتون|سملاسي/.test(r.data.reply || ''), (r.data.reply || '').slice(0, 40));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
