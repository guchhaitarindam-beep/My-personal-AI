/* =====================================================================
   MEDIA MANAGER — built-in assets embedded in this file + operator
   uploads stored in IndexedDB (originals kept, display copy optimised).
   Stage and Control share the same origin, so both read the same DB.
   ===================================================================== */
const Media = {
  db: null,
  ready: null,
  cache: new Map(), // id -> object URL / data URL
  pending: new Map(),
  index: [], // [{id,name,kind,type,size,w,h,created}]
  memory: new Map(), // fallback when IndexedDB is unavailable

  init() {
    this.ready = new Promise((resolve) => {
      if (!('indexedDB' in window)) { Log.add('WARN', 'IndexedDB unavailable — uploads kept for this session only'); resolve(false); return; }
      let req;
      try { req = indexedDB.open('qc66-media', 1); } catch (e) { Log.err('idb-open', e); resolve(false); return; }
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' }); };
      req.onsuccess = () => { this.db = req.result; this.loadIndex().then(() => resolve(true)); };
      req.onerror = () => { Log.err('idb-open', req.error); resolve(false); };
    });
    return this.ready;
  },
  tx(mode) { return this.db.transaction('files', mode).objectStore('files'); },
  loadIndex() {
    return new Promise((resolve) => {
      if (!this.db) { resolve(); return; }
      const out = [];
      const req = this.tx('readonly').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { const v = c.value; out.push({ id: v.id, name: v.name, kind: v.kind, type: v.type, size: v.size, w: v.w, h: v.h, created: v.created }); c.continue(); } else { this.index = out.sort((a, b) => b.created - a.created); resolve(); } };
      req.onerror = () => resolve();
    });
  },
  builtinNames() { return $$('script[id^="asset-"]').map((el) => el.id.slice(6)); },
  builtin(name) { const el = document.getElementById('asset-' + name); return el ? el.textContent.trim() : ''; },
  label(id) {
    if (!id) return '—';
    if (id.startsWith('asset:')) return 'Built-in: ' + id.slice(6);
    const m = this.index.find((x) => x.id === id);
    return m ? m.name : 'Missing file';
  },
  kindOf(file) {
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('video/')) return 'video';
    if (/\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name)) return 'audio';
    if (/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)) return 'image';
    return 'other';
  },
  /** Downscale very large photos for smooth display; the original is stored untouched. */
  /** Decode with createImageBitmap, falling back to an <img> decode for formats it rejects. */
  async decode(blob) {
    if ('createImageBitmap' in window) { try { return await createImageBitmap(blob); } catch (e) { /* fall through to <img> */ } }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  },
  async makeDisplay(blob) {
    const src = await this.decode(blob);
    const w0 = src.naturalWidth || src.width; const h0 = src.naturalHeight || src.height;
    const scale = Math.min(1, 2160 / Math.max(w0, h0));
    if (scale >= 1 && blob.size < 2.5e6) { if (src.close) src.close(); return { display: null, w: w0, h: h0 }; }
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    // Keep PNG/WEBP transparency (logos); photos become high-quality JPEG.
    const type = /png|webp/.test(blob.type) ? 'image/png' : 'image/jpeg';
    const display = await new Promise((res) => c.toBlob(res, type, 0.92));
    return { display, w: c.width, h: c.height };
  },
  async add(file, kindHint) {
    const kind = kindHint || this.kindOf(file);
    if (kind === 'image' && !/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.type) && !/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)) throw new Error('Unsupported image: ' + file.name);
    const id = uid('m');
    let display = null; let w = 0; let h = 0;
    if (kind === 'image' && file.type !== 'image/svg+xml') {
      try { ({ display, w, h } = await this.makeDisplay(file)); } catch (e) { throw new Error('Cannot open the image: ' + file.name); }
    }
    const rec = { id, name: file.name || id, kind, type: file.type || '', size: file.size || 0, w, h, created: Date.now(), blob: file, display };
    await this.ready;
    if (this.db) {
      await new Promise((resolve, reject) => { const r = this.tx('readwrite').put(rec); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
    } else {
      this.memory.set(id, rec);
    }
    this.index.unshift({ id, name: rec.name, kind, type: rec.type, size: rec.size, w, h, created: rec.created });
    Bus.emit('media', id);
    Sync.send({ type: 'media', id });
    return id;
  },
  async remove(id) {
    if (TeamLock.keeps(id)) { TeamLock.refuse(); return false; }
    await this.ready;
    if (this.db) await new Promise((resolve) => { const r = this.tx('readwrite').delete(id); r.onsuccess = resolve; r.onerror = resolve; });
    this.memory.delete(id);
    this.index = this.index.filter((m) => m.id !== id);
    const u = this.cache.get(id); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
    this.cache.delete(id);
    Bus.emit('media', id);
  },
  async getRecord(id) {
    await this.ready;
    if (this.memory.has(id)) return this.memory.get(id);
    if (!this.db) return null;
    return new Promise((resolve) => { const r = this.tx('readonly').get(id); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); });
  },
  /** Resolve a media id to a URL ('' when missing — callers always have a fallback). */
  url(id, original = false) {
    if (!id) return Promise.resolve('');
    const key = id + (original ? '#o' : '');
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      let u = '';
      // a file in the QuizCorner_Media folder next to the quiz: played straight from the laptop's disk — unless the quiz carries it built in
      const inside = id.startsWith('file:') ? this.builtin('clip-' + id.slice(5)) : '';
      if (id.startsWith('file:') && !inside) u = Media.folderUrl(id.slice(5));
      else if (inside || id.startsWith('asset:')) {
        const data = inside || this.builtin(id.slice(6));
        if (data) {
          // Large embedded audio decodes faster as a Blob URL than as a data URI.
          if (data.length > 400000 && 'fetch' in window) {
            try { u = URL.createObjectURL(await (await fetch(data)).blob()); } catch (e) { u = data; }
          } else u = data;
        }
      } else {
        const rec = await this.getRecord(id);
        if (rec) { const b = (!original && rec.display) || rec.blob; if (b) u = URL.createObjectURL(b); }
      }
      if (u) this.cache.set(key, u);
      this.pending.delete(key);
      return u;
    })().catch((e) => { this.pending.delete(key); Log.err('media-url', e); return ''; });
    this.pending.set(key, p);
    return p;
  },
  urlSync(id) { return (id && this.cache.get(id)) || ''; },
  /** The folder for big, high-quality audio / video: QuizCorner_Media, next to the quiz file (no copy, no compression, any length). */
  FOLDER: 'QuizCorner_Media',
  folderUrl(name) { return new URL(this.FOLDER + '/' + String(name).split('/').map(encodeURIComponent).join('/'), location.href).href; },
  folderPath() { try { const p = decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1'); return (/^[A-Za-z]:/.test(p) ? p.replace(/\//g, '\\') : p) + this.FOLDER; } catch (e) { return this.FOLDER; } },
  /** Does this file exist in the folder (and can the browser play it)? → its length in ms, or -1 */
  probe(name, timeout = 6000) {
    return new Promise(async (resolve) => {
      const inside = this.builtin('clip-' + name) ? await this.url('file:' + name) : ''; // built into the quiz: always there
      const el = document.createElement(/\.(mp3|m4a|wav|ogg|aac|wma|opus)$/i.test(name) ? 'audio' : 'video'); el.preload = 'metadata'; el.muted = true;
      let t = 0; const done = (v) => { clearTimeout(t); el.onloadedmetadata = el.onerror = null; el.removeAttribute('src'); try { el.load(); } catch (e) { /* ignore */ } resolve(v); };
      el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
      el.onerror = () => done(-1); t = setTimeout(() => done(-1), timeout);
      el.src = inside || this.folderUrl(name);
    });
  },
  /** Fill every [data-media] element inside root. Missing media keeps its styled fallback. */
  hydrate(root) {
    $$('[data-media]', root).forEach((el) => {
      const id = el.getAttribute('data-media');
      if (!id || el.dataset.loaded === id) return;
      el.dataset.loaded = id;
      this.url(id).then((u) => {
        if (!u || el.getAttribute('data-media') !== id) { el.classList.add('missing'); return; }
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') { el.src = u; return; }
        if (el.tagName === 'IMG') {
          el.onerror = () => { el.classList.add('missing'); el.removeAttribute('src'); el.hidden = true; };
          el.src = u; el.hidden = false;
        } else el.style.backgroundImage = 'url("' + u + '")';
      });
    });
  },
  async toDataURL(id) {
    if (!id || id.startsWith('asset:')) return '';
    const rec = await this.getRecord(id);
    if (!rec || !rec.blob) return '';
    return new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(''); fr.readAsDataURL(rec.blob); });
  },
  async putDataURL(id, name, kind, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], name || id, { type: blob.type });
    let display = null; let w = 0; let h = 0;
    if (kind === 'image') { try { ({ display, w, h } = await this.makeDisplay(file)); } catch (e) { /* keep original only */ } }
    const rec = { id, name: name || id, kind, type: blob.type, size: blob.size, w, h, created: Date.now(), blob: file, display };
    await this.ready;
    if (this.db) await new Promise((resolve) => { const r = this.tx('readwrite').put(rec); r.onsuccess = resolve; r.onerror = resolve; });
    else this.memory.set(id, rec);
    this.cache.delete(id);
    if (!this.index.find((m) => m.id === id)) this.index.unshift({ id, name: rec.name, kind, type: rec.type, size: rec.size, w, h, created: rec.created });
  },
  forget(id) { const u = this.cache.get(id); this.cache.delete(id); this.cache.delete(id + '#o'); if (u && u.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(u), 5000); $$('[data-loaded="' + CSS.escape(id) + '"]').forEach((el) => delete el.dataset.loaded); },
};

