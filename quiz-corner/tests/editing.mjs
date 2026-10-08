// Usage: node tests/editing.mjs <built-html> <folder with R1-1.jpg, r2_3.jpg, holiday.jpg>
// Checks the editing tools a person uses before the show, through the real buttons.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, dir] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true, permissions: ['microphone'] });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept()); p.on('filechooser', () => {}); // enables chooser interception before the first click
await p.goto('file://' + file); await p.waitForFunction(() => window.QC);
// headless Chromium sometimes misses the very first file dialog: try the click again when no dialog came
const choose = async (selector, files) => { for (let i = 0; i < 4; i++) { const pr = p.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null); await p.click(selector); const fc = await pr; if (fc) { await fc.setFiles(files); return true; } } return false; };
const log = []; const step = (ok, n, i = '') => log.push((ok ? 'OK   ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
// 1. pictures for many questions at once, matched by file name
await p.evaluate(() => window.QC.Actions.tab('questions')); await p.waitForTimeout(500);
await choose('[data-act="qMediaBulk"]', ['R1-1.jpg', 'r2_3.jpg', 'holiday.jpg'].map((f) => path.join(dir, f)));
await p.waitForTimeout(2500);
const bulk = await p.evaluate(() => { const QC = window.QC; const q1 = QC.Sel.roundQuestions('R1').find((q) => q.number === 1); const q3 = QC.Sel.roundQuestions('R2').find((q) => q.number === 3); return { q1: q1.image, q3: q3.image, modal: document.querySelector('.modal-back') ? document.querySelector('.modal-back').innerText : '' }; });
step(/^m/.test(bulk.q1) && /^m/.test(bulk.q3), 'একসাথে ছবি: R1-1.jpg → রাউন্ড ১ প্রশ্ন ১, r2_3.jpg → রাউন্ড ২ প্রশ্ন ৩', JSON.stringify({ q1: bulk.q1, q3: bulk.q3 }));
step(/holiday\.jpg/.test(bulk.modal) && /R1-5\.jpg/.test(bulk.modal), 'নাম থেকে বোঝা না গেলে সেই ফাইলের নাম ও সঠিক নিয়ম দেখায়');
await p.keyboard.press('Escape');
// 2. questions out to CSV and back in, replacing the bank (another event)
const csv = await p.evaluate(async () => { const QC = window.QC; let blob; const orig = window.URL.createObjectURL; return new Promise((res) => { window.URL.createObjectURL = (bb) => { blob = bb; window.URL.createObjectURL = orig; blob.text().then(res); return orig(bb); }; QC.Actions.exportQuestionsCsv(); }); });
step(csv.split('\n').length > 70, 'প্রশ্ন CSV নামানো যায়', (csv.split('\n').length - 1) + ' সারি');
await p.evaluate(() => window.QC.Actions.importOpen()); await p.waitForTimeout(300);
const small = csv.split('\n').slice(0, 6).join('\n');
await p.fill('#importText', small); await p.click('[data-act="importPreview"]'); await p.waitForTimeout(800);
await p.click('[data-act="importReplace"]'); await p.waitForTimeout(800);
const n = await p.evaluate(() => window.QC.Store.state.questions.length);
step(n === 5, 'অন্য অনুষ্ঠানের জন্য: CSV থেকে পুরো প্রশ্ন-ব্যাংক বদলানো', n + 'টি প্রশ্ন');
await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
const back = await p.evaluate(() => window.QC.Store.state.questions.length);
step(back > 70, 'Ctrl+Z দিয়ে আগের প্রশ্ন-ব্যাংক ফেরে', back + 'টি প্রশ্ন');
// 3. our team: add a member with name, role, about and photo
await p.evaluate(() => window.QC.Actions.tab('event')); await p.waitForTimeout(500);
await p.click('[data-act="crewAdd"]'); await p.waitForTimeout(400);
const idx = await p.evaluate(() => window.QC.Store.state.crew.length - 1);
await p.fill(`[data-bind="crew.${idx}.name"]`, 'নতুন সদস্য'); await p.press(`[data-bind="crew.${idx}.name"]`, 'Tab');
await p.fill(`[data-bind="crew.${idx}.role"]`, 'প্রশ্ন সংকলন'); await p.press(`[data-bind="crew.${idx}.role"]`, 'Tab');
await choose(`[data-act="setMedia"][data-arg^="crew.${idx}.photo"]`, path.join(dir, 'R1-1.jpg')); await p.waitForTimeout(1200);
const crew = await p.evaluate((i) => window.QC.Store.state.crew[i], idx);
step(crew.name === 'নতুন সদস্য' && crew.role === 'প্রশ্ন সংকলন' && /^m/.test(crew.photo), 'আমাদের টিমে নতুন সদস্য: নাম, ভূমিকা, ছবি', JSON.stringify(crew));
// 4. the host's own voice: record a question reading on the laptop mic, add option / answer readings by file name, hear them in the show
const wav = (() => { const sr = 8000, n = sr / 2, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(i / 6)), 44 + i * 2); return buf; })();
for (const f of ['R1-2-opt.wav', 'R1-2-ans.wav']) fs.writeFileSync(path.join(dir, f), wav);
await p.evaluate(() => { const QC = window.QC; QC.Store.state.audio.output = 'control'; QC.Actions.tab('questions'); QC.UI.qEdit = QC.Sel.roundQuestions('R1').find((q) => q.number === 2).id; QC.UI.renderTab(true); }); await p.waitForTimeout(600);
await p.click('[data-act="recOpen"][data-arg$=".voiceQ"]'); await p.waitForTimeout(400);
const script = await p.evaluate(() => (document.querySelector('.rec-script') || {}).textContent || '');
const qtext = await p.evaluate(() => window.QC.Sel.roundQuestions('R1').find((q) => q.number === 2).text);
step(script === qtext, 'রেকর্ড করার সময় পড়ার লেখা (প্রশ্ন) সামনে দেখায়');
await p.click('[data-act="recStart"]'); await p.waitForTimeout(1800); await p.click('[data-act="recStop"]'); await p.waitForTimeout(900);
const st = await p.evaluate(() => (document.getElementById('recState') || {}).textContent || '');
await p.click('[data-act="recSave"]'); await p.waitForTimeout(1200);
const vq = await p.evaluate(() => window.QC.Sel.roundQuestions('R1').find((q) => q.number === 2).voiceQ);
step(/✔/.test(st) && /^m/.test(vq), 'ল্যাপটপের মাইকে রেকর্ড → শুনে দেখা → রাখা', st + ' ' + vq);
await choose('[data-act="qMediaBulk"]', ['R1-2-opt.wav', 'R1-2-ans.wav'].map((f) => path.join(dir, f))); await p.waitForTimeout(2000); await p.keyboard.press('Escape');
const v = await p.evaluate(() => { const q = window.QC.Sel.roundQuestions('R1').find((x) => x.number === 2); return { o: q.voiceOpt, a: q.voiceAns, img: q.image, clip: q.clip }; });
step(/^m/.test(v.o) && /^m/.test(v.a) && !v.clip, 'একসাথে: R1-2-opt.wav → বিকল্প পড়া, R1-2-ans.wav → উত্তর পড়া', JSON.stringify(v));
await p.evaluate(() => { const QC = window.QC; QC.AudioDirector.unlock(); const g = QC.Show.rundown().find((x) => x.scene === 'GRID' && x.params.roundId === 'R1'); QC.Show.go(g); QC.Actions.gridKey(2); }); await p.waitForTimeout(2200);
const playing = await p.evaluate(() => ({ on: window.QC.VoicePlayer.playing, src: !!(window.QC.VoicePlayer.el && window.QC.VoicePlayer.el.src) }));
step(playing.on && playing.src, 'প্রশ্ন খুললে নিজের গলার রেকর্ডিং নিজে বাজে', JSON.stringify(playing));
await p.evaluate(() => window.QC.Actions.speak('stop')); await p.waitForTimeout(200);
step(!(await p.evaluate(() => window.QC.VoicePlayer.playing)), '"পড়া থামাও" দিলে থামে');
step(errs.length === 0, 'কোনো JS ত্রুটি নেই', errs.join(' | '));
console.log(log.join('\n')); await b.close();
