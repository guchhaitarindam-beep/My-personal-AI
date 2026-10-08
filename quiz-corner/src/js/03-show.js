/* =====================================================================
   SCENE / SHOW ENGINE — the rundown is derived from state, so editing
   teams, rounds or questions instantly updates the running order.
   A step is identified by a stable key, never by a fragile index.
   ===================================================================== */
const SCENES = {
  ORGANIZER: 'আয়োজক ব্যানার', LOGO: 'কুইজ কর্নার লোগো', PROGRAMME: 'অনুষ্ঠান পরিচিতি', THEME: 'থিম সং', IDENTITY: 'আমাদের পরিচয়', CREW: 'আমাদের টিম',
  TEAMS_ALL: 'অংশগ্রহণকারী দল', TEAM_INTRO: 'দল পরিচিতি', OVERVIEW: 'আজকের অনুষ্ঠান', PRELIM_RULES: 'বাছাই পর্বের নিয়ম', PRELIM_COUNTDOWN: 'বাছাই কাউন্টডাউন', PRELIM_Q: 'বাছাই প্রশ্ন',
  PRELIM_RESULT: 'বাছাই ফলাফল', FINALISTS: 'চূড়ান্ত ৮', FINALIST_INTRO: 'মঞ্চে আহ্বান', WELCOME: 'স্বাগত সংগীত', DRAW: 'পোডিয়াম লটারি', GIFT: 'বিশেষ উপস্থাপনা', PODIUM: 'পোডিয়াম',
  MAIN_COUNTDOWN: 'মূল কাউন্টডাউন', ROUND_INTRO: 'রাউন্ড সূচনা', ROUND_RULES: 'রাউন্ডের নিয়ম', GRID: 'প্রশ্ন বোর্ড', QUESTION: 'প্রশ্ন', SCOREBOARD: 'স্কোরবোর্ড',
  FINAL: 'চূড়ান্ত স্কোরবোর্ড', TOP3: 'বিজয়ী মঞ্চ (২-১-৩)', WINNER: 'বিজয়ী', END: 'সমাপনী লোগো', GRAPHIC: 'গ্রাফিক',
};
/** English scene names for the operator's rundown list on the control window.
    SCENES (above) stays Bengali: it is also spoken aloud (status read-out, coach). */
const SCENE_LABELS = {
  ORGANIZER: 'Organizer banner', LOGO: 'Quiz Corner logo', PROGRAMME: 'Programme intro', THEME: 'Theme song', IDENTITY: 'About us', CREW: 'Our team',
  TEAMS_ALL: 'Participating teams', TEAM_INTRO: 'Team intro', OVERVIEW: "Today's programme", PRELIM_RULES: 'Prelim rules', PRELIM_COUNTDOWN: 'Prelim countdown', PRELIM_Q: 'Prelim question',
  PRELIM_RESULT: 'Prelim results', FINALISTS: 'Final 8', FINALIST_INTRO: 'Call to stage', WELCOME: 'Welcome music', DRAW: 'Podium lottery', GIFT: 'Special presentation', PODIUM: 'Podium',
  MAIN_COUNTDOWN: 'Main rounds countdown', ROUND_INTRO: 'Round intro', ROUND_RULES: 'Round rules', GRID: 'Question board', QUESTION: 'Question', SCOREBOARD: 'Scoreboard',
  FINAL: 'Final results', TOP3: 'Top 3 (2-1-3)', WINNER: 'Winner', END: 'Closing logo', GRAPHIC: 'Graphic',
};

