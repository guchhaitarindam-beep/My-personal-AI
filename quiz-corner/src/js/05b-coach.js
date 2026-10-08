/* =====================================================================
   OPERATOR COACH, ANNOUNCER & HOST ASSISTANT (ported from V100 Nexus).
   Coach: one plain-English sentence for "what to do now" + the buttons
   that matter glow. Announcer: every action is confirmed in an
   aria-live region (and, if enabled, spoken on the operator laptop).
   ===================================================================== */
const Coach = {
  /** @returns {{t: string, glow: string[]}} */
  plan(s) {
    const sc = s.show.scene;
    const NEXT = '"Next ▶" (→)';
    const l = s.live;
    switch (sc) {
      case 'ORGANIZER': return { t: 'The organiser banner is showing. Press ' + NEXT + ' to start the show.', glow: ['next'] };
      case 'LOGO': case 'PROGRAMME': case 'CREW': case 'TEAMS_ALL': case 'GIFT': case 'PODIUM': case 'GRAPHIC':
        return { t: 'When the host finishes speaking, press ' + NEXT + '.', glow: ['next'] };
      case 'THEME': return { t: 'The theme song is playing. When the host finishes, press ' + NEXT + ' (the song does not stop by itself — use "Stop" if needed).', glow: ['next', 'musicStop'] };
      case 'WELCOME': return { t: 'Welcome music is playing. When it ends, ' + NEXT + ' → special presentation.', glow: ['next', 'musicStop'] };
      case 'TEAM_INTRO': case 'FINALIST_INTRO': return { t: 'Team introductions. Press ' + NEXT + ' once after each team.', glow: ['next'] };
      case 'PRELIM_RULES': return { t: 'Prelim round rules. When they have been read, ' + NEXT + ' → countdown.', glow: ['next'] };
      case 'PRELIM_COUNTDOWN': case 'MAIN_COUNTDOWN': return { t: 'Countdown running — do not press anything. When it ends, ' + NEXT + '.', glow: [] };
      case 'PRELIM_Q': {
        const n = s.prelimLive.idx + 1; const N = Sel.prelimQuestions().length;
        return s.prelimLive.reveal
          ? { t: 'Showing the answer to question ' + n + '. ' + NEXT + ' → ' + (n < N ? 'next question.' : 'results.'), glow: ['next'] }
          : { t: 'Prelim round — question ' + n + ' / ' + N + '. Give the teams time to write, then ' + NEXT + ' → next question. To show the answer: "Show answer (ANSWER)" (R).', glow: ['next', 'prelimAnswer'] };
      }
      case 'PRELIM_RESULT': return { t: 'Check the answer sheets and tick them in the matrix on the "Prelim round" page. Then "Confirm top 8" and ' + NEXT + '.', glow: ['confirmFinalists', 'next'] };
      case 'FINALISTS': return { t: 'Check that the finalist team names are right (edit them on the Prelim round page), then ' + NEXT + '.', glow: ['next'] };
      case 'ROUND_INTRO': case 'ROUND_RULES': return { t: 'Round rules are showing. When they have been read, ' + NEXT + ' → question board.', glow: ['next'] };
      case 'GRID': {
        const r = Sel.round(s.show.params.roundId);
        const left = r ? Sel.roundQuestions(r.id).filter((q) => !s.board.played[q.id]).length : 0;
        const turn = r ? Sel.team(Game.turnFor(r.id)) : null;
        return left
          ? { t: 'It is ' + (turn ? turn.name : 'the next team') + '\'s turn. Click the question number the team calls out below (' + left + ' left).', glow: ['loadQ'] }
          : { t: 'All questions in this round are done. Press "📊 Scoreboard" (S).', glow: ['scoreboard'] };
      }
      case 'QUESTION': return this.question(s, l);
      case 'SCOREBOARD': return { t: 'The scoreboard is showing. ' + NEXT + ' → next round.', glow: ['next'] };
      case 'FINAL': {
        const n = Sel.finalistIds().length;
        return s.finalReveal < n ? { t: 'Final results. Each press of "Reveal next place" (R) announces one place.' + (Sel.ties().length ? ' ⚠ There is a tie — settle the tie-breaker first.' : ''), glow: ['finalReveal'] } : { t: 'All places revealed. ' + NEXT + ' → winners\' stage.', glow: ['next'] };
      }
      case 'TOP3': return { t: 'Winners\' stage (Top 3). ' + NEXT + ' → champion.', glow: ['next'] };
      case 'WINNER': return { t: 'The champion has been announced. The show is over — congratulations!', glow: [] };
      case 'END': return { t: 'The show is over. Thank you!', glow: [] };
      default: return { t: 'Press ' + NEXT + ' for the next step.', glow: ['next'] };
    }
  },
  question(s, l) {
    const r = Sel.round(l.roundId);
    const t = Sel.team(Sel.answeringTeam());
    const name = t ? t.name : 'The team';
    if (!r || !l.qid) return { t: 'No question loaded — go back to the question board and pick a number.', glow: ['gotoGrid'] };
    if (l.locked) return { t: 'The question is locked. Press L to unlock.', glow: ['lock'] };
    if (l.result === 'correct' || (l.revealed && l.result)) return { t: 'The answer has been shown. "▦ Question board" → next team\'s turn, or "Next question".', glow: ['gotoGrid', 'qStep'] };
    if (l.result && !l.revealed) return { t: 'Points given. To show the answer on TV: "Show answer" (R)' + (r.features.pass && l.result === 'wrong' && Game.nextPassTeam() ? ', or "Pass" (P) to the next team.' : '.'), glow: ['reveal', 'pass'] };
    if (s.timer.expired) return { t: 'Time is up! If ' + name + ' cannot answer, press "Wrong" (X)' + (r.features.pass ? ', then "Pass" (P).' : '.'), glow: ['judge', 'pass'] };
    if (r.type === 'rapid') return { t: 'Press the number (1–8) of the team that buzzed first. Then "Correct" (C) if right, "Wrong" (X) if wrong — a wrong answer ends the question.', glow: ['judge', 'setActive'] };
    if (r.type === 'bonus') return { t: name + ' is answering. "Correct" (+' + Game.pointsFor('correct') + ') if right, "Wrong" if wrong, "Pass" if they cannot answer (the value goes up for the next team).', glow: ['judge', 'pass'] };
    const hands = r.features.challenge ? ' If another team buzzes / raises a hand, press Shift + its number, then ✓ or ✕.' : '';
    if (l.flow === 'pass' || l.flow === 'bonus') return { t: name + ' is answering (after a pass). "Correct" (C) if right, "Wrong" (X) if wrong. If they cannot answer either, "Pass" (P).', glow: ['judge', 'pass'] };
    if (l.flow === 'challenge') return { t: 'Challenge: ' + name + ' is answering. "Correct" (+' + r.scoring.challengeRight + ') if right, "Wrong" (' + r.scoring.challengeWrong + ') if wrong.', glow: ['judge'] };
    if (!l.optionsShown) return { t: name + ' is answering without options. If right, "Correct +' + Game.pointsFor('correct') + '" (C) — the answer shows at once. If wrong, "Wrong" (X).' + (r.features.options ? ' If they ask for help, "Show 4 options" (V).' : '') + hands, glow: ['judge', 'options', 'timerToggle'] };
    return { t: name + ' is answering with the options shown.' + (r.features.judgeOptions ? ' Press the option (A–D) the team names below: judged at once.' : ' "Correct +' + Game.pointsFor('correct') + '" if right, "Wrong" if wrong.') + (r.features.passAfterOptions ? '' : ' No pass after taking the options.') + (r.features.lifelines ? ' If the team asks for help: 50:50 (Alt+1).' : '') + hands, glow: r.features.judgeOptions ? ['pick'] : ['judge', 'lifeline'] };
  },
  html(s) {
    const p = safe('coach', () => this.plan(s), { t: '', glow: [] });
    return '<div class="card coach" role="status"><h3>💡 What to do now</h3><p class="coach-t">' + esc(p.t) + '</p><p class="coach-tip">Pressed the wrong button? Undo (Ctrl+Z). The glowing buttons are the ones you need now.</p></div>';
  },
  applyGlow(root, s) {
    const p = safe('coach', () => this.plan(s), { t: '', glow: [] });
    $$('.glow', root).forEach((b) => b.classList.remove('glow'));
    p.glow.forEach((act) => $$('[data-act="' + act + '"]:not([disabled])', root).forEach((b) => b.classList.add('glow')));
  },
};

