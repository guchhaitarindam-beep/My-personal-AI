/* =====================================================================
   APP CORE — utilities, constants, default show, schema normalisation.
   Everything lives inside one IIFE (added by the build); the only global
   is window.QC, a read-only handle used by the self-test and Playwright.
   ===================================================================== */
const VERSION = '66.0';
const SCHEMA = 66;
/* Raised whenever the built-in rules change. A save from an older file gets the new rules, round names,
   question placement and loudness defaults; teams, photos, scores and the operator's own question texts stay. */
const RULES_VERSION = 44;
/** The organising team as first shipped — an older save still holding exactly this gets the 13 Oct team (an edited team is kept). */
const OLD_CREW_NAMES = ['অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|মহেশ্বর দাস|প্রতাপ বেড়া|কমলেন্দু মাইতি', 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|সঞ্জয় মণ্ডল', 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পালুই|সঞ্জয় মণ্ডল|সৌরভ মাইতি'];
const OLD_CREDITS = (c) => c.startsWith('প্রশ্ন সংকলন ও ডিজাইন: অরিন্দম গুছাইত') || (c.startsWith('পরিকল্পনা, মূল পর্বের প্রশ্ন সংকলন ও কুইজ ইঞ্জিন: অরিন্দম গুছাইত') && (c.includes('চন্দন পাল ও') || c.includes('চন্দন পালুই') || c.includes('(অধিনায়ক)')) && !c.includes('চন্দন পালই'));
/** Which window this is. A window that started as the TV stage stays the stage even when it reloads without "#stage"
    (F5, a crash-restore, a lost address): the mark is kept in the window's own session storage and its window name,
    so the TV never turns into a second control panel. */
const MODE = (() => {
  const want = /(^|[#&?])stage\b/.test(location.hash + location.search) ? 'stage' : /(^|[#&?])host\b/.test(location.hash + location.search) ? 'host' : '';
  let kept = '';
  try { kept = sessionStorage.getItem('qc66.window') || ''; } catch (e) { /* storage off: the address decides */ }
  if (!kept && window.name === 'qc66-stage') kept = 'stage';
  const m = want || (kept === 'stage' || kept === 'host' ? kept : 'control');
  try { sessionStorage.setItem('qc66.window', m); } catch (e) { /* no storage: nothing to keep */ }
  if (m === 'stage') { window.name = 'qc66-stage'; if (!/stage/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search + '#stage'); } catch (e) { /* file page: keep going */ } } }
  return m;
})();
const LS_KEY = 'qc66.state';
const LS_REH = 'qc66.rehearsal';
const LS_PREF = 'qc66.prefs';
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const OPT_LABELS = ['ক', 'খ', 'গ', 'ঘ'];
const TEAM_COLORS = ['#38e8ff', '#ffd166', '#2ef2a0', '#ff6bcb', '#8b7bff', '#ff8a3d', '#5ce1e6', '#c3f73a', '#ff5470', '#7ad7ff', '#f5a3ff', '#ffe066'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0, lo = -1e9, hi = 1e9) => clamp(Math.round(num(v, d)), lo, hi);
const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const bn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);
const esc = (s) => str(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
/** High-resolution wall clock shared by every window of the same origin. */
const now = () => performance.timeOrigin + performance.now();
const fmtTime = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s); };
const signed = (n) => (n > 0 ? '+' + n : String(n));

/** Fast 32-bit checksum (FNV-1a) used to detect damaged saves. */
function sumOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + str.length; }

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/* ---------- Tiny event bus ---------- */
const Bus = {
  map: new Map(),
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, new Set()); this.map.get(name).add(fn); return () => this.map.get(name).delete(fn); },
  emit(name, data) { const set = this.map.get(name); if (!set) return;
    for (const fn of Array.from(set)) { try { fn(data); } catch (e) { if (name !== 'log') Log.err('bus:' + name, e); } }
  },
};

/* ---------- Error log (never let an exception reach the audience) ---------- */
const Log = {
  lines: [],
  add(level, msg) {
    const line = new Date().toLocaleTimeString() + ' [' + level + '] ' + msg;
    this.lines.push(line);
    if (this.lines.length > 300) this.lines.shift();
    if (level === 'ERR') console.warn('[QC]', msg);
    Bus.emit('log', line);
  },
  err(where, e) { this.add('ERR', where + ': ' + (e && e.message ? e.message : e)); },
};
/** Runs fn and swallows (but logs) any exception. Returns fallback on error. */
function safe(where, fn, fallback) {
  try { return fn(); } catch (e) { Log.err(where, e); return fallback; }
}

/* ---------- Embedded seed data (from the previous Quiz Corner engines) ---------- */
function readSeed() {
  const el = document.getElementById('qc-seed');
  const fallback = { questions: [], testQuestions: [], prelim: [], show: {} };
  if (!el) return fallback;
  return safe('seed', () => Object.assign(fallback, JSON.parse(el.textContent)), fallback);
}
const SEED = readSeed();

