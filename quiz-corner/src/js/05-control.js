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
    <button class="btn" data-act="stopAudio" title="সব সংগীত ও ভয়েস থামাও">■ সংগীত থামাও</button>
    <button class="btn" data-act="mute" id="btnMute" title="M">🔇 মিউট <kbd>M</kbd></button>
    <button class="btn" data-act="shortcuts" title="?">⌨ শর্টকাট</button>
    <select id="roleSel" aria-label="ভূমিকা" style="width:auto;min-height:38px">
      <option value="controller">কন্ট্রোলার</option><option value="quizmaster">কুইজ মাস্টার</option><option value="host">হোস্ট (শুধু দেখা)</option>
    </select>
  </header>
  <div id="announce" class="sr-only" aria-live="polite" aria-atomic="true"></div>
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
    this.tab = pref.tab && pageInfo(pref.tab) ? pref.tab : '';
    this.renderTabs();
    this.bindEvents();
    this.renderAll();
    if (Store.damaged) setTimeout(() => this.toast('একটি ক্ষতিগ্রস্ত সংরক্ষণ উপেক্ষা করে আগের ভালো কপি থেকে শো পুনরুদ্ধার করা হয়েছে', 'err'), 800);
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
    const dropOf = (e) => (e.target && e.target.closest ? e.target.closest('[data-drop]') : null);
    document.addEventListener('dragover', (e) => { const z = dropOf(e); if (z) { e.preventDefault(); z.classList.add('over'); } });
    document.addEventListener('dragleave', (e) => { const z = dropOf(e); if (z) z.classList.remove('over'); });
    document.addEventListener('drop', (e) => {
      const z = dropOf(e); if (!z) return;
      e.preventDefault(); z.classList.remove('over');
      const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif)$/i.test(x.name));
      if (f) Actions.memPhotoFile(z.dataset.drop, f); else UI.toast('একটি ছবির ফাইল (JPG/PNG/WEBP) টেনে আনুন', 'err');
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
    let out = s.show.blackout ? '<div class="card blackout-alert"><b>⚠ টিভির পর্দা এখন কালো (ব্ল্যাকআউট)</b><span>দর্শক কিছু দেখছেন না।</span>' + b('blackout', '▶ টিভিতে আবার দেখাও', 'lg good', '', 'B') + '</div>' : '';
    out += '<div class="card"><div class="now"><div><div class="scene-name">' + esc(cur ? cur.label : SCENES[s.show.scene] || s.show.scene) + '</div><div class="scene-sub">ধাপ ' + bn(i + 1) + ' / ' + bn(rd.length) + (nxt ? ' • পরবর্তী: ' + esc(nxt.label) : '') + '</div></div><span></span><div class="bigtime" id="bigTime">60</div></div>';
    out += '<div class="deck" style="margin-top:.6rem">' + b('prev', '◀ আগের', 'lg', '', '←') + b('next', 'পরের ▶', 'lg primary', '', '→') + b('timerToggle', '▶ চালু', 'lg', '', '') + b('replay', '↻ দৃশ্য পুনরায়', '') + b('scoreboard', '📊 স্কোরবোর্ড', '', '', 'S') + '</div></div>';
    if (s.settings.coach) out += Coach.html(s);
    out += this.contextDeck(s, b);
    out += this.teamDeck(s);
    out += this.photoDeck(s);
    out += '<div class="card"><div class="row"><button class="btn sm' + (this.boardOpen ? ' on' : '') + '" data-act="soundboardToggle">🎛 সাউন্ডবোর্ড</button></div>' + (this.boardOpen ? '<div class="deck" style="margin-top:.5rem">' + SOUNDBOARD.map(([k, l]) => b('pad', l, 'sm', k)).join('') + '</div>' : '') + '</div>';
    out += '<div class="card"><div class="row"><button class="btn sm' + (this.hostOpen ? ' on' : '') + '" data-act="hostToggle">🎙 হোস্ট সহায়ক (ধারাভাষ্য)</button></div>' + (this.hostOpen ? '<p class="host-line">' + esc(this.hostLine || HostLines.line('open')) + '</p><div class="deck">' + b('hostLine', 'স্কোর মন্তব্য', '', 'score') + b('hostLine', 'ভুল উত্তরের লাইন', '', 'wrong') + b('hostLine', 'সাসপেন্স', '', 'tension') + b('hostLine', 'রাউন্ড শুরুর লাইন', '', 'open') + b('hostLine', 'বিজয়ী লাইন', '', 'win') + b('hostSpeak', '🔊 বলো', 'good') + '</div>' : '') + '</div>';
    return out;
  },
  contextDeck(s, b) {
    const sc = s.show.scene;
    let h = '';
    const timerRow = '<div class="deck-sep">টাইমার</div>' + b('timerDirect', '⏱ সরাসরি ' + bn(Timer.durationFor('direct')) + 's', 'warn', '', 'D') + b('timerPass', '⏱ পাস/বোনাস ' + bn(Timer.durationFor('pass')) + 's', 'violet', '', '⇧P') + b('timerReset', '⟲ রিসেট', '', '', '0') + b('timerAdd', '+১০ সেকেন্ড', '', '10', '+') + b('timerAdd', '+৫ সেকেন্ড', '', '5') + b('timerAdd', '−১০ সেকেন্ড', '', '-10', '') + b('timerPreset', '⏱ ৩০s', '', '30') + b('timerPreset', '⏱ ৬০s', '', '60') + b('timerCustom', '⏱ অন্য…');
    if (sc === 'QUESTION') {
      const l = s.live; const q = Sel.liveQuestion(); const r = Sel.round(l.roundId);
      const ans = Sel.team(Sel.answeringTeam());
      const pc = Game.pointsFor('correct'); const pw = Game.pointsFor('wrong');
      h += '<div class="card"><h3>প্রশ্ন নিয়ন্ত্রণ <span class="hint">' + esc(r ? r.name : '') + ' • ' + Game.flowName(l.flow) + (ans ? ' • উত্তরদাতা: ' + esc(ans.name) : '') + '</span></h3>';
      if (q) h += '<div class="qm-box"><div class="q">' + esc(q.text) + '</div>' + this.ansHtml((q.options[q.answer] && !q.answerText ? OPT_LABELS[q.answer] + ') ' : '') + (q.answerText || q.options[q.answer] || '—'), s) + '</div>';
      if (q && q.clip) h += '<div class="deck" style="margin-top:.5rem"><div class="deck-sep">🎬 প্রশ্নের অডিও / ভিডিও</div>' + b('clip', '▶ চালাও', 'good', 'play') + b('clip', '⏸ বিরতি', '', 'pause') + b('clip', '⟲ শুরু থেকে', '', 'restart') + b('clip', '■ থামাও', 'bad', 'stop') + '</div>';
      h += '<div class="deck" style="margin-top:.6rem">' + b('judge', '✓ সঠিক ' + signed(pc), 'lg good', 'correct', 'C') + b('judge', '✗ ভুল ' + (pw ? signed(pw) : ''), 'lg bad', 'wrong', 'X') + b('judge', '○ নো স্কোর', 'lg', 'noscore', 'N') + b('reveal', l.revealed ? '🙈 উত্তর লুকাও' : '👁 উত্তর দেখাও', 'lg gold', '', 'R') + b('lock', l.locked ? '🔒 লক (আনলক করুন)' : '🔓 লক', l.locked ? 'lock-on' : '', '', 'L') + b('replay', '⟲ প্রশ্ন রিসেট');
      h += '<div class="deck-sep">প্রবাহ</div>' + b('pass', (r && r.type === 'bonus' ? '➜ বোনাস: পরের দল' : '➜ পাস: পরের দল') + ' (' + bn(Timer.durationFor('pass')) + 's)', 'violet span2', '', 'P', r && !r.features.pass) + b('challengePick', '⚔ চ্যালেঞ্জ', 'warn' + (this.picker === 'challenge' ? ' on' : ''), '', 'H', r && !r.features.challenge) + b('options', l.optionsShown ? 'বিকল্প লুকাও' : '৪ বিকল্প দেখাও (' + bn(r ? r.scoring.options4 : 5) + ')', '', '', 'V', !q || q.options.filter(Boolean).length < 2 || (r && !r.features.options)) + b('twoOptions', '২ বিকল্পে নামাও (' + bn(r ? r.scoring.options2 : 3) + ')', '', '', '⇧V', !q || (r && !r.features.options) || l.eliminated.length >= 2);
      if (q && l.optionsShown) h += '<div class="deck-sep">দলের বেছে নেওয়া বিকল্প' + (r && r.features.judgeOptions ? ' (সঙ্গে সঙ্গে রায়)' : '') + '</div>' + q.options.map((o, i) => (o ? b('pick', OPT_LABELS[i] + ') ' + esc(o.slice(0, 22)), l.picked === i ? 'on' : '', String(i), '', l.eliminated.includes(i)) : '')).join('');
      if (r && r.features.lifelines) h += '<div class="deck-sep">লাইফলাইন' + (l.active ? ' — ' + esc((Sel.team(l.active) || {}).name || '') : '') + '</div>' + b('lifeline', '½ ৫০:৫০', 'gold', 'fifty', 'Alt+1', l.active && Sel.lifelineUsed(l.active, 'fifty')) + b('lifeline', '📊 দর্শক পোল', 'gold', 'poll', 'Alt+2', l.active && Sel.lifelineUsed(l.active, 'poll')) + b('lifeline', '🔄 ফ্লিপ প্রশ্ন', 'gold', 'flip', 'Alt+3', l.active && Sel.lifelineUsed(l.active, 'flip'));
      if (r && r.type === 'standard') h += b('bonus', '★ বোনাস +' + bn(r.scoring.manualBonus), 'gold', '', 'G', l.bonusGiven);
      if (r && r.features.challenge) {
        const others = Sel.finalistIds().filter((id) => id !== l.active);
        h += '<div class="deck-sep">✋ হাত তোলা / বাজার' + (r.features.singleChallenger ? ' (কেবল প্রথম দল)' : '') + ' — Shift+১–৮</div>' + b('timerRaise', '✋ হাত তোলার সময় ' + bn(r.timers.raise) + 's', 'warn');
        h += others.map((id) => { const t = Sel.team(id); if (!t) return ''; const up = l.hands.includes(id); const j = l.handsJudged[id]; return up && !j ? b('judgeHand', '✓ ' + esc(t.name) + ' +' + bn(r.scoring.challengeRight), 'good', id + '|1') + b('judgeHand', '✕ ' + esc(t.name) + ' ' + bn(r.scoring.challengeWrong), 'bad', id + '|0') + b('raiseHand', '✋ নামাও', 'sm', id) : b('raiseHand', (j ? (j === 'right' ? '✓ ' : '✕ ') : '✋ ') + esc(t.name), up ? 'on' : '', id, '', !!j); }).join('');
      }
      h += timerRow + '<div class="deck-sep">ভয়েস ও প্রশ্ন</div>' + b('speak', '🔊 প্রশ্ন পড়ো', '', 'question', 'E') + b('speak', '🔊 বিকল্প পড়ো', '', 'options') + b('speak', '🔊 উত্তর পড়ো', '', 'answer', 'A') + b('speak', '🔊 দলের নাম', '', 'team', 'T') + b('qStep', '⏮ আগের প্রশ্ন', '', '-1') + b('qStep', 'পরের প্রশ্ন ⏭', '', '1') + b('gotoGrid', '▦ প্রশ্ন বোর্ড');
      h += '</div></div>';
    } else if (sc === 'PRELIM_Q') {
      const idx = s.prelimLive.idx; const q = Sel.prelimQuestions()[idx];
      h += '<div class="card"><h3>বাছাই প্রশ্ন ' + bn(idx + 1) + (q && q.star ? ' ★' : '') + '</h3>' + (q ? '<div class="qm-box"><div class="q">' + esc(q.text) + '</div>' + this.ansHtml(q.answer || '—', s) + '</div>' : '') +
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
  /** V100 quick photos: two members per team (16 for A / 1 … H / 8). Click, drop a file, or hover and press Ctrl+V.
      It opens by itself while the teams are being introduced. */
  photoDeck(s) {
    const auto = ['TEAMS_ALL', 'TEAM_INTRO', 'FINALIST_INTRO'].includes(s.show.scene);
    const open = this.photosOpen == null ? auto : this.photosOpen;
    const filled = s.teams.reduce((n, t) => n + (t.captainPhoto ? 1 : 0) + (t.playerPhotos[0] ? 1 : 0), 0);
    let h = '<div class="card"><div class="row"><button class="btn sm' + (open ? ' on' : '') + '" data-act="photosToggle">📷 সদস্যদের ছবি — প্রতি দলে ২ জন (' + bn(filled) + ' / ' + bn(s.teams.length * 2) + ')</button><button class="btn sm" data-act="memBulk">⇪ একসাথে অনেক ছবি</button></div>';
    if (open) {
      h += '<p class="muted" style="margin:.4rem 0">ছবির ঘরে ক্লিক করুন • ফাইল টেনে এনে ঘরে ছাড়ুন • অথবা ছবি কপি করে ঘরের ওপর মাউস রেখে <kbd>Ctrl</kbd>+<kbd>V</kbd></p><div class="mem-grid">';
      h += s.teams.map((t, i) => {
        const cur = (s.show.scene === 'TEAM_INTRO' || s.show.scene === 'FINALIST_INTRO') && s.show.params.teamId === t.id;
        const slot = (k) => {
          const path = k === 0 ? 'teams.' + i + '.captainPhoto' : 'teams.' + i + '.playerPhotos.0';
          const npath = k === 0 ? 'teams.' + i + '.captain' : 'teams.' + i + '.players.0';
          const id = k === 0 ? t.captainPhoto : t.playerPhotos[0]; const nm = k === 0 ? t.captain : t.players[0];
          return '<div class="mslot"><button class="mthumb' + (id ? ' has' : '') + '" data-act="memPhoto" data-arg="' + esc(path) + '" data-drop="' + esc(path) + '" title="সদস্য ' + (k + 1) + ' — ক্লিক / টেনে আনুন / Ctrl+V">' + (id ? '<img data-media="' + esc(id) + '" alt="">' : '<span>＋<small>সদস্য ' + bn(k + 1) + '</small></span>') + '</button><input type="text" data-bind="' + esc(npath) + '" value="' + esc(nm) + '" placeholder="সদস্য ' + bn(k + 1) + (k === 0 ? ' (অধিনায়ক)' : '') + '" aria-label="' + esc(Sel.code(t)) + ' সদস্য ' + (k + 1) + '">' + (id ? '<button class="btn sm ghost" data-act="clearMedia" data-arg="' + esc(path) + '" title="ছবি সরান">✕</button>' : '') + '</div>';
        };
        return '<div class="mem-team' + (cur ? ' cur' : '') + '" style="--team:' + esc(t.color) + '"><div class="mt-head"><b class="mt-code">' + esc(Sel.code(t)) + '</b><span class="mt-name">' + esc(t.name === Sel.code(t) ? '' : t.name) + '</span></div>' + slot(0) + slot(1) + '</div>';
      }).join('');
      h += '</div>';
    }
    return h + '</div>';
  },
  /** V100 host panel: the answer stays hidden on the laptop until asked for (or always, by setting). */
  ansHtml(text, s) {
    if (s.settings.hostAnswer === 'always' || this.showAns) return '<div class="a">উত্তর: ' + esc(text) + '</div>';
    return '<div class="row" style="margin-top:.35rem"><button class="btn sm gold" data-act="showAnsHere">👁 উত্তর এখানে দেখাও (টিভিতে নয়)</button></div>';
  },
  teamDeck(s) {
    const ids = Sel.finalistIds();
    const l = s.live;
    const pick = this.picker === 'challenge';
    let h = '<div class="card"><h3>' + (pick ? '⚔ চ্যালেঞ্জার দল বেছে নিন (১–৮)' : 'দল ও স্কোর <span class="hint">ক্লিক = উত্তরদাতা দল (১–৮)</span>') + '</h3><div class="team-chips">';
    h += ids.map((id, i) => {
      const t = Sel.team(id); if (!t) return '';
      const sel = pick ? false : (l.active === id || l.challenger === id);
      return '<button class="chip' + (sel ? ' sel' : '') + '" style="--team:' + esc(t.color) + '" data-act="' + (pick ? 'challenge' : 'setActive') + '" data-arg="' + esc(id) + '"><span class="dot">' + (t.photo ? '<img data-media="' + esc(t.photo) + '" alt="">' : esc(Sel.code(t).charAt(0) || bn(i + 1))) + '</span>' + esc(Sel.label(t)) + ' <span class="pts">' + bn(Sel.score(id)) + '</span></button>';
    }).join('');
    h += '</div>';
    if (pick) h += '<div class="row" style="margin-top:.5rem"><button class="btn sm" data-act="cancelPicker">বাতিল (Esc)</button></div>';
    h += '<div class="row" style="margin-top:.5rem"><button class="btn sm' + (this.quickOpen ? ' on' : '') + '" data-act="quickToggle">⚡ দ্রুত নম্বর</button></div>';
    if (this.quickOpen) h += '<div class="quick">' + ids.map((id) => { const t = Sel.team(id); return t ? '<div class="quick-row" style="--team:' + esc(t.color) + '"><b>' + esc(t.name) + '</b>' + [10, 5, -5, -10].map((v) => '<button class="btn sm ' + (v > 0 ? 'good' : 'bad') + '" data-act="quick" data-arg="' + esc(id) + '|' + v + '">' + (v > 0 ? '+' : '−') + bn(Math.abs(v)) + '</button>').join('') + '</div>' : ''; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:.5rem"><select id="adjTeam" aria-label="দল" style="flex:1 1 140px">' + ids.map((id) => '<option value="' + esc(id) + '"' + (id === l.active ? ' selected' : '') + '>' + esc((Sel.team(id) || {}).name) + '</option>').join('') + '</select><input id="adjVal" type="number" value="5" style="width:80px" aria-label="নম্বর"><button class="btn sm good" data-act="adjust" data-arg="1">+ যোগ</button><button class="btn sm bad" data-act="adjust" data-arg="-1">− বিয়োগ</button></div></div>';
    return h;
  },

  /* ---------------- tabs ---------------- */
  renderTabs() {
    const info = pageInfo(this.tab);
    $('#tabs').innerHTML = info
      ? '<div class="set-head"><button class="btn back" data-act="tabHome" aria-label="সেটিংসে ফিরে যান">‹ সেটিংস</button><span class="set-ic" style="--c:' + info[2] + '">' + info[1] + '</span><h2>' + esc(info[3]) + '</h2></div>'
      : '<div class="set-head"><span class="set-ic" style="--c:#7c3aed">⚙</span><h2>সেটিংস ও প্রস্তুতি</h2><input id="navSearch" type="search" placeholder="🔍 খুঁজুন…" aria-label="সেটিংস খুঁজুন"></div>';
  },
  renderTab(force) {
    if (!force && this.typing()) { this.tabDirty = true; return; }
    this.tabDirty = false;
    const body = $('#tabBody'); if (!body) return;
    const scrolls = $$('[data-keep-scroll]', body).map((el) => [el.dataset.keepScroll, el.scrollTop]);
    const winY = window.scrollY;
    const fn = this.tab ? (TabRender[this.tab] || TabRender.show) : SettingsHome;
    body.innerHTML = safe('tab:' + this.tab, () => fn(Store.state), '<div class="card">এই ট্যাব লোড করা যায়নি — লগ দেখুন</div>');
    scrolls.forEach(([k, y]) => { const el = $('[data-keep-scroll="' + k + '"]', body); if (el) el.scrollTop = y; });
    window.scrollTo(0, winY);
    Media.hydrate(body);
    const cur = $('.rd.cur', body); if (cur && !scrolls.length) cur.scrollIntoView({ block: 'center' });
  },
};

/* Android-style settings: groups of rows; a row opens a page with a back arrow. */
const SETTINGS_GROUPS = [
  ['অনুষ্ঠান চালানো', [
    ['show', '🎬', '#7c3aed', 'শো রানডাউন', (s) => 'পুরো অনুষ্ঠানক্রম • দ্রুত যাও • রিহার্সাল'],
    ['prelim', '📝', '#2563eb', 'বাছাই পর্ব', (s) => bn(Sel.prelimQuestions().length) + 'টি প্রশ্ন • ANSWER বোতাম • ফলাফল ও শীর্ষ ' + bn(s.prelim.finalistCount)],
    ['teams', '👥', '#059669', 'দল ও ছবি', (s) => bn(s.teams.length) + 'টি দল • খেলোয়াড় • ছবি • স্কোর ইতিহাস'],
    ['questions', '❓', '#db2777', 'প্রশ্ন ব্যবস্থাপক', (s) => bn(s.questions.length) + 'টি প্রশ্ন • যোগ, সম্পাদনা, আমদানি'],
    ['scores', '🏆', '#ca8a04', 'স্কোর ও পরিসংখ্যান', (s) => bn(s.ledger.length) + 'টি স্কোর-এন্ট্রি • টাই • সার্টিফিকেট'],
    ['rounds', '🔁', '#ea580c', 'রাউন্ড ও নম্বর', (s) => bn(s.rounds.filter((r) => r.enabled).length) + 'টি রাউন্ড চালু • নিয়ম • টাইমার • রং'],
  ]],
  ['চেহারা ও লেখা', [
    ['text', '🔤', '#0891b2', 'লেখা ও ফন্ট', () => 'Office-এর মতো: ফন্ট, আকার, B / I / U, বাম-মাঝে-ডান'],
    ['colors', '🎨', '#c026d3', 'রং, পটভূমি ও বর্ডার', (s) => 'থিম: ' + ((THEMES[s.design.theme] || {}).label || 'কাস্টম')],
    ['effects', '✨', '#ca8a04', 'অ্যানিমেশন ও ইফেক্ট', () => 'দৃশ্য পরিবর্তন, গতি, কণা, আলো'],
    ['scenes', '🎞', '#4f46e5', 'দৃশ্যভিত্তিক সেটিংস', () => 'প্রতিটি দৃশ্যের নিজস্ব অ্যানিমেশন, পটভূমি, সাউন্ড'],
  ]],
  ['মিডিয়া ও শব্দ', [
    ['media', '🖼', '#16a34a', 'ছবি, পোস্টার ও গ্যালারি', (s) => bn(Media.index.length) + 'টি আপলোড • ব্যানার • লোগো'],
    ['audio', '🔊', '#dc2626', 'সংগীত ও সাউন্ড', () => 'থিম সং, স্বাগত সংগীত, সাউন্ড ইফেক্ট'],
    ['voice', '🗣', '#0d9488', 'ভয়েস (বাংলা)', (s) => s.speech.enabled ? 'চালু' : 'বন্ধ'],
  ]],
  ['ইভেন্ট', [
    ['event', '🏷', '#9333ea', 'অনুষ্ঠানের তথ্য ও আয়োজক', (s) => s.event.programme],
  ]],
  ['সরঞ্জাম', [
    ['ai', '🤖', '#7c3aed', 'AI স্টুডিও', () => (AI.cfg.airGapped ? 'Air-gapped (লোকাল)' : 'অনলাইন অনুমোদিত') + ' • প্রশ্ন তৈরি • যাচাই'],
  ]],
  ['সিস্টেম', [
    ['display', '🖥', '#0891b2', 'টিভি ও স্ক্রিন', (s) => s.display.aspect + ' • ক্যালিব্রেশন • দ্বিতীয় স্ক্রিন'],
    ['preshow', '✅', '#16a34a', 'অনুষ্ঠানের আগে পরীক্ষা', () => 'সব কিছু প্রস্তুত কি না এক নজরে'],
    ['backup', '💾', '#2563eb', 'সংরক্ষণ, ব্যাকআপ ও রিসেট', () => 'স্বয়ংক্রিয় সংরক্ষণ • আমদানি / রপ্তানি'],
    ['flow', '⏱', '#b45309', 'টাইমার ও প্রবাহ', (s) => 'সতর্কতা ' + bn(s.settings.warnAt) + 's • ড্রোন'],
    ['tests', '🧪', '#475569', 'পরীক্ষা ও লগ', () => 'স্বয়ংক্রিয় Self-test'],
    ['help', '❔', '#64748b', 'সাহায্য ও শর্টকাট', () => 'কিবোর্ড শর্টকাট • তথ্য'],
  ]],
];
/** The settings home page: Android-style grouped list. */
function SettingsHome(s) {
  return SETTINGS_GROUPS.map(([title, rows]) => '<section class="set-group"><h4>' + esc(title) + '</h4><div class="set-list">' + rows.map(([k, ic, col, name, sub]) => '<button class="set-row" data-act="tab" data-arg="' + k + '"><span class="set-ic" style="--c:' + col + '">' + ic + '</span><span class="set-tx"><b>' + esc(name) + '</b><small>' + esc(safe('sub', () => sub(s), '')) + '</small></span><span class="chev" aria-hidden="true">›</span></button>').join('') + '</div></section>').join('');
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
  previewFull() { const el = $('#preview .stage'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el && el.requestFullscreen) el.requestFullscreen().catch((e) => UI.toast('ফুলস্ক্রিন হয়নি: ' + e.message, 'err')); },
  blackout() { Show.toggleBlackout(); },
  undo() { const l = Store.undo(); UI.toast(l ? 'আনডু: ' + l : 'আনডু করার কিছু নেই', l ? 'ok' : ''); },
  redo() { const l = Store.redo(); UI.toast(l ? 'রিডু: ' + l : 'রিডু করার কিছু নেই', l ? 'ok' : ''); },
  mute() {
    AudioDirector.unlock();
    SoundDirector.setMuted(!SoundDirector.muted);
    Sync.send({ type: 'mute', on: SoundDirector.muted });
    const b = $('#btnMute'); if (b) { b.classList.toggle('on', SoundDirector.muted); b.innerHTML = (SoundDirector.muted ? '🔈 আনমিউট' : '🔇 মিউট') + ' <kbd>M</kbd>'; }
    UI.toast(SoundDirector.muted ? 'সব শব্দ মিউট' : 'শব্দ চালু', 'ok');
  },
  volume(d) { Store.commit('volume', (s) => { s.audio.master = Math.round(clamp(s.audio.master + num(d), 0, 1) * 10) / 10; }, { undo: false }); AudioDirector.setMaster(Store.state.audio.master); UI.toast('মাস্টার ভলিউম ' + Math.round(Store.state.audio.master * 100) + '%'); },
  pad(name) { AudioDirector.unlock(); Cue.play(name); },
  moodPreview(m) { AudioDirector.unlock(); if (m) Music.preview(m); else Music.stopPreview(); },
  testTone(pan) { AudioDirector.unlock(); Sfx.testTone(num(pan)); },
  soundboardToggle() { UI.boardOpen = !UI.boardOpen; UI.liveSig = ''; UI.renderLive(); },
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
  bonus() { Game.bonus(); },
  clip(action) { Store.commit('clip-' + action, (s) => { s.live.clip = { action, at: now() }; }, { undo: false }); },
  placeStage() { Sync.placeStage(); },
  calibNext() { const L = ['off', 'bars', 'grid', 'ramp']; Store.commit('calib', (s) => { s.display.calib = L[(L.indexOf(s.display.calib) + 1) % L.length]; }, { undo: false }); },
  status() { AudioDirector.unlock(); const s = Store.state; const t = Sel.team(Sel.answeringTeam()); const q = Sel.liveQuestion(); const rem = Math.ceil(Sel.timerRemaining(s.timer) / 1000); Speech.say('এখন ' + (SCENES[s.show.scene] || s.show.scene) + (s.show.scene === 'QUESTION' && q ? '। প্রশ্ন ' + q.number + (t ? '। উত্তর দিচ্ছে ' + t.name : '') + '। টাইমার ' + rem + ' সেকেন্ড' + (s.timer.running ? ' চলছে' : ' থেমে আছে') : '') + '।', 'status', true); },
  bgmToggle() { Store.commit('bgm', (s) => { s.audio.bgm.on = !s.audio.bgm.on; }, { undo: false }); UI.toast('পটভূমি সংগীত ' + (Store.state.audio.bgm.on ? 'চালু' : 'বন্ধ'), 'ok'); },
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
    try { const id = await Media.add(file, 'image'); Store.commit('media:' + path, (s) => setPath(s, path, id)); UI.toast('ছবি যুক্ত হয়েছে ✓', 'ok'); } catch (e) { UI.toast(e.message || 'ছবি যোগ করা যায়নি', 'err'); Log.err('photo', e); }
  },
  /** Many pictures at once: they fill the empty member slots in order (A / 1 member 1, member 2, B / 2 …). */
  memBulk() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []); if (!files.length) return;
      const slots = []; Store.state.teams.forEach((t, i) => { if (!t.captainPhoto) slots.push('teams.' + i + '.captainPhoto'); if (!t.playerPhotos[0]) slots.push('teams.' + i + '.playerPhotos.0'); });
      let n = 0;
      for (const f of files) { const path = slots[n]; if (!path) break; try { const id = await Media.add(f, 'image'); Store.commit('media:' + path, (s) => setPath(s, path, id)); n += 1; } catch (e) { UI.toast(e.message, 'err'); } }
      UI.toast(bn(n) + 'টি ছবি যুক্ত হয়েছে' + (files.length > n ? ' • খালি ঘর না থাকায় ' + bn(files.length - n) + 'টি বাকি' : ''), n ? 'ok' : 'err');
    };
    inp.click();
  },
  quickToggle() { UI.quickOpen = !UI.quickOpen; UI.liveSig = ''; UI.renderLive(); },
  quick(arg) { const [id, v] = String(arg).split('|'); Game.adjust(id, int(v), 'দ্রুত ' + signed(int(v))); },
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
    if (!q) { UI.toast('প্রশ্ন ' + bn(n) + ' নেই', 'err'); return true; }
    if (s.board.played[q.id]) { UI.toast('প্রশ্ন ' + bn(n) + ' আগেই খেলা হয়েছে', 'err'); return true; }
    Actions.loadQ(q.id); return true;
  },
  lifeline(k) { Game.useLifeline(k); },
  speak(what) { AudioDirector.unlock(); ({ question: () => Speech.readQuestion(true), options: () => Speech.readOptions(true), answer: () => Speech.readAnswer(true), team: () => Speech.readTeam(true), round: () => Speech.readRound(true) }[what] || (() => {}))(); },
  qStep(d) {
    const s = Store.state; const r = Sel.round(s.live.roundId); if (!r) return;
    const qs = Sel.roundQuestions(r.id); const i = qs.findIndex((q) => q.id === s.live.qid);
    const nq = qs[clamp(i + int(d), 0, qs.length - 1)];
    if (nq && nq.id !== s.live.qid) { if (int(d) > 0) Game.advanceTurn(r.id); Show.jump('QUESTION', { key: nq.id, roundId: r.id, qid: nq.id }); }
  },
  gotoGrid() { const r = Sel.currentRound(); if (r) Show.jump('GRID', { key: r.id, roundId: r.id }); },
  loadQ(qid) { const q = Sel.question(qid); if (!q) return; Cue.play('laser'); if (Store.state.show.scene === 'GRID' && Store.state.live.qid && Store.state.live.qid !== qid && Store.state.live.result) Game.advanceTurn(q.roundId); Show.jump('QUESTION', { key: q.id, roundId: q.roundId, qid: q.id }); },
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

