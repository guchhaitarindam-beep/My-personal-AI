"""Tumi Prothoma v20 -> v21: jump bar, pre-show check, file-plays check, 1-page operator guide, sharper built-in pictures.
Usage: python3 -I patch_v21.py in.html out.html [sharpened_dir]   (sharpened_dir holds 09.jpg … 15.jpg for pk_img__q03 … q12)"""
import sys, re, base64, os
src, dst = sys.argv[1], sys.argv[2]
srdir = sys.argv[3] if len(sys.argv) > 3 else ''
s = open(src, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:80])
    s = s.replace(old, new)

CSS = r"""
.jumpbar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:0 0 10px;padding:6px 8px;border-radius:10px;background:rgba(255,213,74,.08);border:1px solid rgba(255,213,74,.35)}
.jumpbar .jl{font-size:12px;color:#ffd54a;width:100%}
.jumpbar .b{padding:5px 9px;font-size:13px;min-height:0}
.jumpbar .b.cur{outline:3px solid #ffd54a;outline-offset:1px}
.jumpbar .jg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:rgba(255,255,255,.06)}
#pcov{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center}
#pcov[hidden]{display:none}
#pcov .pcb{background:#1d1640;color:#fff;max-width:860px;width:94vw;max-height:90vh;overflow:auto;border-radius:14px;padding:16px 20px;box-shadow:0 10px 40px #000}
#pcov h2{margin:0 0 6px}
.pcl{display:grid;grid-template-columns:30px 1fr;gap:5px 8px;margin:10px 0;font-size:15px}
.pcl .ok{color:#5be37d}.pcl .wa{color:#ffc04a}.pcl .no{color:#ff6b6b}
"""
rep('</style>', CSS + '</style>', 2)  # count check only
s = s.replace(CSS + '</style>', '</style>', 1)  # keep it in the first style block only
# header buttons + overlay
rep('<span class="sp"></span><span id="tvstat"', '<button type="button" class="b" data-a="preCheck" title="Checks teams, questions, pictures, songs, videos and the TV window">✅ Check</button><button type="button" class="b" data-a="guidePrint" title="One page for the operator: order of the show, keys, what to do if something goes wrong">🖨 Guide</button><span class="sp"></span><span id="tvstat"')
rep('<div id="camov" hidden></div>', '<div id="camov" hidden></div><div id="pcov" hidden></div>')
# jump bar above every scene panel
rep("return `<div class=\"pnl-h\"><div><small>${esc(m.g)} • scene", "return `${jumpHTML()}<div class=\"pnl-h\"><div><small>${esc(m.g)} • scene")