/* ---------- Defaults ---------- */
const FONT_CHOICES = [
  ['Hind Siliguri', "'Hind Siliguri','Nirmala UI',sans-serif"],
  ['Tiro Bangla', "'Tiro Bangla','Noto Serif Bengali',serif"],
  ['Noto Serif Bengali', "'Noto Serif Bengali','Tiro Bangla',serif"],
  ['Noto Sans Bengali', "'Noto Sans Bengali','Nirmala UI',sans-serif"],
  ['Mina', "'Mina','Hind Siliguri',sans-serif"],
  ['Galada', "'Galada','Hind Siliguri',cursive"],
  ['Siliguri Modern', "'Anek Bangla','Hind Siliguri',sans-serif"],
  ['Nirmala UI', "'Nirmala UI','Vrinda','Hind Siliguri',sans-serif"],
  ['Vrinda', "'Vrinda','Nirmala UI',sans-serif"],
];
const FONT_MAP = Object.fromEntries(FONT_CHOICES);
const ANIMS = ['fade', 'slide', 'zoom', 'flip', 'spin', 'cube', 'door', 'push', 'orbit', 'none'];
const ROUND_ANIMS = ['flip', 'cube', 'zoom', 'spin', 'slide', 'door', 'sweep', 'burst', 'push', 'orbit', 'glass', 'digital'];
const THEMES = {
  // 55-inch TV, read from far away: deep calm background, warm light text, champagne-gold highlights (no neon behind the words)
  midnight: { label: 'Midnight Royal Blue · Warm White · Champagne Gold (default)', bg: '#071a3d', bg2: '#102d63', text: '#fff9e8', head: '#ffffff', muted: '#e3e8f4', accent: '#f4d27a', accent2: '#2a5ab8', gold: '#f4d27a', neon: '#f8e2a4', panel: '#0b2150', correct: '#3ddc97', wrong: '#ff5d73', timer: '#f4d27a', warn: '#ffb347', crit: '#ff4d5e', glow: 0.5 },
  violetGold: { label: 'Deep Violet · Ivory · Rose Gold (special / festival)', bg: '#170d38', bg2: '#3a176b', text: '#fffdf5', head: '#ffffff', muted: '#ece2f7', accent: '#e8b7c8', accent2: '#7a3fc4', gold: '#e8b7c8', neon: '#f2cfdb', panel: '#1f1048', correct: '#3ddc97', wrong: '#ff5d73', timer: '#e8b7c8', warn: '#ffb347', crit: '#ff4d5e', glow: 0.5 },
  tealIvory: { label: 'Deep Teal · Pearl White · Champagne (kids / junior)', bg: '#062f35', bg2: '#07545a', text: '#f8fcf7', head: '#ffffff', muted: '#d6ece8', accent: '#e8d39a', accent2: '#13807a', gold: '#e8d39a', neon: '#f0e2b8', panel: '#08393f', correct: '#4be3a0', wrong: '#ff6b7a', timer: '#e8d39a', warn: '#ffb347', crit: '#ff4d5e', glow: 0.5 },
  navyCyan: { label: 'Navy · Electric Blue · White (technology / speed)', bg: '#050d24', bg2: '#092b66', text: '#ffffff', head: '#ffffff', muted: '#cfe6f5', accent: '#70cfff', accent2: '#2b6cb0', gold: '#70cfff', neon: '#a6e2ff', panel: '#081a3c', correct: '#3ddc97', wrong: '#ff5d73', timer: '#70cfff', warn: '#ffb347', crit: '#ff4d5e', glow: 0.55 },
  royalYellow: { label: 'Royal Blue · Soft Lavender · Gold (grand finale)', bg: '#071f57', bg2: '#173f8f', text: '#fffdf7', head: '#ffffff', muted: '#e6dcff', accent: '#d9c2ff', accent2: '#5b4bd1', gold: '#f2d27d', neon: '#d9c2ff', panel: '#0c2a6e', correct: '#4be3a0', wrong: '#ff6b7a', timer: '#f2d27d', warn: '#ffb347', crit: '#ff4d5e', glow: 0.55 },
  broadcast: { label: 'Broadcast Violet (neon)', bg: '#05030f', bg2: '#140a3a', text: '#ffffff', muted: '#c7cbef', accent: '#38e8ff', accent2: '#8b5cf6', gold: '#ffd166', neon: '#38e8ff', panel: '#0d0a26', correct: '#2ef2a0', wrong: '#ff4d6d', timer: '#38e8ff', warn: '#ffb020', crit: '#ff3b5c', glow: 1 },
  daylight: { label: 'Daylight — maximum contrast', bg: '#000000', bg2: '#0a0a1a', text: '#ffffff', muted: '#f2f2f2', accent: '#00f0ff', accent2: '#6a5cff', gold: '#ffe14d', neon: '#ffffff', panel: '#000000', correct: '#00ff8c', wrong: '#ff2a4a', timer: '#00f0ff', warn: '#ffc400', crit: '#ff1f3d', glow: .6 },
  led: { label: 'Stage LED Neon', bg: '#02010a', bg2: '#1d0640', text: '#ffffff', muted: '#d7d0ff', accent: '#ff3df2', accent2: '#3d7bff', gold: '#ffe066', neon: '#ff3df2', panel: '#0c0424', correct: '#3dff9e', wrong: '#ff3d6e', timer: '#3dd9ff', warn: '#ffb020', crit: '#ff2050', glow: 1.4 },
  royal: { label: 'Royal Gold', bg: '#07040a', bg2: '#2a1606', text: '#fffaf0', muted: '#ead9b8', accent: '#ffcf5a', accent2: '#b5651d', gold: '#ffd700', neon: '#ffcf5a', panel: '#140b04', correct: '#4dffa6', wrong: '#ff5a5a', timer: '#ffcf5a', warn: '#ff9f1c', crit: '#ff3b3b', glow: 1 },
};
const AUDIO_CUES = {
  question: 'Question opens (rising bells)', option: 'Options appear (pop)', score: 'Points added (coin)', laser: 'Question number pick (laser)', buzzer: 'Time up (siren + buzzer)', drumroll: 'Drumroll', applause: 'Applause', suspense: 'Suspense', gong: 'Gong', ding: 'Ding', siren: 'Siren', heartbeat: 'Heartbeat', click: 'Click', round: 'Round stinger',
  transition: 'Scene change', delivery: 'Question arrives', drone: 'Drone', countdown: 'Countdown beep', impact: 'Countdown end (impact)',
  tick: 'Tick (last 10 seconds)', warning: 'Warning (10/5 seconds)', timeout: 'Time up', correct: 'Correct', wrong: 'Wrong', reveal: 'Answer reveal',
  pass: 'Pass', challenge: 'Challenge', lifeline: 'Lifeline', scoreboard: 'Scoreboard', fanfare: 'Winner fanfare', teamintro: 'Team intro', roundintro: 'Round start',
};
/** Musical jingles — silent when the organiser wants no music at all (audio.noMusic); the game signals (correct, wrong, time up, beeps) stay. */
const MUSIC_CUES = ['fanfare', 'round', 'roundintro', 'teamintro', 'scoreboard', 'drumroll', 'suspense', 'heartbeat'];
const MUSIC_SLOTS = { theme: 'Theme song', welcome: 'Welcome music', winner: 'Winner music', background: 'Background music' };