/** Opens a file picker and resolves with the stored media id (or '' when cancelled). */
function pickMedia(accept = 'image/*', kind) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) { resolve(''); return; }
      try { const id = await Media.add(f, kind); UI.toast('Added: ' + f.name, 'ok'); resolve(id); } catch (e) { UI.toast(e.message || 'Could not add the file', 'err'); Log.err('pick', e); resolve(''); }
    };
    inp.click();
  });
}

/** 📱 Phone photo → a clean, bright TV portrait: turned the right way up, cut to 3 : 4 around the face,
    colour cast and dim light corrected, gently sharpened, saved as a sharp 1080 × 1440 JPEG. Never fails the upload:
    any trouble and the original is used. */
const PhotoFix = {
  W: 1080, H: 1440,
  async bitmap(file) {
    if ('createImageBitmap' in window) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* <img> below */ } }
    return Media.decode(file);
  },
  /** the 3 : 4 frame (a team's photo of both children: 4 : 3) around the faces when the browser can find them,
      else the middle with the heads in the upper part */
  async frame(src, w0, h0, ar = 3 / 4) {
    let cw, ch; if (w0 / h0 > ar) { ch = h0; cw = Math.round(h0 * ar); } else { cw = w0; ch = Math.round(w0 / ar); }
    let fx = w0 / 2; let fy = h0 * 0.42; let face = null;
    if ('FaceDetector' in window) {
      try { const f = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 }).detect(src); face = f.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0] || null; } catch (e) { face = null; }
    }
    if (face && ar > 1) {
      // two children side by side: keep every face in, centred between them
      let fs = []; try { fs = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 }).detect(src); } catch (e) { fs = [face]; }
      const xs = fs.map((f) => f.boundingBox); const x0 = Math.min(...xs.map((b) => b.x)); const x1 = Math.max(...xs.map((b) => b.x + b.width)); const y0 = Math.min(...xs.map((b) => b.y)); const y1 = Math.max(...xs.map((b) => b.y + b.height));
      fx = (x0 + x1) / 2; fy = (y0 + y1) / 2;
      return { x: clamp(Math.round(fx - cw / 2), 0, w0 - cw), y: clamp(Math.round(fy - ch * 0.4), 0, h0 - ch), w: cw, h: ch };
    }
    if (face) {
      const b = face.boundingBox; fx = b.x + b.width / 2; fy = b.y + b.height / 2;
      // a small face far away: come closer, so the face is about 40 % of the picture's width (never closer than half the frame)
      const k = clamp((b.width / 0.4) / cw, 0.5, 1); cw = Math.round(cw * k); ch = Math.round(cw * 4 / 3);
      return { x: clamp(Math.round(fx - cw / 2), 0, w0 - cw), y: clamp(Math.round(fy - ch * 0.4), 0, h0 - ch), w: cw, h: ch };
    }
    return { x: clamp(Math.round(fx - cw / 2), 0, w0 - cw), y: clamp(Math.round((h0 - ch) * 0.3), 0, h0 - ch), w: cw, h: ch };
  },
  /** levels, white balance, light, colour — measured on the picture itself, with limits so it never looks overdone */
  tone(ctx, W, H) {
    const img = ctx.getImageData(0, 0, W, H); const d = img.data; const n = W * H;
    const hist = new Uint32Array(256); let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; sr += r; sg += g; sb += b; hist[(r * 77 + g * 150 + b * 29) >> 8] += 1; }
    const pct = (q) => { let acc = 0; for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= n * q) return v; } return 255; };
    const lo = Math.min(pct(0.005), 40); const hi = Math.max(pct(0.995), 200);
    // grey-world white balance, half strength, gains kept between 0.88 and 1.15 (yellow hall lights, blue shade)
    const mr = sr / n, mg = sg / n, mb = sb / n; const grey = (mr + mg + mb) / 3;
    const gain = [mr, mg, mb].map((m) => clamp(1 + ((grey / Math.max(m, 1)) - 1) * 0.5, 0.88, 1.15));
    // a dim photo is lifted (mid-tones), a bright one is left alone
    let mean = 0; for (let v = 0; v < 256; v += 1) mean += hist[v] * clamp((v - lo) / Math.max(hi - lo, 1), 0, 1); mean /= n;
    const gamma = mean < 0.46 ? clamp(Math.log(0.5) / Math.log(Math.max(mean, 0.05)), 0.7, 1) : 1;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v += 1) { let x = clamp((v - lo) / Math.max(hi - lo, 1), 0, 1); x = Math.pow(x, gamma); x = x + 0.06 * Math.sin(Math.PI * (x - 0.5)) * x * (1 - x) * 4; lut[v] = Math.round(clamp(x, 0, 1) * 255); }
    const sat = 1.1;
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[clamp(Math.round(d[i] * gain[0]), 0, 255)], g = lut[clamp(Math.round(d[i + 1] * gain[1]), 0, 255)], b = lut[clamp(Math.round(d[i + 2] * gain[2]), 0, 255)];
      const l = (r * 77 + g * 150 + b * 29) >> 8; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    return { lo, hi, gamma, gain };
  },
  /** unsharp mask: crisp eyes and hair without halos */
  sharpen(canvas, amount = 0.55) {
    const W = canvas.width, H = canvas.height; const ctx = canvas.getContext('2d');
    const blur = document.createElement('canvas'); blur.width = W; blur.height = H; const bx = blur.getContext('2d');
    if (!('filter' in bx)) return;
    bx.filter = 'blur(1.1px)'; bx.drawImage(canvas, 0, 0);
    const a = ctx.getImageData(0, 0, W, H); const b = bx.getImageData(0, 0, W, H); const d = a.data; const e = b.data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c += 1) { const diff = d[i + c] - e[i + c]; if (diff > 2 || diff < -2) d[i + c] = d[i + c] + diff * amount; }
    ctx.putImageData(a, 0, 0);
  },
  async portrait(file, ar = 3 / 4) {
    const src = await this.bitmap(file);
    const w0 = src.naturalWidth || src.width; const h0 = src.naturalHeight || src.height;
    if (!w0 || !h0) throw new Error('empty image');
    const f = await this.frame(src, w0, h0, ar);
    const W = Math.min(ar > 1 ? this.H : this.W, f.w); const H = Math.round(W / ar);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // big phone photos shrink in two steps — sharper than one big jump
    if (f.w > W * 2.2) {
      const m = document.createElement('canvas'); m.width = W * 2; m.height = H * 2; const mx = m.getContext('2d'); mx.imageSmoothingQuality = 'high';
      mx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, m.width, m.height); ctx.drawImage(m, 0, 0, W, H);
    } else ctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, W, H);
    if (src.close) src.close();
    this.last = this.tone(ctx, W, H);
    this.sharpen(c);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93));
    if (!blob) throw new Error('could not save');
    return new File([blob], String(file.name || 'photo').replace(/\.[^.]+$/, '') + '-tv.jpg', { type: 'image/jpeg' });
  },
};

