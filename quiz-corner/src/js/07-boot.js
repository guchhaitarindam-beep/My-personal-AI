/* =====================================================================
   STAGE WINDOW (#stage) — audience output only, never shows controls.
   ===================================================================== */
const Stage = {
  view: null,
  init() {
    document.body.classList.add('mode-stage');
    document.title = 'Quiz Corner — STAGE' + ((document.title.match(/ · [\d-]+ [\d:]+$/) || [''])[0]); // keeps the build time, so the launcher can check the right file is on the TV
    document.body.innerHTML = '<div id="stageRoot" style="position:fixed;inset:0;background:#000"></div>';
    this.view = new StageView($('#stageRoot'));
    Bus.on('change', () => { DesignSystem.apply(); AudioDirector.setBoost(); this.view.render(); this.audioGate(); });
    DesignSystem.apply();
    this.view.render();
    document.addEventListener('dblclick', () => this.toggleFullscreen());
    document.addEventListener('click', (e) => {
      AudioDirector.unlock(); this.audioGate();
      // podium lottery: a card clicked on the TV is chosen / opened by the control window
      const c = e.target.closest && e.target.closest('[data-draw]');
      if (c) Sync.send({ type: 'act', name: 'drawPick', arg: c.getAttribute('data-draw') });
    });
    let idle = 0;
    document.addEventListener('mousemove', () => { document.body.style.cursor = ''; clearTimeout(idle); idle = setTimeout(() => { document.body.style.cursor = 'none'; }, 2500); });
    // opened by the one-click launcher the browser allows sound at once: start it now, so nobody has to click the TV
    if (AudioDirector.isOutput()) { AudioDirector.unlock(); if (AudioDirector.ctx) AudioDirector.ctx.addEventListener('statechange', () => this.audioGate()); setTimeout(() => this.audioGate(), 400); }
    this.audioGate();
  },
  audioGate() {
    const need = AudioDirector.isOutput() && (!AudioDirector.unlocked || !AudioDirector.ctx || AudioDirector.ctx.state !== 'running');
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
    let h = '<div class="row"><span class="status-pill ok">' + esc(SCENE_LABELS[s.show.scene] || SCENES[s.show.scene] || s.show.scene) + '</span><span class="grow"></span><span class="bigtime" id="hostTime" style="font-family:var(--font-timer);font-size:3rem"></span></div>';
    if (s.show.scene === 'QUESTION') {
      const q = Sel.liveQuestion(); const t = Sel.team(Sel.answeringTeam());
      if (q) h += '<div class="card"><div class="muted">' + esc((Sel.round(q.roundId) || {}).name || '') + ' • Question ' + q.number + (t ? ' • ' + esc(t.name) + ' (' + Game.flowName(s.live.flow) + ')' : '') + '</div><div class="hq">' + esc(q.text) + '</div>' + (q.options.filter(Boolean).length ? '<div class="hq" style="font-size:1.4rem">' + q.options.map((o, i) => (o ? OPT_LABELS[i] + ') ' + esc(o) : '')).filter(Boolean).join(' &nbsp; ') + '</div>' : '') + this.ans(q.answerText || q.options[q.answer] || '') + (q.explanation && this.visible() ? '<div class="muted">' + esc(q.explanation) + '</div>' : '') + '</div>';
    } else if (s.show.scene === 'PRELIM_Q') {
      const q = Sel.prelimQuestions()[s.prelimLive.idx];
      if (q) h += '<div class="card"><div class="muted">Prelim question ' + (s.prelimLive.idx + 1) + (q.star ? ' ★' : '') + '</div><div class="hq">' + esc(q.text) + '</div>' + this.ans(q.answer) + '</div>';
    }
    h += '<div class="card"><h3>Scores</h3><div class="team-chips">' + Sel.standings().map((r) => '<span class="chip" style="--team:' + esc(r.team.color) + '">' + bn(r.rank) + '. ' + esc(r.team.name) + ' <span class="pts">' + bn(r.score) + '</span></span>').join('') + '</div></div>';
    $('#host').innerHTML = h;
    this.clock();
  },
  visible() { return Store.state.settings.hostAnswer === 'always' || this.show; },
  ans(text) { return this.visible() ? '<div class="ha">Answer: ' + esc(text) + '</div>' : '<button id="hostShowAns" class="btn gold lg">👁 Show answer (here only)</button>'; },
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
    // round 1 is picture questions (no typed options); the scoring tests below borrow round 2's words and options for round 1
    const typedR1 = () => { const r3 = Store.state.questions.filter((q) => q.roundId === 'R2'); Store.state.questions.filter((q) => q.roundId === 'R1').forEach((q, i) => { const d = r3[i % r3.length]; Object.assign(q, { text: d.text, options: d.options.slice(), answer: d.answer, answerText: '', image: '', picOnly: false, answerImage: '', answerWide: false }); }); };
    try {
      Store.state = normalizeState(defaultState()); typedR1();
      const s = () => Store.state;
      T('Default: 7 rounds', () => s().rounds.length === 7);
      T('Default: direct timer 60 s (all rounds), rapid fire 15 s', () => s().rounds.every((r) => r.timers.direct === (r.type === 'rapid' ? 15 : 60)) && Sel.round('R5').timers.direct === 15);
      T('Default: pass/bonus timer 45 s (all rounds)', () => s().rounds.every((r) => r.timers.pass === 45));
      T('Default: 15 prelim questions (latest rules), each has an answer', () => Sel.prelimQuestions().length === 15 && Sel.prelimQuestions().every((q) => q.text && q.answer));
      T('Default: top 8 teams go to the final', () => s().prelim.finalistCount === 8 && Sel.finalistIds().length === 8);
      T('V100 question bank preserved', () => s().questions.length >= 70 ? 'প্রশ্ন: ' + s().questions.length : false);
      T('Normalising corrupted data', () => { const n = normalizeState({ teams: 'x', rounds: [null], questions: [{}], ledger: [1, null], timer: { duration: 'abc' } }); return n.teams.length > 0 && n.rounds.length === 1 && n.timer.duration === 60000; });

      // ---- timer ----
      Store.state.show.scene = 'QUESTION';
      const q1 = Sel.roundQuestions('R1')[0];
      Game.load(q1.id, Sel.finalistIds()[0]);
      T('Timer: direct 60 s loaded', () => s().timer.duration === 60000 && !s().timer.running);
      Timer.start('direct', 60);
      T('Timer: running', () => s().timer.running && Sel.timerRemaining() > 59000);
      Timer.pause();
      const pausedAt = Sel.timerRemaining();
      T('Timer: pause holds steady', () => !s().timer.running && Math.abs(Sel.timerRemaining() - pausedAt) < 1);
      Timer.resume();
      T('Timer: resumes', () => s().timer.running);
      Timer.start('pass', Timer.durationFor('pass'));
      T('Timer: pass 45 s', () => s().timer.duration === 45000 && s().timer.mode === 'pass');
      const oldToken = s().timer.token;
      s().timer.startedAt = now() - 46000; // force expiry
      Timer.tick();
      T('Timer: time-up fires only once', () => s().timer.expired && !s().timer.running && Sel.timerRemaining() === 0);
      Timer.start('direct', 60);
      T('Timer: race — new timer cancels the old token', () => s().timer.token > oldToken && !s().timer.expired && s().timer.running);
      Timer.reset();
      T('Timer: reset', () => !s().timer.running && s().timer.base === s().timer.duration);
      Timer.start('direct', 60, 5000);
      T('Timer: delayed start for the drone', () => Sel.timerRemaining() === 60000);
      Timer.stop();

      // ---- scoring ----
      const [a, b, c] = Sel.finalistIds();
      Game.load(q1.id, a);
      Game.judge('correct');
      T('Score: direct correct +10', () => Sel.score(a) === 10);
      Game.load(Sel.roundQuestions('R2')[1].id, b);
      Game.judge('wrong');
      Game.pass();
      // round 2 counts backwards (H / 8 → A / 1): B / 2's pass goes to A / 1
      T('Pass: goes to the next team (round 2: backwards, B / 2 → A / 1) with 45 s', () => s().live.flow === 'pass' && s().live.active === a && s().timer.mode === 'pass');
      Game.judge('correct');
      T('Score: correct on pass +5', () => Sel.score(a) === 15 && Sel.score(b) === 0);
      // the lifelines themselves (not used on 13 Oct: round 1 has them switched off) — tried with them switched on for a moment
      Sel.round('R1').features.lifelines = true;
      Game.load(Sel.roundQuestions('R1')[2].id, a);
      Game.showOptions();
      T('Score: worth 5 with 4 options', () => Game.pointsFor('correct') === 5);
      Game.useLifeline('fifty');
      T('50:50: two wrong options removed, correct one stays', () => s().live.eliminated.length === 2 && !s().live.eliminated.includes(Sel.liveQuestion().answer));
      T('Score: worth 3 with 2 options', () => Game.pointsFor('correct') === 3);
      T('Lifeline: same team cannot use it again', () => Game.useLifeline('fifty') === false);
      Game.useLifeline('poll');
      T('Audience poll: totals 100%', () => s().live.poll.reduce((x, y) => x + y, 0) === 100);
      const before = s().live.qid;
      Game.useLifeline('flip');
      T('Flip: swaps to a reserve question', () => s().live.qid !== before && Sel.question(s().live.qid).roundId === s().flipPool);
      Sel.round('R1').features.lifelines = false;
      Game.load(Sel.roundQuestions('R4')[0].id, a);
      Game.challenge(b);
      Game.judge('wrong');
      T('Challenge: wrong costs the challenger −5', () => Sel.score(b) === -5);
      T('Challenge: only one team', () => Game.challenge(c) === false);
      { const rb = Store.state.rounds.find((r) => r.id === 'R3'); rb.type = 'bonus'; rb.features.pass = true; rb.features.challenge = false; rb.scoring.bonusStep = 2; }
      Store.state.questions.push(questionFromSeed({ id: 'TBON', roundId: 'R3', number: 1, text: 'বোনাস পরীক্ষা', options: ['ক', 'খ'], answer: 0 }, 0));
      Game.load('TBON', a); Game.pass(); Game.pass();
      T('Bonus: two passes give 10+2+2 = 14', () => Game.pointsFor('correct') === 14 && s().live.flow === 'bonus');
      const r5 = Sel.round('R5'); r5.type = 'rapid';
      Game.load(Sel.roundQuestions('R5')[0].id, a);
      T('Rapid: ±5', () => Game.pointsFor('correct') === 5 && Game.pointsFor('wrong') === -5);
      T('Rapid (buzzer round): no board, no turn, never an audience question — the TV says BUZZER / বাজার টিপুন!', () => { const rd = Show.rundown(); const q = Sel.roundQuestions('R5')[2]; Game.load(q.id); const html = Scenes.QUESTION(s(), { qid: q.id }).html; return !rd.some((x) => x.scene === 'GRID' && x.params.roundId === 'R5') && !s().live.active && !s().live.audience && Sel.turnTeam(Sel.round('R5')) === '' && html.includes('BUZZER') && html.includes('বাজার টিপুন'); });
      Game.load(Sel.roundQuestions('R5')[0].id, a);
      T('Rapid: a two-option question shows both options — none is removed (that would give the answer away)', () => s().live.eliminated.length === 0 && Sel.liveQuestion().options.filter(Boolean).length === 2);
      Game.toggleLock();
      T('Lock: score does not change while locked', () => Game.judge('correct') === false && Game.pass() === false);
      Game.toggleLock();
      const sa = Sel.score(a);
      Game.judge('noscore');
      T('No score: 0', () => Sel.score(a) === sa);
      Game.adjust(a, 7, 'test');
      T('Manual adjustment', () => Sel.score(a) === sa + 7);
      Store.undo();
      T('Undo: adjustment reverted', () => Sel.score(a) === sa);
      Store.redo();
      T('Redo: applied again', () => Sel.score(a) === sa + 7);
      T('Ledger: before/after are continuous', () => { const tot = {}; return s().ledger.every((e) => { const b = tot[e.team] || 0; const ok = e.before === b && e.after === b + e.delta; tot[e.team] = e.after; return ok; }); });
      // hands-up: several teams, each judged once
      Store.state.rounds.find((r) => r.id === 'R4').features.singleChallenger = false;
      Game.load(Sel.roundQuestions('R4')[1].id, a);
      Game.raiseHand(b); Game.raiseHand(c);
      T('Hands up: several teams', () => s().live.hands.length === 2 && Game.raiseHand(a) === false);
      const sb0 = Sel.score(b); const sc0 = Sel.score(c);
      Game.judgeHand(b, true); Game.judgeHand(c, false);
      T('Hands up: correct +10, wrong −5, each judged once', () => Sel.score(b) === sb0 + 10 && Sel.score(c) === sc0 - 5 && Game.judgeHand(b, true) === false);
      Store.state.rounds.find((r) => r.id === 'R4').features.singleChallenger = true;
      Game.load(Sel.roundQuestions('R4')[2].id, a);
      Game.raiseHand(b);
      T('Single buzzer: a second team cannot raise a hand', () => Game.raiseHand(c) === false);
      // multiplier
      const r1 = Sel.round('R1'); r1.multiplier = 2;
      Game.load(Sel.roundQuestions('R1')[3].id, a);
      T('Multiplier ×2: direct = 20', () => Game.pointsFor('correct') === 20);
      r1.multiplier = 1;
      // manual bonus once
      const sa2 = Sel.score(a);
      Game.bonus();
      T('Manual bonus only once', () => Sel.score(a) === sa2 + 5 && Game.bonus() === false);
      // 13 Oct rule: round 1 has no pass — after a wrong answer (with or without options) the answer stays hidden for a challenge
      Game.load(Sel.roundQuestions('R1')[4].id, a); Game.showOptions(); Game.judge('wrong');
      T('Round 1: no pass; a wrong answer with options waits for a challenge', () => s().live.revealed === false && Game.pass() === false);
      // a round with options but no pass after them (and no challenge) reveals the answer by itself
      { const r2 = Sel.round('R2'); const keep = clone(r2.features); Object.assign(r2.features, { options: true, passAfterOptions: false });
        Game.load(Sel.roundQuestions('R2')[6].id, a); Game.showOptions(); Game.judge('wrong');
        T('Wrong after options (no-pass round): answer reveals itself', () => s().live.revealed === true);
        r2.features = keep; }
      T('Cannot score correct twice on the same question', () => { Game.load(Sel.roundQuestions('R1')[5].id, a); Game.judge('correct'); return Game.judge('correct') === false; });
      // rapid: wrong closes
      Game.load(Sel.roundQuestions('R5')[1].id, b); Game.judge('wrong');
      T('Rapid: wrong ends the question', () => s().live.closed && s().live.revealed && Game.judge('correct') === false);
      T('Tie detection and place titles', () => Array.isArray(Sel.ties()) && Sel.rankTitle(1) === 'চ্যাম্পিয়ন' && Sel.rankTitle(5) === 'ফাইনালিস্ট');
      T('Audit: every change is in the ledger', () => s().ledger.every((e) => e.id && e.team && Number.isInteger(e.delta)));

      // ---- prelim ranking ----
      const t = s().teams;
      t.forEach((x) => { x.prelim.marks = []; x.prelim.manual = null; x.prelim.stars = null; });
      t[0].prelim.marks = [true, true, false]; // 10, star q3 not
      t[1].prelim.marks = [false, true, true]; // 10, star q3 yes
      t[2].prelim.marks = [true, true]; // 10, no star — earlier correct than t0? equal
      T('Prelim tiebreak: more ★ ranks higher', () => Sel.prelimRanking()[0].team.id === t[1].id);
      t[3].prelim.manual = 50;
      T('Prelim: manual marks take priority', () => Sel.prelimRanking()[0].team.id === t[3].id);
      Show.confirmFinalists();
      T('Final 8 confirmed', () => s().finalists.length === 8 && s().finalists[0] === t[3].id);

      // ---- standings / final ----
      const st = Sel.standings();
      T('Standings: descending order', () => st.every((r, i) => i === 0 || st[i - 1].score >= r.score));
      T('Winner determined', () => !!Show.winner());

      // ---- every scene renders ----
      const rd = Show.rundown();
      const bad = [];
      rd.forEach((step) => { Store.state.show.scene = step.scene; Store.state.show.params = step.params; if (step.scene === 'QUESTION') Store.state.live.qid = step.params.qid; try { const out = (Scenes[step.scene])(Store.state, step.params); if (!out || typeof out.html !== 'string' || !out.key) bad.push(step.key); } catch (e) { bad.push(step.key + ': ' + e.message); } });
      T('Render: every rundown scene (' + rd.length + ')', () => (bad.length ? bad.slice(0, 3).join('; ') && false : true));
      T('Rundown: prelim questions skipped on the day (results only)', () => !rd.some((x) => /^PRELIM_(RULES|COUNTDOWN|Q)$/.test(x.scene)) && rd.some((x) => x.scene === 'PRELIM_RESULT'));
      T('Rundown: prelim questions return when switched on', () => { Store.state.prelim.onStage = true; const ok = ['PRELIM_RULES', 'PRELIM_COUNTDOWN', 'PRELIM_Q'].every((k) => Show.rundown().some((x) => x.scene === k)); Store.state.prelim.onStage = false; return ok && !Show.rundown().some((x) => x.scene === 'PRELIM_Q'); });
      T('Rundown: full show flow', () => ['ORGANIZER', 'LOGO', 'PROGRAMME', 'THEME', 'TEAM_INTRO', 'PRELIM_RESULT', 'FINALISTS', 'FINALIST_INTRO', 'WELCOME', 'DRAW', 'PODIUM', 'MAIN_TITLE', 'MAIN_COUNTDOWN', 'ROUND_INTRO', 'GRID', 'QUESTION', 'SCOREBOARD', 'FINAL', 'WINNER', 'END'].every((k) => rd.some((x) => x.scene === k)));
      T('Rundown: the 3 main rounds and the rapid-fire round', () => rd.filter((x) => x.scene === 'ROUND_INTRO').length === s().rounds.filter((r) => r.enabled).length && s().rounds.filter((r) => r.enabled).map((r) => r.id).join() === 'R1,R2,R3,R5');

      // ---- the latest rules (DOC-20261004-WA0002) for the 13 October main stage ----
      Store.state = normalizeState(defaultState()); typedR1();
      const R = (id) => Sel.round(id);
      T('Rules: names of the 3 main-stage rounds', () => R('R1').name === 'মজার মিশেল' && R('R2').name === 'চিন্তা ও চয়েস' && R('R3').name === 'বুদ্ধির টক্কর');
      T('Rules: rounds 1–3 and the rapid-fire round (R5, 20 two-option questions) enabled; 4, 6, 7 in the file but disabled', () => ['R1', 'R2', 'R3', 'R5'].every((id) => R(id).enabled) && ['R4', 'R6', 'R7'].every((id) => R(id) && !R(id).enabled) && R('R5').type === 'rapid' && Sel.roundQuestions('R5').length === 20 && Sel.roundQuestions('R5').every((q) => q.options.filter(Boolean).length === 2 && q.options[q.answer]) && Sel.roundQuestions('R5').find((q) => q.number === 20).options[Sel.roundQuestions('R5').find((q) => q.number === 20).answer] === 'Au');
      T('Rules: rule text says 60 seconds (round 2 also 45 for the pass)', () => ['R1', 'R2', 'R3'].every((id) => R(id).rules.includes('৬০ সেকেন্ড')) && R('R2').rules.includes('৪৫ সেকেন্ড'));
      T('Rules: no old 30/15 seconds anywhere', () => s().rounds.every((r) => !/(৩০|১৫) সেকেন্ড/.test(r.rules)) && !/(৩০|১৫) সেকেন্ড/.test(s().prelim.rules));
      T('Rules: round 1 — direct 10, 4 options 5, 2 options 3', () => R('R1').scoring.direct === 10 && R('R1').scoring.options4 === 5 && R('R1').scoring.options2 === 3);
      T('Rules: round 1 — no pass; one team buzzes to challenge; correct +10 / +5, wrong −5 / −3', () => !R('R1').features.pass && !R('R1').features.passAfterOptions && R('R1').features.challenge && R('R1').features.singleChallenger && R('R1').scoring.challengeAsPlayed && R('R1').scoring.challengeWrong === -5 && R('R1').scoring.challengeWrongOptions === -3 && R('R1').scoring.wrong === 0);
      T('Rules: round 1 — options exist, judged on the option the team names', () => R('R1').features.options && R('R1').features.judgeOptions);
      T('Rules: round 1 text — no pass, challenge +10 / +5, wrong −5 / −3', () => R('R1').rules.includes('কোনো পাস নেই') && R('R1').rules.includes('চ্যালেঞ্জ') && R('R1').rules.includes('সঠিক উত্তরে +১০, ভুল উত্তরে −৫') && R('R1').rules.includes('সঠিক উত্তরে +৫, ভুল উত্তরে −৩') && R('R1').rules.includes('বিকল্প কমিয়ে দুটি করা হবে না') && !R('R1').features.lifelines && R('R1').features.cutToTwo === false && !R('R1').rules.includes('৪৫ সেকেন্ড'));
      T('Rules: round 2 — no challenge', () => !R('R2').features.challenge);
      T('Rules: round 2 — no options', () => R('R2').features.options === false);
      T('Rules: round 3 — direct 10 only, no options, no pass', () => R('R3').scoring.direct === 10 && R('R3').scoring.wrong === 0 && !R('R3').features.options && !R('R3').features.pass && !R('R3').features.lifelines);
      T('Rules: round 3 — one team buzzes to challenge, correct +10, wrong −5', () => R('R3').features.challenge && R('R3').features.singleChallenger && R('R3').scoring.challengeRight === 10 && R('R3').scoring.challengeWrong === -5);
      T('Rules: round 3 text says "same answer not accepted"', () => R('R3').rules.includes('আলাদা') && R('R3').rules.includes('পাস নেই') && R('R3').rules.includes('৬০ সেকেন্ড'));
      T('Rules: prelim — 15 questions, stars on 3/6/9/12/15', () => s().prelim.rules.includes('১৫টি') && Sel.prelimQuestions().map((q, i) => (q.star ? i + 1 : 0)).filter(Boolean).join() === '3,6,9,12,15');
      T('Questions: 10 each in rounds 1–3, numbered 1–10', () => ['R1', 'R2', 'R3'].every((id) => { const qs = Sel.roundQuestions(id); return qs.length === 10 && qs.map((q) => q.number).sort((x, y) => x - y).join() === '1,2,3,4,5,6,7,8,9,10'; }));
      // Round 1 opens with a current-affairs question (13 Oct, the organiser's choice); rounds 2 and 3 keep a mythology question
      T('Questions: round 2 from 2ND_ROUND.pptx — Q1 চৈত্র, Q10 Joint Photographic Experts Group', () => { const d0 = normalizeState(defaultState()); const RQ = (rid) => d0.questions.filter((q) => q.roundId === rid).sort((a, b) => a.number - b.number); const a = (rid, n) => { const q = RQ(rid).find((x) => x.number === n); return q ? q.options[q.answer] : ''; }; return a('R2', 1) === 'চৈত্র' && a('R2', 10) === 'Joint Photographic Experts Group'; });
      T('Questions: round 3 is the 10 picture questions of 3RD_ROUND.pptx — picture only; the answer a picture or the written answer', () => { const d0 = normalizeState(defaultState()); const q = d0.questions.filter((x) => x.roundId === 'R3').sort((a, b) => a.number - b.number); return q.length === 10 && q.every((x, i) => x.picOnly && x.image === 'asset:r3pic_q' + String(i + 1).padStart(2, '0') + '.jpg' && document.getElementById('asset-' + x.image.slice(6)) && x.answerText && (!x.answerImage || document.getElementById('asset-' + x.answerImage.slice(6)))) && q[0].answerText.includes('শূন্য') && q[5].answerImage === 'asset:r3pic_a06.jpg'; });
      T('Questions: round 1 is the 10 picture questions of 1ST_ROUND.pptx — each a question picture and an answer picture, both built in', () => { const d0 = normalizeState(defaultState()); const RQ = (rid) => d0.questions.filter((q) => q.roundId === rid).sort((a, b) => a.number - b.number); const q = RQ('R1'); return q.length === 10 && q.every((x, i) => x.picOnly && x.image === 'asset:r1pic_q' + String(i + 1).padStart(2, '0') + '.jpg' && x.answerImage === 'asset:r1pic_a' + String(i + 1).padStart(2, '0') + '.jpg' && document.getElementById('asset-' + x.image.slice(6)) && document.getElementById('asset-' + x.answerImage.slice(6)) && x.answerText); });
      T('Questions: every round 2 question has four options and an answer among them', () => { const d0 = normalizeState(defaultState()); const RQ = (rid) => d0.questions.filter((q) => q.roundId === rid).sort((a, b) => a.number - b.number); return ['R2'].every((id) => RQ(id).every((q) => q.options.filter(Boolean).length === 4 && q.options[q.answer])); });
      T('Questions: round 2 shows no picture beside the question (the words come first)', () => { const d0 = normalizeState(defaultState()); const RQ = (rid) => d0.questions.filter((q) => q.roundId === rid).sort((a, b) => a.number - b.number); return ['R2'].every((id) => RQ(id).every((q) => !q.image)); });
      T('Questions: old saves lose the subject pictures beside the question; the operator\'s own picture stays', () => { const old = defaultState(); delete old.rulesVersion; const a = old.questions.find((q) => q.roundId === 'R1'); const b = old.questions.find((q) => q.roundId === 'R2'); a.image = 'asset:topic_telescope.png'; b.image = 'm_mine'; const n = normalizeState(old); return n.questions.find((q) => q.id === a.id).image === '' && n.questions.find((q) => q.id === b.id).image === 'm_mine'; });
      T('Questions: none of the original 70 dropped (total ' + s().questions.length + ')', () => Array.from({ length: 70 }, (_, i) => 'Q' + String(i + 1).padStart(2, '0')).every((id) => Sel.question(id)) && new Set(s().questions.map((q) => q.id)).size === s().questions.length);
      T('Questions: every correct answer is among the options (picture questions: the answer is a picture)', () => normalizeState(defaultState()).questions.every((q) => q.picOnly ? q.answerImage || q.answerText : q.options[q.answer]));
      {
        const [ta, tb, tc] = Sel.finalistIds();
        Store.state.show.scene = 'QUESTION';
        Game.load(Sel.roundQuestions('R1')[7].id, ta);
        T('Game: round 1 direct correct = 10', () => Game.pointsFor('correct') === 10);
        Game.showOptions();
        T('Game: round 1 with 4 options = 5', () => Game.pointsFor('correct') === 5);
        T('Game: round 1 — no 50:50 and no cutting to 2 options (only the 4 options)', () => Game.useLifeline('fifty') === false && Game.twoOptions() === false && s().live.eliminated.length === 0 && Game.pointsFor('correct') === 5);
        {
          const q1 = Sel.question(s().live.qid); const sa = Sel.score(ta);
          const wrongIdx = [0, 1, 2, 3].find((i) => i !== q1.answer && q1.options[i]);
          Game.load(Sel.roundQuestions('R1')[1].id, ta); Game.showOptions();
          const qq = Sel.liveQuestion(); Game.pick(qq.answer);
          T('Game: round 1 — picking the correct option of 4 gives +5 at once', () => Sel.score(ta) === sa + 5 && s().live.result === 'correct');
          // like round 3: after the answer (right or wrong) the answer stays hidden; the first team to buzz may challenge
          Game.load(Sel.roundQuestions('R1')[2].id, ta); Game.judge('correct');
          T('Game: round 1 — like round 3, the answer is not shown at once even when correct', () => !s().live.revealed && s().live.result === 'correct');
          // direct: +10 / −5; 4 options: +5 / −3
          Game.load(Sel.roundQuestions('R1')[3].id, ta); Game.judge('wrong');
          T('Game: round 1 — wrong direct answer stays hidden for a challenge', () => !s().live.revealed && Game.pass() === false);
          T('Game: round 1 — after a direct answer the challenge is +10 / −5', () => Game.challengeValue() === 10 && Game.challengePenalty() === -5);
          const cb2 = Sel.score(tb); Game.raiseHand(tb); Game.judgeHand(tb, true);
          T('Game: round 1 — challenge after a direct answer is worth 10', () => Sel.score(tb) === cb2 + 10);
          Game.load(Sel.roundQuestions('R1')[6].id, ta); Game.judge('wrong');
          const cd = Sel.score(tc); Game.raiseHand(tc); Game.judgeHand(tc, false);
          T('Game: round 1 — wrong challenge after a direct answer −5', () => Sel.score(tc) === cd - 5);
          Game.load(Sel.roundQuestions('R1')[5].id, ta); Game.showOptions(); Game.judge('wrong');
          const cc = Sel.score(tc); T('Game: round 1 — challenge after 4 options is +5 / −3', () => Game.challengeValue() === 5 && Game.challengePenalty() === -3);
          Game.raiseHand(tc); Game.judgeHand(tc, false);
          T('Game: round 1 — wrong challenge after 4 options −3', () => Sel.score(tc) === cc - 3);
          void wrongIdx;
        }
        Game.load(Sel.roundQuestions('R2')[0].id, ta);
        T('Game: round 2 — options cannot be shown', () => Game.showOptions() === false && !s().live.optionsShown);
        T('Game: direct timer 60 seconds', () => Timer.durationFor('direct') === 60 && s().timer.duration === 60000);
        Game.judge('wrong'); Game.pass();
        T('Game: pass timer 45 seconds', () => s().timer.duration === 45000 && Timer.durationFor('pass') === 45);
        T('Game: correct after a pass = 5', () => Game.pointsFor('correct') === 5);
        Game.load(Sel.roundQuestions('R3')[1].id, ta);
        const a0 = Sel.score(ta), b0 = Sel.score(tb), c0 = Sel.score(tc);
        T('Game: round 3 direct correct = 10', () => Game.pointsFor('correct') === 10);
        T('Game: round 3 — no options, no pass', () => Game.showOptions() === false && Game.pass() === false);
        Game.judge('wrong');
        T('Game: round 3 — wrong gives 0, answer stays hidden (chance to challenge)', () => Sel.score(ta) === a0 && !s().live.revealed);
        T('Game: round 3 — first team to buzz gets the challenge', () => Game.raiseHand(tb) === true && Game.raiseHand(tc) === false);
        Game.judgeHand(tb, true);
        T('Game: round 3 — challenge correct +10, answer revealed', () => Sel.score(tb) === b0 + 10 && s().live.revealed);
        Game.load(Sel.roundQuestions('R3')[2].id, ta); Game.judge('correct');
        T('Game: round 3 — answer not shown at once even when correct', () => Sel.score(ta) === a0 + 10 && !s().live.revealed);
        Game.raiseHand(tc); Game.judgeHand(tc, false);
        T('Game: round 3 — challenge wrong −5', () => Sel.score(tc) === c0 - 5);
        Game.load(Sel.roundQuestions('R3')[3].id, ta);
        Actions.setActive(tb);
        T('Game: round 3 — pressing another team number buzzes (challenge)', () => s().live.hands.includes(tb) && s().live.active === ta);
        Game.load(Sel.roundQuestions('R2')[8].id, ta); Game.judge('wrong');
        const target = Sel.finalistIds()[4];
        Actions.setActive(target);
        T('Game: after a wrong answer, pressing a team number passes to that team', () => s().live.active === target && s().live.flow === 'pass' && s().timer.duration === 45000);
        const before = Sel.score(target); Game.judge('correct');
        T('Game: points added automatically on a correct answer', () => Sel.score(target) === before + 5);
        T('Game: number key 1 = team A / 1', () => Sel.teamByKey(1) === s().teams[0].id && Sel.teamByKey(8) === s().teams[7].id);
      }
      // ---- team codes, members, our identity / our team ----
      Store.state = normalizeState(defaultState()); typedR1();
      T('Teams: 8 default teams A / 1 … H / 8', () => s().teams.length === 8 && s().teams.map((t) => t.name).join('|') === 'A / 1|B / 2|C / 3|D / 4|E / 5|F / 6|G / 7|H / 8');
      T('Teams: code follows position', () => teamCode(0) === 'A / 1' && teamCode(7) === 'H / 8' && Sel.code(s().teams[2]) === 'C / 3');
      T('Teams: with a name, code + name', () => { s().teams[1].name = 'উত্তর কলমদান'; const ok = Sel.label(s().teams[1]) === 'B / 2 উত্তর কলমদান' && Sel.label(s().teams[0]) === 'A / 1'; s().teams[1].name = 'B / 2'; return ok; });
      T('Teams: old "Team 3" names become codes', () => normalizeState({ teams: [{ name: 'দল ১' }, { name: 'Team 2' }, { name: '' }] }).teams.map((t) => t.name).join('|') === 'A / 1|B / 2|C / 3');
      T('Prelim: manually entered total and stars are kept in saves', () => { const n = normalizeState({ teams: [{ prelim: { manual: 70, stars: 3, marks: [] } }] }); return n.teams[0].prelim.manual === 70 && n.teams[0].prelim.stars === 3; });
      T('Call to stage: prelim score and place shown large', () => { const st0 = normalizeState(defaultState()); st0.teams[0].prelim.manual = 70; st0.teams[0].school = 'উত্তর কলমদান'; const keep = Store.state; Store.state = st0; const h = Scenes.FINALIST_INTRO(st0, { teamId: st0.teams[0].id, n: 1 }).html; Store.state = keep; return h.includes('fin-score') && h.includes('70') && h.includes('উত্তর কলমদান'); });
      T('Teams: custom name kept intact', () => normalizeState({ teams: [{ name: 'সূর্যমুখী' }] }).teams[0].name === 'সূর্যমুখী');
      T('Members: no members at start', () => Sel.members(s().teams[0]).length === 0);
      s().teams[0].captain = 'রিয়া'; s().teams[0].players[0] = 'সোহম'; s().teams[0].captainPhoto = 'm_test1'; s().teams[0].playerPhotos[0] = 'm_test2';
      T('Members: 2 per team (with photos)', () => { const m = Sel.members(s().teams[0]); return m.length === 2 && m[0].photo === 'm_test1' && m[1].photo === 'm_test2'; });
      T('Members: without a team photo, the two members’ faces', () => H.tphoto(s().teams[0]).includes('duo n2'));
      Show._rd = null;
      const rd2 = Show.rundown();
      const iTheme = rd2.findIndex((x) => x.scene === 'THEME'); const iId = rd2.findIndex((x) => x.scene === 'IDENTITY'); const iCrew = rd2.findIndex((x) => x.scene === 'CREW'); const iTeams = rd2.findIndex((x) => x.scene === 'TEAMS_ALL');
      T('Identity: theme song → our identity → our team → all teams', () => iTheme >= 0 && iTheme < iId && iId < iCrew && iCrew < iTeams);
      const introStep = rd2.find((x) => x.scene === 'TEAM_INTRO' && x.params.teamId === s().teams[0].id);
      Show.go(introStep);
      T('Intro: team first (members hidden)', () => s().show.params.sub === 0 && (Scenes.TEAM_INTRO(s(), s().show.params).html.match(/mem-card[^"]*hidden/g) || []).length === 2);
      Show.next();
      T('Intro: next press shows member 1', () => s().show.scene === 'TEAM_INTRO' && s().show.params.sub === 1);
      Show.next();
      T('Intro: then member 2', () => s().show.params.sub === 2 && !/mem-card[^"]*hidden/.test(Scenes.TEAM_INTRO(s(), s().show.params).html));
      Show.next();
      T('Intro: then the next team', () => s().show.scene === 'TEAM_INTRO' && s().show.params.teamId === s().teams[1].id);
      Show.prev();
      T('Intro: going back shows previous team with all members', () => s().show.params.teamId === s().teams[0].id && s().show.params.sub === 2);
      T('Intro: team code shown large', () => (Scenes.TEAM_INTRO(s(), s().show.params).html.includes('TEAM A / 1') && Scenes.TEAM_INTRO(s(), s().show.params).html.includes('data-fit="15"')));
      Show.go(rd2[iCrew]);
      const nCrew = Sel.crew().length;
      T('Our team: starts with the first card (centre person)', () => s().show.params.sub === 1 && nCrew >= 2);
      for (let k = 0; k < nCrew + 3; k++) Show.sub(1);
      T('Our team: stops when all cards are in', () => s().show.params.sub === nCrew);
      T('Our team: first person exactly in the centre', () => { const html = Scenes.CREW(s(), s().show.params).html; const parts = html.match(/data-part="c\d+"/g) || []; return parts.length === nCrew && parts[Math.ceil((nCrew - 1) / 2)] === 'data-part="c0"'; });
      T('Our identity: OUR IDENTITY and every credit card', () => { const html = Scenes.IDENTITY(s()).html; return html.includes('OUR IDENTITY') && (html.match(/class="id-credit"/g) || []).length === s().event.credits.split('\n').filter((x) => x.trim()).length; });
      T('Old save: gets new rules, names and question layout, team photos intact', () => {
        const old = defaultState(); delete old.rulesVersion;
        old.rounds[2].name = 'দেখো তো চিনতে পারো কিনা'; old.rounds[2].type = 'bonus'; old.rounds[0].label = 'সাধারণ জ্ঞান ও চ্যালেঞ্জ'; old.rounds[0].rules = 'সময় ৩০ সেকেন্ড';
        old.questions[0].roundId = 'R7'; old.questions[0].text = 'নিজের লেখা'; old.teams[0].name = 'আমার দল'; old.teams[0].captainPhoto = 'm_keep';
        old.prelim.count = 20; old.audio.cues.correct.vol = 0.3;
        const n = normalizeState(old); const d = defaultState();
        return n.rounds[2].name === 'বুদ্ধির টক্কর' && n.rounds[2].type === 'standard' && n.rounds[0].label === d.rounds[0].label && n.rounds[0].rules === d.rounds[0].rules && n.questions[0].roundId === d.questions[0].roundId && n.questions[0].text === 'নিজের লেখা' && n.teams[0].name === 'আমার দল' && n.teams[0].captainPhoto === 'm_keep' && n.prelim.count === 15 && n.audio.cues.correct.vol === 1 && n.rulesVersion === RULES_VERSION;
      });
      T('Old save: changed questions get new text, operator’s own text kept', () => {
        const old = defaultState(); delete old.rulesVersion;
        const seedOld = arr(SEED.questions).find((q) => arr(q.prevText).length);
        const a = old.questions.find((q) => q.id === seedOld.id); a.text = seedOld.prevText[0]; a.options = ['১', '২', '৩', '৪']; a.voiceQ = 'm_oldvoice';
        const mine = old.questions.find((q) => !arr((arr(SEED.questions).find((x) => x.id === q.id) || {}).prevText).length); mine.text = 'আমার নিজের প্রশ্ন';
        const n = normalizeState(old); const d = defaultState();
        const na = n.questions.find((q) => q.id === seedOld.id);
        return na.text === d.questions.find((q) => q.id === seedOld.id).text && na.options[0] !== '১' && na.voiceQ !== 'm_oldvoice' && na.voiceQ === d.questions.find((q) => q.id === seedOld.id).voiceQ && n.questions.find((q) => q.id === mine.id).text === 'আমার নিজের প্রশ্ন';
      });
      T('Questions: no left-over "good to know" fact from the old questions in rounds 1–3', () => ['R1', 'R2', 'R3'].every((id) => Sel.roundQuestions(id).every((q) => !q.explanation)));
      T('Old save: new questions added and changed prelim questions get new text', () => {
        const old = defaultState(); delete old.rulesVersion;
        old.questions = old.questions.filter((q) => !['Q71', 'Q72', 'Q73'].includes(q.id));
        const sw = arr(SEED.prelim).find((p) => arr(p.prevText).length); old.prelim.questions[0].text = sw.prevText[0];
        const n = normalizeState(old);
        return ['Q71', 'Q72', 'Q73'].every((id) => n.questions.some((q) => q.id === id)) && !n.prelim.questions.some((q) => q.text === sw.prevText[0]);
      });
      T('Questions: no question repeated between main stage and prelim', () => { const pre = Sel.prelimQuestions().map((q) => q.text); return ['R1', 'R2', 'R3'].every((id) => Sel.roundQuestions(id).every((q) => !pre.includes(q.text))); });
      {
        Show._rd = null; const rr = Show.rundown(); const at = (sc) => rr.findIndex((x) => x.scene === sc);
        T('Order: finalists called to stage → welcome → our identity → our team → team intro → countdown → round', () => at('FINALIST_INTRO') < at('WELCOME') && at('WELCOME') < at('IDENTITY') && at('IDENTITY') < at('CREW') && at('CREW') < at('TEAM_INTRO') && at('TEAM_INTRO') < at('MAIN_COUNTDOWN') && at('MAIN_COUNTDOWN') < at('ROUND_INTRO'));
        const g = rr.find((x) => x.scene === 'GRID' && x.params.roundId === 'R1'); Show.go(g);
        Actions.gridKey(5);
        T('Question board: pressing 5 opens question 5', () => s().show.scene === 'QUESTION' && Sel.question(s().live.qid).number === 5 && Sel.question(s().live.qid).roundId === 'R1');
      }
      T('Old save: 12 empty "Team N" → 8 teams A / 1 … H / 8', () => { const old = defaultState(); delete old.rulesVersion; old.teams = Array.from({ length: 12 }, (_, i) => Object.assign(defaultTeam(i), { name: 'দল ' + bn(i + 1) })); const n = normalizeState(old); return n.teams.length === 8 && n.teams[7].name === 'H / 8'; });
      T('New save: operator’s own rule edits kept', () => { const cur = defaultState(); cur.rounds[0].label = 'আমার লেখা'; return normalizeState(cur).rounds[0].label === 'আমার লেখা'; });
      T('Rules: round 1 side label — options and challenge', () => R('R1').label.includes('চ্যালেঞ্জ') && R('R1').label.includes('বিকল্প'));
      T('Bulk media: round and question from file name', () => { const a = bulkMediaTarget('R1-5.jpg'); const b = bulkMediaTarget('r2_10.png'); const c = bulkMediaTarget('রাউন্ড৩-প্রশ্ন৭.mp3'); const d = bulkMediaTarget('holiday photo.jpg'); return a.round === 1 && a.n === 5 && b.round === 2 && b.n === 10 && c.round === 3 && c.n === 7 && d === null; });
      T('Recording: question / options / answer / clip from file name', () => { const a = bulkMediaTarget('R1-5.mp3'); const b = bulkMediaTarget('R1-5-বিকল্প.mp3'); const c = bulkMediaTarget('r2_3-উত্তর.m4a'); const d = bulkMediaTarget('R3-7-clip.mp3'); const e = bulkMediaTarget('R1-5-opt.mp3'); const f = bulkMediaTarget('R2-4 ans.wav'); return a.voice === 'q' && b.voice === 'opt' && b.n === 5 && c.voice === 'ans' && c.round === 2 && c.n === 3 && d.voice === 'clip' && e.voice === 'opt' && f.voice === 'ans'; });
      T('Recording: empty slots in old saves, kept in new ones', () => { const q = questionFromSeed({ voiceQ: 'm_x', voiceAns: 'm_y' }, 0); const old = mergeDefaults(questionFromSeed({}, 0), { id: 'Q', text: 'ক' }); return q.voiceQ === 'm_x' && q.voiceAns === 'm_y' && q.voiceOpt === '' && old.voiceQ === '' && old.voiceOpt === ''; });
      {
        const realPlay = VoicePlayer.play; const played = []; VoicePlayer.play = (id) => { played.push(id); return true; };
        const realSay = Speech.say; const said = []; Speech.say = (t) => { said.push(t); };
        try {
          Store.state.show.scene = 'QUESTION';
          const q1 = Sel.roundQuestions('R1')[2]; Game.load(q1.id, Sel.finalistIds()[0]);
          Object.assign(Sel.question(q1.id), { voiceQ: 'm_q', voiceOpt: 'm_o', voiceAns: 'm_a' });
          Store.state.speech.rec = true;
          Speech.readQuestion(false); Speech.readOptions(false); Speech.readAnswer(false);
          T('Recording: question / options / answer — own voice recording plays, not computer voice', () => played.join() === 'm_q,m_o,m_a' && said.length === 0);
          played.length = 0; Store.state.live.eliminated = [0, 1]; Speech.readOptions(true);
          T('Recording: 4-option recording not played after cutting to 2 options', () => played.length === 0 && said.length === 1 && !said[0].includes(Sel.question(q1.id).options[0]));
          played.length = 0; Store.state.speech.rec = false; Speech.readQuestion(false); Speech.readQuestion(true);
          T('Recording: with "auto play" off, plays only when the button is pressed', () => played.join() === 'm_q');
          T('Recording: control has "🎙 play question" and "stop reading" buttons', () => { const h = UI.liveHtml(); return h.includes('🎙 Play question') && h.includes('🎙 Play answer') && h.includes('Stop reading'); });
          T('Recording list: file names and script text', () => voiceScript(Sel.question(q1.id), 'voiceOpt').startsWith(OPT_LABELS[0] + ') ') && voiceScript(Sel.question(q1.id), 'voiceAns').startsWith('সঠিক উত্তর: '));
        } finally { VoicePlayer.play = realPlay; Speech.say = realSay; }
      }
      {
        Store.state = normalizeState(defaultState()); typedR1();
        const st = () => Store.state;
        st().teams.forEach((t, i) => { t.school = 'বিদ্যালয় ' + bn(i + 1); t.prelim.manual = 10 + ((i * 5) % 8); });
        const before = Sel.finalistIds().slice(); const top = Sel.prelimRanking()[0].team.id; const ids0 = st().teams.map((t) => t.id);
        Show._rd = null; const rr = Show.rundown(); const at = (sc) => rr.findIndex((x) => x.scene === sc);
        T('Lottery: podium lottery right after welcome, then identity and team intro', () => at('DRAW') === at('WELCOME') + 1 && at('DRAW') < at('IDENTITY') && at('DRAW') < at('TEAM_INTRO'));
        Show.go(rr.find((x) => x.scene === 'FINALIST_INTRO'));
        const fi = Scenes.FINALIST_INTRO(st(), st().show.params).html;
        T('Before the lottery the stage call shows school name, not team code', () => !fi.includes('tcode') && fi.includes('বিদ্যালয়'));
        Show.go(rr.find((x) => x.scene === 'DRAW'));
        T('Lottery: starts with 8 teams in prelim order, prelim winner first', () => st().draw.queue.length === 8 && st().draw.queue.join() === before.join() && Draw.next() === before[0]);
        Draw.pick(2);
        T('Lottery: first press selects a card (glows), podium not opened', () => st().draw.pending === 2 && st().draw.picks.length === 0 && Scenes.DRAW(st()).html.includes('dcard pending'));
        Draw.pick(2);
        const p0 = st().draw.picks[0];
        T('Lottery: second press opens the podium, team code = podium', () => p0 && p0.team === before[0] && Sel.teamIndex(p0.team) === p0.podium && Sel.code(Sel.team(p0.team)) === teamCode(p0.podium) && Scenes.DRAW(st()).html.includes('dcard open'));
        T('Lottery: a taken card cannot be taken again', () => Draw.pick(2) === false && st().draw.picks.length === 1);
        [0, 1, 3, 4, 5, 6, 7].forEach((c) => { Draw.pick(c); Draw.pick(c); });
        const pods = st().draw.picks.map((p) => p.podium);
        T('Lottery: 8 teams on 8 different podiums', () => st().draw.picks.length === 8 && new Set(pods).size === 8 && pods.every((x) => x >= 0 && x < 8) && Draw.next() === '');
        T('Lottery: each team in its own podium slot — codes A / 1 … H / 8 match', () => st().draw.picks.every((p) => Sel.teamIndex(p.team) === p.podium && st().teams[p.podium].name === teamCode(p.podium)));
        T('Lottery: then game and scoreboard in podium order (A / 1 first)', () => Sel.finalistIds().map((id) => Sel.teamIndex(id)).join() === '0,1,2,3,4,5,6,7');
        T('Lottery: school and prelim score move with the team; colour stays with the podium', () => Sel.prelimRanking()[0].team.id === top && st().teams.every((t) => t.school === 'বিদ্যালয় ' + bn(ids0.indexOf(t.id) + 1)) && st().teams.every((t, i) => t.color === TEAM_COLORS[i % TEAM_COLORS.length]));
        T('Lottery: all cards open on screen, "go sit at your podium"', () => { const h = Scenes.DRAW(st()).html; return (h.match(/dcard open/g) || []).length === 8 && h.includes('নিজের পোডিয়ামে'); });
        T('Lottery: when done, team codes return on all screens', () => { Show.go(Show.rundown().find((x) => x.scene === 'TEAM_INTRO')); return Scenes.TEAM_INTRO(st(), st().show.params).html.includes('TEAM A / 1') || Scenes.TEAM_INTRO(st(), st().show.params).html.includes('A / 1'); });
        T('After the lottery the podium screen shows the chosen card; old "special presentation" step gone', () => { const h = Scenes.PODIUM(st()).html; const it = st().draw.items[st().draw.picks[0].card]; return h.includes(it.label) && !h.includes('রসগোল্লা') && !Show.rundown().some((x) => x.scene === 'GIFT'); });
        T('Winner screen: team code letter / member photos (not a number)', () => { const h = Scenes.WINNER(st()).html; const w = Show.winner(); return !w || h.includes('>' + Sel.code(w.team).charAt(0) + '<'); });
        T('Lottery: theme change (sports, greats…) — locked once started', () => Draw.theme('sports') === false && (Draw.reset(), Draw.theme('greats')) && st().draw.items[0].label === 'রবীন্দ্রনাথ ঠাকুর' && firstGrapheme('স্বামী বিবেকানন্দ') === 'স্বা');

        Store.state = normalizeState(defaultState()); typedR1(); Show._rd = null; // the tests below start from the stock order T1 … T8
      }
      T('Our team: Arindam Guchhait in the centre, then Subrata, Pradip, Chandan Paloi, Sanjay, Sourav — all with photos, no "captain"', () => { const c = defaultState().crew; return c.map((x) => x.name).join('|') === 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পালই|সঞ্জয় মণ্ডল|সৌরভ মাইতি' && !JSON.stringify(c).includes('অধিনায়ক') && !defaultState().event.credits.includes('অধিনায়ক') && !Scenes.CREW(defaultState(), { sub: 6 }).html.includes('অধিনায়ক') && c.every((x, i) => x.photo === 'asset:crew' + i) && c[5].role.includes('সহযোগিতা') && defaultState().event.credits.includes('সহযোগিতায়: সৌরভ মাইতি') && !defaultState().event.credits.includes('চন্দন পাল ও'); });
      T('Our team: old crew list in old saves becomes the new team, own edits kept', () => { const old = defaultState(); delete old.rulesVersion; old.crew = 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|মহেশ্বর দাস|প্রতাপ বেড়া|কমলেন্দু মাইতি'.split('|').map((name) => ({ name, role: '', about: '', photo: '' })); old.event.credits = 'প্রশ্ন সংকলন ও ডিজাইন: অরিন্দম গুছাইত\nপুরনো'; const n = normalizeState(old); const mine = defaultState(); delete mine.rulesVersion; mine.crew = [{ name: 'আমার লোক', role: '', about: '', photo: '' }]; const v7 = defaultState(); delete v7.rulesVersion; v7.crew = 'অরিন্দম গুছাইত|সুব্রত মাইতি|প্রদীপ ভূঁইয়া|চন্দন পাল|সঞ্জয় মণ্ডল'.split('|').map((name) => ({ name, role: '', about: '', photo: '' })); v7.event.credits = 'পরিকল্পনা, মূল পর্বের প্রশ্ন সংকলন ও কুইজ ইঞ্জিন: অরিন্দম গুছাইত (অধিনায়ক)\nবাছাই পর্বের প্রশ্ন সংকলন: চন্দন পাল ও প্রদীপ ভূঁইয়া'; const n7 = normalizeState(v7); return n7.crew.length === 6 && n7.crew[3].name === 'চন্দন পালই' && n7.crew[5].photo === 'asset:crew5' && n7.event.credits.includes('সৌরভ') && n.crew.length === 6 && n.crew[2].photo === 'asset:crew2' && n.event.credits.includes('সঞ্জয় মণ্ডল') && n.event.credits.includes('টিকাশী গুচ্ছ সম্পদ কেন্দ্র') && normalizeState(mine).crew[0].name === 'আমার লোক'; });
      T('Corrections: an old save still holding an old question gets the new one (text, options, subject, picture), its old reading dropped', () => { const o = defaultState(); delete o.rulesVersion; const sq = SEED.questions.find((q) => q.roundId === 'R2' && q.number === 1); const q = o.questions.find((x) => x.id === sq.id); Object.assign(q, { text: sq.prevText[0], options: ['ক', 'খ', 'গ', 'ঘ'], subject: 'সাম্প্রতিক ঘটনা', voiceQ: 'asset:voice_R2_1' }); const n = normalizeState(o).questions.find((x) => x.id === sq.id); return n.text === sq.text && n.options[n.answer] === 'চৈত্র' && n.subject === sq.subject && n.voiceQ === '' && n.image === ''; });
      T('Corrections: an old save still holding the old round 1 question gets the picture question (picture, answer picture)', () => { const o = defaultState(); delete o.rulesVersion; const sq = SEED.questions.find((q) => q.roundId === 'R1' && q.number === 1); const q = o.questions.find((x) => x.id === sq.id); Object.assign(q, { text: sq.prevText[0], options: ['ক', 'খ', 'গ', 'ঘ'], image: '', picOnly: false, answerImage: '', voiceQ: 'asset:voice_R1_1' }); const n = normalizeState(o).questions.find((x) => x.id === sq.id); return n.picOnly && n.image === 'asset:r1pic_q01.jpg' && n.answerImage === 'asset:r1pic_a01.jpg' && n.voiceQ === ''; });
      {
        Store.state.show.scene = 'QUESTION'; const q3 = Sel.roundQuestions('R3')[0]; Game.load(q3.id, Sel.finalistIds()[0]); Game.reveal();
        const h3 = Scenes.QUESTION(s(), s().show.params).html;
        T('Answer: in a round without options (round 3) no (A/B/C/D) label before the answer', () => h3.includes(q3.options[q3.answer]) && !h3.includes('(' + OPT_LABELS[q3.answer] + ')'));
      }
      {
        Store.state = normalizeState(defaultState()); typedR1(); Show._rd = null;
        const ids = Sel.finalistIds(); const rid = 'R1'; const qn = (n) => Sel.roundQuestions(rid).find((q) => q.number === n);
        Show.go(Show.rundown().find((x) => x.scene === 'GRID' && x.params.roundId === rid));
        Actions.gridKey(5); Game.judge('correct'); Game.reveal();
        T('Board: team A / 1 chooses first (question 5)', () => s().show.scene === 'QUESTION' && s().live.qid === qn(5).id && s().live.active === ids[0]);
        Show.next();
        T('Board: Next after the answer → back to the board, now the 2nd team\'s turn', () => s().show.scene === 'GRID' && Game.turnFor(rid) === ids[1]);
        Actions.gridKey(5);
        T('Board: a played number does not open again', () => s().show.scene === 'GRID' && s().live.qid === qn(5).id);
        Show.next();
        T('Board: Next on the board waits for the team to choose', () => s().show.scene === 'GRID');
        Actions.gridKey(10); Actions.setActive(ids[3]);
        T('Turn order: another team\'s number cannot take a direct turn (strictly in order)', () => s().live.active === ids[1]);
        Game.judge('wrong');
        T('Board: 2nd team (B / 2) answers its own choice (question 10)', () => s().show.scene === 'QUESTION' && s().live.qid === qn(10).id && s().live.active === ids[1]);
        Show.next();
        T('Board: then the 3rd team, and so on', () => s().show.scene === 'GRID' && Game.turnFor(rid) === ids[2]);
        Actions.loadQ(qn(5).id);
        T('Board: an earlier played number does not open from its button either', () => s().show.scene === 'GRID' && s().live.qid === qn(10).id);
        // the other 5 teams take their turns (C … H)
        const free = () => Sel.roundQuestions(rid).filter((q) => !s().board.played[q.id]);
        for (let k = 0; k < 6; k++) { Actions.gridKey(free()[0].number); Show.next(); }
        T('Board: each of the 8 teams gets exactly one turn (A / 1 … H / 8)', () => R(rid).turnsTaken.join() === ids.join() && Game.turnFor(rid) === '');
        T('Board: after H / 8 the board says "audience question"', () => s().show.scene === 'GRID' && Scenes.GRID(s(), s().show.params).html.includes('দর্শকদের প্রশ্ন'));
        const led = s().ledger.length;
        Actions.gridKey(free()[0].number);
        T('Audience question: no team, judging gives no points', () => s().live.audience === true && !s().live.active && Game.judge('correct') === false && s().ledger.length === led);
        T('Audience question: choosing a team is refused too', () => Game.setActive(ids[0]) === false && !s().live.active);
        T('Audience question: the TV shows the audience card', () => Scenes.QUESTION(s(), s().show.params).html.includes('audience-card'));
        Show.next(); Show.next();
        T('Board: with only audience numbers left, Next → the round scoreboard', () => s().show.scene === 'SCOREBOARD' && s().show.params.roundId === rid);
        T('Turn order: round 2 runs anti-clockwise, H / 8 first; round 3 starts again at A / 1', () => Game.turnFor('R2') === ids[ids.length - 1] && Game.turnFor('R3') === ids[0]);
        // the turns follow the team codes even when the finalists are listed in prelim-rank order (no podium lottery)
        { const keep = s().finalists.slice(); s().finalists = [ids[3], ids[0], ids[7], ids[1], ids[6], ids[2], ids[5], ids[4]].filter(Boolean); // a prelim-rank order, not A … H
          const code = (id) => Sel.code(Sel.team(id));
          T('Turn order by team code, not by prelim rank: round 2 H / 8 first, round 3 A / 1 first', () => code(Game.turnFor('R2')) === 'H / 8' && code(Game.turnFor('R3')) === 'A / 1', code(Game.turnFor('R2')) + ' / ' + code(Game.turnFor('R3')));
          s().finalists = keep; }
        // round 2's passes count backwards too: F / 6 cannot answer → E / 5 → D / 4; A / 1 → H / 8
        { const byCode = Sel.finalistsByCode(); const code = (id) => Sel.code(Sel.team(id)); const q2 = Sel.roundQuestions('R2');
          Game.load(q2[0].id, byCode[5]); Game.judge('wrong'); const p1 = Game.nextPassTeam(); Game.pass(); Game.judge('wrong'); const p2 = Game.nextPassTeam();
          Game.load(q2[1].id, byCode[0]); Game.judge('wrong'); const p3 = Game.nextPassTeam();
          T('Round 2: a pass goes backwards — F / 6 → E / 5 → D / 4, A / 1 → H / 8', () => code(p1) === 'E / 5' && code(p2) === 'D / 4' && code(p3) === 'H / 8', [p1, p2, p3].map(code).join(', '));
          Store.state = normalizeState(defaultState()); typedR1(); Show._rd = null; }
        Store.state = normalizeState(defaultState()); typedR1(); Show._rd = null;
      }
      T('Blackout shows a red alert and a restore button in control', () => { s().show.blackout = true; const h = UI.liveHtml(); s().show.blackout = false; return h.includes('blackout-alert') && h.includes('Show on TV again') && !UI.liveHtml().includes('blackout-alert'); });
      {
        const ids = Sel.finalistIds();
        Store.state = normalizeState(defaultState()); typedR1(); Store.state.show.scene = 'QUESTION';
        // a played round: A/1 direct +10, B/2 wrong then C/3 challenges correctly +10, D/4 with the 4 options +5
        const qs = Sel.roundQuestions('R1');
        Game.load(qs[0].id, ids[0]); Game.judge('correct');
        Game.load(qs[1].id, ids[1]); Game.judge('wrong'); Game.raiseHand(ids[2]); Game.judgeHand(ids[2], true);
        Game.load(qs[2].id, ids[3]); Game.showOptions(); Game.pick(Sel.liveQuestion().answer);
        T('Tally: A/1 = 10, B/2 = 0, C/3 = 10 (challenge), D/4 = 5, total = 25', () => Sel.score(ids[0]) === 10 && Sel.score(ids[1]) === 0 && Sel.score(ids[2]) === 10 && Sel.score(ids[3]) === 5 && ids.reduce((t, id) => t + Sel.score(id), 0) === 25);
        T('Tally: round scores separate and match the total', () => ids.every((id) => Sel.roundScore(id, 'R1') === Sel.score(id)));
        T('Tally: every score in the ledger with before/after', () => s().ledger.every((e) => e.after === e.before + e.delta));
        const sbStep = Show.rundown().find((x) => x.scene === 'SCOREBOARD' && x.params.roundId === 'R1'); Show.go(sbStep);
        const h0 = Scenes.SCOREBOARD(s(), s().show.params).html;
        const order = (h0.match(/class="rank code">([^<]+)</g) || []).map((x) => x.replace(/.*>/, '').replace('<', ''));
        T('Scoreboard step 1: by code A / 1 … H / 8', () => order.join('|') === ids.map((id) => Sel.code(Sel.team(id))).join('|') && order[0] === 'A / 1');
        Show.next();
        const h1 = Scenes.SCOREBOARD(s(), s().show.params).html;
        T('Scoreboard step 2: by rank (reveals bottom-up), no round-champion banner (13 Oct)', () => s().show.scene === 'SCOREBOARD' && h1.includes('reveal-up') && !h1.includes('round-champ') && h1.includes('A / 1') && h1.includes('+10'));
        T('Scoreboard: team photo on every row; school and both children on the rows', () => { const t = Sel.team(ids[0]); const keep = [t.school, t.captain, t.players[0]]; Object.assign(t, { school: 'পরীক্ষা বিদ্যালয়', captain: 'রিয়া' }); t.players[0] = 'অয়ন'; const h = Scenes.SCOREBOARD(s(), s().show.params).html; [t.school, t.captain, t.players[0]] = keep; return (h1.match(/class="sb-row/g) || []).length === Sel.standings().length && (h1.match(/team-photo/g) || []).length >= Sel.standings().length && h.includes('পরীক্ষা বিদ্যালয়') && h.includes('রিয়া • অয়ন'); });
        Show.next();
        T('After the rapid-fire round (the last): final result → top 3 → winner → closing, no more rounds', () => { const rr = Show.rundown(); const last = rr.map((x) => x.scene); const iSB = rr.findIndex((x) => x.scene === 'SCOREBOARD' && x.params.roundId === 'R5'); return iSB > 0 && last.slice(iSB + 1).join() === 'FINAL,TOP3,WINNER,END' && rr.filter((x) => x.scene === 'ROUND_INTRO').length === 4; });
      }
      // ---- design and sound ----
      T('Design: spinning corner logo on', () => s().design.corner.show && s().design.corner.spin && s().design.corner.pos === 'tr');
      T('Design: clear coloured sweep on scene change', () => s().design.wipe === 'sweep');
      T('Design: rules — big title, underline, each rule on its own card', () => { const sc = Scenes.ROUND_RULES(s(), { roundId: 'R1' }); const n = (R('R1').rules.match(/^[০-৯]+\./gm) || []).length; return sc.html.includes('rules-title') && sc.html.includes('rules-underline') && (sc.html.match(/class="rule-item"/g) || []).length === n && sc.html.includes('rule-key'); });
      T('Design: round name huge (up to 19cqh)', () => Scenes.ROUND_INTRO(s(), { roundId: 'R1' }).html.includes('data-fit="19"'));
      Store.state.show.scene = 'QUESTION';
      Game.load(Sel.roundQuestions('R1')[0].id, s().teams[0].id);
      T('Design: team photo and "TEAM A / 1" in the corner during a question', () => { const html = Scenes.QUESTION(s(), { qid: s().live.qid }).html; return html.includes('TEAM A / 1') && html.includes('team-photo'); });
      T('Design: lifeline chips hidden on TV (not in the rules)', () => s().settings.showLifelines === false && !Scenes.QUESTION(s(), { qid: s().live.qid }).html.includes('lifeline-row'));
      T('Score strip of all teams under the question (A / 1 … H / 8)', () => { const html = Scenes.QUESTION(s(), { qid: s().live.qid }).html; return (html.match(/class="scell/g) || []).length === Sel.finalistIds().length && html.includes('H / 8'); });
      T('Corner card has team photo, TEAM code, name and score', () => { const html = Scenes.QUESTION(s(), { qid: s().live.qid }).html; return html.includes('tcode-big') && html.includes('class="tscore"') && html.includes('team-photo'); });
      {
        const qid3 = Sel.roundQuestions('R3')[5].id; const [x, y] = Sel.finalistIds();
        Game.load(qid3, x); Game.raiseHand(y);
        const html = Scenes.QUESTION(s(), { qid: qid3 }).html;
        T('Round 3: on buzz, challenger and answering team — both photos, codes and scores', () => html.includes('CHALLENGE') && html.includes(Sel.code(Sel.team(x))) && html.includes(Sel.code(Sel.team(y))) && (html.match(/class="mscore"/g) || []).length === 2);
        Game.load(Sel.roundQuestions('R2')[9].id, x); Game.judge('wrong'); Game.pass();
        T('On a pass the new team photo, code and score appear in the corner', () => { const h = Scenes.QUESTION(s(), { qid: s().live.qid }).html; return h.includes('PASS TO') && h.includes('TEAM ' + Sel.code(Sel.team(s().live.active))) && h.includes('class="tscore"'); });
      }
      T('Default: applause on correct, theme sting at round start, soft music during questions', () => s().settings.autoApplause && s().audio.themeSting && s().audio.bgm.questionLevel > 0 && s().audio.bgm.questionLevel < 1);
      T('Sound: loud — boost and limiter', () => s().audio.boost >= 1.5 && s().audio.musicBoost >= 1.5 && s().audio.master === 1);
      T('Sound: every effect at full volume', () => Object.values(s().audio.cues).every((c) => c.vol === 1 && !c.mute));
      T('Sound: question, option, correct, wrong, pass — all sounds present', () => ['question', 'option', 'correct', 'wrong', 'pass', 'countdown', 'impact'].every((k) => AUDIO_CUES[k] && s().audio.cues[k]));
      T('Sound: theme song at full volume', () => s().audio.music.theme.vol === 1 && s().audio.music.theme.media === 'asset:theme');
      T('Brand stays QUIZ CORNER (programme, identity); main-round title is separate; event subtitle present', () => { const d = defaultState().event; const st = Store.state; const prog = Scenes.PROGRAMME(st).html.replace(/<[^>]+>/g, ''); return d.brandEn === 'QUIZ CORNER' && d.mainTitle === 'JUNIOR GENIUS SEASON 4' && !!str(d.subtitle).trim() && prog.includes(st.event.brandEn + ' presents') && !prog.includes('JUNIOR GENIUS SEASON 4 presents'); });
      T('Old save (title stored as brand) gets QUIZ CORNER back and keeps the main-round title', () => { const o = defaultState(); o.rulesVersion = 14; o.event.brandEn = 'JUNIOR GENIUS SEASON 4'; delete o.event.mainTitle; delete o.event.subtitle; const n = normalizeState(o); return n.event.brandEn === 'QUIZ CORNER' && n.event.mainTitle === 'JUNIOR GENIUS SEASON 4' && !!str(n.event.subtitle).trim(); });
      T('JUNIOR GENIUS SEASON 4: opening before the countdown, and on round intro, team intro, question, scoreboard and winner', () => {
        const st = Store.state; const keep = [st.show.scene, st.show.params]; const rd2 = Show.rundown(); const at = (k) => rd2.findIndex((x) => x.scene === k);
        const has = (sc, p) => { st.show.scene = sc; st.show.params = p || {}; const h = Scenes[sc](st, st.show.params).html.replace(/<[^>]+>/g, ''); return h.includes('JUNIOR GENIUS SEASON 4'); };
        const r1 = st.rounds[0]; const team = st.teams[0];
        const ok = at('MAIN_TITLE') >= 0 && at('MAIN_TITLE') === at('MAIN_COUNTDOWN') - 1 && has('MAIN_TITLE') && has('ROUND_INTRO', { roundId: r1.id }) && has('TEAM_INTRO', { teamId: team.id, n: 1 }) && has('SCOREBOARD', { roundId: r1.id }) && has('GRID', { roundId: r1.id });
        [st.show.scene, st.show.params] = keep; return ok;
      });
      T('Round 1 on the TV: only the question picture — no words, no answer picture until the answer button; then right / wrong as before', () => {
        const keep = Store.state; Store.state = normalizeState(defaultState()); Store.state.show.scene = 'QUESTION';
        try {
          const qs = Sel.roundQuestions('R1'); const q1 = qs[0]; const q2 = qs[1]; const t = Sel.finalistIds()[0];
          Game.load(q1.id, t); const h0 = Scenes.QUESTION(s(), { qid: q1.id }).html;
          const before = h0.includes('r1pic_q01.jpg') && !h0.includes('r1pic_a01') && !h0.includes('q-text"') && !h0.includes(esc(q1.answerText)) && h0.includes('pic-only');
          Game.judge('correct'); const ok = s().live.result === 'correct' && Sel.score(t) === 10;
          const h1 = Scenes.QUESTION(s(), { qid: q1.id }).html; const notYet = !h1.includes('r1pic_a01');
          Game.reveal(); const h2 = Scenes.QUESTION(s(), { qid: q1.id }).html; const after = h2.includes('r1pic_a01.jpg') && h2.includes('is-answer');
          Game.load(q2.id, Sel.finalistIds()[1]); const h3 = Scenes.QUESTION(s(), { qid: q2.id }).html; Game.judge('wrong'); const wrong = s().live.result === 'wrong' && !Scenes.QUESTION(s(), { qid: q2.id }).html.includes('r1pic_a02');
          Game.reveal(); const h4 = Scenes.QUESTION(s(), { qid: q2.id }).html; const strip = h4.includes('r1pic_q02.jpg') && h4.includes('pic-ans') && h4.includes('r1pic_a02.jpg') && !h3.includes('r1pic_a02');
          return (before && ok && notYet && after && wrong && strip) || [before, ok, notYet, after, wrong, strip].join();
        } finally { Store.state = keep; }
      });
      T('Question board: all 30 main-round questions have a subject and a built-in picture; the board shows them', () => {
        const qs = ['R1', 'R2', 'R3'].flatMap((id) => Sel.roundQuestions(id));
        const st = Store.state; const keep = [st.show.scene, st.show.params]; st.show.scene = 'GRID'; st.show.params = { roundId: 'R1' };
        const html = Scenes.GRID(st, st.show.params).html; [st.show.scene, st.show.params] = keep;
        return qs.length === 30 && qs.every((q) => q.subject && /^asset:topic_/.test(q.subjectIcon) && document.getElementById('asset-' + q.subjectIcon.slice(6))) && html.includes('বিজ্ঞান') && (html.match(/class="t-ic"/g) || []).length === 10;
      });
      T('Main-round recordings: the old readings (of the old questions) are gone — none built in, no question points to one', () => defaultState().questions.filter((q) => ['R1', 'R2', 'R3'].includes(q.roundId)).every((q) => !q.voiceQ) && !document.getElementById('asset-voice_R1_1'));
      T('Main countdown: the recorded voice is built in; each number follows the voice (10 … 1, GO!), music silent under it', () => {
        const st = clone(Store.state); st.show.scene = 'MAIN_COUNTDOWN'; st.audio.cdVoice = true;
        const ok = Media.builtin('cd-voice').startsWith('data:audio/mpeg') && cdVoiceOn(st) && CD_VOICE.at.every((v, i) => i === 0 || v > CD_VOICE.at[i - 1]) && CD_VOICE.go > CD_VOICE.at[9];
        const steps = [0, 4600, 6100, 17100, 18700].map((ms) => cdStepAt(st, ms)).join();
        st.audio.cdVoice = false; const plain = [0, 999, 1000, 10000].map((ms) => cdStepAt(st, ms)).join() + '|' + cdTotalMs(st);
        return ok && steps === '0,1,2,9,10' && plain === '0,0,1,10|10000';
      });
      T('Question picture: Z shows it full screen on the TV, a new question starts without it', () => { const def = emptyLive(); return def.zoomPic === false && typeof Actions.zoomPic === 'function'; });
      T('Rules recordings: rounds 2 and 3 read their rules; round 1 (rule changed: no pass, challenge) stays silent until re-recorded', () => !RULES_VOICE.R1 && ['R2', 'R3'].every((id) => RULES_VOICE[id] === 'asset:rules-r' + id.slice(1) && Media.builtin('rules-r' + id.slice(1)).startsWith('data:audio/mpeg') && Sel.round(id) && str(Sel.round(id).rules).trim()));
      T('Prelim (final list): 20 questions stored, the first 15 played, 5 kept in reserve', () => { const d = defaultState(); return d.prelim.questions.length === 20 && d.prelim.count === 15 && d.prelim.questions[0].answer === 'প্রায় ৮ মিনিট' && d.prelim.questions[14].answer === 'পাই (π)' && d.prelim.questions[19].answer === 'আমাজন'; });
      T('Older save: an operator\'s own question and own recording stay; an untouched old question becomes the new one', () => {
        const d = defaultState(); const old = clone(d); old.rulesVersion = 16; const sd = (n) => SEED.questions.find((q) => q.roundId === 'R1' && q.number === n);
        const q1 = old.questions.find((q) => q.id === sd(1).id); const q5 = old.questions.find((q) => q.id === sd(5).id);
        Object.assign(q1, { text: sd(1).prevText[0] }); Object.assign(q5, { voiceQ: 'm_mine', text: 'আমার নিজের প্রশ্ন' });
        const n = normalizeState(old); const g = (q) => n.questions.find((x) => x.id === q.id);
        return g(q1).text === sd(1).text && g(q5).text === 'আমার নিজের প্রশ্ন' && g(q5).voiceQ === 'm_mine';
      });
      T('Opening (prelim held earlier): no count of every registered team; the all-teams screen shows the finalists only', () => {
        const st = Store.state; const extra = Object.assign(clone(st.teams[0]), { id: 'TX9', name: 'X' }); st.teams.push(extra);
        const ov = Scenes.OVERVIEW(st).html; const ta = Scenes.TEAMS_ALL(st).html; st.teams.pop();
        return !st.prelim.onStage && !ov.includes('অংশগ্রহণকারী দল') && (ta.match(/class="team-tile/g) || []).length === Sel.finalistIds().length;
      });
      T('Podium lottery: default is প্রিয় পশুপাখি with a picture on all 8 cards; 6 themes', () => { const d = defaultState().draw; return d.theme === 'animals' && d.items.length === 8 && d.items.every((x) => /^asset:draw_/.test(x.image)) && Object.keys(DRAW_THEMES).length === 6; });
      T('Theme: default is Midnight Royal Blue · Warm White · Champagne Gold', () => { const c = defaultState().design.colors; return defaultState().design.theme === 'midnight' && c.bg === '#071a3d' && c.bg2 === '#102d63' && c.text === '#fff9e8' && c.head === '#ffffff' && c.gold === '#f4d27a'; });
      T('Theme: five calm themes with their exact colours', () => THEMES.violetGold.bg === '#170d38' && THEMES.violetGold.gold === '#e8b7c8' && THEMES.tealIvory.bg2 === '#07545a' && THEMES.navyCyan.accent === '#70cfff' && THEMES.royalYellow.accent === '#d9c2ff' && THEMES.royalYellow.gold === '#f2d27d');
      T('Theme: a round (or the finale) can have its own theme; default = show theme', () => {
        const st = Store.state; const r0 = st.rounds[0]; const keep = [st.show.scene, st.show.params, r0.design.theme, st.design.finaleTheme];
        st.show.scene = 'GRID'; st.show.params = { roundId: r0.id }; const none = DesignSystem.sceneTheme(st);
        r0.design.theme = 'violetGold'; const one = DesignSystem.sceneTheme(st);
        st.show.scene = 'WINNER'; st.design.finaleTheme = 'royalYellow'; const fin = DesignSystem.sceneTheme(st);
        [st.show.scene, st.show.params, r0.design.theme, st.design.finaleTheme] = keep;
        return none === '' && one === 'violetGold' && fin === 'royalYellow';
      });
      T('Theme: a save on the earlier Midnight shade moves to the final colours; a chosen theme stays', () => {
        const a = defaultState(); a.rulesVersion = 12; a.design.colors = Object.assign({}, a.design.colors, { bg: '#050f29' });
        const b = defaultState(); b.rulesVersion = 12; b.design.theme = 'broadcast'; b.design.colors = Object.assign({}, THEMES.broadcast);
        return normalizeState(a).design.colors.bg === '#071a3d' && normalizeState(b).design.theme === 'broadcast';
      });
      T('Numbers on the TV in English digits (scores, points, ranks, board), Bengali stays in the sentences', () => { const st = s(); const sb = Scenes.SCOREBOARD(st, { roundId: 'R1', sub: 1 }).html; const g = Scenes.GRID(st, { roundId: 'R1' }).html; return !/class="tot">[^<]*[০-৯]/.test(sb) && /class="t-num">10</.test(g) && (() => { const q = Sel.roundQuestions('R5')[0]; const keep = [st.live.qid, st.live.roundId]; st.live.qid = q.id; st.live.roundId = 'R5'; const h = Scenes.QUESTION(st, { qid: q.id }).html; [st.live.qid, st.live.roundId] = keep; return /রাউন্ড [০-৯]/.test(h); })(); });
      T('PowerPoint import: question → 4 options → 2 options → answer slides become one question with the right option; a picture slide with a picture-filled box on click is a picture question; buttons and numbers are ignored; the round comes from the file name', () => {
        const S = 100 * 100; const box = (x) => Object.assign({ x: 0, y: 0, w: 10, h: 10, anim: false, id: '' }, x);
        const t1 = { n: 1, pics: [], fills: [], media: [], texts: [box({ text: 'ভারতের সংবিধানের রক্ষক হিসেবে কোন প্রতিষ্ঠানকে অভিহিত  করা হয় .' }), box({ text: '3' }), box({ text: 'ANSWER' })] };
        const t2 = { n: 2, pics: [], fills: [], media: [], texts: t1.texts.slice(0, 1).concat(['A. জেলা কোর্ট', 'B. হাইকোর্ট', 'C. রাষ্ট্রপতি', 'D. সুপ্রিম কোর্ট।'].map((x) => box({ text: x }))) };
        const t3 = { n: 3, pics: [], fills: [], media: [], texts: t1.texts.slice(0, 1).concat([box({ text: 'সুপ্রিম কোর্ট।', anim: true }), box({ text: 'NEXT' })]) };
        const p1 = { n: 4, texts: [box({ text: 'ANSWER' })], media: [], pics: [box({ path: 'q.jpg', w: 100, h: 90 })], fills: [box({ path: 'a.jpg', w: 80, h: 10, anim: true })] };
        const list = PptxImport.merge([t1, t2, t3, p1].map((x) => PptxImport.classify(x, S)).filter(Boolean));
        const q = list[0]; const p = list[1];
        const rounds = Store.state.rounds;
        return (list.length === 2 && q.kind === 'text' && q.slides.join() === '1,2,3' && q.options[q.answer] === 'সুপ্রিম কোর্ট' && q.text.endsWith('করা হয়?') && p.kind === 'pic' && p.image.path === 'q.jpg' && p.answerImage.path === 'a.jpg' && PptxImport.roundFromName('2ND_ROUND.pptx', rounds) === 'R2' && PptxImport.roundFromName('quiz রাউন্ড ৩.pptx', rounds) === 'R3' && PptxImport.roundFromName('First round', rounds) === 'R1') || JSON.stringify(list.map((x) => [x.kind, x.slides, x.options, x.answer, x.text])).slice(0, 300);
      });
      T('Audio / video question: plays by itself full screen first (no card, no badge); Next brings the question alone, then the team photo and timer; a video stops, audio goes on', () => {
        const keep = Store.state; Store.state = normalizeState(defaultState()); Store.state.show.scene = 'QUESTION';
        try {
          const q = Sel.roundQuestions('R2')[2]; q.clip = 'test-song.mp3';
          Game.load(q.id, Sel.finalistIds()[0]);
          const h0 = Scenes.QUESTION(s(), { qid: q.id }).html;
          const a = Sel.qClip() && s().live.clip.action === 'play' && h0.includes('q-clipfull audio') && !h0.includes('q-wrap') && h0.includes('sstrip') && h0.includes('data-clip');
          Actions.next(); const h1 = Scenes.QUESTION(s(), { qid: q.id }).html;
          const b = !Sel.qClip() && Sel.qAlone() && s().live.clipDone && s().live.clip.action === 'play' && h1.includes('q-wrap clean alone') && h1.includes('aclip-' + q.id);
          Actions.next(); const c = s().live.panel === true;
          const v = Sel.roundQuestions('R2')[3]; v.clip = 'test-film.mp4'; Game.load(v.id, Sel.finalistIds()[1]);
          const hv = Scenes.QUESTION(s(), { qid: v.id }).html; Actions.next();
          const d = hv.includes('q-clipfull video') && hv.includes('<video data-clip') && s().live.clip.action === 'stop' && Sel.qAlone();
          return (a && b && c && d) || [a, b, c, d].join();
        } finally { Store.state = keep; }
      });
      T('Score strip: the leader wears a crown, two correct answers in a row show a flame; a wrong answer ends the run', () => {
        const keep = Store.state; Store.state = normalizeState(defaultState()); Store.state.show.scene = 'QUESTION';
        try {
          const [a, b] = Sel.finalistIds(); const qs = Sel.roundQuestions('R2');
          const none = !H.strip(s(), '').includes('crown');
          Game.load(qs[0].id, a); Game.judge('correct'); Game.load(qs[1].id, a); Game.judge('correct');
          const h = H.strip(s(), ''); const ok1 = Sel.leaders().join() === a && Sel.streak(a) === 2 && (h.match(/class="crown"/g) || []).length === 1 && h.includes('🔥2') && Scenes.QUESTION(s(), { qid: qs[1].id }).html.includes('পরপর ২টি সঠিক');
          Game.load(qs[2].id, a); Game.judge('wrong'); const ok2 = Sel.streak(a) === 0 && !H.strip(s(), '').includes('🔥');
          Game.load(qs[3].id, b); Game.judge('correct'); Game.load(qs[4].id, b); Game.judge('correct'); const tie = Sel.leaders().length === 2;
          return (none && ok1 && ok2 && tie) || [none, ok1, ok2, tie].join();
        } finally { Store.state = keep; }
      });
      T('Spelling: corrected words on the TV (ঘণ্টা, ইংরেজি, শ্রীলঙ্কা, ৩৯টি, sin 90°-এর) and an old save takes them', () => {
        const d0 = normalizeState(defaultState()); const q = (rid, n) => d0.questions.find((x) => x.roundId === rid && x.number === n);
        const fresh = q('R3', 1).answerText.includes('ঘণ্টা') && q('R2', 1).text.includes('ইংরেজি') && q('R2', 6).options.includes('শ্রীলঙ্কা') && q('R2', 6).text.includes('৩৯টি') && q('R5', 10).text.includes('90°-এর');
        const o = defaultState(); delete o.rulesVersion; const sq = o.questions.find((x) => x.id === q('R3', 1).id); sq.answerText = 'শূন্য ঘন্টা / Zero hour'; o.groupCaption = 'উত্তর কলমদান বোর্ড প্রাথমিক বিদ্যালয়-এর শিক্ষকমণ্ডলী';
        const n = normalizeState(o); return fresh && n.questions.find((x) => x.id === sq.id).answerText.includes('ঘণ্টা') && n.groupCaption.includes('বিদ্যালয়ের');
      });
      T('Rounds 1–3 on the TV: no title line; the question alone first (full screen, scores underneath); the team photo and timer come in on Next or after the set seconds, or when the timer starts', () => {
        const keep = Store.state; Store.state = normalizeState(defaultState()); Store.state.show.scene = 'QUESTION';
        try {
          const out = [];
          for (const rid of ['R1', 'R2', 'R3']) {
            const q = Sel.roundQuestions(rid)[0]; Game.load(q.id, Sel.finalistIds()[0]);
            const h0 = Scenes.QUESTION(s(), { qid: q.id }).html;
            out.push(!h0.includes('s-head') && !h0.includes('JUNIOR GENIUS') && !h0.includes('QUESTION 0') && !h0.includes('q-intro') && /q-wrap clean( pic)? alone/.test(h0) && (rid === 'R2' || (h0.includes('q-wrap clean pic alone') && h0.includes('q-pic-bg'))) && h0.includes('sstrip') && Sel.qAlone()); // a picture question fills the screen
            Actions.next(); const h1 = Scenes.QUESTION(s(), { qid: q.id }).html;
            out.push(s().show.scene === 'QUESTION' && s().live.panel && !h1.includes(' alone') && h1.includes('data-timer') && h1.includes('team-card'));
          }
          const q = Sel.roundQuestions('R1')[1]; Game.load(q.id, Sel.finalistIds()[1]); Timer.start('direct'); out.push(!Sel.qAlone()); Timer.pause(); out.push(!Sel.qAlone());
          Game.load(Sel.roundQuestions('R1')[2].id, Sel.finalistIds()[2]); s().live.deliverAt = now() - 13000; Authority.qPanel(s()); out.push(s().live.panel === true);
          // a picture given for a round 2 question (its words in the picture) makes it a picture question too: only the picture on the TV
          { const q2 = Sel.roundQuestions('R2')[3]; Object.assign(q2, { image: 'asset:r3pic_q01.jpg', picOnly: true }); Game.load(q2.id, Sel.finalistIds()[3]); const h2 = Scenes.QUESTION(s(), { qid: q2.id }).html; out.push(h2.includes('q-wrap clean pic alone') && !h2.includes('q-text"')); }
          const r5 = Sel.roundQuestions('R5')[0]; Game.load(r5.id); const h5 = Scenes.QUESTION(s(), { qid: r5.id }).html; out.push(!Sel.qAlone() && h5.includes('s-head'));
          return out.every(Boolean) || out.join();
        } finally { Store.state = keep; }
      });
      T('TV timer and countdown in English digits (1:00, 45 … 0)', () => fmtTime(60000) === '1:00' && fmtTime(45000) === '45' && /^[0-9:]+$/.test(fmtTime(9000)) && !/[০-৯]/.test(Scenes.MAIN_COUNTDOWN(s()).html.replace(/<[^>]+>/g, '').replace(/MAIN ROUND STARTS IN/, '')));
      T('Countdown: 10, 9 … 1 then GO! in English digits (one second per number)', () => s().settings.countdownFrom === 10 && s().settings.countdownStepMs === 1000 && Scenes.MAIN_COUNTDOWN(s()).html.includes('MAIN ROUND STARTS IN') && Scenes.MAIN_COUNTDOWN(s()).html.includes('>10<'));

      // ---- text fitting with long Bengali ----
      T('Text fit: long Bengali question stays inside the box', () => {
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;height:200px;overflow:hidden';
        const el = document.createElement('div'); el.className = 'q-text'; el.textContent = 'পশ্চিমবঙ্গের স্কুলগুলিতে পিএম পোষণ প্রকল্প বাস্তবায়নের সঙ্গে যুক্ত অলাভজনক সংস্থাটির বর্তমান নাম কী? '.repeat(6);
        box.appendChild(el); document.body.appendChild(box);
        fitText(el, 80, 8);
        const ok = el.scrollHeight <= box.clientHeight + 1;
        box.remove();
        return ok;
      });
      T('Media: missing file is safe', () => Media.urlSync('m_missing') === '');
    } finally {
      Store.state = saved.state; Store.past = saved.past; Store.future = saved.future;
      Store.sandbox = false;
      Bus.emit('change', { label: 'selftest-restore' });
    }
    const missing = await Media.url('m_missing_test');
    results.push({ name: 'Media: missing file gives an empty URL', ok: missing === '', detail: '' });
    Log.add('INFO', 'Self-test: ' + results.filter((r) => r.ok).length + '/' + results.length + ' passed');
    return results;
  },
  html(res) {
    const pass = res.filter((r) => r.ok).length;
    return '<p><b class="' + (pass === res.length ? 'pass' : 'fail') + '">' + pass + ' / ' + res.length + ' passed</b></p>' + res.map((r) => '<div class="' + (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? '✔ PASS' : '✘ FAIL') + ' — ' + esc(r.name) + (r.detail ? ' <span class="muted">(' + esc(r.detail) + ')</span>' : '') + '</div>').join('');
  },
};

/* =====================================================================
   AUTHORITY CLOCK — only the Control window decides timeouts and
   countdown beeps, so two windows can never double-fire a cue.
   ===================================================================== */
/** How long a question's audio / video lasts (read once from the file, in the control window). */
const ClipLen = {
  ms: {},
  get(id) {
    if (id in this.ms) return this.ms[id];
    this.ms[id] = 0;
    Promise.resolve(Media.url(id)).then((u) => {
      if (!u) return;
      const el = document.createElement(Sel.clipKind({ clip: id }) === 'audio' ? 'audio' : 'video'); el.preload = 'metadata'; el.muted = true;
      el.onloadedmetadata = () => { this.ms[id] = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0; el.removeAttribute('src'); el.load(); };
      el.src = u;
    }).catch(() => {});
    return 0;
  },
};

const Authority = {
  cdKey: '',
  cdStep: -1,
  start() {
    setInterval(() => safe('authority', () => this.tick()), 100);
  },
  /** rounds 1–3: after the question has been alone on the TV for a while, the team photo and the timer come in by themselves */
  qPanel(s) {
    const l = s.live;
    // audio / video first: when it has played to the end, the question comes by itself
    if (Sel.qClip(s)) { const q = Sel.question(l.qid); const ms = ClipLen.get(q.clip); if (ms && l.clip && l.clip.action === 'play' && now() - l.clip.at >= ms + 700) Game.clipDone(); return; }
    if (Sel.qAlone(s) && now() - (l.clipAt || l.deliverAt) >= int(s.settings.qAloneSec, 12, 0, 120) * 1000) Store.commit('q-panel', (st) => { st.live.panel = true; }, { undo: false });
  },
  tick() {
    if (Store.sandbox) return;
    Timer.tick();
    const s = Store.state;
    this.qPanel(s);
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
      const step = cdStepAt(s, now() - s.show.startedAt);
      if (step !== this.cdStep && step <= from && step >= 0) {
        this.cdStep = step;
        if (cdVoiceOn(s)) { if (step >= from) setTimeout(() => Cue.play('applause'), 1200); } // the recording carries the voice, beats and the GO! burst
        else if (step < from) { Cue.play('countdown', { n: from - step }); if (s.audio.countVoice) Cue.voice(from - step); else if (s.speech.enabled) Speech.say(bn(from - step), 'timer'); } else { Cue.play('impact'); Cue.play('fanfare'); setTimeout(() => Cue.play('applause'), 600); if (s.audio.countVoice) Cue.voice(-1); } // GO!: impact + fanfare + applause, voice "Go!"
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
    window.addEventListener('beforeunload', (e) => {
      Store.persist();
      // closing the control window by mistake mid-show asks first (everything is saved either way)
      if (MODE === 'control' && Store.state.show.scene !== 'ORGANIZER') { e.preventDefault(); e.returnValue = ''; }
    });
    Media.ready.then(() => { Media.hydrate(document.body); UI.renderTab(); });
    Log.add('INFO', 'Quiz Corner V' + VERSION + ' ready');
  }
  window.QC = Object.freeze({ VERSION, MODE, Store, Sel, Timer, Game, Show, Scenes, Media, Sync, SelfTest, AudioDirector, Speech, VoicePlayer, UI, Draw, Log, Actions, Keys, Sfx, Music, SoundDirector, Coach, NexusImport, NLP, AI, Legacy, ImportUI, renderCertificate, zipStore, TeamLock, Tray, PhotoFix, PptxImport, PptxUI });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
