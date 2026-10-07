/* =====================================================================
   APP CORE — utilities, constants, default show, schema normalisation.
   Everything lives inside one IIFE (added by the build); the only global
   is window.QC, a read-only handle used by the self-test and Playwright.
   ===================================================================== */
const VERSION = '66.0';
const SCHEMA = 66;
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
  broadcast: { label: 'ব্রডকাস্ট ভায়োলেট (ডিফল্ট)', bg: '#05030f', bg2: '#140a3a', text: '#ffffff', muted: '#c7cbef', accent: '#38e8ff', accent2: '#8b5cf6', gold: '#ffd166', neon: '#38e8ff', panel: '#0d0a26', correct: '#2ef2a0', wrong: '#ff4d6d', timer: '#38e8ff', warn: '#ffb020', crit: '#ff3b5c', glow: 1 },
  daylight: { label: 'দিনের আলো — সর্বোচ্চ কনট্রাস্ট', bg: '#000000', bg2: '#0a0a1a', text: '#ffffff', muted: '#f2f2f2', accent: '#00f0ff', accent2: '#6a5cff', gold: '#ffe14d', neon: '#ffffff', panel: '#000000', correct: '#00ff8c', wrong: '#ff2a4a', timer: '#00f0ff', warn: '#ffc400', crit: '#ff1f3d', glow: .6 },
  led: { label: 'স্টেজ LED নিয়ন', bg: '#02010a', bg2: '#1d0640', text: '#ffffff', muted: '#d7d0ff', accent: '#ff3df2', accent2: '#3d7bff', gold: '#ffe066', neon: '#ff3df2', panel: '#0c0424', correct: '#3dff9e', wrong: '#ff3d6e', timer: '#3dd9ff', warn: '#ffb020', crit: '#ff2050', glow: 1.4 },
  royal: { label: 'রাজকীয় সোনালি', bg: '#07040a', bg2: '#2a1606', text: '#fffaf0', muted: '#ead9b8', accent: '#ffcf5a', accent2: '#b5651d', gold: '#ffd700', neon: '#ffcf5a', panel: '#140b04', correct: '#4dffa6', wrong: '#ff5a5a', timer: '#ffcf5a', warn: '#ff9f1c', crit: '#ff3b3b', glow: 1 },
};
const AUDIO_CUES = {
  transition: 'দৃশ্য পরিবর্তন', delivery: 'প্রশ্ন আগমন', drone: 'ড্রোন', countdown: 'কাউন্টডাউন বিপ', impact: 'কাউন্টডাউন শেষ (ইমপ্যাক্ট)',
  tick: 'টিক (শেষ ১০ সেকেন্ড)', warning: 'সতর্কতা (১০/৫ সেকেন্ড)', timeout: 'সময় শেষ', correct: 'সঠিক', wrong: 'ভুল', reveal: 'উত্তর প্রকাশ',
  pass: 'পাস', challenge: 'চ্যালেঞ্জ', lifeline: 'লাইফলাইন', scoreboard: 'স্কোরবোর্ড', fanfare: 'বিজয়ী ফ্যানফেয়ার', teamintro: 'দল পরিচিতি', roundintro: 'রাউন্ড শুরু',
};
const MUSIC_SLOTS = { theme: 'থিম সং', welcome: 'স্বাগত সংগীত', winner: 'বিজয়ী সংগীত', background: 'পটভূমি সংগীত' };

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

function defaultTeam(i) {
  return {
    id: 'T' + (i + 1), name: 'দল ' + bn(i + 1), school: '', captain: '', players: ['', '', ''],
    photo: '', playerPhotos: ['', '', ''], color: TEAM_COLORS[i % TEAM_COLORS.length], emblem: '',
    prelim: { marks: [], manual: null, stars: null },
    gift: { category: (DEFAULT_GIFTS[i] || ['', ''])[0], item: (DEFAULT_GIFTS[i] || ['', ''])[1], image: '' },
  };
}

const ROUND_TYPE_DEFAULTS = {
  standard: { direct: 10, options4: 5, options2: 3, pass: 5, wrong: 0, bonusStep: 0, challengeRight: 10, challengeWrong: -5, rapidRight: 5, rapidWrong: -5 },
};
function defaultScoring() { return Object.assign({}, ROUND_TYPE_DEFAULTS.standard); }

