/* Generates public/js/icons.js from lucide-static (MIT licence).
   Usage:  npm i --prefix testtools lucide-static  &&  node testtools/gen-icons.js
   The generated file is committed, so this is only needed when adding icons. */
const fs = require('fs');
const path = require('path');

let nodes;
try {
  nodes = require('lucide-static/icon-nodes.json');
} catch (e) {
  try { nodes = require(path.join(__dirname, 'node_modules/lucide-static/icon-nodes.json')); }
  catch (e2) { console.error('lucide-static not found. Run: npm i --prefix testtools lucide-static'); process.exit(1); }
}

// curated set: local name -> lucide name
const MAP = {
  /* shell + navigation */
  home: 'house', menu: 'menu', more: 'ellipsis', settings: 'settings', user: 'user',
  users: 'users', userRound: 'user-round', userCog: 'user-cog', bell: 'bell', bellOff: 'bell-off',
  search: 'search', filter: 'funnel', logout: 'log-out', login: 'log-in', globe: 'globe',
  languages: 'languages', sun: 'sun', moon: 'moon', contrast: 'contrast', type: 'type',
  chevron: 'chevron-right', chevronLeft: 'chevron-left', chevronDown: 'chevron-down',
  arrowRight: 'arrow-right', arrowLeft: 'arrow-left', arrowUp: 'arrow-up', arrowDown: 'arrow-down',
  close: 'x', check: 'check', checkCircle: 'circle-check-big', xCircle: 'circle-x',
  plus: 'plus', minus: 'minus', refresh: 'refresh-cw', info: 'info', help: 'hand-helping',
  lock: 'lock', key: 'key-round', shield: 'shield', shieldAlert: 'shield-alert',
  shieldCheck: 'shield-check', trash: 'trash', edit: 'pencil', eye: 'eye', share: 'share-2',
  external: 'external-link', link: 'link', dot: 'circle', wifi: 'wifi', wifiOff: 'wifi-off',
  cloud: 'cloud', cloudOff: 'cloud-off', download: 'download', upload: 'upload', send: 'send',
  image: 'image', paperclip: 'paperclip', camera: 'camera', mic: 'mic', stop: 'square',
  play: 'play', pause: 'pause', volume: 'volume-2', headphones: 'headphones',
  clock: 'clock', timer: 'timer', hourglass: 'hourglass', alarm: 'alarm-clock',

  /* school */
  book: 'book', bookOpen: 'book-open', library: 'library', graduation: 'graduation-cap',
  backpack: 'backpack', pencil: 'pencil', penLine: 'pen-line', penTool: 'pen-tool',
  clipboard: 'clipboard-list', clipboardCheck: 'clipboard-check', clipboardPlus: 'clipboard-plus',
  listChecks: 'list-checks', homework: 'notebook-pen', notebook: 'notebook-text',
  calendar: 'calendar', calendarDays: 'calendar-days', calendarCheck: 'calendar-check',
  calendarX: 'calendar-x', calendarClock: 'calendar-clock', calendarPlus: 'calendar-plus',
  target: 'target', trending: 'trending-up', award: 'award', star: 'star', trophy: 'trophy',
  medal: 'medal', sparkles: 'sparkles', lightbulb: 'lightbulb', brain: 'brain',
  school: 'school', building: 'building-2', megaphone: 'megaphone', flag: 'flag', pin: 'pin',
  party: 'party-popper', tent: 'tent', palette: 'tree-palm', chart: 'chart-column',
  chartPie: 'chart-pie', gauge: 'gauge', route: 'route', folder: 'folder',
  folderOpen: 'folder-open', inbox: 'inbox', archive: 'archive', file: 'file-text',
  receipt: 'receipt', spark: 'zap',

  /* clinic */
  hospital: 'hospital', clinic: 'building-2', stethoscope: 'stethoscope', syringe: 'syringe',
  pill: 'pill', flask: 'flask-conical', testTube: 'test-tube', ticket: 'ticket',
  heartPulse: 'heart-pulse', activity: 'activity', thermometer: 'thermometer', baby: 'baby',
  mother: 'baby', bandage: 'bandage', briefcase: 'briefcase-medical', monitor: 'monitor',
  droplets: 'droplets', weight: 'weight', ruler: 'ruler', scan: 'scan-line', bed: 'bed',
  ambulance: 'ambulance', package: 'package', boxes: 'boxes', warehouse: 'warehouse',
  zap: 'zap', alert: 'triangle-alert', circleAlert: 'circle-alert', checkCheck: 'check-check',
  phone: 'phone', mail: 'mail', mapPin: 'map-pin', printer: 'printer', idCard: 'badge',
  health: 'heart-handshake', vaccination: 'syringe', lab: 'flask-conical', pharmacy: 'pill',
  queue: 'list-ordered', token: 'ticket', board: 'monitor-play', doctor: 'stethoscope',
  nurse: 'syringe', reception: 'concierge-bell', patient: 'user-round',

  /* tutor / AI */
  bot: 'bot', messageCircle: 'message-circle', messages: 'messages-square', compass: 'compass',
  searchHelp: 'search-check', bookMarked: 'book-marked', repeat: 'repeat', wand: 'wand-sparkles',
  quote: 'quote', blocks: 'blocks', puzzle: 'puzzle', mic2: 'mic-vocal', mark: 'book-heart',

  /* mood / people */
  frown: 'face-slightly-frowning', smile: 'sun', tired: 'moon',

  /* misc */
  starOutline: 'star', coins: 'coins', wallet: 'wallet', truck: 'truck', bus: 'bus',
  sun2: 'sunrise', moon2: 'moon-star', power: 'power', save: 'save', copy: 'copy',
  maximize: 'maximize-2', minimize: 'minimize-2', chevronsUp: 'chevrons-up-down',
  grid: 'layout-grid', list: 'list', sliders: 'sliders-horizontal', sparkle: 'sparkle',
  cornerUpLeft: 'corner-up-left', fileUp: 'file-up', fileDown: 'file-down', bellRing: 'bell-ring',
  userPlus: 'user-plus', userCheck: 'user-check', clockAlert: 'clock-alert',
  timerReset: 'timer-reset', bookCheck: 'book-check', highlighter: 'highlighter'
};