const SOUNDBOARD = [['drumroll', '🥁 ড্রামরোল'], ['applause', '👏 হাততালি'], ['suspense', '😱 সাসপেন্স'], ['gong', '🔔 গং'], ['ding', '✨ ডিং'], ['fanfare', '🎺 ফ্যানফেয়ার'], ['correct', '✓ সঠিক'], ['wrong', '✗ ভুল'], ['buzzer', '⏰ বাজার'], ['tick', '⏱ টিক-টক'], ['pass', '➜ পাস'], ['option', '◉ পপ'], ['siren', '🚨 সাইরেন'], ['laser', '⚡ লেজার'], ['heartbeat', '❤ হার্টবিট']];
const SHORTCUTS = [
  ['Space', 'টাইমার চালু / বিরতি'], ['→ / PgDn', 'পরের দৃশ্য'], ['← / PgUp', 'আগের দৃশ্য'], ['D', 'সরাসরি টাইমার (৬০s)'], ['P', 'পাস: পরের দল + ৪৫s'], ['Shift+P', 'শুধু ৪৫s টাইমার'],
  ['R', 'উত্তর দেখাও / পরের স্থান প্রকাশ'], ['C', 'সঠিক'], ['X', 'ভুল'], ['N', 'নো স্কোর'], ['H', 'চ্যালেঞ্জ (তারপর ১–৮)'], ['V', 'বিকল্প দেখাও/লুকাও'],
  ['১–১০ (বোর্ডে)', 'প্রশ্ন বোর্ডে নম্বর টিপলে সেই প্রশ্ন খোলে (০ = ১০)'], ['Shift+A/B/C/D', 'দল যে বিকল্প (ক/খ/গ/ঘ) বলল — রাউন্ড ১-এ সঙ্গে সঙ্গে রায়'], ['V / Shift+V', '৪ বিকল্প দেখাও / ২ বিকল্পে নামাও'], ['1–9', 'উত্তরদাতা দল বেছে নাও; ভুলের পরে = সেই দলে পাস; রাউন্ড ৩-এ = সেই দল বাজার টিপেছে'], ['Alt+1/2/3', '৫০:৫০ / পোল / ফ্লিপ'], ['0', 'টাইমার রিসেট'], ['+ / −', '১০ সেকেন্ড যোগ / বিয়োগ'], ['S', 'স্কোরবোর্ড'], ['W', 'বিজয়ী'],
  ['B', 'ব্ল্যাকআউট'], ['L', 'প্রশ্ন লক / আনলক'], ['Shift+L', 'পুরো স্কোর পড়ে শোনাও'], ['G', 'বোনাস'], ['Shift+1–8', 'হাত তোলা / বাজার'], ['F', 'ফুলস্ক্রিন'], ['O', 'স্টেজ উইন্ডো খোলো'], ['E', 'প্রশ্ন পড়ে শোনাও'], ['A', 'উত্তর পড়ে শোনাও'], ['T', 'দলের নাম পড়ো'], ['M', 'মিউট / আনমিউট'], ['[ / ]', 'মাস্টার ভলিউম কম / বেশি'],
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
    if (m.shift && /^Digit[1-9]$/.test(code)) {
      const id = Sel.teamByKey(int(code.slice(5)));
      if (id) { Actions.raiseHand(id); return true; }
      return false;
    }
    if (s.settings.keyLayout === 'v100' && !m.ctrl && !m.alt && this.v100(k, m, s)) return true;
    // the team names an option: Shift + A/B/C/D (or ক/খ/গ/ঘ on the board) marks it — judged at once in round 1
    if (m.shift && /^[a-d]$/.test(k) && s.show.scene === 'QUESTION' && s.live.qid) { Actions.pick('abcd'.indexOf(k)); return true; }
    if (m.shift && k === 'v' && s.show.scene === 'QUESTION') { Actions.twoOptions(); return true; }
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
      case 'w': Actions.jump('WINNER'); return true;
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
      case 'Escape': if (UI.picker) { Actions.cancelPicker(); return true; } return false;
      case 'Home': Actions.goStep(0); return true;
      default: return false;
    }
  },
};