JS = r"""
/* ----- Go anywhere: a bar of jump buttons above every scene (scores never change by jumping) ----- */
function jumpHTML() {
  const b = (id, l, t) => SCENES.some((x) => x.id === id) ? `<button type="button" class="b ${S.scene === id ? 'cur' : ''}" data-a="goto" data-v="${id}" title="${esc(t || SCENES[sceneIdx(id)].l)}">${l}</button>` : '';
  const rd = (k, n) => `<span class="jg">${b(k + 'i', 'Round ' + n, 'Round ' + n + ' rules')}${b(k, '▶', 'Round ' + n + ' play')}${b(k + 's', '📊', 'Round ' + n + ' scoreboard')}</span>`;
  return `<div class="jumpbar" role="navigation" aria-label="Go to any part of the show"><span class="jl">⤴ Go to any part of the show, any time — scores stay as they are</span>${b('open', '🏁 Opening')}<span class="jg">${b('selTitle', '📝 Selection')}${b('cd1', '⏱')}${b('sel', '▶', 'Selection questions')}${b('selEnd', '✅', 'Qualified teams')}</span>${b('welcome', '👋 Teams')}${b('podium', '🎲 Podium')}${b('cd2', '⏱ Countdown')}${rd('r1', 1)}${rd('r2', 2)}${rd('r3', 3)}${rd('r5', 4)}${b('final', '🏆 Final')}${b('thanks', '🙏 Thanks')}</div>`;
}

/* ----- Pre-show check: one click, everything that matters before the show ----- */
const PC_PLAY = /^(vid|avid|mus|aud|av):|^(user:theme|user:welcome|timerMusic|hpMusic)$/;
let PC_MEDIA = null; // { key: true | false } after the 🎬 test
function pcRows() {
  const out = [], add = (st, msg) => out.push([st, msg]);
  const ua = navigator.userAgent; add(/Chrome|Edg/.test(ua) ? 'ok' : 'wa', 'Browser: ' + (/Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : 'other — use Chrome or Edge'));
  let st = true; try { localStorage.setItem('didi.pc', '1'); localStorage.removeItem('didi.pc'); } catch (e) { st = false; }
  add(st ? 'ok' : 'no', st ? 'Saving works (everything is kept in this browser)' : 'Saving does not work — do not use a private window');
  const alive = Date.now() - stageAlive < 5000;
  add(alive ? (stageAudioReady ? 'ok' : 'wa') : 'wa', alive ? (stageAudioReady ? 'TV window open, sound on' : 'TV window open — click once inside it for sound (until then the laptop plays the sound)') : 'TV window not open yet — “Open TV window”, drag it to the TV, click inside, press F');
  const gen = S.teams.filter((t) => /^দল [০-৯]+$/.test(t.name)).length;
  add(gen ? 'wa' : 'ok', gen ? gen + ' team(s) still named “দল …” — type the real names (Teams tab)' : 'All 8 team names typed');
  const ph = S.teams.filter((t) => photoOf(t)).length; add(ph === S.teams.length ? 'ok' : 'wa', 'Team photos: ' + ph + ' / ' + S.teams.length);
  const need = needRows(), miss = need.filter((r) => !mu(r.key));
  add(miss.length ? 'no' : 'ok', miss.length ? miss.length + ' file(s) the questions need are missing: ' + miss.slice(0, 8).map((r) => r.q.split(' — ')[0] + ' ' + r.kind).join(', ') + ' (Media tab)' : 'Every picture / song / video the questions need is there (' + need.length + ')');
  [['sel', 'Selection'], ['r2', 'Round 2'], ['r5', 'Round 4']].forEach(([k, l]) => { const L = S.c[k] || [], na = L.filter((it) => !String(it.ans || '').trim()).length; add(na ? 'wa' : 'ok', l + ': ' + L.length + ' question(s)' + (na ? ' • ' + na + ' without an answer written' : ', every answer written')); });
  const r2need = (S.c.r2 || []).filter((it) => (it.kind || 'text') !== 'text'), r2miss = r2need.filter((it) => !avKeyOf(it));
  add(r2miss.length ? 'no' : 'ok', r2miss.length ? 'Round 2: ' + r2miss.length + ' song/video item(s) have no file (Audio & Video tab): #' + r2miss.map((it) => S.c.r2.indexOf(it) + 1).join(', #') : 'Round 2: every song / video item has its file (' + r2need.length + ')');
  add(mu('vid:cd1') ? 'ok' : 'wa', mu('vid:cd1') ? 'Countdown video added' : 'No countdown video — the built-in 10-to-0 countdown is used');
  add(FREP.length ? 'ok' : 'wa', FREP.length ? FREP.length + ' file(s) found in the folder ' + FOLDER : 'Nothing found in the folder ' + FOLDER + ' (fine if the files were added with Choose file)');
  const keys = [...new Set([...MEDIA.keys(), ...Object.keys(S.folder || {})])].filter((k) => PC_PLAY.test(k));
  if (!PC_MEDIA) add('wa', keys.length + ' song / video file(s) — press 🎬 to play the start of each one silently and make sure it works');
  else { const bad = keys.filter((k) => PC_MEDIA[k] === false); add(bad.length ? 'no' : 'ok', bad.length ? bad.length + ' file(s) do not play here: ' + bad.join(', ') + ' — convert to MP4 (H.264) / MP3' : 'All ' + keys.length + ' song / video files play'); }
  add('wa', 'After the last change: Settings ▸ Download backup (.json)');
  return out;
}
function pcRender() {
  const ov = $('#pcov'), rows = pcRows(), n = rows.filter((r) => r[0] === 'ok').length, ic = { ok: '✔', wa: '⚠', no: '✘' };
  ov.innerHTML = `<div class="pcb" role="dialog" aria-label="Pre-show check"><h2>✅ Pre-show check — ${n} / ${rows.length} OK</h2><div class="pcl">${rows.map(([st, m]) => `<span class="${st}">${ic[st]}</span><span>${esc(m)}</span>`).join('')}</div><div class="row">${B('🎬 Test every song / video', 'preMedia', { c: 'pri' })}${B('↻ Check again', 'preCheck')}${B('Close', 'preClose')}</div><small id="pcmsg"></small></div>`;
  ov.hidden = false;
}
A.preCheck = () => pcRender();
A.preClose = () => { $('#pcov').hidden = true; };
function canPlay(url, video, timeout) {
  return new Promise((res) => {
    const el = document.createElement(video ? 'video' : 'audio'); el.preload = 'auto'; el.muted = true; let t = 0;
    const done = (v) => { clearTimeout(t); el.onloadeddata = el.onerror = null; el.removeAttribute('src'); try { el.load(); } catch (e) { /* ignore */ } res(v); };
    el.onloadeddata = () => done(!video || el.videoWidth > 0 || el.duration > 0);
    el.onerror = () => done(false); t = setTimeout(() => done(false), timeout || 8000); el.src = url;
  });
}
A.preMedia = async () => {
  const keys = [...new Set([...MEDIA.keys(), ...Object.keys(S.folder || {})])].filter((k) => PC_PLAY.test(k)), r = {};
  let i = 0; for (const k of keys) { const m = $('#pcmsg'); if (m) m.textContent = 'Testing ' + (++i) + ' / ' + keys.length + ' — ' + k; r[k] = await canPlay(mu(k), /^(vid|avid|av):/.test(k)); }
  PC_MEDIA = r; pcRender();
};
async function warnUnplayable(f) {
  if (!(isVid(f) || isAud(f))) return true;
  const u = URL.createObjectURL(f); const ok = await canPlay(u, isVid(f), 10000); URL.revokeObjectURL(u);
  if (!ok) say('⚠ ' + f.name + ' does not play in this browser — convert it to MP4 (H.264) or MP3');
  return ok;
}

/* ----- One-page operator guide (Bengali), printable ----- */
A.guidePrint = () => {
  const c = S.c, R = c.rounds, w = window.open('', '_blank'); if (!w) return say('Allow pop-ups to print the guide');
  const order = SCENES.map((x, i) => `<li>${esc(x.l)}</li>`).join('');
  w.document.write(`<!doctype html><html lang="bn"><meta charset="utf-8"><title>${esc(c.meta.show)} — অপারেটর গাইড</title><style>body{font-family:'Noto Sans Bengali',Vrinda,sans-serif;margin:12mm;font-size:12.5px;line-height:1.45}h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:8px 0 3px;border-bottom:1px solid #999}.c{columns:2;column-gap:10mm}ol,ul{margin:0;padding-left:18px}kbd{border:1px solid #555;border-radius:3px;padding:0 4px;font-family:monospace}table{border-collapse:collapse}td{padding:1px 6px 1px 0;vertical-align:top}@page{size:A4;margin:0}</style>
  <h1>${esc(c.meta.show)} — অপারেটর গাইড (এক পাতা)</h1><div>${esc(c.meta.event || '')} • ${esc(c.meta.org || '')}</div>
  <div class="c"><h2>শো শুরুর আগে</h2><ol><li>ফাইলটা খুলুন (Chrome / Edge) → ওপরে <b>✅ Pre-show check</b> → সব ✔ না হওয়া পর্যন্ত ঠিক করুন, <b>🎬</b> চেপে সব গান-ভিডিও পরীক্ষা করুন।</li><li><b>Open TV window</b> → জানালাটা টিভিতে টেনে নিন → ভিতরে একবার ক্লিক (শব্দ চালু) → <kbd>F</kbd> = ফুল স্ক্রিন।</li><li>টিভির শব্দ চালু, ল্যাপটপ চার্জে, স্লিপ বন্ধ।</li><li>Settings ▸ <b>Download backup</b>।</li></ol>
  <h2>যেকোনো জায়গায় যাওয়া</h2><p>প্রতিটি দৃশ্যের ওপরে হলুদ বার: <b>Opening, Selection, Teams, Podium, Countdown, Round 1–4 (নিয়ম / ▶ খেলা / 📊 স্কোর), Final</b>। একবার চাপলেই সেখানে — স্কোর যেমন আছে তেমনই থাকে। বাঁ দিকের তালিকা থেকেও যাওয়া যায়।</p>
  <h2>কী-বোর্ড</h2><table><tr><td><kbd>N</kbd> / <kbd>P</kbd></td><td>পরের / আগের দৃশ্য</td></tr><tr><td><kbd>1</kbd>–<kbd>8</kbd></td><td>দলের বাজার (রাউন্ড ২ চ্যালেঞ্জ, রাউন্ড ৪)</td></tr><tr><td><kbd>C</kbd> / <kbd>W</kbd></td><td>সঠিক / ভুল</td></tr><tr><td><kbd>S</kbd></td><td>পাস (রাউন্ড ৩ হেডফোন)</td></tr><tr><td><kbd>T</kbd></td><td>টাইমার চালু / থামাও</td></tr><tr><td><kbd>U</kbd></td><td>শেষ স্কোর ফেরত (Undo)</td></tr><tr><td><kbd>F</kbd> (টিভিতে)</td><td>ফুল স্ক্রিন</td></tr></table>
  <h2>রাউন্ড</h2><ul><li><b>বাছাই:</b> ${c.sel.length}টি প্রশ্ন, দল কাগজে লেখে।</li><li><b>রাউন্ড ১ ${esc(R.r1.name)}:</b> কার্ড A–H বেছে খেলা, ১ মিনিট।</li><li><b>রাউন্ড ২ ${esc(R.r2.name)}:</b> গান / ভিডিও; ভুল বা পাস হলে চ্যালেঞ্জ।</li><li><b>রাউন্ড ৩ ${esc(R.r3.name)}:</b> হেডফোন, প্রতিটি ঠিক শব্দে ✔।</li><li><b>রাউন্ড ৪ ${esc(R.r5.name)}:</b> ${c.r5.length}টি বাজার প্রশ্ন।</li></ul>
  <h2>কিছু গোলমাল হলে</h2><ul><li>ভুল স্কোর → <kbd>U</kbd> বা ডান দিকের Score desk (+/−)।</li><li>টিভিতে শব্দ নেই → টিভি জানালায় একবার ক্লিক; তবুও না হলে ল্যাপটপ থেকেই শব্দ বাজে।</li><li>টিভি জানালা বন্ধ হয়ে গেছে → আবার <b>Open TV window</b>, সব আগের মতোই থাকে।</li><li>ভিডিও চলছে না → MP4 (H.264) করে আবার দিন; ততক্ষণ পরের প্রশ্নে চলে যান।</li><li>ব্রাউজার বন্ধ হয়ে গেছে → আবার খুলুন, শো যেখানে ছিল সেখানেই থাকে।</li></ul>
  <h2>শো-এর ক্রম</h2><ol style="columns:1">${order}</ol></div><script>setTimeout(()=>print(),400)<\/script></html>`);
  w.document.close();
};
"""
rep('/* ----- startup ----- */', JS + '\n/* ----- startup ----- */')

