/* =====================================================================
   STATE STORE — the single source of truth.
   All mutations go through Store.commit(); it records undo history,
   bumps the revision, persists, and broadcasts to the Stage window.
   ===================================================================== */
const Store = {
  state: null,
  past: [],
  future: [],
  rehearsal: false,
  realSnapshot: null,
  saveTimer: 0,
  storageOk: true,
  sandbox: false, // true only while the self-test runs

  init() {
    // Stage/Host read the same saved show so they recover even before Control reconnects.
    const raw = this.readSlots() || this.readLS(LS_KEY);
    this.state = normalizeState(raw || defaultState());
    // A refresh mid-show must never leave a timer "running" from a stale clock domain.
    if (this.state.timer.running && !(this.state.timer.startedAt > 0)) this.state.timer.running = false;
    if (raw) Log.add('INFO', 'Recovered saved show (rev ' + this.state.rev + ')');
  },

  /** V100-style crash safety: two alternating slots, each with a checksum; the newest valid one wins. */
  readSlots() {
    const out = [];
    for (const k of [LS_KEY + '.A', LS_KEY + '.B']) {
      try {
        const t = localStorage.getItem(k); if (!t) continue;
        const env = JSON.parse(t);
        if (env && env.f === 'QC66' && env.sum === sumOf(env.body)) out.push(env);
        else { this.damaged = true; Log.add('WARN', 'Damaged save slot ' + k + ' ignored'); }
      } catch (e) { this.damaged = true; }
    }
    out.sort((a, b) => b.seq - a.seq);
    if (!out.length) return null;
    this.seq = out[0].seq;
    return safe('slot-parse', () => JSON.parse(out[0].body), null);
  },
  seq: 0,
  damaged: false,
  readLS(key) {
    try { const t = localStorage.getItem(key); return t ? JSON.parse(t) : null; } catch (e) { this.storageOk = false; Log.err('storage-read', e); return null; }
  },

  /** Apply a mutation. fn receives the live state object and mutates it. */
  commit(label, fn, opts = {}) {
    const undoable = opts.undo !== false;
    const before = undoable ? clone(this.state) : null;
    let result;
    try {
      result = fn(this.state);
    } catch (e) {
      Log.err('commit:' + label, e);
      if (before) this.state = before; // roll back a half-applied mutation
      UI.toast('Error: ' + (e.message || e), 'err');
      return undefined;
    }
    if (result === false) { return false; } // mutation declined, nothing changed
    if (undoable) {
      this.past.push({ label, snap: before });
      if (this.past.length > 120) this.past.shift();
      this.future.length = 0;
    }
    this.touch(label);
    return result;
  },

  touch(label) {
    this.state.rev += 1;
    this.state.updatedAt = Date.now();
    if (this.sandbox) return;
    this.schedulePersist();
    Bus.emit('change', { label, rev: this.state.rev });
  },

  /** Restore everything except the live clock (timer) so undo never rewinds time. */
  restore(snap, label) {
    const timer = this.state.timer;
    const rev = this.state.rev;
    this.state = snap;
    this.state.timer = timer;
    this.state.rev = rev;
    this.touch(label);
  },
  undo() {
    const h = this.past.pop();
    if (!h) return false;
    this.future.push({ label: h.label, snap: clone(this.state) });
    this.restore(h.snap, 'undo:' + h.label);
    return h.label;
  },
  redo() {
    const h = this.future.pop();
    if (!h) return false;
    this.past.push({ label: h.label, snap: clone(this.state) });
    this.restore(h.snap, 'redo:' + h.label);
    return h.label;
  },

  /** Replace the whole state (import / new event / stage sync). */
  replace(next, label, opts = {}) {
    if (opts.undo !== false && this.state) { this.past.push({ label, snap: clone(this.state) }); this.future.length = 0; }
    this.state = normalizeState(next);
    this.touch(label);
  },

  schedulePersist() {
    if (MODE !== 'control' || this.sandbox) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 250);
  },
  persist() {
    if (MODE !== 'control' || this.sandbox) return;
    try {
      const body = JSON.stringify(this.state);
      if (this.rehearsal) localStorage.setItem(LS_REH, body);
      else {
        this.seq += 1;
        localStorage.setItem(LS_KEY + (this.seq % 2 ? '.A' : '.B'), JSON.stringify({ f: 'QC66', seq: this.seq, savedAt: Date.now(), sum: sumOf(body), body }));
        localStorage.setItem(LS_KEY, body); // plain copy: the stage window and older builds read this
      }
      if (!this.storageOk) { this.storageOk = true; Bus.emit('storage', true); }
    } catch (e) {
      if (this.storageOk) { this.storageOk = false; Log.err('storage-write', e); Bus.emit('storage', false); }
    }
  },

  enterRehearsal(useTestBank) {
    if (this.rehearsal) return;
    this.persist();
    this.realSnapshot = clone(this.state);
    this.rehearsal = true;
    this.commit('rehearsal-on', (s) => {
      if (useTestBank && s.testQuestions.length) {
        // Spread the rehearsal bank across the enabled rounds so every round can be tried.
        const enabled = s.rounds.filter((r) => r.enabled);
        s.questions = s.testQuestions.map((q, i) => Object.assign({}, q, { id: 'TQ' + (i + 1), roundId: (enabled[i % Math.max(1, enabled.length)] || s.rounds[0]).id }));
      }
      s.ledger = [];
      s.board = { played: {}, prevRanks: {} }; s.rounds.forEach((r) => { r.turnsTaken = []; r.turn = 0; });
      s.live = emptyLive();
    }, { undo: false });
    Bus.emit('rehearsal', true);
  },
  exitRehearsal() {
    if (!this.rehearsal) return;
    this.rehearsal = false;
    try { localStorage.removeItem(LS_REH); } catch (e) { /* storage optional */ }
    this.past.length = 0; this.future.length = 0;
    this.state = normalizeState(this.realSnapshot || this.readLS(LS_KEY) || defaultState());
    this.realSnapshot = null;
    this.touch('rehearsal-off');
    Bus.emit('rehearsal', false);
  },
};

