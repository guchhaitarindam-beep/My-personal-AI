/* =====================================================================
   STAGE WINDOW (#stage) — audience output only, never shows controls.
   ===================================================================== */
const Stage = {
  view: null,
  init() {
    document.body.classList.add('mode-stage');
    document.title = 'Quiz Corner — STAGE';
    document.body.innerHTML = '<div id="stageRoot" style="position:fixed;inset:0;background:#000"></div>';
    this.view = new StageView($('#stageRoot'));
    Bus.on('change', () => { DesignSystem.apply(); this.view.render(); this.audioGate(); });
    DesignSystem.apply();
    this.view.render();
    document.addEventListener('dblclick', () => this.toggleFullscreen());
    document.addEventListener('click', () => { AudioDirector.unlock(); this.audioGate(); });
    let idle = 0;
    document.addEventListener('mousemove', () => { document.body.style.cursor = ''; clearTimeout(idle); idle = setTimeout(() => { document.body.style.cursor = 'none'; }, 2500); });
    this.audioGate();
  },
  audioGate() {
    const need = AudioDirector.isOutput() && !AudioDirector.unlocked;
    let g = $('.stage-audio-gate');
    if (need && !g) { g = document.createElement('button'); g.className = 'stage-audio-gate'; g.textContent = '🔊 সাউন্ড চালু করতে একবার ক্লিক করুন'; document.body.appendChild(g); }
    if (!need && g) g.remove();
  },
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch((e) => Log.err('fullscreen', e));
  },
};

/* =====================================================================
   HOST WINDOW (#host) — read-only script for the presenter/quiz master.
   ===================================================================== */
const Host = {
  init() {
    document.body.classList.add('mode-control');
    document.title = 'Quiz Corner — HOST SCRIPT';
    document.body.innerHTML = '<div class="host-view" id="host"></div>';
    Bus.on('change', () => { const k = Store.state.live.qid + '|' + Store.state.prelimLive.idx + '|' + Store.state.show.scene; if (k !== this.key) { this.key = k; this.show = false; } this.render(); });
    document.addEventListener('click', (e) => { if (e.target.closest('#hostShowAns')) { this.show = !this.show; this.render(); } });
    setInterval(() => this.clock(), 200);
    this.render();
  },
  render() {
    const s = Store.state;
    let h = '<div class="row"><span class="status-pill ok">' + esc(SCENES[s.show.scene] || s.show.scene) + '</span><span class="grow"></span><span class="bigtime" id="hostTime" style="font-family:var(--font-timer);font-size:3rem"></span></div>';
    if (s.show.scene === 'QUESTION') {
      const q = Sel.liveQuestion(); const t = Sel.team(Sel.answeringTeam());
      if (q) h += '<div class="card"><div class="muted">' + esc((Sel.round(q.roundId) || {}).name || '') + ' • প্রশ্ন ' + bn(q.number) + (t ? ' • ' + esc(t.name) + ' (' + Game.flowName(s.live.flow) + ')' : '') + '</div><div class="hq">' + esc(q.text) + '</div>' + (q.options.filter(Boolean).length ? '<div class="hq" style="font-size:1.4rem">' + q.options.map((o, i) => (o ? OPT_LABELS[i] + ') ' + esc(o) : '')).filter(Boolean).join(' &nbsp; ') + '</div>' : '') + this.ans(q.answerText || q.options[q.answer] || '') + (q.explanation && this.visible() ? '<div class="muted">' + esc(q.explanation) + '</div>' : '') + '</div>';
    } else if (s.show.scene === 'PRELIM_Q') {
      const q = Sel.prelimQuestions()[s.prelimLive.idx];
      if (q) h += '<div class="card"><div class="muted">বাছাই প্রশ্ন ' + bn(s.prelimLive.idx + 1) + (q.star ? ' ★' : '') + '</div><div class="hq">' + esc(q.text) + '</div>' + this.ans(q.answer) + '</div>';
    }
    h += '<div class="card"><h3>স্কোর</h3><div class="team-chips">' + Sel.standings().map((r) => '<span class="chip" style="--team:' + esc(r.team.color) + '">' + bn(r.rank) + '. ' + esc(r.team.name) + ' <span class="pts">' + bn(r.score) + '</span></span>').join('') + '</div></div>';
    $('#host').innerHTML = h;
    this.clock();
  },
  visible() { return Store.state.settings.hostAnswer === 'always' || this.show; },
  ans(text) { return this.visible() ? '<div class="ha">উত্তর: ' + esc(text) + '</div>' : '<button id="hostShowAns" class="btn gold lg">👁 উত্তর দেখাও (শুধু এখানে)</button>'; },
  clock() { const el = $('#hostTime'); if (el) el.textContent = fmtTime(Sel.timerRemaining(Store.state.timer)); },
};