# warn about files that will not play (mkv / avi / HEVC …) when they are added
rep("""      await mediaSet(key, blob);
      if (key.startsWith('av:'))""", """      await mediaSet(key, blob);
      if (/^(vid|avid|mus|aud|av|user:theme|user:welcome|timerMusic|hpMusic)/.test(key) && !(await warnUnplayable(f))) { commit(); refreshTabs(); t.value = ''; return; }
      if (key.startsWith('av:'))""")
rep("""    if (isVid(f)) await mediaSet((ans ? 'avid:' : 'vid:') + it.id, f);
    else if (isAud(f)) await mediaSet('mus:' + it.id, f);""", """    if ((isVid(f) || isAud(f)) && !(await warnUnplayable(f))) (rep.bad = rep.bad || []).push(f.name);
    if (isVid(f)) await mediaSet((ans ? 'avid:' : 'vid:') + it.id, f);
    else if (isAud(f)) await mediaSet('mus:' + it.id, f);""")
rep("""    rep.sel++; if (++done % 3 === 0) say('Saving… ' + done + ' / ' + total);""", """    rep.sel++; ++done; say('Saving… ' + done + ' / ' + total); mfStatus('Saving… ' + done + ' / ' + total + ' — ' + f.name);""")
rep("""(r.skip.length ? ` Not recognised (no question number in the name): ${r.skip.slice(0, 6).join(', ')}` : '');""", """(r.skip.length ? ` Not recognised (no question number in the name): ${r.skip.slice(0, 6).join(', ')}` : '') + (r.bad && r.bad.length ? ` ⚠ These do not play in this browser — convert to MP4 (H.264) / MP3: ${r.bad.join(', ')}` : '');""")