/* =====================================================================
   AUDIO DIRECTOR — synthesised broadcast cues (no audio files needed),
   optional operator replacements, and music beds with fades.
   Audio plays in exactly one window (Control by default).
   ===================================================================== */
const AudioDirector = {
  ctx: null,
  master: null,
  verb: null,
  unlocked: false,
  musicEls: {},
  cueEls: new Map(),
  isOutput() {
    const out = Store.state.audio.output;
    return (out === 'stage' && MODE === 'stage') || (out !== 'stage' && MODE === 'control') || (out === 'both' && MODE !== 'host');
  },
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { Log.add('WARN', 'Web Audio unavailable'); return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = Store.state.audio.master;
      // Short synthetic room reverb gives the cues a broadcast "studio" tail.
      const conv = this.ctx.createConvolver();
      const len = this.ctx.sampleRate * 1.6;
      const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      conv.buffer = buf;
      this.verb = this.ctx.createGain(); this.verb.gain.value = 0.22;
      this.verb.connect(conv); conv.connect(this.master);
      // Loud, hall-filling output: a boost stage into a limiter, so the cues are loud but never distort.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -9; comp.knee.value = 4; comp.ratio.value = 14; comp.attack.value = 0.003; comp.release.value = 0.22;
      this.boost = this.ctx.createGain(); this.boost.gain.value = clamp(num(Store.state.audio.boost, 1.8), 0.5, 4);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = clamp(num(Store.state.audio.musicBoost, 1.6), 0.5, 4);
      this.master.connect(this.boost); this.boost.connect(comp); this.musicBus.connect(comp); comp.connect(this.ctx.destination);
      this.unlocked = true;
      SoundDirector.start(this.ctx);
      Bus.emit('audio-unlocked');
    } catch (e) { Log.err('audio-init', e); }
  },
  setMaster(v) { if (this.master) this.master.gain.value = v; },
  setBoost() { const a = Store.state.audio; if (this.boost) this.boost.gain.value = clamp(num(a.boost, 1.8), 0.5, 4); if (this.musicBus) this.musicBus.gain.value = clamp(num(a.musicBoost, 1.6), 0.5, 4); },
  tone(freq, dur, opts = {}) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (opts.at || 0);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    const v = (opts.vol == null ? 0.3 : opts.vol) * (opts.gain || 1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); if (opts.verb !== false) g.connect(this.verb);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  noise(dur, opts = {}) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + (opts.at || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = opts.filter || 'bandpass'; f.Q.value = opts.q || 1.2;
    f.frequency.setValueAtTime(opts.from || 400, t0); f.frequency.exponentialRampToValueAtTime(opts.to || 4000, t0 + dur);
    const g = c.createGain(); const v = (opts.vol || 0.25) * (opts.gain || 1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); g.connect(this.verb);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  chord(freqs, dur, opts = {}) { freqs.forEach((f, i) => this.tone(f, dur, Object.assign({}, opts, { at: (opts.at || 0) + (opts.arp || 0) * i }))); },
  synth(name, gain, soft) {
    const g = gain * (soft ? 0.5 : 1);
    switch (name) {
      case 'transition': this.noise(0.55, { from: 300, to: 6000, vol: 0.18, gain: g }); this.tone(220, 0.5, { to: 440, type: 'triangle', vol: 0.08, gain: g }); break;
      case 'delivery': this.noise(0.7, { from: 2000, to: 300, vol: 0.18, gain: g }); this.chord([523, 659, 784], 0.9, { arp: 0.07, type: 'triangle', vol: 0.12, gain: g, at: 0.35 }); break;
      case 'drone': for (let i = 0; i < 6; i++) this.tone(110 + i * 3, 0.5, { at: i * 0.4, type: 'sawtooth', vol: 0.025, gain: g, to: 118 + i * 3 }); this.noise(2.4, { from: 600, to: 900, q: 3, vol: 0.06, gain: g }); this.chord([523, 784, 1047], 1, { at: 1.9, arp: 0.06, type: 'triangle', vol: 0.1, gain: g }); break;
      case 'countdown': this.tone(880, 0.22, { type: 'square', vol: 0.12, gain: g, verb: true }); this.tone(440, 0.3, { type: 'sine', vol: 0.15, gain: g }); break;
      case 'impact': this.tone(55, 1.4, { to: 35, type: 'sine', vol: 0.6, gain: g }); this.noise(1.2, { from: 4000, to: 120, filter: 'lowpass', vol: 0.4, gain: g }); this.chord([262, 330, 392, 523], 1.6, { type: 'sawtooth', vol: 0.05, gain: g }); break;
      case 'tick': this.tone(1500, 0.05, { type: 'square', vol: 0.06, gain: g, verb: false }); break;
      case 'warning': this.tone(988, 0.18, { type: 'square', vol: 0.12, gain: g }); this.tone(988, 0.18, { type: 'square', vol: 0.12, gain: g, at: 0.22 }); break;
      case 'timeout': this.tone(196, 0.9, { type: 'sawtooth', vol: 0.18, gain: g, to: 98 }); this.tone(233, 0.9, { type: 'square', vol: 0.08, gain: g, to: 117 }); break;
      case 'correct': this.chord([523, 659, 784, 1047], 0.7, { arp: 0.08, type: 'triangle', vol: 0.16, gain: g }); this.tone(1568, 0.6, { at: 0.32, vol: 0.08, gain: g }); break;
      case 'wrong': this.tone(311, 0.32, { type: 'sawtooth', vol: 0.16, gain: g, to: 290 }); this.tone(233, 0.6, { at: 0.3, type: 'sawtooth', vol: 0.16, gain: g, to: 200 }); break;
      case 'reveal': this.noise(0.6, { from: 500, to: 5000, vol: 0.14, gain: g }); this.chord([392, 523, 659], 0.8, { arp: 0.05, at: 0.25, vol: 0.12, gain: g }); break;
      case 'pass': this.tone(440, 0.25, { to: 880, type: 'triangle', vol: 0.15, gain: g }); this.tone(660, 0.3, { at: 0.18, to: 990, type: 'triangle', vol: 0.12, gain: g }); break;
      case 'challenge': this.tone(147, 0.5, { type: 'sawtooth', vol: 0.15, gain: g }); this.tone(220, 0.5, { at: 0.2, type: 'sawtooth', vol: 0.15, gain: g }); this.tone(294, 0.7, { at: 0.4, type: 'sawtooth', vol: 0.15, gain: g }); break;
      case 'lifeline': this.chord([659, 880, 1175], 0.6, { arp: 0.09, type: 'sine', vol: 0.14, gain: g }); this.noise(0.5, { from: 3000, to: 8000, vol: 0.06, gain: g }); break;
      case 'scoreboard': this.chord([392, 494, 587, 784], 1.2, { arp: 0.12, type: 'triangle', vol: 0.12, gain: g }); break;
      case 'teamintro': this.noise(0.8, { from: 200, to: 3000, vol: 0.12, gain: g }); this.chord([330, 415, 494, 659], 1.4, { arp: 0.1, at: 0.3, type: 'triangle', vol: 0.12, gain: g }); break;
      case 'roundintro': this.tone(65, 1.6, { type: 'sine', vol: 0.4, gain: g }); this.noise(1.4, { from: 200, to: 8000, vol: 0.14, gain: g }); this.chord([262, 392, 523, 659, 784], 2, { arp: 0.14, at: 0.4, type: 'sawtooth', vol: 0.045, gain: g }); break;
      case 'fanfare': [[523, 0], [523, 0.18], [523, 0.36], [659, 0.54], [784, 0.9], [659, 1.2], [784, 1.4], [1047, 1.7]].forEach(([f, t]) => this.chord([f, f * 1.5], t > 1.6 ? 1.8 : 0.32, { at: t, type: 'sawtooth', vol: 0.06, gain: g })); this.tone(65, 2.5, { at: 1.7, vol: 0.3, gain: g }); break;
      default: this.tone(660, 0.2, { vol: 0.1, gain: g });
    }
  },
  playCue(name, opts = {}) {
    const a = Store.state.audio;
    const cfg = a.cues[name] || { vol: 0.8, mute: false, media: '' };
    if (cfg.mute || (a.noMusic && MUSIC_CUES.includes(name))) return;
    const r = opts.round ? Sel.round(opts.round) : null;
    const override = (r && r.sounds && r.sounds[name]) || cfg.media;
    if (override) { this.playFile(override, cfg.vol * a.master * (opts.soft ? 0.5 : 1)); return; }
    this.unlock();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (SoundDirector.muted) return;
    if (name !== 'tick') SoundDirector.duck(HEAVY_SFX.has(name) ? 0.3 : 0.6, HEAVY_SFX.has(name) ? 1600 : 700);
    // The V100 crafted library is preferred; names it does not have use the V66 synth.
    const lib = { roundintro: 'rin' + clamp(int(opts.n, 1), 1, 6), countdown: 'cdhit', timeout: 'buzzer', impact: 'round' }[name] || name;
    if (Sfx.names().includes(lib)) {
      Sfx.setVolume(clamp(cfg.vol * Store.state.audio.master * (opts.soft ? 0.5 : 1), 0, 1));
      safe('sfx:' + lib, () => Sfx.play(lib, lib === 'cdhit' ? opts.n : lib === 'tick' ? !!opts.low : undefined));
      if (name === 'impact') safe('synth:impact', () => this.synth('impact', cfg.vol * 0.6, opts.soft));
      return;
    }
    safe('synth:' + name, () => this.synth(name, cfg.vol, opts.soft));
  },
  playFile(id, vol) {
    Media.url(id).then((u) => {
      if (!u) return;
      const el = new Audio(u);
      el.volume = clamp(vol, 0, 1);
      el.play().catch((e) => Log.err('cue-file', e));
    });
  },
  /* ---- Music beds ---- */
  async music(slot, action, mediaOverride) {
    const cfg = Store.state.audio.music[slot];
    if (!cfg) return;
    if (action === 'stop') { this.fadeOutMusic(slot, cfg.fadeOut); return; }
    if (Store.state.audio.noMusic) return; // no theme / welcome / winner / background song at all
    const id = mediaOverride || cfg.media;
    if (!id) { if (slot === 'winner') this.playCue('fanfare'); return; }
    const u = await Media.url(id);
    if (!u) { UI.toast('Music file not found — using the built-in sound instead', 'err'); this.playCue(slot === 'winner' ? 'fanfare' : 'transition'); return; }
    ['theme', 'welcome', 'winner'].forEach((s) => { if (s !== slot && slot !== 'background') this.fadeOutMusic(s, 1); });
    this.stopNow(slot);
    const el = new Audio(u);
    el.loop = !!cfg.loop; el.volume = 0;
    // Songs go through the loud music bus (theme song / welcome song play big in the hall).
    if (this.ctx && this.musicBus) { try { this.ctx.createMediaElementSource(el).connect(this.musicBus); } catch (e) { Log.err('music-route', e); } }
    this.musicEls[slot] = el;
    const target = clamp(cfg.vol * Store.state.audio.master, 0, 1);
    const begin = () => {
      if (this.musicEls[slot] !== el) return;
      el.play().then(() => this.fade(el, 0, target, cfg.fadeIn)).catch((e) => { Log.err('music', e); UI.toast('Could not play music — click once anywhere on the page', 'err'); });
    };
    if (cfg.delay > 0) setTimeout(begin, cfg.delay * 1000); else begin();
    el.onended = () => { if (this.musicEls[slot] === el) { delete this.musicEls[slot]; Bus.emit('music', { slot, playing: false }); } };
    Bus.emit('music', { slot, playing: true });
  },
  fade(el, from, to, secs) {
    const start = performance.now(); const dur = Math.max(0.01, secs) * 1000;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / dur);
      try { el.volume = clamp(from + (to - from) * k, 0, 1); } catch (e) { return; }
      if (k < 1) requestAnimationFrame(step); else if (to === 0) { el.pause(); }
    };
    // Use a timer fallback because rAF is paused in background tabs.
    step(); const iv = setInterval(() => { if (performance.now() - start > dur + 50) { clearInterval(iv); try { el.volume = clamp(to, 0, 1); if (to === 0) el.pause(); } catch (e) { /* element gone */ } } }, 100);
  },
  fadeOutMusic(slot, secs) {
    const el = this.musicEls[slot]; if (!el) return;
    delete this.musicEls[slot];
    this.fade(el, el.volume, 0, secs || 1);
    Bus.emit('music', { slot, playing: false });
  },
  stopNow(slot) { const el = this.musicEls[slot]; if (el) { el.pause(); delete this.musicEls[slot]; } },
  stopAll() { Object.keys(this.musicEls).forEach((s) => this.fadeOutMusic(s, 0.8)); if (window.speechSynthesis) speechSynthesis.cancel(); },
  playing(slot) { return !!this.musicEls[slot]; },
};