/* =====================================================================
   SELF-TEST HARNESS — runs against a sandbox copy; the real show state,
   undo history, storage and audio are untouched.
   ===================================================================== */
const SelfTest = {
  async run() {
    const saved = { state: Store.state, past: Store.past, future: Store.future };
    const results = [];
    const T = (name, fn) => { try { const r = fn(); results.push({ name, ok: r !== false, detail: typeof r === 'string' ? r : '' }); } catch (e) { results.push({ name, ok: false, detail: e.message || String(e) }); } };
    // Sandbox: no persistence, no sync, no audio, no UI updates while testing.
    Store.sandbox = true;
    Store.past = []; Store.future = [];
    try {
      Store.state = normalizeState(defaultState());
      const s = () => Store.state;
      T('ডিফল্ট: ৭টি রাউন্ড', () => s().rounds.length === 7);
      T('ডিফল্ট: সরাসরি টাইমার ৬০ সেকেন্ড (সব রাউন্ড)', () => s().rounds.every((r) => r.timers.direct === 60));
      T('ডিফল্ট: পাস/বোনাস টাইমার ৪৫ সেকেন্ড (সব রাউন্ড)', () => s().rounds.every((r) => r.timers.pass === 45));
      T('ডিফল্ট: বাছাই ২০টি প্রশ্ন, প্রতিটির উত্তর আছে', () => Sel.prelimQuestions().length === 20 && Sel.prelimQuestions().every((q) => q.text && q.answer));
      T('ডিফল্ট: শীর্ষ ৮ দল চূড়ান্ত', () => s().prelim.finalistCount === 8 && Sel.finalistIds().length === 8);
      T('V100 প্রশ্ন ব্যাংক সংরক্ষিত', () => s().questions.length >= 70 ? 'প্রশ্ন: ' + s().questions.length : false);
      T('ক্ষতিগ্রস্ত ডেটা স্বাভাবিকীকরণ', () => { const n = normalizeState({ teams: 'x', rounds: [null], questions: [{}], ledger: [1, null], timer: { duration: 'abc' } }); return n.teams.length > 0 && n.rounds.length === 1 && n.timer.duration === 60000; });

      // ---- timer ----
      Store.state.show.scene = 'QUESTION';
      const q1 = Sel.roundQuestions('R1')[0];
      Game.load(q1.id, Sel.finalistIds()[0]);
      T('টাইমার: সরাসরি ৬০s লোড', () => s().timer.duration === 60000 && !s().timer.running);
      Timer.start('direct', 60);
      T('টাইমার: চালু', () => s().timer.running && Sel.timerRemaining() > 59000);
      Timer.pause();
      const pausedAt = Sel.timerRemaining();
      T('টাইমার: বিরতি স্থির থাকে', () => !s().timer.running && Math.abs(Sel.timerRemaining() - pausedAt) < 1);
      Timer.resume();
      T('টাইমার: আবার চালু', () => s().timer.running);
      Timer.start('pass', Timer.durationFor('pass'));
      T('টাইমার: পাস ৪৫s', () => s().timer.duration === 45000 && s().timer.mode === 'pass');
      const oldToken = s().timer.token;
      s().timer.startedAt = now() - 46000; // force expiry
      Timer.tick();
      T('টাইমার: সময় শেষ একবারই', () => s().timer.expired && !s().timer.running && Sel.timerRemaining() === 0);
      Timer.start('direct', 60);
      T('টাইমার: রেস — নতুন টাইমার পুরনো টোকেন বাতিল করে', () => s().timer.token > oldToken && !s().timer.expired && s().timer.running);
      Timer.reset();
      T('টাইমার: রিসেট', () => !s().timer.running && s().timer.base === s().timer.duration);
      Timer.start('direct', 60, 5000);
      T('টাইমার: ড্রোনের জন্য বিলম্বিত শুরু', () => Sel.timerRemaining() === 60000);
      Timer.stop();

      // ---- scoring ----
      const [a, b, c] = Sel.finalistIds();
      Game.load(q1.id, a);
      Game.judge('correct');
      T('স্কোর: সরাসরি সঠিক +১০', () => Sel.score(a) === 10);
      Game.load(Sel.roundQuestions('R1')[1].id, b);
      Game.judge('wrong');
      Game.pass();
      T('পাস: পরের দলে যায় ও ৪৫s', () => s().live.flow === 'pass' && s().live.active === c && s().timer.mode === 'pass');
      Game.judge('correct');
      T('স্কোর: পাসে সঠিক +৫', () => Sel.score(c) === 5 && Sel.score(b) === 0);
      Game.load(Sel.roundQuestions('R1')[2].id, a);
      Game.showOptions();
      T('স্কোর: ৪ বিকল্পে মান ৫', () => Game.pointsFor('correct') === 5);
      Game.useLifeline('fifty');
      T('৫০:৫০: দুটি ভুল বিকল্প বাদ, সঠিকটি থাকে', () => s().live.eliminated.length === 2 && !s().live.eliminated.includes(Sel.liveQuestion().answer));
      T('স্কোর: ২ বিকল্পে মান ৩', () => Game.pointsFor('correct') === 3);
      T('লাইফলাইন: একই দল আবার পারবে না', () => Game.useLifeline('fifty') === false);
      Game.useLifeline('poll');
      T('দর্শক পোল: যোগফল ১০০%', () => s().live.poll.reduce((x, y) => x + y, 0) === 100);
      const before = s().live.qid;
      Game.useLifeline('flip');
      T('ফ্লিপ: সংরক্ষিত প্রশ্নে বদল', () => s().live.qid !== before && Sel.question(s().live.qid).roundId === s().flipPool);
      Game.load(Sel.roundQuestions('R4')[0].id, a);
      Game.challenge(b);
      Game.judge('wrong');
      T('চ্যালেঞ্জ: ভুলে −৫ চ্যালেঞ্জারের', () => Sel.score(b) === -5);
      T('চ্যালেঞ্জ: একটি দলই', () => Game.challenge(c) === false);
      Store.state.rounds.find((r) => r.id === 'R3').type = 'bonus';
      Store.state.questions.push(questionFromSeed({ id: 'TBON', roundId: 'R3', number: 1, text: 'বোনাস পরীক্ষা', options: ['ক', 'খ'], answer: 0 }, 0));
      Game.load('TBON', a); Game.pass(); Game.pass();
      T('বোনাস: দুই পাসে ১০+২+২ = ১৪', () => Game.pointsFor('correct') === 14 && s().live.flow === 'bonus');
      const r5 = Sel.round('R5'); r5.type = 'rapid';
      Game.load(Sel.roundQuestions('R5')[0].id, a);
      T('র‍্যাপিড: ±৫', () => Game.pointsFor('correct') === 5 && Game.pointsFor('wrong') === -5);
      Game.toggleLock();
      T('লক: লক থাকলে স্কোর বদলায় না', () => Game.judge('correct') === false && Game.pass() === false);
      Game.toggleLock();
      const sa = Sel.score(a);
      Game.judge('noscore');
      T('নো স্কোর: ০', () => Sel.score(a) === sa);
      Game.adjust(a, 7, 'test');
      T('ম্যানুয়াল সমন্বয়', () => Sel.score(a) === sa + 7);
      Store.undo();
      T('আনডু: সমন্বয় বাতিল', () => Sel.score(a) === sa);
      Store.redo();
      T('রিডু: আবার প্রয়োগ', () => Sel.score(a) === sa + 7);
      T('লেজার: before/after ধারাবাহিক', () => { const tot = {}; return s().ledger.every((e) => { const b = tot[e.team] || 0; const ok = e.before === b && e.after === b + e.delta; tot[e.team] = e.after; return ok; }); });
      // hands-up: several teams, each judged once
      Store.state.rounds.find((r) => r.id === 'R4').features.singleChallenger = false;
      Game.load(Sel.roundQuestions('R4')[1].id, a);
      Game.raiseHand(b); Game.raiseHand(c);
      T('হাত তোলা: একাধিক দল', () => s().live.hands.length === 2 && Game.raiseHand(a) === false);
      const sb0 = Sel.score(b); const sc0 = Sel.score(c);
      Game.judgeHand(b, true); Game.judgeHand(c, false);
      T('হাত তোলা: সঠিক +১০, ভুল −৫, প্রতিটি একবার', () => Sel.score(b) === sb0 + 10 && Sel.score(c) === sc0 - 5 && Game.judgeHand(b, true) === false);
      Store.state.rounds.find((r) => r.id === 'R4').features.singleChallenger = true;
      Game.load(Sel.roundQuestions('R4')[2].id, a);
      Game.raiseHand(b);
      T('একক বাজার: দ্বিতীয় দল হাত তুলতে পারে না', () => Game.raiseHand(c) === false);
      // multiplier
      const r1 = Sel.round('R1'); r1.multiplier = 2;
      Game.load(Sel.roundQuestions('R1')[3].id, a);
      T('গুণক ×২: সরাসরি ২০', () => Game.pointsFor('correct') === 20);
      r1.multiplier = 1;
      // manual bonus once
      const sa2 = Sel.score(a);
      Game.bonus();
      T('ম্যানুয়াল বোনাস একবারই', () => Sel.score(a) === sa2 + 5 && Game.bonus() === false);
      // auto reveal when options were taken in a round without pass-after-options
      Game.load(Sel.roundQuestions('R1')[4].id, a); Game.showOptions(); Game.judge('wrong');
      T('বিকল্প নেওয়ার পর ভুল: উত্তর নিজে দেখায়', () => s().live.revealed === true);
      T('একই প্রশ্নে দুবার সঠিক নয়', () => { Game.load(Sel.roundQuestions('R1')[5].id, a); Game.judge('correct'); return Game.judge('correct') === false; });
      // rapid: wrong closes
      Game.load(Sel.roundQuestions('R5')[1].id, b); Game.judge('wrong');
      T('র‍্যাপিড: ভুলে প্রশ্ন শেষ', () => s().live.closed && s().live.revealed && Game.judge('correct') === false);
      T('টাই নির্ণয় ও স্থান-শিরোনাম', () => Array.isArray(Sel.ties()) && Sel.rankTitle(1) === 'চ্যাম্পিয়ন' && Sel.rankTitle(5) === 'ফাইনালিস্ট');
      T('অডিট: প্রতিটি পরিবর্তন লেজারে', () => s().ledger.every((e) => e.id && e.team && Number.isInteger(e.delta)));

      // ---- prelim ranking ----
      const t = s().teams;
      t.forEach((x) => { x.prelim.marks = []; x.prelim.manual = null; x.prelim.stars = null; });
      t[0].prelim.marks = [true, true, false]; // 10, star q3 not
      t[1].prelim.marks = [false, true, true]; // 10, star q3 yes
      t[2].prelim.marks = [true, true]; // 10, no star — earlier correct than t0? equal
      T('বাছাই টাইব্রেক: বেশি ★ এগিয়ে', () => Sel.prelimRanking()[0].team.id === t[1].id);
      t[3].prelim.manual = 50;
      T('বাছাই: ম্যানুয়াল নম্বর অগ্রাধিকার', () => Sel.prelimRanking()[0].team.id === t[3].id);
      Show.confirmFinalists();
      T('চূড়ান্ত ৮ নিশ্চিত', () => s().finalists.length === 8 && s().finalists[0] === t[3].id);

      // ---- standings / final ----
      const st = Sel.standings();
      T('স্ট্যান্ডিং: অবনত ক্রম', () => st.every((r, i) => i === 0 || st[i - 1].score >= r.score));
      T('বিজয়ী নির্ধারণ', () => !!Show.winner());

      // ---- every scene renders ----
      const rd = Show.rundown();
      const bad = [];
      rd.forEach((step) => { Store.state.show.scene = step.scene; Store.state.show.params = step.params; if (step.scene === 'QUESTION') Store.state.live.qid = step.params.qid; try { const out = (Scenes[step.scene])(Store.state, step.params); if (!out || typeof out.html !== 'string' || !out.key) bad.push(step.key); } catch (e) { bad.push(step.key + ': ' + e.message); } });
      T('রেন্ডার: রানডাউনের প্রতিটি দৃশ্য (' + rd.length + ')', () => (bad.length ? bad.slice(0, 3).join('; ') && false : true));
      T('রানডাউন: পূর্ণ শো-প্রবাহ', () => ['ORGANIZER', 'LOGO', 'PROGRAMME', 'THEME', 'TEAM_INTRO', 'PRELIM_RULES', 'PRELIM_COUNTDOWN', 'PRELIM_Q', 'PRELIM_RESULT', 'FINALISTS', 'FINALIST_INTRO', 'WELCOME', 'GIFT', 'PODIUM', 'MAIN_COUNTDOWN', 'ROUND_INTRO', 'GRID', 'QUESTION', 'SCOREBOARD', 'FINAL', 'WINNER', 'END'].every((k) => rd.some((x) => x.scene === k)));
      T('রানডাউন: ৭টি রাউন্ড সূচনা', () => rd.filter((x) => x.scene === 'ROUND_INTRO').length === 7);

      // ---- text fitting with long Bengali ----
      T('লেখা ফিট: দীর্ঘ বাংলা প্রশ্ন বাক্সের বাইরে যায় না', () => {
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;height:200px;overflow:hidden';
        const el = document.createElement('div'); el.className = 'q-text'; el.textContent = 'পশ্চিমবঙ্গের স্কুলগুলিতে পিএম পোষণ প্রকল্প বাস্তবায়নের সঙ্গে যুক্ত অলাভজনক সংস্থাটির বর্তমান নাম কী? '.repeat(6);
        box.appendChild(el); document.body.appendChild(box);
        fitText(el, 80, 8);
        const ok = el.scrollHeight <= box.clientHeight + 1;
        box.remove();
        return ok;
      });
      T('মিডিয়া: অনুপস্থিত ফাইল নিরাপদ', () => Media.urlSync('m_missing') === '');
    } finally {
      Store.state = saved.state; Store.past = saved.past; Store.future = saved.future;
      Store.sandbox = false;
      Bus.emit('change', { label: 'selftest-restore' });
    }
    const missing = await Media.url('m_missing_test');
    results.push({ name: 'মিডিয়া: অনুপস্থিত ফাইল খালি URL দেয়', ok: missing === '', detail: '' });
    Log.add('INFO', 'Self-test: ' + results.filter((r) => r.ok).length + '/' + results.length + ' passed');
    return results;
  },
  html(res) {
    const pass = res.filter((r) => r.ok).length;
    return '<p><b class="' + (pass === res.length ? 'pass' : 'fail') + '">' + pass + ' / ' + res.length + ' পাস</b></p>' + res.map((r) => '<div class="' + (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? '✔ PASS' : '✘ FAIL') + ' — ' + esc(r.name) + (r.detail ? ' <span class="muted">(' + esc(r.detail) + ')</span>' : '') + '</div>').join('');
  },
};

