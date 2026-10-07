/* =====================================================================
   OPERATOR COACH, ANNOUNCER & HOST ASSISTANT (ported from V100 Nexus).
   Coach: one plain-Bengali sentence for "what to do now" + the buttons
   that matter glow. Announcer: every action is confirmed in an
   aria-live region (and, if enabled, spoken on the operator laptop).
   ===================================================================== */
const Coach = {
  /** @returns {{t: string, glow: string[]}} */
  plan(s) {
    const sc = s.show.scene;
    const NEXT = '"পরের ▶" (→)';
    const l = s.live;
    switch (sc) {
      case 'ORGANIZER': return { t: 'আয়োজক ব্যানার দেখানো হচ্ছে। অনুষ্ঠান শুরু করতে ' + NEXT + ' চাপুন।', glow: ['next'] };
      case 'LOGO': case 'PROGRAMME': case 'CREW': case 'TEAMS_ALL': case 'GIFT': case 'PODIUM': case 'GRAPHIC':
        return { t: 'উপস্থাপক কথা শেষ করলে ' + NEXT + ' চাপুন।', glow: ['next'] };
      case 'THEME': return { t: 'থিম সং চলছে। উপস্থাপক কথা শেষ করলে ' + NEXT + ' চাপুন (গান নিজে থেকে থামবে না — দরকারে "থামাও")।', glow: ['next', 'musicStop'] };
      case 'WELCOME': return { t: 'স্বাগত সংগীত চলছে। শেষ হলে ' + NEXT + ' → বিশেষ উপস্থাপনা।', glow: ['next', 'musicStop'] };
      case 'TEAM_INTRO': case 'FINALIST_INTRO': return { t: 'দলের পরিচয় চলছে। প্রতিটি দলের পরে একবার করে ' + NEXT + '।', glow: ['next'] };
      case 'PRELIM_RULES': return { t: 'বাছাই পর্বের নিয়মাবলী। পড়া হয়ে গেলে ' + NEXT + ' → কাউন্টডাউন।', glow: ['next'] };
      case 'PRELIM_COUNTDOWN': case 'MAIN_COUNTDOWN': return { t: 'কাউন্টডাউন চলছে — কিছু চাপবেন না। শেষ হলে ' + NEXT + '।', glow: [] };
      case 'PRELIM_Q': {
        const n = s.prelimLive.idx + 1; const N = Sel.prelimQuestions().length;
        return s.prelimLive.reveal
          ? { t: 'প্রশ্ন ' + bn(n) + '-এর উত্তর দেখানো হচ্ছে। ' + NEXT + ' → ' + (n < N ? 'পরের প্রশ্ন।' : 'ফলাফল।'), glow: ['next'] }
          : { t: 'বাছাই পর্ব — প্রশ্ন ' + bn(n) + ' / ' + bn(N) + '। দলগুলিকে লেখার সময় দিন, তারপর ' + NEXT + ' → পরের প্রশ্ন। উত্তর দেখাতে "উত্তর দেখাও (ANSWER)" (R)।', glow: ['next', 'prelimAnswer'] };
      }
      case 'PRELIM_RESULT': return { t: 'উত্তরপত্র মিলিয়ে "বাছাই পর্ব" পাতার ম্যাট্রিক্সে টিক দিন। তারপর "শীর্ষ ৮ নিশ্চিত করুন" এবং ' + NEXT + '।', glow: ['confirmFinalists', 'next'] };
      case 'FINALISTS': return { t: 'চূড়ান্ত দলের নাম ঠিক আছে কি না দেখে নিন (বাছাই পর্ব পাতায় সম্পাদনা করা যায়), তারপর ' + NEXT + '।', glow: ['next'] };
      case 'ROUND_INTRO': case 'ROUND_RULES': return { t: 'রাউন্ডের নিয়মাবলী দেখানো হচ্ছে। পড়া হলে ' + NEXT + ' → প্রশ্ন-বোর্ড।', glow: ['next'] };
      case 'GRID': {
        const r = Sel.round(s.show.params.roundId);
        const left = r ? Sel.roundQuestions(r.id).filter((q) => !s.board.played[q.id]).length : 0;
        const turn = r ? Sel.team(Game.turnFor(r.id)) : null;
        return left
          ? { t: 'এখন ' + (turn ? turn.name : 'পরের দল') + '-এর পালা। দল যে প্রশ্ন-নম্বর বলবে, নিচে সেই নম্বরে ক্লিক করুন (বাকি ' + bn(left) + 'টি)।', glow: ['loadQ'] }
          : { t: 'এই রাউন্ডের সব প্রশ্ন শেষ। "📊 স্কোরবোর্ড" (S) চাপুন।', glow: ['scoreboard'] };
      }
      case 'QUESTION': return this.question(s, l);
      case 'SCOREBOARD': return { t: 'স্কোরবোর্ড দেখানো হচ্ছে। ' + NEXT + ' → পরের রাউন্ড।', glow: ['next'] };
      case 'FINAL': {
        const n = Sel.finalistIds().length;
        return s.finalReveal < n ? { t: 'চূড়ান্ত ফলাফল। প্রতিবার "পরের স্থান প্রকাশ" (R) চাপলে একটি করে স্থান ঘোষণা হবে।' + (Sel.ties().length ? ' ⚠ টাই আছে — আগে টাই-ব্রেকার ঠিক করুন।' : ''), glow: ['finalReveal'] } : { t: 'সব স্থান প্রকাশিত। ' + NEXT + ' → বিজয়ী মঞ্চ।', glow: ['next'] };
      }
      case 'TOP3': return { t: 'বিজয়ী মঞ্চ। ' + NEXT + ' → চ্যাম্পিয়ন।', glow: ['next'] };
      case 'WINNER': return { t: 'চ্যাম্পিয়ন ঘোষণা হয়েছে। অনুষ্ঠান শেষ — অভিনন্দন!', glow: [] };
      case 'END': return { t: 'অনুষ্ঠান শেষ। ধন্যবাদ!', glow: [] };
      default: return { t: 'পরের ধাপের জন্য ' + NEXT + ' চাপুন।', glow: ['next'] };
    }
  },
  question(s, l) {
    const r = Sel.round(l.roundId);
    const t = Sel.team(Sel.answeringTeam());
    const name = t ? t.name : 'দল';
    if (!r || !l.qid) return { t: 'প্রশ্ন লোড হয়নি — প্রশ্ন-বোর্ডে ফিরে নম্বর বাছুন।', glow: ['gotoGrid'] };
    if (l.locked) return { t: 'প্রশ্ন লক করা আছে। আনলক করতে L।', glow: ['lock'] };
    if (l.result === 'correct' || (l.revealed && l.result)) return { t: 'উত্তর দেখানো হয়েছে। "▦ প্রশ্ন বোর্ড" → পরের দলের পালা, অথবা "পরের প্রশ্ন"।', glow: ['gotoGrid', 'qStep'] };
    if (l.result && !l.revealed) return { t: 'পয়েন্ট দেওয়া হয়েছে। টিভিতে উত্তর দেখাতে "উত্তর দেখাও" (R)' + (r.features.pass && l.result === 'wrong' && Game.nextPassTeam() ? ', অথবা পরের দলে "পাস" (P)।' : '।'), glow: ['reveal', 'pass'] };
    if (s.timer.expired) return { t: 'সময় শেষ! ' + name + ' না পারলে "ভুল" (X)' + (r.features.pass ? ' তারপর "পাস" (P)।' : '।'), glow: ['judge', 'pass'] };
    if (r.type === 'rapid') return { t: 'যে দল আগে বাজার টিপল, তার নম্বর (১–৮) চাপুন। তারপর সঠিক হলে "সঠিক" (C), ভুল হলে "ভুল" (X) — ভুলে প্রশ্ন শেষ।', glow: ['judge', 'setActive'] };
    if (r.type === 'bonus') return { t: name + ' উত্তর দিচ্ছে। সঠিক হলে "সঠিক" (+' + bn(Game.pointsFor('correct')) + '), ভুল হলে "ভুল", না পারলে "পাস" (পরের দলে মান বাড়বে)।', glow: ['judge', 'pass'] };
    const hands = r.features.challenge ? ' অন্য দল বাজার টিপলে / হাত তুললে Shift + তার নম্বর, তারপর ✓ বা ✕।' : '';
    if (l.flow === 'pass' || l.flow === 'bonus') return { t: name + ' (পাসের পরে) উত্তর দিচ্ছে। সঠিক হলে "সঠিক" (C), ভুল হলে "ভুল" (X)। আবার না পারলে "পাস" (P)।', glow: ['judge', 'pass'] };
    if (l.flow === 'challenge') return { t: 'চ্যালেঞ্জ: ' + name + ' উত্তর দিচ্ছে। সঠিক হলে "সঠিক" (+' + bn(r.scoring.challengeRight) + '), ভুল হলে "ভুল" (' + bn(r.scoring.challengeWrong) + ')।', glow: ['judge'] };
    if (!l.optionsShown) return { t: name + ' বিকল্প ছাড়াই উত্তর দিচ্ছে। সঠিক হলে "সঠিক +' + bn(Game.pointsFor('correct')) + '" (C) — উত্তর সঙ্গে সঙ্গে দেখাবে। ভুল হলে "ভুল" (X)।' + (r.features.options ? ' সাহায্য চাইলে "বিকল্প দেখাও" (V)।' : '') + hands, glow: ['judge', 'options', 'timerToggle'] };
    return { t: name + ' বিকল্প দেখে উত্তর দিচ্ছে।' + (r.features.judgeOptions ? ' দল যে বিকল্প (ক–ঘ) বলবে, নিচে সেটি চাপুন: সঙ্গে সঙ্গে রায়।' : ' সঠিক হলে "সঠিক +' + bn(Game.pointsFor('correct')) + '", ভুল হলে "ভুল"।') + (r.features.passAfterOptions ? '' : ' বিকল্প নেওয়ার পর পাস নেই।') + (r.features.lifelines ? ' দল সাহায্য চাইলে ৫০:৫০ (Alt+1)।' : '') + hands, glow: r.features.judgeOptions ? ['pick'] : ['judge', 'lifeline'] };
  },
  html(s) {
    const p = safe('coach', () => this.plan(s), { t: '', glow: [] });
    return '<div class="card coach" role="status"><h3>💡 এখন কী করবেন</h3><p class="coach-t">' + esc(p.t) + '</p><p class="coach-tip">ভুল চাপলে আনডু (Ctrl+Z)। জ্বলজ্বলে বোতামগুলোই এখন দরকারি।</p></div>';
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
