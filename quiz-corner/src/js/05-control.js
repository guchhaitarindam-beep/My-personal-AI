/* =====================================================================
   CONTROL PANEL — operator UI. One delegated click handler (data-act),
   one delegated input handler (data-bind). No inline handlers, no
   duplicate listeners, no re-render while the operator is typing.
   ===================================================================== */
const UI = {
  tab: 'show',
  picker: '', // '' | 'challenge'
  qEdit: '', // question id open in editor
  qFilter: '',
  tabDirty: false,
  liveSig: '',
  preview: null,

  toast(msg, kind = '') {
    if (Store.sandbox) return;
    if (MODE === 'stage') { Log.add(kind === 'err' ? 'ERR' : 'INFO', msg); return; }
    let host = $('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 5200 : 2600);
    while (host.children.length > 4) host.firstChild.remove();
  },
  modal(title, html) {
    this.closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="row"><h2 style="flex:1">' + esc(title) + '</h2><button class="btn sm" data-act="closeModal">বন্ধ (Esc)</button></div>' + html + '</div>';
    back.addEventListener('click', (e) => { if (e.target === back) this.closeModal(); });
    document.body.appendChild(back);
    const f = $('button, input, select, textarea', back); if (f) f.focus();
    return back;
  },
  closeModal() { $$('.modal-back').forEach((m) => m.remove()); },

  mount() {
    document.body.classList.add('mode-control');
    document.body.innerHTML = `
<div class="ctl">
  <header class="topbar" role="banner">
    <div class="brandmark"><img data-media="${esc(Store.state.logo)}" alt=""><div><b>Quiz Corner V66</b><small>ULTIMATE BROADCAST ENGINE</small></div></div>
    <span class="status-pill" id="pillStage">STAGE —</span>
    <span class="status-pill" id="pillSave">সংরক্ষিত</span>
    <span class="status-pill reh" id="pillReh" hidden>রিহার্সাল মোড</span>
    <span class="grow"></span>
    <button class="btn primary" data-act="openStage" title="O">🖥 স্টেজ উইন্ডো <kbd>O</kbd></button>
    <button class="btn" data-act="previewFull" title="F">⛶ ফুলস্ক্রিন <kbd>F</kbd></button>
    <button class="btn" data-act="blackout" title="B">◼ ব্ল্যাকআউট <kbd>B</kbd></button>
    <button class="btn" data-act="undo" id="btnUndo" title="Ctrl+Z">↶ আনডু</button>
    <button class="btn" data-act="redo" id="btnRedo" title="Ctrl+Y">↷ রিডু</button>
    <button class="btn" data-act="stopAudio" title="M">🔇 থামাও <kbd>M</kbd></button>
    <button class="btn" data-act="shortcuts" title="?">⌨ শর্টকাট</button>
    <select id="roleSel" aria-label="ভূমিকা" style="width:auto;min-height:38px">
      <option value="controller">কন্ট্রোলার</option><option value="quizmaster">কুইজ মাস্টার</option><option value="host">হোস্ট (শুধু দেখা)</option>
    </select>
  </header>
  <main class="ctl-main">
    <section class="live-col" aria-label="লাইভ নিয়ন্ত্রণ">
      <div class="preview-box" id="preview" aria-label="স্টেজ প্রিভিউ"></div>
      <div id="live"></div>
    </section>
    <section aria-label="প্রস্তুতি ও সেটিংস">
      <nav class="tabs" id="tabs" role="tablist"></nav>
      <div class="tab-body" id="tabBody"></div>
    </section>
  </main>
</div>`;
    this.preview = new StageView($('#preview'), { preview: true });
    const pref = safe('prefs', () => JSON.parse(localStorage.getItem(LS_PREF) || '{}'), {}) || {};
    $('#roleSel').value = pref.role || 'controller';
    this.applyRole();
    if (pref.bigUi) document.body.classList.add('big-ui');
    if (pref.tab && TABS.some((t) => t[0] === pref.tab)) this.tab = pref.tab;
    this.renderTabs();
    this.bindEvents();
    this.renderAll();
  },
  savePref(k, v) { safe('prefs', () => { const p = JSON.parse(localStorage.getItem(LS_PREF) || '{}'); p[k] = v; localStorage.setItem(LS_PREF, JSON.stringify(p)); }); },
  applyRole() {
    const role = $('#roleSel').value;
    document.body.classList.remove('role-controller', 'role-quizmaster', 'role-host');
    document.body.classList.add('role-' + role);
  },

  bindEvents() {
    document.addEventListener('click', (e) => {
      AudioDirector.unlock();
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const fn = Actions[el.dataset.act];
      if (!fn) { Log.add('WARN', 'unknown action ' + el.dataset.act); return; }
      e.preventDefault();
      safe('action:' + el.dataset.act, () => fn(el.dataset.arg, el));
    });
    const onBind = (e) => {
      const el = e.target;
      if (!el.dataset || !el.dataset.bind) return;
      const path = el.dataset.bind;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.dataset.type === 'num') v = num(el.value, 0);
      else if (el.dataset.type === 'int') v = int(el.value, 0);
      else if (el.dataset.type === 'nullnum') v = el.value === '' ? null : num(el.value, 0);
      else v = el.value;
      this.fromBind = true;
      Store.commit('edit:' + path, (s) => { if (getPath(s, path) === v) return false; setPath(s, path, v); }, { undo: e.type === 'change' });
      this.fromBind = false;
      if (el.dataset.rerender) this.renderTab(true);
    };
    document.addEventListener('input', (e) => { if (e.target.type === 'range' || e.target.type === 'color') onBind(e); });
    document.addEventListener('change', onBind);
    document.addEventListener('focusout', () => setTimeout(() => { if (this.tabDirty && !this.typing()) this.renderTab(); }, 0));
    $('#roleSel').addEventListener('change', () => { this.applyRole(); this.savePref('role', $('#roleSel').value); });
    Bus.on('change', (c) => this.onChange(c));
    Bus.on('stage-status', () => this.renderStatus());
    Bus.on('storage', () => this.renderStatus());
    Bus.on('rehearsal', () => this.renderStatus());
    Bus.on('media', () => { if (this.tab === 'media' || this.tab === 'teams') this.renderTab(); });
    Bus.on('music', () => { this.liveSig = ''; this.renderLive(); });
    Bus.on('log', () => { const l = $('#logBox'); if (l) { l.textContent = Log.lines.slice(-120).join('\n'); l.scrollTop = l.scrollHeight; } });
    Bus.on('voices', () => { if (this.tab === 'audio') this.renderTab(); });
    setInterval(() => this.renderStatus(), 1500);
    setInterval(() => this.renderClock(), 200);
  },
  typing() { const a = document.activeElement; return !!(a && a.closest('#tabBody') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'range' && a.type !== 'color'); },
  onChange(c) {
    DesignSystem.apply();
    this.preview.render();
    this.renderLive();
    const label = (c && c.label) || '';
    if (label.startsWith('timer-')) return;
    if (this.fromBind && !label.startsWith('edit:show')) return; // the input already shows the value
    if (this.typing()) { this.tabDirty = true; return; }
    this.renderTab();
  },
  renderAll() { DesignSystem.apply(); this.preview.render(); this.renderLive(); this.renderTab(); this.renderStatus(); Media.hydrate(document.body); },
  renderStatus() {
    const st = $('#pillStage'); if (!st) return;
    const ok = Sync.connected();
    st.textContent = ok ? 'STAGE ● সংযুক্ত' : 'STAGE ○ সংযোগ নেই';
    st.className = 'status-pill ' + (ok ? 'ok' : 'bad');
    const sv = $('#pillSave');
    sv.textContent = Store.storageOk ? (Store.rehearsal ? 'রিহার্সাল (আলাদা সংরক্ষণ)' : 'স্বয়ংক্রিয় সংরক্ষণ ✓') : 'সংরক্ষণ ব্যর্থ!';
    sv.className = 'status-pill ' + (Store.storageOk ? 'ok' : 'bad');
    $('#pillReh').hidden = !Store.rehearsal;
    $('#btnUndo').disabled = !Store.past.length; $('#btnRedo').disabled = !Store.future.length;
    $('#btnUndo').title = Store.past.length ? 'আনডু: ' + Store.past[Store.past.length - 1].label : 'আনডু';
  },
  renderClock() {
    const el = $('#bigTime'); if (!el) return;
    const s = Store.state; const t = s.timer; const rem = Sel.timerRemaining(t); const sec = Math.ceil(rem / 1000);
    el.textContent = t.expired ? '0' : fmtTime(rem);
    el.className = 'bigtime ' + (t.expired || sec <= s.settings.critAt ? 'crit' : sec <= s.settings.warnAt ? 'warn' : '');
    const tb = $('[data-act="timerToggle"]'); if (tb) tb.innerHTML = (t.running ? '⏸ বিরতি' : '▶ চালু') + ' <kbd>Space</kbd>';
  },

  /* ---------------- live column ---------------- */
  renderLive() {
    const html = safe('live', () => this.liveHtml(), '<div class="card">লাইভ প্যানেল লোড করা যায়নি</div>');
    if (html === this.liveSig) return;
    this.liveSig = html;
    const host = $('#live');
    const focusKey = document.activeElement && host.contains(document.activeElement) ? (document.activeElement.dataset.act || '') + '|' + (document.activeElement.dataset.arg || '') : '';
    host.innerHTML = html;
    Media.hydrate(host);
    this.renderClock();
    if (focusKey) { const [a, g] = focusKey.split('|'); const f = $$('[data-act="' + a + '"]', host).find((x) => (x.dataset.arg || '') === g); if (f) f.focus(); }
  },
  liveHtml() {
    const s = Store.state;
    const rd = Show.rundown(); const i = Show.index();
    const cur = rd[i]; const nxt = rd[i + 1];
    const b = (act, label, cls = '', arg = '', key = '', dis = false) => '<button class="btn ' + cls + '" data-act="' + act + '"' + (arg !== '' ? ' data-arg="' + esc(arg) + '"' : '') + (dis ? ' disabled' : '') + '>' + label + (key ? ' <kbd>' + key + '</kbd>' : '') + '</button>';
    let out = '<div class="card"><div class="now"><div><div class="scene-name">' + esc(cur ? cur.label : SCENES[s.show.scene] || s.show.scene) + '</div><div class="scene-sub">ধাপ ' + bn(i + 1) + ' / ' + bn(rd.length) + (nxt ? ' • পরবর্তী: ' + esc(nxt.label) : '') + '</div></div><span></span><div class="bigtime" id="bigTime">60</div></div>';
    out += '<div class="deck" style="margin-top:.6rem">' + b('prev', '◀ আগের', 'lg', '', '←') + b('next', 'পরের ▶', 'lg primary', '', '→') + b('timerToggle', '▶ চালু', 'lg', '', '') + b('replay', '↻ দৃশ্য পুনরায়', '') + b('scoreboard', '📊 স্কোরবোর্ড', '', '', 'S') + '</div></div>';
    out += this.contextDeck(s, b);
    out += this.teamDeck(s);
    return out;
  },
  contextDeck(s, b) {
    const sc = s.show.scene;
    let h = '';
    const timerRow = '<div class="deck-sep">টাইমার</div>' + b('timerDirect', '⏱ সরাসরি ' + bn(Timer.durationFor('direct')) + 's', 'warn', '', 'D') + b('timerPass', '⏱ পাস/বোনাস ' + bn(Timer.durationFor('pass')) + 's', 'violet', '', '⇧P') + b('timerReset', '⟲ রিসেট', '', '', '0') + b('timerAdd', '+১০ সেকেন্ড', '', '10', '+') + b('timerAdd', '−১০ সেকেন্ড', '', '-10', '');
    if (sc === 'QUESTION') {
      const l = s.live; const q = Sel.liveQuestion(); const r = Sel.round(l.roundId);
      const ans = Sel.team(Sel.answeringTeam());
      const pc = Game.pointsFor('correct'); const pw = Game.pointsFor('wrong');
      h += '<div class="card"><h3>প্রশ্ন নিয়ন্ত্রণ <span class="hint">' + esc(r ? r.name : '') + ' • ' + Game.flowName(l.flow) + (ans ? ' • উত্তরদাতা: ' + esc(ans.name) : '') + '</span></h3>';
      if (q) h += '<div class="qm-box"><div class="q">' + esc(q.text) + '</div><div class="a">উত্তর: ' + (q.options[q.answer] && !q.answerText ? OPT_LABELS[q.answer] + ') ' : '') + esc(q.answerText || q.options[q.answer] || '—') + '</div></div>';
      h += '<div class="deck" style="margin-top:.6rem">' + b('judge', '✓ সঠিক ' + signed(pc), 'lg good', 'correct', 'C') + b('judge', '✗ ভুল ' + (pw ? signed(pw) : ''), 'lg bad', 'wrong', 'X') + b('judge', '○ নো স্কোর', 'lg', 'noscore', 'N') + b('reveal', l.revealed ? '🙈 উত্তর লুকাও' : '👁 উত্তর দেখাও', 'lg gold', '', 'R');
      h += '<div class="deck-sep">প্রবাহ</div>' + b('pass', (r && r.type === 'bonus' ? '➜ বোনাস: পরের দল' : '➜ পাস: পরের দল') + ' (' + bn(Timer.durationFor('pass')) + 's)', 'violet span2', '', 'P', r && !r.features.pass) + b('challengePick', '⚔ চ্যালেঞ্জ', 'warn' + (this.picker === 'challenge' ? ' on' : ''), '', 'H', r && !r.features.challenge) + b('options', l.optionsShown ? 'বিকল্প লুকাও' : 'বিকল্প দেখাও', '', '', 'V', !q || q.options.filter(Boolean).length < 2);
      if (q && l.optionsShown) h += '<div class="deck-sep">দলের বেছে নেওয়া বিকল্প' + (r && r.features.judgeOptions ? ' (সঙ্গে সঙ্গে রায়)' : '') + '</div>' + q.options.map((o, i) => (o ? b('pick', OPT_LABELS[i] + ') ' + esc(o.slice(0, 22)), l.picked === i ? 'on' : '', String(i), '', l.eliminated.includes(i)) : '')).join('');
      if (r && r.features.lifelines) h += '<div class="deck-sep">লাইফলাইন' + (l.active ? ' — ' + esc((Sel.team(l.active) || {}).name || '') : '') + '</div>' + b('lifeline', '½ ৫০:৫০', 'gold', 'fifty', 'Alt+1', l.active && Sel.lifelineUsed(l.active, 'fifty')) + b('lifeline', '📊 দর্শক পোল', 'gold', 'poll', 'Alt+2', l.active && Sel.lifelineUsed(l.active, 'poll')) + b('lifeline', '🔄 ফ্লিপ প্রশ্ন', 'gold', 'flip', 'Alt+3', l.active && Sel.lifelineUsed(l.active, 'flip'));
      h += timerRow + '<div class="deck-sep">ভয়েস ও প্রশ্ন</div>' + b('speak', '🔊 প্রশ্ন পড়ো', '', 'question', 'E') + b('speak', '🔊 বিকল্প পড়ো', '', 'options') + b('speak', '🔊 উত্তর পড়ো', '', 'answer', 'A') + b('speak', '🔊 দলের নাম', '', 'team', 'T') + b('qStep', '⏮ আগের প্রশ্ন', '', '-1') + b('qStep', 'পরের প্রশ্ন ⏭', '', '1') + b('gotoGrid', '▦ প্রশ্ন বোর্ড');
      h += '</div></div>';
    } else if (sc === 'PRELIM_Q') {
      const idx = s.prelimLive.idx; const q = Sel.prelimQuestions()[idx];
      h += '<div class="card"><h3>বাছাই প্রশ্ন ' + bn(idx + 1) + (q && q.star ? ' ★' : '') + '</h3>' + (q ? '<div class="qm-box"><div class="q">' + esc(q.text) + '</div><div class="a">উত্তর: ' + esc(q.answer || '—') + '</div></div>' : '') +
        '<div class="deck" style="margin-top:.6rem">' + b('prelimAnswer', s.prelimLive.reveal ? '🙈 উত্তর লুকাও' : '👁 উত্তর দেখাও (ANSWER)', 'lg gold span2', '', 'R') + b('speak', '🔊 প্রশ্ন পড়ো', '', 'question', 'E') + b('speak', '🔊 উত্তর পড়ো', '', 'answer', 'A') + timerRow + '</div></div>';
    } else if (sc === 'GRID') {
      const r = Sel.round(s.show.params.roundId);
      h += '<div class="card"><h3>প্রশ্ন বোর্ড — ' + esc(r ? r.name : '') + ' <span class="hint">দল যে নম্বর বেছে নেবে সেটিতে ক্লিক করুন</span></h3><div class="deck">' + (r ? Sel.roundQuestions(r.id).map((q) => b('loadQ', bn(q.number), s.board.played[q.id] ? 'ghost' : 'primary', q.id)).join('') : '') + '</div></div>';
    } else if (sc === 'FINAL') {
      h += '<div class="card"><h3>চূড়ান্ত ফলাফল প্রকাশ</h3><div class="deck">' + b('finalReveal', '▲ পরের স্থান প্রকাশ', 'lg gold span2', '', 'R') + b('finalAll', 'সব প্রকাশ') + b('jump', '🏆 বিজয়ী', 'good', 'WINNER', 'W') + '</div></div>';
    } else if (sc === 'WINNER') {
      h += '<div class="card"><h3>বিজয়ী</h3><div class="deck">' + b('music', '🎺 বিজয়ী সংগীত', 'gold', 'winner') + b('cue', '🎉 ফ্যানফেয়ার', '', 'fanfare') + b('replay', '🎊 আবার উদযাপন') + b('jump', 'সমাপনী লোগো', '', 'END') + '</div></div>';
    } else if (sc === 'THEME' || sc === 'WELCOME') {
      const slot = sc === 'THEME' ? 'theme' : 'welcome';
      h += '<div class="card"><h3>' + (slot === 'theme' ? 'থিম সং' : 'স্বাগত সংগীত') + ' <span class="hint">' + esc(Media.label(s.audio.music[slot].media)) + '</span></h3><div class="deck">' + b('music', '▶ বাজাও', 'good', slot) + b('musicStop', '■ থামাও (ফেড)', 'bad', slot) + '</div></div>';
    } else if (sc === 'PRELIM_COUNTDOWN' || sc === 'MAIN_COUNTDOWN') {
      h += '<div class="card"><h3>কাউন্টডাউন</h3><div class="deck">' + b('replay', '↻ আবার শুরু') + '</div></div>';
    } else if (sc === 'PRELIM_RESULT' || sc === 'FINALISTS') {
      h += '<div class="card"><h3>চূড়ান্ত দল</h3><div class="deck">' + b('tab', 'বাছাই ট্যাবে সম্পাদনা', '', 'prelim') + b('confirmFinalists', '✓ শীর্ষ ' + bn(s.prelim.finalistCount) + ' নিশ্চিত করুন', 'good span2') + '</div></div>';
    }
    if (sc !== 'QUESTION' && sc !== 'PRELIM_Q') h += '<div class="card"><div class="deck">' + timerRow + '</div></div>';
    return h;
  },
  teamDeck(s) {
    const ids = Sel.finalistIds();
    const l = s.live;
    const pick = this.picker === 'challenge';
    let h = '<div class="card"><h3>' + (pick ? '⚔ চ্যালেঞ্জার দল বেছে নিন (১–৮)' : 'দল ও স্কোর <span class="hint">ক্লিক = উত্তরদাতা দল (১–৮)</span>') + '</h3><div class="team-chips">';
    h += ids.map((id, i) => {
      const t = Sel.team(id); if (!t) return '';
      const sel = pick ? false : (l.active === id || l.challenger === id);
      return '<button class="chip' + (sel ? ' sel' : '') + '" style="--team:' + esc(t.color) + '" data-act="' + (pick ? 'challenge' : 'setActive') + '" data-arg="' + esc(id) + '"><span class="dot">' + (t.photo ? '<img data-media="' + esc(t.photo) + '" alt="">' : bn(i + 1)) + '</span>' + esc(t.name) + ' <span class="pts">' + bn(Sel.score(id)) + '</span></button>';
    }).join('');
    h += '</div>';
    if (pick) h += '<div class="row" style="margin-top:.5rem"><button class="btn sm" data-act="cancelPicker">বাতিল (Esc)</button></div>';
    h += '<div class="row" style="margin-top:.5rem"><select id="adjTeam" aria-label="দল" style="flex:1 1 140px">' + ids.map((id) => '<option value="' + esc(id) + '"' + (id === l.active ? ' selected' : '') + '>' + esc((Sel.team(id) || {}).name) + '</option>').join('') + '</select><input id="adjVal" type="number" value="5" style="width:80px" aria-label="নম্বর"><button class="btn sm good" data-act="adjust" data-arg="1">+ যোগ</button><button class="btn sm bad" data-act="adjust" data-arg="-1">− বিয়োগ</button></div></div>';
    return h;
  },

  /* ---------------- tabs ---------------- */
  renderTabs() {
    $('#tabs').innerHTML = TABS.map(([k, label]) => '<button role="tab" aria-selected="' + (k === this.tab) + '" class="' + (k === this.tab ? 'active' : '') + '" data-act="tab" data-arg="' + k + '">' + label + '</button>').join('');
  },
  renderTab(force) {
    if (!force && this.typing()) { this.tabDirty = true; return; }
    this.tabDirty = false;
    const body = $('#tabBody'); if (!body) return;
    const scrolls = $$('[data-keep-scroll]', body).map((el) => [el.dataset.keepScroll, el.scrollTop]);
    const winY = window.scrollY;
    const fn = TabRender[this.tab] || TabRender.show;
    body.innerHTML = safe('tab:' + this.tab, () => fn(Store.state), '<div class="card">এই ট্যাব লোড করা যায়নি — লগ দেখুন</div>');
    scrolls.forEach(([k, y]) => { const el = $('[data-keep-scroll="' + k + '"]', body); if (el) el.scrollTop = y; });
    window.scrollTo(0, winY);
    Media.hydrate(body);
    const cur = $('.rd.cur', body); if (cur && !scrolls.length) cur.scrollIntoView({ block: 'center' });
  },
};

