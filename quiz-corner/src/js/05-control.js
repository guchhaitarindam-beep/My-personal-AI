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
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="row"><h2 style="flex:1">' + esc(title) + '</h2><button class="btn sm" data-act="closeModal">Close (Esc)</button></div>' + html + '</div>';
    back.addEventListener('click', (e) => { if (e.target === back) this.closeModal(); });
    document.body.appendChild(back);
    const f = $('button, input, select, textarea', back); if (f) f.focus();
    return back;
  },
  closeModal() { $$('.modal-back').forEach((m) => m.remove()); },
  /** A slide-up panel from the bottom (MORE, history …) — a lighter modal. */
  sheet(title, html) { const back = this.modal(title, html); back.classList.add('sheet-back'); return back; },
  /** Simple yes / no: one sentence, CANCEL and the action. */
  confirmBox(title, text, okLabel, fn, kind = 'bad') {
    const back = this.modal(title, '<p class="confirm-text">' + esc(text) + '</p><div class="confirm-row"><button class="btn lg" data-act="closeModal">CANCEL</button><button class="btn lg ' + kind + '" id="confirmOk">' + esc(okLabel) + '</button></div>');
    back.classList.add('confirm-back');
    const ok = $('#confirmOk', back); ok.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.closeModal(); safe('confirm', fn); });
    setTimeout(() => ok.focus(), 0);
  },
  /** After an important change: a short message with an UNDO button, then it goes away. */
  undoToast(msg) {
    if (Store.sandbox || MODE !== 'control') return;
    let host = $('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    $$('.toast.undo', host).forEach((x) => x.remove());
    const el = document.createElement('div'); el.className = 'toast undo';
    el.innerHTML = '<span>' + esc(msg) + '</span><button class="btn sm gold" data-act="undo">UNDO</button>';
    host.appendChild(el); setTimeout(() => el.remove(), 6000);
  },
  setLive(on) {
    document.body.classList.toggle('live-mode', !!on); this.savePref('live', !!on);
    this.liveSig = ''; this.renderLive(); this.renderStatus();
    if (on) window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  mount() {
    document.body.classList.add('mode-control');
    document.body.innerHTML = `
<div class="ctl">
  <header class="topbar" role="banner">
    <button class="btn menu-btn" data-act="menuToggle" id="btnMenu" aria-haspopup="true" aria-expanded="false">☰ MENU</button>
    <div class="brandmark"><img data-media="${esc(Store.state.logo)}" alt=""><div><b id="evName">${esc(Store.state.event.programme || 'Quiz Corner')}</b><small>QUIZ CORNER</small></div></div>
    <span class="status-pill live-pill" id="pillReh">● LIVE</span>
    <span class="status-pill" id="pillStage">STAGE —</span>
    <span class="status-pill" id="pillSave">Saved</span>
    <span class="grow"></span>
    <label class="vol" title="Master volume ( [ and ] )"><span id="volIcon">🔊</span><input type="range" id="volRange" min="0" max="1" step="0.05" aria-label="Master volume"></label>
    <button class="btn primary" data-act="openStage" title="O">🖥 Stage <kbd>O</kbd></button>
    <button class="btn" data-act="navSettings" title="Settings">⚙ Settings</button>
    <div class="menu-panel" id="menuPanel" hidden>
      <div class="mp-grid">
        <button class="btn lg" data-act="previewFull" title="F">⛶ Full screen <kbd>F</kbd></button>
        <button class="btn lg" data-act="blackout" title="B">◼ Blackout <kbd>B</kbd></button>
        <button class="btn lg" data-act="undo" id="btnUndo" title="Ctrl+Z">↶ Undo</button>
        <button class="btn lg" data-act="redo" id="btnRedo" title="Ctrl+Y">↷ Redo</button>
        <button class="btn lg" data-act="stopAudio" title="Stop all music and voice">■ Stop music</button>
        <button class="btn lg" data-act="mute" id="btnMute" title="M">🔇 Mute <kbd>M</kbd></button>
        <button class="btn lg" data-act="shortcuts" title="?">⌨ Shortcuts</button>
        <label class="field mp-role"><span>Who is using this screen</span><select id="roleSel" aria-label="Role">
          <option value="controller">Controller</option><option value="quizmaster">Quiz master</option><option value="host">Host (view only)</option>
        </select></label>
      </div>
    </div>
  </header>
  <div id="announce" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  <main class="ctl-main">
    <section class="live-col" aria-label="Live controls">
      <div class="preview-box" id="preview" aria-label="Stage preview"></div>
      <div id="live"></div>
    </section>
    <section aria-label="Preparation and settings">
      <nav class="tabs" id="tabs" role="tablist"></nav>
      <div class="tab-body" id="tabBody"></div>
    </section>
  </main>
  <nav class="dock" aria-label="Quick actions">
    <button class="dk" data-act="navHome" data-dock="home"><i>🏠</i>HOME</button>
    <button class="dk" data-act="navLive" data-dock="live"><i>🔴</i>LIVE</button>
    <button class="dk" data-act="navTeams" data-dock="teams"><i>👥</i>TEAMS</button>
    <button class="dk" data-act="navQuestions" data-dock="questions"><i>❓</i>QUESTIONS</button>
    <button class="dk" data-act="moreOpen" data-dock="more"><i>☰</i>MORE</button>
  </nav>
</div>`;
    this.preview = new StageView($('#preview'), { preview: true });
    const pref = safe('prefs', () => JSON.parse(localStorage.getItem(LS_PREF) || '{}'), {}) || {};
    $('#roleSel').value = pref.role || 'controller';
    this.applyRole();
    if (pref.bigUi) document.body.classList.add('big-ui');
    if (pref.live) document.body.classList.add('live-mode');
    this.tab = pref.tab && pageInfo(pref.tab) ? pref.tab : '';
    this.renderTabs();
    this.bindEvents();
    this.renderAll();
    if (Store.damaged) setTimeout(() => this.toast('A damaged save was ignored — the show was restored from the last good copy', 'err'), 800);
  },
  savePref(k, v) { safe('prefs', () => { const p = JSON.parse(localStorage.getItem(LS_PREF) || '{}'); p[k] = v; localStorage.setItem(LS_PREF, JSON.stringify(p)); }); },
  applyRole() {
    const role = $('#roleSel').value;
    document.body.classList.remove('role-controller', 'role-quizmaster', 'role-host');
    document.body.classList.add('role-' + role);
  },

  bindEvents() {
    // opened by the one-click launcher the browser allows sound at once; otherwise the first click or key starts it
    if (AudioDirector.isOutput()) AudioDirector.unlock();
    document.addEventListener('keydown', () => AudioDirector.unlock(), true);
    document.addEventListener('click', (e) => {
      AudioDirector.unlock();
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const fn = Actions[el.dataset.act];
      if (!fn) { Log.add('WARN', 'unknown action ' + el.dataset.act); return; }
      e.preventDefault();
      if (el.closest('.sheet-back') && el.dataset.act !== 'closeModal') UI.closeModal();
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
    const dropOf = (e) => (e.target && e.target.closest ? e.target.closest('[data-drop]') : null);
    document.addEventListener('dragover', (e) => { const z = dropOf(e); if (z) { e.preventDefault(); z.classList.add('over'); } });
    document.addEventListener('dragleave', (e) => { const z = dropOf(e); if (z) z.classList.remove('over'); });
    document.addEventListener('drop', (e) => {
      const z = dropOf(e); if (!z) return;
      e.preventDefault(); z.classList.remove('over');
      const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif)$/i.test(x.name));
      if (f) Actions.memPhotoFile(z.dataset.drop, f); else UI.toast('Drag in an image file (JPG/PNG/WEBP)', 'err');
    });
    document.addEventListener('mouseover', (e) => { this.hoverDrop = dropOf(e); });
    document.addEventListener('paste', (e) => {
      const a = document.activeElement;
      const z = this.hoverDrop || (a && a.closest ? a.closest('[data-drop]') : null);
      if (!z || !document.body.contains(z)) return;
      const it = Array.from((e.clipboardData && e.clipboardData.items) || []).find((x) => x.type && x.type.startsWith('image/'));
      if (!it) return;
      e.preventDefault();
      const f = it.getAsFile(); if (f) Actions.memPhotoFile(z.dataset.drop, new File([f], 'pasted-' + Date.now() + '.png', { type: f.type || 'image/png' }));
    });
    document.addEventListener('change', onBind);
    document.addEventListener('focusout', () => setTimeout(() => { if (this.tabDirty && !this.typing()) this.renderTab(); }, 0));
    $('#roleSel').addEventListener('change', () => { this.applyRole(); this.savePref('role', $('#roleSel').value); });
    $('#volRange').addEventListener('input', (e) => { const v = clamp(num(e.target.value, 1), 0, 1); Store.commit('volume', (s) => { s.audio.master = v; }, { undo: false }); AudioDirector.setMaster(v); });
    // the MENU panel closes on any click outside it, and after any button inside it
    document.addEventListener('click', (e) => { const m = $('#menuPanel'); if (!m || m.hidden) return; if (e.target.closest('#btnMenu')) return; if (!e.target.closest('#menuPanel') || e.target.closest('button')) { m.hidden = true; $('#btnMenu').setAttribute('aria-expanded', 'false'); } });
    Bus.on('change', (c) => this.onChange(c));
    Bus.on('stage-status', () => this.renderStatus());
    Bus.on('storage', () => this.renderStatus());
    Bus.on('rehearsal', () => this.renderStatus());
    Bus.on('media', () => { if (this.tab === 'media' || this.tab === 'teams' || !this.tab) this.renderTab(); });
    document.addEventListener('input', (e) => { if (e.target.id !== 'navSearch') return; const q = e.target.value.trim().toLowerCase(); $$('.set-row').forEach((r) => { r.hidden = !!q && !r.textContent.toLowerCase().includes(q); }); $$('.set-group').forEach((g) => { g.hidden = !$$('.set-row', g).some((r) => !r.hidden); }); });
    Bus.on('music', () => { this.liveSig = ''; this.renderLive(); });
    Bus.on('log', () => { const l = $('#logBox'); if (l) { l.textContent = Log.lines.slice(-120).join('\n'); l.scrollTop = l.scrollHeight; } });
    Bus.on('voices', () => { if (this.tab === 'voice') this.renderTab(); });
    setInterval(() => this.renderStatus(), 1500);
    setInterval(() => this.renderClock(), 200);
  },
  typing() { const a = document.activeElement; return !!(a && a.closest('#tabBody') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'range' && a.type !== 'color'); },
  onChange(c) {
    DesignSystem.apply();
    AudioDirector.setBoost();
    this.preview.render();
    const label = (c && c.label) || '';
    Announcer.onChange(c, Store.state);
    const hl = HostLines.auto(label); if (hl) this.hostLine = hl;
    const um = UNDO_MSG(label); if (um && !(c && c.undo === false) && Store.past.length && Store.past[Store.past.length - 1].label === label) this.undoToast(um);
    const qk = Store.state.live.qid + '|' + Store.state.prelimLive.idx + '|' + Store.state.show.scene; if (qk !== this.ansKey) { this.ansKey = qk; this.showAns = false; }
    this.renderLive();
    if (label.startsWith('timer-')) return;
    if (this.fromBind && !label.startsWith('edit:show')) return; // the input already shows the value
    if (this.typing()) { this.tabDirty = true; return; }
    this.renderTab();
  },
  renderAll() { DesignSystem.apply(); this.preview.render(); this.renderLive(); this.renderTab(); this.renderStatus(); Media.hydrate(document.body); },
  renderStatus() {
    const st = $('#pillStage'); if (!st) return;
    const ok = Sync.connected();
    st.textContent = ok ? 'STAGE ● Connected' : 'STAGE ○ Not connected';
    st.className = 'status-pill ' + (ok ? 'ok' : 'bad');
    const sv = $('#pillSave');
    sv.textContent = Store.storageOk ? (Store.rehearsal ? 'Rehearsal (saved separately)' : 'Auto-saved ✓') : 'Save failed!';
    sv.className = 'status-pill ' + (Store.storageOk ? 'ok' : 'bad');
    const lp = $('#pillReh'); lp.textContent = Store.rehearsal ? '● REHEARSAL' : '● LIVE'; lp.className = 'status-pill live-pill ' + (Store.rehearsal ? 'reh' : 'on');
    const live = document.body.classList.contains('live-mode');
    const dockKey = live ? 'live' : this.tab === 'teams' ? 'teams' : this.tab === 'questions' ? 'questions' : !this.tab ? 'home' : 'more';
    $$('.dock .dk').forEach((d) => d.classList.toggle('on', d.dataset.dock === dockKey));
    const vr = $('#volRange'); if (vr && document.activeElement !== vr) vr.value = String(Store.state.audio.master);
    const vi = $('#volIcon'); if (vi) vi.textContent = SoundDirector.muted ? '🔇' : '🔊';
    const ev = $('#evName'); if (ev) ev.textContent = Store.state.event.programme || 'Quiz Corner';
    $('#btnUndo').disabled = !Store.past.length; $('#btnRedo').disabled = !Store.future.length;
    $('#btnUndo').title = Store.past.length ? 'Undo: ' + Store.past[Store.past.length - 1].label : 'Undo';
  },
  renderClock() {
    const el = $('#bigTime'); if (!el) return;
    const s = Store.state; const t = s.timer; const rem = Sel.timerRemaining(t); const sec = Math.ceil(rem / 1000);
    el.textContent = t.expired ? '0' : fmtTime(rem);
    const ht = $('#heroTime'); if (ht) { ht.textContent = el.textContent; ht.className = 'hero-time ' + el.className.replace('bigtime', '').trim(); }
    el.className = 'bigtime ' + (t.expired || sec <= s.settings.critAt ? 'crit' : sec <= s.settings.warnAt ? 'warn' : '');
    const tb = $('[data-act="timerToggle"]'); if (tb) tb.innerHTML = (t.running ? '⏸ Pause' : '▶ Start') + ' <kbd>Space</kbd>';
  },

  /* ---------------- live column ---------------- */
  renderLive() {
    const html = safe('live', () => this.liveHtml(), '<div class="card">Live panel could not be loaded</div>');
    if (html === this.liveSig) return;
    this.liveSig = html;
    const host = $('#live');
    const focusKey = document.activeElement && host.contains(document.activeElement) ? (document.activeElement.dataset.act || '') + '|' + (document.activeElement.dataset.arg || '') : '';
    host.innerHTML = html;
    Media.hydrate(host);
    Coach.applyGlow(host, Store.state);
    this.renderClock();
    if (focusKey) { const [a, g] = focusKey.split('|'); const f = $$('[data-act="' + a + '"]', host).find((x) => (x.dataset.arg || '') === g); if (f) f.focus(); }
  },
  liveHtml() {
    const s = Store.state;
    const rd = Show.rundown(); const i = Show.index();
    const cur = rd[i]; const nxt = rd[i + 1];
    const b = (act, label, cls = '', arg = '', key = '', dis = false) => '<button class="btn ' + cls + '" data-act="' + act + '"' + (arg !== '' ? ' data-arg="' + esc(arg) + '"' : '') + (dis ? ' disabled' : '') + '>' + label + (key ? ' <kbd>' + key + '</kbd>' : '') + '</button>';
    // a black TV must never be a mystery to the operator
    let out = s.show.blackout ? '<div class="card blackout-alert"><b>⚠ The TV screen is black now (Blackout)</b><span>The audience sees nothing.</span>' + b('blackout', '▶ Show on TV again', 'lg good', '', 'B') + '</div>' : '';
    out += '<div class="card"><div class="now"><div><div class="scene-name">' + esc(cur ? cur.label : SCENE_LABELS[s.show.scene] || SCENES[s.show.scene] || s.show.scene) + '</div><div class="scene-sub">Step ' + (i + 1) + ' / ' + rd.length + (nxt ? ' • Next: ' + esc(nxt.label) : '') + '</div></div><span></span><div class="bigtime" id="bigTime">60</div></div>';
    out += '<div class="deck" style="margin-top:.6rem">' + b('prev', '◀ Previous', 'lg', '', '←') + b('next', 'Next ▶', 'lg primary', '', '→') + b('timerToggle', '▶ Start', 'lg', '', '') + b('replay', '↻ Replay scene', '') + b('scoreboard', '📊 Scoreboard', '', '', 'S') + '</div></div>';
    out = this.heroHtml(s, b) + out;
    if (s.settings.coach) out += Coach.html(s);
    out += this.contextDeck(s, b);
    out += this.teamDeck(s);
    out += this.photoDeck(s);
    out += '<div class="card"><div class="row"><button class="btn sm' + (this.boardOpen ? ' on' : '') + '" data-act="soundboardToggle">🎛 Soundboard</button></div>' + (this.boardOpen ? '<div class="deck" style="margin-top:.5rem">' + SOUNDBOARD.map(([k, l]) => b('pad', l, 'sm', k)).join('') + '</div>' : '') + '</div>';
    out += '<div class="card"><div class="row"><button class="btn sm' + (this.hostOpen ? ' on' : '') + '" data-act="hostToggle">🎙 Host helper (commentary)</button></div>' + (this.hostOpen ? '<p class="host-line">' + esc(this.hostLine || HostLines.line('open')) + '</p><div class="deck">' + b('hostLine', 'Score line', '', 'score') + b('hostLine', 'Wrong-answer line', '', 'wrong') + b('hostLine', 'Suspense', '', 'tension') + b('hostLine', 'Round-start line', '', 'open') + b('hostLine', 'Winner line', '', 'win') + b('hostSpeak', '🔊 Speak', 'good') + '</div>' : '') + '</div>';
    return out + this.actionBar(s, b);
  },
  /** LIVE: what the operator needs at a glance — team, question, timer, points, A–D. */
  heroHtml(s, b) {
    if (s.show.scene !== 'QUESTION' || !s.live.qid) return '';
    const l = s.live; const q = Sel.liveQuestion(); const r = Sel.round(l.roundId);
    const ans = Sel.team(Sel.answeringTeam());
    const who = l.audience ? '👥 Audience question' : ans ? Sel.label(ans) : 'Choose the team (1–8)';
    const opts = q ? q.options.map((o, i) => (o ? '<button class="btn hero-opt' + (l.picked === i ? ' on' : '') + '" data-act="pick" data-arg="' + i + '"' + (!l.optionsShown || l.eliminated.includes(i) ? ' disabled' : '') + ' title="Shift+' + 'ABCD'[i] + '"><b>' + 'ABCD'[i] + '</b><small>' + OPT_LABELS[i] + '</small></button>' : '')).join('') : '';
    return '<div class="card hero"><div class="hero-team" style="--team:' + esc(ans ? ans.color : 'var(--gold)') + '">' + esc(who) + '</div>' +
      '<div class="hero-q">' + esc(r ? r.name : '') + ' • QUESTION ' + String(q ? q.number : '').padStart(2, '0') + '</div>' +
      '<div class="hero-mid"><div class="hero-time" id="heroTime">—</div><div class="hero-pts">' + (l.audience ? 'NO POINTS' : signed(Game.pointsFor('correct')) + ' POINTS') + '</div></div>' +
      (opts ? '<div class="hero-opts">' + opts + '</div>' : '') + '</div>';
  },
  /** Always at the bottom of the live column: PASS · CORRECT · WRONG · NEXT (NEXT is the main action). */
  actionBar(s, b) {
    const q = s.show.scene === 'QUESTION' && s.live.qid && !s.live.audience; const r = Sel.round(s.live.roundId);
    return '<div class="action-bar">' + b('pass', '➜ PASS', 'violet', '', 'P', !q || (r && !r.features.pass)) + b('judge', '✓ CORRECT', 'good', 'correct', 'C', !q) + b('judge', '✕ WRONG', 'bad', 'wrong', 'W', !q) + b('next', 'NEXT ▶', 'next-main', '', '→') + '</div>';
  },
  contextDeck(s, b) {
    const sc = s.show.scene;
    let h = '';
    const timerRow = '<div class="deck-sep">Timer</div>' + b('timerDirect', '⏱ Direct ' + Timer.durationFor('direct') + 's', 'warn', '', 'D') + b('timerPass', '⏱ Pass/Bonus ' + Timer.durationFor('pass') + 's', 'violet', '', '⇧P') + b('timerReset', '⟲ Reset', '', '', '0') + b('timerAdd', '+10 sec', '', '10', '+') + b('timerAdd', '+5 sec', '', '5') + b('timerAdd', '−10 sec', '', '-10', '') + b('timerPreset', '⏱ 30s', '', '30') + b('timerPreset', '⏱ 60s', '', '60') + b('timerCustom', '⏱ Custom…');
    if (sc === 'QUESTION') {
      const l = s.live; const q = Sel.liveQuestion(); const r = Sel.round(l.roundId);
      const ans = Sel.team(Sel.answeringTeam());
      const pc = Game.pointsFor('correct'); const pw = Game.pointsFor('wrong');
      h += '<div class="card"><h3>Question controls <span class="hint">' + esc(r ? r.name : '') + ' • ' + Game.flowName(l.flow) + (ans ? ' • Answering: ' + esc(ans.name) : '') + '</span></h3>';
      if (q) h += '<div class="qm-box"><div class="q">' + esc(q.text) + '</div>' + this.ansHtml((q.options[q.answer] && !q.answerText ? OPT_LABELS[q.answer] + ') ' : '') + (q.answerText || q.options[q.answer] || '—'), s) + '</div>';
      if (q && q.clip) h += '<div class="deck" style="margin-top:.5rem"><div class="deck-sep">🎬 Question audio / video</div>' + b('clip', '▶ Play', 'good', 'play') + b('clip', '⏸ Pause', '', 'pause') + b('clip', '⟲ From start', '', 'restart') + b('clip', '■ Stop', 'bad', 'stop') + '</div>';
      h += '<div class="deck" style="margin-top:.6rem">' + b('judge', '✓ Correct ' + signed(pc), 'lg good', 'correct', 'C') + b('judge', '✗ Wrong ' + (pw ? signed(pw) : ''), 'lg bad', 'wrong', 'X') + b('judge', '○ No score', 'lg', 'noscore', 'N') + b('reveal', l.revealed ? '🙈 Hide answer' : '👁 Show answer', 'lg gold', '', 'R') + b('lock', l.locked ? '🔒 Locked (click to unlock)' : '🔓 Lock', l.locked ? 'lock-on' : '', '', 'L') + b('replay', '⟲ Reset question');
      h += '<div class="deck-sep">Flow</div>' + b('pass', (r && r.type === 'bonus' ? '➜ Bonus: next team' : '➜ Pass: next team') + ' (' + Timer.durationFor('pass') + 's)', 'violet span2', '', 'P', r && !r.features.pass) + b('challengePick', '⚔ Challenge', 'warn' + (this.picker === 'challenge' ? ' on' : ''), '', 'H', r && !r.features.challenge) + b('options', l.optionsShown ? 'Hide options' : 'Show 4 options (' + (r ? r.scoring.options4 : 5) + ')', '', '', 'V', !q || q.options.filter(Boolean).length < 2 || (r && !r.features.options)) + b('twoOptions', 'Cut to 2 options (' + (r ? r.scoring.options2 : 3) + ')', '', '', '⇧V', !q || (r && !r.features.options) || l.eliminated.length >= 2);
      if (q && l.optionsShown) h += '<div class="deck-sep">Option chosen by the team' + (r && r.features.judgeOptions ? ' (judged instantly)' : '') + '</div>' + q.options.map((o, i) => (o ? b('pick', OPT_LABELS[i] + ') ' + esc(o.slice(0, 22)), l.picked === i ? 'on' : '', String(i), '', l.eliminated.includes(i)) : '')).join('');
      if (r && r.features.lifelines) h += '<div class="deck-sep">Lifelines' + (l.active ? ' — ' + esc((Sel.team(l.active) || {}).name || '') : '') + '</div>' + b('lifeline', '½ 50:50', 'gold', 'fifty', 'Alt+1', l.active && Sel.lifelineUsed(l.active, 'fifty')) + b('lifeline', '📊 Audience poll', 'gold', 'poll', 'Alt+2', l.active && Sel.lifelineUsed(l.active, 'poll')) + b('lifeline', '🔄 Flip question', 'gold', 'flip', 'Alt+3', l.active && Sel.lifelineUsed(l.active, 'flip'));
      if (r && r.type === 'standard') h += b('bonus', '★ Bonus +' + r.scoring.manualBonus, 'gold', '', 'G', l.bonusGiven);
      if (r && r.features.challenge) {
        const others = Sel.finalistIds().filter((id) => id !== l.active);
        h += '<div class="deck-sep">✋ Buzz' + (r.features.singleChallenger ? ' (first team only)' : '') + ' — Shift+1–8</div>' + b('timerRaise', '✋ Buzz time ' + r.timers.raise + 's', 'warn');
        h += others.map((id) => { const t = Sel.team(id); if (!t) return ''; const up = l.hands.includes(id); const j = l.handsJudged[id]; return up && !j ? b('judgeHand', '✓ ' + esc(t.name) + ' +' + r.scoring.challengeRight, 'good', id + '|1') + b('judgeHand', '✕ ' + esc(t.name) + ' ' + r.scoring.challengeWrong, 'bad', id + '|0') + b('raiseHand', '✋ Lower', 'sm', id) : b('raiseHand', (j ? (j === 'right' ? '✓ ' : '✕ ') : '✋ ') + esc(t.name), up ? 'on' : '', id, '', !!j); }).join('');
      }
      h += timerRow + '<div class="deck-sep">Voice & question</div>' + b('speak', q && q.voiceQ ? '🎙 Play question' : '🔊 Read question', q && q.voiceQ ? 'good' : '', 'question', 'E') + b('speak', q && q.voiceOpt ? '🎙 Play options' : '🔊 Read options', q && q.voiceOpt ? 'good' : '', 'options') + b('speak', q && q.voiceAns ? '🎙 Play answer' : '🔊 Read answer', q && q.voiceAns ? 'good' : '', 'answer', 'A') + b('speak', '■ Stop reading', '', 'stop') + b('speak', '🔊 Team name', '', 'team', 'T') + b('qStep', '⏮ Previous question', '', '-1') + b('qStep', 'Next question ⏭', '', '1') + b('gotoGrid', '▦ Question board');
      h += '</div></div>';
    } else if (sc === 'PRELIM_Q') {
      const idx = s.prelimLive.idx; const q = Sel.prelimQuestions()[idx];
      h += '<div class="card"><h3>Prelim question ' + (idx + 1) + (q && q.star ? ' ★' : '') + '</h3>' + (q ? '<div class="qm-box"><div class="q">' + esc(q.text) + '</div>' + this.ansHtml(q.answer || '—', s) + '</div>' : '') +
        '<div class="deck" style="margin-top:.6rem">' + b('prelimAnswer', s.prelimLive.reveal ? '🙈 Hide answer' : '👁 Show answer (ANSWER)', 'lg gold span2', '', 'R') + b('speak', '🔊 Read question', '', 'question', 'E') + b('speak', '🔊 Read answer', '', 'answer', 'A') + timerRow + '</div></div>';
    } else if (sc === 'GRID') {
      const r = Sel.round(s.show.params.roundId);
      h += '<div class="card"><h3>Question board — ' + esc(r ? r.name : '') + ' <span class="hint">' + (r && Sel.team(Game.turnFor(r.id)) ? 'Turn: ' + esc(Sel.label(Sel.team(Game.turnFor(r.id)))) + ' (' + Sel.turnsLeft(r) + ' team turns left) — click the number the team picks' : r ? '✔ All teams have had their turn — the numbers left are AUDIENCE questions (no points). Open one, or Next ▶ → scoreboard' : '') + '. Played numbers are closed.</span></h3><div class="deck">' + (r ? Sel.roundQuestions(r.id).map((q) => b('loadQ', String(q.number) + (s.board.played[q.id] ? ' ✓' : ''), s.board.played[q.id] ? 'ghost' : 'primary', q.id, '', !!s.board.played[q.id])).join('') : '') + '</div></div>';
    } else if (sc === 'DRAW') {
      const d = s.draw; const turn = Sel.team(Draw.next());
      const cards = Draw.cards().map((it, i) => { const pk = d.picks.find((p) => p.card === i); const t = pk && Sel.team(pk.team); return pk ? b('drawPick', (it.emoji ? it.emoji + ' ' : '') + esc(it.label) + ' → ' + esc(t ? Sel.code(t) : '') + ' ' + esc(t ? Sel.preName(t) : ''), 'ghost', String(i), '', true) : b('drawPick', (it.emoji ? it.emoji + ' ' : '') + esc(it.label) + (d.pending === i ? ' — press again to open' : ''), d.pending === i ? 'gold' : 'primary', String(i), String(i + 1)); }).join('');
      h += '<div class="card"><h3>🎲 Podium lottery <span class="hint">' + (!d.queue.length ? 'Starts once the finalist teams are set' : turn ? 'Now: ' + esc(Sel.preName(turn)) + ' (prelim #' + (d.queue.indexOf(turn.id) + 1) + ') — press the picture the team names once (it lights up), press again to open the podium. Clicking on the TV screen or pressing 1–8 also works.' : '✔ Every team has a podium — team codes are set') + '</span></h3><div class="deck">' + cards + '</div><div class="deck" style="margin-top:.5rem">' + b('drawReset', '↺ Start over', 'warn') + b('undo', '↶ Undo last pick', '', '', 'U') + b('tab', 'Change theme / pictures', '', 'event') + '</div></div>' + this.schoolDeck(s);
    } else if (sc === 'FINAL') {
      h += '<div class="card"><h3>Final results reveal</h3><div class="deck">' + b('finalReveal', '▲ Reveal next place', 'lg gold span2', '', 'R') + b('finalAll', 'Reveal all') + b('jump', '🏆 Winner', 'good', 'WINNER', '⇧W') + '</div></div>';
    } else if (sc === 'WINNER') {
      h += '<div class="card"><h3>Winner</h3><div class="deck">' + b('music', '🎺 Winner music', 'gold', 'winner') + b('cue', '🎉 Fanfare', '', 'fanfare') + b('replay', '🎊 Celebrate again') + b('jump', 'Closing logo', '', 'END') + '</div></div>';
    } else if (sc === 'THEME' || sc === 'WELCOME') {
      const slot = sc === 'THEME' ? 'theme' : 'welcome';
      h += '<div class="card"><h3>' + (slot === 'theme' ? 'Theme song' : 'Welcome music') + ' <span class="hint">' + esc(Media.label(s.audio.music[slot].media)) + '</span></h3><div class="deck">' + b('music', '▶ Play', 'good', slot) + b('musicStop', '■ Stop (fade)', 'bad', slot) + '</div></div>';
    } else if (sc === 'PRELIM_COUNTDOWN' || sc === 'MAIN_COUNTDOWN') {
      h += '<div class="card"><h3>Countdown</h3><div class="deck">' + b('replay', '↻ Restart') + '</div></div>';
    } else if (sc === 'PRELIM_RESULT' || sc === 'FINALISTS' || sc === 'FINALIST_INTRO' || sc === 'WELCOME') {
      h += this.schoolDeck(s);
      if (sc === 'PRELIM_RESULT' || sc === 'FINALISTS') h += '<div class="card"><h3>Finalist teams</h3><div class="deck">' + b('tab', 'Edit in Prelim tab', '', 'prelim') + b('confirmFinalists', '✓ Confirm top ' + s.prelim.finalistCount, 'good span2') + '</div></div>';
    }
    if (sc !== 'QUESTION' && sc !== 'PRELIM_Q') h += '<div class="card"><div class="deck">' + timerRow + '</div></div>';
    return h;
  },
  /** The finalists' schools and preliminary scores, editable right here at the venue (typing, then Tab or a click elsewhere saves). */
  schoolDeck(s) {
    const ids = Sel.finalistIds();
    if (!ids.length) return '';
    const rows = ids.map((id, i) => {
      const ti = Sel.teamIndex(id); const t = s.teams[ti]; if (!t) return '';
      const tag = Sel.codeHidden(t) || (s.draw.on && !Sel.drawDone() && !Sel.drawPicked(id)) ? 'Prelim ' + (i + 1) : Sel.code(t);
      return '<div class="school-row" style="--team:' + esc(t.color) + '"><span class="sr-tag">' + esc(tag) + '</span><input type="text" data-bind="teams.' + ti + '.school" value="' + esc(t.school) + '" placeholder="Enter school name" aria-label="' + esc(tag) + ' school"><input type="number" data-bind="teams.' + ti + '.prelim.manual" data-type="nullnum" value="' + (t.prelim.manual == null ? '' : esc(t.prelim.manual)) + '" placeholder="Points" title="Prelim round points" aria-label="' + esc(tag) + ' prelim points"></div>';
    }).join('');
    return '<div class="card"><h3>🏫 Finalist schools and prelim points <span class="hint">Edit here — type and press Tab to update the TV at once; you can also edit in the Teams tab</span></h3><div class="school-list">' + rows + '</div></div>';
  },
  /** V100 quick photos: two members per team (16 for A / 1 … H / 8). Click, drop a file, or hover and press Ctrl+V.
      It opens by itself while the teams are being introduced. */
  photoDeck(s) {
    const auto = ['TEAMS_ALL', 'TEAM_INTRO', 'FINALIST_INTRO'].includes(s.show.scene);
    const open = this.photosOpen == null ? auto : this.photosOpen;
    const filled = s.teams.reduce((n, t) => n + (t.captainPhoto ? 1 : 0) + (t.playerPhotos[0] ? 1 : 0), 0);
    let h = '<div class="card"><div class="row"><button class="btn sm' + (open ? ' on' : '') + '" data-act="photosToggle">📷 Member photos — 2 per team (' + filled + ' / ' + (s.teams.length * 2) + ')</button><button class="btn sm" data-act="memBulk">⇪ Many photos at once</button></div>';
    if (open) {
      h += '<p class="muted" style="margin:.4rem 0">Click a photo slot • drag a file onto a slot • or copy an image, hover over the slot and press <kbd>Ctrl</kbd>+<kbd>V</kbd></p><div class="mem-grid">';
      h += s.teams.map((t, i) => {
        const cur = (s.show.scene === 'TEAM_INTRO' || s.show.scene === 'FINALIST_INTRO') && s.show.params.teamId === t.id;
        const slot = (k) => {
          const path = k === 0 ? 'teams.' + i + '.captainPhoto' : 'teams.' + i + '.playerPhotos.0';
          const npath = k === 0 ? 'teams.' + i + '.captain' : 'teams.' + i + '.players.0';
          const id = k === 0 ? t.captainPhoto : t.playerPhotos[0]; const nm = k === 0 ? t.captain : t.players[0];
          return '<div class="mslot"><button class="mthumb' + (id ? ' has' : '') + '" data-act="memPhoto" data-arg="' + esc(path) + '" data-drop="' + esc(path) + '" title="Member ' + (k + 1) + ' — click / drag a file / Ctrl+V">' + (id ? '<img data-media="' + esc(id) + '" alt="">' : '<span>＋<small>Member ' + (k + 1) + '</small></span>') + '</button><input type="text" data-bind="' + esc(npath) + '" value="' + esc(nm) + '" placeholder="Member ' + (k + 1) + (k === 0 ? ' (captain)' : '') + '" aria-label="' + esc(Sel.code(t)) + ' member ' + (k + 1) + '">' + (id ? '<button class="btn sm ghost" data-act="clearMedia" data-arg="' + esc(path) + '" title="Remove photo">✕</button>' : '') + '</div>';
        };
        return '<div class="mem-team' + (cur ? ' cur' : '') + '" style="--team:' + esc(t.color) + '"><div class="mt-head"><b class="mt-code">' + esc(Sel.code(t)) + '</b><span class="mt-name">' + esc(t.name === Sel.code(t) ? '' : t.name) + '</span></div>' + slot(0) + slot(1) + '</div>';
      }).join('');
      h += '</div>';
    }
    return h + '</div>';
  },
  /** V100 host panel: the answer stays hidden on the laptop until asked for (or always, by setting). */
  ansHtml(text, s) {
    if (s.settings.hostAnswer === 'always' || this.showAns) return '<div class="a">Answer: ' + esc(text) + '</div>';
    return '<div class="row" style="margin-top:.35rem"><button class="btn sm gold" data-act="showAnsHere">👁 Show answer here (not on TV)</button></div>';
  },
  teamDeck(s) {
    const ids = Sel.finalistIds();
    const l = s.live;
    const pick = this.picker === 'challenge';
    let h = '<div class="card"><h3>' + (pick ? '⚔ Pick the challenging team (1–8)' : 'Teams & scores <span class="hint">Click = answering team (1–8)</span>') + '</h3><div class="team-chips">';
    h += ids.map((id, i) => {
      const t = Sel.team(id); if (!t) return '';
      const sel = pick ? false : (l.active === id || l.challenger === id);
      return '<button class="chip' + (sel ? ' sel' : '') + '" style="--team:' + esc(t.color) + '" data-act="' + (pick ? 'challenge' : 'setActive') + '" data-arg="' + esc(id) + '"><span class="dot">' + (t.photo ? '<img data-media="' + esc(t.photo) + '" alt="">' : esc(Sel.code(t).charAt(0) || String(i + 1))) + '</span>' + esc(Sel.label(t)) + ' <span class="pts">' + Sel.score(id) + '</span></button>';
    }).join('');
    h += '</div>';
    if (pick) h += '<div class="row" style="margin-top:.5rem"><button class="btn sm" data-act="cancelPicker">Cancel (Esc)</button></div>';
    h += '<div class="row" style="margin-top:.5rem"><button class="btn sm' + (this.quickOpen ? ' on' : '') + '" data-act="quickToggle">⚡ Quick points</button></div>';
    if (this.quickOpen) h += '<div class="quick">' + ids.map((id) => { const t = Sel.team(id); return t ? '<div class="quick-row" style="--team:' + esc(t.color) + '"><b>' + esc(t.name) + '</b>' + [10, 5, -5, -10].map((v) => '<button class="btn sm ' + (v > 0 ? 'good' : 'bad') + '" data-act="quick" data-arg="' + esc(id) + '|' + v + '">' + (v > 0 ? '+' : '−') + Math.abs(v) + '</button>').join('') + '</div>' : ''; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:.5rem"><select id="adjTeam" aria-label="Team" style="flex:1 1 140px">' + ids.map((id) => '<option value="' + esc(id) + '"' + (id === l.active ? ' selected' : '') + '>' + esc((Sel.team(id) || {}).name) + '</option>').join('') + '</select><input id="adjVal" type="number" value="5" style="width:80px" aria-label="Points"><button class="btn sm good" data-act="adjust" data-arg="1">+ Add</button><button class="btn sm bad" data-act="adjust" data-arg="-1">− Subtract</button></div></div>';
    return h;
  },

  /* ---------------- tabs ---------------- */
  renderTabs() {
    const info = pageInfo(this.tab);
    $('#tabs').innerHTML = info
      ? '<div class="set-head"><button class="btn back" data-act="tabHome" aria-label="Back to settings">‹ Settings</button><span class="set-ic" style="--c:' + info[2] + '">' + info[1] + '</span><h2>' + esc(info[3]) + '</h2></div>'
      : '<div class="set-head"><span class="set-ic" style="--c:#7c3aed">⚙</span><h2>Settings & preparation</h2><input id="navSearch" type="search" placeholder="🔍 Search…" aria-label="Search settings"></div>';
  },
  renderTab(force) {
    if (!force && this.typing()) { this.tabDirty = true; return; }
    this.tabDirty = false;
    const body = $('#tabBody'); if (!body) return;
    const scrolls = $$('[data-keep-scroll]', body).map((el) => [el.dataset.keepScroll, el.scrollTop]);
    const winY = window.scrollY;
    const fn = this.tab ? (TabRender[this.tab] || TabRender.show) : SettingsHome;
    body.innerHTML = safe('tab:' + this.tab, () => fn(Store.state), '<div class="card">This tab could not be loaded — see the log</div>');
    scrolls.forEach(([k, y]) => { const el = $('[data-keep-scroll="' + k + '"]', body); if (el) el.scrollTop = y; });
    window.scrollTo(0, winY);
    Media.hydrate(body);
    const cur = $('.rd.cur', body); if (cur && !scrolls.length) cur.scrollIntoView({ block: 'center' });
  },
};

/* Android-style settings: groups of rows; a row opens a page with a back arrow. */
const SETTINGS_GROUPS = [
  ['Running the show', [
    ['show', '🎬', '#7c3aed', 'Show rundown', (s) => 'Full running order • quick jump • rehearsal'],
    ['prelim', '📝', '#2563eb', 'Prelim round', (s) => Sel.prelimQuestions().length + ' questions • ANSWER button • results & top ' + s.prelim.finalistCount],
    ['teams', '👥', '#059669', 'Teams & photos', (s) => s.teams.length + ' teams • players • photos • score history'],
    ['questions', '❓', '#db2777', 'Question manager', (s) => s.questions.length + ' questions • add, edit, import'],
    ['scores', '🏆', '#ca8a04', 'Scores & stats', (s) => s.ledger.length + ' score entries • ties • certificates'],
    ['rounds', '🔁', '#ea580c', 'Rounds & points', (s) => s.rounds.filter((r) => r.enabled).length + ' rounds on • rules • timers • colours'],
  ]],
  ['Look & text', [
    ['text', '🔤', '#0891b2', 'Text & fonts', () => 'Like Office: font, size, B / I / U, left-centre-right'],
    ['colors', '🎨', '#c026d3', 'Colours, background & borders', (s) => 'Theme: ' + ((THEMES[s.design.theme] || {}).label || 'Custom')],
    ['effects', '✨', '#ca8a04', 'Animation & effects', () => 'Scene transitions, speed, particles, lights'],
    ['scenes', '🎞', '#4f46e5', 'Per-scene settings', () => 'Each scene\'s own animation, background, sound'],
  ]],
  ['Media & sound', [
    ['media', '🖼', '#16a34a', 'Pictures, posters & gallery', (s) => Media.index.length + ' uploads • banners • logos'],
    ['audio', '🔊', '#dc2626', 'Music & sound', () => 'Theme song, welcome music, sound effects'],
    ['voice', '🗣', '#0d9488', 'Voice (Bengali)', (s) => s.speech.enabled ? 'On' : 'Off'],
  ]],
  ['Event', [
    ['event', '🏷', '#9333ea', 'Event details & organiser', (s) => s.event.programme],
  ]],
  ['Tools', [
    ['ai', '🤖', '#7c3aed', 'AI studio', () => (AI.cfg.airGapped ? 'Air-gapped (local)' : 'Online allowed') + ' • make questions • check'],
  ]],
  ['System', [
    ['display', '🖥', '#0891b2', 'TV & screen', (s) => s.display.aspect + ' • calibration • second screen'],
    ['preshow', '✅', '#16a34a', 'Pre-show check', () => 'Is everything ready? At a glance'],
    ['backup', '💾', '#2563eb', 'Save, backup & reset', () => 'Auto-save • import / export'],
    ['flow', '⏱', '#b45309', 'Timers & flow', (s) => 'Warning at ' + s.settings.warnAt + 's • drone'],
    ['tests', '🧪', '#475569', 'Tests & log', () => 'Automatic self-test'],
    ['help', '❔', '#64748b', 'Help & shortcuts', () => 'Keyboard shortcuts • info'],
  ]],
];
/** The settings home page: Android-style grouped list. */
const UNDO_MSG = (label) => {
  const l = String(label || '');
  if (l === 'judge-correct') return '✓ Correct — points added';
  if (l === 'judge-wrong') return '✕ Wrong answer marked';
  if (l.startsWith('judge-')) return 'Result marked';
  const m = { pass: '➜ Passed to the next team', bonus: '★ Bonus given', adjust: 'Score changed', challenge: '⚔ Challenge set', 'q-del': 'Question deleted', 'team-del': 'Team deleted', 'new-game': 'Event reset', 'reset-board': 'Question board reset', 'reset-scores': 'Scores reset', 'ledger-remove': 'Score entry removed', 'crew-del': 'Person removed', 'prelim-del': 'Prelim question deleted', 'q-unused': 'Question marked unused', 'gallery-del': 'Picture removed' };
  if (m[l]) return m[l];
  if (l.startsWith('hand-')) return 'Buzz result marked';
  return '';
};
function HomeCards(s) {
  const rd = Show.rundown(); const cur = rd[Show.index()];
  const card = (act, ic, title, sub, cls = '') => '<button class="home-card ' + cls + '" data-act="' + act + '"><span class="hc-ic">' + ic + '</span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></button>';
  return '<section class="home-cards">' +
    card('homeContinue', '▶', 'Continue Event', 'Live control • now: ' + (cur ? cur.label : '—'), 'go') +
    card('newGame', '✚', 'New Event', 'Scores back to zero — teams, questions and photos kept', 'warn') +
    card('rehearsalToggle', '🎭', Store.rehearsal ? 'End Rehearsal' : 'Rehearsal Mode', Store.rehearsal ? 'Back to the real event exactly as it was' : 'Practise freely — the real event stays safe', 'reh' + (Store.rehearsal ? ' on' : '')) +
    card('skipToMain', '⏭', 'Skip to Main Round', 'Straight to the main-round countdown') +
    '</section><h4 class="home-sub">Event settings</h4>';
}
function SettingsHome(s) {
  return HomeCards(s) + SETTINGS_GROUPS.map(([title, rows]) => '<section class="set-group"><h4>' + esc(title) + '</h4><div class="set-list">' + rows.map(([k, ic, col, name, sub]) => '<button class="set-row" data-act="tab" data-arg="' + k + '"><span class="set-ic" style="--c:' + col + '">' + ic + '</span><span class="set-tx"><b>' + esc(name) + '</b><small>' + esc(safe('sub', () => sub(s), '')) + '</small></span><span class="chev" aria-hidden="true">›</span></button>').join('') + '</div></section>').join('');
}
const TABS = SETTINGS_GROUPS.flatMap((g) => g[1].map((r) => [r[0], r[1] + ' ' + r[3]]));
const pageInfo = (k) => { for (const g of SETTINGS_GROUPS) for (const r of g[1]) if (r[0] === k) return r; return null; };

/* =====================================================================
   ACTIONS — every button and shortcut resolves to one of these.
   ===================================================================== */
const Actions = {
  closeModal() { UI.closeModal(); },
  tab(k) { UI.tab = pageInfo(k) ? k : ''; UI.savePref('tab', UI.tab); UI.renderTabs(); UI.renderTab(true); const t = $('#tabs'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); },
  tabHome() { Actions.tab(''); },
  openStage() { Sync.openStage(); },
  navHome() { UI.setLive(false); Actions.tab(''); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  navShow() { UI.setLive(false); Actions.tab('show'); },
  navLive() { UI.setLive(true); },
  homeContinue() { UI.setLive(true); UI.toast('Live control — NEXT ▶ (→) moves the show on', 'ok'); },
  navSettings() { UI.setLive(false); Actions.tab(''); setTimeout(() => { const h = $('.home-sub'); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0); },
  menuToggle() { const m = $('#menuPanel'); m.hidden = !m.hidden; $('#btnMenu').setAttribute('aria-expanded', String(!m.hidden)); },
  moreOpen() {
    const c = (act, ic, label, arg = '') => '<button class="more-card" data-act="' + act + '"' + (arg ? ' data-arg="' + arg + '"' : '') + '><i>' + ic + '</i><b>' + label + '</b></button>';
    UI.sheet('More', '<div class="more-grid">' + c('morePage', '🏆', 'Scores', 'scores') + c('history', '🕘', 'History') + c('undo', '↶', 'Undo') + c('redo', '↷', 'Redo') + c('morePage', '🔊', 'Audio', 'audio') + c('morePage', '🖥', 'Display', 'display') + c('morePage', '🎨', 'Themes', 'colors') + c('navSettings', '⚙', 'Settings') + c('morePage', '❔', 'Help', 'help') +
      c('navShow', '🎬', 'Show rundown') + c('skipToMain', '⏭', 'Skip to Main Round') + c('rehearsalToggle', '🎭', Store.rehearsal ? 'End Rehearsal' : 'Rehearsal') + c('blackout', '◼', 'Blackout') + c('previewFull', '⛶', 'Full screen') + c('shortcuts', '⌨', 'Shortcuts') + '</div>');
  },
  morePage(k) { UI.setLive(false); Actions.tab(k); },
  history() {
    const rows = Store.past.slice(-30).reverse().map((h, i) => '<div class="hist-row"><span>' + (i === 0 ? '<b>Last:</b> ' : '') + esc(UNDO_MSG(h.label) || h.label) + '</span></div>').join('') || '<p class="muted">Nothing done yet.</p>';
    UI.sheet('History', '<div class="hist">' + rows + '</div><div class="confirm-row"><button class="btn lg" data-act="undo">↶ Undo last</button><button class="btn lg" data-act="redo">↷ Redo</button></div>');
  },
  skipToMain() { Show.jump('MAIN_COUNTDOWN'); UI.setLive(true); UI.toast('Main round countdown — press → after GO! for round 1', 'ok'); },
  navTeams() { UI.setLive(false); Actions.tab('teams'); },
  navQuestions() { UI.setLive(false); Actions.tab('questions'); },
  /** Rehearsal: play freely on a copy; ending it puts the real event back exactly as it was. */
  rehearsalToggle() {
    if (Store.rehearsal) { UI.confirmBox('End rehearsal?', 'Everything goes back to how it was before the rehearsal: scores, questions and show position.', 'END REHEARSAL', () => { Store.exitRehearsal(); UI.toast('Rehearsal ended — back to the real event', 'ok'); }, 'warn'); }
    else { Store.enterRehearsal(false); Show.go(Show.rundown()[0]); UI.toast('Rehearsal started — play freely; the real event is kept safe', 'ok'); }
  },
  /** A fresh game with the same teams, schools, photos, questions and recordings: scores, played questions, lottery and show position start again. */
  newGame() {
    UI.confirmBox('Reset event?', 'All scores, played questions, the podium lottery and the show position go back to zero. Teams, schools, photos, questions, recordings and settings are kept.', 'RESET', () => Actions.newGameNow());
  },
  newGameNow() {
    Store.commit('new-game', (s) => {
      s.ledger = []; s.board = { played: {}, prevRanks: {} }; s.live = emptyLive(); s.lifelines = {}; s.finalReveal = 0;
      s.rounds.forEach((r) => { r.turn = 0; r.turnsTaken = []; });
      s.draw.picks = []; s.draw.pending = -1; s.draw.queue = [];
      s.prelimLive = Object.assign({}, s.prelimLive, { idx: 0, reveal: false });
      s.show.blackout = false;
    });
    Timer.reset && Timer.reset();
    Show.go(Show.rundown()[0]);
    UI.toast('New game ready — press → to begin', 'ok');
  },
  previewFull() { const el = $('#preview .stage'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el && el.requestFullscreen) el.requestFullscreen().catch((e) => UI.toast('Fullscreen failed: ' + e.message, 'err')); },
  blackout() { Show.toggleBlackout(); },
  undo() { const l = Store.undo(); UI.toast(l ? 'Undo: ' + l : 'Nothing to undo', l ? 'ok' : ''); },
  redo() { const l = Store.redo(); UI.toast(l ? 'Redo: ' + l : 'Nothing to redo', l ? 'ok' : ''); },
  mute() {
    AudioDirector.unlock();
    SoundDirector.setMuted(!SoundDirector.muted);
    Sync.send({ type: 'mute', on: SoundDirector.muted });
    const b = $('#btnMute'); if (b) { b.classList.toggle('on', SoundDirector.muted); b.innerHTML = (SoundDirector.muted ? '🔈 Unmute' : '🔇 Mute') + ' <kbd>M</kbd>'; }
    UI.toast(SoundDirector.muted ? 'All sound muted' : 'Sound on', 'ok');
  },
  volume(d) { Store.commit('volume', (s) => { s.audio.master = Math.round(clamp(s.audio.master + num(d), 0, 1) * 10) / 10; }, { undo: false }); AudioDirector.setMaster(Store.state.audio.master); UI.toast('Master volume ' + Math.round(Store.state.audio.master * 100) + '%'); },
  pad(name) { AudioDirector.unlock(); Cue.play(name); },
  moodPreview(m) { AudioDirector.unlock(); if (m) Music.preview(m); else Music.stopPreview(); },
  testTone(pan) { AudioDirector.unlock(); Sfx.testTone(num(pan)); },
  soundboardToggle() { UI.boardOpen = !UI.boardOpen; UI.liveSig = ''; UI.renderLive(); },
  stopAudio() { AudioDirector.stopAll(); Cue.music('theme', 'stop'); Cue.music('welcome', 'stop'); Cue.music('winner', 'stop'); Cue.music('background', 'stop'); Speech.stop(); },
  shortcuts() { UI.modal('Keyboard shortcuts', '<div class="kbd-grid">' + SHORTCUTS.map(([k, d]) => '<div><kbd>' + esc(k) + '</kbd><span>' + esc(d) + '</span></div>').join('') + '</div>'); },
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
  timerCustom() { const v = prompt('How many seconds?', '30'); if (v && num(v) > 0) Timer.start('custom', num(v)); },
  judge(kind) { Game.judge(kind); },
  bonus() { Game.bonus(); },
  clip(action) { Store.commit('clip-' + action, (s) => { s.live.clip = { action, at: now() }; }, { undo: false }); },
  placeStage() { Sync.placeStage(); },
  calibNext() { const L = ['off', 'bars', 'grid', 'ramp']; Store.commit('calib', (s) => { s.display.calib = L[(L.indexOf(s.display.calib) + 1) % L.length]; }, { undo: false }); },
  status() { AudioDirector.unlock(); const s = Store.state; const t = Sel.team(Sel.answeringTeam()); const q = Sel.liveQuestion(); const rem = Math.ceil(Sel.timerRemaining(s.timer) / 1000); Speech.say('এখন ' + (SCENES[s.show.scene] || s.show.scene) + (s.show.scene === 'QUESTION' && q ? '। প্রশ্ন ' + q.number + (t ? '। উত্তর দিচ্ছে ' + t.name : '') + '। টাইমার ' + rem + ' সেকেন্ড' + (s.timer.running ? ' চলছে' : ' থেমে আছে') : '') + '।', 'status', true); },
  bgmToggle() { Store.commit('bgm', (s) => { s.audio.bgm.on = !s.audio.bgm.on; }, { undo: false }); UI.toast('Background music ' + (Store.state.audio.bgm.on ? 'on' : 'off'), 'ok'); },
  showAnsHere() { UI.showAns = !UI.showAns; UI.liveSig = ''; UI.renderLive(); },
  hostToggle() { UI.hostOpen = !UI.hostOpen; UI.liveSig = ''; UI.renderLive(); },
  hostLine(kind) { UI.hostLine = HostLines.line(kind); UI.liveSig = ''; UI.renderLive(); },
  hostSpeak() { AudioDirector.unlock(); Speech.say(UI.hostLine || HostLines.line('open'), 'host', true); },
  raiseHand(id) { Game.raiseHand(id); },
  judgeHand(arg) { const [id, ok] = String(arg).split('|'); Game.judgeHand(id, ok === '1'); },
  timerRaise() { const r = Sel.currentRound(); Timer.start('raise', (r && r.timers.raise) || 5); },
  timerPreset(v) { Timer.start(Store.state.timer.mode === 'pass' ? 'pass' : 'direct', int(v, 30)); },
  photosToggle() { const auto = ['TEAMS_ALL', 'TEAM_INTRO', 'FINALIST_INTRO'].includes(Store.state.show.scene); UI.photosOpen = !(UI.photosOpen == null ? auto : UI.photosOpen); UI.liveSig = ''; UI.renderLive(); },
  async memPhoto(path) { const id = await pickMedia('image/*', 'image'); if (id) Store.commit('media:' + path, (s) => setPath(s, path, id)); },
  async memPhotoFile(path, file) {
    try { const id = await Media.add(file, 'image'); Store.commit('media:' + path, (s) => setPath(s, path, id)); UI.toast('Photo added ✓', 'ok'); } catch (e) { UI.toast(e.message || 'Could not add the photo', 'err'); Log.err('photo', e); }
  },
  /** Many pictures at once: they fill the empty member slots in order (A / 1 member 1, member 2, B / 2 …). */
  memBulk() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []); if (!files.length) return;
      const slots = []; Store.state.teams.forEach((t, i) => { if (!t.captainPhoto) slots.push('teams.' + i + '.captainPhoto'); if (!t.playerPhotos[0]) slots.push('teams.' + i + '.playerPhotos.0'); });
      let n = 0;
      for (const f of files) { const path = slots[n]; if (!path) break; try { const id = await Media.add(f, 'image'); Store.commit('media:' + path, (s) => setPath(s, path, id)); n += 1; } catch (e) { UI.toast(e.message, 'err'); } }
      UI.toast(n + ' photo(s) added' + (files.length > n ? ' • ' + (files.length - n) + ' left over (no empty slots)' : ''), n ? 'ok' : 'err');
    };
    inp.click();
  },
  quickToggle() { UI.quickOpen = !UI.quickOpen; UI.liveSig = ''; UI.renderLive(); },
  quick(arg) { const [id, v] = String(arg).split('|'); Game.adjust(id, int(v), 'Quick ' + signed(int(v))); },
  speakStandings() { AudioDirector.unlock(); Speech.say(Sel.standingsText(), 'standings', true); const t = Sel.ties(); if (t.length) Speech.say(t.join('। '), 'standings', true); },
  reveal() { Game.reveal(); },
  lock() { Game.toggleLock(); },
  pass() { Game.pass(); },
  challengePick() { UI.picker = UI.picker === 'challenge' ? '' : 'challenge'; UI.liveSig = ''; UI.renderLive(); },
  cancelPicker() { UI.picker = ''; UI.liveSig = ''; UI.renderLive(); },
  challenge(id) { UI.picker = ''; Game.challenge(id); UI.liveSig = ''; UI.renderLive(); },
  /** A team number (key or chip): after a wrong answer it passes the question to that team, otherwise it marks the answering team. */
  setActive(id) {
    const s = Store.state; const r = Sel.round(s.live.roundId);
    if (s.show.scene === 'QUESTION' && s.live.qid && s.live.result === 'wrong' && !s.live.revealed && id !== s.live.active && r && r.features.pass) { Game.pass(id); return; }
    // Challenge round (e.g. round 3): another team's number = that team pressed the buzzer.
    if (s.show.scene === 'QUESTION' && s.live.qid && r && r.features.challenge && r.type !== 'rapid' && id !== s.live.active && !s.live.revealed) { Game.raiseHand(id); return; }
    Game.setActive(id);
  },
  options() { Game.showOptions(); },
  pick(i) { Game.pick(int(i)); },
  twoOptions() { Game.twoOptions(); },
  /** On the question board a number key opens that question (0 = 10). */
  gridKey(n) {
    const s = Store.state; const r = Sel.round(s.show.params.roundId);
    if (!r) return false;
    const q = Sel.roundQuestions(r.id).find((x) => x.number === n);
    if (!q) { UI.toast('Question ' + n + ' does not exist', 'err'); return true; }
    if (s.board.played[q.id]) { UI.toast('Question ' + n + ' has already been played', 'err'); return true; }
    Actions.loadQ(q.id); return true;
  },
  lifeline(k) { Game.useLifeline(k); },
  drawPick(i) { AudioDirector.unlock(); Draw.pick(i); },
  drawReset() { Draw.reset(); },
  drawTheme(k) { Draw.theme(k); },
  speak(what) { AudioDirector.unlock(); ({ question: () => Speech.readQuestion(true), options: () => Speech.readOptions(true), answer: () => Speech.readAnswer(true), team: () => Speech.readTeam(true), round: () => Speech.readRound(true), stop: () => Speech.stop() }[what] || (() => {}))(); },
  qStep(d) {
    const s = Store.state; const r = Sel.round(s.live.roundId); if (!r) return;
    const qs = Sel.roundQuestions(r.id); const i = qs.findIndex((q) => q.id === s.live.qid);
    const nq = qs[clamp(i + int(d), 0, qs.length - 1)];
    if (nq && nq.id !== s.live.qid) { if (int(d) > 0) Game.advanceTurn(r.id); Show.jump('QUESTION', { key: nq.id, roundId: r.id, qid: nq.id }); }
  },
  gotoGrid() { const r = Sel.currentRound(); if (r) Show.jump('GRID', { key: r.id, roundId: r.id }); },
  loadQ(qid) { const q = Sel.question(qid); if (!q) return; Cue.play('laser'); if (Store.state.show.scene === 'GRID' && Store.state.board.played[qid] && Store.state.live.qid !== qid) { UI.toast('Question ' + q.number + ' has already been played', 'err'); return; } if (Store.state.show.scene === 'GRID' && Store.state.live.qid && Store.state.live.qid !== qid) Game.closeTurn(); Show.jump('QUESTION', { key: q.id, roundId: q.roundId, qid: q.id }); },
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
    if (!team || !v) { UI.toast('Choose a team and enter points', 'err'); return; }
    const reason = prompt('Reason (optional)', int(sign) > 0 ? 'Bonus' : 'Penalty');
    if (reason === null) return;
    Game.adjust(team, v * int(sign, 1), reason);
  },
  confirmFinalists() { const l = Show.confirmFinalists(); UI.toast('Finalists confirmed: ' + l.length, 'ok'); },
};

const SOUNDBOARD = [['drumroll', '🥁 Drumroll'], ['applause', '👏 Applause'], ['suspense', '😱 Suspense'], ['gong', '🔔 Gong'], ['ding', '✨ Ding'], ['fanfare', '🎺 Fanfare'], ['correct', '✓ Correct'], ['wrong', '✗ Wrong'], ['buzzer', '⏰ Buzzer'], ['tick', '⏱ Tick-tock'], ['pass', '➜ Pass'], ['option', '◉ Pop'], ['siren', '🚨 Siren'], ['laser', '⚡ Laser'], ['heartbeat', '❤ Heartbeat']];
const SHORTCUTS = [
  ['Space', 'Timer start / pause'], ['→ / PgDn', 'Next scene'], ['← / PgUp', 'Previous scene'], ['D', 'Direct timer (60s)'], ['P', 'Pass: next team + 45s'], ['Shift+P', '45s timer only'],
  ['R', 'Show answer / reveal next place'], ['C', 'Correct'], ['X / W', 'Wrong'], ['N', 'No score'], ['H', 'Challenge (then 1–8)'], ['V', 'Show / hide options'],
  ['1–10 (on board)', 'On the question board a number opens that question (0 = 10)'], ['Shift+A/B/C/D', 'The option the team named — judged at once in Round 1'], ['V / Shift+V', 'Show 4 options / cut to 2 options'], ['1–9', 'Choose the answering team; after a wrong answer = pass to that team; in Round 3 = that team buzzed'], ['Alt+1/2/3', '50:50 / poll / flip'], ['0', 'Timer reset'], ['+ / −', 'Add / subtract 10 seconds'], ['S', 'Scoreboard'], ['Shift+W', 'Winner'],
  ['B', 'Blackout'], ['L', 'Lock / unlock question'], ['Shift+L', 'Read out the full scores'], ['G', 'Bonus'], ['Shift+1–8', 'Buzz'], ['F', 'Fullscreen'], ['O', 'Open Stage window'], ['E', 'Read question aloud'], ['A', 'Read answer aloud'], ['T', 'Read team name'], ['M', 'Mute / unmute'], ['[ / ]', 'Master volume down / up'],
  ['G', 'Question board'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+S', 'Save now'], ['?', 'This list'], ['Esc', 'Cancel / close'],
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
  /** The V100 keyboard layout (for operators used to the old engine). Returns true when handled. */
  v100(k, m, s) {
    const live = s.show.scene === 'QUESTION' && s.live.qid;
    if (m.shift && /^[a-d]$/.test(k) && live) { Actions.pick('abcd'.indexOf(k)); return true; }
    if ((k === 'Enter' || k === ' ') && live && !s.live.optionsShown && !s.live.result) { Actions.judge('correct'); return true; }
    const map = { n: 'next', b: 'gotoGrid', o: 'options', d: 'reveal', r: 'reveal', x: 'timerToggle', h: 'timerRaise', p: 'pass', k: 'judge:correct', j: 'judge:correct', g: 'bonus', w: 'judge:wrong', u: 'undo', y: 'redo', '[': 'volume:-0.1', ']': 'volume:0.1', v: 'bgmToggle', q: 'speak:question', e: 'speak:answer', i: 'status', l: 'speakStandings', m: 'mute', f: 'openStage', '.': 'blackout', c: 'calibNext', a: 'showAnsHere', '?': 'shortcuts' };
    if (k === 's') { if (s.timer.running) return true; if (s.timer.base < s.timer.duration && !s.timer.expired) Timer.resume(); else Actions.timerDirect(); return true; }
    if (k === 't' && live) { Actions.lifeline('fifty'); return true; }
    if (/^[1-8]$/.test(k)) {
      const id = Sel.teamByKey(int(k)); if (!id) return false;
      const r = Sel.round(s.live.roundId);
      if (live && r && r.features.challenge && id !== s.live.active) Actions.raiseHand(id); else Actions.setActive(id);
      return true;
    }
    const a = map[k]; if (!a) return false;
    const [act, arg] = a.split(':'); Actions[act](arg); return true;
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
      if (k === 's') { Store.persist(); UI.toast('Saved', 'ok'); return true; }
      return false;
    }
    if (m.alt) {
      const d = code ? code.replace('Digit', '') : key;
      if (d === '1') { Actions.lifeline('fifty'); return true; }
      if (d === '2') { Actions.lifeline('poll'); return true; }
      if (d === '3') { Actions.lifeline('flip'); return true; }
      return false;
    }
    if (m.shift && /^Digit[1-9]$/.test(code)) {
      const id = Sel.teamByKey(int(code.slice(5)));
      if (id) { Actions.raiseHand(id); return true; }
      return false;
    }
    if (s.settings.keyLayout === 'v100' && !m.ctrl && !m.alt && this.v100(k, m, s)) return true;
    // the team names an option: Shift + A/B/C/D (or ক/খ/গ/ঘ on the board) marks it — judged at once in round 1
    if (m.shift && /^[a-d]$/.test(k) && s.show.scene === 'QUESTION' && s.live.qid) { Actions.pick('abcd'.indexOf(k)); return true; }
    if (m.shift && k === 'v' && s.show.scene === 'QUESTION') { Actions.twoOptions(); return true; }
    if (s.show.scene === 'DRAW' && /^[1-9]$/.test(k)) { Actions.drawPick(int(k) - 1); return true; } // once to choose, again to open
    if (s.show.scene === 'GRID' && /^[0-9]$/.test(k)) return Actions.gridKey(k === '0' ? 10 : int(k));
    if (/^[1-9]$/.test(k)) {
      const id = Sel.teamByKey(int(k));
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
      case 'w': if (m.shift) Actions.jump('WINNER'); else Actions.judge('wrong'); return true;
      case 'g': Actions.gotoGrid(); return true;
      case 'b': Actions.blackout(); return true;
      case 'g': Actions.bonus(); return true;
      case 'L': case 'l': if (m.shift) { Actions.speakStandings(); return true; } Actions.lock(); return true;
      case 'f': Actions.previewFull(); return true;
      case 'o': Actions.openStage(); return true;
      case 'e': Actions.speak('question'); return true;
      case 'a': Actions.speak('answer'); return true;
      case 't': Actions.speak('team'); return true;
      case 'm': Actions.mute(); return true;
      case '[': Actions.volume(-0.1); return true;
      case ']': Actions.volume(0.1); return true;
      case '?': case 'F1': Actions.shortcuts(); return true;
      case 'Escape': { const mp = $('#menuPanel'); if (mp && !mp.hidden) { mp.hidden = true; return true; } } if (UI.picker) { Actions.cancelPicker(); return true; } return false;
      case 'Home': Actions.goStep(0); return true;
      default: return false;
    }
  },
};
