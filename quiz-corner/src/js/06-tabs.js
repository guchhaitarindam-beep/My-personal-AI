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
    return '<div class="photo-slot"><div class="thumb">' + (val && isImg ? '<img data-media="' + esc(val) + '" alt="">' : (val ? '♪' : '—')) + '</div><b>' + label + '</b><small class="muted">' + esc(val ? Media.label(val) : 'খালি') + '</small><div class="row"><button class="btn sm primary" data-act="setMedia" data-arg="' + esc(path + '|' + accept + '|' + kind) + '">' + (val ? 'বদলান' : 'যোগ করুন') + '</button>' + (val ? '<button class="btn sm" data-act="clearMedia" data-arg="' + esc(path) + '">মুছুন</button>' : '') + '</div></div>';
  },
  btn(act, label, cls = '', arg = '') { return '<button class="btn ' + cls + '" data-act="' + act + '"' + (arg !== '' ? ' data-arg="' + esc(arg) + '"' : '') + '>' + label + '</button>'; },
  card(title, body, hint = '') { return '<div class="card"><h3>' + title + (hint ? ' <span class="hint">' + hint + '</span>' : '') + '</h3>' + body + '</div>'; },
};
const fontOpts = () => FONT_CHOICES.map((f) => f[0]);
const TEXT_ELEMENTS = [['question', 'প্রশ্ন'], ['option', 'বিকল্প (ক–ঘ)'], ['title', 'শিরোনাম'], ['team', 'দলের নাম'], ['answer', 'উত্তর']];
const TEXT_SAMPLES = { question: 'বিশ্বের বৃহত্তম ম্যানগ্রোভ অরণ্যের নাম কী?', option: 'ক) সুন্দরবন', title: 'রাউন্ড ১ • মজার মিশেল', team: 'দল ১ — উত্তর কলমদান', answer: 'সঠিক উত্তর: সুন্দরবন' };