/** Cue router: plays locally when this window owns audio, otherwise forwards to the owner. */
const Cue = {
  play(name, opts = {}) {
    if (Store.sandbox) return;
    if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'cue', name, opts });
    if (AudioDirector.isOutput()) AudioDirector.playCue(name, opts);
  },
  /** V100 CountVoice: a clear English voice counts "Ten … One, Go!" on the audio window. */
  voice(n) {
    if (Store.sandbox) return;
    if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'countvoice', n });
    if (AudioDirector.isOutput() && !SoundDirector.muted) CountVoice.say(n);
  },
  music(slot, action, media) {
    if (Store.sandbox) return;
    if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'music', slot, action, media });
    if (AudioDirector.isOutput()) AudioDirector.music(slot, action, media);
  },
};

/* =====================================================================
   RECORDED READINGS — the host's own voice (mp3 / phone / laptop mic) for
   a question, its options and its answer. Plays on the audio window
   through the loud music bus; the background music ducks under it.
   ===================================================================== */
/** Built-in voice-over that plays by itself when a round's rules screen opens (round id -> embedded audio). */
// Round 1's recording (rules-r1.mp3) still reads the old pass rule — it stays silent until the new rule is recorded (13 Oct: no pass, challenge 10 / 5 / 3).
const RULES_VOICE = { R3: 'asset:rules-r3' };
const VoicePlayer = {
  el: null,
  clipRules: false,
  playing: false,
  async play(id) {
    if (!id || Store.sandbox) return false;
    if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'voice', id });
    if (!AudioDirector.isOutput()) return true;
    this.stopLocal();
    if (Speech.supported) speechSynthesis.cancel();
    const u = await Media.url(id);
    if (!u) { Log.add('WARN', 'recording missing: ' + id); return false; }
    const el = new Audio(u);
    el.volume = clamp(num(Store.state.speech.recVol, 1), 0, 1);
    if (AudioDirector.ctx && AudioDirector.musicBus) { try { AudioDirector.ctx.createMediaElementSource(el).connect(AudioDirector.musicBus); } catch (e) { Log.err('voice-route', e); } }
    this.el = el; this.playing = true;
    el.onended = el.onerror = () => { if (this.el === el) { this.el = null; this.playing = false; } };
    el.play().catch((e) => { if (this.el === el) { this.el = null; this.playing = false; } Log.err('voice', e); });
    return true;
  },
  stopLocal() { if (this.el) { try { this.el.pause(); } catch (e) { /* gone */ } } this.el = null; this.playing = false; },
  stop() { this.stopLocal(); if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'voice', stop: true }); },
};

