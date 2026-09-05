/* Renders every route in jsdom and counts the SVG icons that actually paint.
   Flags template leaks ("${", "I('"), leftover emoji, and screens with no icons.
   Usage (server must be running):
     node testtools/iconcheck.js
     ROUTES=home,queue USERS=demo.doctor node testtools/iconcheck.js            */
const { JSDOM } = require('jsdom');

const BASE = process.env.BASE || 'http://localhost:4000';
const ROUTES = (process.env.ROUTES ||
  'home,homework,timetable,attendance,classes,admin,library,quizzes,progress,calendar,tasks,notifications,messages,more,profile,tutor,queue,patients,pharmacy,appointments,board')
  .split(',');
const USERS = (process.env.USERS ||
  'demo.student5a1,demo.parent,demo.teacher,demo.admin,demo.doctor,demo.reception,demo.pharmacist,demo.patient')
  .split(',');
const fetch = global.fetch;

(async () => {
  let problems = 0;
  for (const u of USERS) {
    const r = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'demo1234' })
    });
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    for (const route of ROUTES) {
      const dom = await JSDOM.fromURL(BASE + '/', {
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
        beforeParse(w) {
          w.fetch = (url, opts = {}) => fetch(BASE + String(url).replace(/^https?:\/\/[^/]+/, ''),
            { ...opts, headers: { ...(opts.headers || {}), cookie } });
          w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
          w.scrollTo = () => {};
        }
      });
      const w = dom.window;
      await new Promise((res) => w.addEventListener('load', res));
      await new Promise((res) => setTimeout(res, 800));
      w.location.hash = '#/' + route;
      await new Promise((res) => setTimeout(res, 900));
      const main = w.document.querySelector('#main') || w.document.body;
      const icons = main.querySelectorAll('svg.ic').length;
      const text = (main.textContent || '').replace(/\s+/g, ' ').trim();
      const flags = [];
      if (/\$\{|I\('|\[object/.test(text)) flags.push('LEAK:' + (text.match(/.{0,25}(\$\{|I\('|\[object).{0,25}/) || [''])[0]);
      if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(text)) flags.push('EMOJI');
      if (icons === 0 && text.length > 60) flags.push('NO-ICONS');
      if (flags.length) problems++;
      console.log(`${u.padEnd(17)} ${route.padEnd(14)} icons=${String(icons).padStart(3)} chars=${String(text.length).padStart(5)}  ${flags.join(' ')}`);
      dom.window.close();
    }
  }
  console.log(`\n=== screens to review: ${problems} ===`);
})();