const TABS = [['show', '🎬 শো'], ['prelim', '📝 বাছাই'], ['teams', '👥 দল'], ['questions', '❓ প্রশ্ন'], ['rounds', '🔁 রাউন্ড'], ['event', '🏷 ইভেন্ট'], ['design', '🎨 ডিজাইন'], ['media', '🖼 মিডিয়া'], ['audio', '🔊 অডিও'], ['system', '⚙ সিস্টেম']];

/* =====================================================================
   ACTIONS — every button and shortcut resolves to one of these.
   ===================================================================== */
const Actions = {
  closeModal() { UI.closeModal(); },
  tab(k) { UI.tab = k; UI.savePref('tab', k); UI.renderTabs(); UI.renderTab(true); },
  openStage() { Sync.openStage(); },
  previewFull() { const el = $('#preview .stage'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el && el.requestFullscreen) el.requestFullscreen().catch((e) => UI.toast('ফুলস্ক্রিন হয়নি: ' + e.message, 'err')); },
  blackout() { Show.toggleBlackout(); },
  undo() { const l = Store.undo(); UI.toast(l ? 'আনডু: ' + l : 'আনডু করার কিছু নেই', l ? 'ok' : ''); },
  redo() { const l = Store.redo(); UI.toast(l ? 'রিডু: ' + l : 'রিডু করার কিছু নেই', l ? 'ok' : ''); },
  stopAudio() { AudioDirector.stopAll(); Cue.music('theme', 'stop'); Cue.music('welcome', 'stop'); Cue.music('winner', 'stop'); Cue.music('background', 'stop'); Speech.stop(); },
  shortcuts() { UI.modal('কিবোর্ড শর্টকাট', '<div class="kbd-grid">' + SHORTCUTS.map(([k, d]) => '<div><kbd>' + esc(k) + '</kbd><span>' + esc(d) + '</span></div>').join('') + '</div>'); },
  prev() { Show.prev(); },
  next() { Show.next(); },
  replay() { const rd = Show.rundown(); const st = rd[Show.index()] || { key: Show.currentKey(), scene: Store.state.show.scene, params: Store.state.show.params }; if (st.scene === 'QUESTION') { Game.load(st.params.qid, Store.state.live.active); Store.commit('replay', (s) => { s.show.startedAt = now(); }, { undo: false }); } else Show.go(st); },
  goStep(i) { const st = Show.rundown()[int(i)]; if (st) Show.go(st); },
  jump(scene) { if (scene === 'SCOREBOARD') Show.scoreboard(); else Show.jump(scene); },
  scoreboard() { Show.scoreboard(); },
  timerToggle() { Timer.toggle(); },
  timerDirect() { Timer.start('direct', Timer.durationFor('direct')); },
  timerPass() { Timer.start('pass', Timer.durationFor('pass')); },
  timerReset() { Timer.reset(); },
  timerAdd(v) { Timer.add(int(v, 10)); },
  timerCustom() { const v = prompt('কত সেকেন্ড?', '30'); if (v && num(v) > 0) Timer.start('custom', num(v)); },
  judge(kind) { Game.judge(kind); },
  reveal() { Game.reveal(); },
  pass() { Game.pass(); },
  challengePick() { UI.picker = UI.picker === 'challenge' ? '' : 'challenge'; UI.liveSig = ''; UI.renderLive(); },
  cancelPicker() { UI.picker = ''; UI.liveSig = ''; UI.renderLive(); },
  challenge(id) { UI.picker = ''; Game.challenge(id); UI.liveSig = ''; UI.renderLive(); },
  setActive(id) { Game.setActive(id); },
  options() { Game.showOptions(); },
  pick(i) { Game.pick(int(i)); },
  lifeline(k) { Game.useLifeline(k); },
  speak(what) { AudioDirector.unlock(); ({ question: () => Speech.readQuestion(true), options: () => Speech.readOptions(true), answer: () => Speech.readAnswer(true), team: () => Speech.readTeam(true), round: () => Speech.readRound(true) }[what] || (() => {}))(); },
  qStep(d) {
    const s = Store.state; const r = Sel.round(s.live.roundId); if (!r) return;
    const qs = Sel.roundQuestions(r.id); const i = qs.findIndex((q) => q.id === s.live.qid);
    const nq = qs[clamp(i + int(d), 0, qs.length - 1)];
    if (nq && nq.id !== s.live.qid) { if (int(d) > 0) Game.advanceTurn(r.id); Show.jump('QUESTION', { key: nq.id, roundId: r.id, qid: nq.id }); }
  },
  gotoGrid() { const r = Sel.currentRound(); if (r) Show.jump('GRID', { key: r.id, roundId: r.id }); },
  loadQ(qid) { const q = Sel.question(qid); if (!q) return; if (Store.state.show.scene === 'GRID' && Store.state.live.qid && Store.state.live.qid !== qid && Store.state.live.result) Game.advanceTurn(q.roundId); Show.jump('QUESTION', { key: q.id, roundId: q.roundId, qid: q.id }); },
  showQ(qid) { Actions.loadQ(qid); },
  prelimAnswer() { Show.prelimToggleAnswer(); },
  prelimShow(i) { Show.prelimShow(int(i), false); },
  prelimReveal(i) { Show.prelimShow(int(i), true); },
  finalReveal() { Show.revealFinalNext(); },
  finalAll() { Store.commit('final-all', (s) => { s.finalReveal = Sel.finalistIds().length; }, { undo: false }); Cue.play('fanfare'); },
  music(slot) { AudioDirector.unlock(); Cue.music(slot, 'play'); },
  musicStop(slot) { Cue.music(slot, 'stop'); },
  cue(name) { AudioDirector.unlock(); Cue.play(name); },
  adjust(sign) {
    const team = $('#adjTeam') && $('#adjTeam').value; const v = int($('#adjVal') && $('#adjVal').value, 0);
    if (!team || !v) { UI.toast('দল ও নম্বর দিন', 'err'); return; }
    const reason = prompt('কারণ (ঐচ্ছিক)', int(sign) > 0 ? 'বোনাস' : 'পেনাল্টি');
    if (reason === null) return;
    Game.adjust(team, v * int(sign, 1), reason);
  },
  confirmFinalists() { const l = Show.confirmFinalists(); UI.toast('চূড়ান্ত দল নিশ্চিত: ' + l.length + 'টি', 'ok'); },
};