/** Podium lottery: eight things children love, all of one kind. Each card hides a podium (A / 1 … H / 8). */
/** Pictures for the question board's subjects (Microsoft Fluent UI Emoji, MIT) — general symbols, never an answer. */
const TOPIC_ICONS = [['newspaper', 'Newspaper'], ['open_book', 'Open book'], ['books', 'Books'], ['green_book', 'Green book'], ['memo', 'Memo / pencil'], ['scroll', 'Scroll (history)'], ['party_popper', 'Festival'], ['musical_notes', 'Music'], ['anatomical_heart', 'Human body'], ['microscope', 'Microscope'], ['test_tube', 'Test tube'], ['telescope', 'Telescope'], ['rocket', 'Rocket'], ['satellite', 'Satellite'], ['world_map', 'World map'], ['deciduous_tree', 'Tree (environment)'], ['paw_prints', 'Paw prints (animals)'], ['feather', 'Feather (birds)'], ['soccer_ball', 'Football'], ['chess_pawn', 'Chess'], ['sports_medal', 'Medal'], ['spiral_calendar', 'Calendar (special days)'], ['bow_and_arrow', 'Bow and arrow (mythology)'], ['diya_lamp', 'Diya lamp'], ['candle', 'Candle'], ['pot_of_food', 'Pot of food'], ['magnifying_glass_tilted_left', 'Magnifying glass'], ['artist_palette', 'Artist palette']].map(([k, l]) => ['asset:topic_' + k + '.png', l]);
const DRAW_THEMES = {
  // default theme: real 3D pictures on every card (Microsoft Fluent UI Emoji, MIT); the other themes show a large emoji or the first letter
  animals: { name: 'প্রিয় পশুপাখি', items: [['বাঘ', '🐯', 'asset:draw_tiger.png'], ['হাতি', '🐘', 'asset:draw_elephant.png'], ['ময়ূর', '🦚', 'asset:draw_peacock.png'], ['প্রজাপতি', '🦋', 'asset:draw_butterfly.png'], ['খরগোশ', '🐰', 'asset:draw_rabbit.png'], ['ডলফিন', '🐬', 'asset:draw_dolphin.png'], ['পান্ডা', '🐼', 'asset:draw_panda.png'], ['জিরাফ', '🦒', 'asset:draw_giraffe.png']] },
  sports: { name: 'প্রিয় খেলা', items: [['ফুটবল', '⚽'], ['ক্রিকেট', '🏏'], ['ব্যাডমিন্টন', '🏸'], ['হকি', '🏑'], ['দাবা', '♟️'], ['বাস্কেটবল', '🏀'], ['টেনিস', '🎾'], ['ভলিবল', '🏐']] },
  fruits: { name: 'প্রিয় ফল', items: [['আম', '🥭'], ['কলা', '🍌'], ['আপেল', '🍎'], ['আঙুর', '🍇'], ['তরমুজ', '🍉'], ['আনারস', '🍍'], ['কমলালেবু', '🍊'], ['স্ট্রবেরি', '🍓']] },
  food: { name: 'প্রিয় খাবার', items: [['আইসক্রিম', '🍦'], ['কেক', '🎂'], ['চকোলেট', '🍫'], ['মোমো', '🥟'], ['পিৎজা', '🍕'], ['নুডলস', '🍜'], ['পপকর্ন', '🍿'], ['ডোনাট', '🍩']] },
  greats: { name: 'মনীষী', items: [['রবীন্দ্রনাথ ঠাকুর', ''], ['স্বামী বিবেকানন্দ', ''], ['নেতাজি সুভাষচন্দ্র বসু', ''], ['ঈশ্বরচন্দ্র বিদ্যাসাগর', ''], ['কাজী নজরুল ইসলাম', ''], ['এ. পি. জে. আবদুল কালাম', ''], ['জগদীশচন্দ্র বসু', ''], ['সত্যজিৎ রায়', '']] },
  cartoons: { name: 'প্রিয় কার্টুন', items: [['ছোটা ভীম', ''], ['গোপাল ভাঁড়', ''], ['মোটু পাতলু', ''], ['ডোরেমন', ''], ['টম ও জেরি', ''], ['নন্টে ফন্টে', ''], ['হাঁদা ভোঁদা', ''], ['বাঁটুল দি গ্রেট', '']] },
};
function drawItems(theme) { return (DRAW_THEMES[theme] || DRAW_THEMES.animals).items.map(([label, emoji, image]) => ({ label, emoji, image: image || '' })); }

const DEFAULT_GIFTS = [
  ['ফল', 'আম'], ['কবি', 'রবীন্দ্রনাথ ঠাকুর'], ['ফুল', 'গোলাপ'], ['বিজ্ঞানী', 'সত্যেন্দ্রনাথ বসু'],
  ['স্বাধীনতা সংগ্রামী', 'নেতাজি সুভাষচন্দ্র বসু'], ['খাবার', 'রসগোল্লা'], ['বই', 'পথের পাঁচালী'], ['খেলোয়াড়', 'সৌরভ গঙ্গোপাধ্যায়'],
];
const GIFT_CATEGORIES = ['খাবার', 'সাংস্কৃতিক বিষয়', 'ফল', 'বই', 'ফুল', 'মনীষী', 'বিজ্ঞানী', 'স্বাধীনতা সংগ্রামী', 'কবি', 'লেখক', 'খেলোয়াড়'];

/** Office-style formatting for each kind of stage text. color '' = follow the theme. */
function defaultTextStyles() {
  const base = { font: 'Hind Siliguri', size: 1, bold: true, italic: false, underline: false, color: '' };
  return {
    question: Object.assign({}, base, { align: 'center' }),
    option: Object.assign({}, base, { align: 'left' }),
    title: Object.assign({}, base, { align: 'center' }),
    team: Object.assign({}, base, { align: 'left' }),
    answer: Object.assign({}, base, { align: 'left' }),
  };
}

/** V100 team codes: the teams are always called A / 1 … H / 8 (then I / 9 …). */
function teamCode(i) { return String.fromCharCode(65 + (i % 26)) + ' / ' + (i + 1); }
const GENERIC_TEAM_NAME = /^(দল\s*[০-৯0-9]+|Team\s*[0-9]+|[A-Z]\s*\/\s*[0-9]+)?$/;

function defaultTeam(i) {
  return {
    id: 'T' + (i + 1), name: teamCode(i), school: '', captain: '', players: ['', '', ''],
    photo: '', captainPhoto: '', playerPhotos: ['', '', ''], color: TEAM_COLORS[i % TEAM_COLORS.length], emblem: '',
    prelim: { marks: [], manual: null, stars: null },
    gift: { category: (DEFAULT_GIFTS[i] || ['', ''])[0], item: (DEFAULT_GIFTS[i] || ['', ''])[1], image: '' },
  };
}

