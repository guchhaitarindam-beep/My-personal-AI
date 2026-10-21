/* =====================================================================
   POWERPOINT IMPORT — old quiz decks (.pptx) straight into the engine.
   One file, many files or a whole folder: every slide is read (pictures with
   their crop, text boxes, picture-filled boxes, what appears on click, audio
   and video), repeated slides of one question are merged, and each deck
   becomes the questions of a round — picture questions or questions with
   options — with a preview to check before anything changes. Offline.
   ===================================================================== */
const PptxImport = (() => {
  const td = new TextDecoder('utf-8');
  /** zip reader that also gives the bytes of pictures and media (the .xlsx one only gives small text parts) */
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a .pptx file (an old .ppt? Open it in PowerPoint and Save As → PowerPoint Presentation .pptx)');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < n; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('The .pptx file is damaged');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      if (ds + csize <= u8.length) out[name] = { method, usize, data: u8.subarray(ds, ds + csize) };
      p += 46 + nl + xl + cl;
    }
    const bytes = async (name) => {
      const e = out[name]; if (!e) return null;
      if (e.method === 0) return e.data;
      if (e.method !== 8) throw new Error('Unsupported compression in ' + name);
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open .pptx files — use Chrome or Edge');
      return new Uint8Array(await new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    };
    return { has: (name) => !!out[name], size: (name) => (out[name] ? out[name].usize : 0), bytes, text: async (name) => { const b = await bytes(name); return b ? td.decode(b) : null; } };
  }
  const xml = (s) => new DOMParser().parseFromString(s || '<x/>', 'application/xml');
  const all = (el, name) => Array.from(el.getElementsByTagNameNS('*', name));
  const one = (el, name) => (el ? el.getElementsByTagNameNS('*', name)[0] || null : null);
  const kids = (el, name) => Array.from(el ? el.children : []).filter((c) => !name || c.localName === name);
  const rid = (el, a = 'embed') => (el ? el.getAttribute('r:' + a) || el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', a) || '' : '');
  const num = (v) => Number(v) || 0;
  function resolve(base, target) {
    if (/^\//.test(target)) return target.slice(1);
    const parts = base.split('/').slice(0, -1);
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
    return parts.join('/');
  }
  async function rels(z, part) {
    const path = part.replace(/([^/]+)$/, '_rels/$1.rels'); const map = {};
    all(xml(await z.text(path)), 'Relationship').forEach((r) => { map[r.getAttribute('Id')] = { target: r.getAttribute('TargetMode') === 'External' ? '' : resolve(part, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || '' }; });
    return map;
  }
  /** one paragraph per line; a line break inside a paragraph is a new line too */
  function textOf(el) {
    return all(el, 'p').map((p) => { let s = ''; p.querySelectorAll('*').forEach((n) => { if (n.localName === 't') s += n.textContent; else if (n.localName === 'br') s += '\n'; }); return s; }).join('\n');
  }
  function cropOf(fill) {
    const r = one(fill, 'srcRect'); if (!r) return null;
    const g = (k) => Math.max(0, num(r.getAttribute(k)) / 100000);
    const c = { l: g('l'), t: g('t'), r: g('r'), b: g('b') };
    return c.l + c.t + c.r + c.b > 0.001 ? c : null;
  }
  /** a slide → its pictures, picture-filled boxes, text boxes and media, in slide coordinates (groups flattened) */
  async function readSlide(z, path, n) {
    const doc = xml(await z.text(path)); const rel = await rels(z, path);
    const animated = new Set(all(doc, 'spTgt').map((e) => e.getAttribute('spid')));
    const slide = { n, pics: [], fills: [], texts: [], media: [] };
    const walk = (parent, T) => {
      for (const el of kids(parent)) {
        const nv = one(el, 'cNvPr'); const id = nv ? nv.getAttribute('id') : ''; const name = nv ? nv.getAttribute('name') || '' : '';
        if (nv && nv.getAttribute('hidden') === '1') continue;
        if (el.localName === 'grpSp') {
          const x = one(kids(el, 'grpSpPr')[0], 'xfrm'); if (!x) { walk(el, T); continue; }
          const off = one(x, 'off'), ext = one(x, 'ext'), co = one(x, 'chOff'), ce = one(x, 'chExt');
          const kx = ce && num(ce.getAttribute('cx')) ? num(ext.getAttribute('cx')) / num(ce.getAttribute('cx')) : 1;
          const ky = ce && num(ce.getAttribute('cy')) ? num(ext.getAttribute('cy')) / num(ce.getAttribute('cy')) : 1;
          walk(el, { ox: T.ox + T.sx * (num(off && off.getAttribute('x')) - num(co && co.getAttribute('x')) * kx), oy: T.oy + T.sy * (num(off && off.getAttribute('y')) - num(co && co.getAttribute('y')) * ky), sx: T.sx * kx, sy: T.sy * ky });
          continue;
        }
        if (!['sp', 'pic', 'graphicFrame'].includes(el.localName)) continue;
        const x = one(el, 'xfrm'); const off = one(x, 'off'), ext = one(x, 'ext');
        const box = { id, name, anim: animated.has(id), x: T.ox + T.sx * num(off && off.getAttribute('x')), y: T.oy + T.sy * num(off && off.getAttribute('y')), w: T.sx * num(ext && ext.getAttribute('cx')), h: T.sy * num(ext && ext.getAttribute('cy')) };
        const blip = one(el, 'blip'); const pic = blip && rel[rid(blip)] && rel[rid(blip)].target;
        const mediaEl = one(el, 'media') || one(el, 'videoFile') || one(el, 'audioFile');
        if (mediaEl) {
          const r = rel[rid(mediaEl)] || rel[rid(mediaEl, 'link')];
          if (r && r.target) slide.media.push(Object.assign({ path: r.target, kind: /audio/i.test(r.type + mediaEl.localName) || /\.(mp3|m4a|wav|wma|aac|ogg)$/i.test(r.target) ? 'audio' : 'video' }, box));
        }
        if (el.localName === 'pic' && pic && !mediaEl) slide.pics.push(Object.assign({ path: pic, crop: cropOf(one(el, 'blipFill')) }, box));
        else if (el.localName === 'sp' && pic) slide.fills.push(Object.assign({ path: pic, crop: cropOf(one(el, 'blipFill')), text: textOf(el) }, box));
        if (el.localName !== 'pic') { const t = textOf(el); if (t.trim() && !(el.localName === 'sp' && pic)) slide.texts.push(Object.assign({ text: t }, box)); }
      }
    };
    walk(one(doc, 'spTree'), { ox: 0, oy: 0, sx: 1, sy: 1 });
    return slide;
  }

  /* ---------- understanding the slides ---------- */
  const BUTTON = /^(answer|ans|next|back|home|end|start|prev|previous|thank you|thanks|ধন্যবাদ|উত্তর|পরবর্তী|পরের প্রশ্ন|শেষ|পিছনে|q\s*[-.]?\s*\d{1,3}|q\.?\s*no\.?|[0-9০-৯]{1,2}|[\s0-9০-৯]{1,9})$/i;
  const OPT = /^\s*([A-Da-dকখগঘ])\s*[.)।:\-]\s*(\S[\s\S]*)$|^\s*([A-D])\s+([^\x00-\x7F][\s\S]*)$/;
  const LETTER = { a: 0, b: 1, c: 2, d: 3, 'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3 };
  const tidy = (s) => String(s || '').replace(/[​﻿]/g, '').split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join(' ').replace(/\s+([,।?!:;)])/g, '$1').replace(/([(])\s+/g, '$1').replace(/\s+\.$/, '?').trim();
  const key = (s) => tidy(s).toLowerCase().replace(/[\s.,।?!:;'"‘’“”()\-–—…]/g, '');
  const stripAns = (s) => tidy(s).replace(/^(উত্তর|answer|ans)\s*[:：\-–]\s*/i, '');
  function classify(slide, S) {
    const area = (o) => (Math.max(0, o.w) * Math.max(0, o.h)) / S;
    const texts = slide.texts.map((t) => Object.assign({}, t, { text: tidy(t.text) })).filter((t) => t.text && !BUTTON.test(t.text));
    const pics = slide.pics.slice().sort((a, b) => area(b) - area(a));
    const media = slide.media[0] || null;
    const RULES = ['নিয়মাবলী', 'নিয়মাবলি', 'নিয়ম', 'rules'].map((w) => w.normalize('NFD'));
    if (texts.some((t) => RULES.includes(t.text.normalize('NFD').toLowerCase()))) {
      const body = slide.texts.filter((t) => tidy(t.text).length >= 40).map((t) => t.text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')).join('\n');
      return body ? { kind: 'rules', slide: slide.n, text: body } : null;
    }
    // full-size pictures: placed pictures and picture-filled boxes alike
    const bigs = pics.concat(slide.fills).filter((p) => area(p) >= 0.4).sort((a, b) => area(b) - area(a));
    const byAnim = (a, b) => (b.anim - a.anim) || (area(b) - area(a));
    // two full-size pictures: the one that appears on click (or the one on top) is the answer picture
    let big = bigs[0] || null; let bigAns = null;
    if (bigs.length >= 2) { const still = bigs.filter((p) => !p.anim); const anim = bigs.filter((p) => p.anim); if (still.length && anim.length) { big = still[0]; bigAns = anim[0]; } else { big = bigs[0]; bigAns = bigs[1]; } }
    if (big || (media && media.kind === 'video' && area(media) >= 0.3)) {
      // a picture question: whatever else is on the slide (shown on click, a picture-filled box or a text) is the answer
      const fills = slide.fills.filter((f) => f !== big && f !== bigAns && area(f) < 0.4).sort(byAnim);
      const words = texts.filter((t) => t.anim).length ? texts.filter((t) => t.anim) : texts.filter((t) => area(t) < 0.3);
      return { kind: 'pic', slide: slide.n, image: big, answerImage: bigAns || fills[0] || null, answerText: stripAns(words.map((t) => t.text).join(' / ')), media };
    }
    const options = ['', '', '', '']; const others = [];
    for (const t of texts) { const m = t.text.match(OPT); if (m) { const i = LETTER[(m[1] || m[3]).toLowerCase()]; if (i !== undefined && !options[i]) { options[i] = tidy(m[2] || m[4]).replace(/[।.]$/, ''); continue; } } others.push(t); }
    const q = others.filter((t) => t.text.length >= 12).sort((a, b) => b.text.length - a.text.length)[0];
    if (!q) return null;
    const rest = others.filter((t) => t !== q);
    const ans = rest.filter((t) => t.anim).sort(byAnim)[0] || (rest.length === 1 ? rest[0] : null);
    const side = pics.find((p) => area(p) >= 0.03) || null;
    return { kind: 'text', slide: slide.n, text: q.text, options, answerText: ans ? stripAns(ans.text).replace(/[।.]$/, '') : '', image: side, media };
  }
  /** slides that repeat one question (question → 4 options → 2 options → answer) become one */
  function merge(items) {
    const out = [];
    for (const it of items) {
      const prev = out[out.length - 1];
      if (prev && it.kind === 'text' && prev.kind === 'text' && key(prev.text) === key(it.text)) {
        if (it.options.filter(Boolean).length > prev.options.filter(Boolean).length) prev.options = it.options;
        if (!prev.answerText && it.answerText) prev.answerText = it.answerText;
        if (!prev.image && it.image) prev.image = it.image; if (!prev.media && it.media) prev.media = it.media;
        prev.slides.push(it.slide); continue;
      }
      if (prev && it.kind === 'pic' && prev.kind === 'pic' && prev.image && it.image && prev.image.path === it.image.path && JSON.stringify(prev.image.crop) === JSON.stringify(it.image.crop)) {
        if (!prev.answerImage && it.answerImage) prev.answerImage = it.answerImage;
        if (!prev.answerText && it.answerText) prev.answerText = it.answerText;
        prev.slides.push(it.slide); continue;
      }
      out.push(Object.assign(it, { slides: [it.slide] }));
    }
    for (const it of out) {
      if (it.kind !== 'text') continue;
      const opts = it.options.filter(Boolean);
      if (opts.length < 2) { it.options = ['', '', '', '']; it.answer = 0; continue; }
      it.options = it.options.filter(Boolean).concat(['', '', '', '']).slice(0, 4);
      const a = key(it.answerText);
      let i = a ? it.options.findIndex((o) => o && key(o) === a) : -1;
      if (i < 0 && a) i = it.options.findIndex((o) => o && (a.includes(key(o)) || key(o).includes(a)));
      it.answer = Math.max(0, i); it.answerKnown = i >= 0;
      if (i >= 0) it.answerText = '';
    }
    return out;
  }
  /** which round a file belongs to, from its name: 1ST_ROUND, round-2, R3, রাউন্ড ৩, তৃতীয় … (the n-th round that is switched on) */
  function roundFromName(name, rounds) {
    const n = String(name || '').toLowerCase().replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const words = { '1st': 1, first: 1, 'প্রথম': 1, '2nd': 2, second: 2, 'দ্বিতীয়': 2, '3rd': 3, third: 3, 'তৃতীয়': 3, '4th': 4, fourth: 4, 'চতুর্থ': 4, '5th': 5, fifth: 5, 'পঞ্চম': 5 };
    let k = 0; const m = n.match(/(?:round|রাউন্ড|r)\s*[-_ ]?\s*([1-7])(?![0-9])/);
    if (m) k = int(m[1]); else for (const [w, v] of Object.entries(words)) if (n.includes(w)) { k = v; break; }
    const on = rounds.filter((r) => r.enabled !== false && !/reserve|সংরক্ষিত/i.test(r.name + r.label));
    return k && on[k - 1] ? on[k - 1].id : '';
  }
  async function read(file) {
    const z = unzip(await file.arrayBuffer());
    if (!z.has('ppt/presentation.xml')) throw new Error(file.name + ': this is not a PowerPoint (.pptx) file');
    const pres = xml(await z.text('ppt/presentation.xml')); const prel = await rels(z, 'ppt/presentation.xml');
    const sz = one(pres, 'sldSz'); const S = (num(sz && sz.getAttribute('cx')) || 12192000) * (num(sz && sz.getAttribute('cy')) || 6858000);
    const paths = all(pres, 'sldId').map((e) => prel[rid(e, 'id')]).filter((r) => r && r.target).map((r) => r.target);
    const items = [];
    for (let i = 0; i < paths.length; i++) { const c = classify(await readSlide(z, paths[i], i + 1), S); if (c) items.push(c); }
    const list = merge(items);
    // a picture question needs an answer; a full-screen picture with nothing on it is a title / rules slide — left out unless ticked
    // a video with nothing else (a countdown or intro clip) is left out unless ticked too
    list.forEach((it) => { it.use = it.kind === 'rules' ? false : it.kind === 'pic' ? !!(it.image && (it.answerImage || it.answerText)) : true; });
    return { name: file.name, z, list, slides: paths.length };
  }
  /** a picture as it is shown on the slide (the slide's crop), ready for the media library */
  async function pictureFile(z, p, name) {
    const raw = await z.bytes(p.path); if (!raw) return null;
    const ext = (p.path.split('.').pop() || 'png').toLowerCase();
    const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext];
    if (!type) return null;
    let blob = new Blob([raw], { type });
    if (p.crop || type === 'image/bmp') {
      const bm = await createImageBitmap(blob);
      const c = p.crop || { l: 0, t: 0, r: 0, b: 0 };
      const sx = Math.round(bm.width * c.l), sy = Math.round(bm.height * c.t), sw = Math.max(1, Math.round(bm.width * (1 - c.l - c.r))), sh = Math.max(1, Math.round(bm.height * (1 - c.t - c.b)));
      const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh; const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
      if (type !== 'image/png') { g.fillStyle = '#fff'; g.fillRect(0, 0, sw, sh); }
      g.drawImage(bm, sx, sy, sw, sh, 0, 0, sw, sh); if (bm.close) bm.close();
      const out = type === 'image/png' ? 'image/png' : 'image/jpeg';
      blob = await new Promise((res) => cv.toBlob(res, out, 0.93));
      return new File([blob], name + (out === 'image/png' ? '.png' : '.jpg'), { type: out });
    }
    return new File([blob], name + '.' + ext, { type });
  }
  async function mediaFile(z, m, name) {
    if (z.size(m.path) > 300 * 1024 * 1024) return null; // larger than 300 MB: add it by hand in the question
    const raw = await z.bytes(m.path); if (!raw) return null;
    const ext = (m.path.split('.').pop() || '').toLowerCase();
    const type = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', wmv: 'video/x-ms-wmv', avi: 'video/x-msvideo', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', wma: 'audio/x-ms-wma', aac: 'audio/aac' }[ext] || '';
    return new File([raw], name + '.' + ext, { type });
  }
  return Object.freeze({ unzip, read, classify, merge, roundFromName, pictureFile, mediaFile, tidy });
})();

/** The import window: choose decks or a folder, check the preview, put them in. */
const PptxUI = {
  decks: [],
  urls: [],
  open() {
    this.clear();
    UI.modal('📊 Import old quiz PowerPoints (.pptx)', '<p class="big-hint">Choose one deck, several, or a whole folder of old quizzes. Every slide is read: picture questions (the picture as on the slide), questions with options (ক–ঘ / A–D), the answer that appears on click (a picture or words), and audio / video. The round comes from the file name (1ST_ROUND, round-2, R3, রাউন্ড ৩, তৃতীয় …) — change it below if needed. Nothing changes until you press <b>Put in the engine</b>; Ctrl+Z takes it back.</p>' +
      '<div id="pptxDrop" class="drop" tabindex="0">📂 Drag .pptx files or a folder here — or <button class="btn sm primary" data-act="pptxChoose">Choose files</button> <button class="btn sm" data-act="pptxFolder">Choose a folder</button></div>' +
      '<label class="check"><input id="pptxMedia" type="checkbox" checked> Also bring audio / video from the slides (up to 300 MB each)</label>' +
      '<div id="pptxOut"></div>');
    const dz = $('#pptxDrop');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault(); dz.classList.remove('over');
      const files = []; const items = Array.from(e.dataTransfer.items || []);
      const walk = async (entry) => { if (!entry) return; if (entry.isFile) { if (/\.pptx$/i.test(entry.name)) files.push(await new Promise((res, rej) => entry.file(res, rej))); } else if (entry.isDirectory) { const rd = entry.createReader(); let batch; do { batch = await new Promise((res) => rd.readEntries(res, () => res([]))); for (const en of batch) await walk(en); } while (batch.length); } };
      if (items.length && items[0].webkitGetAsEntry) { for (const it of items) await walk(it.webkitGetAsEntry()); } else files.push(...Array.from(e.dataTransfer.files || []).filter((f) => /\.pptx$/i.test(f.name)));
      this.load(files);
    });
  },
  clear() { this.urls.forEach((u) => URL.revokeObjectURL(u)); this.urls = []; this.decks = []; },
  async load(files) {
    const out = $('#pptxOut'); if (!out) return;
    files = files.filter((f) => /\.pptx$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) { out.innerHTML = '<p class="badge-warn">✘ No .pptx file found. An old .ppt file must first be saved as .pptx in PowerPoint (File → Save As → PowerPoint Presentation).</p>'; return; }
    this.clear(); out.innerHTML = '<p class="muted">Reading ' + files.length + ' deck(s)…</p>';
    const rounds = Store.state.rounds;
    for (const f of files) {
      try {
        const d = await PptxImport.read(f);
        d.round = (/select|prelim|বাছাই/i.test(f.name) ? 'PRELIM' : '') || PptxImport.roundFromName(f.name, rounds) || (rounds.find((r) => r.type !== 'rapid' && !Sel.roundQuestions(r.id).length) || rounds[0]).id;
        d.mode = 'replace'; this.decks.push(d);
      } catch (e) { this.decks.push({ name: f.name, error: e.message || String(e), list: [] }); }
    }
    await this.render();
  },
  async thumb(d, p) { try { const f = await PptxImport.pictureFile(d.z, p, 't'); if (!f) return ''; const u = URL.createObjectURL(f); this.urls.push(u); return u; } catch (e) { return ''; } },
  async render() {
    const out = $('#pptxOut'); if (!out) return;
    const rounds = Store.state.rounds; let h = '';
    for (let di = 0; di < this.decks.length; di++) {
      const d = this.decks[di];
      if (d.error) { h += '<div class="card"><b>' + esc(d.name) + '</b><p class="badge-warn">✘ ' + esc(d.error) + '</p></div>'; continue; }
      const n = d.list.filter((x) => x.use && x.kind !== 'rules').length;
      h += '<div class="card pptx-deck"><div class="row"><b>📊 ' + esc(d.name) + '</b><span class="muted">' + d.slides + ' slides → ' + n + ' question(s)</span></div>' +
        '<div class="row"><label class="field"><span>Round</span><select data-pptx-round="' + di + '"><option value="PRELIM"' + (d.round === 'PRELIM' ? ' selected' : '') + '>বাছাই পর্ব (selection round)</option>' + rounds.map((r) => '<option value="' + esc(r.id) + '"' + (r.id === d.round ? ' selected' : '') + '>' + esc(r.name) + (r.type === 'rapid' ? ' (buzzer)' : '') + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>How</span><select data-pptx-mode="' + di + '"><option value="replace"' + (d.mode === 'replace' ? ' selected' : '') + '>Replace this round\'s questions</option><option value="add"' + (d.mode === 'add' ? ' selected' : '') + '>Add after this round\'s questions</option></select></label></div><div class="list pptx-list">';
      for (let i = 0; i < d.list.length; i++) {
        const it = d.list[i];
        const qi = it.image ? await this.thumb(d, it.image) : ''; const ai = it.answerImage ? await this.thumb(d, it.answerImage) : '';
        const what = it.kind === 'rules' ? '📜 Rules — use as the round\'s rules' : it.kind === 'pic' ? '🖼 Picture question' : it.options.filter(Boolean).length ? '🔤 Question with ' + it.options.filter(Boolean).length + ' options' : '🔤 Question';
        const ans = it.kind === 'rules' ? '' : it.answerImage ? '<span class="pptx-ans">Answer: <img src="' + ai + '" alt=""></span>' : it.kind === 'text' && it.options.filter(Boolean).length && it.answerKnown ? '<span class="pptx-ans ok">Answer: ' + esc(OPT_LABELS[it.answer] + ') ' + it.options[it.answer]) + '</span>' : it.answerText ? '<span class="pptx-ans ok">Answer: ' + esc(it.answerText) + '</span>' : '<span class="pptx-ans warn">⚠ no answer found — add it in the question after importing</span>';
        h += '<label class="li pptx-it' + (it.use ? '' : ' off') + '"><input type="checkbox" data-pptx-use="' + di + ':' + i + '"' + (it.use ? ' checked' : '') + '>' + (qi ? '<img class="pptx-th" src="' + qi + '" alt="">' : '<span class="pptx-th none">' + (it.kind === 'rules' ? '📜' : '🔤') + '</span>') +
          '<div class="t"><b>' + esc(what) + '</b> <small>slide ' + it.slides.join(', ') + (it.media ? ' • ' + (it.media.kind === 'audio' ? '🔊 audio' : '🎬 video') : '') + '</small><div>' + esc((it.kind === 'pic' ? '' : it.text).slice(0, 160)) + '</div>' + (it.kind === 'text' && it.options.filter(Boolean).length ? '<small>' + it.options.filter(Boolean).map((o, k) => esc(OPT_LABELS[k] + ') ' + o)).join(' • ') + '</small>' : '') + ans + '</div></label>';
      }
      h += '</div></div>';
    }
    const total = this.decks.reduce((t, d) => t + d.list.filter((x) => x.use && x.kind !== 'rules').length, 0);
    out.innerHTML = h + (total || this.decks.some((d) => d.list.some((x) => x.use && x.kind === 'rules')) ? '<div class="row" style="margin-top:.6rem">' + F.btn('pptxApply', '✔ Put in the engine (' + total + ' question(s))', 'good lg') + '</div>' : '');
    out.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pptxUse) { const [di, i] = t.dataset.pptxUse.split(':').map(Number); this.decks[di].list[i].use = t.checked; t.closest('.pptx-it').classList.toggle('off', !t.checked); }
      if (t.dataset.pptxRound) this.decks[int(t.dataset.pptxRound)].round = t.value;
      if (t.dataset.pptxMode) this.decks[int(t.dataset.pptxMode)].mode = t.value;
    };
  },
  /** a deck for the selection round: question text (options written into it), the answer, the picture and the audio / video */
  async applyPrelim(d, withMedia) {
    const stem = d.name.replace(/\.pptx$/i, '').replace(/[^\wঀ-৿-]+/g, '_').slice(0, 40); const qs = []; let rules = '';
    let n = d.mode === 'add' ? Store.state.prelim.questions.length : 0;
    for (const it of d.list) {
      if (!it.use) continue;
      if (it.kind === 'rules') { rules = it.text; continue; }
      n += 1;
      const pic = async (p, tag) => { if (!p) return ''; const f = await PptxImport.pictureFile(d.z, p, stem + '-S' + n + tag); return f ? Media.add(f, 'image') : ''; };
      const opts = it.kind === 'text' ? it.options.filter(Boolean) : [];
      const text = it.kind === 'pic' ? 'ছবিটি দেখে উত্তর দিন' : it.text + (opts.length ? '\n' + opts.map((o, k) => OPT_LABELS[k] + ') ' + o).join('   ') : '');
      const answer = it.kind === 'text' && opts.length && it.answerKnown ? OPT_LABELS[it.answer] + ') ' + it.options[it.answer] : it.answerText || '';
      let clip = ''; if (withMedia && it.media) { const f = await PptxImport.mediaFile(d.z, it.media, stem + '-S' + n); if (f) clip = await Media.add(f, it.media.kind); }
      qs.push({ id: uid('P'), text, answer, star: false, image: await pic(it.image, '-q'), clip, source: 'pptx' });
    }
    if (!qs.length && !rules) return 0;
    Store.commit('pptx-prelim', (s) => {
      if (qs.length) { s.prelim.questions = d.mode === 'add' ? s.prelim.questions.concat(qs) : qs; s.prelim.count = s.prelim.questions.length; }
      if (rules) s.prelim.rules = rules;
    });
    return qs.length;
  },
  async apply() {
    const withMedia = !!($('#pptxMedia') || {}).checked;
    const btn = $('[data-act="pptxApply"]'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Putting the questions in…'; }
    const made = []; let rules = 0;
    try {
      for (const d of this.decks) {
        if (d.error) continue;
        if (d.round === 'PRELIM') { const k = await this.applyPrelim(d, withMedia); if (k) made.push(k + ' → বাছাই পর্ব'); continue; }
        const qs = [];
        let n = d.mode === 'add' ? Sel.roundQuestions(d.round).reduce((m, q) => Math.max(m, q.number), 0) : 0;
        const r = Sel.round(d.round); const stem = d.name.replace(/\.pptx$/i, '').replace(/[^\wঀ-৿-]+/g, '_').slice(0, 40);
        for (const it of d.list) {
          if (!it.use) continue;
          if (it.kind === 'rules') { const text = it.text; Store.commit('pptx-rules', (s) => { const rr = s.rounds.find((x) => x.id === d.round); if (rr) rr.rules = text; }); rules += 1; continue; }
          n += 1;
          const pic = async (p, tag) => { if (!p) return ''; const f = await PptxImport.pictureFile(d.z, p, stem + '-' + n + tag); return f ? Media.add(f, 'image') : ''; };
          const image = await pic(it.image, '-q');
          const answerImage = await pic(it.answerImage, '-ans');
          let wide = false; if (it.answerImage) wide = it.answerImage.w / Math.max(1, it.answerImage.h) > 2.5;
          let clip = ''; if (withMedia && it.media) { const f = await PptxImport.mediaFile(d.z, it.media, stem + '-' + n); if (f) clip = await Media.add(f, it.media.kind); }
          const rapid = r && r.type === 'rapid';
          const q = questionFromSeed({ id: uid('Q'), roundId: d.round, number: n, text: it.kind === 'pic' ? (it.answerText ? 'ছবির প্রশ্ন' : 'ছবির প্রশ্ন') + ' — ' + d.name.replace(/\.pptx$/i, '') + ', স্লাইড ' + it.slides[0] : it.text, options: it.kind === 'text' ? it.options : ['', '', '', ''], answer: it.answer || 0, answerText: it.answerText || '' }, 0);
          Object.assign(q, { image, answerImage, answerWide: wide, picOnly: it.kind === 'pic' && !!image && !rapid, clip });
          qs.push(q);
        }
        if (!qs.length) continue;
        Store.commit('pptx-import', (s) => {
          if (d.mode === 'replace') { const gone = new Set(s.questions.filter((q) => q.roundId === d.round).map((q) => q.id)); s.questions = s.questions.filter((q) => !gone.has(q.id)); gone.forEach((id) => { delete s.board.played[id]; }); }
          s.questions = s.questions.concat(qs);
        });
        made.push(qs.length + ' → ' + ((r && r.name) || d.round));
      }
      UI.closeModal(); this.clear();
      UI.toast(made.length || rules ? '✔ Imported: ' + made.join(' • ') + (rules ? ' • rules for ' + rules + ' round(s)' : '') : 'Nothing was ticked', made.length || rules ? 'ok' : 'err');
      UI.renderTab(true);
    } catch (e) { UI.toast(e.message || String(e), 'err'); Log.err('pptx', e); if (btn) { btn.disabled = false; btn.textContent = '✔ Put in the engine'; } }
  },
};

Object.assign(Actions, {
  pptxOpen() { PptxUI.open(); },
  pptxChoose() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'; inp.multiple = true; inp.onchange = () => PptxUI.load(Array.from(inp.files || [])); inp.click(); },
  pptxFolder() { const inp = document.createElement('input'); inp.type = 'file'; inp.webkitdirectory = true; inp.multiple = true; inp.onchange = () => PptxUI.load(Array.from(inp.files || [])); inp.click(); },
  pptxApply() { PptxUI.apply(); },
});