const TabRender = {
  /* ---------------- SHOW ---------------- */
  show(s) {
    const rd = Show.rundown(); const ci = Show.index();
    const list = rd.map((st, i) => '<div class="rd' + (i === ci ? ' cur' : '') + '" data-act="goStep" data-arg="' + i + '" role="button" tabindex="0"><span class="i">' + bn(i + 1) + '</span><span>' + esc(st.label) + '</span><span class="k">' + esc(st.scene) + '</span></div>').join('');
    const jumps = [['ORGANIZER', 'ব্যানার'], ['LOGO', 'লোগো'], ['PROGRAMME', 'অনুষ্ঠান'], ['THEME', 'থিম সং'], ['TEAMS_ALL', 'সব দল'], ['PRELIM_RESULT', 'বাছাই ফল'], ['FINALISTS', 'চূড়ান্ত ৮'], ['WELCOME', 'স্বাগত'], ['PODIUM', 'পোডিয়াম'], ['MAIN_COUNTDOWN', 'কাউন্টডাউন'], ['SCOREBOARD', 'স্কোরবোর্ড'], ['FINAL', 'চূড়ান্ত ফল'], ['WINNER', 'বিজয়ী'], ['END', 'সমাপনী']];
    const gallery = s.gallery.length ? '<div class="deck">' + s.gallery.map((id) => '<button class="btn" data-act="galleryShow" data-arg="' + esc(id) + '"><span class="thumb" style="width:34px;height:34px"><img data-media="' + esc(id) + '" alt=""></span> দেখাও</button>').join('') + '</div>' : '<p class="muted">মিডিয়া ট্যাবে গ্যালারিতে ছবি যোগ করুন।</p>';
    return F.card('রানডাউন (সম্পূর্ণ অনুষ্ঠানক্রম)', '<div class="rundown" data-keep-scroll="rd">' + list + '</div>', 'ক্লিক করলে সেই দৃশ্য স্টেজে যাবে') +
      F.card('দ্রুত যাও', '<div class="deck">' + jumps.map(([k, l]) => F.btn('jump', l, '', k)).join('') + '</div>') +
      F.card('সংগীত', '<div class="deck">' + Object.entries(MUSIC_SLOTS).map(([k, l]) => F.btn('music', '▶ ' + l, 'good', k) + F.btn('musicStop', '■ ' + l, '', k)).join('') + '</div>') +
      F.card('গ্রাফিক্স গ্যালারি', gallery) +
      F.card('রিহার্সাল মোড', '<p class="big-hint">রিহার্সালে আসল ইভেন্টের স্কোর ও ডেটা অক্ষত থাকে। শেষে "রিহার্সাল বন্ধ" করলে সব আগের অবস্থায় ফিরে যায়।</p><div class="deck">' + (Store.rehearsal ? F.btn('rehearsalOff', '■ রিহার্সাল বন্ধ করুন', 'bad span2') : F.btn('rehearsalOn', '▶ রিহার্সাল (আসল প্রশ্ন)', 'warn', '0') + F.btn('rehearsalOn', '▶ রিহার্সাল (পরীক্ষামূলক প্রশ্ন)', 'warn', '1')) + '</div>');
  },

  /* ---------------- PRELIM ---------------- */
  prelim(s) {
    const p = s.prelim;
    const qs = Sel.prelimQuestions();
    const settings = '<div class="g4">' + F.num('prelim.count', 'প্রশ্ন সংখ্যা', p.count, 1, 100, 1, 'int') + F.num('prelim.points', 'প্রতি প্রশ্নে নম্বর', p.points, 0, 100, 1, 'int') + F.num('prelim.finalistCount', 'চূড়ান্ত দল', p.finalistCount, 2, 12, 1, 'int') + '<div class="field"><span>দ্রুত সংখ্যা</span><div class="row">' + [10, 15, 20, 25, 30].map((n) => F.btn('prelimCount', bn(n), 'sm' + (p.count === n ? ' on' : ''), String(n))).join('') + '</div></div></div><div class="row" style="margin-top:.5rem">' + F.check('prelim.drone', 'ড্রোন দিয়ে প্রশ্ন আনা', p.drone) + '</div>' + F.area('prelim.rules', 'বাছাই পর্বের নিয়ম', p.rules, 5);
    const testNote = qs.some((q) => q.source === 'test') ? '<p class="badge-warn">⚠ কিছু প্রশ্ন (উৎস: পরীক্ষামূলক ব্যাংক) পূর্বনির্ধারিত ২০টি পূরণ করতে যোগ হয়েছে — প্রয়োজনে বদলে নিন।</p>' : '';
    const rows = qs.map((q, i) => {
      const live = s.show.scene === 'PRELIM_Q' && s.prelimLive.idx === i;
      return '<div class="li' + (live ? ' active' : '') + '" style="grid-template-columns:auto 1fr"><span class="n">' + bn(i + 1) + (q.star ? '★' : '') + '</span><div class="t" style="display:flex;flex-direction:column;gap:.35rem">' +
        '<textarea rows="2" data-bind="prelim.questions.' + i + '.text" aria-label="প্রশ্ন ' + (i + 1) + '">' + esc(q.text) + '</textarea>' +
        '<div class="row"><input type="text" data-bind="prelim.questions.' + i + '.answer" value="' + esc(q.answer) + '" placeholder="উত্তর" style="flex:2 1 180px" aria-label="উত্তর ' + (i + 1) + '">' + F.check('prelim.questions.' + i + '.star', '★ তারকা', q.star, true) + (q.source === 'test' ? '<span class="badge-warn">পরীক্ষামূলক</span>' : '') + '</div>' +
        '<div class="row">' + F.btn('prelimShow', '❓ প্রশ্ন ' + bn(i + 1) + ' দেখাও', 'sm primary', String(i)) + F.btn('prelimReveal', '✅ উত্তর ' + bn(i + 1) + ' (ANSWER)', 'sm gold', String(i)) + F.btn('prelimImg', q.image ? '🖼 ছবি বদলান' : '🖼 ছবি', 'sm', String(i)) + (q.image ? F.btn('clearMedia', 'ছবি মুছুন', 'sm', 'prelim.questions.' + i + '.image') : '') + F.btn('prelimQMove', '↑', 'sm', i + '|-1') + F.btn('prelimQMove', '↓', 'sm', i + '|1') + F.btn('prelimQDel', '🗑', 'sm bad', String(i)) + '</div></div></div>';
    }).join('');
    const missing = p.count - qs.length;
    const list = rows + (missing > 0 ? '<p class="badge-warn">⚠ আরও ' + bn(missing) + 'টি প্রশ্ন দরকার।</p>' : '') + '<div class="row">' + F.btn('prelimQAdd', '+ নতুন বাছাই প্রশ্ন', 'primary') + '</div>';
    // Marking matrix: teams × questions
    const head = '<tr><th>দল</th>' + qs.map((q, i) => '<th class="' + (q.star ? 'star' : '') + '">' + bn(i + 1) + (q.star ? '★' : '') + '</th>').join('') + '<th>নম্বর</th><th>★</th><th>ম্যানুয়াল নম্বর</th><th>ম্যানুয়াল ★</th></tr>';
    const body = s.teams.map((t, ti) => {
      const r = Sel.prelimResult(t);
      return '<tr><td>' + esc(t.name) + '</td>' + qs.map((q, qi) => '<td><input type="checkbox" aria-label="' + esc(t.name) + ' প্রশ্ন ' + (qi + 1) + '" data-bind="teams.' + ti + '.prelim.marks.' + qi + '" data-rerender="1"' + (r.marks[qi] ? ' checked' : '') + '></td>').join('') + '<td><b>' + bn(r.score) + '</b></td><td>' + bn(r.stars) + '</td><td><input type="number" style="width:80px;min-height:30px" data-bind="teams.' + ti + '.prelim.manual" data-type="nullnum" data-rerender="1" value="' + esc(t.prelim.manual == null ? '' : t.prelim.manual) + '"></td><td><input type="number" style="width:70px;min-height:30px" data-bind="teams.' + ti + '.prelim.stars" data-type="nullnum" data-rerender="1" value="' + esc(t.prelim.stars == null ? '' : t.prelim.stars) + '"></td></tr>';
    }).join('');
    const ranking = Sel.prelimRanking();
    const finalIds = Sel.finalistIds();
    const rankHtml = ranking.map((r) => '<div class="li' + (finalIds.includes(r.team.id) ? ' active' : '') + '"><span class="n">' + bn(r.rank) + '</span><div class="t"><b>' + esc(r.team.name) + '</b> <span class="muted">' + esc(r.team.school) + '</span><small>' + bn(r.score) + ' নম্বর • ★' + bn(r.stars) + '</small></div><div class="acts">' + F.btn('finalistToggle', finalIds.includes(r.team.id) ? '✓ চূড়ান্ত' : '+ চূড়ান্তে যোগ', 'sm ' + (finalIds.includes(r.team.id) ? 'good' : ''), r.team.id) + '</div></div>').join('');
    const finals = finalIds.map((id, i) => { const ti = Sel.teamIndex(id); const t = s.teams[ti]; if (!t) return ''; return '<div class="li" style="--team:' + esc(t.color) + '"><span class="n">' + bn(i + 1) + '</span><div class="g2">' + F.text('teams.' + ti + '.name', 'দলের নাম', t.name) + F.text('teams.' + ti + '.school', 'বিদ্যালয়', t.school) + '</div><div class="acts">' + F.btn('finalistMove', '↑', 'sm', id + '|-1') + F.btn('finalistMove', '↓', 'sm', id + '|1') + F.btn('finalistToggle', '✕', 'sm bad', id) + '</div></div>'; }).join('');
    return F.card('বাছাই পর্ব — সেটিংস', settings) + F.card('বাছাই প্রশ্ন ও ডেডিকেটেড উত্তর বোতাম', testNote + '<div class="list">' + list + '</div>', 'প্রতিটি প্রশ্নের নিজস্ব ANSWER বোতাম') +
      F.card('উত্তরপত্র মূল্যায়ন (টিক = সঠিক)', '<div class="matrix" data-keep-scroll="mx"><table>' + head + body + '</table></div><p class="big-hint">টাই হলে: বেশি ★ সঠিক ▸ প্রশ্নক্রমে আগে সঠিক ▸ নিবন্ধনক্রম। ম্যানুয়াল নম্বর দিলে টিকের হিসাব উপেক্ষিত হবে।</p>') +
      F.card('র‍্যাঙ্কিং ও চূড়ান্ত নির্বাচন', '<div class="list" data-keep-scroll="rank" style="max-height:50vh;overflow:auto">' + rankHtml + '</div><div class="deck" style="margin-top:.6rem">' + F.btn('confirmFinalists', '✓ শীর্ষ ' + bn(p.finalistCount) + ' স্বয়ংক্রিয় নির্বাচন', 'good span2') + F.btn('clearFinalists', '↺ স্বয়ংক্রিয়তে ফেরত') + '</div>', s.finalists.length ? 'ম্যানুয়ালি নিশ্চিত' : 'স্বয়ংক্রিয় (র‍্যাঙ্ক অনুযায়ী)') +
      F.card('চূড়ান্ত দল — নাম সম্পাদনা ও ক্রম', '<div class="list">' + finals + '</div>');
  },

  /* ---------------- TEAMS ---------------- */
  teams(s) {
    const ed = s.teams.map((t, i) => {
      const r = 'teams.' + i;
      const fin = Sel.finalistIds().includes(t.id);
      return '<div class="team-editor" style="--team:' + esc(t.color) + '"><header><span class="thumb" style="--team:' + esc(t.color) + '">' + (t.photo ? '<img data-media="' + esc(t.photo) + '" alt="">' : bn(i + 1)) + '</span><b style="flex:1">' + bn(i + 1) + '. ' + esc(t.name) + (fin ? ' <span class="status-pill ok">চূড়ান্ত</span>' : '') + '</b><span class="pts gold">' + bn(Sel.score(t.id)) + ' পয়েন্ট</span>' +
        F.btn('teamIntroNow', '▶ পরিচিতি', 'sm', t.id) + F.btn('teamMove', '↑', 'sm', t.id + '|-1') + F.btn('teamMove', '↓', 'sm', t.id + '|1') + F.btn('teamDel', '🗑', 'sm bad', t.id) + '</header>' +
        '<div class="g3">' + F.text(r + '.name', 'দলের নাম', t.name) + F.text(r + '.school', 'বিদ্যালয়', t.school) + F.color(r + '.color', 'দলের রং', t.color) + F.text(r + '.captain', 'অধিনায়ক', t.captain) + F.text(r + '.players.0', 'খেলোয়াড় ১', t.players[0]) + F.text(r + '.players.1', 'খেলোয়াড় ২', t.players[1]) + F.text(r + '.players.2', 'খেলোয়াড় ৩', t.players[2]) + '</div>' +
        '<div class="g4">' + F.media(r + '.photo', 'দলের ছবি', t.photo) + F.media(r + '.playerPhotos.0', 'খেলোয়াড় ১', t.playerPhotos[0]) + F.media(r + '.playerPhotos.1', 'খেলোয়াড় ২', t.playerPhotos[1]) + F.media(r + '.playerPhotos.2', 'খেলোয়াড় ৩', t.playerPhotos[2]) + '</div>' +
        '<div class="g3">' + F.select(r + '.gift.category', 'বিশেষ উপস্থাপনা — বিভাগ', s.giftCategories.concat(s.giftCategories.includes(t.gift.category) || !t.gift.category ? [] : [t.gift.category]), t.gift.category) + F.text(r + '.gift.item', 'বিষয় (যেমন: আম, রবীন্দ্রনাথ)', t.gift.item) + F.media(r + '.gift.image', 'বিষয়ের ছবি', t.gift.image) + '</div>' +
        '<div class="row">' + F.media(r + '.emblem', 'লোগো/প্রতীক', t.emblem) + '<div class="field" style="flex:2"><span>লাইফলাইন</span><div class="row">' + ['fifty', 'poll', 'flip'].map((k) => '<span class="status-pill ' + (Sel.lifelineUsed(t.id, k) ? 'bad' : 'ok') + '">' + { fifty: '৫০:৫০', poll: 'পোল', flip: 'ফ্লিপ' }[k] + (Sel.lifelineUsed(t.id, k) ? ' ব্যবহৃত' : ' আছে') + '</span>').join('') + F.btn('lifelineReset', 'রিসেট', 'sm', t.id) + '</div></div></div></div>';
    }).join('');
    const ledger = s.ledger.slice(-60).reverse().map((e) => '<div class="li"><span class="n" style="color:' + (e.delta >= 0 ? 'var(--correct)' : 'var(--wrong)') + '">' + signed(e.delta) + '</span><div class="t"><b>' + esc((Sel.team(e.team) || {}).name || e.team) + '</b> — ' + esc(e.reason) + '<small class="muted" style="color:var(--muted);font-weight:400">' + esc((Sel.round(e.round) || {}).name || '') + ' • ' + new Date(e.t).toLocaleTimeString() + '</small></div><div class="acts">' + F.btn('ledgerDel', 'মুছুন', 'sm bad', e.id) + '</div></div>').join('');
    return F.card('দল নিবন্ধন', '<div class="row">' + F.btn('teamAdd', '+ নতুন দল', 'primary') + '<span class="muted">মোট ' + bn(s.teams.length) + 'টি দল • ছবি: ফোন থেকে ল্যাপটপে আনুন, তারপর "যোগ করুন" চাপুন (JPG/PNG/WEBP)</span></div>') +
      '<div class="list">' + ed + '</div>' +
      F.card('বিশেষ উপস্থাপনার বিভাগ', '<div class="row">' + s.giftCategories.map((c, i) => '<span class="status-pill">' + esc(c) + ' <button class="btn sm ghost" data-act="giftCatDel" data-arg="' + i + '" aria-label="মুছুন">✕</button></span>').join('') + '</div><div class="row" style="margin-top:.5rem"><input type="text" id="newCat" placeholder="নতুন বিভাগ"><button class="btn sm primary" data-act="giftCatAdd">যোগ</button></div>') +
      F.card('স্কোর ইতিহাস (অডিট)', '<div class="list" style="max-height:40vh;overflow:auto">' + (ledger || '<p class="muted">এখনও কোনো স্কোর নেই</p>') + '</div><div class="row" style="margin-top:.5rem">' + F.btn('resetScores', 'সব স্কোর রিসেট', 'bad') + '</div>');
  },

  /* ---------------- QUESTIONS ---------------- */
  questions(s) {
    const filter = UI.qFilter || '';
    const rounds = s.rounds;
    const list = s.questions.filter((q) => !filter || q.roundId === filter).sort((a, b) => Sel.roundIndex(a.roundId) - Sel.roundIndex(b.roundId) || a.number - b.number);
    const filt = '<div class="row">' + F.btn('qFilter', 'সব (' + bn(s.questions.length) + ')', 'sm' + (!filter ? ' on' : ''), '') + rounds.map((r) => F.btn('qFilter', esc(r.name) + ' (' + bn(Sel.roundQuestions(r.id).length) + ')', 'sm' + (filter === r.id ? ' on' : ''), r.id)).join('') + '</div>';
    const rows = list.map((q) => '<div class="li' + (UI.qEdit === q.id ? ' active' : '') + (s.board.played[q.id] ? ' done' : '') + '"><span class="n">' + bn(q.number) + '</span><div class="t">' + esc(q.text.slice(0, 110)) + (q.text.length > 110 ? '…' : '') + '<small>' + esc((Sel.round(q.roundId) || {}).name || q.roundId) + ' • উত্তর: ' + esc(q.answerText || q.options[q.answer] || '—') + (q.image ? ' • 🖼' : '') + '</small></div><div class="acts">' + F.btn('qEdit', '✎', 'sm primary', q.id) + F.btn('showQ', '▶', 'sm good', q.id) + F.btn('qMove', '↑', 'sm', q.id + '|-1') + F.btn('qMove', '↓', 'sm', q.id + '|1') + F.btn('qDup', '⧉', 'sm', q.id) + F.btn('qDel', '🗑', 'sm bad', q.id) + '</div></div>').join('');
    let editor = '';
    const qi = s.questions.findIndex((q) => q.id === UI.qEdit);
    if (qi >= 0) {
      const q = s.questions[qi]; const p = 'questions.' + qi;
      editor = F.card('প্রশ্ন সম্পাদনা — ' + esc(q.id), '<div class="g3">' + F.select(p + '.roundId', 'রাউন্ড', rounds.map((r) => [r.id, r.name]), q.roundId, true) + F.num(p + '.number', 'প্রশ্ন নম্বর', q.number, 1, 999, 1, 'int') + F.num(p + '.timer', 'টাইমার (সেকেন্ড, খালি = রাউন্ড ডিফল্ট)', q.timer, 5, 600, 1, 'nullnum') + '</div>' +
        F.area(p + '.text', 'প্রশ্ন', q.text, 4) +
        '<div class="g2">' + [0, 1, 2, 3].map((i) => '<label class="field"><span><input type="radio" name="ans" data-bind="' + p + '.answer" data-type="int" value="' + i + '"' + (q.answer === i ? ' checked' : '') + '> সঠিক — বিকল্প ' + OPT_LABELS[i] + '</span><input type="text" data-bind="' + p + '.options.' + i + '" value="' + esc(q.options[i] || '') + '"></label>').join('') + '</div>' +
        '<div class="g2">' + F.text(p + '.answerText', 'লিখিত উত্তর (বিকল্প না থাকলে)', q.answerText) + F.num(p + '.points', 'নম্বর (খালি = রাউন্ড ডিফল্ট)', q.points, -100, 100, 1, 'nullnum') + '</div>' +
        F.area(p + '.explanation', 'ব্যাখ্যা', q.explanation, 2) + F.area(p + '.speech', 'ভয়েসের জন্য লেখা (ঐচ্ছিক)', q.speech, 2) +
        '<div class="row">' + F.media(p + '.image', 'প্রশ্নের ছবি', q.image) + '<div class="deck" style="flex:1">' + F.btn('showQ', '▶ স্টেজে দেখাও', 'good', q.id) + F.btn('qEdit', 'বন্ধ', '', '') + '</div></div>');
    }
    return editor + F.card('প্রশ্ন ব্যবস্থাপক', filt + '<div class="row" style="margin:.5rem 0">' + F.btn('qNew', '+ নতুন প্রশ্ন', 'primary') + F.btn('exportQuestions', '⇩ প্রশ্ন JSON রপ্তানি') + F.btn('importFile', '⇧ JSON আমদানি') + '</div><div class="list" data-keep-scroll="ql" style="max-height:62vh;overflow:auto">' + (rows || '<p class="muted">এই রাউন্ডে কোনো প্রশ্ন নেই</p>') + '</div>');
  },

  /* ---------------- ROUNDS ---------------- */
  rounds(s) {
    const anims = ROUND_ANIMS.map((a) => [a, a]);
    const out = s.rounds.map((r, i) => {
      const p = 'rounds.' + i; const sc = p + '.scoring.'; const ft = p + '.features.';
      const count = Sel.roundQuestions(r.id).length;
      return '<div class="team-editor" style="--team:' + esc(r.design.primary) + '"><header><b style="flex:1">রাউন্ড ' + bn(i + 1) + ': ' + esc(r.name) + ' <span class="muted">(' + bn(count) + 'টি প্রশ্ন)</span>' + (count ? '' : ' <span class="badge-warn">⚠ প্রশ্ন নেই</span>') + '</b>' + F.check(p + '.enabled', 'অনুষ্ঠানে চালু', r.enabled, true) + F.btn('roundShow', '▶ সূচনা', 'sm good', r.id) + F.btn('roundMove', '↑', 'sm', r.id + '|-1') + F.btn('roundMove', '↓', 'sm', r.id + '|1') + '</header>' +
        '<div class="g3">' + F.text(p + '.name', 'রাউন্ডের নাম', r.name) + F.text(p + '.label', 'উপশিরোনাম', r.label) + F.select(p + '.type', 'ধরন', [['standard', 'সাধারণ (সরাসরি/পাস)'], ['bonus', 'বোনাস (প্রতি পাসে +ধাপ)'], ['rapid', 'র‍্যাপিড ফায়ার / বাজার']], r.type, true) + '</div>' +
        F.area(p + '.description', 'বিবরণ (সূচনা পর্দায়)', r.description, 2) + F.area(p + '.rules', 'নিয়মাবলি', r.rules, 4) +
        '<div class="row">' + F.check(ft + 'options', 'বিকল্প আছে', r.features.options) + F.check(ft + 'judgeOptions', 'বিকল্প নিলে ৫/৩ নম্বর', r.features.judgeOptions) + F.check(ft + 'pass', 'পাস চালু', r.features.pass) + F.check(ft + 'passAfterOptions', 'বিকল্পের পর পাস', r.features.passAfterOptions) + F.check(ft + 'challenge', 'চ্যালেঞ্জ চালু', r.features.challenge) + F.check(ft + 'singleChallenger', 'একটি দলই চ্যালেঞ্জ', r.features.singleChallenger) + F.check(ft + 'lifelines', 'লাইফলাইন', r.features.lifelines) + F.check(ft + 'twoOptions', 'দুটি বিকল্প দেখাও', r.features.twoOptions) + '</div>' +
        '<div class="g4">' + F.num(sc + 'direct', 'সরাসরি সঠিক', r.scoring.direct) + F.num(sc + 'options4', '৪ বিকল্পে সঠিক', r.scoring.options4) + F.num(sc + 'options2', '২ বিকল্পে সঠিক', r.scoring.options2) + F.num(sc + 'pass', 'পাসে সঠিক', r.scoring.pass) + F.num(sc + 'wrong', 'ভুল', r.scoring.wrong) + F.num(sc + 'bonusStep', 'বোনাস ধাপ (+)', r.scoring.bonusStep) + F.num(sc + 'challengeRight', 'চ্যালেঞ্জ সঠিক', r.scoring.challengeRight) + F.num(sc + 'challengeWrong', 'চ্যালেঞ্জ ভুল', r.scoring.challengeWrong) + F.num(sc + 'rapidRight', 'র‍্যাপিড সঠিক', r.scoring.rapidRight) + F.num(sc + 'rapidWrong', 'র‍্যাপিড ভুল', r.scoring.rapidWrong) + F.num(p + '.timers.direct', 'সরাসরি টাইমার (s)', r.timers.direct, 5, 600) + F.num(p + '.timers.pass', 'পাস/বোনাস টাইমার (s)', r.timers.pass, 5, 600) + '</div>' +
        '<div class="g4">' + F.color(p + '.design.primary', 'প্রাথমিক রং', r.design.primary) + F.color(p + '.design.secondary', 'দ্বিতীয় রং', r.design.secondary) + F.color(p + '.design.accent', 'অ্যাকসেন্ট / গোল্ড', r.design.accent) + F.select(p + '.design.anim', 'সূচনা অ্যানিমেশন', anims, r.design.anim) + F.select(p + '.design.titleFont', 'শিরোনাম ফন্ট', [['', 'গ্লোবাল']].concat(fontOpts()), r.design.titleFont) + F.select(p + '.design.questionFont', 'প্রশ্ন ফন্ট', [['', 'গ্লোবাল']].concat(fontOpts()), r.design.questionFont) + F.select(p + '.design.optionFont', 'বিকল্প ফন্ট', [['', 'গ্লোবাল']].concat(fontOpts()), r.design.optionFont) + F.range(p + '.design.qScale', 'প্রশ্নের আকার', r.design.qScale, 0.6, 1.6, 0.05) + F.check(p + '.voiceIntro', 'সূচনায় ভয়েস ঘোষণা', r.voiceIntro) + '</div>' +
        '<div class="g4">' + F.media(p + '.design.bg', 'পটভূমি ছবি', r.design.bg) + F.media(p + '.design.music', 'রাউন্ড সংগীত', r.design.music, 'audio/*', 'audio') + F.media(p + '.sounds.correct', 'সঠিক সাউন্ড', r.sounds.correct, 'audio/*', 'audio') + F.media(p + '.sounds.wrong', 'ভুল সাউন্ড', r.sounds.wrong, 'audio/*', 'audio') + '</div>' +
        '<div class="row">' + F.media(p + '.sounds.reveal', 'উত্তর প্রকাশ সাউন্ড', r.sounds.reveal, 'audio/*', 'audio') + '<span class="muted">পালা: ' + esc((Sel.team(Game.turnFor(r.id)) || {}).name || '—') + '</span>' + F.btn('roundResetTurn', 'পালা রিসেট', 'sm', r.id) + '</div></div>';
    }).join('');
    return F.card('রাউন্ড সেটিংস', '<p class="big-hint">ডিফল্ট: সরাসরি ৬০ সেকেন্ড, পাস/বোনাস ৪৫ সেকেন্ড। নাম, ক্রম, নিয়ম, নম্বর, টাইমার, রং, অ্যানিমেশন, সংগীত — সব এখান থেকে।</p><div class="g2">' + F.select('flipPool', 'ফ্লিপ লাইফলাইনের প্রশ্ন আসবে যে রাউন্ড থেকে', s.rounds.map((r) => [r.id, r.name]), s.flipPool) + '</div>') + '<div class="list">' + out + '</div>';
  },

  /* ---------------- EVENT ---------------- */
  event(s) {
    const e = 'event.';
    const crew = s.crew.map((c, i) => '<div class="li" style="grid-template-columns:auto 1fr auto">' + F.media('crew.' + i + '.photo', 'ছবি', c.photo) + '<div class="g2">' + F.text('crew.' + i + '.name', 'নাম', c.name) + F.text('crew.' + i + '.role', 'ভূমিকা', c.role) + '</div><div class="acts">' + F.btn('crewDel', '🗑', 'sm bad', String(i)) + '</div></div>').join('');
    return F.card('ব্র্যান্ড', '<div class="g3">' + F.text(e + 'brandEn', 'ইংরেজি নাম', s.event.brandEn) + F.text(e + 'brandBn', 'বাংলা নাম', s.event.brandBn) + F.text(e + 'tagline', 'ট্যাগলাইন', s.event.tagline) + '</div>') +
      F.card('অনুষ্ঠান পরিচিতি', '<div class="g2">' + F.text(e + 'programme', 'অনুষ্ঠানের নাম', s.event.programme) + F.text(e + 'subtitle', 'উপশিরোনাম', s.event.subtitle) + F.text(e + 'season', 'সিজন', s.event.season) + F.text(e + 'year', 'বছর / শিক্ষাবর্ষ', s.event.year) + F.text(e + 'organizer', 'আয়োজক', s.event.organizer) + F.text(e + 'venue', 'স্থান', s.event.venue) + F.text(e + 'date', 'তারিখ', s.event.date) + F.text(e + 'presenter', 'উপস্থাপক', s.event.presenter) + F.text(e + 'quizMaster', 'কুইজ মাস্টার', s.event.quizMaster) + F.text(e + 'compiler', 'প্রশ্ন সংকলক', s.event.compiler) + F.text(e + 'editor', 'সম্পাদক', s.event.editor) + F.text(e + 'conductedBy', 'পরিচালনায়', s.event.conductedBy) + F.text(e + 'sponsors', 'স্পনসর', s.event.sponsors) + '</div>' + F.area(e + 'credits', 'বিশেষ কৃতজ্ঞতা', s.event.credits, 3) + F.area(e + 'welcomeNote', 'স্বাগত বার্তা', s.event.welcomeNote, 2) + '<div class="row">' + F.text(e + 'ticker', 'নিচের চলমান লেখা (টিকার)', s.event.ticker) + F.check(e + 'showTicker', 'টিকার দেখাও', s.event.showTicker) + '</div>') +
      F.card('আয়োজক দল', '<div class="list">' + crew + '</div><div class="row" style="margin-top:.5rem">' + F.btn('crewAdd', '+ সদস্য যোগ', 'primary') + '</div><div class="row" style="margin-top:.5rem">' + F.media('groupPhoto', 'দলগত ছবি', s.groupPhoto) + '<div style="flex:1">' + F.text('groupCaption', 'ক্যাপশন', s.groupCaption) + '</div></div>');
  },

  /* ---------------- MEDIA ---------------- */
  media(s) {
    const p = s.poster;
    const poster = '<div class="row">' + F.media('poster.media', 'আয়োজক ব্যানার / পোস্টার', p.media) + '<div style="flex:1" class="g3">' + F.select('poster.fit', 'ফিট', [['contain', 'Contain (পুরো দেখাও)'], ['cover', 'Cover (পর্দা ভরাও)'], ['fill', 'Fill']], p.fit) + F.range('poster.posX', 'অনুভূমিক অবস্থান', p.posX, 0, 100, 1) + F.range('poster.posY', 'উল্লম্ব অবস্থান', p.posY, 0, 100, 1) + F.range('poster.zoom', 'জুম', p.zoom, 0.5, 2, 0.05) + F.range('poster.opacity', 'অস্বচ্ছতা', p.opacity, 0.1, 1, 0.05) + F.color('poster.bg', 'পটভূমি', p.bg) + F.select('poster.anim', 'প্রবেশ অ্যানিমেশন', ANIMS, p.anim) + '</div></div>';
    const gal = s.gallery.map((id) => '<div class="photo-slot"><div class="thumb" style="width:110px;height:72px"><img data-media="' + esc(id) + '" alt=""></div><small>' + esc(Media.label(id)) + '</small><div class="row">' + F.btn('galleryShow', '▶ স্টেজে', 'sm good', id) + F.btn('galleryUse', 'পোস্টার', 'sm', id + '|poster.media') + F.btn('galleryUse', 'লোগো', 'sm', id + '|logo') + F.btn('galleryUse', 'পটভূমি', 'sm', id + '|design.bgImage') + F.btn('galleryUse', 'বিজয়ী', 'sm', id + '|winnerPhoto') + F.btn('galleryDel', '✕', 'sm bad', id) + '</div></div>').join('');
    const lib = Media.index.map((m) => '<div class="li"><span class="thumb">' + (m.kind === 'image' ? '<img data-media="' + esc(m.id) + '" alt="">' : '♪') + '</span><div class="t">' + esc(m.name) + '<small style="color:var(--muted)">' + esc(m.kind) + ' • ' + Math.round(m.size / 1024) + ' KB' + (m.w ? ' • ' + m.w + '×' + m.h : '') + '</small></div><div class="acts">' + (m.kind === 'image' ? F.btn('galleryAddId', '+ গ্যালারি', 'sm', m.id) : '') + F.btn('mediaDel', '🗑', 'sm bad', m.id) + '</div></div>').join('');
    return F.card('আয়োজক ব্যানার / ইভেন্ট পোস্টার (প্রথম দৃশ্য)', poster + '<div class="row" style="margin-top:.5rem">' + F.btn('jump', '▶ ব্যানার দেখাও', 'good', 'ORGANIZER') + '</div>') +
      F.card('লোগো ও বিজয়ী ছবি', '<div class="g3">' + F.media('logo', 'কুইজ কর্নার লোগো', s.logo) + F.media('winnerPhoto', 'বিজয়ীর ছবি (খালি = দলের ছবি)', s.winnerPhoto) + '<div class="field"><span>অন্তর্নির্মিত লোগো</span>' + F.btn('logoReset', 'মূল লোগো ফিরিয়ে আনুন', 'sm') + '</div></div>') +
      F.card('গ্রাফিক্স গ্যালারি', '<div class="row">' + F.btn('galleryUpload', '+ একাধিক ছবি যোগ', 'primary') + '<span class="muted">পোস্টার, স্পনসর, পটভূমি, রাউন্ড ও বিজয়ী গ্রাফিক — যেকোনো দৃশ্যে পুনর্ব্যবহারযোগ্য</span></div><div class="row" style="margin-top:.5rem;align-items:stretch">' + (gal || '<p class="muted">গ্যালারি খালি</p>') + '</div>') +
      F.card('মিডিয়া লাইব্রেরি', '<div class="list" style="max-height:40vh;overflow:auto">' + (lib || '<p class="muted">কোনো আপলোড নেই</p>') + '</div>', 'মূল ফাইল অক্ষত রেখে প্রদর্শনের জন্য অপ্টিমাইজ করা হয়');
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
    const toolbar = '<div class="toolbar" role="toolbar" aria-label="লেখার ফরম্যাট">' +
      '<select data-bind="' + p + '.font" aria-label="ফন্ট" class="tb-font">' + FONT_CHOICES.map(([n]) => '<option value="' + esc(n) + '"' + (n === t.font ? ' selected' : '') + ' style="font-family:' + esc(FONT_MAP[n]) + '">' + esc(n) + '</option>').join('') + '</select>' +
      '<span class="tb-group"><button class="tb" data-act="textSize" data-arg="-0.05" title="ছোট করুন">A−</button><span class="tb-val">' + bn(Math.round(t.size * 100)) + '%</span><button class="tb" data-act="textSize" data-arg="0.05" title="বড় করুন">A+</button></span>' +
      '<span class="tb-group">' + tog('bold', '<b>B</b>', 'বোল্ড') + tog('italic', '<i>I</i>', 'ইটালিক') + tog('underline', '<u>U</u>', 'আন্ডারলাইন') + '</span>' +
      '<span class="tb-group">' + al('left', '⯇≡', 'বামে') + al('center', '≡', 'মাঝে') + al('right', '≡⯈', 'ডানে') + al('justify', '☰', 'দুই পাশে সমান') + '</span>' +
      '<label class="tb-color" title="লেখার রং"><span style="border-bottom:4px solid ' + esc(t.color || d.colors.text) + '">A</span><input type="color" data-bind="' + p + '.color" value="' + esc(t.color || d.colors.text) + '" aria-label="লেখার রং"></label>' +
      '<button class="tb" data-act="textColorReset" title="থিমের রং">↺ রং</button><button class="tb" data-act="textReset" title="এই লেখাটি ডিফল্টে ফেরত">↺ ডিফল্ট</button></div>';
    return F.card('লেখা ও ফন্ট — Microsoft Office-এর মতো', '<p class="big-hint">কোন লেখা বদলাবেন বেছে নিন, তারপর টুলবার ব্যবহার করুন। পরিবর্তন সঙ্গে সঙ্গে স্টেজে দেখা যাবে।</p><div class="seg-row">' + tabs + '</div>' + toolbar + sample) +
      F.card('সব লেখার মূল ফন্ট', '<div class="g3">' + F.select('design.fonts.bn', 'বাংলা মূল ফন্ট (ডিফল্ট: Hind Siliguri)', fontOpts(), d.fonts.bn) + F.select('design.fonts.en', 'ইংরেজি ফন্ট', fontOpts(), d.fonts.en) + F.select('design.fonts.timer', 'টাইমার ও সংখ্যার ফন্ট', fontOpts(), d.fonts.timer) + '</div>') +
      F.card('প্রশ্নের অনুচ্ছেদ', '<div class="g3">' + F.range('design.qSpacing', 'অক্ষর ব্যবধান', d.qSpacing, -0.05, 0.2, 0.01) + F.range('design.qLeading', 'লাইন উচ্চতা', d.qLeading, 1.2, 2, 0.02) + F.select('design.vAlign', 'উল্লম্ব অবস্থান', [['top', 'উপরে'], ['center', 'মাঝে'], ['bottom', 'নিচে']], d.vAlign) + '</div><p class="big-hint">দীর্ঘ লেখা নিজে থেকে ছোট হয়ে বর্ডারের ভিতরে ফিট হয় — কোনো বাংলা অক্ষর কাটা পড়বে না।</p>');
  },

  /* ---------------- COLOURS, BACKGROUND & BORDERS ---------------- */
  colors(s) {
    const d = s.design; const c = 'design.colors.';
    const themes = Object.entries(THEMES).map(([k, t]) => '<button class="swatch' + (d.theme === k ? ' on' : '') + '" data-act="theme" data-arg="' + k + '" style="--a:' + t.bg2 + ';--b:' + t.accent + ';--c:' + t.gold + '"><i></i>' + esc(t.label) + '</button>').join('');
    const group = (title, list) => '<div class="field"><span class="grp">' + title + '</span><div class="g4">' + list.map(([k, l]) => F.color(c + k, l, d.colors[k])).join('') + '</div></div>';
    return F.card('থিম', '<div class="swatches">' + themes + '</div><p class="big-hint">উজ্জ্বল মঞ্চ বা দিনের আলোর জন্য "দিনের আলো — সর্বোচ্চ কনট্রাস্ট" সবচেয়ে পরিষ্কার। থিম বেছে নেওয়ার পর নিচে যেকোনো রং আলাদা করে বদলাতে পারবেন।</p>') +
      F.card('লেখা ও পটভূমির রং', group('লেখা', [['text', 'মূল লেখা'], ['muted', 'গৌণ লেখা'], ['gold', 'গোল্ড হাইলাইট']]) + group('পটভূমি', [['bg', 'পটভূমি (গাঢ়)'], ['bg2', 'পটভূমি (আলো)']]) + '<div class="row" style="margin-top:.5rem">' + F.media('design.bgImage', 'পটভূমির ছবি (ঐচ্ছিক)', d.bgImage) + '</div>') +
      F.card('লেখার বর্ডার ও বক্স', '<div class="row">' + F.check('design.box.show', 'লেখা বর্ডারের ভিতরে রাখো', d.box.show) + '</div><div class="g4">' + F.color(c + 'neon', 'বর্ডারের রং (নিয়ন)', d.colors.neon) + F.color(c + 'panel', 'বক্সের ভিতরের রং', d.colors.panel) + F.range('design.box.width', 'বর্ডারের পুরুত্ব', d.box.width, 0.1, 1, 0.02) + F.range('design.box.radius', 'কোণের গোলাই', d.box.radius, 0, 5, 0.1) + F.range(c + 'glow', 'গ্লো তীব্রতা', d.colors.glow, 0, 2, 0.1) + F.range('design.box.opacity', 'বক্সের অস্বচ্ছতা', d.box.opacity, 0.4, 1, 0.02) + '</div>') +
      F.card('অবস্থা ও টাইমারের রং', group('ফলাফল', [['correct', 'সঠিক'], ['wrong', 'ভুল'], ['accent', 'অ্যাকসেন্ট'], ['accent2', 'অ্যাকসেন্ট ২']]) + group('টাইমার', [['timer', 'টাইমার রিং'], ['warn', 'সতর্কতা'], ['crit', 'জরুরি (শেষ ৫s)']]));
  },

  /* ---------------- ANIMATION & EFFECTS ---------------- */
  effects(s) {
    const d = s.design;
    return F.card('অ্যানিমেশন', '<div class="g3">' + F.select('design.anim', 'দৃশ্য পরিবর্তন', ANIMS, d.anim) + F.range('design.animSpeed', 'অ্যানিমেশন গতি', d.animSpeed, 0.4, 2, 0.1) + F.range('design.ringWidth', 'টাইমার রিং পুরুত্ব', d.ringWidth, 3, 14, 1) + '</div><div class="row">' + F.check('design.motion', 'মোশন চালু', d.motion) + F.check('design.particles', 'নিউরাল কণা', d.particles) + F.check('design.rays', 'আলোকরশ্মি', d.rays) + F.check('design.floor', '৩ডি গ্রিড মেঝে', d.floor) + '</div>') +
      F.card('কন্ট্রোল প্যানেল (অপারেটর)', '<div class="row">' + F.btn('toggleBigUi', document.body.classList.contains('big-ui') ? 'বড় বোতাম: চালু' : 'বড় বোতাম: বন্ধ', '') + F.btn('toggleContrast', document.body.classList.contains('contrast') ? 'উচ্চ কনট্রাস্ট: চালু' : 'উচ্চ কনট্রাস্ট: বন্ধ') + '</div>');
  },

  /* ---------------- SCENE ENGINE ---------------- */
  scenes(s) {
    return F.card('দৃশ্যভিত্তিক সেটিংস (Scene Engine)', '<p class="big-hint">প্রতিটি দৃশ্যের জন্য আলাদা প্রবেশ অ্যানিমেশন, পটভূমি ছবি ও সাউন্ড বেছে নিন। খালি = ডিফল্ট।</p><div class="list">' + Object.entries(SCENES).map(([k, l]) => { const fx = s.sceneFx[k] || {}; return '<div class="li" style="grid-template-columns:150px 1fr 1fr auto"><b>' + esc(l) + '</b>' + F.select('sceneFx.' + k + '.anim', 'অ্যানিমেশন', [['', 'ডিফল্ট']].concat(ANIMS), fx.anim || '') + F.select('sceneFx.' + k + '.cue', 'সাউন্ড', [['', 'ডিফল্ট'], ['none', 'কোনো সাউন্ড নয়']].concat(Object.entries(AUDIO_CUES)), fx.cue || '') + F.media('sceneFx.' + k + '.bg', 'পটভূমি', fx.bg || '') + '</div>'; }).join('') + '</div>');
  },

  /* ---------------- MUSIC & SOUND ---------------- */
  audio(s) {
    const a = s.audio;
    const music = Object.entries(MUSIC_SLOTS).map(([k, l]) => { const m = a.music[k]; const p = 'audio.music.' + k + '.'; return '<div class="team-editor"><header><b style="flex:1">' + l + ' — <span class="muted">' + esc(Media.label(m.media)) + '</span></b>' + (AudioDirector.playing(k) ? '<span class="status-pill ok">বাজছে</span>' : '') + F.btn('music', '▶ প্রিভিউ', 'sm good', k) + F.btn('musicStop', '■', 'sm', k) + F.btn('musicPick', 'বদলান', 'sm primary', k) + F.btn('musicReset', 'মূলে ফেরত', 'sm', k) + F.btn('musicClear', 'মুছুন', 'sm bad', k) + '</header><div class="g4">' + F.range(p + 'vol', 'ভলিউম', m.vol, 0, 1, 0.05) + F.num(p + 'fadeIn', 'ফেড-ইন (s)', m.fadeIn, 0, 20, 0.5) + F.num(p + 'fadeOut', 'ফেড-আউট (s)', m.fadeOut, 0, 20, 0.5) + F.num(p + 'delay', 'বিলম্ব (s)', m.delay, 0, 60, 0.5) + '</div>' + F.check(p + 'loop', 'লুপ', m.loop) + '</div>'; }).join('');
    const cues = Object.entries(AUDIO_CUES).map(([k, l]) => { const c = a.cues[k] || { vol: 0.8, mute: false, media: '' }; return '<div class="li" style="grid-template-columns:150px 1fr auto"><b>' + l + '</b><input type="range" min="0" max="1" step="0.05" data-bind="audio.cues.' + k + '.vol" data-type="num" value="' + c.vol + '" aria-label="' + esc(l) + ' ভলিউম"><div class="acts">' + F.check('audio.cues.' + k + '.mute', 'মিউট', c.mute) + F.btn('cue', '▶', 'sm good', k) + F.btn('cuePick', c.media ? 'ফাইল ✓' : 'ফাইল', 'sm', k) + (c.media ? F.btn('cueReset', 'সিন্থে ফেরত', 'sm', k) : '') + '</div></div>'; }).join('');
    return F.card('মাস্টার অডিও', '<div class="g3">' + F.range('audio.master', 'মাস্টার ভলিউম', a.master, 0, 1, 0.05) + F.select('audio.output', 'সাউন্ড বাজবে', [['control', 'কন্ট্রোল উইন্ডো (প্রস্তাবিত)'], ['stage', 'স্টেজ উইন্ডো'], ['both', 'দুটোতেই']], a.output) + '<div class="field"><span>পরীক্ষা</span>' + F.btn('cue', '🔔 টেস্ট সাউন্ড', 'good', 'correct') + '</div></div>') +
      F.card('সংগীত (থিম, স্বাগত, বিজয়ী, পটভূমি)', '<div class="list">' + music + '</div>', 'MP3 / WAV / M4A') +
      F.card('সাউন্ড ইফেক্ট (Web Audio সিন্থেসিস — কোনো ফাইল লাগে না)', '<div class="list">' + cues + '</div>');
  },

  /* ---------------- VOICE ---------------- */
  voice(s) {
    const voices = Speech.voices.map((v) => [v.name, v.name + ' (' + v.lang + ')' + (/^bn/i.test(v.lang) ? ' ★' : '')]);
    const hasBn = Speech.voices.some((v) => /^bn/i.test(v.lang));
    const sp = s.speech;
    return F.card('ভয়েস (Speech)', (Speech.supported ? '' : '<p class="badge-warn">এই ব্রাউজারে ভয়েস সমর্থিত নয়</p>') + (Speech.supported && !hasBn ? '<p class="badge-warn">বাংলা ভয়েস পাওয়া যায়নি — Windows Settings ▸ Time & Language ▸ Speech থেকে Bengali (India) ভয়েস যোগ করুন।</p>' : '') + '<div class="row">' + F.check('speech.enabled', 'ভয়েস চালু', sp.enabled) + F.check('speech.autoQuestion', 'প্রশ্ন স্বয়ংক্রিয়ভাবে পড়ো', sp.autoQuestion) + F.check('speech.announceTeam', 'দলের নাম ঘোষণা', sp.announceTeam) + '</div><div class="g4">' + F.select('speech.voice', 'ভয়েস', [['', 'স্বয়ংক্রিয় (bn-IN)']].concat(voices), sp.voice) + F.range('speech.rate', 'গতি', sp.rate, 0.5, 1.5, 0.05) + F.range('speech.pitch', 'পিচ', sp.pitch, 0.5, 1.5, 0.05) + F.select('speech.timerVoice', 'টাইমার ঘোষণা', [['off', 'বন্ধ'], ['last10', 'শেষ ১০ সেকেন্ড'], ['marks', '৬০/৫০/…/১০ ও শেষ ৫'], ['all', '১০-এর ঘর + শেষ ১০']], sp.timerVoice) + '</div><div class="row">' + F.btn('speechTest', '🔊 পরীক্ষা') + F.btn('speak', 'প্রশ্ন পড়ো', '', 'question') + F.btn('speak', 'উত্তর পড়ো', '', 'answer') + F.btn('speak', 'দলের নাম', '', 'team') + F.btn('speak', 'রাউন্ডের নাম', '', 'round') + '</div>');
  },

  /* ---------------- BACKUP & RESET ---------------- */
  backup(s) {
    return F.card('সংরক্ষণ ও ব্যাকআপ', '<div class="deck">' + F.btn('saveNow', '💾 এখনই সংরক্ষণ', 'good') + F.btn('exportFull', '⇩ সম্পূর্ণ ব্যাকআপ (ছবি/গানসহ)', 'primary span2') + F.btn('exportEvent', '⇩ শুধু ডেটা (JSON)') + F.btn('importFile', '⇧ আমদানি / পুনরুদ্ধার', 'warn') + '</div><p class="big-hint">প্রতিটি পরিবর্তন সঙ্গে সঙ্গে ব্রাউজারে সংরক্ষিত হয়। রিফ্রেশ বা ব্রাউজার বন্ধ হলেও সব ফিরে আসবে। অনুষ্ঠানের আগে একটি সম্পূর্ণ ব্যাকআপ রাখুন।</p>') +
      F.card('নতুন ইভেন্ট ও রিসেট', '<div class="deck">' + F.btn('resetScores', 'স্কোর রিসেট', 'warn') + F.btn('resetBoard', 'প্রশ্ন বোর্ড রিসেট', 'warn') + F.btn('resetLifelines', 'সব লাইফলাইন রিসেট', 'warn') + F.btn('newEvent', '✦ নতুন ইভেন্ট (সব মুছে নতুন)', 'bad span2') + '</div>');
  },

  /* ---------------- TIMER & FLOW ---------------- */
  flow(s) {
    const st = s.settings;
    return F.card('টাইমার ও প্রবাহ', '<div class="g4">' + F.num('settings.warnAt', 'সতর্কতা (সেকেন্ড)', st.warnAt, 1, 60, 1, 'int') + F.num('settings.critAt', 'জরুরি সতর্কতা (সেকেন্ড)', st.critAt, 1, 30, 1, 'int') + F.num('settings.countdownFrom', 'কাউন্টডাউন শুরু', st.countdownFrom, 1, 10, 1, 'int') + F.num('settings.countdownStepMs', 'কাউন্টডাউন গতি (ms)', st.countdownStepMs, 400, 3000, 50, 'int') + '</div><div class="row">' + F.check('settings.autoTimer', 'প্রশ্ন এলে সরাসরি টাইমার নিজে চালু', st.autoTimer) + F.check('settings.autoPassTimer', 'পাস/চ্যালেঞ্জে ৪৫s নিজে চালু', st.autoPassTimer) + F.check('settings.autoRevealOnCorrect', 'সঠিক হলে উত্তর দেখাও', st.autoRevealOnCorrect) + F.check('settings.showLifelines', 'স্টেজে লাইফলাইন দেখাও', st.showLifelines) + '</div>') +
      F.card('ড্রোন ডেলিভারি', '<div class="g3">' + F.check('settings.drone.main', 'মূল রাউন্ডেও ড্রোন', st.drone.main) + F.range('settings.drone.speed', 'গতি', st.drone.speed, 0.4, 3, 0.1) + F.select('settings.drone.path', 'প্রবেশপথ', [['left', 'বাম দিক থেকে'], ['right', 'ডান দিক থেকে'], ['top', 'উপর থেকে']], st.drone.path) + '</div>');
  },

  /* ---------------- TESTS & LOG ---------------- */
  tests(s) {
    return F.card('স্বয়ংক্রিয় পরীক্ষা (Self-test)', '<div class="row">' + F.btn('runTests', '▶ পরীক্ষা চালাও', 'primary') + '<span class="muted">টাইমার, স্কোর, আনডু, র‍্যাঙ্কিং, রেন্ডার — আসল ডেটা স্পর্শ না করে</span></div><div id="testOut" class="tests"></div>') +
      F.card('লগ', '<div class="log" id="logBox">' + esc(Log.lines.slice(-120).join('\n')) + '</div>');
  },

  /* ---------------- HELP ---------------- */
  help(s) {
    return F.card('কিবোর্ড শর্টকাট', '<div class="kbd-grid">' + SHORTCUTS.map(([k, d]) => '<div><kbd>' + esc(k) + '</kbd><span>' + esc(d) + '</span></div>').join('') + '</div>') +
      F.card('তথ্য', '<p class="big-hint">Quiz Corner V' + VERSION + ' • সম্পূর্ণ অফলাইন • স্টেজ উইন্ডো: এই ফাইলের শেষে <code>#stage</code> • হোস্ট স্ক্রিপ্ট: <code>#host</code> • প্রশ্ন: ' + bn(s.questions.length) + ' • বাছাই: ' + bn(s.prelim.questions.length) + ' • দল: ' + bn(s.teams.length) + '</p>');
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
  prelimQDel(i) { if (!confirm('প্রশ্ন ' + (int(i) + 1) + ' মুছবেন?')) return; Store.commit('prelim-del', (s) => { s.prelim.questions.splice(int(i), 1); s.teams.forEach((t) => { if (Array.isArray(t.prelim.marks)) t.prelim.marks.splice(int(i), 1); }); }); },
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
  teamDel(id) { const t = Sel.team(id); if (!t || !confirm('"' + t.name + '" দল মুছবেন? (স্কোর ইতিহাস থাকবে)')) return; Store.commit('team-del', (s) => { s.teams = s.teams.filter((x) => x.id !== id); s.finalists = s.finalists.filter((x) => x !== id); }); },
  teamMove(arg) { const [id, d] = arg.split('|'); Store.commit('team-move', (s) => { const i = s.teams.findIndex((t) => t.id === id); const j = i + int(d); if (i < 0 || j < 0 || j >= s.teams.length) return false; [s.teams[i], s.teams[j]] = [s.teams[j], s.teams[i]]; }); },
  teamIntroNow(id) { const fin = Sel.finalistIds().includes(id) && Store.state.show.scene !== 'TEAM_INTRO'; const n = (fin ? Sel.finalistIds().indexOf(id) : Sel.teamIndex(id)) + 1; Show.jump(fin ? 'FINALIST_INTRO' : 'TEAM_INTRO', { key: id, teamId: id, n }); },
  lifelineReset(id) { Store.commit('lifeline-reset', (s) => { delete s.lifelines[id]; }); },
  resetLifelines() { Store.commit('lifelines-reset', (s) => { s.lifelines = {}; }); },
  giftCatAdd() { const v = ($('#newCat') || {}).value; if (!v || !v.trim()) return; Store.commit('gift-cat', (s) => { if (!s.giftCategories.includes(v.trim())) s.giftCategories.push(v.trim()); }); },
  giftCatDel(i) { Store.commit('gift-cat-del', (s) => { s.giftCategories.splice(int(i), 1); }); },
  ledgerDel(id) { Game.removeEntry(id); },
  resetScores() { if (!confirm('সব দলের স্কোর শূন্য করবেন? (আনডু করা যাবে)')) return; Store.commit('reset-scores', (s) => { s.ledger = []; s.board.prevRanks = {}; }); },
  resetBoard() { Store.commit('reset-board', (s) => { s.board.played = {}; s.rounds.forEach((r) => { r.turn = 0; }); }); },
  qFilter(rid) { UI.qFilter = rid || ''; UI.renderTab(true); },
  qEdit(id) { UI.qEdit = id || ''; UI.renderTab(true); if (id) window.scrollTo({ top: 0, behavior: 'smooth' }); },
  qNew() { const rid = UI.qFilter || (Sel.currentRound() || {}).id || 'R1'; const id = uid('Q'); Store.commit('q-new', (s) => { s.questions.push(Object.assign(questionFromSeed({ id, roundId: rid, number: Sel.roundQuestions(rid).length + 1, options: ['', '', '', ''] }, s.questions.length), { id })); }); UI.qEdit = id; UI.renderTab(true); },
  qDup(id) { const q = Sel.question(id); if (!q) return; const nid = uid('Q'); Store.commit('q-dup', (s) => { const c = clone(q); c.id = nid; c.number = Sel.roundQuestions(q.roundId).length + 1; s.questions.push(c); }); UI.qEdit = nid; UI.renderTab(true); },
  qDel(id) { const q = Sel.question(id); if (!q || !confirm('প্রশ্ন ' + q.number + ' মুছবেন?')) return; Store.commit('q-del', (s) => { s.questions = s.questions.filter((x) => x.id !== id); }); if (UI.qEdit === id) UI.qEdit = ''; },
  qMove(arg) { const [id, d] = arg.split('|'); const q = Sel.question(id); if (!q) return; const list = Sel.roundQuestions(q.roundId); const i = list.indexOf(q); const o = list[i + int(d)]; if (!o) return; Store.commit('q-move', () => { const n = q.number; q.number = o.number; o.number = n; if (q.number === o.number) q.number += int(d); }); },
  roundMove(arg) { const [id, d] = arg.split('|'); Store.commit('round-move', (s) => { const i = s.rounds.findIndex((r) => r.id === id); const j = i + int(d); if (i < 0 || j < 0 || j >= s.rounds.length) return false; [s.rounds[i], s.rounds[j]] = [s.rounds[j], s.rounds[i]]; }); },
  roundShow(id) { Show.jump('ROUND_INTRO', { key: id, roundId: id }); },
  roundResetTurn(id) { Store.commit('round-turn', (s) => { const r = s.rounds.find((x) => x.id === id); if (r) r.turn = 0; }); },
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
    inp.onchange = async () => { const ids = []; for (const f of Array.from(inp.files || [])) { try { ids.push(await Media.add(f, 'image')); } catch (e) { UI.toast(e.message, 'err'); } } if (ids.length) { Store.commit('gallery-add', (s) => { s.gallery.push(...ids); }); UI.toast(ids.length + 'টি ছবি যোগ হয়েছে', 'ok'); } };
    inp.click();
  },
  galleryAddId(id) { Store.commit('gallery-add', (s) => { if (!s.gallery.includes(id)) s.gallery.push(id); }); },
  galleryShow(id) { Show.jump('GRAPHIC', { key: id, media: id }); },
  galleryUse(arg) { const [id, path] = arg.split('|'); Store.commit('gallery-use', (s) => setPath(s, path, id)); UI.toast('প্রয়োগ হয়েছে', 'ok'); },
  galleryDel(id) { Store.commit('gallery-del', (s) => { s.gallery = s.gallery.filter((x) => x !== id); }); },
  async mediaDel(id) { if (!confirm('ফাইলটি স্থায়ীভাবে মুছবেন? যেখানে ব্যবহৃত সেখানে খালি দেখাবে।')) return; await Media.remove(id); UI.renderTab(true); },
  logoReset() { Store.commit('logo-reset', (s) => { s.logo = 'asset:logo'; }); },
  crewAdd() { Store.commit('crew-add', (s) => { s.crew.push({ name: '', role: '', photo: '' }); }); },
  crewDel(i) { Store.commit('crew-del', (s) => { s.crew.splice(int(i), 1); }); },
  async musicPick(slot) { const id = await pickMedia('audio/*,.mp3,.wav,.m4a', 'audio'); if (id) Store.commit('music-pick', (s) => { s.audio.music[slot].media = id; }); },
  musicReset(slot) { Store.commit('music-reset', (s) => { s.audio.music[slot].media = { theme: 'asset:theme', welcome: 'asset:welcome' }[slot] || ''; }); },
  musicClear(slot) { Cue.music(slot, 'stop'); Store.commit('music-clear', (s) => { s.audio.music[slot].media = ''; }); },
  async cuePick(name) { const id = await pickMedia('audio/*,.mp3,.wav,.m4a', 'audio'); if (id) Store.commit('cue-pick', (s) => { s.audio.cues[name].media = id; }); },
  cueReset(name) { Store.commit('cue-reset', (s) => { s.audio.cues[name].media = ''; }); },
  speechTest() { AudioDirector.unlock(); Speech.say('খেজুরি কুইজ কর্নারে আপনাদের স্বাগত। জ্ঞানই শক্তি।', 'test', true); },
  saveNow() { Store.persist(); UI.toast(Store.storageOk ? 'সংরক্ষিত ✓' : 'সংরক্ষণ ব্যর্থ — ব্যাকআপ ডাউনলোড করুন', Store.storageOk ? 'ok' : 'err'); },
  rehearsalOn(withTest) { Store.enterRehearsal(withTest === '1'); UI.toast('রিহার্সাল শুরু — আসল ইভেন্ট নিরাপদে সংরক্ষিত', 'ok'); },
  rehearsalOff() { Store.exitRehearsal(); UI.toast('রিহার্সাল শেষ — আসল ইভেন্টে ফিরে এসেছে', 'ok'); },
  newEvent() {
    if (!confirm('নতুন ইভেন্ট শুরু করবেন? বর্তমান দল, স্কোর ও সম্পাদনা মুছে যাবে (আগে ব্যাকআপ নিন)।')) return;
    if (!confirm('নিশ্চিত? এটি আনডু করা যাবে।')) return;
    Store.replace(defaultState(), 'new-event');
    UI.toast('নতুন ইভেন্ট প্রস্তুত', 'ok');
  },
  exportEvent() { download('quiz-corner-event-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'event', version: VERSION, state: Store.state }, null, 1)); },
  exportQuestions() { download('quiz-corner-questions-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'questions', questions: Store.state.questions, prelim: Store.state.prelim.questions, rounds: Store.state.rounds.map((r) => ({ id: r.id, name: r.name })) }, null, 1)); },
  async exportFull() {
    UI.toast('ব্যাকআপ তৈরি হচ্ছে…');
    const media = {};
    for (const m of Media.index) { const d = await Media.toDataURL(m.id); if (d) media[m.id] = { name: m.name, kind: m.kind, data: d }; }
    download('quiz-corner-FULL-backup-' + stamp() + '.json', JSON.stringify({ qc66: true, kind: 'full', version: VERSION, state: Store.state, media }));
    UI.toast('সম্পূর্ণ ব্যাকআপ ডাউনলোড হয়েছে', 'ok');
  },
  importFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { await Importer.run(JSON.parse(await f.text())); } catch (e) { UI.toast('আমদানি ব্যর্থ: ' + (e.message || e), 'err'); Log.err('import', e); }
    };
    inp.click();
  },
  runTests() { const out = $('#testOut'); if (out) out.innerHTML = '<p>চলছে…</p>'; SelfTest.run().then((res) => { if (out) out.innerHTML = SelfTest.html(res); }); },
});

function stamp() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); }
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------------- IMPORT / EXPORT ---------------- */
const Importer = {
  async run(data) {
    if (Array.isArray(data)) { this.questions(data); return; }
    if (!isObj(data)) throw new Error('অচেনা ফাইল');
    if (data.qc66 && data.kind === 'questions') { this.questions(arr(data.questions), arr(data.prelim)); return; }
    if (data.qc66 && data.state) {
      if (!confirm('এই ফাইল দিয়ে বর্তমান ইভেন্ট প্রতিস্থাপন করবেন? (আনডু করা যাবে)')) return;
      if (isObj(data.media)) { for (const [id, m] of Object.entries(data.media)) { try { await Media.putDataURL(id, m.name, m.kind, m.data); } catch (e) { Log.err('import-media', e); } } }
      Store.replace(data.state, 'import');
      UI.toast('আমদানি সম্পূর্ণ', 'ok');
      return;
    }
    if (Array.isArray(data.questions)) { this.questions(data.questions, arr(data.prelim)); return; }
    throw new Error('এই JSON-এ প্রশ্ন বা ইভেন্ট পাওয়া যায়নি');
  },
  questions(list, prelim = []) {
    const qs = list.filter(isObj).map((q, i) => questionFromSeed(Object.assign({}, q, { id: q.id || uid('Q') }), i));
    const mode = confirm('ঠিক আছে = বিদ্যমান প্রশ্নের সঙ্গে যোগ করুন\nবাতিল = সব প্রশ্ন প্রতিস্থাপন করুন');
    Store.commit('import-questions', (s) => {
      const ids = new Set(s.questions.map((q) => q.id));
      qs.forEach((q) => { if (mode && ids.has(q.id)) q.id = uid('Q'); });
      s.questions = mode ? s.questions.concat(qs) : qs;
      if (prelim.length) s.prelim.questions = prelim.filter(isObj).map((p) => ({ id: p.id || uid('P'), text: str(p.text), answer: str(p.answer), star: !!p.star, image: str(p.image), source: str(p.source) }));
    });
    UI.toast(qs.length + 'টি প্রশ্ন আমদানি হয়েছে', 'ok');
  },
};