const ROUND_TYPE_DEFAULTS = {
  standard: { direct: 10, options4: 5, options2: 3, pass: 5, wrong: 0, passWrong: 0, bonusStep: 0, challengeRight: 10, challengeWrong: -5, rapidRight: 5, rapidWrong: -5, manualBonus: 5, challengeAsPlayed: false, challengeWrongOptions: -5 },
};
function defaultScoring() { return Object.assign({}, ROUND_TYPE_DEFAULTS.standard); }

/** Translate the V100 round profiles into explicit V66 feature switches. */
function roundFromSeed(r, i) {
  if (/^R\d+$/.test(str(r.id))) i = Math.max(0, parseInt(str(r.id).slice(1), 10) - 1); // colours, animation and turn direction follow the round's own number (R3 stays A → H with round 2 gone)
  const p = isObj(r.profile) ? r.profile : {};
  const type = r.type === 'audio' ? 'bonus' : r.type === 'rapid' ? 'rapid' : 'standard';
  const palette = [['#1f4fa3', '#b8913f', '#f2d488'], ['#155e75', '#b8913f', '#f2d488'], ['#3f3a9e', '#b8913f', '#f2d488'], ['#059669', '#34d399', '#ffd166'], ['#ea580c', '#fbbf24', '#fff1a8'], ['#0891b2', '#67e8f9', '#ffd166'], ['#4f46e5', '#a5b4fc', '#ffd166']][i % 7];
  return {
    id: str(r.id || 'R' + (i + 1), 12), name: str(r.name || 'রাউন্ড ' + bn(i + 1), 120), label: str(r.label, 160), rules: str(r.rules, 4000),
    description: '', type, enabled: !r.skip, // WA0002: rounds marked skip stay in the file but are left out of the show
    features: {
      options: type === 'rapid' ? true : !!p.options, judgeOptions: !!p.judge, pass: type !== 'rapid' && p.pass !== false, passAfterOptions: !!p.passOpt,
      challenge: !!p.hands, challengeAfterWrong: !!p.afterWrong, noChallengeOnTwo: !!p.noTwo, cutToTwo: !p.noCut, singleChallenger: p.single !== false, lifelines: type === 'standard' && p.lifelines !== false, twoOptions: type === 'rapid',
    },
    // challengeAsPlayed: a challenge is worth what the answering team played for — correct +10 / +5, wrong challengeWrong (direct) or challengeWrongOptions (with options)
    scoring: Object.assign(defaultScoring(), type === 'bonus' ? { direct: 10, pass: 10, bonusStep: 2 } : {}, p.challengeWrong != null ? { challengeWrong: int(p.challengeWrong, -5) } : {}, p.challengeAsPlayed ? { challengeAsPlayed: true } : {}, p.challengeWrongOpt != null ? { challengeWrongOptions: int(p.challengeWrongOpt, -5) } : {}),
    timers: { direct: type === 'rapid' ? 15 : 60, pass: 45, raise: 5 }, // rapid fire: 15 seconds a question
    multiplier: 1,
    rulesImage: '',
    design: { primary: palette[0], secondary: palette[1], accent: palette[2], bg: '', anim: ROUND_ANIMS[i % ROUND_ANIMS.length], theme: '', titleFont: '', questionFont: '', optionFont: '', qScale: 1, music: '', timerStyle: 'ring' },
    sounds: { correct: '', wrong: '', reveal: '' },
    voiceIntro: true,
    turn: 0,
    // each round every team chooses once (8 turns); round 1 A→H, round 2 H→A, round 3 A→H; the remaining numbers are audience questions
    turnOrder: i % 2 ? 'reverse' : 'forward', turnsTaken: [],
  };
}

function questionFromSeed(q, i) {
  const media = isObj(q.media) && q.media.name ? 'asset:' + q.media.name : '';
  return {
    id: str(q.id || 'Q' + (i + 1), 24), roundId: str(q.roundId || 'R1', 12), number: int(q.number, i + 1, 1, 999),
    text: str(q.text), options: arr(q.options).slice(0, 4).map((o) => str(o, 400)), answer: int(q.answer, 0, 0, 3),
    answerText: str(q.answerText, 400), explanation: str(q.explanation, 1200), image: str(q.image || media, 200),
    hint: str(q.hint || q.clue, 400), difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    clip: str(q.clip, 200),
    timer: q.timer == null ? null : int(q.timer, 60, 5, 600), points: q.points == null ? null : int(q.points, 10, -100, 100), speech: str(q.speech, 2000),
    // the host's own recorded reading: question / options / answer (media ids)
    voiceQ: str(q.voiceQ, 200), voiceOpt: str(q.voiceOpt, 200), voiceAns: str(q.voiceAns, 200),
    // the question board shows the subject (a word and a picture) — never anything that gives the answer away
    subject: str(q.subject, 60), subjectIcon: str(q.subjectIcon, 200),
    // picture questions: the stage shows only the picture; the answer is a picture too (wide strip → answer bar, else it replaces the question picture)
    picOnly: !!q.picOnly, answerImage: q.answerMedia ? 'asset:' + str(q.answerMedia, 190) : str(q.answerImage, 200), answerWide: !!q.answerWide,
  };
}

function defaultPrelim() {
  const base = arr(SEED.prelim).map((p) => ({ id: uid('P'), text: str(p.text), answer: str(p.answer, 400), star: !!p.star, image: '', clip: str(p.clip, 200), source: 'v100' }));
  // Default is 20 preliminary questions; the V100 event shipped 15, so the
  // remaining slots are filled from its rehearsal (test) bank and flagged.
  const tests = arr(SEED.testQuestions);
  let k = 0;
  while (base.length < 20 && k < tests.length) {
    const t = tests[k++];
    const opts = arr(t.options);
    base.push({ id: uid('P'), text: str(t.text), answer: str(opts[int(t.answer, 0, 0, 3)] || '', 400), star: (base.length + 1) % 3 === 0, image: '', source: 'test' });
  }
  return base;
}