/* =====================================================================
   SELECTORS — read-only derivations of state. Never cache scores:
   the ledger is the only place points live.
   ===================================================================== */
const Sel = {
  s() { return Store.state; },
  team(id) { return Store.state.teams.find((t) => t.id === id) || null; },
  teamIndex(id) { return Store.state.teams.findIndex((t) => t.id === id); },
  /** 'A / 1' … by registration position (V100 team codes). */
  code(t) { const i = t ? Store.state.teams.indexOf(t) : -1; return i < 0 ? '' : teamCode(i); },
  /** The code plus the name, unless the name is just the code. */
  /** Podium lottery: before a team has drawn its podium its code is not decided, so the screens up to the lottery show its school / name. */
  drawPicked(id) { return Store.state.draw.picks.some((p) => p.team === id); },
  drawDone() { const d = Store.state.draw; return d.queue.length > 0 && d.picks.length >= d.queue.length; },
  codeHidden(t) { const s = Store.state; return !!(t && s.draw.on && !this.drawPicked(t.id) && ['PRELIM_RESULT', 'FINALISTS', 'FINALIST_INTRO', 'WELCOME', 'DRAW'].includes(s.show.scene)); },
  preName(t) { if (!t) return ''; const n = str(t.name).trim(); return (n && !GENERIC_TEAM_NAME.test(n) && n) || str(t.school).trim() || this.code(t); },
  label(t) { if (!t) return ''; const c = Sel.code(t); const n = str(t.name).trim(); return !n || n === c ? c : c + ' ' + n; },
  /** The two members shown on stage: member 1 = captain, member 2 = first player (V100 rule). */
  members(t) { return t ? [{ slot: 0, name: str(t.captain).trim(), photo: t.captainPhoto || '' }, { slot: 1, name: str(t.players[0]).trim(), photo: t.playerPhotos[0] || '' }].filter((m) => m.name || m.photo) : []; },
  crew() { return Store.state.crew.filter((c) => str(c.name).trim()); },
  /** Number key k (1–9): the finalist whose team code is k (A / 1 → 1), else the k-th finalist. */
  teamByKey(k) { const ids = Sel.finalistIds(); return ids.find((id) => Sel.teamIndex(id) === k - 1) || ids[k - 1] || ''; },
  round(id) { return Store.state.rounds.find((r) => r.id === id) || null; },
  roundIndex(id) { return Store.state.rounds.findIndex((r) => r.id === id); },
  question(id) { return Store.state.questions.find((q) => q.id === id) || null; },
  roundQuestions(rid) { return Store.state.questions.filter((q) => q.roundId === rid).sort((a, b) => a.number - b.number); },
  score(tid) { let t = 0; for (const e of Store.state.ledger) if (e.team === tid) t += e.delta; return t; },
  roundScore(tid, rid) { let t = 0; for (const e of Store.state.ledger) if (e.team === tid && e.round === rid) t += e.delta; return t; },

  /* ---- Preliminary round ---- */
  prelimQuestions() { return Store.state.prelim.questions.slice(0, Store.state.prelim.count); },
  prelimResult(team) {
    const p = Store.state.prelim;
    const qs = this.prelimQuestions();
    const marks = arr(team.prelim.marks);
    let correct = 0; let stars = 0;
    qs.forEach((q, i) => { if (marks[i]) { correct++; if (q.star) stars++; } });
    const manual = team.prelim.manual;
    const score = manual !== null && manual !== '' && manual !== undefined && Number.isFinite(Number(manual)) ? Number(manual) : correct * p.points;
    const starCount = team.prelim.stars !== null && team.prelim.stars !== '' && team.prelim.stars !== undefined && Number.isFinite(Number(team.prelim.stars)) ? Number(team.prelim.stars) : stars;
    return { score, stars: starCount, correct, marks: qs.map((_, i) => !!marks[i]) };
  },
  /** Rules: score ▸ more star answers ▸ earlier correct answers in question order ▸ registration order. */
  prelimRanking() {
    const rows = Store.state.teams.map((t, order) => Object.assign({ team: t, order }, this.prelimResult(t)));
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.stars !== a.stars) return b.stars - a.stars;
      for (let i = 0; i < a.marks.length; i++) if (a.marks[i] !== b.marks[i]) return a.marks[i] ? -1 : 1;
      return a.order - b.order;
    });
    rows.forEach((r, i) => { r.rank = i + 1; r.qualified = i < Store.state.prelim.finalistCount; });
    return rows;
  },
  finalistIds() {
    const s = Store.state;
    const n = s.prelim.finalistCount;
    if (s.finalists.length) return s.finalists.slice(0, Math.max(n, s.finalists.length));
    return this.prelimRanking().slice(0, n).map((r) => r.team.id);
  },
  finalists() { return this.finalistIds().map((id) => this.team(id)).filter(Boolean); },

  /** Standings with competition ranking (1,1,3) and movement since the last scoreboard. */
  standings(ids = this.finalistIds(), rid = '') {
    const rows = ids.map((id, order) => ({ team: this.team(id), score: this.score(id), rscore: rid ? this.roundScore(id, rid) : 0, order })).filter((r) => r.team);
    rows.sort((a, b) => b.score - a.score || a.order - b.order);
    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1;
      const prev = Store.state.board.prevRanks[r.team.id];
      r.move = prev ? prev - r.rank : 0;
    });
    return rows;
  },

  /** Places that share a score; returns readable notes for the top three places. */
  ties(rows = this.standings()) {
    const notes = [];
    const seen = new Set();
    rows.forEach((r) => {
      if (r.rank > 3 || seen.has(r.rank)) return;
      const same = rows.filter((x) => x.rank === r.rank);
      if (same.length > 1) { seen.add(r.rank); notes.push(bn(r.rank) + ' নম্বর স্থানে সমান: ' + same.map((x) => x.team.name).join(' ও ') + ' (' + bn(r.score) + ' পয়েন্ট)'); }
    });
    return notes;
  },
  rankTitle(rank) { return ['চ্যাম্পিয়ন', 'প্রথম রানার্স-আপ', 'দ্বিতীয় রানার্স-আপ'][rank - 1] || 'ফাইনালিস্ট'; },
  /** Per-team counts from the ledger (own correct, hands-up right/wrong, bonus, wrong, manual, per round). */
  teamStats(tid) {
    const st = { correct: 0, handsRight: 0, handsWrong: 0, bonus: 0, wrong: 0, manual: 0, rounds: {} };
    for (const e of Store.state.ledger) {
      if (e.team !== tid) continue;
      if (e.kind === 'correct') st.correct++; else if (e.kind === 'challenge') st.handsRight++; else if (e.kind === 'cwrong') st.handsWrong++; else if (e.kind === 'bonus') st.bonus++; else if (e.kind === 'wrong') st.wrong++; else if (e.kind === 'adjust') st.manual += e.delta;
      if (e.round) st.rounds[e.round] = (st.rounds[e.round] || 0) + e.delta;
    }
    return st;
  },
  /** Best gain in a round ("round star"). */
  roundStar(rid) {
    const rows = this.standings(undefined, rid);
    const best = Math.max(0, ...rows.map((r) => r.rscore));
    return best > 0 ? { teams: rows.filter((r) => r.rscore === best).map((r) => r.team), pts: best } : null;
  },
  standingsText() {
    return this.standings().map((r) => r.rank + (this.standings().filter((x) => x.rank === r.rank).length > 1 ? ' (সমান)' : '') + '। ' + r.team.name + ', ' + r.score + ' পয়েন্ট').join('। ');
  },
  currentRound() {
    const s = Store.state;
    return this.round(s.live.roundId) || this.round(s.show.params.roundId) || s.rounds.find((r) => r.enabled) || s.rounds[0];
  },
  liveQuestion() { return this.question(Store.state.live.qid); },
  /** Team currently answering (challenger during a challenge). */
  answeringTeam() { const l = Store.state.live; return l.flow === 'challenge' && l.challenger ? l.challenger : l.active; },
  timerRemaining(t = Store.state.timer) {
    if (!t.running) return Math.max(0, t.base == null ? t.remaining : t.base);
    const elapsed = Math.max(0, now() - t.startedAt);
    return Math.max(0, t.base - elapsed);
  },
  lifelineUsed(tid, kind) { return !!(Store.state.lifelines[tid] && Store.state.lifelines[tid][kind]); },
  turnTeam(round) {
    const ids = this.finalistIds();
    if (!ids.length) return '';
    if (!round) return ids[0];
    // one turn per team per round, in the round's order (A→H or H→A); after the 8th team the rest are audience questions ('')
    const taken = arr(round.turnsTaken);
    const seq = round.turnOrder === 'reverse' ? ids.slice().reverse() : ids;
    return seq.find((id) => !taken.includes(id)) || '';
  },
  /** How many teams still have their turn to come in this round. */
  turnsLeft(round) { const ids = this.finalistIds(); return round ? ids.filter((id) => !arr(round.turnsTaken).includes(id)).length : 0; },
};