const missing = [];
const out = {};
for (const [local, lucide] of Object.entries(MAP)) {
  if (!nodes[lucide]) { missing.push(`${local} -> ${lucide}`); continue; }
  out[local] = nodes[lucide];
}
if (missing.length) { console.error('MISSING LUCIDE ICONS:\n' + missing.join('\n')); process.exit(1); }

const body = Object.entries(out).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(',\n  ');

const file = `/* ===========================================================================
   Icon set — stroke icons, currentColor, no emoji, no external requests.
   Generated from lucide (MIT licence, https://lucide.dev). Do not edit by hand;
   regenerate with:  npm i --prefix testtools lucide-static && node testtools/gen-icons.js
   =========================================================================== */
(function () {
  // [ [ tag, { attributes } ], ... ]
  const P = {
  ${body}
  };

  const DEFAULT = 'dot';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function svg(name, cls) {
    const node = P[name] || P[DEFAULT];
    const inner = node.map(([tag, attrs]) => {
      const a = Object.keys(attrs).map((k) => ' ' + k + '="' + esc(attrs[k]) + '"').join('');
      return '<' + tag + a + '>';
    }).join('');
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  window.Icon = {
    /** Inline SVG markup for use inside template strings. */
    get(name, cls) { return svg(name, cls); },
    has(name) { return !!P[name]; },
    list() { return Object.keys(P); }
  };

  /** Shorthand used everywhere in the views: \${I('home')} */
  window.I = function (name, cls) { return svg(name, cls); };
})();
`;

const dest = path.join(__dirname, '..', 'public', 'js', 'icons.js');
fs.writeFileSync(dest, file);
console.log('wrote', dest, Object.keys(out).length, 'icons,', (file.length / 1024).toFixed(1) + 'KB');