/* =====================================================================
   SPEECH DIRECTOR — Bengali (bn-IN / bn-BD) where the OS provides it.
   ===================================================================== */
const Speech = {
  voices: [],
  supported: 'speechSynthesis' in window,
  init() {
    if (!this.supported) return;
    const load = () => { this.voices = speechSynthesis.getVoices(); Bus.emit('voices', this.voices); };
    load();
    speechSynthesis.onvoiceschanged = load;
  },
  voice() {
    const want = Store.state.speech.voice;
    return this.voices.find((v) => v.name === want) || this.voices.find((v) => /^bn(-|_)IN/i.test(v.lang)) || this.voices.find((v) => /^bn/i.test(v.lang)) || null;
  },
  say(text, category = 'general', force = false) {
    if (!text || Store.sandbox) return;
    if (MODE === 'control' && Store.state.audio.output !== 'control') Sync.send({ type: 'speech', text, category, force });
    if (!AudioDirector.isOutput()) return;
    const sp = Store.state.speech;
    if (!this.supported || (!sp.enabled && !force)) return;
    try {
      if (category === 'timer') speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(str(text, 3000));
      const v = this.voice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'bn-IN';
      u.rate = sp.rate; u.pitch = sp.pitch;
      speechSynthesis.speak(u);
    } catch (e) { Log.err('speech', e); }
  },
  stop() { VoicePlayer.stop(); if (this.supported) speechSynthesis.cancel(); if (MODE === 'control') Sync.send({ type: 'speech', stop: true }); },
  /** A recording wins over the computer voice: always when asked for, and on its own when "recordings play by themselves" is on. */
  rec(id, force) { if (!id || !(force || Store.state.speech.rec)) return false; VoicePlayer.play(id); return true; },
  readQuestion(force = true) {
    const s = Store.state;
    if (s.show.scene === 'PRELIM_Q') { const q = Sel.prelimQuestions()[s.prelimLive.idx]; if (q) this.say('প্রশ্ন ' + bn(s.prelimLive.idx + 1) + '। ' + q.text, 'question', force); return; }
    const q = Sel.liveQuestion(); if (!q) return;
    if (this.rec(q.voiceQ, force)) return;
    this.say(q.speech || q.text, 'question', force);
    if (s.live.optionsShown) this.readOptions(force);
  },
  readOptions(force = true) {
    const q = Sel.liveQuestion(); if (!q) return;
    const l = Store.state.live;
    if (!l.eliminated.length && this.rec(q.voiceOpt, force)) return; // the recording reads all four; with two left the computer voice reads the two
    this.say(q.options.map((o, i) => (o && !l.eliminated.includes(i) ? OPT_LABELS[i] + '। ' + o : '')).filter(Boolean).join('। '), 'options', force);
  },
  readAnswer(force) {
    const s = Store.state;
    if (s.show.scene === 'PRELIM_Q') { const q = Sel.prelimQuestions()[s.prelimLive.idx]; if (q) this.say('সঠিক উত্তর: ' + q.answer, 'answer', force); return; }
    const q = Sel.liveQuestion(); if (!q) return;
    if (this.rec(q.voiceAns, force)) return;
    this.say('সঠিক উত্তর: ' + (q.answerText || q.options[q.answer] || ''), 'answer', force);
  },
  readTeam(force = true) { const t = Sel.team(Sel.answeringTeam()); if (t) this.say(t.name + (t.school ? '। ' + t.school : ''), 'team', force); },
  readRound(force = true) { const r = Sel.currentRound(); if (r) this.say(r.name + '। ' + r.label, 'round', force); },
};

