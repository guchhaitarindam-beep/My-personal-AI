/* =====================================================================
   AUDIO / VIDEO PAGE — the easy place to give a question its sound or film.
   Opened from the Home page and the Questions page. One row per question:
   drop a file on the row, or press ＋, try it with ▶, take it off with ✕.
   On the TV the clip plays full screen first; then the question comes.
   ===================================================================== */
const ClipUI = {
  round: '',
  open(rid) {
    const rounds = Store.state.rounds.filter((r) => Sel.roundQuestions(r.id).length);
    this.round = rid || this.round || (rounds[0] && rounds[0].id) || 'R1';
    UI.modal('🎬 Audio / Video for questions • প্রশ্নের অডিও / ভিডিও', '<div id="clipPage"></div>');
    this.render();
  },
  render() {
    const box = $('#clipPage'); if (!box) return;
    const rounds = Store.state.rounds.filter((r) => Sel.roundQuestions(r.id).length);
    const qs = Sel.roundQuestions(this.round);
    const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const rows = qs.map((q) => {
      const m = q.clip ? Media.index.find((x) => x.id === q.clip) : null; const kind = Sel.clipKind(q);
      const has = q.clip ? '<span class="clip-has">' + (kind === 'audio' ? '🔊 Audio' : '🎬 Video') + (m ? ' • ' + esc(m.name) + ' • ' + fmt(m.size) : '') + '</span>' : '<span class="muted">— none • কিছু নেই</span>';
      const label = q.picOnly ? '🖼 Picture question' : esc(str(q.text).slice(0, 90)) + (str(q.text).length > 90 ? '…' : '');
      return '<div class="li clip-row' + (q.clip ? ' has' : '') + '" data-clip-drop="' + esc(q.id) + '"><span class="n">' + String(q.number) + '</span><div class="t">' + label + '<small>' + has + '</small></div>' +
        '<div class="deck">' + F.btn('clipAdd', q.clip ? '↻ Change' : '＋ Add audio / video', q.clip ? '' : 'primary', q.id) + (q.clip ? F.btn('clipTry', '▶ Try here', 'good', q.id) + F.btn('clipRemove', '✕', 'bad', q.id) : '') + '</div></div>';
    }).join('');
    box.innerHTML = '<p class="big-hint"><b>How it works on the TV:</b> the question\'s video or audio plays <b>full screen first</b> (by itself, only the scores underneath). When it ends — or when you press <b>Next ▶</b> — the question comes full screen, then the team photo and timer as usual.<br>টিভিতে: প্রথমে ভিডিও / অডিও পুরো পর্দায় নিজে থেকেই চলবে, শেষ হলে (বা Next টিপলে) প্রশ্ন আসবে।</p>' +
      '<div class="row">' + rounds.map((r) => F.btn('clipRound', esc(r.name) + ' (' + Sel.roundQuestions(r.id).filter((q) => q.clip).length + ' 🎬)', 'sm' + (r.id === this.round ? ' on' : ''), r.id)).join('') + '</div>' +
      '<div class="drop clip-bulk" data-clip-bulk="1">📂 <b>Many at once:</b> drop files named by round and question — <code>R1-5.mp4</code>, <code>R3-2.mp3</code> (round 1 question 5 …) — or ' + F.btn('clipBulk', 'choose them', 'sm primary') + '</div>' +
      '<p class="muted" style="margin:.4rem 0">Or one question at a time: drag a file onto its row, or press ＋. Video: mp4 / webm • Audio: mp3 / m4a / wav. Files stay on this laptop.</p>' +
      '<div class="list clip-list">' + (rows || '<p class="muted">No questions in this round yet.</p>') + '</div><div id="clipTryBox"></div>';
  },
  async put(qid, file) {
    const kind = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|wma)$/i.test(file.name) ? 'audio' : /^video\//.test(file.type) || /\.(mp4|webm|m4v|mov|ogv)$/i.test(file.name) ? 'video' : '';
    if (!kind) { UI.toast('Choose an audio (mp3, m4a, wav) or video (mp4, webm) file', 'err'); return; }
    try {
      UI.toast('Adding ' + file.name + '…', 'ok');
      const id = await Media.add(file, kind);
      Store.commit('clip-set', (s) => { const q = s.questions.find((x) => x.id === qid); if (q) q.clip = id; });
      UI.toast((kind === 'audio' ? '🔊 ' : '🎬 ') + file.name + ' added ✓', 'ok'); this.render();
    } catch (e) { UI.toast(e.message || 'Could not add the file', 'err'); }
  },
  async tryIt(qid) {
    const q = Sel.question(qid); const out = $('#clipTryBox'); if (!q || !q.clip || !out) return;
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
  ClipUI.put(z.dataset.clipDrop, files[0]);
}, true);

Object.assign(Actions, {
  clipPage(rid) { ClipUI.open(rid); },
  clipRound(rid) { ClipUI.round = rid; ClipUI.render(); },
  clipAdd(qid) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm'; inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) ClipUI.put(qid, f); }; inp.click(); },
  clipBulk() { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm'; inp.onchange = () => Actions.qMediaBulkFiles(Array.from(inp.files || []), true); inp.click(); },
  clipTry(qid) { ClipUI.tryIt(qid); },
  clipRemove(qid) { if (!confirm('Take the audio / video off this question?')) return; Store.commit('clip-remove', (s) => { const q = s.questions.find((x) => x.id === qid); if (q) q.clip = ''; }); ClipUI.render(); },
});
