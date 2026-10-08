/* =====================================================================
   APP CORE — utilities, constants, default show, schema normalisation.
   Everything lives inside one IIFE (added by the build); the only global
   is window.QC, a read-only handle used by the self-test and Playwright.
   ===================================================================== */
const VERSION = '66.0';
const SCHEMA = 66;
/* Raised whenever the built-in rules change. A save from an older file gets the new rules, round names,
   question placement and loudness defaults; teams, photos, scores and the operator's own question texts stay. */
const RULES_VERSION = 13;
/** The organising team as first shipped — an older save still holding exactly this gets the 13 Oct team (an edited team is kept). */
const OLD_CREW_NAMES = ['অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|মহেশ্বর দাস|প্রতাপ বেড়া|কমলেন্দু মাইতি', 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|সঞ্জয় মণ্ডল', 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পালুই|সঞ্জয় মণ্ডল|সৌরভ মাইতি'];
const OLD_CREDITS = (c) => c.startsWith('প্রশ্ন সংকলন ও ডিজাইন: অরিন্দম গুছাইত') || (c.startsWith('পরিকল্পনা, মূল পর্বের প্রশ্ন সংকলন ও কুইজ ইঞ্জিন: অরিন্দম গুছাইত') && (c.includes('চন্দন পাল ও') || c.includes('চন্দন পালুই') || c.includes('(অধিনায়ক)')) && !c.includes('চন্দন পালই'));
const MODE = /(^|[#&?])stage\b/.test(location.hash + location.search) ? 'stage'
  : /(^|[#&?])host\b/.test(location.hash + location.search) ? 'host' : 'control';
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
const MUSIC_SLOTS = { theme: 'Theme song', welcome: 'Welcome music', winner: 'Winner music', background: 'Background music' };

/** Podium lottery: eight things children love, all of one kind. Each card hides a podium (A / 1 … H / 8). */
const DRAW_THEMES = {
  animals: { name: 'প্রিয় পশুপাখি', items: [['বাঘ', '🐯'], ['হাতি', '🐘'], ['ময়ূর', '🦚'], ['প্রজাপতি', '🦋'], ['খরগোশ', '🐰'], ['ডলফিন', '🐬'], ['পান্ডা', '🐼'], ['জিরাফ', '🦒']] },
  sports: { name: 'প্রিয় খেলা', items: [['ফুটবল', '⚽'], ['ক্রিকেট', '🏏'], ['ব্যাডমিন্টন', '🏸'], ['হকি', '🏑'], ['দাবা', '♟️'], ['বাস্কেটবল', '🏀'], ['টেনিস', '🎾'], ['ভলিবল', '🏐']] },
  fruits: { name: 'প্রিয় ফল', items: [['আম', '🥭'], ['কলা', '🍌'], ['আপেল', '🍎'], ['আঙুর', '🍇'], ['তরমুজ', '🍉'], ['আনারস', '🍍'], ['কমলালেবু', '🍊'], ['স্ট্রবেরি', '🍓']] },
  food: { name: 'প্রিয় খাবার', items: [['আইসক্রিম', '🍦'], ['কেক', '🎂'], ['চকোলেট', '🍫'], ['মোমো', '🥟'], ['পিৎজা', '🍕'], ['নুডলস', '🍜'], ['পপকর্ন', '🍿'], ['ডোনাট', '🍩']] },
  greats: { name: 'মনীষী', items: [['রবীন্দ্রনাথ ঠাকুর', ''], ['স্বামী বিবেকানন্দ', ''], ['নেতাজি সুভাষচন্দ্র বসু', ''], ['ঈশ্বরচন্দ্র বিদ্যাসাগর', ''], ['কাজী নজরুল ইসলাম', ''], ['এ. পি. জে. আবদুল কালাম', ''], ['জগদীশচন্দ্র বসু', ''], ['সত্যজিৎ রায়', '']] },
  cartoons: { name: 'প্রিয় কার্টুন', items: [['ছোটা ভীম', ''], ['গোপাল ভাঁড়', ''], ['মোটু পাতলু', ''], ['ডোরেমন', ''], ['টম ও জেরি', ''], ['নন্টে ফন্টে', ''], ['হাঁদা ভোঁদা', ''], ['বাঁটুল দি গ্রেট', '']] },
};
function drawItems(theme) { return (DRAW_THEMES[theme] || DRAW_THEMES.animals).items.map(([label, emoji]) => ({ label, emoji, image: '' })); }

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
  standard: { direct: 10, options4: 5, options2: 3, pass: 5, wrong: 0, passWrong: 0, bonusStep: 0, challengeRight: 10, challengeWrong: -5, rapidRight: 5, rapidWrong: -5, manualBonus: 5 },
};
function defaultScoring() { return Object.assign({}, ROUND_TYPE_DEFAULTS.standard); }

/** Translate the V100 round profiles into explicit V66 feature switches. */
function roundFromSeed(r, i) {
  const p = isObj(r.profile) ? r.profile : {};
  const type = r.type === 'audio' ? 'bonus' : r.type === 'rapid' ? 'rapid' : 'standard';
  const palette = [['#1f4fa3', '#b8913f', '#f2d488'], ['#155e75', '#b8913f', '#f2d488'], ['#3f3a9e', '#b8913f', '#f2d488'], ['#059669', '#34d399', '#ffd166'], ['#ea580c', '#fbbf24', '#fff1a8'], ['#0891b2', '#67e8f9', '#ffd166'], ['#4f46e5', '#a5b4fc', '#ffd166']][i % 7];
  return {
    id: str(r.id || 'R' + (i + 1), 12), name: str(r.name || 'রাউন্ড ' + bn(i + 1), 120), label: str(r.label, 160), rules: str(r.rules, 4000),
    description: '', type, enabled: !r.skip, // WA0002: rounds marked skip stay in the file but are left out of the show
    features: {
      options: type === 'rapid' ? true : !!p.options, judgeOptions: !!p.judge, pass: type !== 'rapid' && p.pass !== false, passAfterOptions: !!p.passOpt,
      challenge: !!p.hands, singleChallenger: p.single !== false, lifelines: type === 'standard' && p.lifelines !== false, twoOptions: type === 'rapid',
    },
    scoring: Object.assign(defaultScoring(), type === 'bonus' ? { direct: 10, pass: 10, bonusStep: 2 } : {}),
    timers: { direct: 60, pass: 45, raise: 5 },
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
  };
}

function defaultPrelim() {
  const base = arr(SEED.prelim).map((p) => ({ id: uid('P'), text: str(p.text), answer: str(p.answer, 400), star: !!p.star, image: '', source: 'v100' }));
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
  while (rounds.length < 7) rounds.push(roundFromSeed({ id: 'R' + (rounds.length + 1) }, rounds.length));
  const crewPhotos = { 0: 'asset:crew0', 1: 'asset:crew1', 2: 'asset:crew2', 3: 'asset:crew3', 4: 'asset:crew4', 5: 'asset:crew5' };
  return {
    schema: SCHEMA, rulesVersion: RULES_VERSION, rev: 0, updatedAt: 0,
    event: {
      brandEn: 'QUIZ CORNER', brandBn: 'খেজুরি কুইজ কর্নার', tagline: 'Knowledge is Power',
      programme: str(ev.name || 'জুনিয়র জিনিয়াস (সিজন ৪)'), brandEn: 'JUNIOR GENIUS SEASON 4', // the English title of the main rounds (opening, round intro, team intro, question, scoreboard, finale) subtitle: bannerLines[0] || 'আন্তঃপ্রাথমিক বিদ্যালয় কুইজ প্রতিযোগিতা',
      season: 'সিজন ৪', year: bannerLines[1] || '২০২৬–২৭ শিক্ষাবর্ষ',
      organizer: (bannerLines.find((l) => l.startsWith('আয়োজনে')) || '').replace(/^আয়োজনে:\s*/, '') || 'টিকাশী গুচ্ছ সম্পদ কেন্দ্র (CRC)',
      venue: (bannerLines.find((l) => l.startsWith('স্থান')) || '').replace(/^স্থান:\s*/, ''),
      date: '', presenter: '', quizMaster: '', compiler: 'অরিন্দম গুছাইত', editor: '',
      conductedBy: (bannerLines.find((l) => l.startsWith('পরিচালনায়')) || '').replace(/^পরিচালনায়:\s*/, '') || 'কুইজ কর্নার',
      credits: str(ev.credits), sponsors: '', welcomeNote: str(ev.overviewNote), ticker: '',
      showTicker: false,
    },
    crew: arr(show.crew).map((c, i) => ({ name: str(c.name, 80), role: str(c.role, 120), about: str(c.about, 500), photo: crewPhotos[i] || '' })),
    groupPhoto: 'asset:group', groupCaption: str(show.groupCaption, 300),
    logo: 'asset:logo',
    winnerPhoto: '',
    poster: { media: '', fit: 'contain', posX: 50, posY: 50, zoom: 1, opacity: 1, anim: 'zoom', bg: '#000000' },
    gallery: [],
    teams: Array.from({ length: 8 }, (_, i) => defaultTeam(i)),
    prelim: {
      count: 15, points: 5, finalistCount: 8, rules: str(show.prelimRules), questions: defaultPrelim(),
      useMatrix: true, drone: true,
      // 13 Oct: the prelim was held earlier by another teacher — the show starts from its results (school names, scores)
      onStage: false,
    },
    finalists: [], finalistsLocked: false,
    // podium lottery after the welcome: queue = finalists in the order they choose, picks = { card, team, podium }
    draw: { on: true, theme: 'animals', title: 'পোডিয়াম নির্বাচন', items: drawItems('animals'), queue: [], picks: [], pending: -1 },
    rounds,
    questions: arr(SEED.questions).map(questionFromSeed),
    testQuestions: arr(SEED.testQuestions).map(questionFromSeed),
    flipPool: 'R6',
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
      master: 1, boost: 1.8, musicBoost: 1.6, output: 'control', bgm: { on: true, vol: 0.35, tagore: true, questionLevel: 0.5 }, themeSting: true, countVoice: true, cues: Object.fromEntries(Object.keys(AUDIO_CUES).map((k) => [k, { vol: 1, mute: false, media: '' }])),
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
      operatorVoice: false, hostAnswer: 'click', coach: true, keyLayout: 'v66', crewAuto: true, crewStepMs: 2800, giftScenes: false, autoApplause: true,
    },
    ledger: [],
    show: { scene: 'ORGANIZER', step: 0, params: {}, blackout: false, startedAt: 0 },
    live: emptyLive(),
    timer: { mode: 'direct', duration: 60000, base: 60000, startedAt: 0, remaining: 60000, running: false, token: 0, expired: false },
    board: { played: {}, prevRanks: {} },
    prelimLive: { idx: 0, reveal: false, deliverAt: 0 },
    finalReveal: 0,
    lifelines: {},
  };
}

function emptyLive() {
  return { turnDone: false, owner: '', audience: false, clip: { action: 'stop', at: 0 }, locked: false, hands: [], handsJudged: {}, bonusGiven: false, closed: false, qid: '', roundId: '', active: '', flow: 'direct', passChain: [], challenger: '', optionsShown: false, eliminated: [], picked: -1, poll: null, revealed: false, result: '', resultAt: 0, lastPoints: 0, deliverAt: 0, flipped: '' };
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
  if (isObj(s.event) && OLD_CREDITS(str(s.event.credits))) s.event.credits = def.event.credits;
  s.rounds = arr(s.rounds).map((r) => {
    const d = def.rounds.find((x) => isObj(r) && x.id === r.id);
    if (!d) return r;
    return Object.assign({}, r, { name: d.name, label: d.label, rules: d.rules, type: d.type, enabled: d.enabled, features: clone(d.features), scoring: clone(d.scoring), timers: clone(d.timers) });
  });
  const seedQ = new Map(def.questions.map((q) => [q.id, q]));
  // Questions the show rewrote get the new wording only where the operator had not changed the old one.
  const prevText = new Map(arr(SEED.questions).map((q) => [q.id, arr(q.prevText).map(String)]));
  const prevExp = new Map(arr(SEED.questions).map((q) => [q.id, arr(q.prevExplanation).map(String)]));
  s.questions = arr(s.questions).map((q) => {
    const d = isObj(q) && seedQ.get(q.id);
    if (!d) return q;
    const out = Object.assign({}, q, { roundId: d.roundId, number: d.number }, !q.image && d.image ? { image: d.image } : {});
    if ((prevText.get(q.id) || []).includes(str(q.text))) Object.assign(out, { text: d.text, options: d.options.slice(), answer: d.answer, answerText: d.answerText, explanation: d.explanation, image: d.image || out.image, voiceQ: '', voiceOpt: '', voiceAns: '' }); // old readings no longer match
    if (!out.explanation && d.explanation && out.text === d.text) out.explanation = d.explanation;
    if ((prevExp.get(q.id) || []).includes(str(out.explanation))) out.explanation = d.explanation; // a corrected explanation the operator had not changed
    return out;
  });
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
  s.prelim.questions = arr(s.prelim.questions).map((p) => mergeDefaults({ id: uid('P'), text: '', answer: '', star: false, image: '', source: '' }, p));
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
