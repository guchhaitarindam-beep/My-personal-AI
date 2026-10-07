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
    Bus.on('change', () => { DesignSystem.apply(); AudioDirector.setBoost(); this.view.render(); this.audioGate(); });
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
      T('ডিফল্ট: বাছাই ১৫টি প্রশ্ন (সর্বশেষ নিয়ম), প্রতিটির উত্তর আছে', () => Sel.prelimQuestions().length === 15 && Sel.prelimQuestions().every((q) => q.text && q.answer));
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
      { const rb = Store.state.rounds.find((r) => r.id === 'R3'); rb.type = 'bonus'; rb.features.pass = true; rb.features.challenge = false; rb.scoring.bonusStep = 2; }
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
      // latest rules: in round 1 a wrong answer after the options still passes to the next team
      Game.load(Sel.roundQuestions('R1')[4].id, a); Game.showOptions(); Game.judge('wrong');
      T('রাউন্ড ১: বিকল্পের পরে ভুল হলেও পাস খোলা থাকে', () => s().live.revealed === false && Game.pass() === true && s().live.flow === 'pass');
      // a round set to "no pass after options" reveals the answer by itself
      Sel.round('R1').features.passAfterOptions = false;
      Game.load(Sel.roundQuestions('R1')[6].id, a); Game.showOptions(); Game.judge('wrong');
      T('বিকল্প নেওয়ার পর ভুল (পাস-বন্ধ রাউন্ড): উত্তর নিজে দেখায়', () => s().live.revealed === true);
      Sel.round('R1').features.passAfterOptions = true;
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
      T('রানডাউন: ১৩ অক্টোবরের ৩টি মূল রাউন্ড', () => rd.filter((x) => x.scene === 'ROUND_INTRO').length === s().rounds.filter((r) => r.enabled).length && s().rounds.filter((r) => r.enabled).map((r) => r.id).join() === 'R1,R2,R3');

      // ---- the latest rules (DOC-20261004-WA0002) for the 13 October main stage ----
      Store.state = normalizeState(defaultState());
      const R = (id) => Sel.round(id);
      T('নিয়ম: মূল পর্বের ৩টি রাউন্ডের নাম', () => R('R1').name === 'মজার মিশেল' && R('R2').name === 'চিন্তা ও চয়েস' && R('R3').name === 'বুদ্ধির টক্কর');
      T('নিয়ম: রাউন্ড ১–৩ চালু, ৪–৭ ফাইলে আছে কিন্তু বন্ধ', () => ['R1', 'R2', 'R3'].every((id) => R(id).enabled) && ['R4', 'R5', 'R6', 'R7'].every((id) => R(id) && !R(id).enabled));
      T('নিয়ম: নিয়মের লেখায় সময় ৬০ ও ৪৫ সেকেন্ড', () => ['R1', 'R2'].every((id) => R(id).rules.includes('৬০ সেকেন্ড') && R(id).rules.includes('৪৫ সেকেন্ড')));
      T('নিয়ম: কোথাও পুরনো ৩০/১৫ সেকেন্ড নেই', () => s().rounds.every((r) => !/(৩০|১৫) সেকেন্ড/.test(r.rules)) && !/(৩০|১৫) সেকেন্ড/.test(s().prelim.rules));
      T('নিয়ম: রাউন্ড ১ — সরাসরি ১০, চার বিকল্পে ৫, দুই বিকল্পে ৩', () => R('R1').scoring.direct === 10 && R('R1').scoring.options4 === 5 && R('R1').scoring.options2 === 3);
      T('নিয়ম: রাউন্ড ১ — পাসের পর পরের দলে ৫, ভুলে ০', () => R('R1').scoring.pass === 5 && R('R1').scoring.wrong === 0);
      T('নিয়ম: রাউন্ড ১ — বিকল্প আছে, উপস্থাপক বোতামে নম্বর দেন', () => R('R1').features.options && !R('R1').features.judgeOptions && R('R1').features.passAfterOptions);
      T('নিয়ম: রাউন্ড ১ ও ২ — চ্যালেঞ্জ নেই', () => !R('R1').features.challenge && !R('R2').features.challenge);
      T('নিয়ম: রাউন্ড ২ — কোনো বিকল্প নেই', () => R('R2').features.options === false);
      T('নিয়ম: রাউন্ড ৩ বুদ্ধির টক্কর — শুধু সরাসরি ১০, বিকল্প নেই, পাস নেই', () => R('R3').scoring.direct === 10 && R('R3').scoring.wrong === 0 && !R('R3').features.options && !R('R3').features.pass && !R('R3').features.lifelines);
      T('নিয়ম: রাউন্ড ৩ — একটি দলই বাজার টিপে চ্যালেঞ্জ, সঠিক +১০, ভুল −৫', () => R('R3').features.challenge && R('R3').features.singleChallenger && R('R3').scoring.challengeRight === 10 && R('R3').scoring.challengeWrong === -5);
      T('নিয়ম: রাউন্ড ৩-এর লেখায় "একই উত্তর গ্রাহ্য নয়"', () => R('R3').rules.includes('আলাদা') && R('R3').rules.includes('পাস নেই') && R('R3').rules.includes('৬০ সেকেন্ড'));
      T('নিয়ম: বাছাই পর্ব — ১৫টি প্রশ্ন, ৩/৬/৯/১২/১৫ তারকা', () => s().prelim.rules.includes('১৫টি') && Sel.prelimQuestions().map((q, i) => (q.star ? i + 1 : 0)).filter(Boolean).join() === '3,6,9,12,15');
      T('প্রশ্ন: রাউন্ড ১–৩-এ ১০টি করে, নম্বর ১–১০', () => ['R1', 'R2', 'R3'].every((id) => { const qs = Sel.roundQuestions(id); return qs.length === 10 && qs.map((q) => q.number).sort((x, y) => x - y).join() === '1,2,3,4,5,6,7,8,9,10'; }));
      T('প্রশ্ন: প্রতি রাউন্ডে অন্তত একটি পুরাণের প্রশ্ন', () => ['R1', 'R2', 'R3'].every((id) => Sel.roundQuestions(id).some((q) => /রাম|রাবণ|রামায়ণ|মহাভারত|কুরুক্ষেত্র|গীতা|দুর্গা|অর্জুন/.test(q.text))));
      T('প্রশ্ন: প্রতি রাউন্ডে অন্তত একটি গল্প/কার্টুনের প্রশ্ন', () => ['R1', 'R2', 'R3'].every((id) => Sel.roundQuestions(id).some((q) => /টুনটুনি|সুকুমার|খিচুড়ি|গুপী|বাঘা|প্রদোষচন্দ্র|মগজাস্ত্র|ঠাকুরমার/.test(q.text))));
      T('প্রশ্ন: ৭০টি প্রশ্নের একটিও বাদ যায়নি', () => s().questions.length === 70 && new Set(s().questions.map((q) => q.id)).size === 70);
      T('প্রশ্ন: সব প্রশ্নের সঠিক উত্তর বিকল্পের মধ্যে আছে', () => s().questions.every((q) => q.options[q.answer]));
      {
        const [ta, tb, tc] = Sel.finalistIds();
        Store.state.show.scene = 'QUESTION';
        Game.load(Sel.roundQuestions('R1')[7].id, ta);
        T('খেলা: রাউন্ড ১ সরাসরি সঠিক = ১০', () => Game.pointsFor('correct') === 10);
        Game.showOptions();
        T('খেলা: রাউন্ড ১ চার বিকল্পে = ৫', () => Game.pointsFor('correct') === 5);
        Game.useLifeline('fifty');
        T('খেলা: রাউন্ড ১ দুই বিকল্পে = ৩', () => Game.pointsFor('correct') === 3);
        Game.load(Sel.roundQuestions('R2')[0].id, ta);
        T('খেলা: রাউন্ড ২ — বিকল্প চাইলেও আসে না', () => Game.showOptions() === false && !s().live.optionsShown);
        T('খেলা: সরাসরি টাইমার ৬০ সেকেন্ড', () => Timer.durationFor('direct') === 60 && s().timer.duration === 60000);
        Game.judge('wrong'); Game.pass();
        T('খেলা: পাসে টাইমার ৪৫ সেকেন্ড', () => s().timer.duration === 45000 && Timer.durationFor('pass') === 45);
        T('খেলা: পাসের পর সঠিক = ৫', () => Game.pointsFor('correct') === 5);
        Game.load(Sel.roundQuestions('R3')[1].id, ta);
        const a0 = Sel.score(ta), b0 = Sel.score(tb), c0 = Sel.score(tc);
        T('খেলা: রাউন্ড ৩ সরাসরি সঠিক = ১০', () => Game.pointsFor('correct') === 10);
        T('খেলা: রাউন্ড ৩ — বিকল্প আসে না, পাস হয় না', () => Game.showOptions() === false && Game.pass() === false);
        Game.judge('wrong');
        T('খেলা: রাউন্ড ৩ — ভুলে ০, উত্তর লুকানো থাকে (চ্যালেঞ্জের সুযোগ)', () => Sel.score(ta) === a0 && !s().live.revealed);
        T('খেলা: রাউন্ড ৩ — প্রথম বাজার-চাপা দলই চ্যালেঞ্জ করে', () => Game.raiseHand(tb) === true && Game.raiseHand(tc) === false);
        Game.judgeHand(tb, true);
        T('খেলা: রাউন্ড ৩ — চ্যালেঞ্জে সঠিক +১০, উত্তর প্রকাশ', () => Sel.score(tb) === b0 + 10 && s().live.revealed);
        Game.load(Sel.roundQuestions('R3')[2].id, ta); Game.judge('correct');
        T('খেলা: রাউন্ড ৩ — সঠিক হলেও উত্তর সঙ্গে সঙ্গে দেখায় না', () => Sel.score(ta) === a0 + 10 && !s().live.revealed);
        Game.raiseHand(tc); Game.judgeHand(tc, false);
        T('খেলা: রাউন্ড ৩ — চ্যালেঞ্জে ভুল −৫', () => Sel.score(tc) === c0 - 5);
        Game.load(Sel.roundQuestions('R3')[3].id, ta);
        Actions.setActive(tb);
        T('খেলা: রাউন্ড ৩ — অন্য দলের নম্বর চাপলে বাজার (চ্যালেঞ্জ)', () => s().live.hands.includes(tb) && s().live.active === ta);
        Game.load(Sel.roundQuestions('R1')[8].id, ta); Game.judge('wrong');
        const target = Sel.finalistIds()[4];
        Actions.setActive(target);
        T('খেলা: ভুলের পরে দলের নম্বর চাপলে সেই দলে পাস', () => s().live.active === target && s().live.flow === 'pass' && s().timer.duration === 45000);
        const before = Sel.score(target); Game.judge('correct');
        T('খেলা: সঠিক উত্তরে নম্বর নিজে থেকে যোগ হয়', () => Sel.score(target) === before + 5);
        T('খেলা: নম্বর কী ১ = দল A / 1', () => Sel.teamByKey(1) === s().teams[0].id && Sel.teamByKey(8) === s().teams[7].id);
      }
      // ---- team codes, members, our identity / our team ----
      Store.state = normalizeState(defaultState());
      T('দল: ডিফল্ট ৮টি দল A / 1 … H / 8', () => s().teams.length === 8 && s().teams.map((t) => t.name).join('|') === 'A / 1|B / 2|C / 3|D / 4|E / 5|F / 6|G / 7|H / 8');
      T('দল: কোড অবস্থান অনুযায়ী', () => teamCode(0) === 'A / 1' && teamCode(7) === 'H / 8' && Sel.code(s().teams[2]) === 'C / 3');
      T('দল: নাম দিলে কোড + নাম', () => { s().teams[1].name = 'উত্তর কলমদান'; const ok = Sel.label(s().teams[1]) === 'B / 2 উত্তর কলমদান' && Sel.label(s().teams[0]) === 'A / 1'; s().teams[1].name = 'B / 2'; return ok; });
      T('দল: পুরনো "দল ৩" নাম কোডে বদলায়', () => normalizeState({ teams: [{ name: 'দল ১' }, { name: 'Team 2' }, { name: '' }] }).teams.map((t) => t.name).join('|') === 'A / 1|B / 2|C / 3');
      T('দল: নিজের দেওয়া নাম অক্ষত থাকে', () => normalizeState({ teams: [{ name: 'সূর্যমুখী' }] }).teams[0].name === 'সূর্যমুখী');
      T('সদস্য: শুরুতে কোনো সদস্য নেই', () => Sel.members(s().teams[0]).length === 0);
      s().teams[0].captain = 'রিয়া'; s().teams[0].players[0] = 'সোহম'; s().teams[0].captainPhoto = 'm_test1'; s().teams[0].playerPhotos[0] = 'm_test2';
      T('সদস্য: প্রতি দলে ২ জন (ছবিসহ)', () => { const m = Sel.members(s().teams[0]); return m.length === 2 && m[0].photo === 'm_test1' && m[1].photo === 'm_test2'; });
      T('সদস্য: দলের ছবি না থাকলে দুই সদস্যের মুখ', () => H.tphoto(s().teams[0]).includes('duo n2'));
      Show._rd = null;
      const rd2 = Show.rundown();
      const iTheme = rd2.findIndex((x) => x.scene === 'THEME'); const iId = rd2.findIndex((x) => x.scene === 'IDENTITY'); const iCrew = rd2.findIndex((x) => x.scene === 'CREW'); const iTeams = rd2.findIndex((x) => x.scene === 'TEAMS_ALL');
      T('পরিচয়: থিম সং → আমাদের পরিচয় → আমাদের টিম → সব দল', () => iTheme >= 0 && iTheme < iId && iId < iCrew && iCrew < iTeams);
      const introStep = rd2.find((x) => x.scene === 'TEAM_INTRO' && x.params.teamId === s().teams[0].id);
      Show.go(introStep);
      T('পরিচিতি: প্রথমে শুধু দল (সদস্য লুকানো)', () => s().show.params.sub === 0 && (Scenes.TEAM_INTRO(s(), s().show.params).html.match(/mem-card[^"]*hidden/g) || []).length === 2);
      Show.next();
      T('পরিচিতি: পরের চাপে সদস্য ১', () => s().show.scene === 'TEAM_INTRO' && s().show.params.sub === 1);
      Show.next();
      T('পরিচিতি: তারপর সদস্য ২', () => s().show.params.sub === 2 && !/mem-card[^"]*hidden/.test(Scenes.TEAM_INTRO(s(), s().show.params).html));
      Show.next();
      T('পরিচিতি: তারপর পরের দল', () => s().show.scene === 'TEAM_INTRO' && s().show.params.teamId === s().teams[1].id);
      Show.prev();
      T('পরিচিতি: পিছনে গেলে আগের দল সব সদস্যসহ', () => s().show.params.teamId === s().teams[0].id && s().show.params.sub === 2);
      T('পরিচিতি: দলের কোড বড় করে', () => (Scenes.TEAM_INTRO(s(), s().show.params).html.includes('TEAM A / 1') && Scenes.TEAM_INTRO(s(), s().show.params).html.includes('data-fit="15"')));
      Show.go(rd2[iCrew]);
      const nCrew = Sel.crew().length;
      T('আমাদের টিম: প্রথম কার্ড (অধিনায়ক) দিয়ে শুরু', () => s().show.params.sub === 1 && nCrew >= 2);
      for (let k = 0; k < nCrew + 3; k++) Show.sub(1);
      T('আমাদের টিম: সব কার্ড এলে থামে', () => s().show.params.sub === nCrew);
      T('আমাদের টিম: অধিনায়ক মাঝখানে', () => { const html = Scenes.CREW(s(), s().show.params).html; const parts = html.match(/data-part="c\d+"/g) || []; return parts.length === nCrew && parts[Math.floor((nCrew - 1) / 2)] === 'data-part="c0"'; });
      T('আমাদের পরিচয়: OUR IDENTITY ও প্রতিটি কৃতজ্ঞতা কার্ড', () => { const html = Scenes.IDENTITY(s()).html; return html.includes('OUR IDENTITY') && (html.match(/class="id-credit"/g) || []).length === s().event.credits.split('\n').filter((x) => x.trim()).length; });
      T('পুরনো সেভ: নতুন নিয়ম, নাম ও প্রশ্ন-বিন্যাস পায়, দল-ছবি অক্ষত', () => {
        const old = defaultState(); delete old.rulesVersion;
        old.rounds[2].name = 'দেখো তো চিনতে পারো কিনা'; old.rounds[2].type = 'bonus'; old.rounds[0].label = 'সাধারণ জ্ঞান ও চ্যালেঞ্জ'; old.rounds[0].rules = 'সময় ৩০ সেকেন্ড';
        old.questions[0].roundId = 'R7'; old.questions[0].text = 'নিজের লেখা'; old.teams[0].name = 'আমার দল'; old.teams[0].captainPhoto = 'm_keep';
        old.prelim.count = 20; old.audio.cues.correct.vol = 0.3;
        const n = normalizeState(old); const d = defaultState();
        return n.rounds[2].name === 'বুদ্ধির টক্কর' && n.rounds[2].type === 'standard' && n.rounds[0].label === d.rounds[0].label && n.rounds[0].rules === d.rounds[0].rules && n.questions[0].roundId === d.questions[0].roundId && n.questions[0].text === 'নিজের লেখা' && n.teams[0].name === 'আমার দল' && n.teams[0].captainPhoto === 'm_keep' && n.prelim.count === 15 && n.audio.cues.correct.vol === 1 && n.rulesVersion === RULES_VERSION;
      });
      T('পুরনো সেভ: ১২টি খালি "দল N" → ৮টি দল A / 1 … H / 8', () => { const old = defaultState(); delete old.rulesVersion; old.teams = Array.from({ length: 12 }, (_, i) => Object.assign(defaultTeam(i), { name: 'দল ' + bn(i + 1) })); const n = normalizeState(old); return n.teams.length === 8 && n.teams[7].name === 'H / 8'; });
      T('নতুন সেভ: অপারেটরের নিজের নিয়ম-বদল থাকে', () => { const cur = defaultState(); cur.rounds[0].label = 'আমার লেখা'; return normalizeState(cur).rounds[0].label === 'আমার লেখা'; });
      T('নিয়ম: রাউন্ড ১-এর পাশের লেখায় চ্যালেঞ্জ নেই', () => !R('R1').label.includes('চ্যালেঞ্জ') && R('R1').label.includes('বিকল্প'));
      // ---- design and sound ----
      T('নকশা: কোণে ঘুরন্ত লোগো চালু', () => s().design.corner.show && s().design.corner.spin && s().design.corner.pos === 'tr');
      T('নকশা: দৃশ্য বদলে স্পষ্ট রঙিন সুইপ', () => s().design.wipe === 'sweep');
      T('নকশা: নিয়ম — বড় শিরোনাম, নিচে দাগ, প্রতিটি নিয়ম আলাদা কার্ডে', () => { const sc = Scenes.ROUND_RULES(s(), { roundId: 'R1' }); const n = (R('R1').rules.match(/^[০-৯]+\./gm) || []).length; return sc.html.includes('rules-title') && sc.html.includes('rules-underline') && (sc.html.match(/class="rule-item"/g) || []).length === n && sc.html.includes('rule-key'); });
      T('নকশা: রাউন্ডের নাম বিশাল (১৯cqh পর্যন্ত)', () => Scenes.ROUND_INTRO(s(), { roundId: 'R1' }).html.includes('data-fit="19"'));
      Store.state.show.scene = 'QUESTION';
      Game.load(Sel.roundQuestions('R1')[0].id, s().teams[0].id);
      T('নকশা: প্রশ্নের সময় কোণে দলের ছবি ও "TEAM A / 1"', () => { const html = Scenes.QUESTION(s(), { qid: s().live.qid }).html; return html.includes('TEAM A / 1') && html.includes('team-photo'); });
      T('নকশা: লাইফলাইনের চিপ টিভিতে লুকানো (নিয়মে নেই)', () => s().settings.showLifelines === false && !Scenes.QUESTION(s(), { qid: s().live.qid }).html.includes('lifeline-row'));
      T('সাউন্ড: জোরালো — বুস্ট ও লিমিটার', () => s().audio.boost >= 1.5 && s().audio.musicBoost >= 1.5 && s().audio.master === 1);
      T('সাউন্ড: প্রতিটি এফেক্ট পূর্ণ ভলিউমে', () => Object.values(s().audio.cues).every((c) => c.vol === 1 && !c.mute));
      T('সাউন্ড: প্রশ্ন, বিকল্প, সঠিক, ভুল, পাস — সব সাউন্ড আছে', () => ['question', 'option', 'correct', 'wrong', 'pass', 'countdown', 'impact'].every((k) => AUDIO_CUES[k] && s().audio.cues[k]));
      T('সাউন্ড: থিম সং পূর্ণ ভলিউমে', () => s().audio.music.theme.vol === 1 && s().audio.music.theme.media === 'asset:theme');
      T('কাউন্টডাউন: একটু ধীরে (১.৫ সেকেন্ড/সংখ্যা)', () => s().settings.countdownStepMs >= 1400);

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
    // "Our team": after the first card the others arrive by themselves, one every crewStepMs (V100).
    if (s.show.scene === 'CREW' && s.settings.crewAuto) {
      const cur = int(s.show.params.sub, 1);
      const key = s.show.startedAt + ':' + cur;
      if (key !== this.crewKey) { this.crewKey = key; this.crewAt = now(); }
      else if (cur < Sel.crew().length && now() - this.crewAt >= int(s.settings.crewStepMs, 2800, 800, 20000)) { this.crewKey = ''; Show.sub(1); }
    }
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
/* V100 KeepAwake: the laptop and the TV window must never sleep mid-show. */
const KeepAwake = {
  lock: null, state: 'off',
  async acquire() {
    if (!('wakeLock' in navigator)) { this.state = 'unsupported'; return; }
    if (this.lock && !this.lock.released) return;
    try { this.lock = await navigator.wakeLock.request('screen'); this.state = 'on'; this.lock.addEventListener('release', () => { this.state = 'released'; }); } catch (e) { this.state = 'blocked'; }
  },
  init() {
    const again = () => { if (document.visibilityState === 'visible') this.acquire(); };
    document.addEventListener('visibilitychange', again);
    document.addEventListener('pointerdown', again, { passive: true });
    document.addEventListener('keydown', again);
    this.acquire();
  },
};

function boot() {
  window.addEventListener('error', (e) => Log.err('window', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => Log.err('promise', e.reason));
  Store.init();
  Media.init();
  Speech.init();
  Sync.init();
  Keys.init();
  KeepAwake.init();
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
  window.QC = Object.freeze({ VERSION, MODE, Store, Sel, Timer, Game, Show, Scenes, Media, Sync, SelfTest, AudioDirector, Speech, Log, Actions, Keys, Sfx, Music, SoundDirector, Coach, NexusImport, NLP, AI, Legacy, ImportUI, renderCertificate, zipStore });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