/** Translate the V100 round profiles into explicit V66 feature switches. */
function roundFromSeed(r, i) {
  const p = isObj(r.profile) ? r.profile : {};
  const type = r.type === 'audio' ? 'bonus' : r.type === 'rapid' ? 'rapid' : 'standard';
  const palette = [['#7c3aed', '#38e8ff', '#ffd166'], ['#2563eb', '#22d3ee', '#ffd166'], ['#db2777', '#f472b6', '#ffe066'], ['#059669', '#34d399', '#ffd166'], ['#ea580c', '#fbbf24', '#fff1a8'], ['#0891b2', '#67e8f9', '#ffd166'], ['#4f46e5', '#a5b4fc', '#ffd166']][i % 7];
  return {
    id: str(r.id || 'R' + (i + 1), 12), name: str(r.name || 'রাউন্ড ' + bn(i + 1), 120), label: str(r.label, 160), rules: str(r.rules, 4000),
    description: '', type, enabled: true,
    features: {
      options: type === 'rapid' ? true : !!p.options, judgeOptions: !!p.judge, pass: type !== 'rapid', passAfterOptions: !!p.passOpt,
      challenge: !!p.hands, singleChallenger: p.single !== false, lifelines: type === 'standard', twoOptions: type === 'rapid',
    },
    scoring: Object.assign(defaultScoring(), type === 'bonus' ? { direct: 10, pass: 10, bonusStep: 2 } : {}),
    timers: { direct: 60, pass: 45 },
    design: { primary: palette[0], secondary: palette[1], accent: palette[2], bg: '', anim: ROUND_ANIMS[i % ROUND_ANIMS.length], titleFont: '', questionFont: '', optionFont: '', qScale: 1, music: '', timerStyle: 'ring' },
    sounds: { correct: '', wrong: '', reveal: '' },
    voiceIntro: true,
    turn: 0,
  };
}