/* ---------- Announcer: spoken / screen-reader confirmation of every action ---------- */
const Announcer = {
  last: '',
  message(label, s) {
    const l = s.live;
    const t = Sel.team(l.resultTeam || Sel.answeringTeam());
    const e = s.ledger[s.ledger.length - 1];
    const et = e ? Sel.team(e.team) : null;
    const scoreLine = () => (et ? et.name + ', ' + signed(e.delta) + '। মোট ' + e.after + '।' : '');
    if (label === 'judge-correct') return 'সঠিক। ' + scoreLine();
    if (label === 'judge-wrong') return 'ভুল। ' + scoreLine();
    if (label === 'judge-noscore') return 'নো স্কোর।';
    if (label === 'hand-right' || label === 'hand-wrong') return (label === 'hand-right' ? 'হাত তোলা সঠিক। ' : 'হাত তোলা ভুল। ') + scoreLine();
    if (label === 'bonus' || label === 'adjust') return 'নম্বর দেওয়া হলো। ' + scoreLine();
    if (label === 'pass') return 'পাস: ' + (t ? t.name : '') + '।';
    if (label === 'challenge') return 'চ্যালেঞ্জ: ' + ((Sel.team(l.challenger) || {}).name || '') + '।';
    if (label === 'raise-hand') return 'হাত তোলা: ' + l.hands.map((id) => (Sel.team(id) || {}).name).join(', ');
    if (label === 'reveal') return l.revealed ? 'উত্তর দেখানো হলো।' : 'উত্তর লুকানো হলো।';
    if (label === 'options') return l.optionsShown ? 'বিকল্প দেখানো হলো।' : 'বিকল্প লুকানো হলো।';
    if (label === 'lock') return l.locked ? 'প্রশ্ন লক।' : 'প্রশ্ন আনলক।';
    if (label === 'timer-start') return 'টাইমার চালু, ' + Math.round(s.timer.duration / 1000) + ' সেকেন্ড।';
    if (label === 'timer-pause') return 'টাইমার বিরতি।';
    if (label === 'timer-resume') return 'টাইমার আবার চালু।';
    if (label === 'timer-expire') return 'সময় শেষ।';
    if (label === 'blackout') return s.show.blackout ? 'ব্ল্যাকআউট চালু। টিভি কালো।' : 'ব্ল্যাকআউট বন্ধ।';
    if (label.startsWith('scene:')) return 'এখন: ' + (SCENES[s.show.scene] || s.show.scene) + '।';
    if (label.startsWith('lifeline-')) return 'লাইফলাইন ব্যবহার হলো।';
    if (label.startsWith('undo:')) return 'আনডু: ' + label.slice(5);
    if (label.startsWith('redo:')) return 'রিডু: ' + label.slice(5);
    if (label === 'final-reveal') return 'পরের স্থান প্রকাশিত।';
    return '';
  },
  onChange(c, s) {
    const label = (c && c.label) || '';
    const msg = safe('announce', () => this.message(label, s), '');
    if (!msg || msg === this.last && label.startsWith('timer')) return;
    this.last = msg;
    const live = $('#announce');
    if (live) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = msg; }); }
    // Optional spoken confirmation on the operator laptop only (never forwarded to the stage).
    if (s.settings.operatorVoice && 'speechSynthesis' in window) {
      try { const u = new SpeechSynthesisUtterance(msg); u.lang = 'bn-IN'; const v = Speech.voice(); if (v) u.voice = v; u.rate = 1.05; u.volume = 0.8; speechSynthesis.speak(u); } catch (e) { /* speech optional */ }
    }
  },
};