const SHORTCUTS = [
  ['Space', 'টাইমার চালু / বিরতি'], ['→ / PgDn', 'পরের দৃশ্য'], ['← / PgUp', 'আগের দৃশ্য'], ['D', 'সরাসরি টাইমার (৬০s)'], ['P', 'পাস: পরের দল + ৪৫s'], ['Shift+P', 'শুধু ৪৫s টাইমার'],
  ['R', 'উত্তর দেখাও / পরের স্থান প্রকাশ'], ['C', 'সঠিক'], ['X', 'ভুল'], ['N', 'নো স্কোর'], ['H', 'চ্যালেঞ্জ (তারপর ১–৮)'], ['V', 'বিকল্প দেখাও/লুকাও'],
  ['1–9', 'উত্তরদাতা দল বেছে নাও'], ['Alt+1/2/3', '৫০:৫০ / পোল / ফ্লিপ'], ['0', 'টাইমার রিসেট'], ['+ / −', '১০ সেকেন্ড যোগ / বিয়োগ'], ['S', 'স্কোরবোর্ড'], ['W', 'বিজয়ী'],
  ['B', 'ব্ল্যাকআউট'], ['F', 'ফুলস্ক্রিন'], ['O', 'স্টেজ উইন্ডো খোলো'], ['E', 'প্রশ্ন পড়ে শোনাও'], ['A', 'উত্তর পড়ে শোনাও'], ['T', 'দলের নাম পড়ো'], ['M', 'সব সংগীত/ভয়েস থামাও'],
  ['G', 'প্রশ্ন বোর্ড'], ['Ctrl+Z', 'আনডু'], ['Ctrl+Y', 'রিডু'], ['Ctrl+S', 'এখনই সংরক্ষণ'], ['?', 'এই তালিকা'], ['Esc', 'বাতিল / বন্ধ'],
];