/* =====================================================================
   AUTHORITY CLOCK — only the Control window decides timeouts and
   countdown beeps, so two windows can never double-fire a cue.
   ===================================================================== */
const Authority = {
  cdKey: '',
  cdStep: -1,
  start() {
    setInterval(() => safe('authority', () => this.tick()), 100);
  },
  tick() {
    if (Store.sandbox) return;
    Timer.tick();
    const s = Store.state;
    if (s.show.scene === 'PRELIM_COUNTDOWN' || s.show.scene === 'MAIN_COUNTDOWN') {
      const key = s.show.scene + s.show.startedAt;
      if (key !== this.cdKey) { this.cdKey = key; this.cdStep = -1; }
      const from = s.settings.countdownFrom;
      const step = Math.floor((now() - s.show.startedAt) / s.settings.countdownStepMs);
      if (step !== this.cdStep && step <= from && step >= 0) {
        this.cdStep = step;
        if (step < from) { Cue.play('countdown', { n: from - step }); if (s.audio.countVoice) Cue.voice(from - step); else if (s.speech.enabled) Speech.say(bn(from - step), 'timer'); } else { Cue.play('impact'); if (s.audio.countVoice) Cue.voice(0); }
      }
    }
  },
};

/* =====================================================================
   BOOT
   ===================================================================== */
function boot() {
  window.addEventListener('error', (e) => Log.err('window', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => Log.err('promise', e.reason));
  Store.init();
  Media.init();
  Speech.init();
  Sync.init();
  Keys.init();
  DesignSystem.apply();
  if (MODE === 'stage') Stage.init();
  else if (MODE === 'host') Host.init();
  else {
    UI.mount();
    Authority.start();
    window.addEventListener('pagehide', () => Store.persist());
    window.addEventListener('beforeunload', () => Store.persist());
    Media.ready.then(() => { Media.hydrate(document.body); UI.renderTab(); });
    Log.add('INFO', 'Quiz Corner V' + VERSION + ' ready');
  }
  window.QC = Object.freeze({ VERSION, MODE, Store, Sel, Timer, Game, Show, Scenes, Media, Sync, SelfTest, AudioDirector, Speech, Log, Actions, Keys, Sfx, Music, SoundDirector, Coach });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