/* ---------- Host assistant: instant offline commentary lines (V100 templates) ---------- */
const HostLines = {
  T: {
    score: ['দারুণ! {team} এখন {score} পয়েন্টে।', '{team} {delta} পয়েন্ট যোগ করল — মোট {score}!', 'চমৎকার উত্তর! {team}-এর ঝুলিতে এখন {score}।'],
    wrong: ['এবার হলো না, {team}। পরের সুযোগ আসছে!', 'ভুল উত্তর — কিন্তু খেলা এখনও শেষ হয়নি!'],
    tension: ['ঘড়ির কাঁটা এগিয়ে চলেছে… সময় খুব কম!', 'শেষ কয়েক সেকেন্ড — সবার নিঃশ্বাস বন্ধ!'],
    open: ['এবার শুরু হচ্ছে {round}। প্রস্তুত তো সবাই?', '{round} — দেখা যাক কারা এগিয়ে থাকে!'],
    win: ['অভিনন্দন {team}! আজকের চ্যাম্পিয়ন!', 'এবারের সেরা {team} — {score} পয়েন্টে!'],
  },
  line(kind, s = Store.state) {
    const list = this.T[kind] || this.T.score;
    const e = s.ledger[s.ledger.length - 1];
    const lead = Sel.standings()[0];
    const team = kind === 'win' ? (lead && lead.team) : Sel.team((e && e.team) || Sel.answeringTeam());
    const r = Sel.currentRound();
    const vars = { team: team ? team.name : 'দল', score: team ? Sel.score(team.id) : 0, delta: e ? Math.abs(e.delta) : 0, round: r ? r.name : 'নতুন রাউন্ড' };
    let h = 0; const key = kind + (e ? e.id : '') + s.rev; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return list[h % list.length].replace(/\{(\w+)\}/g, (_, k) => bn(vars[k] != null ? vars[k] : ''));
  },
  auto(label) {
    if (label === 'judge-correct' || label === 'bonus' || label === 'hand-right') return this.line('score');
    if (label === 'judge-wrong' || label === 'hand-wrong') return this.line('wrong');
    if (label.startsWith('scene:ROUND_INTRO')) return this.line('open');
    if (label.startsWith('scene:WINNER') || label.startsWith('scene:TOP3')) return this.line('win');
    return '';
  },
};