const Show = {
  _rd: null,
  _rdSig: '',
  rundown() {
    const s = Store.state;
    const sig = [s.teams.map((t) => t.id).join(), Sel.finalistIds().join(), s.prelim.count, s.prelim.questions.length, s.rounds.map((r) => r.id + r.enabled + (r.rules ? 1 : 0)).join(), s.questions.map((q) => q.id + q.roundId + q.number).join(), Sel.crew().length, !!(s.event.credits || s.groupPhoto), s.draw.on, s.draw.theme, s.draw.title, s.settings.giftScenes].join('|');
    if (sig === this._rdSig && this._rd) return this._rd;
    const out = [];
    const add = (scene, params = {}, label = '') => out.push({ key: scene + (params.key ? ':' + params.key : ''), scene, params, label: label || SCENE_LABELS[scene] || SCENES[scene] });
    add('ORGANIZER'); add('LOGO'); add('PROGRAMME'); add('THEME');
    add('OVERVIEW'); add('PRELIM_RULES'); add('PRELIM_COUNTDOWN');
    Sel.prelimQuestions().forEach((q, i) => add('PRELIM_Q', { key: 'P' + (i + 1), idx: i }, 'Prelim question ' + String(i + 1) + (q.star ? ' ★' : '')));
    add('PRELIM_RESULT'); add('FINALISTS');
    // calling the finalists to the stage: team number, school and preliminary score
    Sel.finalistIds().forEach((id, i) => add('FINALIST_INTRO', { key: id, teamId: id, n: i + 1 }, 'Call to stage • ' + Sel.label(Sel.team(id))));
    add('WELCOME');
    // first thing after the welcome: each finalist draws its podium (and with it its code A / 1 … H / 8)
    if (s.draw.on) add('DRAW', {}, SCENE_LABELS.DRAW + ' • ' + ((DRAW_THEMES[s.draw.theme] || {}).name || ''));
    if (s.event.credits || s.groupPhoto) add('IDENTITY');
    if (Sel.crew().length) add('CREW');
    add('TEAMS_ALL');
    // meet the finalists: the team, then its two members one by one (photos)
    const fin = Sel.finalistIds();
    fin.forEach((id, i) => { const t = Sel.team(id); if (t) add('TEAM_INTRO', { key: id, teamId: id, n: i + 1, of: fin.length }, 'Team intro • ' + Sel.label(t)); });
    // the old "special presentation" cards (one per team) are off by default: the podium lottery replaced them
    if (s.settings.giftScenes) Sel.finalistIds().forEach((id, i) => add('GIFT', { key: id, teamId: id, n: i + 1 }, 'Special presentation • ' + ((Sel.team(id) || {}).name || '')));
    add('PODIUM'); add('MAIN_COUNTDOWN');
    s.rounds.forEach((r, ri) => {
      if (!r.enabled) return;
      add('ROUND_INTRO', { key: r.id, roundId: r.id }, 'Round ' + String(ri + 1) + ' • ' + r.name);
      if (r.rules) add('ROUND_RULES', { key: r.id, roundId: r.id }, 'Rules • ' + r.name);
      add('GRID', { key: r.id, roundId: r.id }, 'Question board • ' + r.name);
      Sel.roundQuestions(r.id).forEach((q) => add('QUESTION', { key: q.id, roundId: r.id, qid: q.id }, r.name + ' • Question ' + String(q.number)));
      add('SCOREBOARD', { key: r.id, roundId: r.id }, 'Scoreboard • ' + r.name);
    });
    add('FINAL'); add('TOP3'); add('WINNER'); add('END');
    this._rd = out; this._rdSig = sig;
    return out;
  },
  currentKey() { const sh = Store.state.show; return sh.scene + (sh.params && sh.params.key ? ':' + sh.params.key : ''); },
  index() { const k = this.currentKey(); return this.rundown().findIndex((x) => x.key === k); },

  /** Activate a rundown step (or an ad-hoc scene). Runs the scene's enter actions. */
  go(step, sub) {
    if (!step) return false;
    const prev = Store.state.show.scene;
    if (prev === 'SCOREBOARD' || prev === 'FINAL') this.snapshotRanks();
    Store.commit('scene:' + step.key, (s) => {
      s.show.scene = step.scene; s.show.params = clone(step.params || {}); s.show.startedAt = now(); s.show.blackout = false;
      const sr = Show.subRange(step.scene, s.show.params);
      if (sr) s.show.params.sub = sub === 'end' ? sr[1] : sr[0];
      if (step.scene === 'PRELIM_Q') { s.prelimLive = { idx: step.params.idx, reveal: false, deliverAt: now() }; }
      if (step.scene === 'FINAL') s.finalReveal = 0;
      if (step.scene !== 'QUESTION' && step.scene !== 'SCOREBOARD') {
        // Leaving the question flow: make sure no orphan timer keeps running on another scene.
        if (s.timer.running && !['QUESTION', 'PRELIM_Q'].includes(step.scene)) { s.timer.running = false; s.timer.base = Sel.timerRemaining(s.timer); s.timer.token += 1; }
      }
    });
    this.onEnter(step);
    return true;
  },
  onEnter(step) {
    const s = Store.state;
    const p = step.params || {};
    const override = (s.sceneFx[step.scene] || {}).cue;
    // Scene cue: per-scene override from the Scene Engine, 'none' silences it.
    const play = (name) => { const n = override || name; if (n && n !== 'none') Cue.play(n, { round: p.roundId }); };
    switch (step.scene) {
      case 'THEME': if (override) play(); Cue.music('theme', 'play'); break;
      case 'WELCOME': if (override) play(); Cue.music('welcome', 'play'); break;
      case 'DRAW': Draw.ensure(); play('transition'); break;
      case 'TEAM_INTRO': case 'FINALIST_INTRO': play('teamintro'); if (s.speech.announceTeam) { const t = Sel.team(p.teamId); if (t) Speech.say(t.name + (t.school ? '। ' + t.school : ''), 'team'); } break;
      case 'PRELIM_COUNTDOWN': case 'MAIN_COUNTDOWN': if (override) play(); break; // the countdown clock emits its own beeps
      case 'PRELIM_Q': play(s.prelim.drone ? 'drone' : 'delivery'); if (s.speech.autoQuestion) setTimeout(() => Speech.readQuestion(false), s.prelim.drone ? this.droneMs() : 600); break;
      case 'ROUND_INTRO': if (override) play(); { const n = s.rounds.filter((x) => x.enabled).findIndex((x) => x.id === p.roundId) + 1; if (!override) Cue.play('roundintro', { n }); } { const r = Sel.round(p.roundId); if (r && r.voiceIntro) Speech.say(r.name + '। ' + r.label, 'round'); if (r && r.design.music) Cue.music('background', 'play', r.design.music); else if (s.audio.themeSting) { Cue.music('theme', 'play'); const at = Store.state.show.startedAt; clearTimeout(this.stingT); this.stingT = setTimeout(() => { Cue.music('theme', 'stop'); void at; }, 6500); } } break;
      case 'QUESTION': if (s.live.qid !== p.qid) Game.load(p.qid, Game.turnFor(p.roundId)); else if (override) play(); break;
      case 'SCOREBOARD': {
        play('scoreboard');
        const star = p.roundId ? Sel.roundStar(p.roundId) : null;
        if (star) { setTimeout(() => Cue.play('applause'), 1300); if (s.speech.enabled) Speech.say('রাউন্ড স্টার: ' + star.teams.map((t) => t.name).join(' ও '), 'team'); }
        break;
      }
      case 'FINAL': {
        play('drumroll');
        const ties = Sel.ties();
        if (ties.length) UI.toast('⚠ Tie: ' + ties.join(' • ') + ' — settle the tie-breaker before revealing', 'err');
        break;
      }
      case 'TOP3': play('fanfare'); break;
      case 'WINNER': Cue.music('winner', 'play'); play('fanfare'); setTimeout(() => Cue.play('applause'), 3300); { const w = this.winner(); if (w && s.speech.enabled) Speech.say('বিজয়ী দল ' + w.team.name, 'team'); } break;
      default: play('transition');
    }
  },
  /** Scenes revealed in small steps inside one rundown entry (V100): the organising team card by card,
      a team's two members one by one. Returns [first, last] or null. */
  subRange(scene, p) {
    if (scene === 'CREW') return [1, Math.max(1, Sel.crew().length)];
    if (scene === 'TEAM_INTRO') return [0, Sel.members(Sel.team(p && p.teamId)).length];
    if (scene === 'SCOREBOARD') return [0, 1]; // code order first, then the ranking and the round champion
    return null;
  },
  /** Move one sub-step; false when the scene has no more steps that way. */
  sub(d) {
    const sh = Store.state.show; const r = this.subRange(sh.scene, sh.params);
    if (!r) return false;
    const cur = int(sh.params.sub, r[0]); const n = cur + d;
    if (n < r[0] || n > r[1]) return false;
    Store.commit('sub-step', (s) => { s.show.params.sub = n; }, { undo: false });
    if (d > 0 && sh.scene === 'SCOREBOARD') {
      // the ranking rises from the last place; drumroll, then fanfare and applause for the round champion
      Cue.play('drumroll');
      const rows = Sel.standings().length; const at = Store.state.show.startedAt;
      clearTimeout(this.champT); this.champT = setTimeout(() => { if (Store.state.show.startedAt !== at) return; Cue.play('fanfare'); setTimeout(() => Cue.play('applause'), 900); }, rows * 500 + 700);
      return true;
    }
    if (d > 0) {
      Cue.play('transition');
      const st = Store.state;
      if (sh.scene === 'TEAM_INTRO' && st.speech.announceTeam) { const m = Sel.members(Sel.team(sh.params.teamId))[n - 1]; if (m && m.name) Speech.say(m.name, 'team'); }
    }
    return true;
  },
  next() {
    if (this.sub(1)) return true;
    const s = Store.state; const rd = this.rundown();
    // main rounds: after a question the board comes back and the NEXT team chooses; numbers already played stay closed;
    // when every number of the round has been played, Next goes to the round's scoreboard
    const rid = s.show.scene === 'QUESTION' ? s.live.roundId : s.show.scene === 'GRID' ? s.show.params.roundId : '';
    if (rid && rd.some((x) => x.scene === 'GRID' && x.params.roundId === rid)) {
      const left = Sel.roundQuestions(rid).filter((q) => !s.board.played[q.id]).length;
      if (s.show.scene === 'QUESTION') {
        if (s.live.qid && !s.live.turnDone) Store.commit('turn-next', (st) => { const r = st.rounds.find((x) => x.id === rid); if (r) r.turn = (r.turn || 0) + 1; st.live.turnDone = true; }, { undo: false });
        return left ? this.jump('GRID', { key: rid, roundId: rid }) : this.jump('SCOREBOARD', { key: rid, roundId: rid });
      }
      if (left) { if (typeof UI !== 'undefined' && UI.toast) UI.toast('The team chooses a number on the board — press 1–9 (0 = 10). ' + left + ' left. (Scoreboard: S)', 'err'); return false; }
      return this.jump('SCOREBOARD', { key: rid, roundId: rid });
    }
    const i = this.index(); return this.go(rd[Math.min(rd.length - 1, i + 1)] || rd[0]);
  },
  prev() { if (this.sub(-1)) return true; const rd = this.rundown(); const i = this.index(); return this.go(rd[Math.max(0, i - 1)] || rd[0], 'end'); },
  jump(scene, params = {}) {
    const key = scene + (params.key ? ':' + params.key : '');
    const step = this.rundown().find((x) => x.key === key) || { key, scene, params, label: SCENE_LABELS[scene] || SCENES[scene] };
    return this.go(step);
  },
  /** Scoreboard for the current round (or overall) from anywhere. */
  scoreboard() { const r = Sel.currentRound(); return this.jump('SCOREBOARD', r ? { key: r.id, roundId: r.id } : {}); },
  snapshotRanks() {
    const ranks = {};
    Sel.standings().forEach((r) => { ranks[r.team.id] = r.rank; });
    Store.commit('rank-snapshot', (s) => { s.board.prevRanks = ranks; }, { undo: false });
  },
  winner() { const st = Sel.standings(); return st[0] || null; },
  droneMs() { return Math.round(3600 / clamp(Store.state.settings.drone.speed, 0.4, 3)); },
  revealFinalNext() {
    const n = Sel.finalistIds().length;
    if (Store.state.finalReveal >= n) return false;
    Store.commit('final-reveal', (s) => { s.finalReveal = Math.min(n, s.finalReveal + 1); }, { undo: false });
    if (Store.state.finalReveal >= n) { Cue.play('fanfare'); setTimeout(() => Cue.play('applause'), 3300); } else Cue.play('reveal');
    return true;
  },
  toggleBlackout() { Store.commit('blackout', (s) => { s.show.blackout = !s.show.blackout; }, { undo: false }); },
  /** Preliminary dedicated ANSWER control for question idx. */
  prelimShow(idx, reveal) {
    const step = this.rundown().find((x) => x.scene === 'PRELIM_Q' && x.params.idx === idx);
    if (!step) return false;
    if (Show.currentKey() !== step.key) this.go(step);
    if (reveal) {
      Store.commit('prelim-answer', (s) => { s.prelimLive.reveal = true; });
      Cue.play('reveal');
      Speech.readAnswer(false);
    }
    return true;
  },
  prelimToggleAnswer() {
    if (Store.state.show.scene !== 'PRELIM_Q') return false;
    Store.commit('prelim-answer', (s) => { s.prelimLive.reveal = !s.prelimLive.reveal; });
    if (Store.state.prelimLive.reveal) { Cue.play('reveal'); Speech.readAnswer(false); }
    return true;
  },
  /** Commit the current top-N as the official finalists (editable afterwards). */
  confirmFinalists(ids) {
    const list = (ids || Sel.prelimRanking().slice(0, Store.state.prelim.finalistCount).map((r) => r.team.id)).filter((id) => Sel.team(id));
    Store.commit('finalists', (s) => { s.finalists = list; s.finalistsLocked = true; });
    return list;
  },
};

