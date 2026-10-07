// Usage: node tests/editing.mjs <built-html> <folder with R1-1.jpg, r2_3.jpg, holiday.jpg>
// Checks the editing tools a person uses before the show, through the real buttons.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, dir] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
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
step(errs.length === 0, 'কোনো JS ত্রুটি নেই', errs.join(' | '));
console.log(log.join('\n')); await b.close();