/* =====================================================================
   KEYBOARD — works in the Control window and is forwarded from Stage.
   ===================================================================== */
const Keys = {
  init() {
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) && e.key !== 'Escape') {
        if (!(e.ctrlKey && e.key.toLowerCase() === 's')) return;
      }
      if (MODE === 'stage') {
        if (e.key === 'f' || e.key === 'F' || e.key === 'F11') { e.preventDefault(); Stage.toggleFullscreen(); return; }
        Sync.send({ type: 'key', key: e.key, mods: { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey } });
        if ([' ', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.key)) e.preventDefault();
        return;
      }
      if (MODE !== 'control') return;
      if (this.handle(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }, e.code)) e.preventDefault();
    });
  },
  handle(key, m = {}, code = '') {
    AudioDirector.unlock();
    if ($('.modal-back')) { if (key === 'Escape') { UI.closeModal(); return true; } return false; }
    if (document.body.classList.contains('role-host') && !['?', 'Escape'].includes(key)) return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    const s = Store.state;
    if (m.ctrl) {
      if (k === 'z' && !m.shift) { Actions.undo(); return true; }
      if (k === 'y' || (k === 'z' && m.shift)) { Actions.redo(); return true; }
      if (k === 's') { Store.persist(); UI.toast('সংরক্ষিত', 'ok'); return true; }
      return false;
    }
    if (m.alt) {
      const d = code ? code.replace('Digit', '') : key;
      if (d === '1') { Actions.lifeline('fifty'); return true; }
      if (d === '2') { Actions.lifeline('poll'); return true; }
      if (d === '3') { Actions.lifeline('flip'); return true; }
      return false;
    }
    if (/^[1-9]$/.test(k)) {
      const id = Sel.finalistIds()[int(k) - 1];
      if (!id) return false;
      if (UI.picker === 'challenge') Actions.challenge(id); else Actions.setActive(id);
      return true;
    }
    switch (k) {
      case ' ': Actions.timerToggle(); return true;
      case 'ArrowRight': case 'PageDown': Actions.next(); return true;
      case 'ArrowLeft': case 'PageUp': Actions.prev(); return true;
      case 'Enter': if (s.show.scene === 'FINAL') Actions.finalReveal(); else Actions.next(); return true;
      case 'd': Actions.timerDirect(); return true;
      case 'p': if (m.shift || s.show.scene !== 'QUESTION') Actions.timerPass(); else Actions.pass(); return true;
      case 'r': if (s.show.scene === 'PRELIM_Q') Actions.prelimAnswer(); else if (s.show.scene === 'FINAL') Actions.finalReveal(); else Actions.reveal(); return true;
      case 'c': Actions.judge('correct'); return true;
      case 'x': Actions.judge('wrong'); return true;
      case 'n': Actions.judge('noscore'); return true;
      case 'h': Actions.challengePick(); return true;
      case 'v': Actions.options(); return true;
      case '0': Actions.timerReset(); return true;
      case '+': case '=': Actions.timerAdd(10); return true;
      case '-': Actions.timerAdd(-10); return true;
      case 's': Actions.scoreboard(); return true;
      case 'w': Actions.jump('WINNER'); return true;
      case 'g': Actions.gotoGrid(); return true;
      case 'b': Actions.blackout(); return true;
      case 'f': Actions.previewFull(); return true;
      case 'o': Actions.openStage(); return true;
      case 'e': Actions.speak('question'); return true;
      case 'a': Actions.speak('answer'); return true;
      case 't': Actions.speak('team'); return true;
      case 'm': Actions.stopAudio(); return true;
      case '?': case 'F1': Actions.shortcuts(); return true;
      case 'Escape': if (UI.picker) { Actions.cancelPicker(); return true; } return false;
      case 'Home': Actions.goStep(0); return true;
      default: return false;
    }
  },
};