/** Team whose turn it is for a round (rotates through finalists). */
Game.turnFor = function turnFor(rid) { return Sel.turnTeam(Sel.round(rid)); };

/* =====================================================================
   DESIGN SYSTEM — writes CSS custom properties from state.design.
   ===================================================================== */
const DesignSystem = {
  lastSig: '',
  apply() {
    const d = Store.state.design;
    const sig = JSON.stringify(d);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const root = document.documentElement.style;
    const c = d.colors;
    const set = (k, v) => root.setProperty(k, v);
    set('--bg', c.bg); set('--bg2', c.bg2); set('--text', c.text); set('--muted', c.muted); set('--accent', c.accent); set('--accent2', c.accent2);
    set('--gold', c.gold); set('--neon', c.neon); set('--panel-solid', c.panel); set('--correct', c.correct); set('--wrong', c.wrong);
    set('--timer', c.timer); set('--warn', c.warn); set('--crit', c.crit); set('--glow', String(c.glow == null ? 1 : c.glow));
    const f = (n) => FONT_MAP[n] || ("'" + n + "', 'Hind Siliguri', sans-serif");
    set('--font-bn', f(d.fonts.bn)); set('--font-en', f(d.fonts.en)); set('--font-timer', f(d.fonts.timer));
    // Office-style per-element text formatting.
    const T = d.text;
    const TP = { question: 'q', option: 'o', title: 'ti', team: 'tm', answer: 'an' };
    for (const [k, p] of Object.entries(TP)) {
      const t = T[k]; if (!t) continue;
      set('--' + p + '-font', f(t.font)); set('--' + p + '-scale', String(t.size)); set('--' + p + '-weight', t.bold ? '800' : '500');
      set('--' + p + '-style', t.italic ? 'italic' : 'normal'); set('--' + p + '-decor', t.underline ? 'underline' : 'none'); set('--' + p + '-align', t.align);
      if (t.color) set('--' + p + '-color', t.color); else root.removeProperty('--' + p + '-color');
    }
    set('--font-title', f(T.title.font)); set('--font-q', f(T.question.font)); set('--font-opt', f(T.option.font));
    set('--box-w', String(d.box.show ? d.box.width : 0)); set('--box-r', String(d.box.radius)); set('--panel', hexA(c.panel, d.box.opacity));
    set('--opt-scale', String(T.option.size)); set('--title-scale', String(T.title.size)); set('--q-spacing', d.qSpacing + 'em'); set('--q-leading', String(d.qLeading));
    set('--q-valign', { top: 'flex-start', center: 'center', bottom: 'flex-end' }[d.vAlign] || 'center');
    set('--anim-speed', String(d.animSpeed)); set('--ring-w', String(d.ringWidth));
    document.body.classList.toggle('no-motion', !d.motion);
  },
};
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* =====================================================================
   GRAPHICS ENGINE — particle / neural field, confetti, text fitting.
   One canvas per stage; auto-degrades when frames get slow.
   ===================================================================== */