function questionFromSeed(q, i) {
  const media = isObj(q.media) && q.media.name ? 'asset:' + q.media.name : '';
  return {
    id: str(q.id || 'Q' + (i + 1), 24), roundId: str(q.roundId || 'R1', 12), number: int(q.number, i + 1, 1, 999),
    text: str(q.text), options: arr(q.options).slice(0, 4).map((o) => str(o, 400)), answer: int(q.answer, 0, 0, 3),
    answerText: str(q.answerText, 400), explanation: str(q.explanation, 1200), image: str(q.image || media, 200),
    timer: q.timer == null ? null : int(q.timer, 60, 5, 600), points: q.points == null ? null : int(q.points, 10, -100, 100), speech: str(q.speech, 2000),
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
  const crewPhotos = { 0: 'asset:crew0', 1: 'asset:crew1' };
  return {
    schema: SCHEMA, rev: 0, updatedAt: 0,
    event: {
      brandEn: 'QUIZ CORNER', brandBn: 'খেজুরি কুইজ কর্নার', tagline: 'Knowledge is Power',
      programme: str(ev.name || 'জুনিয়র জিনিয়াস (সিজন ৪)'), subtitle: bannerLines[0] || 'আন্তঃপ্রাথমিক বিদ্যালয় কুইজ প্রতিযোগিতা',
      season: 'সিজন ৪', year: bannerLines[1] || '২০২৬–২৭ শিক্ষাবর্ষ',
      organizer: (bannerLines.find((l) => l.startsWith('আয়োজনে')) || '').replace(/^আয়োজনে:\s*/, '') || 'টিকাশী গুচ্ছ সম্পদ কেন্দ্র (CRC)',
      venue: (bannerLines.find((l) => l.startsWith('স্থান')) || '').replace(/^স্থান:\s*/, ''),
      date: '', presenter: '', quizMaster: '', compiler: 'অরিন্দম গুছাইত', editor: '',
      conductedBy: (bannerLines.find((l) => l.startsWith('পরিচালনায়')) || '').replace(/^পরিচালনায়:\s*/, '') || 'কুইজ কর্নার',
      credits: str(ev.credits), sponsors: '', welcomeNote: str(ev.overviewNote), ticker: '',
      showTicker: false,
    },
    crew: arr(show.crew).map((c, i) => ({ name: str(c.name, 80), role: str(c.role, 120), photo: crewPhotos[i] || '' })),
    groupPhoto: 'asset:group', groupCaption: str(show.groupCaption, 300),
    logo: 'asset:logo',
    winnerPhoto: '',
    poster: { media: '', fit: 'contain', posX: 50, posY: 50, zoom: 1, opacity: 1, anim: 'zoom', bg: '#000000' },
    gallery: [],
    teams: Array.from({ length: 12 }, (_, i) => defaultTeam(i)),
    prelim: {
      count: 20, points: 5, finalistCount: 8, rules: str(show.prelimRules), questions: defaultPrelim(),
      useMatrix: true, drone: true,
    },
    finalists: [], finalistsLocked: false,
    rounds,
    questions: arr(SEED.questions).map(questionFromSeed),
    testQuestions: arr(SEED.testQuestions).map(questionFromSeed),
    flipPool: 'R7',
    giftCategories: GIFT_CATEGORIES.slice(),
    sceneFx: {}, // per-scene overrides: { SCENE: { anim, bg, cue } }
    design: {
      theme: 'broadcast', colors: Object.assign({}, THEMES.broadcast),
      fonts: { bn: 'Hind Siliguri', en: 'Hind Siliguri', timer: 'Mina' },
      text: defaultTextStyles(),
      box: { show: true, width: 0.28, radius: 2.2, opacity: 0.88 },
      qSpacing: 0, qLeading: 1.42,
      anim: 'flip', animSpeed: 1, motion: true, floor: true, rays: true, particles: true, ringWidth: 7, bgImage: '', vAlign: 'center',
    },
    audio: {
      master: 0.9, output: 'control', cues: Object.fromEntries(Object.keys(AUDIO_CUES).map((k) => [k, { vol: 0.8, mute: false, media: '' }])),
      music: {
        theme: { media: 'asset:theme', vol: 0.85, fadeIn: 1.5, fadeOut: 2, loop: false, delay: 0 },
        welcome: { media: 'asset:welcome', vol: 0.85, fadeIn: 1.5, fadeOut: 2, loop: false, delay: 0 },
        winner: { media: '', vol: 0.9, fadeIn: 0.5, fadeOut: 2, loop: false, delay: 0 },
        background: { media: '', vol: 0.35, fadeIn: 2, fadeOut: 2, loop: true, delay: 0 },
      },
    },
    speech: { enabled: false, rate: 0.92, pitch: 1, voice: '', autoQuestion: false, timerVoice: 'last10', announceTeam: true },
    settings: {
      drone: { main: false, speed: 1, path: 'left' }, countdownFrom: 3, countdownStepMs: 1100, warnAt: 10, critAt: 5,
      autoTimer: false, autoPassTimer: true, autoRevealOnCorrect: true, showLifelines: true, operatorRole: 'controller',
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
  return { locked: false, qid: '', roundId: '', active: '', flow: 'direct', passChain: [], challenger: '', optionsShown: false, eliminated: [], picked: -1, poll: null, revealed: false, result: '', resultAt: 0, lastPoints: 0, deliverAt: 0, flipped: '' };
}

/** Deep-merge saved/imported data onto defaults so old or partial files never break the engine. */
function mergeDefaults(def, src) {
  if (Array.isArray(def)) return Array.isArray(src) ? src : def;
  if (!isObj(def)) return src === undefined || src === null || typeof src !== typeof def ? def : src;
  const out = {};
  const s = isObj(src) ? src : {};
  for (const k of Object.keys(def)) out[k] = mergeDefaults(def[k], s[k]);
  for (const k of Object.keys(s)) if (!(k in out)) out[k] = s[k];
  return out;
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
  s.teams = arr(s.teams).slice(0, 60).map((t, i) => mergeDefaults(defaultTeam(i), t));
  s.teams.forEach((t, i) => { t.id = str(t.id || 'T' + (i + 1), 24); t.players = arr(t.players).concat(['', '', '']).slice(0, 3).map((p) => str(p, 80)); t.playerPhotos = arr(t.playerPhotos).concat(['', '', '']).slice(0, 3).map((p) => str(p, 120)); });
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
  s.live = mergeDefaults(emptyLive(), s.live);
  s.timer.duration = int(s.timer.duration, 60000, 1000, 3600000);
  s.timer.base = clamp(num(s.timer.base, s.timer.remaining), 0, 3600000);
  return s;
}