function defaultState() {
  const show = isObj(SEED.show) ? SEED.show : {};
  const ev = isObj(show.event) ? show.event : {};
  const bannerLines = str(ev.banner).split('\n');
  const rounds = arr(show.rounds).length ? arr(show.rounds).map(roundFromSeed) : Array.from({ length: 7 }, (_, i) => roundFromSeed({}, i));
  const crewPhotos = { 'অরিন্দম গুছাইত': 'asset:crew0', 'সঞ্জয় মণ্ডল': 'asset:crew4' };
  return {
    schema: SCHEMA, rulesVersion: RULES_VERSION, rev: 0, updatedAt: 0,
    event: {
      brandEn: 'QUIZ CORNER', brandBn: 'খেজুরি কুইজ কর্নার', tagline: 'Knowledge is Power',
      programme: str(ev.name), subtitle: bannerLines[0] || '',
      mainTitle: '', // the main rounds' own English title on TV, when one is wanted (opening, round intro, team intro, scoreboard, finale) — none by default
      season: '', year: bannerLines[1] || '',
      organizer: (bannerLines.find((l) => l.startsWith('আয়োজনে')) || '').replace(/^আয়োজনে:\s*/, ''),
      venue: (bannerLines.find((l) => l.startsWith('স্থান')) || '').replace(/^স্থান:\s*/, ''),
      date: '', presenter: '', quizMaster: '', compiler: 'অরিন্দম গুছাইত', editor: '',
      conductedBy: (bannerLines.find((l) => l.startsWith('পরিচালনায়')) || '').replace(/^পরিচালনায়:\s*/, ''),
      credits: str(ev.credits), sponsors: '', welcomeNote: str(ev.overviewNote), ticker: '',
      showTicker: false,
    },
    crew: arr(show.crew).map((c, i) => ({ name: str(c.name, 80), role: str(c.role, 120), about: str(c.about, 500), photo: crewPhotos[str(c.name).trim()] || '' })),
    groupPhoto: '', groupCaption: str(show.groupCaption, 300),
    logo: 'asset:logo',
    winnerPhoto: '',
    poster: { media: '', fit: 'contain', posX: 50, posY: 50, zoom: 1, opacity: 1, anim: 'zoom', bg: '#000000' },
    gallery: [],
    teams: Array.from({ length: 8 }, (_, i) => defaultTeam(i)),
    prelim: {
      count: 15, points: 5, finalistCount: 8, rules: str(show.prelimRules), questions: defaultPrelim(),
      useMatrix: true, drone: true,
      // the selection round is played on the TV (15 questions, ★ 3·6·9·12·15, a video and a song) — switch off when it is held elsewhere
      onStage: true,
    },
    finalists: [], finalistsLocked: false,
    // podium lottery after the welcome: queue = finalists in the order they choose, picks = { card, team, podium }
    draw: { on: true, theme: 'animals', title: 'পোডিয়াম নির্বাচন', items: drawItems('animals'), queue: [], picks: [], pending: -1 },
    rounds,
    questions: arr(SEED.questions).map(questionFromSeed),
    testQuestions: arr(SEED.testQuestions).map(questionFromSeed),
    flipPool: '',
    giftCategories: GIFT_CATEGORIES.slice(),
    sceneFx: {}, // per-scene overrides: { SCENE: { anim, bg, cue } }
    design: {
      theme: 'midnight', colors: Object.assign({}, THEMES.midnight),
      finaleTheme: '', // optional: another theme for the final scoreboard, top 3 and winner
      textFx: 'premium', // premium 3D text motion (directional fly-in, depth, gold border light) | 'classic'
      fonts: { bn: 'Hind Siliguri', en: 'Hind Siliguri', timer: 'Mina' },
      text: defaultTextStyles(),
      box: { show: true, width: 0.28, radius: 2.2, opacity: 0.88 },
      qSpacing: 0, qLeading: 1.42,
      corner: { show: true, pos: 'tr', size: 1, spin: true }, wipe: 'sweep', scoreStrip: true,
      anim: 'flip', animSpeed: 1, motion: true, floor: true, rays: true, particles: true, ringWidth: 7, bgImage: '', vAlign: 'center',
    },
    audio: {
      master: 1, boost: 1.8, musicBoost: 1.6, output: 'control', noMusic: true, bgm: { on: false, vol: 0.35, tagore: true, questionLevel: 0.5 }, themeSting: true, countVoice: true, cdVoice: false, cues: Object.fromEntries(Object.keys(AUDIO_CUES).map((k) => [k, { vol: 1, mute: false, media: '' }])),
      music: {
        theme: { media: 'asset:theme', vol: 1, fadeIn: 1.5, fadeOut: 2, loop: false, delay: 0 },
        welcome: { media: 'asset:welcome', vol: 1, fadeIn: 1.5, fadeOut: 2, loop: false, delay: 0 },
        winner: { media: '', vol: 1, fadeIn: 0.5, fadeOut: 2, loop: false, delay: 0 },
        background: { media: '', vol: 0.35, fadeIn: 2, fadeOut: 2, loop: true, delay: 0 },
      },
    },
    speech: { enabled: false, rate: 0.92, pitch: 1, voice: '', autoQuestion: false, timerVoice: 'last10', announceTeam: true, rec: true, recVol: 1 },
    display: { webgl: true, strobe: true, fireworks: true, calib: 'off', aspect: '16:9', safeMargin: 0, testCard: false },
    settings: {
      drone: { main: false, speed: 1, path: 'left' }, countdownFrom: 10, countdownStepMs: 1000, warnAt: 10, critAt: 5,
      autoTimer: false, autoPassTimer: true, autoRevealOnCorrect: true, showLifelines: false, operatorRole: 'controller',
      operatorVoice: false, hostAnswer: 'click', coach: true, keyLayout: 'v66', crewAuto: true, crewStepMs: 2800, qAloneSec: 12, giftScenes: false, autoApplause: true, photoFix: true,
    },
    ledger: [],
    show: { scene: 'LOGO', step: 0, params: {}, blackout: false, startedAt: 0 },
    live: emptyLive(),
    timer: { mode: 'direct', duration: 60000, base: 60000, startedAt: 0, remaining: 60000, running: false, token: 0, expired: false },
    board: { played: {}, prevRanks: {} },
    prelimLive: { idx: 0, reveal: false, deliverAt: 0, clipDone: false },
    finalReveal: 0,
    lifelines: {},
  };
}

function emptyLive() {
  // panel: false while the question is alone on the TV (rounds 1–3); the team photo and the timer come in after qAloneSec or on Next
  // clipDone / clipAt: a question's audio / video plays full screen first; then the question (clipAt = when it ended)
  return { panel: false, clipDone: false, clipAt: 0, zoomPic: false, turnDone: false, owner: '', audience: false, clip: { action: 'stop', at: 0 }, locked: false, hands: [], handsJudged: {}, bonusGiven: false, closed: false, qid: '', roundId: '', active: '', flow: 'direct', passChain: [], challenger: '', optionsShown: false, eliminated: [], picked: -1, poll: null, revealed: false, result: '', resultAt: 0, lastPoints: 0, deliverAt: 0, flipped: '' };
}

