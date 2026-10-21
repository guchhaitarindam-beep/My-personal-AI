/* =====================================================================
   AUDIO / VIDEO PAGE — the easy place to give a question its sound or film.
   Opened from the Home page and the Questions page. One row per question:
   drop a file on the row, or press ＋, try it with ▶, take it off with ✕.
   On the TV the clip plays full screen first; then the question comes.
   ===================================================================== */
const fmtLen = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const CLIP_EXT = ['mp4', 'webm', 'm4v', 'mov', 'mkv', 'mp3', 'm4a', 'wav', 'ogg', 'aac', 'opus'];
const CLIP_ACCEPT = 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.aac,.mp4,.webm,.m4v,.mov,.mkv';
const PRELIM_TAB = 'PRELIM';
/** a main-round question or a selection-round question, by id */
const clipTarget = (s, id) => s.questions.find((x) => x.id === id) || s.prelim.questions.find((x) => x.id === id);
/** the questions on a tab: a round's, or the selection round's (numbered 1 …) */
const clipRows = (tab) => (tab === PRELIM_TAB ? Store.state.prelim.questions.slice(0, Math.max(1, Store.state.prelim.count || 0)).map((q, i) => Object.assign({}, q, { number: i + 1, prelim: true })) : Sel.roundQuestions(tab));
const ClipUI = {
  round: '',
  lens: {},
  /** check the folder files of this round once (length, or not found) */
  async lengths() {
    const ids = [...new Set(clipRows(this.round).map((q) => q.clip).filter((c) => /^file:/.test(c || '') && !(c in this.lens)))];
    if (!ids.length) return;
    for (const id of ids) this.lens[id] = await Media.probe(id.slice(5));
    this.render();
  },
  /** link a file that is in the folder; otherwise say where to put it (or copy it in) */
  async linkDisk(qid, file) {
    const len = await Media.probe(file.name);
    if (len >= 0) { Store.commit('clip-link', (s) => { const q = clipTarget(s, qid); if (q) q.clip = 'file:' + file.name; }); this.lens['file:' + file.name] = len; UI.toast('📁 ' + file.name + ' — plays from the laptop folder ✓', 'ok'); this.render(); return; }
    this.pendingCopy = { qid, file };
    const out = $('#clipTryBox'); if (out) out.innerHTML = '<div class="card warnbox"><b>⚠ ' + esc(file.name) + ' is not in the folder.</b><p>Copy it into <code>' + esc(Media.folderPath()) + '</code> and choose it again — or copy it into the engine (fine for short clips).</p><p class="muted">ফাইলটা ফোল্ডারে নেই। ওপরের ফোল্ডারে কপি করে আবার বাছুন — অথবা ইঞ্জিনে কপি করুন (ছোট ক্লিপের জন্য)।</p>' + F.btn('clipCopyIn', '＋ Copy it into the engine instead', 'primary') + '</div>';
  },
  /** any file from anywhere: one in the QuizCorner_Media folder plays from there; anything else is copied into the engine whole (no size limit, no quality loss) */
  async addAny(qid, file) {
    const kind = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|wma|opus)$/i.test(file.name) ? 'audio' : /^video\//.test(file.type) || /\.(mp4|webm|m4v|mov|ogv|mkv)$/i.test(file.name) ? 'video' : '';
    if (!kind) { UI.toast('Choose an audio (mp3, m4a, wav) or video (mp4, webm) file', 'err'); return; }
    const len = await Media.probe(file.name, 2500);
    if (len >= 0) {
      Store.commit('clip-link', (s) => { const q = clipTarget(s, qid); if (q) q.clip = 'file:' + file.name; });
      this.lens['file:' + file.name] = len; UI.toast('📁 ' + file.name + ' — plays from the laptop folder ✓', 'ok'); this.render(); return;
    }
    try {
      UI.toast('Adding ' + file.name + ' (' + Math.max(1, Math.round(file.size / 1048576)) + ' MB)…', 'ok');
      const id = await Media.add(file, kind);
      Store.commit('clip-set', (s) => { const q = clipTarget(s, qid); if (q) q.clip = id; });
      UI.toast((kind === 'audio' ? '🔊 ' : '🎬 ') + file.name + ' added — full quality, kept on this laptop ✓', 'ok'); this.render();
    } catch (e) { UI.toast(e.message || 'Could not add the file', 'err'); }
  },
  /** the question on the TV now, its clip playing (check sound and picture before the show) */
  onTv(qid) {
    const s = Store.state; const pi = s.prelim.questions.findIndex((x) => x.id === qid);
    if (pi >= 0) { const st = Show.rundown().find((x) => x.scene === 'PRELIM_Q' && x.params.idx === pi); if (!st) return UI.toast('The selection round is not on the TV (Prelim page: on stage)', 'err'); Show.go(st); }
    else { const q = Sel.question(qid); if (!q) return; Show.jump('QUESTION', { key: q.id, roundId: q.roundId, qid: q.id }); }
    UI.toast('📺 On the TV now — the clip plays full screen; press Next ▶ for the question', 'ok');
  },
  /** every question of every round: R{round}-{n}.mp4 / .mp3 … (or R1-5-clip.mp4) in the folder → linked */
  async scan() {
    const out = $('#clipScanOut'); const found = []; let checked = 0;
    const qs = Store.state.questions.filter((q) => /^R\d+$/.test(q.roundId));
    const jobs = qs.map((q) => async () => {
      const base = q.roundId + '-' + q.number;
      for (const stem of [base, base + '-clip', base.toLowerCase()]) for (const ext of CLIP_EXT) {
        const len = await Media.probe(stem + '.' + ext, 2500);
        if (len >= 0) { found.push({ id: q.id, name: stem + '.' + ext, len }); return; }
      }
      checked += 1; if (out) out.textContent = 'Looking… ' + checked + ' / ' + qs.length;
    });
    // the selection (prelim) round: S-1.mp4 (or P-1.mp4) for question 1 …
    Store.state.prelim.questions.forEach((q, i) => jobs.push(async () => {
      for (const stem of ['S-' + (i + 1), 'P-' + (i + 1), 's-' + (i + 1)]) for (const ext of CLIP_EXT) {
        const len = await Media.probe(stem + '.' + ext, 2500);
        if (len >= 0) { found.push({ pid: q.id, name: stem + '.' + ext, len }); return; }
      }
    }));
    const run = async () => { while (jobs.length) await jobs.shift()(); };
    await Promise.all(Array.from({ length: 6 }, run));
    if (found.length) Store.commit('clip-scan', (s) => { found.forEach((f) => { const q = f.pid ? s.prelim.questions.find((x) => x.id === f.pid) : s.questions.find((x) => x.id === f.id); if (q) q.clip = 'file:' + f.name; }); });
    found.forEach((f) => { this.lens['file:' + f.name] = f.len; });
    this.render();
    const o = $('#clipScanOut'); if (o) o.innerHTML = found.length ? '<b class="ok">✔ ' + found.length + ' file(s) linked:</b> ' + found.map((f) => esc(f.name) + ' (' + fmtLen(f.len) + ')').join(', ') : '⚠ No R1-5.mp4 … files found in the folder.';
    UI.toast(found.length ? '✔ ' + found.length + ' audio / video file(s) linked from the laptop folder' : 'No files found in ' + Media.FOLDER, found.length ? 'ok' : 'err');
  },
  open(rid) {
    const rounds = Store.state.rounds.filter((r) => Sel.roundQuestions(r.id).length);
    this.round = rid || this.round || (rounds[0] && rounds[0].id) || 'R1';
    UI.modal('🎬 Audio / Video for questions • প্রশ্নের অডিও / ভিডিও', '<div id="clipPage"></div>');
    this.render();
  },
  render() {
    setTimeout(() => this.lengths(), 0);
    const box = $('#clipPage'); if (!box) return;
    const rounds = Store.state.rounds.filter((r) => Sel.roundQuestions(r.id).length);
    const qs = clipRows(this.round);
    const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const rows = qs.map((q) => {
      const m = q.clip ? Media.index.find((x) => x.id === q.clip) : null; const kind = Sel.clipKind(q); const disk = /^file:/.test(q.clip || '');
      const inside = disk && !!Media.builtin('clip-' + q.clip.slice(5));
      const len = disk && this.lens[q.clip] > 0 ? ' • ' + fmtLen(this.lens[q.clip]) : '';
      const has = q.clip ? '<span class="clip-has">' + (kind === 'audio' ? '🔊 Audio' : '🎬 Video') + (inside ? ' • <b class="ok">✔ built into the quiz</b> • ' + esc(q.clip.slice(5)) + len : disk ? ' • 📁 laptop folder • ' + esc(q.clip.slice(5)) + len + (this.lens[q.clip] === -1 ? ' • <b class="bad">⚠ not found — press ＋ and choose the file again</b>' : ' ✓') : m ? ' • in the engine • ' + esc(m.name) + ' • ' + fmt(m.size) : '') + '</span>' : '<span class="muted">— none • কিছু নেই</span>';
      const label = q.prelim && !q.text ? '—' : q.picOnly ? '🖼 Picture question' : esc(str(q.text).slice(0, 90)) + (str(q.text).length > 90 ? '…' : '');
      return '<div class="li clip-row' + (q.clip ? ' has' : '') + '" data-clip-drop="' + esc(q.id) + '"><span class="n">' + String(q.number) + '</span><div class="t">' + label + '<small>' + has + '</small></div>' +
        '<div class="deck">' + F.btn('clipAny', q.clip ? '＋ Change' : '＋ Add audio / video', q.clip ? '' : 'primary', q.id) + (q.clip ? F.btn('clipTry', '▶ Try here', 'good', q.id) + F.btn('clipTv', '📺 Play on TV', 'gold', q.id) + F.btn('clipRemove', '✕', 'bad', q.id) : '') + '</div></div>';
    }).join('');
    const folder = Media.folderPath();
    box.innerHTML = '<div class="row">' + F.btn('clipRound', 'বাছাই পর্ব / Selection (' + clipRows(PRELIM_TAB).filter((q) => q.clip).length + ' 🎬)', 'sm' + (this.round === PRELIM_TAB ? ' on' : ''), PRELIM_TAB) + rounds.map((r) => F.btn('clipRound', esc(r.name) + ' (' + Sel.roundQuestions(r.id).filter((q) => q.clip).length + ' 🎬)', 'sm' + (r.id === this.round ? ' on' : ''), r.id)).join('') + '</div>' +
      '<p class="big-hint"><b>＋ Add audio / video</b> on a question → choose the file from anywhere on the laptop (Downloads, pen drive …). It is kept at full quality. • <b>যে কোনো জায়গা থেকে ফাইল বেছে নিন — পুরো মানে রাখা থাকবে।</b> Then <b>📺 Play on TV</b> to check picture and sound.</p>' +
      '<div class="list clip-list">' + (rows || '<p class="muted">No questions in this round yet.</p>') + '</div><div id="clipTryBox"></div>' +
      '<p class="big-hint"><b>How it works on the TV:</b> the question\'s video or audio plays <b>full screen first</b> (by itself, only the scores underneath). When it ends — or when you press <b>Next ▶</b> — the question comes full screen, then the team photo and timer as usual.<br>টিভিতে: প্রথমে ভিডিও / অডিও পুরো পর্দায় নিজে থেকেই চলবে, শেষ হলে (বা Next টিপলে) প্রশ্ন আসবে।</p>' +
      '<details class="card"><summary><b>More ways</b> — a whole folder of files at once (R1-5.mp4 …) • অনেক ফাইল একসঙ্গে</summary>' +
      '<div class="clip-folder"><b>⭐ Best quality, any length — straight from this laptop:</b> put the videos / audio in this folder, named by round and question (<code>R1-5.mp4</code> = round 1 question 5, <code>R3-2.mp3</code> …):<div class="clip-path"><code id="clipFolder">' + esc(folder) + '</code>' + F.btn('clipCopyPath', '📋 Copy the folder path', 'sm') + '</div>' +
      '<p class="muted" style="margin:.3rem 0">সেরা মান, যত লম্বাই হোক: ভিডিও / অডিও এই ফোল্ডারে রাখুন (নাম R1-5.mp4 = রাউন্ড ১ প্রশ্ন ৫), তারপর নিচের বোতাম টিপুন। কিছু কপি বা ছোট হয় না — ল্যাপটপ থেকেই সরাসরি চলে।</p>' +
      '<div class="row">' + F.btn('clipScan', '🔍 Find the files in the folder (all rounds)', 'good lg') + '<span id="clipScanOut" class="muted"></span></div></div>' +
      '<div class="drop clip-bulk" data-clip-bulk="1">📂 <b>Small files, copied into the engine:</b> drop files named <code>R1-5.mp4</code>, <code>R3-2.mp3</code> … here — or ' + F.btn('clipBulk', 'choose them', 'sm') + '</div>' + '</details>';
  },
  async put(qid, file) {
    const kind = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|wma)$/i.test(file.name) ? 'audio' : /^video\//.test(file.type) || /\.(mp4|webm|m4v|mov|ogv)$/i.test(file.name) ? 'video' : '';
    if (!kind) { UI.toast('Choose an audio (mp3, m4a, wav) or video (mp4, webm) file', 'err'); return; }
    try {
      UI.toast('Adding ' + file.name + '…', 'ok');
      const id = await Media.add(file, kind);
      Store.commit('clip-set', (s) => { const q = clipTarget(s, qid); if (q) q.clip = id; });
      UI.toast((kind === 'audio' ? '🔊 ' : '🎬 ') + file.name + ' added ✓', 'ok'); this.render();
    } catch (e) { UI.toast(e.message || 'Could not add the file', 'err'); }
  },
  async tryIt(qid) {
    const q = clipTarget(Store.state, qid); const out = $('#clipTryBox'); if (!q || !q.clip || !out) return;
    const u = await Media.url(q.clip); const audio = Sel.clipKind(q) === 'audio';
    out.innerHTML = '<div class="card"><b>▶ ' + String(q.number) + '</b> ' + (audio ? '<audio controls autoplay src="' + esc(u) + '"></audio>' : '<video controls autoplay playsinline src="' + esc(u) + '" style="width:100%;max-height:40vh;background:#000"></video>') + '</div>';
  },
};
// drag a file onto a row (or many named files onto the bulk box)
document.addEventListener('dragover', (e) => { const z = e.target && e.target.closest && e.target.closest('[data-clip-drop],[data-clip-bulk]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const z = e.target && e.target.closest && e.target.closest('[data-clip-drop],[data-clip-bulk]'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  const z = e.target && e.target.closest && e.target.closest('[data-clip-drop],[data-clip-bulk]'); if (!z) return;
  e.preventDefault(); e.stopPropagation(); z.classList.remove('over');
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (!files.length) return;
  if (z.dataset.clipBulk) { Actions.qMediaBulkFiles(files, true); return; }
  // a file that is in the laptop folder is played from there; anything else is copied into the engine
  ClipUI.addAny(z.dataset.clipDrop, files[0]);
}, true);

Object.assign(Actions, {
  clipPage(rid) { ClipUI.open(rid); },
  clipRound(rid) { ClipUI.round = rid; ClipUI.render(); },
  clipAny(qid) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = CLIP_ACCEPT; inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) ClipUI.addAny(qid, f); }; inp.click(); },
  clipTv(qid) { ClipUI.onTv(qid); },
  clipAdd(qid) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) ClipUI.put(qid, f); }; inp.click(); },
  clipBulk() { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm'; inp.onchange = () => Actions.qMediaBulkFiles(Array.from(inp.files || []), true); inp.click(); },
  clipTry(qid) { ClipUI.tryIt(qid); },
  clipDisk(qid) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm,.mov,.mkv'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) ClipUI.linkDisk(qid, f); }; inp.click(); },
  clipCopyIn() { const p = ClipUI.pendingCopy; if (p) { ClipUI.pendingCopy = null; ClipUI.put(p.qid, p.file); } },
  clipScan() { ClipUI.scan(); },
  clipCopyPath() { const t = Media.folderPath(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => UI.toast('Folder path copied — paste it in File Explorer\'s address bar', 'ok')).catch(() => { prompt('Folder path:', t); }); },
  clipRemove(qid) { if (!confirm('Take the audio / video off this question?')) return; Store.commit('clip-remove', (s) => { const q = clipTarget(s, qid); if (q) q.clip = ''; }); ClipUI.render(); },
});
