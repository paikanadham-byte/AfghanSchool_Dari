'use strict';
const crypto = require('node:crypto');

// ------------------------------------------------------------------ ids -----
const id = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
const uuid = () => crypto.randomBytes(16).toString('hex');
const nowISO = () => new Date().toISOString();

// -------------------------------------------------------------- security ----
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(String(hash), 'hex');
  if (known.length !== calc.length) return false;
  return crypto.timingSafeEqual(calc, known);
}
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// ------------------------------------------------------------------ json ----
const J = {
  parse(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
  },
  stringify(value) { return JSON.stringify(value === undefined ? null : value); }
};

/** Localised text helper: accepts a JSON string {fa,ps,en} or plain text. */
function tr(value, lang = 'fa', fallback = '') {
  const obj = typeof value === 'string' ? J.parse(value, null) : value;
  if (obj && typeof obj === 'object') {
    return obj[lang] || obj.fa || obj.en || Object.values(obj)[0] || fallback;
  }
  return value || fallback;
}
function ltext(fa, ps, en) { return J.stringify({ fa, ps: ps || fa, en: en || fa }); }

// ----------------------------------------------------------------- dates ----
const DAY_MS = 86400000;

function ymd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function addDays(date, n) {
  const d = new Date(date instanceof Date ? date.getTime() : Date.parse(`${date}T00:00:00`));
  d.setDate(d.getDate() + n);
  return d;
}
function ymdPlus(n, from = new Date()) { return ymd(addDays(from, n)); }
function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Afghanistan week index: Saturday = 0 ... Friday = 6 */
function afWeekday(date = new Date()) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  return (d.getDay() + 1) % 7;
}
function weekRange(offsetWeeks = 0, from = new Date()) {
  const start = addDays(from, -afWeekday(from) + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
}
function daysBetween(a, b) {
  const d1 = Date.parse(`${ymd(a)}T00:00:00Z`);
  const d2 = Date.parse(`${ymd(b)}T00:00:00Z`);
  return Math.round((d2 - d1) / DAY_MS);
}
/** Human "due in" helper used by reminders and UI. */
function dueLabel(dueISO, lang = 'fa', now = new Date()) {
  const diffMs = Date.parse(dueISO) - now.getTime();
  const mins = Math.round(diffMs / 60000);
  const dict = {
    fa: { overdue: 'گذشته', today: 'امروز', tomorrow: 'فردا', in: 'در', days: 'روز', hours: 'ساعت', minutes: 'دقیقه' },
    ps: { overdue: 'تېر شوی', today: 'نن', tomorrow: 'سبا', in: 'په', days: 'ورځې', hours: 'ساعتونه', minutes: 'دقیقې' },
    en: { overdue: 'overdue', today: 'today', tomorrow: 'tomorrow', in: 'in', days: 'days', hours: 'hours', minutes: 'min' }
  }[lang] || {};
  const t = (k) => dict[k] || k;
  if (mins < 0) return `${Math.abs(mins) >= 1440 ? `${Math.floor(Math.abs(mins) / 1440)} ${t('days')} ` : ''}${t('overdue')}`;
  const days = Math.floor(mins / 1440);
  if (days === 0) return mins < 60 ? `${t('in')} ${mins} ${t('minutes')}` : `${t('today')}`;
  if (days === 1) return t('tomorrow');
  return `${t('in')} ${days} ${t('days')}`;
}

// ------------------------------------------------- Jalali (Solar Hijri) -----
// Afghanistan's official calendar is Solar Hijri; the app shows both dates.
const JALALI_MONTHS = {
  fa: ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'],
  ps: ['وری', 'غویی', 'غبرګولی', 'چنګاښ', 'زمری', 'وږی', 'تله', 'لړم', 'لېندۍ', 'مرغومی', 'سلواغه', 'کب'],
  en: ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sonbola', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hoot']
};
const AF_WEEKDAYS = {
  fa: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
  ps: ['خالي', 'اتوار', 'ګل', 'نهه', 'شورو', 'زیارت', 'جمعه'],
  en: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
};
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits(str) { return String(str).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[+d]); }

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100)) + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  jy += Math.floor((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  let jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  gy += Math.floor((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return [gy, gm, gd];
}
function jalali(isoDate, lang = 'fa', options = {}) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const months = JALALI_MONTHS[lang] || JALALI_MONTHS.fa;
  const text = `${jd} ${months[jm - 1]} ${jy}`;
  return lang === 'en' || !options.digits ? text : toPersianDigits(text);
}
function weekdayName(isoDate, lang = 'fa') {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return (AF_WEEKDAYS[lang] || AF_WEEKDAYS.fa)[afWeekday(d)];
}
/** Format a date for display: Jalali first (Afghan default) + Gregorian. */
function formatDate(iso, lang = 'fa', style = 'jalali') {
  if (!iso) return '';
  if (style === 'gregorian') return String(iso).slice(0, 10);
  return jalali(iso, lang, { digits: true });
}

// --------------------------------------------------------------- health -----
/** Gestational age + EDD from last menstrual period (Naegele). */
function pregnancyFromLMP(lmpISO) {
  const lmp = new Date(`${lmpISO}T00:00:00`);
  const edd = new Date(lmp.getTime() + 280 * DAY_MS);
  const weeks = Math.floor((Date.now() - lmp.getTime()) / (7 * DAY_MS));
  return { edd: ymd(edd), weeks: Math.max(0, weeks), days: Math.max(0, Math.floor((Date.now() - lmp.getTime()) / DAY_MS) % 7) };
}
function ageFromDob(dob) {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  const months = years * 12 + (m < 0 ? 12 + m : m);
  return { years, months };
}

// ---------------------------------------------------------------- misc ------
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function slug(str) { return String(str || '').trim().toLowerCase().replace(/[^a-z0-9ء-یګ]+/g, '-').replace(/^-|-$/g, ''); }
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCsv(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  return [head, ...body].join('\n');
}

module.exports = {
  id, uuid, nowISO, hashPassword, verifyPassword, randomToken, J, tr, ltext,
  ymd, addDays, ymdPlus, timeNow, afWeekday, weekRange, daysBetween, dueLabel, DAY_MS,
  gregorianToJalali, jalaliToGregorian, jalali, weekdayName, formatDate, toPersianDigits,
  JALALI_MONTHS, AF_WEEKDAYS,
  pregnancyFromLMP, ageFromDob, clamp, pct, pick, slug, csvEscape, toCsv
};