/* =====================================================================
   TIMER ENGINE — timestamp based (performance.timeOrigin + now()),
   token protected, pause/resume safe, identical in every window.
   ===================================================================== */
const Timer = {
  lastSec: -1,
  lastToken: -1,
  durationFor(mode) {
    const s = Store.state;
    const r = Sel.currentRound();
    const q = Sel.liveQuestion();
    if (mode === 'direct') return (q && q.timer) || (r && r.timers.direct) || 60;
    if (mode === 'pass' || mode === 'bonus' || mode === 'challenge') return (r && r.timers.pass) || 45;
    return s.timer.duration / 1000;
  },
  /** Start a fresh countdown. delayMs lets the clock wait for a drone delivery. */
  start(mode = 'direct', seconds, delayMs = 0) {
    const secs = clamp(num(seconds, this.durationFor(mode)), 1, 3600);
    Store.commit('timer-start', (s) => {
      s.timer = { mode, duration: secs * 1000, base: secs * 1000, remaining: secs * 1000, startedAt: now() + delayMs, running: true, token: (s.timer.token || 0) + 1, expired: false };
    }, { undo: false });
    Cue.play('transition', { soft: true });
  },
  pause() {
    const t = Store.state.timer;
    if (!t.running) return false;
    const rem = Sel.timerRemaining(t);
    Store.commit('timer-pause', (s) => { s.timer.running = false; s.timer.base = rem; s.timer.remaining = rem; }, { undo: false });
    return true;
  },
  resume() {
    const t = Store.state.timer;
    if (t.running || t.expired || !(Sel.timerRemaining(t) > 0)) return false;
    Store.commit('timer-resume', (s) => { s.timer.running = true; s.timer.startedAt = now(); s.timer.token += 1; }, { undo: false });
    return true;
  },
  toggle() {
    const t = Store.state.timer;
    if (t.running) return this.pause();
    if (t.expired || Sel.timerRemaining(t) <= 0) { this.start(t.mode, t.duration / 1000); return true; }
    return this.resume();
  },
  reset(mode) {
    const m = mode || Store.state.timer.mode;
    const d = this.durationFor(m) * 1000;
    Store.commit('timer-reset', (s) => { s.timer = { mode: m, duration: d, base: d, remaining: d, startedAt: 0, running: false, token: (s.timer.token || 0) + 1, expired: false }; }, { undo: false });
  },
  stop() {
    const t = Store.state.timer;
    if (!t.running) return false;
    const rem = Sel.timerRemaining(t);
    Store.commit('timer-stop', (s) => { s.timer.running = false; s.timer.base = rem; s.timer.remaining = rem; s.timer.token += 1; }, { undo: false });
    return true;
  },
  add(sec) {
    const t = Store.state.timer;
    const rem = Sel.timerRemaining(t) + sec * 1000;
    Store.commit('timer-add', (s) => {
      s.timer.base = Math.max(0, rem); s.timer.remaining = s.timer.base; s.timer.duration = Math.max(s.timer.duration, s.timer.base);
      s.timer.expired = false; if (s.timer.running) s.timer.startedAt = now();
    }, { undo: false });
  },
  /** Called ~10x per second by the authority window only. Emits cues once per second per token. */
  tick() {
    const s = Store.state;
    const t = s.timer;
    if (!t.running) { this.lastSec = -1; return; }
    if (now() < t.startedAt) return; // waiting for delayed start
    const rem = Sel.timerRemaining(t);
    if (rem <= 0) {
      const token = t.token;
      Store.commit('timer-expire', (st) => {
        if (st.timer.token !== token || !st.timer.running) return false; // a newer timer already replaced this one
        st.timer.running = false; st.timer.base = 0; st.timer.remaining = 0; st.timer.expired = true;
      }, { undo: false });
      Cue.play('timeout');
      Speech.say('সময় শেষ', 'timer');
      this.lastSec = -1;
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (t.token !== this.lastToken) { this.lastToken = t.token; this.lastSec = sec + 1; }
    if (sec === this.lastSec) return;
    // Emit for every whole second crossed (handles throttled background tabs gracefully).
    const crossed = this.lastSec - sec;
    this.lastSec = sec;
    if (crossed > 3) return;
    const warnAt = s.settings.warnAt;
    const critAt = s.settings.critAt;
    if (sec === warnAt || sec === critAt) Cue.play('warning');
    if (sec <= warnAt) Cue.play('tick', { low: sec <= critAt });
    const v = s.speech.timerVoice;
    if (v !== 'off' && s.speech.enabled) {
      const say = (v === 'marks' && (sec % 10 === 0 || sec <= 5)) || (v === 'last10' && sec <= 10) || (v === 'all' && (sec % 10 === 0 || sec <= 10));
      if (say) Speech.say(bn(sec), 'timer');
    }
  },
};

/* =====================================================================
   SCORE / GAME ENGINE — question flow, judging, pass, bonus, challenge,
   lifelines. Every point change becomes an auditable ledger entry.
   ===================================================================== */
/* =====================================================================
   PODIUM LOTTERY — after the welcome each finalist (in prelim order)
   chooses one of eight favourite things; the second click opens it and a
   random free podium comes out. The team moves to that place in the list,
   so its code (A / 1 … H / 8) is the podium it sits at.
   ===================================================================== */
const Draw = {
  rand(n) { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } },
  /** Opens the lottery: freezes the eight finalists and the choosing order (prelim ranking). */
  ensure() {
    const s = Store.state;
    if (s.draw.queue.length) return true;
    const ids = Sel.finalistIds();
    if (!ids.length) return false;
    Store.commit('draw-start', (st) => { st.finalists = ids.slice(); st.draw.queue = ids.slice(); st.draw.picks = []; st.draw.pending = -1; }, { undo: false });
    return true;
  },
  /** Whose turn it is (empty when every finalist has a podium). */
  next() { const d = Store.state.draw; const done = new Set(d.picks.map((p) => p.team)); return d.queue.find((id) => !done.has(id)) || ''; },
  cards() { const d = Store.state.draw; return d.items.slice(0, Math.max(d.queue.length || Sel.finalistIds().length, 1)); },
  /** First click on a card: the team has chosen it (it glows). Second click on the same card: it opens with a podium. */
  pick(card) {
    card = int(card, -1);
    if (!this.ensure()) { UI.toast('Set the final teams first', 'err'); return false; }
    const d = Store.state.draw; const n = d.queue.length;
    if (card < 0 || card >= Math.min(n, d.items.length)) return false;
    if (d.picks.some((p) => p.card === card)) { UI.toast('This card is already taken — pick another one', 'err'); return false; }
    const team = this.next();
    if (!team) return false;
    if (d.pending !== card) { Store.commit('draw-choose', (st) => { st.draw.pending = card; }); Cue.play('option'); return true; }
    const used = new Set(d.picks.map((p) => p.podium));
    const free = Array.from({ length: n }, (_, i) => i).filter((i) => !used.has(i));
    const podium = free[this.rand(free.length)];
    Store.commit('draw-open', (st) => {
      st.draw.picks.push({ card, team, podium }); st.draw.pending = -1;
      Draw.seat(st, team, podium);
      // all seated: the finalists are now listed (and play) in podium order A / 1 … H / 8
      if (st.draw.picks.length >= st.draw.queue.length) st.finalists = st.draw.queue.slice().sort((a, b) => st.teams.findIndex((t) => t.id === a) - st.teams.findIndex((t) => t.id === b));
    });
    Cue.play('reveal'); setTimeout(() => Cue.play('applause'), 900);
    if (this.next() === '') setTimeout(() => Cue.play('fanfare'), 2200);
    return true;
  },
  /** Moves a team to its podium's place in the team list; the podium colour stays with the podium. */
  seat(st, teamId, podium) {
    const from = st.teams.findIndex((t) => t.id === teamId);
    if (from < 0 || from === podium || podium >= st.teams.length) return;
    const a = st.teams[from]; const b = st.teams[podium]; const ca = a.color; const cb = b.color;
    st.teams[podium] = a; st.teams[from] = b; a.color = cb; b.color = ca;
    [from, podium].forEach((i) => { const t = st.teams[i]; if (GENERIC_TEAM_NAME.test(str(t.name).trim())) t.name = teamCode(i); });
  },
  reset() {
    if (Store.state.draw.picks.length && !Store.sandbox && !confirm('Restart the podium lottery from the beginning? (Ctrl+Z can undo this)')) return false;
    Store.commit('draw-reset', (st) => { st.draw.picks = []; st.draw.pending = -1; st.draw.queue = (st.finalists.length ? st.finalists : Sel.finalistIds()).slice(); });
    return true;
  },
  theme(key) {
    if (!DRAW_THEMES[key]) return false;
    if (Store.state.draw.picks.length) { UI.toast('The lottery has already started — restart it from the beginning first to change the theme', 'err'); return false; }
    Store.commit('draw-theme', (st) => { st.draw.theme = key; st.draw.items = drawItems(key); st.draw.pending = -1; });
    return true;
  },
};

