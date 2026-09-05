/* Proves sign-in works when the browser refuses to store cookies (the
   iframe / third-party-cookie case): the page must fall back to the bearer
   token and reach the home screen.
   Usage: node testtools/logintest.js                                        */
const { JSDOM } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:4000';
const fetch = global.fetch;

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
};

(async () => {
  // NOTE: no cookie is injected — this is the "browser dropped the cookie" case
  const dom = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (url, opts = {}) => fetch(BASE + String(url).replace(/^https?:\/\/[^/]+/, ''), opts);
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.scrollTo = () => {};
    }
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener('load', r));
  await new Promise((r) => setTimeout(r, 2500));

  console.log('\nSign in with a demo account (cookies unavailable)');
  const btn = w.document.querySelector('#demoGrid button');
  check('demo accounts loaded', !!btn);
  btn.click();
  await new Promise((r) => setTimeout(r, 2000));

  const token = w.localStorage.getItem('acs.token');
  check('session token stored in localStorage', !!token, String(token).slice(0, 8));
  check('navigated to the home screen', w.location.hash === '#/home', w.location.hash);
  const main = w.document.querySelector('#main');
  const text = (main ? main.textContent : '').replace(/\s+/g, ' ').trim();
  check('home screen rendered real content', text.length > 80, text.slice(0, 60));

  const me = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  check('token authenticates /api/auth/me', me.status === 200, 'status ' + me.status);

  console.log('\nWrong password is reported clearly');
  const dom2 = await JSDOM.fromURL(BASE + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w2) {
      w2.fetch = (url, opts = {}) => fetch(BASE + String(url).replace(/^https?:\/\/[^/]+/, ''), opts);
      w2.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w2.scrollTo = () => {};
    }
  });
  const w2 = dom2.window;
  await new Promise((r) => w2.addEventListener('load', r));
  await new Promise((r) => setTimeout(r, 1200));
  w2.document.querySelector('#loginUser').value = 'demo.student5a1';
  w2.document.querySelector('#loginPass').value = 'wrong-password';
  w2.document.querySelector('#loginForm').dispatchEvent(new w2.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 1200));
  const err = w2.document.querySelector('#loginError');
  check('error message shown', err && !err.classList.contains('hidden') && err.textContent.trim().length > 0,
    err ? err.textContent.trim().slice(0, 60) : 'no element');
  check('password hint mentions demo1234', err && /demo1234/.test(err.textContent));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