class FxField {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.parts = []; this.confetti = []; this.slow = 0; this.quality = 1; this.last = performance.now();
    this.resize(); this.seed();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
  }
  resize() { const r = this.c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  seed() { const n = Math.round(70 * this.quality); this.parts = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.00025, vy: (Math.random() - 0.5) * 0.00025, r: Math.random() * 1.8 + 0.4 })); }
  burst(big) {
    const colors = ['#ffd166', '#38e8ff', '#ff6bcb', '#2ef2a0', '#ffffff', '#8b5cf6'];
    const n = big ? 260 : 90;
    for (let i = 0; i < n; i++) this.confetti.push({ x: this.w * (big ? Math.random() : 0.5 + (Math.random() - 0.5) * 0.4), y: big ? -20 - Math.random() * this.h * 0.5 : this.h * 0.45, vx: (Math.random() - 0.5) * (big ? 3 : 9), vy: big ? 1 + Math.random() * 3 : -4 - Math.random() * 8, r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, col: colors[i % colors.length], life: 0 });
    if (this.confetti.length > 700) this.confetti.splice(0, this.confetti.length - 700);
  }
  /** Rockets that rise and burst into coloured shells (winner / champion). */
  fireworks(seconds) {
    const until = performance.now() + seconds * 1000;
    clearInterval(this.fwIv);
    this.fwIv = setInterval(() => {
      if (performance.now() > until) { clearInterval(this.fwIv); return; }
      const colors = ['#ffd166', '#38e8ff', '#ff6bcb', '#2ef2a0', '#ffffff', '#ff8a3d'];
      this.rockets = this.rockets || [];
      this.rockets.push({ x: this.w * (0.15 + Math.random() * 0.7), y: this.h, vy: -(this.h / 70) * (0.8 + Math.random() * 0.4), tY: this.h * (0.15 + Math.random() * 0.3), col: colors[Math.floor(Math.random() * colors.length)] });
    }, 650);
  }
  frame(opts) {
    const t = performance.now(); const dt = t - this.last; this.last = t;
    // Performance guard: sustained slow frames halve particle density.
    if (dt > 40) this.slow++; else this.slow = Math.max(0, this.slow - 1);
    if (this.slow > 60 && this.quality > 0.3) { this.quality /= 2; this.seed(); this.slow = 0; Log.add('INFO', 'FX quality reduced for smoothness'); }
    const g = this.ctx; const w = this.w; const h = this.h;
    g.clearRect(0, 0, w, h);
    if (opts.particles) {
      const accent = opts.accent || '#38e8ff';
      g.fillStyle = accent; g.strokeStyle = accent;
      const P = this.parts;
      for (const p of P) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; }
      g.globalAlpha = 0.5;
      for (const p of P) { g.beginPath(); g.arc(p.x * w, p.y * h, p.r, 0, 6.283); g.fill(); }
      if (this.quality >= 0.5) {
        const maxD = 0.14;
        g.lineWidth = 0.6;
        for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x; const dy = (P[i].y - P[j].y) * 0.56; const d = Math.hypot(dx, dy);
          if (d < maxD) { g.globalAlpha = (1 - d / maxD) * 0.22; g.beginPath(); g.moveTo(P[i].x * w, P[i].y * h); g.lineTo(P[j].x * w, P[j].y * h); g.stroke(); }
        }
      }
      g.globalAlpha = 1;
    }
    if (this.rockets && this.rockets.length) {
      for (const r of this.rockets) {
        r.y += r.vy; g.fillStyle = r.col; g.globalAlpha = 0.9; g.fillRect(r.x - 1.5, r.y, 3, 10);
        if (r.y <= r.tY) { r.done = true; const n = Math.round(70 * this.quality) + 20; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; const sp = 2 + Math.random() * 4; this.confetti.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3 + Math.random() * 3, a: 0, va: 0.2, col: r.col, life: 300 }); } }
      }
      this.rockets = this.rockets.filter((r) => !r.done);
      g.globalAlpha = 1;
    }
    if (this.confetti.length) {
      for (const c of this.confetti) { c.vy += 0.12; c.vx *= 0.995; c.x += c.vx; c.y += c.vy; c.a += c.va; c.life++; g.save(); g.translate(c.x, c.y); g.rotate(c.a); g.fillStyle = c.col; g.fillRect(-c.r / 2, -c.r / 4, c.r, c.r / 2); g.restore(); }
      this.confetti = this.confetti.filter((c) => c.y < h + 30 && c.life < 600);
    }
  }
  destroy() { this.ro.disconnect(); }
}