/* =====================================================================
   STAGE ⇄ CONTROL SYNC — BroadcastChannel + direct window messaging +
   localStorage "storage" events. Any one channel is enough.
   ===================================================================== */
/** What the audience window may know: no answer travels to the TV before it is revealed. */
function publicState(s) {
  const l = s.live;
  const showLive = l.revealed || !!l.result || l.picked >= 0;
  const hideQ = (q) => (q.id === l.qid && showLive ? q : Object.assign({}, q, { answer: -1, answerText: '', explanation: '' }));
  const pl = s.prelimLive;
  return Object.assign({}, s, {
    questions: s.questions.map(hideQ),
    testQuestions: [],
    prelim: Object.assign({}, s.prelim, { questions: s.prelim.questions.map((q, i) => (s.show.scene === 'PRELIM_Q' && i === pl.idx && pl.reveal ? q : Object.assign({}, q, { answer: '' }))) }),
  });
}
/** The sound of a question's clip, played by the control window when the TV window may not start sound by itself. */
const ClipRelay = {
  el: null, id: '', at: 0, kind: '',
  async play(id, at) {
    const s = Store.state; const c = s.live.clip || {};
    if (!id || c.at !== at || c.action !== 'play') return;
    const u = await Media.url(id);
    if (!u || (Store.state.live.clip || {}).at !== at) return;
    this.stop();
    this.id = id; this.at = at; this.kind = Sel.clipKind({ clip: id });
    const el = this.el = new Audio(u); // the sound track of a video plays from an audio element too
    el.addEventListener('loadedmetadata', () => { const t = (now() - at) / 1000; if (t > 0.5 && t < el.duration) el.currentTime = t; }, { once: true });
    el.play().catch((e) => { Log.err('clip-relay', e); UI.toast('The clip has no sound — click once on the TV window, or start the quiz with START_QUIZ_CORNER.bat', 'err'); });
  },
  stop() { if (this.el) { try { this.el.pause(); } catch (e) { /* gone */ } this.el.removeAttribute('src'); this.el = null; } this.id = ''; },
  /** stops with the clip: another clip or scene, a stopped clip, or a video that has finished (audio may go on) */
  check(s) {
    if (!this.el) return;
    const c = s.live.clip || {};
    const videoDone = this.kind === 'video' && (s.show.scene === 'PRELIM_Q' ? s.prelimLive.clipDone : s.live.clipDone);
    if (!['QUESTION', 'PRELIM_Q'].includes(s.show.scene) || c.at !== this.at || c.action !== 'play' || videoDone) this.stop();
  },
};
Bus.on('change', () => { if (MODE === 'control') safe('clip-relay', () => ClipRelay.check(Store.state)); });

