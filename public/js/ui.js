/* ===========================================================================
   UI kit — tiny helpers for the whole app (no dependencies, works offline)
   =========================================================================== */
(function (global) {
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'data') Object.entries(v).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
      else el.setAttribute(k, v);
    });
    children.flat(4).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  // ---------------------------------------------------------------- toast --
  const TOAST_ICON = { ok: 'checkCircle', err: 'alert', warn: 'alert', '': 'info' };

  function toast(message, type = '', ms = 2600) {
    const box = qs('#toasts');
    const el = h('div', { class: 'toast ' + type },
      h('span', { class: 'ic-slot', html: I(TOAST_ICON[type] || 'info') }),
      h('span', { html: esc(message) }));
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; setTimeout(() => el.remove(), 250); }, ms);
  }

  // ---------------------------------------------------------------- modal --
  let modalWrap = null;
  function modal({ title, body, actions = [], full = false }) {
    closeModal();
    const bodyEl = typeof body === 'string' ? h('div', { html: body }) : body;
    const head = h('div', { class: 'modal-head' },
      h('h3', {}, title || ''),
      h('button', { class: 'glass-btn ghost-close', 'aria-label': t('close') || 'close', onclick: closeModal, html: I('close') }));
    const foot = h('div', { class: 'stack', style: { marginTop: '12px' } });
    actions.forEach((a) => foot.appendChild(
      h('button', { class: 'btn ' + (a.kind || 'secondary') + ' block', onclick: () => { if (a.onClick) a.onClick(closeModal); else closeModal(); } }, a.label)
    ));
    const sheet = h('div', { class: 'modal' }, h('div', { class: 'sheet-grip' }), head, bodyEl, actions.length ? foot : null);
    modalWrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === modalWrap) closeModal(); } }, sheet);
    document.body.appendChild(modalWrap);
    document.body.style.overflow = 'hidden';
    return sheet;
  }
  function closeModal() {
    if (modalWrap) { modalWrap.remove(); modalWrap = null; }
    document.body.style.overflow = '';
  }
  function confirmDialog(message, onYes) {
    modal({
      title: t('confirm'),
      body: h('p', {}, message),
      actions: [
        { label: t('yes'), kind: 'danger', onClick: (close) => { close(); onYes && onYes(); } },
        { label: t('no'), onClick: (close) => close() }
      ]
    });
  }

  // -------------------------------------------------------------- Jalali ---
  const JALALI_MONTHS = {
    fa: ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'],
    ps: ['وری', 'غویی', 'غبرګولی', 'چنګاښ', 'زمری', 'وږی', 'تله', 'لړم', 'لېندۍ', 'مرغومی', 'سلواغه', 'کب'],
    en: ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sonbola', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hoot']
  };
  const PERSIAN = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const toPersianDigits = (s) => String(s).replace(/[0-9]/g, (d) => PERSIAN[+d]);

  function toJalali(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy <= 1600 ? 0 : 979;
    gy -= gy <= 1600 ? 621 : 1600;
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    jy += Math.floor((days - 1) / 365);
    if (days > 365) days = (days - 1) % 365;
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function afWeekday(date) { // 0 = Saturday … 6 = Friday
    const d = new Date(date);
    return (d.getDay() + 1) % 7;
  }

  const fmt = {
    jalali(iso, opts = {}) {
      if (!iso) return '';
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      if (isNaN(d)) return '';
      const [jy, jm, jd] = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const months = JALALI_MONTHS[I18N.lang] || JALALI_MONTHS.fa;
      let out = `${jd} ${months[jm - 1]} ${jy}`;
      if (I18N.lang !== 'en' && opts.digits !== false) out = toPersianDigits(out);
      return out;
    },
    gregorian(iso) { return String(iso || '').slice(0, 10); },
    /** Date shown in the app: Jalali first for Dari/Pashto, Gregorian for English. */
    date(iso) {
      if (!iso) return '';
      return I18N.lang === 'en' ? fmt.gregorian(iso) : fmt.jalali(iso);
    },
    dateTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `${fmt.date(iso)} — ${I18N.lang === 'fa' || I18N.lang === 'ps' ? toPersianDigits(time) : time}`;
    },
    time(iso) { return String(iso || '').slice(0, 5); },
    weekday(iso) { return I18N.weekdays()[afWeekday(iso)]; },
    todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
    addDays(iso, n) { const d = new Date(String(iso || fmt.todayISO()).slice(0, 10) + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
    /** 0 = Saturday … 6 = Friday, in the Afghan week order */
    weekdayIndex(iso) { return afWeekday(iso); },
    due(iso) {
      if (!iso) return { text: '', kind: 'grey' };
      const diff = Date.parse(iso) - Date.now();
      const mins = Math.round(diff / 60000);
      const days = Math.floor(mins / 1440);
      if (mins < 0) return { text: t('overdue'), kind: 'danger' };
      if (days === 0) return { text: mins < 60 ? `${t('due_in')} ${mins} ${t('minutes')}` : t('today'), kind: mins < 60 ? 'warn' : 'warn' };
      if (days === 1) return { text: t('tomorrow'), kind: 'info' };
      return { text: `${t('due_in')} ${days} ${t('days')}`, kind: 'grey' };
    },
    ago(iso) {
      if (!iso) return '';
      const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
      if (mins < 1) return t('now') || 'now';
      if (mins < 60) return `${mins} ${t('minutes')}`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} ${t('hours')}`;
      return fmt.date(iso);
    }
  };

  // ------------------------------------------------------------ fragments --
  const chip = (text, kind = '') => `<span class="chip ${kind}">${esc(text)}</span>`;
  /** Chip with a leading icon: chipIcon('alert', 'Penicillin', 'danger') */
  const chipIcon = (icon, text, kind = '') => `<span class="chip ${kind}">${I(icon || 'dot')}${esc(text)}</span>`;
  const empty = (icon, text) => `<div class="empty"><div class="empty-ic">${I(icon || 'search')}</div>${esc(text || t('empty_general'))}</div>`;
  const tile = (icon, kind = '') => `<span class="tile ${kind}">${I(icon)}</span>`;
  const iconBtn = (icon, cls = '') => `<button class="glass-btn ${cls}" type="button">${I(icon)}</button>`;
  const bar = (pct, kind = '') => `<div class="bar ${kind}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  const stat = (n, label) => `<div class="stat"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;
  const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="card"><div class="skeleton-line" style="width:45%"></div><div class="skeleton-box"></div></div>').join('');

  // ---------------------------------------------------------- read aloud ---
  let speaking = false;
  function speak(text, onEnd) {
    if (!('speechSynthesis' in window)) { toast(t('not_supported'), 'warn'); return; }
    if (speaking) { window.speechSynthesis.cancel(); speaking = false; if (onEnd) onEnd(); return; }
    const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, '').slice(0, 1200));
    u.lang = { fa: 'fa-IR', ps: 'ps-AF', en: 'en-US' }[I18N.lang] || 'fa-IR';
    u.rate = 0.95;
    u.onend = () => { speaking = false; if (onEnd) onEnd(); };
    speaking = true;
    window.speechSynthesis.speak(u);
  }

  // ------------------------------------------------------- media capture ---
  function pickFile({ accept = '*/*', capture = false, multiple = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = accept; input.multiple = multiple;
      if (capture) input.capture = 'environment';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = () => { resolve(multiple ? Array.from(input.files) : input.files[0]); input.remove(); };
      input.click();
    });
  }

  let recorder = null;
  function recordAudio() {
    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices?.getUserMedia) return reject(new Error('no_mic'));
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((tr) => tr.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          resolve(new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }));
        };
        recorder.start();
        toast(t('recording'), 'warn', 3000);
      }).catch(reject);
    });
  }
  function stopRecording() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }

  // ----------------------------------------------------------- helpers -----
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  function progressRing(pct, label) {
    return `<div class="progress-ring" style="--p:${Math.max(0, Math.min(100, pct))}"><span>${esc(label ?? pct + '%')}</span></div>`;
  }
  function localisedInput(labelKey, values = {}) {
    return `<div class="field">
      <label>${esc(t(labelKey))}</label>
      <input type="text" data-lang="fa" placeholder="${esc(t('dari'))}" value="${esc(values.fa || '')}"/>
      <input type="text" data-lang="ps" placeholder="${esc(t('pashto'))}" value="${esc(values.ps || '')}" style="margin-top:6px"/>
      <input type="text" data-lang="en" placeholder="${esc(t('english'))}" value="${esc(values.en || '')}" style="margin-top:6px"/>
    </div>`;
  }
  function readLocalised(root) {
    const out = {};
    qsa('[data-lang]', root).forEach((inp) => { out[inp.dataset.lang] = inp.value.trim(); });
    return out;
  }

  global.UI = { h, esc, qs, qsa, toast, modal, closeModal, confirmDialog, fmt, chip, chipIcon, empty, tile, iconBtn, bar, stat, skeleton, speak, pickFile, recordAudio, stopRecording, initials, progressRing, localisedInput, readLocalised, toJalali, afWeekday, toPersianDigits };
})(window);