/** Shrinks text until it fits its box — no clipped Bengali conjuncts, no overflow. */
function fitText(el, maxPx, minPx = 12) {
  if (!el || !el.parentElement) return;
  const box = el.parentElement;
  const H = box.clientHeight; const W = box.clientWidth;
  if (!H || !W) return;
  el.classList.add('fitted');
  let lo = minPx; let hi = Math.max(minPx, maxPx); let best = lo;
  for (let i = 0; i < 14 && lo <= hi; i++) {
    const mid = (lo + hi) / 2;
    el.style.setProperty('--fit-size', mid + 'px');
    if (el.scrollHeight <= H + 1 && el.scrollWidth <= W + 1) { best = mid; lo = mid + 0.5; } else hi = mid - 0.5;
  }
  el.style.setProperty('--fit-size', best + 'px');
}

/* ---------- Drone + trophy artwork (inline SVG, no external files) ---------- */
const DRONE_SVG = `<svg viewBox="0 0 400 300" aria-hidden="true">
  <defs><linearGradient id="dbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9edff"/><stop offset="1" stop-color="#7d86b8"/></linearGradient>
  <radialGradient id="dlight"><stop offset="0" stop-color="#38e8ff"/><stop offset="1" stop-color="#38e8ff" stop-opacity="0"/></radialGradient></defs>
  <g stroke="#2a2f5a" stroke-width="3">
    <line x1="120" y1="88" x2="40" y2="58"/><line x1="280" y1="88" x2="360" y2="58"/><line x1="140" y1="104" x2="70" y2="130"/><line x1="260" y1="104" x2="330" y2="130"/>
  </g>
  <g fill="#1d2244"><rect x="30" y="50" width="20" height="14" rx="4"/><rect x="350" y="50" width="20" height="14" rx="4"/><rect x="60" y="122" width="20" height="14" rx="4"/><rect x="320" y="122" width="20" height="14" rx="4"/></g>
  <g fill="rgba(200,220,255,.55)"><ellipse class="rotor" cx="40" cy="48" rx="38" ry="5"/><ellipse class="rotor" cx="360" cy="48" rx="38" ry="5"/><ellipse class="rotor" cx="70" cy="120" rx="38" ry="5"/><ellipse class="rotor" cx="330" cy="120" rx="38" ry="5"/></g>
  <path d="M120 80 Q200 50 280 80 L268 112 Q200 128 132 112 Z" fill="url(#dbody)" stroke="#3b4170" stroke-width="3"/>
  <circle cx="200" cy="96" r="14" fill="#0b0f2a" stroke="#38e8ff" stroke-width="3"/><circle cx="200" cy="96" r="5" fill="#38e8ff"/>
  <circle cx="200" cy="150" r="60" fill="url(#dlight)" opacity=".35"/>
  <g class="paper"><line x1="190" y1="118" x2="185" y2="160" stroke="#c9cff5" stroke-width="2"/><line x1="210" y1="118" x2="215" y2="160" stroke="#c9cff5" stroke-width="2"/>
    <rect x="160" y="158" width="80" height="58" rx="6" fill="#fff8e1" stroke="#ffd166" stroke-width="4"/>
    <line x1="172" y1="176" x2="228" y2="176" stroke="#c8a24a" stroke-width="4"/><line x1="172" y1="190" x2="220" y2="190" stroke="#c8a24a" stroke-width="4"/><line x1="172" y1="204" x2="212" y2="204" stroke="#c8a24a" stroke-width="4"/>
    <text x="200" y="152" text-anchor="middle" font-size="22" font-weight="800" fill="#ffd166">?</text></g>
</svg>`;

const TROPHY_SVG = `<svg class="trophy" viewBox="0 0 200 240" aria-hidden="true"><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffd166"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs>
<path d="M50 20 H150 V70 Q150 130 100 140 Q50 130 50 70 Z" fill="url(#tg)" stroke="#8a6508" stroke-width="4"/>
<path d="M50 34 H22 Q18 80 56 96" fill="none" stroke="url(#tg)" stroke-width="10"/><path d="M150 34 H178 Q182 80 144 96" fill="none" stroke="url(#tg)" stroke-width="10"/>
<rect x="88" y="138" width="24" height="44" fill="url(#tg)"/><rect x="58" y="182" width="84" height="20" rx="4" fill="url(#tg)"/><rect x="44" y="202" width="112" height="26" rx="6" fill="#3a2a05" stroke="#ffd166" stroke-width="3"/>
<path d="M100 44 l8 17 19 3 -14 13 4 19 -17 -9 -17 9 4 -19 -14 -13 19 -3 Z" fill="#fff8d6"/></svg>`;