# sharper built-in question pictures: replace the old ones only where the stored picture is still the old built-in one
OLD = {}
if srdir:
    names = ['q03', 'q04', 'q06', 'q08', 'q10', 'q11', 'q12']
    for i, k in enumerate(names):
        m = re.search(r'(<script type="text/plain" id="asset-pk_img__' + k + r'">data:image/jpeg;base64,)([A-Za-z0-9+/=]+)', s)
        OLD[k] = len(base64.b64decode(m.group(2)))
        new = base64.b64encode(open(os.path.join(srdir, '%02d.jpg' % (9 + i)), 'rb').read()).decode()
        s = s[:m.start(2)] + new + s[m.end(2):]
    rep("""  let have = new Set(await DB.keys()); if (have.has('packver:' + DEFAULT_CONTENT.cv)) return;""", """  let have = new Set(await DB.keys());
  if (have.has('packver:' + DEFAULT_CONTENT.cv) && !have.has('packsr:1')) { // v21: AI-sharpened built-in pictures replace the old small ones (a picture you changed yourself is kept)
    const OLD = """ + str(OLD).replace("'", '"') + """;
    for (const q of Object.keys(OLD)) { const key = 'img:' + q, cur = await DB.get(key), b = AS['pk_img__' + q]; if (cur && cur.size !== OLD[q]) continue; const m = b && /^data:([^;]+);base64,(.*)$/s.exec(b); if (!m) continue; const bin = atob(m[2]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await DB.put(key, new Blob([u], { type: m[1] })); await mediaLoad(key); }
    await DB.put('packsr:1', new Blob(['1'])); return;
  }
  if (!have.has('packsr:1')) await DB.put('packsr:1', new Blob(['1']));
  if (have.has('packver:' + DEFAULT_CONTENT.cv)) return;""")
open(dst, 'w', encoding='utf-8').write(s)
print('ok', len(s), OLD)
