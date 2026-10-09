/* =====================================================================
   PREPARATION TABS — everything an operator edits lives here. Inputs
   bind straight to state paths (data-bind) so no code edits are needed.
   ===================================================================== */
const F = {
  text(path, label, val, ph = '') { return '<label class="field"><span>' + label + '</span><input type="text" data-bind="' + path + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '"></label>'; },
  area(path, label, val, rows = 3) { return '<label class="field"><span>' + label + '</span><textarea rows="' + rows + '" data-bind="' + path + '">' + esc(val) + '</textarea></label>'; },
  num(path, label, val, min = '', max = '', step = 1, type = 'num') { return '<label class="field"><span>' + label + '</span><input type="number" data-bind="' + path + '" data-type="' + type + '" value="' + esc(val == null ? '' : val) + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>'; },
  check(path, label, val, rerender) { return '<label class="check"><input type="checkbox" data-bind="' + path + '"' + (val ? ' checked' : '') + (rerender ? ' data-rerender="1"' : '') + '> ' + label + '</label>'; },
  select(path, label, options, val, rerender) { return '<label class="field"><span>' + label + '</span><select data-bind="' + path + '"' + (rerender ? ' data-rerender="1"' : '') + '>' + options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label>'; },
  color(path, label, val) { return '<label class="field"><span>' + label + '</span><input type="color" data-bind="' + path + '" value="' + esc(val) + '"></label>'; },
  range(path, label, val, min, max, step) { return '<label class="field"><span>' + label + ' <b>' + esc(val) + '</b></span><input type="range" data-bind="' + path + '" data-type="num" value="' + esc(val) + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>'; },
  media(path, label, val, accept = 'image/*', kind = 'image') {
    const isImg = kind === 'image';
    return '<div class="photo-slot"' + (isImg ? ' data-drop="' + esc(path) + '" title="Click to choose, drag a picture in, or press Ctrl+V"' : '') + '><div class="thumb">' + (val && isImg ? '<img data-media="' + esc(val) + '" alt="">' : (val ? '♪' : '—')) + '</div><b>' + label + '</b><small class="muted">' + esc(val ? Media.label(val) : 'Empty') + '</small><div class="row"><button class="btn sm primary" data-act="setMedia" data-arg="' + esc(path + '|' + accept + '|' + kind) + '">' + (val ? 'Change' : 'Add') + '</button>' + (val ? '<button class="btn sm" data-act="clearMedia" data-arg="' + esc(path) + '">Delete</button>' : '') + '</div></div>';
  },
  btn(act, label, cls = '', arg = '') { return '<button class="btn ' + cls + '" data-act="' + act + '"' + (arg !== '' ? ' data-arg="' + esc(arg) + '"' : '') + '>' + label + '</button>'; },
  card(title, body, hint = '') { return '<div class="card"><h3>' + title + (hint ? ' <span class="hint">' + hint + '</span>' : '') + '</h3>' + body + '</div>'; },
};
const fontOpts = () => FONT_CHOICES.map((f) => f[0]);
const TEXT_ELEMENTS = [['question', 'Question'], ['option', 'Options (ক–ঘ)'], ['title', 'Title'], ['team', 'Team name'], ['answer', 'Answer']];
const TEXT_SAMPLES = { question: 'বিশ্বের বৃহত্তম ম্যানগ্রোভ অরণ্যের নাম কী?', option: 'ক) সুন্দরবন', title: 'রাউন্ড ১ • মজার মিশেল', team: 'দল ১ — উত্তর কলমদান', answer: 'সঠিক উত্তর: সুন্দরবন' };

/** "R1-5.jpg", "r2_10.png", "3-7.mp3", "রাউন্ড১-প্রশ্ন৫.jpg" → { round, n }; null when the name does not say. */
function bulkMediaTarget(name) {
  const t = String(name || '').replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\.[a-z0-9]+$/i, '');
  const m = t.match(/(?:^|[^0-9])(?:r|round|রাউন্ড)?\s*([1-7])\s*[-_. ]+\s*(?:q|প্রশ্ন)?\s*([0-9]{1,2})(?![0-9])/i);
  if (!m) return null;
  // what follows the number says which reading it is: R1-5.mp3 / R1-5-প্রশ্ন = question, R1-5-বিকল্প / -opt = options, R1-5-উত্তর / -ans = answer, R1-5-clip = a sound clip shown with the question
  const rest = t.slice(m.index + m[0].length);
  const voice = /^[\s\-_.]*(opt|option|বিকল্প)/i.test(rest) ? 'opt' : /^[\s\-_.]*(ans|answer|উত্তর)/i.test(rest) ? 'ans' : /^[\s\-_.]*(clip|ক্লিপ|music|গান)/i.test(rest) ? 'clip' : 'q';
  return { round: int(m[1]), n: int(m[2]), voice };
}
const VOICE_SLOTS = [['voiceQ', 'Question reading', 'Question'], ['voiceOpt', 'Options reading', 'Options'], ['voiceAns', 'Answer reading', 'Answer']];
const VOICE_FIELD = { q: 'voiceQ', opt: 'voiceOpt', ans: 'voiceAns' };
/** What the host reads into each recording (shown while recording, and in the recording list). */
function voiceScript(q, field) {
  if (field === 'voiceOpt') return q.options.map((o, i) => (o ? OPT_LABELS[i] + ') ' + o : '')).filter(Boolean).join('   ');
  if (field === 'voiceAns') return 'সঠিক উত্তর: ' + (q.answerText || q.options[q.answer] || '');
  return q.speech || q.text;
}
/** Laptop-microphone recorder for the question readings. */
const Rec = { mr: null, stream: null, chunks: [], blob: null, url: '', path: '', t0: 0, iv: 0 };

const TabRender = {
  /* ---------------- SHOW ---------------- */
  show(s) {
    const rd = Show.rundown(); const ci = Show.index();
    const list = rd.map((st, i) => '<div class="rd' + (i === ci ? ' cur' : '') + '" data-act="goStep" data-arg="' + i + '" role="button" tabindex="0"><span class="i">' + String(i + 1) + '</span><span>' + esc(st.label) + '</span><span class="k">' + esc(st.scene) + '</span></div>').join('');
    const jumps = [['ORGANIZER', 'Banner'], ['LOGO', 'Logo'], ['PROGRAMME', 'Event'], ['THEME', 'Theme song'], ['TEAMS_ALL', 'All teams'], ['PRELIM_RESULT', 'Prelim result'], ['FINALISTS', 'Final 8'], ['WELCOME', 'Welcome'], ['PODIUM', 'Podium'], ['MAIN_COUNTDOWN', 'Countdown'], ['SCOREBOARD', 'Scoreboard'], ['FINAL', 'Final result'], ['WINNER', 'Winner'], ['END', 'Closing']];
    const gallery = s.gallery.length ? '<div class="deck">' + s.gallery.map((id) => '<button class="btn" data-act="galleryShow" data-arg="' + esc(id) + '"><span class="thumb" style="width:34px;height:34px"><img data-media="' + esc(id) + '" alt=""></span> Show</button>').join('') + '</div>' : '<p class="muted">Add pictures to the gallery in the Media tab.</p>';
    return F.card('Show rundown (full running order)', '<div class="rundown" data-keep-scroll="rd">' + list + '</div>', 'Click a step to send that scene to the stage') +
      F.card('Quick jump', '<div class="deck">' + jumps.map(([k, l]) => F.btn('jump', l, '', k)).join('') + '</div>') +
      F.card('Music', '<div class="deck">' + Object.entries(MUSIC_SLOTS).map(([k, l]) => F.btn('music', '▶ ' + l, 'good', k) + F.btn('musicStop', '■ ' + l, '', k)).join('') + '</div>') +
      F.card('Graphics gallery', gallery) +
      F.card('Rehearsal mode', '<p class="big-hint">During a rehearsal the real event\'s scores and data stay untouched. Press "Stop rehearsal" at the end and everything goes back to how it was.</p><div class="deck">' + (Store.rehearsal ? F.btn('rehearsalOff', '■ Stop rehearsal', 'bad span2') : F.btn('rehearsalOn', '▶ Rehearsal (real questions)', 'warn', '0') + F.btn('rehearsalOn', '▶ Rehearsal (test questions)', 'warn', '1')) + '</div>');
  },

  /* ---------------- PRELIM ---------------- */
  prelim(s) {
    const p = s.prelim;
    const qs = Sel.prelimQuestions();
    const onStage = '<div class="card" style="margin-bottom:.6rem"><div class="row">' + F.check('prelim.onStage', 'Prelim round is played on this stage (show its questions on TV)', p.onStage) + '</div><p class="muted">' + (p.onStage ? 'The prelim questions are part of the show.' : '13 Oct: the prelim was held earlier — the show goes from the opening straight to the <b>prelim results</b> (school names & scores below), then the podium lottery and the main rounds. Enter each school and its prelim score in the list below or in the live panel.') + '</p></div>';
    const settings = '<div class="g4">' + F.num('prelim.count', 'Number of questions', p.count, 1, 100, 1, 'int') + F.num('prelim.points', 'Points per question', p.points, 0, 100, 1, 'int') + F.num('prelim.finalistCount', 'Finalists', p.finalistCount, 2, 12, 1, 'int') + '<div class="field"><span>Quick count</span><div class="row">' + [10, 15, 20, 25, 30].map((n) => F.btn('prelimCount', String(n), 'sm' + (p.count === n ? ' on' : ''), String(n))).join('') + '</div></div></div><div class="row" style="margin-top:.5rem">' + F.check('prelim.drone', 'Bring questions in by drone', p.drone) + '</div>' + F.area('prelim.rules', 'Prelim round rules', p.rules, 5) + '<div class="row">' + F.media('prelim.rulesImage', 'Rules picture (optional)', p.rulesImage || '') + F.btn('prelimRulesSuggest', 'Insert suggested text', 'sm') + '</div>';
    const testNote = qs.some((q) => q.source === 'test') ? '<p class="badge-warn">⚠ Some questions (source: test bank) were added to fill the default 20 — change them if needed.</p>' : '';
    const rows = qs.map((q, i) => {
      const live = s.show.scene === 'PRELIM_Q' && s.prelimLive.idx === i;
      return '<div class="li' + (live ? ' active' : '') + '" style="grid-template-columns:auto 1fr"><span class="n">' + String(i + 1) + (q.star ? '★' : '') + '</span><div class="t" style="display:flex;flex-direction:column;gap:.35rem">' +
        '<textarea rows="2" data-bind="prelim.questions.' + i + '.text" aria-label="Question ' + (i + 1) + '">' + esc(q.text) + '</textarea>' +
        '<div class="row"><input type="text" data-bind="prelim.questions.' + i + '.answer" value="' + esc(q.answer) + '" placeholder="Answer" style="flex:2 1 180px" aria-label="Answer ' + (i + 1) + '">' + F.check('prelim.questions.' + i + '.star', '★ Star', q.star, true) + (q.source === 'test' ? '<span class="badge-warn">Test</span>' : '') + '</div>' +
        '<div class="row">' + F.btn('prelimShow', '❓ Show question ' + (i + 1), 'sm primary', String(i)) + F.btn('prelimReveal', '✅ Answer ' + (i + 1) + ' (ANSWER)', 'sm gold', String(i)) + F.btn('prelimImg', q.image ? '🖼 Change picture' : '🖼 Picture', 'sm', String(i)) + (q.image ? F.btn('clearMedia', 'Delete picture', 'sm', 'prelim.questions.' + i + '.image') : '') + F.btn('prelimQMove', '↑', 'sm', i + '|-1') + F.btn('prelimQMove', '↓', 'sm', i + '|1') + F.btn('prelimQDel', '🗑', 'sm bad', String(i)) + '</div></div></div>';
    }).join('');
    const missing = p.count - qs.length;
    const list = rows + (missing > 0 ? '<p class="badge-warn">⚠ ' + missing + ' more question(s) needed.</p>' : '') + '<div class="row">' + F.btn('prelimQAdd', '+ New prelim question', 'primary') + '</div>';
    // Marking matrix: teams × questions
    const head = '<tr><th>Team</th>' + qs.map((q, i) => '<th class="' + (q.star ? 'star' : '') + '">' + String(i + 1) + (q.star ? '★' : '') + '</th>').join('') + '<th>Points</th><th>★</th><th>Manual points</th><th>Manual ★</th></tr>';
    const body = s.teams.map((t, ti) => {
      const r = Sel.prelimResult(t);
      return '<tr><td>' + esc(t.name) + '</td>' + qs.map((q, qi) => '<td><input type="checkbox" aria-label="' + esc(t.name) + ' question ' + (qi + 1) + '" data-bind="teams.' + ti + '.prelim.marks.' + qi + '" data-rerender="1"' + (r.marks[qi] ? ' checked' : '') + '></td>').join('') + '<td><b>' + String(r.score) + '</b></td><td>' + String(r.stars) + '</td><td><input type="number" style="width:80px;min-height:30px" data-bind="teams.' + ti + '.prelim.manual" data-type="nullnum" data-rerender="1" value="' + esc(t.prelim.manual == null ? '' : t.prelim.manual) + '"></td><td><input type="number" style="width:70px;min-height:30px" data-bind="teams.' + ti + '.prelim.stars" data-type="nullnum" data-rerender="1" value="' + esc(t.prelim.stars == null ? '' : t.prelim.stars) + '"></td></tr>';
    }).join('');
    const ranking = Sel.prelimRanking();
    const finalIds = Sel.finalistIds();
    const rankHtml = ranking.map((r) => '<div class="li' + (finalIds.includes(r.team.id) ? ' active' : '') + '"><span class="n">' + String(r.rank) + '</span><div class="t"><b>' + esc(r.team.name) + '</b> <span class="muted">' + esc(r.team.school) + '</span><small>' + r.score + ' points • ★' + r.stars + '</small></div><div class="acts">' + F.btn('finalistToggle', finalIds.includes(r.team.id) ? '✓ Finalist' : '+ Add to finalists', 'sm ' + (finalIds.includes(r.team.id) ? 'good' : ''), r.team.id) + '</div></div>').join('');
    const finals = finalIds.map((id, i) => { const ti = Sel.teamIndex(id); const t = s.teams[ti]; if (!t) return ''; return '<div class="li" style="--team:' + esc(t.color) + '"><span class="n">' + String(i + 1) + '</span><div class="g2">' + F.text('teams.' + ti + '.name', 'Team name', t.name) + F.text('teams.' + ti + '.school', 'School', t.school) + '</div><div class="acts">' + F.btn('finalistMove', '↑', 'sm', id + '|-1') + F.btn('finalistMove', '↓', 'sm', id + '|1') + F.btn('finalistToggle', '✕', 'sm bad', id) + '</div></div>'; }).join('');
    return onStage + F.card('Prelim round — settings', settings) +
      F.card('Paste many prelim questions at once', '<p class="big-hint">One question per line: <code>question|answer</code></p><textarea id="prelimBulk" rows="4" placeholder="সুন্দরবনে কোন বাঘ থাকে?|রয়্যাল বেঙ্গল টাইগার"></textarea><div class="row" style="margin-top:.4rem">' + F.btn('prelimBulk', '⇧ Import prelim list', 'primary') + '</div>') + F.card('Prelim questions & answer buttons', testNote + '<div class="list">' + list + '</div>', 'Each question has its own ANSWER button') +
      F.card('Answer-sheet marking (tick = correct)', '<div class="matrix" data-keep-scroll="mx"><table>' + head + body + '</table></div><p class="big-hint">Tie-break: more ★ correct ▸ earlier correct in question order ▸ registration order. Manual points override the ticks.</p>') +
      F.card('Ranking & finalist selection', '<div class="list" data-keep-scroll="rank" style="max-height:50vh;overflow:auto">' + rankHtml + '</div><div class="deck" style="margin-top:.6rem">' + F.btn('confirmFinalists', '✓ Auto-select top ' + p.finalistCount, 'good span2') + F.btn('clearFinalists', '↺ Back to automatic') + '</div>', s.finalists.length ? 'Confirmed manually' : 'Automatic (by rank)') +
      F.card('Finalists — edit names & order', '<div class="list">' + finals + '</div>');
  },

  /* ---------------- TEAMS ---------------- */
  teams(s) {
    const ed = s.teams.map((t, i) => {
      const r = 'teams.' + i;
      const fin = Sel.finalistIds().includes(t.id);
      return '<div class="team-editor" style="--team:' + esc(t.color) + '"><header><span class="thumb" style="--team:' + esc(t.color) + '">' + (t.photo ? '<img data-media="' + esc(t.photo) + '" alt="">' : String(i + 1)) + '</span><b style="flex:1"><span class="tcode-chip">' + esc(Sel.code(t)) + '</span> ' + esc(t.name === Sel.code(t) ? '' : t.name) + (fin ? ' <span class="status-pill ok">Finalist</span>' : '') + '</b><span class="pts gold">' + Sel.score(t.id) + ' points</span>' +
        F.btn('teamIntroNow', '▶ Intro', 'sm', t.id) + F.btn('teamMove', '↑', 'sm', t.id + '|-1') + F.btn('teamMove', '↓', 'sm', t.id + '|1') + F.btn('teamDel', '🗑', 'sm bad', t.id) + '</header>' +
        '<div class="g3">' + F.text(r + '.name', 'Team name', t.name) + F.text(r + '.school', 'School', t.school) + F.color(r + '.color', 'Team colour', t.color) + F.text(r + '.captain', 'Member 1 (captain)', t.captain) + F.text(r + '.players.0', 'Member 2', t.players[0]) + F.text(r + '.players.1', 'Extra member', t.players[1]) + F.text(r + '.players.2', 'Extra member', t.players[2]) + '</div>' +
        '<div class="g4">' + F.media(r + '.photo', 'Team photo', t.photo) + F.media(r + '.captainPhoto', 'Member 1 photo', t.captainPhoto) + F.media(r + '.playerPhotos.0', 'Member 2 photo', t.playerPhotos[0]) + F.media(r + '.playerPhotos.1', 'Extra 1', t.playerPhotos[1]) + F.media(r + '.playerPhotos.2', 'Extra 2', t.playerPhotos[2]) + '</div>' +
        '<div class="g3">' + F.select(r + '.gift.category', 'Special presentation — category', s.giftCategories.concat(s.giftCategories.includes(t.gift.category) || !t.gift.category ? [] : [t.gift.category]), t.gift.category) + F.text(r + '.gift.item', 'Subject (e.g. mango, Rabindranath)', t.gift.item) + F.media(r + '.gift.image', 'Subject picture', t.gift.image) + '</div>' +
        '<div class="row">' + F.media(r + '.emblem', 'Logo / emblem', t.emblem) + '<div class="field" style="flex:2"><span>Lifelines</span><div class="row">' + ['fifty', 'poll', 'flip'].map((k) => '<span class="status-pill ' + (Sel.lifelineUsed(t.id, k) ? 'bad' : 'ok') + '">' + { fifty: '50:50', poll: 'Poll', flip: 'Flip' }[k] + (Sel.lifelineUsed(t.id, k) ? ' used' : ' available') + '</span>').join('') + F.btn('lifelineReset', 'Reset', 'sm', t.id) + '</div></div></div></div>';
    }).join('');
    const ledger = s.ledger.slice(-60).reverse().map((e) => '<div class="li"><span class="n" style="color:' + (e.delta >= 0 ? 'var(--correct)' : 'var(--wrong)') + '">' + signed(e.delta) + '</span><div class="t"><b>' + esc((Sel.team(e.team) || {}).name || e.team) + '</b> — ' + esc(e.reason) + '<small class="muted" style="color:var(--muted);font-weight:400">' + esc((Sel.round(e.round) || {}).name || '') + ' • ' + new Date(e.t).toLocaleTimeString() + '</small></div><div class="acts">' + F.btn('ledgerDel', 'Delete', 'sm bad', e.id) + '</div></div>').join('');
    return F.card('Team registration', '<div class="row">' + F.btn('teamAdd', '+ New team', 'primary') + '<span class="muted">' + s.teams.length + ' teams in total • Photos: copy them from the phone to the laptop, then press "Add" (JPG/PNG/WEBP)</span></div>') +
      '<div class="list">' + ed + '</div>' +
      F.card('Special presentation categories', '<div class="row">' + s.giftCategories.map((c, i) => '<span class="status-pill">' + esc(c) + ' <button class="btn sm ghost" data-act="giftCatDel" data-arg="' + i + '" aria-label="Delete">✕</button></span>').join('') + '</div><div class="row" style="margin-top:.5rem"><input type="text" id="newCat" placeholder="New category"><button class="btn sm primary" data-act="giftCatAdd">Add</button></div>') +
      F.card('Scores & stats', '<div class="row">' + F.btn('tab', '🏆 View scores, ties & score history', 'primary', 'scores') + '</div>');
  },

  /* ---------------- SCORES & STATISTICS ---------------- */
  scores(s) {
    const rows = Sel.standings();
    const played = s.rounds.filter((r) => r.enabled);
    const ties = Sel.ties(rows);
    const table = '<div style="overflow:auto"><table class="stat-table"><tr><th>Rank</th><th>Team</th><th>Total</th><th>Own correct</th><th>Hands ✓/✕</th><th>Bonus</th><th>Wrong</th><th>Manual</th>' + played.map((r, i) => '<th>R' + String(i + 1) + '</th>').join('') + '<th></th></tr>' +
      rows.map((r) => { const st = Sel.teamStats(r.team.id); return '<tr><td>' + String(r.rank) + '</td><td><b>' + esc(r.team.name) + '</b><br><small class="muted">' + Sel.rankTitle(r.rank) + '</small></td><td><b class="gold">' + String(r.score) + '</b></td><td>' + String(st.correct) + '</td><td>' + String(st.handsRight) + '/' + String(st.handsWrong) + '</td><td>' + String(st.bonus) + '</td><td>' + String(st.wrong) + '</td><td>' + signed(st.manual) + '</td>' + played.map((rd) => '<td>' + String(st.rounds[rd.id] || 0) + '</td>').join('') + '<td>' + F.btn('setActive', 'Answering', 'sm', r.team.id) + F.btn('certificate', '🎓', 'sm', r.team.id) + '</td></tr>'; }).join('') + '</table></div>';
    const ledger = s.ledger.slice(-80).reverse().map((e) => '<div class="li"><span class="n" style="color:' + (e.delta >= 0 ? 'var(--correct)' : 'var(--wrong)') + '">' + signed(e.delta) + '</span><div class="t"><b>' + esc((Sel.team(e.team) || {}).name || e.team) + '</b> — ' + esc(e.reason) + (e.before != null ? ' <span class="muted">(' + String(e.before) + ' → ' + String(e.after) + ')</span>' : '') + '<small class="muted" style="color:var(--muted);font-weight:400">' + esc((Sel.round(e.round) || {}).name || '') + (e.q ? ' • ' + esc(e.q) : '') + ' • ' + new Date(e.t).toLocaleTimeString() + '</small></div><div class="acts">' + F.btn('ledgerDel', 'Delete', 'sm bad', e.id) + '</div></div>').join('');
    return F.card('Score table & stats', (ties.length ? '<p class="badge-warn">⚠ ' + esc(ties.join(' • ')) + '</p>' : '<p class="muted">No ties in the top three.</p>') + table + '<div class="deck" style="margin-top:.6rem">' + F.btn('speakStandings', '🔊 Read out all scores (Shift+L)') + F.btn('scoreboard', '📊 Scoreboard on stage') + F.btn('exportScoresCsv', '⇩ Scores CSV') + F.btn('exportLedgerCsv', '⇩ Score history CSV') + F.btn('certificatesAll', '🎓 All certificates (ZIP)') + '</div>') +
      F.card('Manual correction', '<div class="row"><select id="corrTeam" aria-label="Team" style="flex:1 1 160px">' + s.teams.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select><input id="corrVal" type="number" value="0" style="width:90px" aria-label="Points"><input id="corrWhy" type="text" placeholder="Reason" style="flex:2 1 160px" aria-label="Reason">' + F.btn('correction', 'Apply', 'primary') + '</div>') +
      F.card('Score history (audit)', '<div class="list" style="max-height:50vh;overflow:auto">' + (ledger || '<p class="muted">No scores yet</p>') + '</div><div class="row" style="margin-top:.5rem">' + F.btn('undo', '↶ Undo') + F.btn('redo', '↷ Redo') + F.btn('resetScores', 'Reset all scores', 'bad') + '</div>');
  },

  /* ---------------- QUESTIONS ---------------- */
  questions(s) {
    const filter = UI.qFilter || '';
    const rounds = s.rounds;
    const list = s.questions.filter((q) => !filter || q.roundId === filter).sort((a, b) => Sel.roundIndex(a.roundId) - Sel.roundIndex(b.roundId) || a.number - b.number);
    const filt = '<div class="row">' + F.btn('qFilter', 'All (' + String(s.questions.length) + ')', 'sm' + (!filter ? ' on' : ''), '') + rounds.map((r) => F.btn('qFilter', esc(r.name) + ' (' + String(Sel.roundQuestions(r.id).length) + ')', 'sm' + (filter === r.id ? ' on' : ''), r.id)).join('') + '</div>';
    const rows = list.map((q) => '<div class="li' + (UI.qEdit === q.id ? ' active' : '') + (s.board.played[q.id] ? ' done' : '') + '"><span class="n">' + String(q.number) + '</span><div class="t">' + esc(q.text.slice(0, 110)) + (q.text.length > 110 ? '…' : '') + '<small>' + esc((Sel.round(q.roundId) || {}).name || q.roundId) + ' • Answer: ' + esc(q.answerText || q.options[q.answer] || '—') + (q.image ? ' • 🖼' : '') + (q.voiceQ || q.voiceOpt || q.voiceAns ? ' • 🎙' + String([q.voiceQ, q.voiceOpt, q.voiceAns].filter(Boolean).length) : '') + '</small></div><div class="acts">' + F.btn('qEdit', '✎', 'sm primary', q.id) + F.btn('showQ', '▶', 'sm good', q.id) + (s.board.played[q.id] ? F.btn('qUnused', '♻', 'sm', q.id) : '') + F.btn('qMove', '↑', 'sm', q.id + '|-1') + F.btn('qMove', '↓', 'sm', q.id + '|1') + F.btn('qDup', '⧉', 'sm', q.id) + F.btn('qDel', '🗑', 'sm bad', q.id) + '</div></div>').join('');
    let editor = '';
    const qi = s.questions.findIndex((q) => q.id === UI.qEdit);
    if (qi >= 0) {
      const q = s.questions[qi]; const p = 'questions.' + qi;
      editor = F.card('Edit question — ' + esc(q.id), '<div class="g3">' + F.select(p + '.roundId', 'Round', rounds.map((r) => [r.id, r.name]), q.roundId, true) + F.num(p + '.number', 'Question number', q.number, 1, 999, 1, 'int') + F.num(p + '.timer', 'Timer (seconds, empty = round default)', q.timer, 5, 600, 1, 'nullnum') + '</div>' +
        F.area(p + '.text', 'Question', q.text, 4) +
        '<div class="g2">' + F.text(p + '.subject', 'Subject on the question board (e.g. সাহিত্য)', q.subject) + F.select(p + '.subjectIcon', 'Subject picture (never the answer)', [['', '— none —']].concat(TOPIC_ICONS), q.subjectIcon || '') + '</div>' +
        '<div class="g2">' + [0, 1, 2, 3].map((i) => '<label class="field"><span><input type="radio" name="ans" data-bind="' + p + '.answer" data-type="int" value="' + i + '"' + (q.answer === i ? ' checked' : '') + '> Correct — option ' + OPT_LABELS[i] + '</span><input type="text" data-bind="' + p + '.options.' + i + '" value="' + esc(q.options[i] || '') + '"></label>').join('') + '</div>' +
        '<div class="g2">' + F.text(p + '.answerText', 'Written answer (when there are no options)', q.answerText) + F.num(p + '.points', 'Points (empty = round default)', q.points, -100, 100, 1, 'nullnum') + '</div>' +
        F.area(p + '.explanation', 'Explanation', q.explanation, 2) + '<div class="g2">' + F.text(p + '.hint', 'Hint', q.hint) + F.select(p + '.difficulty', 'Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], q.difficulty) + '</div>' + F.area(p + '.speech', 'Text for the voice (optional)', q.speech, 2) + '<div class="card" style="margin:.5rem 0"><h3>✔ Spelling & format check (V100 auditor)</h3>' + auditHtml(q) + '</div>' +
        '<div class="card voice-card" style="margin:.5rem 0"><h3>🎙 Question readout — recorded in your own voice</h3><p class="muted">Record right here with the laptop microphone, or add an mp3 recorded on a phone. The question recording plays by itself when the question comes on stage, the options recording when the options are shown, and the answer recording when the answer is shown.</p><div class="row">' + VOICE_SLOTS.map(([f, l]) => '<div class="voice-slot">' + F.media(p + '.' + f, (q[f] ? '✔ ' : '') + l, q[f], 'audio/*,.mp3,.m4a,.wav,.ogg,.webm', 'audio') + '<div class="row">' + F.btn('recOpen', '🎙 Record', 'sm warn', p + '.' + f) + (q[f] ? F.btn('voicePreview', '▶ Listen', 'sm', q[f]) : '') + '</div></div>').join('') + '</div></div>' +
        '<div class="row">' + F.media(p + '.image', 'Question picture', q.image) + F.media(p + '.clip', 'Audio / video clip', q.clip, 'audio/*,video/*', 'video') + '<div class="deck" style="flex:1">' + F.btn('showQ', '▶ Show on stage', 'good', q.id) + F.btn('qEdit', 'Close', '', '') + '</div></div>');
    }
    return editor + F.card('Question manager', filt + '<div class="row" style="margin:.5rem 0">' + F.btn('qNew', '+ New question', 'primary') + F.btn('importOpen', '⇧ Import (CSV / Excel / JSON / text)', 'warn') + F.btn('qMediaBulk', '🖼 All pictures / audio / video at once (name: R1-5.jpg)', 'primary') + F.btn('voiceList', '🎙 Recording list (what to read in each file)') + F.btn('csvTemplate', '⇩ Blank CSV template') + F.btn('exportQuestionsCsv', '⇩ Questions CSV') + F.btn('exportQuestions', '⇩ Questions JSON') + F.btn('bankAudit', '🔎 Spelling & question-bank check') + '</div><div class="row" style="margin:.5rem 0"><input id="allTime" type="number" min="5" max="600" value="60" style="width:90px" aria-label="Time (seconds)">' + F.btn('setTimeAll', '⏱ Set this time for ' + (filter ? 'this round\'s' : 'all') + ' questions') + F.btn('setTimeClear', 'Time back to round default') + F.btn('shuffleAnswers', '🔀 Shuffle answer positions') + F.btn('resetBoard', '♻ Clear all "used" marks') + '</div><div class="list" data-keep-scroll="ql" style="max-height:62vh;overflow:auto">' + (rows || '<p class="muted">No questions in this round</p>') + '</div>');
  },

  /* ---------------- ROUNDS ---------------- */
  rounds(s) {
    const anims = ROUND_ANIMS.map((a) => [a, a]);
    const out = s.rounds.map((r, i) => {
      const p = 'rounds.' + i; const sc = p + '.scoring.'; const ft = p + '.features.';
      const count = Sel.roundQuestions(r.id).length;
      return '<div class="team-editor" style="--team:' + esc(r.design.primary) + '"><header><b style="flex:1">Round ' + (i + 1) + ': ' + esc(r.name) + ' <span class="muted">(' + count + ' questions)</span>' + (count ? '' : ' <span class="badge-warn">⚠ No questions</span>') + '</b>' + F.check(p + '.enabled', 'On in the event', r.enabled, true) + F.btn('roundShow', '▶ Intro', 'sm good', r.id) + F.btn('roundMove', '↑', 'sm', r.id + '|-1') + F.btn('roundMove', '↓', 'sm', r.id + '|1') + '</header>' +
        '<div class="g3">' + F.text(p + '.name', 'Round name', r.name) + F.text(p + '.label', 'Subtitle', r.label) + F.select(p + '.type', 'Type', [['standard', 'Standard (direct/pass)'], ['bonus', 'Bonus (+step on each pass)'], ['rapid', 'Rapid fire / buzzer']], r.type, true) + '</div>' +
        F.area(p + '.description', 'Description (on the intro screen)', r.description, 2) + F.area(p + '.rules', 'Rules', r.rules, 4) +
        '<div class="row">' + F.check(ft + 'options', 'Has options', r.features.options) + F.check(ft + 'judgeOptions', '5/3 points if options taken', r.features.judgeOptions) + F.check(ft + 'pass', 'Pass on', r.features.pass) + F.check(ft + 'passAfterOptions', 'Pass after options', r.features.passAfterOptions) + F.check(ft + 'challenge', 'Challenge on', r.features.challenge) + F.check(ft + 'singleChallenger', 'Only one team may challenge', r.features.singleChallenger) + F.check(ft + 'lifelines', 'Lifelines', r.features.lifelines) + F.check(ft + 'twoOptions', 'Show two options', r.features.twoOptions) + '</div>' +
        '<div class="g4">' + F.num(sc + 'direct', 'Direct correct', r.scoring.direct) + F.num(sc + 'options4', 'Correct with 4 options', r.scoring.options4) + F.num(sc + 'options2', 'Correct with 2 options', r.scoring.options2) + F.num(sc + 'pass', 'Correct on pass', r.scoring.pass) + F.num(sc + 'wrong', 'Wrong', r.scoring.wrong) + F.num(sc + 'bonusStep', 'Bonus step (+)', r.scoring.bonusStep) + F.num(sc + 'challengeRight', 'Challenge correct', r.scoring.challengeRight) + F.num(sc + 'challengeWrong', 'Challenge wrong', r.scoring.challengeWrong) + F.num(sc + 'rapidRight', 'Rapid correct', r.scoring.rapidRight) + F.num(sc + 'rapidWrong', 'Rapid wrong', r.scoring.rapidWrong) + F.num(sc + 'passWrong', 'Wrong after pass', r.scoring.passWrong) + F.num(sc + 'manualBonus', 'Manual bonus', r.scoring.manualBonus) + F.num(p + '.multiplier', 'Multiplier (×1–5)', r.multiplier, 1, 5, 1, 'int') + F.num(p + '.timers.raise', 'Hand-raise time (s)', r.timers.raise, 3, 30) + F.num(p + '.timers.direct', 'Direct timer (s)', r.timers.direct, 5, 600) + F.num(p + '.timers.pass', 'Pass/bonus timer (s)', r.timers.pass, 5, 600) + '</div>' +
        '<div class="g2">' + F.select(p + '.design.theme', 'Stage theme for this round', [['', 'Same as the show theme']].concat(Object.entries(THEMES).map(([k, x]) => [k, x.label])), r.design.theme || '') + '</div>' + '<div class="g4">' + F.color(p + '.design.primary', 'Primary colour', r.design.primary) + F.color(p + '.design.secondary', 'Secondary colour', r.design.secondary) + F.color(p + '.design.accent', 'Accent / gold', r.design.accent) + F.select(p + '.design.anim', 'Intro animation', anims, r.design.anim) + F.select(p + '.design.titleFont', 'Title font', [['', 'Global']].concat(fontOpts()), r.design.titleFont) + F.select(p + '.design.questionFont', 'Question font', [['', 'Global']].concat(fontOpts()), r.design.questionFont) + F.select(p + '.design.optionFont', 'Options font', [['', 'Global']].concat(fontOpts()), r.design.optionFont) + F.range(p + '.design.qScale', 'Question size', r.design.qScale, 0.6, 1.6, 0.05) + F.check(p + '.voiceIntro', 'Voice announcement at intro', r.voiceIntro) + '</div>' +
        '<div class="g4">' + F.media(p + '.design.bg', 'Background picture', r.design.bg) + F.media(p + '.design.music', 'Round music', r.design.music, 'audio/*', 'audio') + F.media(p + '.sounds.correct', 'Correct sound', r.sounds.correct, 'audio/*', 'audio') + F.media(p + '.sounds.wrong', 'Wrong sound', r.sounds.wrong, 'audio/*', 'audio') + '</div>' +
        '<div class="row">' + F.media(p + '.rulesImage', 'Rules picture (shown on TV instead of the text)', r.rulesImage) + F.media(p + '.sounds.reveal', 'Answer reveal sound', r.sounds.reveal, 'audio/*', 'audio') + F.select(p + '.turnOrder', 'Turn order (one turn per team; the rest are audience questions)', [['forward', 'A / 1 → H / 8'], ['reverse', 'H / 8 → A / 1 (anti-clockwise)'], ['manual', 'Operator chooses the team each time']], r.turnOrder || 'forward') + '<span class="muted">Turn now: ' + esc(Sel.label(Sel.team(Game.turnFor(r.id))) || 'audience') + '</span>' + F.btn('roundResetTurn', 'Reset turn', 'sm', r.id) + '</div></div>';
    }).join('');
    return F.card('Round settings', '<p class="big-hint">Default: direct 60 seconds, pass/bonus 45 seconds. Name, order, rules, points, timers, colours, animation, music — all set here.</p><div class="g2">' + F.select('flipPool', 'Round that the Flip lifeline takes its question from', s.rounds.map((r) => [r.id, r.name]), s.flipPool) + '</div>') + '<div class="list">' + out + '</div>';
  },

  /* ---------------- EVENT ---------------- */
  event(s) {
    const e = 'event.';
    const crew = s.crew.map((c, i) => '<div class="li" style="grid-template-columns:auto 1fr auto">' + F.media('crew.' + i + '.photo', 'Photo', c.photo) + '<div><div class="g2">' + F.text('crew.' + i + '.name', 'Name', c.name) + F.text('crew.' + i + '.role', 'Role', c.role) + '</div>' + F.area('crew.' + i + '.about', 'About (optional)', c.about || '', 2) + '</div><div class="acts">' + F.btn('crewDel', '🗑', 'sm bad', String(i)) + '</div></div>').join('');
    return F.card('Brand', '<div class="g3">' + F.text(e + 'brandEn', 'English name', s.event.brandEn) + F.text(e + 'brandBn', 'Bengali name', s.event.brandBn) + F.text(e + 'tagline', 'Tagline', s.event.tagline) + '</div>') +
      F.card('Event details', '<div class="g2">' + F.text(e + 'programme', 'Event name', s.event.programme) + F.text(e + 'mainTitle', 'Main-round title on TV (English)', s.event.mainTitle) + F.text(e + 'subtitle', 'Subtitle', s.event.subtitle) + F.text(e + 'season', 'Season', s.event.season) + F.text(e + 'year', 'Year / school year', s.event.year) + F.text(e + 'organizer', 'Organiser', s.event.organizer) + F.text(e + 'venue', 'Venue', s.event.venue) + F.text(e + 'date', 'Date', s.event.date) + F.text(e + 'presenter', 'Presenter', s.event.presenter) + F.text(e + 'quizMaster', 'Quiz master', s.event.quizMaster) + F.text(e + 'compiler', 'Question compiler', s.event.compiler) + F.text(e + 'editor', 'Editor', s.event.editor) + F.text(e + 'conductedBy', 'Conducted by', s.event.conductedBy) + F.text(e + 'sponsors', 'Sponsors', s.event.sponsors) + '</div>' + F.area(e + 'credits', 'Special thanks', s.event.credits, 3) + F.area(e + 'welcomeNote', 'Welcome message', s.event.welcomeNote, 2) + '<div class="row">' + F.text(e + 'ticker', 'Scrolling text at the bottom (ticker)', s.event.ticker) + F.check(e + 'showTicker', 'Show ticker', s.event.showTicker) + '</div>') +
      F.card('🎲 Podium lottery (right after Welcome)', '<p class="muted">In prelim-rank order, each of the 8 finalists picks a favourite item; press again and the card opens to reveal a random podium (A / 1 … H / 8) — the team sits there and that becomes its code.</p><div class="row">' + F.check('draw.on', 'Lottery on', s.draw.on) + F.check('settings.giftScenes', 'Old "special presentation" screens (one per team)', s.settings.giftScenes) + '<div style="flex:1">' + F.text('draw.title', 'Title', s.draw.title) + '</div></div><div class="row" style="margin:.5rem 0">' + Object.entries(DRAW_THEMES).map(([k, t]) => F.btn('drawTheme', t.name, 'sm' + (s.draw.theme === k ? ' on' : ''), k)).join('') + F.btn('drawReset', '↺ Restart lottery from the beginning', 'sm warn') + '</div><div class="list">' + s.draw.items.slice(0, 8).map((it, i) => '<div class="li" style="grid-template-columns:auto 1fr auto"><span class="n">' + String(i + 1) + '</span><div class="g2">' + F.text('draw.items.' + i + '.label', 'Name', it.label) + F.text('draw.items.' + i + '.emoji', 'Emoji (optional)', it.emoji) + '</div>' + F.media('draw.items.' + i + '.image', 'Picture (optional)', it.image) + '</div>').join('') + '</div><p class="muted">Add pictures of famous people or cartoons yourself (click / drag in / Ctrl+V); without a picture, the first letter of the name shows in a gold circle.</p>') +
      F.card('Organising team', '<div class="list">' + crew + '</div><div class="row" style="margin-top:.5rem">' + F.btn('crewAdd', '+ Add member', 'primary') + '</div><div class="row" style="margin-top:.5rem">' + F.media('groupPhoto', 'Group photo', s.groupPhoto) + '<div style="flex:1">' + F.text('groupCaption', 'Caption', s.groupCaption) + '</div></div>');
  },

  /* ---------------- MEDIA ---------------- */
  media(s) {
    const p = s.poster;
    const poster = '<div class="row">' + F.media('poster.media', 'Organiser banner / poster', p.media) + '<div style="flex:1" class="g3">' + F.select('poster.fit', 'Fit', [['contain', 'Contain (show all)'], ['cover', 'Cover (fill the screen)'], ['fill', 'Fill']], p.fit) + F.range('poster.posX', 'Horizontal position', p.posX, 0, 100, 1) + F.range('poster.posY', 'Vertical position', p.posY, 0, 100, 1) + F.range('poster.zoom', 'Zoom', p.zoom, 0.5, 2, 0.05) + F.range('poster.opacity', 'Opacity', p.opacity, 0.1, 1, 0.05) + F.color('poster.bg', 'Background', p.bg) + F.select('poster.anim', 'Entry animation', ANIMS, p.anim) + '</div></div>';
    const gal = s.gallery.map((id) => '<div class="photo-slot"><div class="thumb" style="width:110px;height:72px"><img data-media="' + esc(id) + '" alt=""></div><small>' + esc(Media.label(id)) + '</small><div class="row">' + F.btn('galleryShow', '▶ On stage', 'sm good', id) + F.btn('galleryUse', 'Poster', 'sm', id + '|poster.media') + F.btn('galleryUse', 'Logo', 'sm', id + '|logo') + F.btn('galleryUse', 'Background', 'sm', id + '|design.bgImage') + F.btn('galleryUse', 'Winner', 'sm', id + '|winnerPhoto') + F.btn('galleryDel', '✕', 'sm bad', id) + '</div></div>').join('');
    const lib = Media.index.map((m) => '<div class="li"><span class="thumb">' + (m.kind === 'image' ? '<img data-media="' + esc(m.id) + '" alt="">' : '♪') + '</span><div class="t">' + esc(m.name) + '<small style="color:var(--muted)">' + esc(m.kind) + ' • ' + Math.round(m.size / 1024) + ' KB' + (m.w ? ' • ' + m.w + '×' + m.h : '') + '</small></div><div class="acts">' + (m.kind === 'image' ? F.btn('galleryAddId', '+ Gallery', 'sm', m.id) : '') + F.btn('mediaDel', '🗑', 'sm bad', m.id) + '</div></div>').join('');
    return F.card('Organiser banner / event poster (first scene)', poster + '<div class="row" style="margin-top:.5rem">' + F.btn('jump', '▶ Show banner', 'good', 'ORGANIZER') + '</div>') +
      F.card('Logo & winner photo', '<div class="g3">' + F.media('logo', 'Quiz Corner logo', s.logo) + F.media('winnerPhoto', 'Winner photo (empty = team photo)', s.winnerPhoto) + '<div class="field"><span>Built-in logo</span>' + F.btn('logoReset', 'Restore original logo', 'sm') + '</div></div>') +
      F.card('Graphics gallery', '<div class="row">' + F.btn('galleryUpload', '+ Add several pictures', 'primary') + '<span class="muted">Posters, sponsors, backgrounds, round and winner graphics — reusable in any scene</span></div><div class="row" style="margin-top:.5rem;align-items:stretch">' + (gal || '<p class="muted">Gallery is empty</p>') + '</div>') +
      F.card('Media library', '<div class="list" style="max-height:40vh;overflow:auto">' + (lib || '<p class="muted">No uploads</p>') + '</div>', 'Optimised for display; the original file is kept intact');
  },

  /* ---------------- TEXT & FONTS (Office-style toolbar) ---------------- */
  text(s) {
    const d = s.design;
    const el = TEXT_ELEMENTS.some((x) => x[0] === UI.textEl) ? UI.textEl : 'question';
    const t = d.text[el];
    const p = 'design.text.' + el;
    const tabs = TEXT_ELEMENTS.map(([k, l]) => F.btn('textEl', l, 'seg' + (k === el ? ' on' : ''), k)).join('');
    const tog = (k, label, title) => '<button class="tb' + (t[k] ? ' on' : '') + '" data-act="textToggle" data-arg="' + k + '" title="' + title + '" aria-pressed="' + !!t[k] + '">' + label + '</button>';
    const al = (a, label, title) => '<button class="tb' + (t.align === a ? ' on' : '') + '" data-act="textAlign" data-arg="' + a + '" title="' + title + '" aria-pressed="' + (t.align === a) + '">' + label + '</button>';
    const sample = '<div class="text-sample" style="font-family:' + esc(FONT_MAP[t.font] || t.font) + ';font-weight:' + (t.bold ? 800 : 400) + ';font-style:' + (t.italic ? 'italic' : 'normal') + ';text-decoration:' + (t.underline ? 'underline' : 'none') + ';text-align:' + t.align + ';color:' + esc(t.color || d.colors.text) + ';background:' + esc(d.colors.panel) + ';border-color:' + esc(d.colors.neon) + ';font-size:' + Math.round(22 * t.size) + 'px">' + esc(TEXT_SAMPLES[el]) + '</div>';
    const toolbar = '<div class="toolbar" role="toolbar" aria-label="Text format">' +
      '<select data-bind="' + p + '.font" aria-label="Font" class="tb-font">' + FONT_CHOICES.map(([n]) => '<option value="' + esc(n) + '"' + (n === t.font ? ' selected' : '') + ' style="font-family:' + esc(FONT_MAP[n]) + '">' + esc(n) + '</option>').join('') + '</select>' +
      '<span class="tb-group"><button class="tb" data-act="textSize" data-arg="-0.05" title="Smaller">A−</button><span class="tb-val">' + String(Math.round(t.size * 100)) + '%</span><button class="tb" data-act="textSize" data-arg="0.05" title="Larger">A+</button></span>' +
      '<span class="tb-group">' + tog('bold', '<b>B</b>', 'Bold') + tog('italic', '<i>I</i>', 'Italic') + tog('underline', '<u>U</u>', 'Underline') + '</span>' +
      '<span class="tb-group">' + al('left', '⯇≡', 'Left') + al('center', '≡', 'Centre') + al('right', '≡⯈', 'Right') + al('justify', '☰', 'Justify') + '</span>' +
      '<label class="tb-color" title="Text colour"><span style="border-bottom:4px solid ' + esc(t.color || d.colors.text) + '">A</span><input type="color" data-bind="' + p + '.color" value="' + esc(t.color || d.colors.text) + '" aria-label="Text colour"></label>' +
      '<button class="tb" data-act="textColorReset" title="Theme colour">↺ Colour</button><button class="tb" data-act="textReset" title="Reset this text to default">↺ Default</button></div>';
    return F.card('Text & fonts — like Microsoft Office', '<p class="big-hint">Choose which text to change, then use the toolbar. Changes show on stage straight away.</p><div class="seg-row">' + tabs + '</div>' + toolbar + sample) +
      F.card('Main fonts for all text', '<div class="g3">' + F.select('design.fonts.bn', 'Main Bengali font (default: Hind Siliguri)', fontOpts(), d.fonts.bn) + F.select('design.fonts.en', 'English font', fontOpts(), d.fonts.en) + F.select('design.fonts.timer', 'Timer & number font', fontOpts(), d.fonts.timer) + '</div>') +
      F.card('Question paragraph', '<div class="g3">' + F.range('design.qSpacing', 'Letter spacing', d.qSpacing, -0.05, 0.2, 0.01) + F.range('design.qLeading', 'Line height', d.qLeading, 1.2, 2, 0.02) + F.select('design.vAlign', 'Vertical position', [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']], d.vAlign) + '</div><p class="big-hint">Long text shrinks by itself to fit inside the border — no Bengali letters get cut off.</p>');
  },

  /* ---------------- COLOURS, BACKGROUND & BORDERS ---------------- */
  colors(s) {
    const d = s.design; const c = 'design.colors.';
    const themes = Object.entries(THEMES).map(([k, t]) => '<button class="swatch' + (d.theme === k ? ' on' : '') + '" data-act="theme" data-arg="' + k + '" style="--a:' + t.bg2 + ';--b:' + t.accent + ';--c:' + t.gold + '"><i></i>' + esc(t.label) + '</button>').join('');
    const group = (title, list) => '<div class="field"><span class="grp">' + title + '</span><div class="g4">' + list.map(([k, l]) => F.color(c + k, l, d.colors[k])).join('') + '</div></div>';
    const themeOpts = [['', 'Same as the show theme']].concat(Object.entries(THEMES).map(([k, x]) => [k, x.label]));
    return F.card('Theme', '<div class="swatches">' + themes + '</div><div class="g2" style="margin-top:.6rem">' + F.select('design.finaleTheme', 'Grand finale theme (final scores, top 3, winner)', themeOpts, d.finaleTheme || '') + '</div><p class="muted">Each round can also have its own theme: Rounds & points → the round → "Stage theme for this round". Suggested: Deep Violet for a special round, Deep Teal for a junior round, Navy · Electric Blue for a speed round, Royal Blue · Lavender for the grand finale.</p><p class="big-hint">For a bright stage or daylight, the "maximum contrast" daylight theme is the clearest. After choosing a theme you can change any colour separately below.</p>') +
      F.card('Text & background colours', group('Text', [['text', 'Main text'], ['muted', 'Secondary text'], ['gold', 'Gold highlight']]) + group('Background', [['bg', 'Background (dark)'], ['bg2', 'Background (light)']]) + '<div class="row" style="margin-top:.5rem">' + F.media('design.bgImage', 'Background picture (optional)', d.bgImage) + '</div>') +
      F.card('Text border & box', '<div class="row">' + F.check('design.box.show', 'Keep text inside a border', d.box.show) + '</div><div class="g4">' + F.color(c + 'neon', 'Border colour (neon)', d.colors.neon) + F.color(c + 'panel', 'Box fill colour', d.colors.panel) + F.range('design.box.width', 'Border thickness', d.box.width, 0.1, 1, 0.02) + F.range('design.box.radius', 'Corner rounding', d.box.radius, 0, 5, 0.1) + F.range(c + 'glow', 'Glow strength', d.colors.glow, 0, 2, 0.1) + F.range('design.box.opacity', 'Box opacity', d.box.opacity, 0.4, 1, 0.02) + '</div>') +
      F.card('Status & timer colours', group('Results', [['correct', 'Correct'], ['wrong', 'Wrong'], ['accent', 'Accent'], ['accent2', 'Accent 2']]) + group('Timer', [['timer', 'Timer ring'], ['warn', 'Warning'], ['crit', 'Urgent (last 5s)']]));
  },

  /* ---------------- ANIMATION & EFFECTS ---------------- */
  effects(s) {
    const d = s.design;
    const corner = F.card('Spinning corner logo & scene-change flash', '<div class="g4">' + F.check('design.corner.show', 'Show spinning logo in the corner', d.corner.show) + F.check('design.corner.spin', 'Logo spins', d.corner.spin) + F.select('design.corner.pos', 'Which corner', [['tr', 'Top right'], ['tl', 'Top left'], ['br', 'Bottom right'], ['bl', 'Bottom left']], d.corner.pos) + F.range('design.corner.size', 'Logo size', d.corner.size, 0.6, 1.8, 0.1) + '</div><div class="g3">' + F.select('design.wipe', 'On scene change', [['sweep', 'Colour sweep + logo (clear, recommended)'], ['flash', 'Light flash (subtle)'], ['none', 'Nothing']], d.wipe) + F.check('settings.crewAuto', '"Our team" cards come in one by one automatically', s.settings.crewAuto) + F.check('design.scoreStrip', 'All team scores at the bottom during questions', d.scoreStrip) + F.num('settings.crewStepMs', 'Gap between cards (milliseconds)', s.settings.crewStepMs, 800, 20000, 100, 'int') + '</div>');
    return corner + F.card('Animation', '<div class="g3">' + F.select('design.textFx', 'Text motion', [['premium', 'Premium 3D (fly-in, depth, gold border light)'], ['classic', 'Classic']], d.textFx || 'premium') + F.select('design.anim', 'Scene change', ANIMS, d.anim) + F.range('design.animSpeed', 'Animation speed', d.animSpeed, 0.4, 2, 0.1) + F.range('design.ringWidth', 'Timer ring thickness', d.ringWidth, 3, 14, 1) + '</div><div class="row">' + F.check('design.motion', 'Motion on', d.motion) + F.check('design.particles', 'Neural particles', d.particles) + F.check('design.rays', 'Light rays', d.rays) + F.check('design.floor', '3D grid floor', d.floor) + '</div>') +
      F.card('Control panel (operator)', '<div class="row">' + F.btn('toggleBigUi', document.body.classList.contains('big-ui') ? 'Big buttons: on' : 'Big buttons: off', '') + F.btn('toggleContrast', document.body.classList.contains('contrast') ? 'High contrast: on' : 'High contrast: off') + '</div>');
  },

  /* ---------------- SCENE ENGINE ---------------- */
  scenes(s) {
    return F.card('Per-scene settings (Scene Engine)', '<p class="big-hint">Choose a separate entry animation, background picture and sound for each scene. Empty = default.</p><div class="list">' + Object.entries(SCENES).map(([k, l]) => { const fx = s.sceneFx[k] || {}; return '<div class="li" style="grid-template-columns:150px 1fr 1fr auto"><b>' + esc(l) + '</b>' + F.select('sceneFx.' + k + '.anim', 'Animation', [['', 'Default']].concat(ANIMS), fx.anim || '') + F.select('sceneFx.' + k + '.cue', 'Sound', [['', 'Default'], ['none', 'No sound']].concat(Object.entries(AUDIO_CUES)), fx.cue || '') + F.media('sceneFx.' + k + '.bg', 'Background', fx.bg || '') + '</div>'; }).join('') + '</div>');
  },

  /* ---------------- MUSIC & SOUND ---------------- */
  audio(s) {
    const a = s.audio;
    const music = Object.entries(MUSIC_SLOTS).map(([k, l]) => { const m = a.music[k]; const p = 'audio.music.' + k + '.'; return '<div class="team-editor"><header><b style="flex:1">' + l + ' — <span class="muted">' + esc(Media.label(m.media)) + '</span></b>' + (AudioDirector.playing(k) ? '<span class="status-pill ok">Playing</span>' : '') + F.btn('music', '▶ Preview', 'sm good', k) + F.btn('musicStop', '■', 'sm', k) + F.btn('musicPick', 'Change', 'sm primary', k) + F.btn('musicReset', 'Back to original', 'sm', k) + F.btn('musicClear', 'Delete', 'sm bad', k) + '</header><div class="g4">' + F.range(p + 'vol', 'Volume', m.vol, 0, 1, 0.05) + F.num(p + 'fadeIn', 'Fade-in (s)', m.fadeIn, 0, 20, 0.5) + F.num(p + 'fadeOut', 'Fade-out (s)', m.fadeOut, 0, 20, 0.5) + F.num(p + 'delay', 'Delay (s)', m.delay, 0, 60, 0.5) + '</div>' + F.check(p + 'loop', 'Loop', m.loop) + '</div>'; }).join('');
    const cues = Object.entries(AUDIO_CUES).map(([k, l]) => { const c = a.cues[k] || { vol: 0.8, mute: false, media: '' }; return '<div class="li" style="grid-template-columns:150px 1fr auto"><b>' + l + '</b><input type="range" min="0" max="1" step="0.05" data-bind="audio.cues.' + k + '.vol" data-type="num" value="' + c.vol + '" aria-label="' + esc(l) + ' volume"><div class="acts">' + F.check('audio.cues.' + k + '.mute', 'Mute', c.mute) + F.btn('cue', '▶', 'sm good', k) + F.btn('cuePick', c.media ? 'File ✓' : 'File', 'sm', k) + (c.media ? F.btn('cueReset', 'Back to synth', 'sm', k) : '') + '</div></div>'; }).join('');
    return F.card('Master audio', '<div class="g3">' + F.range('audio.master', 'Master volume', a.master, 0, 1, 0.05) + F.range('audio.boost', 'Sound effect boost', a.boost, 0.5, 4, 0.1) + F.range('audio.musicBoost', 'Music/theme song boost', a.musicBoost, 0.5, 4, 0.1) + F.range('audio.bgm.questionLevel', 'Background music level during questions', a.bgm.questionLevel, 0, 1, 0.05) + F.check('settings.autoApplause', 'Applause after a correct answer', s.settings.autoApplause) + F.check('audio.themeSting', 'Short theme-song sting at round start', a.themeSting) + F.select('audio.output', 'Play sound on', [['control', 'Control window (recommended)'], ['stage', 'Stage window'], ['both', 'Both']], a.output) + '<div class="field"><span>Test</span>' + F.btn('cue', '🔔 Test sound', 'good', 'correct') + '</div></div>') +
      F.card('Background music (generated, no files needed — V100)', '<div class="row">' + F.check('audio.bgm.on', 'Background music on', a.bgm.on) + F.check('audio.bgm.tagore', 'Tagore instrumental in the first three rounds', a.bgm.tagore) + F.check('audio.countVoice', 'English voice in countdown ("Ten … Go!")', a.countVoice) + '</div><div class="g3">' + F.range('audio.bgm.vol', 'Background music volume', a.bgm.vol, 0, 1, 0.05) + '</div><p class="big-hint">The mood changes by itself with the scene: Calm (intros/rules), Light (question board), Focus (during a question; intense in the last 10 seconds), Suspense (final result), Celebrate (scoreboard & winner). It goes quiet while the theme/welcome song plays and softer during voice. Tagore track: ' + esc(SoundDirector.tagoreStatus) + '</p><div class="deck">' + [['calm', 'Calm'], ['lounge', 'Light'], ['focus', 'Focus'], ['suspense', 'Suspense'], ['celebrate', 'Celebrate']].map(([m, l]) => F.btn('moodPreview', '▶ ' + l, 'sm', m)).join('') + F.btn('moodPreview', '■ Stop preview', 'sm', '') + '</div>') +
      F.card('Speaker test', '<div class="deck">' + F.btn('testTone', '◀ Left', '', '-1') + F.btn('testTone', 'Both', '', '0') + F.btn('testTone', 'Right ▶', '', '1') + '</div>') +
      F.card('Music (theme, welcome, winner, background)', '<div class="list">' + music + '</div>', 'MP3 / WAV / M4A') +
      F.card('Sound effects (Web Audio synthesis — no files needed)', '<div class="list">' + cues + '</div>');
  },

  /* ---------------- VOICE ---------------- */
  voice(s) {
    const voices = Speech.voices.map((v) => [v.name, v.name + ' (' + v.lang + ')' + (/^bn/i.test(v.lang) ? ' ★' : '')]);
    const hasBn = Speech.voices.some((v) => /^bn/i.test(v.lang));
    const sp = s.speech;
    return F.card('Voice (Speech)', (Speech.supported ? '' : '<p class="badge-warn">Voice is not supported in this browser</p>') + (Speech.supported && !hasBn ? '<p class="badge-warn">No Bengali voice found — add a Bengali (India) voice from Windows Settings ▸ Time & Language ▸ Speech.</p>' : '') + '<div class="row">' + F.check('speech.enabled', 'Voice on', sp.enabled) + F.check('speech.autoQuestion', 'Read questions automatically', sp.autoQuestion) + F.check('speech.announceTeam', 'Announce team name', sp.announceTeam) + F.check('speech.rec', '🎙 Play question / options / answer recordings automatically', sp.rec) + '</div><div class="g4">' + F.range('speech.recVol', 'Recording volume', sp.recVol, 0, 1, 0.05) + '</div><p class="muted">If there is a recording in your own voice it plays; otherwise the computer voice is used (when on). In the Edge browser with internet, the "Microsoft Tanishaa Online (Natural) — Bengali" voice sounds almost human; without internet it is not guaranteed — so recordings are the most reliable for the real event.</p><div class="g4">' + F.select('speech.voice', 'Voice', [['', 'Automatic (bn-IN)']].concat(voices), sp.voice) + F.range('speech.rate', 'Speed', sp.rate, 0.5, 1.5, 0.05) + F.range('speech.pitch', 'Pitch', sp.pitch, 0.5, 1.5, 0.05) + F.select('speech.timerVoice', 'Timer announcements', [['off', 'Off'], ['last10', 'Last 10 seconds'], ['marks', '60/50/…/10 and last 5'], ['all', 'Every 10 + last 10']], sp.timerVoice) + '</div><div class="row">' + F.btn('speechTest', '🔊 Test') + F.btn('speak', 'Read question', '', 'question') + F.btn('speak', 'Read answer', '', 'answer') + F.btn('speak', 'Team name', '', 'team') + F.btn('speak', 'Round name', '', 'round') + '</div>');
  },

  /* ---------------- BACKUP & RESET ---------------- */
  backup(s) {
    return F.card('Save & backup', '<div class="deck">' + F.btn('saveNow', '💾 Save now', 'good') + F.btn('exportFull', '⇩ Full backup (with pictures/music)', 'primary span2') + F.btn('exportEvent', '⇩ Data only (JSON)') + F.btn('importFile', '⇧ Import / restore', 'warn') + '</div><p class="big-hint">Every change is saved in the browser straight away. Everything comes back even after a refresh or closing the browser. Keep a full backup before the event.</p>') +
      F.card('New event & reset', '<div class="deck">' + F.btn('resetScores', 'Reset scores', 'warn') + F.btn('resetBoard', 'Reset question board', 'warn') + F.btn('resetLifelines', 'Reset all lifelines', 'warn') + F.btn('newEvent', '✦ New event (erase everything)', 'bad span2') + '</div>');
  },

  /* ---------------- TIMER & FLOW ---------------- */
  flow(s) {
    const st = s.settings;
    return F.card('Timer & flow', '<div class="g4">' + F.num('settings.warnAt', 'Warning (seconds)', st.warnAt, 1, 60, 1, 'int') + F.num('settings.critAt', 'Urgent warning (seconds)', st.critAt, 1, 30, 1, 'int') + F.num('settings.countdownFrom', 'Countdown starts at', st.countdownFrom, 1, 10, 1, 'int') + F.num('settings.countdownStepMs', 'Countdown speed (ms)', st.countdownStepMs, 400, 3000, 50, 'int') + '</div><div class="row">' + F.check('settings.autoTimer', 'Start the direct timer automatically when a question appears', st.autoTimer) + F.check('settings.autoPassTimer', 'Start 45s automatically on pass/challenge', st.autoPassTimer) + F.check('settings.autoRevealOnCorrect', 'Show the answer when correct', st.autoRevealOnCorrect) + F.check('settings.showLifelines', 'Show lifelines on stage', st.showLifelines) + '</div>') +
      F.card('Operator help', '<div class="row">' + F.check('settings.coach', '💡 Show "what to do now" guidance', st.coach) + F.check('settings.operatorVoice', 'Confirm each action out loud on the laptop (not on the TV)', st.operatorVoice) + '</div><div class="g2">' + F.select('settings.keyLayout', 'Keyboard layout', [['v66', 'V66 (new — listed on the Help page)'], ['v100', 'V100 (like the old engine)']], st.keyLayout) + F.select('settings.hostAnswer', 'Show answer on control', [['click', 'Only when the button is pressed (like V100)'], ['always', 'Always']], st.hostAnswer) + '</div>') +
      F.card('Drone delivery', '<div class="g3">' + F.check('settings.drone.main', 'Drone in the main rounds too', st.drone.main) + F.range('settings.drone.speed', 'Speed', st.drone.speed, 0.4, 3, 0.1) + F.select('settings.drone.path', 'Entry path', [['left', 'From the left'], ['right', 'From the right'], ['top', 'From the top']], st.drone.path) + '</div>');
  },

  /* ---------------- TV & SCREEN ---------------- */
  display(s) {
    const d = s.display;
    return F.card('TV & screen', '<div class="deck">' + F.btn('placeStage', '🖥 Open stage on the second screen', 'primary span2') + F.btn('openStage', 'Stage window (O)') + '</div><div class="g3">' + F.select('display.aspect', 'Screen shape', [['16:9', '16:9 (TV — recommended)'], ['16:10', '16:10 (laptop)'], ['4:3', '4:3 (projector)'], ['fill', 'Fill the whole screen']], d.aspect) + F.range('display.safeMargin', 'Safe margin % (if the TV crops the edges)', d.safeMargin, 0, 8, 1) + F.select('display.calib', 'Calibration', [['off', 'Off'], ['bars', 'Colour bars'], ['grid', 'Grid & geometry'], ['ramp', 'Brightness ramp']], d.calib) + '</div><div class="row">' + F.check('display.testCard', 'Show test card', d.testCard) + F.check('display.webgl', '3D WebGL background (on TV)', d.webgl) + F.check('display.strobe', 'Red strobe in rapid fire', d.strobe) + F.check('display.fireworks', 'Fireworks for the winner', d.fireworks) + '</div><p class="big-hint">Keep screen awake (Wake Lock): ' + esc(KeepAwake.state) + '</p>');
  },

  /* ---------------- PRE-SHOW CHECK ---------------- */
  preshow(s) {
    const res = PreShow.run(s);
    const icon = { pass: '✔', warn: '⚠', fail: '✘' };
    return F.card('Pre-show check', '<div class="row">' + F.btn('tab', '↻ Check again', 'primary', 'preshow') + '<span class="muted">' + res.filter((r) => r[0] === 'pass').length + ' / ' + res.length + ' OK</span></div><div class="list" style="margin-top:.5rem">' + res.map(([st, msg]) => '<div class="li" style="grid-template-columns:auto 1fr"><span class="n" style="color:' + (st === 'pass' ? 'var(--correct)' : st === 'warn' ? 'var(--warn)' : 'var(--wrong)') + '">' + icon[st] + '</span><div class="t">' + esc(msg) + '</div></div>').join('') + '</div>');
  },

  /* ---------------- TESTS & LOG ---------------- */
  tests(s) {
    return F.card('Automatic tests (Self-test)', '<div class="row">' + F.btn('runTests', '▶ Run tests', 'primary') + '<span class="muted">Timer, scores, undo, ranking, rendering — without touching the real data</span></div><div id="testOut" class="tests"></div>') +
      F.card('Log', '<div class="log" id="logBox">' + esc(Log.lines.slice(-120).join('\n')) + '</div>');
  },

  /* ---------------- HELP ---------------- */
  help(s) {
    return F.card('Keyboard shortcuts', '<div class="kbd-grid">' + SHORTCUTS.map(([k, d]) => '<div><kbd>' + esc(k) + '</kbd><span>' + esc(d) + '</span></div>').join('') + '</div>') +
      F.card('About', '<p class="big-hint">Quiz Corner V' + VERSION + ' • fully offline • Stage window: add <code>#stage</code> to the end of this file\'s address • Host script: <code>#host</code> • Questions: ' + s.questions.length + ' • Prelim: ' + s.prelim.questions.length + ' • Teams: ' + s.teams.length + '</p>');
  },
};

/* ---------------- Tab actions ---------------- */
Object.assign(Actions, {
  async setMedia(arg) {
    const [path, accept, kind] = String(arg).split('|');
    const id = await pickMedia(accept || 'image/*', kind || 'image');
    if (id) Store.commit('media:' + path, (s) => setPath(s, path, id));
  },
  clearMedia(path) { Store.commit('media-clear:' + path, (s) => setPath(s, path, '')); },
  prelimCount(n) { Store.commit('prelim-count', (s) => { s.prelim.count = int(n, 20); }); },
  prelimQAdd() { Store.commit('prelim-add', (s) => { s.prelim.questions.push({ id: uid('P'), text: '', answer: '', star: (s.prelim.questions.length + 1) % 3 === 0, image: '', source: '' }); if (s.prelim.count < s.prelim.questions.length) s.prelim.count = s.prelim.questions.length; }); },
  prelimQDel(i) { if (!confirm('Delete question ' + (int(i) + 1) + '?')) return; Store.commit('prelim-del', (s) => { s.prelim.questions.splice(int(i), 1); s.teams.forEach((t) => { if (Array.isArray(t.prelim.marks)) t.prelim.marks.splice(int(i), 1); }); }); },
  prelimQMove(arg) { const [i, d] = arg.split('|').map((x) => int(x)); Store.commit('prelim-move', (s) => { const q = s.prelim.questions; const j = i + d; if (j < 0 || j >= q.length) return false; [q[i], q[j]] = [q[j], q[i]]; s.teams.forEach((t) => { const m = t.prelim.marks; [m[i], m[j]] = [m[j], m[i]]; }); }); },
  async prelimImg(i) { const id = await pickMedia('image/*', 'image'); if (id) Store.commit('prelim-img', (s) => { s.prelim.questions[int(i)].image = id; }); },
  finalistToggle(id) {
    Store.commit('finalist-toggle', (s) => {
      const list = s.finalists.length ? s.finalists : Sel.finalistIds();
      s.finalists = list.includes(id) ? list.filter((x) => x !== id) : list.concat([id]);
    });
  },
  finalistMove(arg) { const [id, d] = arg.split('|'); Store.commit('finalist-move', (s) => { const list = s.finalists.length ? s.finalists : Sel.finalistIds(); const i = list.indexOf(id); const j = i + int(d); if (i < 0 || j < 0 || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; s.finalists = list; }); },
  clearFinalists() { Store.commit('finalists-auto', (s) => { s.finalists = []; s.finalistsLocked = false; }); },
  teamAdd() { Store.commit('team-add', (s) => { const n = s.teams.length; const t = defaultTeam(n); let k = n + 1; while (s.teams.some((x) => x.id === t.id)) t.id = 'T' + (++k); s.teams.push(t); }); },
  teamDel(id) { const t = Sel.team(id); if (!t || !confirm('Delete team "' + t.name + '"? (The score history is kept.)')) return; Store.commit('team-del', (s) => { s.teams = s.teams.filter((x) => x.id !== id); s.finalists = s.finalists.filter((x) => x !== id); }); },
  teamMove(arg) { const [id, d] = arg.split('|'); Store.commit('team-move', (s) => { const i = s.teams.findIndex((t) => t.id === id); const j = i + int(d); if (i < 0 || j < 0 || j >= s.teams.length) return false; [s.teams[i], s.teams[j]] = [s.teams[j], s.teams[i]]; }); },
  teamIntroNow(id) { const fin = Sel.finalistIds().includes(id) && Store.state.show.scene !== 'TEAM_INTRO'; const n = (fin ? Sel.finalistIds().indexOf(id) : Sel.teamIndex(id)) + 1; Show.jump(fin ? 'FINALIST_INTRO' : 'TEAM_INTRO', { key: id, teamId: id, n }); },
  lifelineReset(id) { Store.commit('lifeline-reset', (s) => { delete s.lifelines[id]; }); },
  resetLifelines() { Store.commit('lifelines-reset', (s) => { s.lifelines = {}; }); },
  giftCatAdd() { const v = ($('#newCat') || {}).value; if (!v || !v.trim()) return; Store.commit('gift-cat', (s) => { if (!s.giftCategories.includes(v.trim())) s.giftCategories.push(v.trim()); }); },
  giftCatDel(i) { Store.commit('gift-cat-del', (s) => { s.giftCategories.splice(int(i), 1); }); },
  ledgerDel(id) { Game.removeEntry(id); },
  correction() { const t = ($('#corrTeam') || {}).value; const v = int(($('#corrVal') || {}).value, 0); const why = (($('#corrWhy') || {}).value || '').trim() || 'সংশোধন'; if (!t || !v) { UI.toast('Enter a team and points', 'err'); return; } Game.adjust(t, v, why); },
  prelimRulesSuggest() { Store.commit('prelim-rules', (s) => { s.prelim.rules = 'বাছাই পর্ব: ' + bn(s.prelim.count) + 'টি প্রশ্ন। দলগুলি উত্তরপত্রে উত্তর লিখবে। কোনো বিকল্প দেখানো হবে না, পাসও নেই। প্রতিটি সঠিক উত্তরে ' + bn(s.prelim.points) + ' নম্বর। উত্তরপত্র জমা নেওয়ার পর একে একে সঠিক উত্তর দেখানো হবে। তারকাচিহ্নিত (★) প্রশ্ন টাই হলে আগে গোনা হবে।'; }); },
  qUnused(id) { Store.commit('q-unused', (s) => { delete s.board.played[id]; }); },
  setTimeAll() { const v = int(($('#allTime') || {}).value, 0); if (v < 5 || v > 600) { UI.toast('Enter 5–600 seconds', 'err'); return; } const f = UI.qFilter; Store.commit('time-all', (s) => { s.questions.forEach((q) => { if (!f || q.roundId === f) q.timer = v; }); }); UI.toast('Time applied: ' + v + 's', 'ok'); },
  setTimeClear() { const f = UI.qFilter; Store.commit('time-clear', (s) => { s.questions.forEach((q) => { if (!f || q.roundId === f) q.timer = null; }); }); },
  shuffleAnswers() {
    if (!confirm('Shuffle the answer positions? The correct answer stays correct (can be undone).')) return;
    const f = UI.qFilter;
    Store.commit('shuffle', (s) => { s.questions.forEach((q) => {
      if (f && q.roundId !== f) return;
      const opts = q.options.map((o, i) => ({ o, i })).filter((x) => x.o);
      if (opts.length < 2 || q.answerText) return;
      let h = 0; for (const c of q.id + q.text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      for (let i = opts.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const right = q.options[q.answer];
      q.options = opts.map((x) => x.o).concat(['', '', '', '']).slice(0, 4);
      q.answer = Math.max(0, q.options.indexOf(right));
    }); });
    UI.toast('Answer positions shuffled', 'ok');
  },
  resetScores() { if (!confirm('Set every team\'s score to zero? (Can be undone.)')) return; Store.commit('reset-scores', (s) => { s.ledger = []; s.board.prevRanks = {}; }); },
  resetBoard() { Store.commit('reset-board', (s) => { s.board.played = {}; s.rounds.forEach((r) => { r.turn = 0; r.turnsTaken = []; }); }); },
  qFilter(rid) { UI.qFilter = rid || ''; UI.renderTab(true); },
  qEdit(id) { UI.qEdit = id || ''; UI.renderTab(true); if (id) window.scrollTo({ top: 0, behavior: 'smooth' }); },
  qNew() { const rid = UI.qFilter || (Sel.currentRound() || {}).id || 'R1'; const id = uid('Q'); Store.commit('q-new', (s) => { s.questions.push(Object.assign(questionFromSeed({ id, roundId: rid, number: Sel.roundQuestions(rid).length + 1, options: ['', '', '', ''] }, s.questions.length), { id })); }); UI.qEdit = id; UI.renderTab(true); },
  qDup(id) { const q = Sel.question(id); if (!q) return; const nid = uid('Q'); Store.commit('q-dup', (s) => { const c = clone(q); c.id = nid; c.number = Sel.roundQuestions(q.roundId).length + 1; s.questions.push(c); }); UI.qEdit = nid; UI.renderTab(true); },
  qDel(id) { const q = Sel.question(id); if (!q || !confirm('Delete question ' + q.number + '?')) return; Store.commit('q-del', (s) => { s.questions = s.questions.filter((x) => x.id !== id); }); if (UI.qEdit === id) UI.qEdit = ''; },
  qMove(arg) { const [id, d] = arg.split('|'); const q = Sel.question(id); if (!q) return; const list = Sel.roundQuestions(q.roundId); const i = list.indexOf(q); const o = list[i + int(d)]; if (!o) return; Store.commit('q-move', () => { const n = q.number; q.number = o.number; o.number = n; if (q.number === o.number) q.number += int(d); }); },
  roundMove(arg) { const [id, d] = arg.split('|'); Store.commit('round-move', (s) => { const i = s.rounds.findIndex((r) => r.id === id); const j = i + int(d); if (i < 0 || j < 0 || j >= s.rounds.length) return false; [s.rounds[i], s.rounds[j]] = [s.rounds[j], s.rounds[i]]; }); },
  roundShow(id) { Show.jump('ROUND_INTRO', { key: id, roundId: id }); },
  roundResetTurn(id) { Store.commit('round-turn', (s) => { const r = s.rounds.find((x) => x.id === id); if (r) { r.turn = 0; r.turnsTaken = []; } }); },
  theme(k) { const t = THEMES[k]; if (!t) return; Store.commit('theme', (s) => { s.design.theme = k; s.design.colors = Object.assign({}, t); }); },
  setAlign(a) { Actions.textAlign(a, null, 'question'); },
  textEl(k) { UI.textEl = k; UI.renderTab(true); },
  textToggle(k) { const el = UI.textEl || 'question'; Store.commit('text-' + k, (s) => { s.design.text[el][k] = !s.design.text[el][k]; }); },
  textAlign(a, _el, which) { const el = which || UI.textEl || 'question'; Store.commit('text-align', (s) => { s.design.text[el].align = a; }); },
  textSize(d) { const el = UI.textEl || 'question'; Store.commit('text-size', (s) => { const t = s.design.text[el]; t.size = Math.round(clamp(t.size + num(d), 0.5, 2) * 100) / 100; }); },
  textColorReset() { const el = UI.textEl || 'question'; Store.commit('text-color', (s) => { s.design.text[el].color = ''; }); },
  textReset() { const el = UI.textEl || 'question'; Store.commit('text-reset', (s) => { s.design.text[el] = defaultTextStyles()[el]; }); },
  toggleBigUi() { document.body.classList.toggle('big-ui'); UI.savePref('bigUi', document.body.classList.contains('big-ui')); UI.renderTab(true); },
  toggleContrast() { document.body.classList.toggle('contrast'); UI.renderTab(true); },
  galleryUpload() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => { const ids = []; for (const f of Array.from(inp.files || [])) { try { ids.push(await Media.add(f, 'image')); } catch (e) { UI.toast(e.message, 'err'); } } if (ids.length) { Store.commit('gallery-add', (s) => { s.gallery.push(...ids); }); UI.toast(ids.length + ' picture(s) added', 'ok'); } };
    inp.click();
  },
  galleryAddId(id) { Store.commit('gallery-add', (s) => { if (!s.gallery.includes(id)) s.gallery.push(id); }); },
  galleryShow(id) { Show.jump('GRAPHIC', { key: id, media: id }); },
  galleryUse(arg) { const [id, path] = arg.split('|'); Store.commit('gallery-use', (s) => setPath(s, path, id)); UI.toast('Applied', 'ok'); },
  galleryDel(id) { Store.commit('gallery-del', (s) => { s.gallery = s.gallery.filter((x) => x !== id); }); },
  async mediaDel(id) { if (!confirm('Delete this file permanently? Wherever it is used will show empty.')) return; await Media.remove(id); UI.renderTab(true); },
  logoReset() { Store.commit('logo-reset', (s) => { s.logo = 'asset:logo'; }); },
  crewAdd() { Store.commit('crew-add', (s) => { s.crew.push({ name: '', role: '', photo: '' }); }); },
  crewDel(i) { const c = Store.state.crew[int(i)]; if (!c || !confirm('Remove "' + (c.name || 'this member') + '" from the organising team? (Ctrl+Z brings it back)')) return; Store.commit('crew-del', (s) => { s.crew.splice(int(i), 1); }); },
  /** Records one reading from the laptop microphone, shows the words to read, lets the host listen before keeping it. */
  recOpen(path) {
    const qPath = path.replace(/\.voice\w+$/, ''); const field = path.split('.').pop();
    const q = getPath(Store.state, qPath); if (!q) return;
    Rec.path = path; Rec.blob = null;
    const slot = VOICE_SLOTS.find((x) => x[0] === field) || VOICE_SLOTS[0];
    UI.modal('🎙 Record — ' + ((Sel.round(q.roundId) || {}).name || q.roundId) + ', question ' + q.number + ' • ' + slot[1], '<p class="muted">Keep your mouth close to the microphone and read clearly. You don\'t have to read every word — saying the main point in your own words is fine.</p><div class="rec-script">' + esc(voiceScript(q, field)) + '</div><div class="rec-state" id="recState">Ready</div><div class="deck">' + F.btn('recStart', '⏺ Start recording', 'lg bad', '') + F.btn('recStop', '■ Stop', 'lg', '') + F.btn('recPlay', '▶ Listen back', 'lg', '') + F.btn('recSave', '✔ Keep this', 'lg good', '') + '</div>');
  },
  async recStart() {
    if (Rec.mr && Rec.mr.state === 'recording') return;
    const st = (t) => { const el = document.getElementById('recState'); if (el) el.textContent = t; };
    if (!navigator.mediaDevices || !window.MediaRecorder) { st('This browser cannot record — record on a phone and add the mp3'); return; }
    try { Rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (e) { st('No microphone found — allow the microphone from the 🎙 next to the browser address bar'); Log.err('mic', e); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    Rec.chunks = []; Rec.blob = null;
    Rec.mr = new MediaRecorder(Rec.stream, type ? { mimeType: type } : undefined);
    Rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) Rec.chunks.push(e.data); };
    Rec.mr.onstop = () => { clearInterval(Rec.iv); Rec.blob = new Blob(Rec.chunks, { type: (Rec.mr.mimeType || 'audio/webm').split(';')[0] }); if (Rec.url) URL.revokeObjectURL(Rec.url); Rec.url = URL.createObjectURL(Rec.blob); Rec.stream.getTracks().forEach((t) => t.stop()); st('✔ Recorded (' + Math.round((Date.now() - Rec.t0) / 1000) + ' s) — listen back, then "Keep this" if it is fine'); };
    Rec.mr.start(); Rec.t0 = Date.now();
    Rec.iv = setInterval(() => st('⏺ Recording… ' + Math.round((Date.now() - Rec.t0) / 1000) + ' s'), 250);
  },
  recStop() { if (Rec.mr && Rec.mr.state === 'recording') Rec.mr.stop(); },
  recPlay() { if (Rec.url) new Audio(Rec.url).play().catch(() => {}); },
  async recSave() {
    if (!Rec.blob || !Rec.blob.size) { UI.toast('Record something first', 'err'); return; }
    const q = getPath(Store.state, Rec.path.replace(/\.voice\w+$/, '')); const field = Rec.path.split('.').pop();
    const ext = /ogg/.test(Rec.blob.type) ? '.ogg' : /mp4/.test(Rec.blob.type) ? '.m4a' : '.webm';
    const name = q.roundId + '-' + q.number + { voiceQ: '', voiceOpt: '-opt', voiceAns: '-ans' }[field] + ext;
    try {
      const id = await Media.add(new File([Rec.blob], name, { type: Rec.blob.type }), 'audio');
      const path = Rec.path;
      Store.commit('voice-rec:' + path, (s) => setPath(s, path, id));
      UI.closeModal(); UI.toast('Recording kept ✓', 'ok');
    } catch (e) { UI.toast(e.message || 'Could not keep it', 'err'); }
  },
  voicePreview(id) { Media.url(id).then((u) => { if (u) new Audio(u).play().catch(() => {}); }); },
  /** A text list of every recording to make: file name and the words to read, for the main rounds. */
  voiceList() {
    const lines = ['Quiz Corner — question reading recording list', 'Record on a phone and name each file exactly like this, then add them all at once with Questions tab ▸ "All pictures / audio / video at once".', 'Read the words after the colon (they are in Bengali, as the audience will hear them).', ''];
    Store.state.rounds.filter((r) => r.enabled).forEach((r, ri) => {
      lines.push('==== Round ' + (ri + 1) + ' — ' + r.name + ' ====');
      Sel.roundQuestions(r.id).forEach((q) => {
        const base = r.id + '-' + q.number; // the same name the "all at once" button reads back
        lines.push(base + '.mp3  (question' + (q.voiceQ ? ', done ✔' : '') + '): ' + voiceScript(q, 'voiceQ'));
        if (r.features.options && q.options.filter(Boolean).length > 1) lines.push(base + '-opt.mp3  (options' + (q.voiceOpt ? ', done ✔' : '') + '): ' + voiceScript(q, 'voiceOpt'));
        lines.push(base + '-ans.mp3  (answer' + (q.voiceAns ? ', done ✔' : '') + '): ' + voiceScript(q, 'voiceAns'));
        lines.push('');
      });
    });
    download('recording-list-' + stamp() + '.txt', new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }));
  },
  /** All pictures / sounds / videos for the questions in one go: a file named R1-5.jpg goes to round 1, question 5. */
  qMediaBulk() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm';
    inp.onchange = async () => {
      const files = Array.from(inp.files || []); if (!files.length) return;
      const done = []; const skipped = [];
      for (const f of files) {
        const m = bulkMediaTarget(f.name);
        const q = m && Store.state.questions.find((x) => x.roundId === 'R' + m.round && x.number === m.n);
        if (!q) { skipped.push(f.name); continue; }
        const kind = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name) ? 'image' : /^audio\//.test(f.type) || /\.(mp3|wav|m4a|ogg)$/i.test(f.name) ? 'audio' : 'video';
        try {
          const id = await Media.add(f, kind);
          const field = kind === 'image' ? 'image' : kind === 'audio' && m.voice !== 'clip' ? VOICE_FIELD[m.voice] : 'clip';
          Store.commit('bulk-media', (s) => { const t = s.questions.find((x) => x.id === q.id); t[field] = id; });
          const what = { image: 'picture', clip: 'clip', voiceQ: 'question reading', voiceOpt: 'options reading', voiceAns: 'answer reading' }[field];
          done.push(f.name + ' → round ' + m.round + ', question ' + m.n + ' (' + what + ')');
        } catch (e) { skipped.push(f.name + ' (' + (e.message || 'could not open') + ')'); }
      }
      UI.modal('Pictures / audio / video at once', '<p class="ok">' + done.length + ' file(s) placed on questions.</p>' + (done.length ? '<div class="list" style="max-height:30vh;overflow:auto">' + done.map((x) => '<div class="li">✔ ' + esc(x) + '</div>').join('') + '</div>' : '') + (skipped.length ? '<p class="badge-warn">' + skipped.length + ' file name(s) did not say which question — name files like this: R1-5.jpg (round 1, question 5 — picture), R1-5.mp3 (question reading), R1-5-opt.mp3 (options), R1-5-ans.mp3 (answer), R1-5-clip.mp3 (sound clip)</p><div class="list">' + skipped.map((x) => '<div class="li">✘ ' + esc(x) + '</div>').join('') + '</div>' : ''));
    };
    inp.click();
  },
  async musicPick(slot) { const id = await pickMedia('audio/*,.mp3,.wav,.m4a', 'audio'); if (id) Store.commit('music-pick', (s) => { s.audio.music[slot].media = id; }); },
  musicReset(slot) { Store.commit('music-reset', (s) => { s.audio.music[slot].media = { theme: 'asset:theme', welcome: 'asset:welcome' }[slot] || ''; }); },
  musicClear(slot) { Cue.music(slot, 'stop'); Store.commit('music-clear', (s) => { s.audio.music[slot].media = ''; }); },
  async cuePick(name) { const id = await pickMedia('audio/*,.mp3,.wav,.m4a', 'audio'); if (id) Store.commit('cue-pick', (s) => { s.audio.cues[name].media = id; }); },
  cueReset(name) { Store.commit('cue-reset', (s) => { s.audio.cues[name].media = ''; }); },
  speechTest() { AudioDirector.unlock(); Speech.say('খেজুরি কুইজ কর্নারে আপনাদের স্বাগত। জ্ঞানই শক্তি।', 'test', true); },
  saveNow() { Store.persist(); UI.toast(Store.storageOk ? 'Saved ✓' : 'Save failed — download a backup', Store.storageOk ? 'ok' : 'err'); },
  rehearsalOn(withTest) { Store.enterRehearsal(withTest === '1'); UI.toast('Rehearsal started — the real event is safely saved', 'ok'); },
  rehearsalOff() { Store.exitRehearsal(); UI.toast('Rehearsal ended — back to the real event', 'ok'); },
  newEvent() {
    if (!confirm('Start a new event? The current teams, scores and edits will be erased (take a backup first).')) return;
    if (!confirm('Are you sure? This can be undone.')) return;
    Store.replace(defaultState(), 'new-event');
    UI.toast('New event ready', 'ok');
  },
  exportEvent() { download('quiz-corner-event-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'event', version: VERSION, state: Store.state }, null, 1)); },
  exportQuestions() { download('quiz-corner-questions-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'questions', questions: Store.state.questions, prelim: Store.state.prelim.questions, rounds: Store.state.rounds.map((r) => ({ id: r.id, name: r.name })) }, null, 1)); },
  async exportFull() {
    UI.toast('Creating backup…');
    const media = {};
    for (const m of Media.index) { const d = await Media.toDataURL(m.id); if (d) media[m.id] = { name: m.name, kind: m.kind, data: d }; }
    PreShow.backupDone = true;
    download('quiz-corner-FULL-backup-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'full', version: VERSION, state: Store.state, media }));
    UI.toast('Full backup downloaded', 'ok');
  },
  importFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { await Importer.run(JSON.parse(await f.text())); } catch (e) { UI.toast('Import failed: ' + (e.message || e), 'err'); Log.err('import', e); }
    };
    inp.click();
  },
  runTests() { const out = $('#testOut'); if (out) out.innerHTML = '<p>Running…</p>'; SelfTest.run().then((res) => { if (out) out.innerHTML = SelfTest.html(res); }); },
});

function stamp() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); }
function download(name, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------------- IMPORT / EXPORT ---------------- */
const Importer = {
  async run(data) {
    if (Array.isArray(data)) { this.questions(data); return; }
    if (!isObj(data)) throw new Error('Unrecognised file');
    if (Legacy.isV100(data)) {
      if (!confirm('Old Quiz Corner V100 backup found. Bring its teams, photos, questions, scores and organising team into the new engine? (The current event will be replaced — can be undone)')) return;
      Store.replace(await Legacy.convert(data), 'import-v100');
      UI.toast('V100 backup import complete', 'ok');
      return;
    }
    if (data.qc66 && data.kind === 'questions') { this.questions(arr(data.questions), arr(data.prelim)); return; }
    if (data.qc66 && data.state) {
      if (!confirm('Replace the current event with this file? (Can be undone.)')) return;
      if (isObj(data.media)) { for (const [id, m] of Object.entries(data.media)) { try { await Media.putDataURL(id, m.name, m.kind, m.data); } catch (e) { Log.err('import-media', e); } } }
      Store.replace(data.state, 'import');
      UI.toast('Import complete', 'ok');
      return;
    }
    if (Array.isArray(data.questions)) { this.questions(data.questions, arr(data.prelim)); return; }
    throw new Error('No questions or event found in this JSON');
  },
  questions(list, prelim = []) {
    const qs = list.filter(isObj).map((q, i) => questionFromSeed(Object.assign({}, q, { id: q.id || uid('Q') }), i));
    const mode = confirm('OK = add to the existing questions\nCancel = replace all questions');
    Store.commit('import-questions', (s) => {
      const ids = new Set(s.questions.map((q) => q.id));
      qs.forEach((q) => { if (mode && ids.has(q.id)) q.id = uid('Q'); });
      s.questions = mode ? s.questions.concat(qs) : qs;
      if (prelim.length) s.prelim.questions = prelim.filter(isObj).map((p) => ({ id: p.id || uid('P'), text: str(p.text), answer: str(p.answer), star: !!p.star, image: str(p.image), source: str(p.source) }));
    });
    UI.toast(qs.length + ' question(s) imported', 'ok');
  },
};