const Sync = {
  bc: null,
  stageWin: null,
  lastPong: 0,
  sendQueued: false,
  sessionId: uid('s'),
  init() {
    try { this.bc = new BroadcastChannel('qc66'); this.bc.onmessage = (e) => this.receive(e.data); } catch (e) { Log.add('WARN', 'BroadcastChannel unavailable — using fallback sync'); }
    window.addEventListener('message', (e) => { if (e.origin === location.origin || e.origin === 'null' || location.protocol === 'file:') this.receive(e.data); });
    window.addEventListener('storage', (e) => {
      if (MODE !== 'control' && e.key === LS_KEY && e.newValue) safe('storage-sync', () => this.applyState(JSON.parse(e.newValue)));
    });
    if (MODE === 'control') {
      Bus.on('change', () => this.queueState());
      setInterval(() => this.send({ type: 'ping', t: Date.now() }), 1500);
    } else {
      this.send({ type: 'hello' });
      setInterval(() => { if (Date.now() - this.lastPong > 6000) this.send({ type: 'hello' }); }, 3000);
    }
  },
  post(msg) {
    msg.from = MODE; msg.sid = this.sessionId; if (!msg.mid) msg.mid = uid('x');
    if (this.bc) { try { this.bc.postMessage(msg); } catch (e) { Log.err('bc-send', e); } }
    try {
      if (MODE === 'control' && this.stageWin && !this.stageWin.closed) this.stageWin.postMessage(msg, location.protocol === 'file:' ? '*' : location.origin);
      if (MODE !== 'control' && window.opener && !window.opener.closed) window.opener.postMessage(msg, location.protocol === 'file:' ? '*' : location.origin);
    } catch (e) { /* cross-window messaging optional */ }
  },
  send(msg) { this.post(msg); },
  queueState() {
    if (this.sendQueued || Store.sandbox) return;
    this.sendQueued = true;
    queueMicrotask(() => { this.sendQueued = false; this.post({ type: 'state', state: publicState(Store.state), rehearsal: Store.rehearsal }); this.post({ type: 'state-full', state: Store.state, rehearsal: Store.rehearsal }); });
  },
  seen: new Set(),
  receive(m) {
    if (!isObj(m) || !m.type || m.sid === this.sessionId) return;
    // The same message can arrive through two channels — act on it once.
    if (m.mid) {
      if (this.seen.has(m.mid)) return;
      this.seen.add(m.mid);
      if (this.seen.size > 400) this.seen = new Set(Array.from(this.seen).slice(-200));
    }
    if (MODE === 'control') {
      if (m.type === 'hello') { this.lastPong = Date.now(); this.queueState(); Bus.emit('stage-status'); }
      else if (m.type === 'pong') { this.lastPong = Date.now(); Bus.emit('stage-status'); }
      else if (m.type === 'key') Keys.handle(m.key, m.mods || {});
      else if (m.type === 'act' && m.name === 'drawPick') Actions.drawPick(m.arg); // only this one action may come from the TV window
      else if (m.type === 'clipsound') ClipRelay.play(m.id, m.at);
      else if (m.type === 'clipstate') { PreShow.tv[m.id] = { ok: !!m.ok, muted: !!m.muted, code: m.code || 0, relay: !!(ClipRelay.el && ClipRelay.id === m.id) }; Bus.emit('preshow'); }
      return;
    }
    if (m.type === 'state' && MODE === 'stage') this.applyState(m.state, m.rehearsal);
    else if (m.type === 'state-full' && MODE === 'host') this.applyState(m.state, m.rehearsal);
    else if (m.type === 'ping') { this.lastPong = Date.now(); this.send({ type: 'pong', t: m.t }); }
    else if (m.type === 'cue' && AudioDirector.isOutput()) AudioDirector.playCue(m.name, m.opts || {});
    else if (m.type === 'music' && AudioDirector.isOutput()) AudioDirector.music(m.slot, m.action, m.media);
    else if (m.type === 'voice' && AudioDirector.isOutput()) { if (m.stop) VoicePlayer.stopLocal(); else VoicePlayer.play(m.id); }
    else if (m.type === 'speech' && AudioDirector.isOutput()) { if (m.stop) { VoicePlayer.stopLocal(); if (Speech.supported) speechSynthesis.cancel(); } else Speech.say(m.text, m.category, m.force); }
    else if (m.type === 'media') { Media.forget(m.id); Media.loadIndex().then(() => Bus.emit('change', { label: 'media' })); }
    else if (m.type === 'fx') Bus.emit('fx', m.fx);
    else if (m.type === 'countvoice' && AudioDirector.isOutput()) CountVoice.say(m.n);
    else if (m.type === 'mute') SoundDirector.setMuted(m.on);
  },
  applyState(st, rehearsal) {
    if (!isObj(st)) return;
    const cur = Store.state;
    if (cur && st.rev === cur.rev && st.updatedAt === cur.updatedAt) return;
    Store.state = normalizeState(st);
    Store.rehearsal = !!rehearsal;
    Bus.emit('change', { label: 'sync', rev: st.rev });
  },
  connected() { return Date.now() - this.lastPong < 4500; },
  /** V100 PLACE: open the stage straight onto the second screen when the browser allows it. */
  async placeStage() {
    try {
      if (!('getScreenDetails' in window)) throw new Error('unsupported');
      const det = await window.getScreenDetails();
      const other = det.screens.find((sc) => sc !== det.currentScreen) || det.screens.find((sc) => !sc.isPrimary);
      if (!other) { UI.toast('Second screen not found — connect the TV by HDMI and choose Win+P ▸ Extend', 'err'); return; }
      const url = location.href.split('#')[0].split('?')[0] + '#stage';
      this.stageWin = window.open(url, 'qc66-stage', 'popup=yes,left=' + other.availLeft + ',top=' + other.availTop + ',width=' + other.availWidth + ',height=' + other.availHeight);
      if (!this.stageWin) { UI.toast('Pop-up blocked — please allow it', 'err'); return; }
      setTimeout(() => this.queueState(), 600);
      UI.toast('Stage window opened on the second screen — press F there', 'ok');
    } catch (e) {
      this.openStage();
      UI.toast('This browser could not place the window automatically — drag it to the TV or press Win+Shift+→, then F', 'err');
    }
  },
  openStage() {
    const url = location.href.split('#')[0].split('?')[0] + '#stage';
    try {
      this.stageWin = window.open(url, 'qc66-stage', 'popup=yes,width=1280,height=720');
      if (!this.stageWin) { UI.toast('Pop-up blocked — allow pop-ups in the browser', 'err'); return; }
      setTimeout(() => this.queueState(), 600);
    } catch (e) { Log.err('open-stage', e); }
  },
};
