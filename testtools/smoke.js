/**
 * jsdom smoke test: loads the real PWA against the running server, signs in as
 * each demo role and walks through every route, reporting any runtime error.
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:4000';

const ROUTES = {
  'demo.student5a1': ['home', 'homework', 'timetable', 'progress', 'library', 'quizzes', 'tutor', 'tasks', 'messages', 'notifications', 'calendar', 'profile', 'more'],
  'demo.parent': ['home', 'homework', 'timetable', 'progress', 'messages', 'profile'],
  'demo.teacher': ['home', 'homework', 'classes', 'attendance', 'timetable', 'progress', 'more'],
  'demo.admin': ['home', 'admin', 'classes', 'calendar', 'more'],
  'demo.doctor': ['home', 'queue', 'patients', 'pharmacy', 'appointments', 'tutor', 'more'],
  'demo.reception': ['home', 'queue', 'patients', 'appointments', 'board'],
  'demo.pharmacist': ['home', 'pharmacy', 'patients'],
  'demo.patient': ['home', 'appointments', 'pharmacy', 'tutor', 'more']
};

let cookie = '';

function makeFetch() {
  return async (input, init = {}) => {
    const url = String(input).startsWith('http') ? String(input) : BASE + String(input);
    const headers = Object.assign({}, init.headers || {});
    if (cookie) headers.cookie = cookie;
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const problems = [];
  for (const [username, routes] of Object.entries(ROUTES)) {
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => problems.push(`${username}: jsdomError ${e.message}`));
    vc.on('error', (m) => { if (!/Not implemented/.test(String(m))) problems.push(`${username}: console.error ${m}`); });

    const dom = await JSDOM.fromURL(BASE + '/', {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc
    });
    const { window } = dom;
    window.fetch = makeFetch();
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollTo = () => {};

    await wait(1200);
    const w = window;
    if (!w.APP) { problems.push(`${username}: APP did not boot`); dom.window.close(); continue; }

    // sign in
    const login = await w.fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'demo1234' })
    });
    const session = await login.json();
    if (!session.ok) { problems.push(`${username}: login failed ${session.error}`); dom.window.close(); continue; }
    w.APP.setSession(session);
    w.localStorage.clear();

    for (const route of routes) {
      try {
        w.location.hash = '#/' + route;
        await w.APP.render();
        await wait(350);
        const main = w.document.querySelector('#main');
        const text = main ? main.textContent : '';
        if (!main || text.trim().length === 0) problems.push(`${username}/${route}: empty main`);
        else if (/^\s*⚠️/.test(text) && text.length < 400) problems.push(`${username}/${route}: error card — ${text.trim().slice(0, 120)}`);
        else console.log(`  ✓ ${username}/${route} (${text.trim().length} chars)`);
      } catch (err) {
        problems.push(`${username}/${route}: ${err.message}`);
      }
    }
    dom.window.close();
  }
  console.log('\n=== PROBLEMS (' + problems.length + ') ===');
  problems.forEach((p) => console.log('•', p));
}

run().catch((e) => { console.error(e); process.exit(1); });