/** Deep-merge saved/imported data onto defaults so old or partial files never break the engine. */
function mergeDefaults(def, src) {
  if (Array.isArray(def)) return Array.isArray(src) ? src : def;
  // A null default (e.g. a manual preliminary score) accepts any saved value; otherwise the type must match.
  if (def === null) return src === undefined ? null : src;
  if (!isObj(def)) return src === undefined || src === null || typeof src !== typeof def ? def : src;
  const out = {};
  const s = isObj(src) ? src : {};
  for (const k of Object.keys(def)) out[k] = mergeDefaults(def[k], s[k]);
  for (const k of Object.keys(s)) if (!(k in out)) out[k] = s[k];
  return out;
}

/** Bring an older save up to the current built-in rules (13 Oct main stage). */
function upgradeRules(s, def, from = 0) {
  // v33: on the TV only the questions and answers — no programme / competition name, organiser, banner, credits or teachers' photo;
  // the team is Arindam Guchhait and Sanjay Mondal
  // version 44: no music at all — background music, songs and jingles off; the game sounds and a question's own song / video stay
  // the main rounds hold exactly their 10 picture questions and the buzzer round its 16 — any extra question an older save picked up (an import, a typed one) goes
  if (from < 44 && Array.isArray(s.questions)) { const keep = new Set(def.questions.map((q) => q.id)); s.questions = s.questions.filter((q) => isObj(q) && keep.has(q.id)); if (isObj(s.board)) s.board.played = {}; }
  if (from < 44 && isObj(s.audio)) { s.audio.noMusic = true; if (isObj(s.audio.bgm)) s.audio.bgm.on = false; s.audio.cdVoice = false; }
  // versions 37–39: new buzzer-round questions (everyday things nobody thinks about; two options each)
  if (from < 41 && from >= 32 && Array.isArray(s.questions)) { const ids = new Set(def.questions.filter((q) => q.roundId === 'R5').map((q) => q.id)); s.questions = s.questions.filter((q) => !(isObj(q) && (q.roundId === 'R5' || ids.has(q.id)))).concat(def.questions.filter((q) => q.roundId === 'R5')); if (isObj(s.board) && isObj(s.board.played)) ids.forEach((id) => { delete s.board.played[id]; }); }
  // versions 36–38: new selection-round questions (everyday life, recent events; the video at 8 and the song at 15 stay), then 9, 10, 13 new and one-line answers, then all "seen every day, never thought about" questions
  if (from < 43 && isObj(s.prelim)) { s.prelim.questions = def.prelim.questions; s.prelim.count = 15; s.prelim.onStage = true; }
  // version 35: round 2 (চিন্তা ও চয়েস — text questions only) is taken out of the show, with its questions
  if (from < 35) { if (Array.isArray(s.rounds)) s.rounds = s.rounds.filter((r) => !(isObj(r) && r.id === 'R2')); if (Array.isArray(s.questions)) s.questions = s.questions.filter((q) => !(isObj(q) && q.roundId === 'R2')); }
  // version 34: the main rounds keep only their picture questions — the spare text-question rounds (4, 6, 7) and their questions go
  if (from < 34) { const gone = ['R4', 'R6', 'R7']; if (Array.isArray(s.rounds)) s.rounds = s.rounds.filter((r) => !(isObj(r) && gone.includes(r.id))); if (Array.isArray(s.questions)) s.questions = s.questions.filter((q) => !(isObj(q) && gone.includes(q.roundId))); }
  if (from < 33) {
    if (isObj(s.show) && ['ORGANIZER', 'PROGRAMME', 'IDENTITY', 'MAIN_TITLE'].includes(s.show.scene)) Object.assign(s.show, { scene: 'LOGO', step: 0, params: {} });
    if (isObj(s.event)) ['programme', 'subtitle', 'mainTitle', 'season', 'year', 'organizer', 'venue', 'conductedBy', 'credits', 'welcomeNote'].forEach((k) => { s.event[k] = def.event[k]; });
    if (Array.isArray(s.crew)) s.crew = s.crew.filter((c) => isObj(c) && ['অরিন্দম গুছাইত', 'সঞ্জয় মণ্ডল'].includes(str(c.name).trim()));
    if (s.groupPhoto === 'asset:group') s.groupPhoto = ''; s.groupCaption = '';
  }
  // v31: the new selection round (15 questions with a video and a song), played on the TV
  if (from < 32 && isObj(s.prelim)) { s.prelim.questions = def.prelim.questions; s.prelim.count = 15; s.prelim.onStage = true; }
  // v32: the buzzer round's 16 new class-XII questions replace the earlier 20 (rounds 1–3 stay exactly as they are)
  if (from < 32 && Array.isArray(s.questions)) {
    const old = new Set(s.questions.filter((q) => isObj(q) && q.roundId === 'R5').map((q) => q.id));
    s.questions = s.questions.filter((q) => !(isObj(q) && q.roundId === 'R5')).concat(def.questions.filter((q) => q.roundId === 'R5'));
    if (isObj(s.board) && isObj(s.board.played)) old.forEach((id) => { delete s.board.played[id]; });
    const r5 = arr(s.rounds).find((r) => isObj(r) && r.id === 'R5'); const d5 = def.rounds.find((r) => r.id === 'R5');
    if (r5 && d5) { r5.slots = d5.slots; r5.rules = d5.rules; }
  }
  // versions 13–14 kept the main-round title in event.brandEn (the QUIZ CORNER brand): give the brand back, the title has its own field
  if (isObj(s.event) && str(s.event.brandEn).trim().toUpperCase() === 'JUNIOR GENIUS SEASON 4') { s.event.brandEn = def.event.brandEn; if (!str(s.event.mainTitle).trim()) s.event.mainTitle = def.event.mainTitle; }
  // the calm TV look (Midnight Blue · Ivory · Soft Gold) replaces the old neon default — only where the operator had not chosen colours
  if (isObj(s.design) && (!s.design.theme || (s.design.theme === 'broadcast' && from < 12))) { s.design.theme = 'midnight'; s.design.colors = Object.assign({}, THEMES.midnight); }
  // the five calm themes got their final colours — a save still on the earlier shade of the same theme moves to the new one
  const OLD_THEME_BG = { midnight: '#050f29', violetGold: '#120828', tealIvory: '#031c1c', navyCyan: '#040b1c', royalYellow: '#081a4d' };
  if (isObj(s.design) && isObj(s.design.colors) && OLD_THEME_BG[s.design.theme] && str(s.design.colors.bg).toLowerCase() === OLD_THEME_BG[s.design.theme]) s.design.colors = Object.assign({}, THEMES[s.design.theme]);
  const OLD_PRIMARY = ['#7c3aed', '#2563eb', '#db2777'];
  arr(s.rounds).forEach((r, i) => { if (isObj(r) && isObj(r.design) && r.design.primary === OLD_PRIMARY[i] && def.rounds[i]) Object.assign(r.design, { primary: def.rounds[i].design.primary, secondary: def.rounds[i].design.secondary, accent: def.rounds[i].design.accent }); });
  if (OLD_CREW_NAMES.includes(arr(s.crew).map((c) => isObj(c) && str(c.name).trim()).join('|'))) {
    const oldPhotos = arr(s.crew).map((c) => c.photo);
    s.crew = def.crew.map((c, i) => Object.assign(clone(c), { photo: (i < 2 && oldPhotos[i]) || c.photo || '' }));
  }
  if (isObj(s.draw)) arr(s.draw.items).forEach((it) => { if (isObj(it) && it.label === 'এ পি জে আব্দুল কালাম') it.label = 'এ. পি. জে. আবদুল কালাম'; });
  // the default animal cards got pictures — only where the operator had not put a picture of their own
  if (isObj(s.draw) && s.draw.theme === 'animals') arr(s.draw.items).forEach((it) => { const d = isObj(it) && !it.image && DRAW_THEMES.animals.items.find((x) => x[0] === it.label); if (d) it.image = d[2]; });
  if (isObj(s.event) && OLD_CREDITS(str(s.event.credits))) s.event.credits = def.event.credits;
  if (str(s.groupCaption) === 'উত্তর কলমদান বোর্ড প্রাথমিক বিদ্যালয়-এর শিক্ষকমণ্ডলী') s.groupCaption = def.groupCaption; // spelling
  s.rounds = arr(s.rounds).map((r) => {
    const d = def.rounds.find((x) => isObj(r) && x.id === r.id);
    if (!d) return r;
    return Object.assign({}, r, { name: d.name, label: d.label, rules: d.rules, type: d.type, enabled: d.enabled, features: clone(d.features), scoring: clone(d.scoring), timers: clone(d.timers) });
  });
  const seedQ = new Map(def.questions.map((q) => [q.id, q]));
  // Questions the show rewrote get the new wording only where the operator had not changed the old one.
  const prevText = new Map(arr(SEED.questions).map((q) => [q.id, arr(q.prevText).map(String)]));
  const prevExp = new Map(arr(SEED.questions).map((q) => [q.id, arr(q.prevExplanation).map(String)]));
  const prevAns = new Map(arr(SEED.questions).map((q) => [q.id, arr(q.prevAnswerText).map(String)]));
  s.questions = arr(s.questions).map((q) => {
    const d = isObj(q) && seedQ.get(q.id);
    if (!d) return q;
    const out = Object.assign({}, q, { roundId: d.roundId, number: d.number }, !q.image && d.image ? { image: d.image } : {});
    if ((prevText.get(q.id) || []).includes(str(q.text))) Object.assign(out, { text: d.text, options: d.options.slice(), answer: d.answer, answerText: d.answerText, explanation: d.explanation, image: d.image, subject: d.subject, subjectIcon: d.subjectIcon, picOnly: d.picOnly, answerImage: d.answerImage, answerWide: d.answerWide, clue: d.clue, voiceQ: '', voiceOpt: '', voiceAns: '' }); // old readings no longer match
    if (!out.explanation && d.explanation && out.text === d.text) out.explanation = d.explanation;
    if ((prevExp.get(q.id) || []).includes(str(out.explanation))) out.explanation = d.explanation; // a corrected explanation the operator had not changed
    if ((prevAns.get(q.id) || []).includes(str(out.answerText))) out.answerText = d.answerText; // a corrected written answer (spelling) the operator had not changed
    return out;
  });
  // 15 Oct: the main-round questions show no picture (the words come first, readable from far away); the board keeps its subject pictures
  s.questions.forEach((q) => { if (isObj(q) && /^asset:topic_/.test(str(q.image))) q.image = ''; });
  // the question board's subjects arrive in older saves — on questions whose wording is still the show's own
  // (spaces, line breaks and punctuation do not count, so a small touch-up of the wording keeps the picture)
  const same = (a, b) => { const k = (t) => str(t).replace(/[\s\u200c\u200d.,;:!?'"‘’“”।\-–—()]/g, ''); return k(a) === k(b); };
  s.questions.forEach((q) => { const d = isObj(q) && seedQ.get(q.id); if (d && d.subject && !str(q.subject).trim() && same(q.text, d.text)) { q.subject = d.subject; q.subjectIcon = d.subjectIcon || q.subjectIcon; } });
  s.questions.forEach((q) => { const d = isObj(q) && seedQ.get(q.id); if (d && d.subjectIcon && str(q.subject) === str(d.subject) && !str(q.subjectIcon).trim()) q.subjectIcon = d.subjectIcon; });
  // the operator's recorded question readings reach older saves — on questions still worded as recorded, where no recording was set
  s.questions.forEach((q) => { const d = isObj(q) && seedQ.get(q.id); if (d && d.voiceQ && !str(q.voiceQ).trim() && same(q.text, d.text)) q.voiceQ = d.voiceQ; });
  // Questions the show added later (e.g. moved up from the preliminary bank) join an older save.
  const have = new Set(s.questions.map((q) => isObj(q) && q.id));
  def.questions.forEach((q) => { if (!have.has(q.id)) s.questions.push(clone(q)); });
  if (isObj(s.prelim)) {
    s.prelim.count = def.prelim.count; s.prelim.rules = def.prelim.rules;
    const swaps = arr(SEED.prelim).filter((p) => arr(p.prevText).length);
    s.prelim.questions = arr(s.prelim.questions).map((q) => { const sw = isObj(q) && swaps.find((p) => arr(p.prevText).includes(str(q.text))); return sw ? Object.assign({}, q, { text: str(sw.text), answer: str(sw.answer) }) : q; });
  }
  s.flipPool = def.flipPool;
  // Untouched default teams of an older file (12 × "দল N") become the eight teams A / 1 … H / 8.
  const plain = (t) => isObj(t) && GENERIC_TEAM_NAME.test(str(t.name).trim()) && !t.captain && !t.photo && !t.captainPhoto && !arr(t.players).some(Boolean) && !arr(t.playerPhotos).some(Boolean);
  if (arr(s.teams).length > 8 && arr(s.teams).every(plain) && !arr(s.ledger).length) s.teams = s.teams.slice(0, 8);
  if (isObj(s.settings)) { s.settings.showLifelines = false; s.settings.countdownStepMs = 1000; s.settings.countdownFrom = 10; } // 13 Oct: 10, 9 … 1, 0, GO! — one second per number
  if (isObj(s.audio)) {
    s.audio.master = 1;
    Object.values(isObj(s.audio.cues) ? s.audio.cues : {}).forEach((c) => { if (isObj(c)) { c.vol = 1; c.mute = false; } });
    ['theme', 'welcome', 'winner'].forEach((k) => { if (isObj(s.audio.music) && isObj(s.audio.music[k])) s.audio.music[k].vol = 1; });
  }
  if (isObj(s.design)) s.design.corner = Object.assign({}, def.design.corner, isObj(s.design.corner) ? s.design.corner : {}, { show: true });
}

/** 13 Oct main countdown: the operator's own video soundtrack (a woman's voice "Ten … One, GO!" with its music and effects).
    Each number appears on the TV the moment the voice says it: times in ms from the start of the countdown screen. */
// it opens with about 2.5 s of the soundtrack's music (a big hit), then the voice counts
const CD_VOICE = { id: 'asset:cd-voice', at: [2900, 4500, 6000, 7530, 9130, 10700, 12270, 13800, 15470, 17070], go: 18630 };
let cdVoiceHas = null;
function cdVoiceOn(s) {
  if (cdVoiceHas === null && typeof document !== 'undefined') cdVoiceHas = !!document.getElementById('asset-cd-voice');
  return !!(cdVoiceHas && s && s.show && s.show.scene === 'MAIN_COUNTDOWN' && s.audio.cdVoice !== false && s.settings.countdownFrom === 10);
}
/** How many numbers have gone by (0 → "10" on the screen … countdownFrom → GO!). */
function cdStepAt(s, ms) {
  if (cdVoiceOn(s)) { if (ms >= CD_VOICE.go) return 10; let j = 0; for (let k = 1; k < CD_VOICE.at.length; k++) if (ms >= CD_VOICE.at[k]) j = k; return j; }
  return Math.floor(ms / s.settings.countdownStepMs);
}
function cdTotalMs(s) { return cdVoiceOn(s) ? CD_VOICE.go : s.settings.countdownFrom * s.settings.countdownStepMs; }

function normalizeState(raw) {
  // Older saves kept one set of question/option/title sizes; carry them into the per-element styles.
  if (isObj(raw) && isObj(raw.design) && !isObj(raw.design.text) && raw.design.qScale !== undefined) {
    const d = raw.design; const t = defaultTextStyles(); const f = isObj(d.fonts) ? d.fonts : {};
    Object.assign(t.question, { size: num(d.qScale, 1), bold: num(d.qWeight, 700) >= 600, italic: d.qStyle === 'italic', align: d.qAlign || 'center', font: f.question || t.question.font });
    Object.assign(t.option, { size: num(d.optScale, 1), font: f.option || t.option.font });
    Object.assign(t.title, { size: num(d.titleScale, 1), font: f.title || t.title.font });
    d.text = t;
  }
  const def = defaultState();
  const s = mergeDefaults(def, raw);
  s.schema = SCHEMA;
  if (isObj(raw) && num(raw.rulesVersion, 0) < RULES_VERSION) upgradeRules(s, def, num(raw.rulesVersion, 0));
  s.rulesVersion = RULES_VERSION;
  s.teams = arr(s.teams).slice(0, 60).map((t, i) => mergeDefaults(defaultTeam(i), t));
  s.teams.forEach((t, i) => { t.id = str(t.id || 'T' + (i + 1), 24); t.players = arr(t.players).concat(['', '', '']).slice(0, 3).map((p) => str(p, 80)); t.playerPhotos = arr(t.playerPhotos).concat(['', '', '']).slice(0, 3).map((p) => str(p, 120)); if (GENERIC_TEAM_NAME.test(str(t.name).trim())) t.name = teamCode(i); });
  if (!s.teams.length) s.teams = Array.from({ length: 8 }, (_, i) => defaultTeam(i));
  s.rounds = arr(s.rounds).map((r, i) => mergeDefaults(roundFromSeed({ id: r && r.id }, i), r));
  s.questions = arr(s.questions).map((q, i) => mergeDefaults(questionFromSeed({}, i), q));
  s.testQuestions = arr(s.testQuestions).map((q, i) => mergeDefaults(questionFromSeed({}, i), q));
  s.prelim.questions = arr(s.prelim.questions).map((p) => mergeDefaults({ id: uid('P'), text: '', answer: '', star: false, image: '', clip: '', source: '' }, p));
  s.prelim.count = int(s.prelim.count, 20, 1, 100);
  s.prelim.finalistCount = int(s.prelim.finalistCount, 8, 2, 12);
  s.ledger = arr(s.ledger).filter((e) => isObj(e) && e.team);
  const ids = new Set(s.teams.map((t) => t.id));
  s.finalists = arr(s.finalists).filter((id) => ids.has(id));
  const d = s.draw;
  d.items = arr(d.items).slice(0, 12).map((x) => mergeDefaults({ label: '', emoji: '', image: '' }, x));
  if (d.items.length < 8) d.items = d.items.concat(drawItems(d.theme).slice(d.items.length));
  d.queue = arr(d.queue).filter((id) => ids.has(id));
  d.picks = arr(d.picks).filter((p) => isObj(p) && ids.has(p.team)).map((p) => ({ card: int(p.card, 0, 0, 11), team: str(p.team, 24), podium: int(p.podium, 0, 0, 59) }));
  d.pending = int(d.pending, -1, -1, 11);
  s.live = mergeDefaults(emptyLive(), s.live);
  s.timer.duration = int(s.timer.duration, 60000, 1000, 3600000);
  s.timer.base = clamp(num(s.timer.base, s.timer.remaining), 0, 3600000);
  return s;
}