const Game = {
  addEntry(s, team, delta, reason, extra = {}) {
    // before/after make every score change auditable and the running total verifiable.
    let before = 0; for (const e of s.ledger) if (e.team === team) before += e.delta;
    const d = int(delta, 0);
    s.ledger.push(Object.assign({ id: uid('L'), t: Date.now(), team, delta: d, before, after: before + d, reason: str(reason, 120), round: s.live.roundId || '', q: s.live.qid || '' }, extra));
  },
  /** Points the current answering team would receive / lose right now. */
  pointsFor(kind) {
    const s = Store.state;
    const l = s.live;
    const r = Sel.round(l.roundId) || Sel.currentRound();
    const q = Sel.liveQuestion();
    if (!r) return 0;
    const sc = r.scoring;
    const mult = clamp(int(r.multiplier, 1), 1, 5);
    if (r.type === 'rapid') return kind === 'correct' ? sc.rapidRight * mult : sc.rapidWrong;
    if (l.flow === 'challenge') return kind === 'correct' ? sc.challengeRight : sc.challengeWrong;
    if (kind !== 'correct') return l.passChain.length ? sc.passWrong : sc.wrong;
    const base = q && q.points != null ? q.points : sc.direct;
    // Audio-visual ladder: the value grows by bonusStep (× multiplier) for every pass.
    if (r.type === 'bonus') return (base + sc.bonusStep * l.passChain.length) * mult;
    if (l.flow === 'pass') return sc.pass * mult;
    if (l.optionsShown) return (l.eliminated.length >= 2 ? sc.options2 : sc.options4) * mult;
    return base * mult;
  },
  /** A locked question refuses scoring changes until the operator unlocks it. */
  guard() { if (Store.state.live.audience) { UI.toast('Audience question — no team plays it and nobody gets points', 'err'); return false; } if (Store.state.live.locked) { UI.toast('Question is locked — unlock it first (L)', 'err'); return false; } return true; },
  toggleLock() { if (!Store.state.live.qid) return false; Store.commit('lock', (s) => { s.live.locked = !s.live.locked; }); return true; },
  judge(kind) {
    if (!this.guard()) return false;
    const s = Store.state;
    const team = Sel.answeringTeam();
    if (!s.live.qid) { UI.toast('No question is active', 'err'); return false; }
    if (!team) { UI.toast('Choose the answering team', 'err'); return false; }
    if (s.live.closed) { UI.toast('This question is finished — show the answer and go to the next question', 'err'); return false; }
    const r0 = Sel.round(s.live.roundId);
    if (kind === 'correct' && s.ledger.some((e) => e.q === s.live.qid && e.kind === 'correct' && e.round === s.live.roundId)) { UI.toast('Points for a correct answer were already given on this question', 'err'); return false; }
    const pts = kind === 'noscore' ? 0 : this.pointsFor(kind);
    const label = { correct: 'Correct', wrong: 'Wrong', noscore: 'No score' }[kind];
    Timer.stop();
    Store.commit('judge-' + kind, (st) => {
      this.addEntry(st, team, pts, label + ' • ' + this.flowName(st.live.flow), { kind, flow: st.live.flow });
      st.live.result = kind; st.live.resultAt = now(); st.live.lastPoints = pts; st.live.resultTeam = team;
      // In a challenge round the answer stays hidden after the team answers, so another team can still buzz and challenge.
      const holdForChallenge = r0 && r0.features.challenge && r0.type !== 'rapid';
      if (kind === 'correct' && st.settings.autoRevealOnCorrect && !holdForChallenge) st.live.revealed = true;
      if (kind === 'wrong' && r0) {
        // Rapid Fire: the buzzing team's wrong answer finishes the question.
        if (r0.type === 'rapid') { st.live.closed = true; st.live.revealed = true; }
        // Nobody left to pass to, or options were taken where passing is not allowed: show the answer.
        else if (st.live.flow !== 'challenge' && !holdForChallenge && (!this.nextPassTeam() || (st.live.optionsShown && !r0.features.passAfterOptions && r0.type !== 'bonus') || !r0.features.pass)) st.live.revealed = true;
      }
    });
    Cue.play(kind === 'correct' ? 'correct' : kind === 'wrong' ? 'wrong' : 'reveal', { round: s.live.roundId });
    if (kind === 'correct') this.applause();
    return true;
  },
  /* ---- Hands-up / buzzer: any number of teams may raise a hand; each is judged once ---- */
  raiseHand(teamId) {
    if (!this.guard()) return false;
    const s = Store.state; const l = s.live; const r = Sel.round(l.roundId);
    if (!l.qid || !Sel.team(teamId)) return false;
    if (r && !r.features.challenge) { UI.toast('No hand-raise / Challenge in this round', 'err'); return false; }
    if (teamId === l.active) { UI.toast('The answering team cannot raise its own hand', 'err'); return false; }
    if (l.handsJudged[teamId]) { UI.toast("This team's raised hand has already been judged", 'err'); return false; }
    const on = l.hands.includes(teamId);
    if (!on && r && r.features.singleChallenger && l.hands.length) { UI.toast('In this round only the first team to buzz can challenge', 'err'); return false; }
    Store.commit('raise-hand', (st) => { st.live.hands = on ? st.live.hands.filter((x) => x !== teamId) : st.live.hands.concat([teamId]); });
    if (!on) Cue.play('challenge', { soft: true });
    return true;
  },
  judgeHand(teamId, right) {
    if (!this.guard()) return false;
    const s = Store.state; const l = s.live; const r = Sel.round(l.roundId);
    if (!l.hands.includes(teamId) || l.handsJudged[teamId] || !r) return false;
    const pts = right ? r.scoring.challengeRight : r.scoring.challengeWrong;
    Store.commit('hand-' + (right ? 'right' : 'wrong'), (st) => {
      this.addEntry(st, teamId, pts, (right ? 'Hand-raise correct' : 'Hand-raise wrong'), { kind: right ? 'challenge' : 'cwrong', flow: 'hands' });
      st.live.handsJudged = Object.assign({}, st.live.handsJudged, { [teamId]: right ? 'right' : 'wrong' });
      st.live.lastPoints = pts; st.live.resultAt = now(); st.live.result = right ? 'correct' : 'wrong'; st.live.resultTeam = teamId;
      if (right && st.settings.autoRevealOnCorrect) st.live.revealed = true; // a correct challenge settles the question
    });
    Cue.play(right ? 'correct' : 'wrong');
    if (right) this.applause();
    return true;
  },
  /** A short burst of applause after a correct answer (not in Rapid Fire, where answers come fast). */
  applause() {
    const st = Store.state; const r = Sel.round(st.live.roundId);
    if (!st.settings.autoApplause || (r && r.type === 'rapid')) return;
    setTimeout(() => Cue.play('applause'), 650);
  },
  /** Manual bonus (once per question, standard rounds). */
  bonus() {
    if (!this.guard()) return false;
    const s = Store.state; const l = s.live; const r = Sel.round(l.roundId); const team = Sel.answeringTeam();
    if (!l.qid || !team || !r) return false;
    if (r.type !== 'standard') { UI.toast('No separate bonus in this round', 'err'); return false; }
    if (l.bonusGiven) { UI.toast('Bonus already given on this question', 'err'); return false; }
    Store.commit('bonus', (st) => { this.addEntry(st, team, r.scoring.manualBonus, 'Bonus', { kind: 'bonus' }); st.live.bonusGiven = true; st.live.lastPoints = r.scoring.manualBonus; st.live.resultAt = now(); });
    Cue.play('score');
    return true;
  },
  flowName(f) { return { direct: 'Direct', pass: 'Pass', bonus: 'Bonus', challenge: 'Challenge' }[f] || f; },

  /** Next team in finalist order that has not yet tried this question. */
  nextPassTeam() {
    const s = Store.state;
    const ids = Sel.finalistIds();
    const tried = new Set(s.live.passChain.concat([s.live.active]));
    const start = Math.max(0, ids.indexOf(s.live.active));
    for (let k = 1; k <= ids.length; k++) { const id = ids[(start + k) % ids.length]; if (!tried.has(id)) return id; }
    return '';
  },
  pass(toTeam) {
    if (!this.guard()) return false;
    const s = Store.state;
    const r = Sel.round(s.live.roundId);
    if (!s.live.qid) return false;
    if (r && !r.features.pass) { UI.toast('No Pass in this round', 'err'); return false; }
    if (r && s.live.optionsShown && !r.features.passAfterOptions && r.type !== 'bonus') { UI.toast('No Pass after Options are shown (round rule)', 'err'); return false; }
    const target = toTeam || this.nextPassTeam();
    if (!target) { UI.toast('No team left to pass to', 'err'); return false; }
    const flow = r && r.type === 'bonus' ? 'bonus' : 'pass';
    Store.commit('pass', (st) => {
      st.live.passChain.push(st.live.active);
      st.live.active = target; st.live.flow = flow; st.live.result = ''; st.live.challenger = ''; st.live.picked = -1;
    });
    Cue.play('pass');
    if (Store.state.speech.announceTeam) Speech.say((flow === 'bonus' ? 'বোনাস' : 'পাস') + '। ' + (Sel.team(target) || {}).name, 'team');
    if (Store.state.settings.autoPassTimer) Timer.start(flow, Timer.durationFor('pass'));
    else Timer.reset('pass');
    return true;
  },
  challenge(teamId) {
    if (!this.guard()) return false;
    const s = Store.state;
    const r = Sel.round(s.live.roundId);
    if (!s.live.qid) return false;
    if (!teamId || teamId === s.live.active) { UI.toast('The challenging team must be a different team', 'err'); return false; }
    if (r && !r.features.challenge) { UI.toast('No Challenge in this round', 'err'); return false; }
    if (r && r.features.singleChallenger && s.live.flow === 'challenge' && s.live.challenger && s.live.challenger !== teamId) { UI.toast('Only one team can challenge a question', 'err'); return false; }
    Store.commit('challenge', (st) => { st.live.flow = 'challenge'; st.live.challenger = teamId; st.live.result = ''; });
    Cue.play('challenge');
    if (Store.state.speech.announceTeam) Speech.say('চ্যালেঞ্জ। ' + (Sel.team(teamId) || {}).name, 'team');
    if (Store.state.settings.autoPassTimer) Timer.start('challenge', Timer.durationFor('challenge'));
    return true;
  },
  setActive(teamId) {
    if (!Sel.team(teamId)) return false;
    if (Store.state.live.audience) { UI.toast('Audience question — no team plays it and nobody gets points', 'err'); return false; }
    // direct questions go strictly in turn (A→H / H→A): the team whose turn it is answers; only "Operator chooses" lets you give the turn to another team
    const l0 = Store.state.live; const r0 = Sel.round(l0.roundId);
    if (l0.qid && l0.owner && l0.flow === 'direct' && !l0.result && teamId !== l0.owner && r0 && r0.turnOrder !== 'manual' && Store.state.show.scene === 'QUESTION') {
      UI.toast('Direct question: it is ' + Sel.label(Sel.team(l0.owner)) + '\'s turn — teams answer in order. (Pass / Challenge come after the answer.)', 'err'); return false;
    }
    Store.commit('active-team', (s) => {
      if (s.live.flow === 'challenge' && s.live.active && teamId !== s.live.active) s.live.challenger = teamId;
      else { s.live.active = teamId; if (!s.live.result && s.live.flow === 'direct') s.live.owner = teamId; } // the operator chose which team takes this turn
    });
    return true;
  },
  /** Round 1 rule: the team may ask for the four options to be reduced to two (worth 3). Same two wrong options in every window. */
  twoOptions() {
    if (!this.guard()) return false;
    const s = Store.state; const q = Sel.liveQuestion(); const r = Sel.round(s.live.roundId);
    if (!q) { UI.toast('No question is active', 'err'); return false; }
    if (r && !r.features.options) { UI.toast('No Options in this round (round rule)', 'err'); return false; }
    const wrong = this.wrongIndexes(q);
    if (wrong.length < 2) { UI.toast('Two-option mode needs four Options', 'err'); return false; }
    if (s.live.eliminated.length >= 2) return false;
    Store.commit('two-options', (st) => { st.live.optionsShown = true; st.live.eliminated = wrong.slice(0, 2); st.live.picked = -1; });
    Cue.play('option');
    return true;
  },
  showOptions() {
    const q = Sel.liveQuestion();
    if (!q || q.options.filter(Boolean).length < 2) { UI.toast('This question has no Options', 'err'); return false; }
    const r = Sel.round(Store.state.live.roundId);
    if (r && !r.features.options && !Store.state.live.optionsShown) { UI.toast('No Options in this round (round rule)', 'err'); return false; }
    Store.commit('options', (s) => { s.live.optionsShown = !s.live.optionsShown; });
    if (Store.state.live.optionsShown) { Cue.play('option'); if (Store.state.speech.rec && q.voiceOpt) setTimeout(() => Speech.readOptions(false), 500); }
    return true;
  },
  wrongIndexes(q) {
    const idx = [0, 1, 2, 3].filter((i) => i !== q.answer && q.options[i]);
    // Deterministic per question so Stage and Control always agree.
    let h = 0; for (const c of q.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return idx.sort((a, b) => ((a * 7 + h) % 11) - ((b * 7 + h) % 11));
  },
  useLifeline(kind) {
    const s = Store.state;
    const q = Sel.liveQuestion();
    const team = s.live.active;
    if (!q) { UI.toast('No question is active', 'err'); return false; }
    if (team && Sel.lifelineUsed(team, kind)) { UI.toast('This team has already used this lifeline', 'err'); return false; }
    if (kind === 'fifty') {
      const wrong = this.wrongIndexes(q);
      if (wrong.length < 2) { UI.toast('50:50 needs four Options', 'err'); return false; }
      Store.commit('lifeline-5050', (st) => { st.live.optionsShown = true; st.live.eliminated = wrong.slice(0, 2); this.markLifeline(st, team, kind); });
    } else if (kind === 'poll') {
      Store.commit('lifeline-poll', (st) => { st.live.optionsShown = true; st.live.poll = this.makePoll(q, st.live.eliminated); this.markLifeline(st, team, kind); });
    } else if (kind === 'flip') {
      const next = this.flipCandidate();
      if (!next) { UI.toast('No reserve question left for Flip (round ' + s.flipPool + ')', 'err'); return false; }
      Store.commit('lifeline-flip', (st) => {
        const old = st.live.qid;
        delete st.board.played[old];
        st.board.played[next.id] = true;
        Object.assign(st.live, { qid: next.id, flipped: old, optionsShown: false, eliminated: [], poll: null, revealed: false, result: '', picked: -1, deliverAt: now() });
        this.markLifeline(st, team, kind);
      });
      Timer.reset('direct');
    }
    Cue.play('lifeline');
    return true;
  },
  markLifeline(s, team, kind) { if (!team) return; s.lifelines[team] = Object.assign({}, s.lifelines[team], { [kind]: true }); },
  makePoll(q, eliminated = []) {
    const live = [0, 1, 2, 3].filter((i) => q.options[i] && !eliminated.includes(i));
    let h = 7; for (const c of q.id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    const rand = () => { h = (h * 1103515245 + 12345) >>> 0; return (h % 1000) / 1000; };
    const vals = [0, 0, 0, 0];
    live.forEach((i) => { vals[i] = i === q.answer ? 38 + rand() * 30 : 4 + rand() * 18; });
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const pct = vals.map((v) => Math.round((v / sum) * 100));
    const diff = 100 - pct.reduce((a, b) => a + b, 0);
    pct[q.answer] += diff;
    return pct;
  },
  flipCandidate() {
    const s = Store.state;
    return Sel.roundQuestions(s.flipPool).find((q) => !s.board.played[q.id] && q.id !== s.live.qid) || null;
  },
  pick(idx) {
    if (!this.guard()) return false;
    const s = Store.state;
    const q = Sel.liveQuestion();
    const r = Sel.round(s.live.roundId);
    if (!q || !q.options[idx]) return false;
    Store.commit('pick', (st) => { st.live.picked = idx; st.live.optionsShown = true; });
    // In "judge" rounds the option a team names is final: judge immediately.
    if (r && r.features.judgeOptions) this.judge(idx === q.answer ? 'correct' : 'wrong');
    return true;
  },
  reveal() {
    if (!Store.state.live.qid) return false;
    Store.commit('reveal', (s) => { s.live.revealed = !s.live.revealed; });
    if (Store.state.live.revealed) { Cue.play('reveal'); Speech.readAnswer(); }
    return true;
  },
  /** Load a main-round question onto the stage. */
  load(qid, teamId) {
    const q = Sel.question(qid);
    if (!q) return false;
    const r = Sel.round(q.roundId);
    const drone = Store.state.settings.drone.main;
    Store.commit('load-q', (s) => {
      const owner = teamId || Sel.turnTeam(r);
      s.live = Object.assign(emptyLive(), { qid, roundId: q.roundId, active: owner, owner, audience: !owner && Sel.finalistIds().length > 0, deliverAt: now(), drone });
      s.board.played[qid] = true;
      if (r && r.features.twoOptions) s.live.eliminated = this.wrongIndexes(q).slice(0, 2);
      if (r && (r.type === 'rapid' || (!r.features.judgeOptions && r.features.options && !r.features.challenge))) s.live.optionsShown = r.type === 'rapid';
      const d = ((q.timer || (r && r.timers.direct) || 60) * 1000);
      s.timer = { mode: 'direct', duration: d, base: d, remaining: d, startedAt: 0, running: false, token: (s.timer.token || 0) + 1, expired: false };
    });
    Cue.play(drone ? 'drone' : 'delivery');
    setTimeout(() => Cue.play('question'), drone ? Show.droneMs() * 0.6 : 250);
    const rn = Store.state.rounds.filter((x) => x.enabled).indexOf(r) + 1;
    if (rn > 0) setTimeout(() => Cue.play('rq' + Math.min(6, rn)), (drone ? Show.droneMs() * 0.6 : 250) + 120);
    if (Store.state.settings.autoTimer) Timer.start('direct', Timer.durationFor('direct'), drone ? Show.droneMs() : 900);
    const sp = Store.state.speech;
    VoicePlayer.stop(); // the last question's reading never runs on over a new question
    if (sp.autoQuestion || (sp.rec && q.voiceQ)) setTimeout(() => Speech.readQuestion(sp.autoQuestion), drone ? Show.droneMs() : 800);
    return true;
  },
  adjust(teamId, delta, reason) {
    if (!Sel.team(teamId) || !delta) return false;
    Store.commit('adjust', (s) => this.addEntry(s, teamId, delta, reason || 'Manual adjustment', { kind: 'adjust' }));
    Cue.play(delta > 0 ? 'score' : 'wrong', { soft: delta < 0 });
    return true;
  },
  removeEntry(id) { return Store.commit('ledger-remove', (s) => { const i = s.ledger.findIndex((e) => e.id === id); if (i < 0) return false; s.ledger.splice(i, 1); }); },
  advanceTurn() { this.closeTurn(); },
  /** The team whose turn it was has had it (counted once per question; audience questions do not count). */
  closeTurn() {
    const l = Store.state.live;
    if (!l.qid || l.turnDone || l.audience || !l.owner) return;
    Store.commit('turn-done', (s) => { const r = s.rounds.find((x) => x.id === s.live.roundId); if (r) { r.turnsTaken = arr(r.turnsTaken); if (!r.turnsTaken.includes(s.live.owner)) r.turnsTaken.push(s.live.owner); r.turn = r.turnsTaken.length; } s.live.turnDone = true; }, { undo: false });
  },
};
