// Usage: node tests/draw.mjs <built-html> <screenshot-dir>   (Playwright; PW_PATH = playwright module path)
// Podium lottery as it is run: control + TV window, cards clicked on the TV, keys 1–8 on the control.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const errs = [];
const ctl = await ctx.newPage(); ctl.on('pageerror', (e) => errs.push('control: ' + e.message));
await ctl.goto('file://' + file); await ctl.waitForFunction(() => window.QC);
const tv = await ctx.newPage(); tv.on('pageerror', (e) => errs.push('tv: ' + e.message));
await tv.goto('file://' + file + '#stage'); await tv.waitForTimeout(1500);
const log = []; const step = (ok, n, i = '') => log.push((ok ? 'OK   ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
await ctl.evaluate(() => { const { Store, Show } = window.QC; Store.commit('schools', (s) => { ['উত্তর কলমদান প্রাথমিক বিদ্যালয়', 'খেজুরি আদর্শ বিদ্যাপীঠ', 'বোগা প্রাথমিক বিদ্যালয়', 'হেঁড়িয়া শিশু শিক্ষা নিকেতন', 'কামারদা প্রাথমিক বিদ্যালয়', 'জনকা প্রাথমিক বিদ্যালয়', 'বীরবন্দর প্রাথমিক বিদ্যালয়', 'নিজকসবা প্রাথমিক বিদ্যালয়'].forEach((n, i) => { s.teams[i].school = n; s.teams[i].prelim.manual = [18, 12, 15, 20, 11, 17, 14, 16][i]; }); }); Show.go(Show.rundown().find((x) => x.scene === 'DRAW')); });
await tv.waitForTimeout(2000); await tv.screenshot({ path: path.join(out, 'draw1.png') });
const first = await ctl.evaluate(() => window.QC.Sel.preName(window.QC.Sel.team(window.QC.Draw.next())));
step(first === 'হেঁড়িয়া শিশু শিক্ষা নিকেতন', 'বাছাইয়ে প্রথম দল প্রথমে বাছে', first);
const tvTurn = await tv.evaluate(() => (document.querySelector('.layer:not(.exiting) .draw-turn') || {}).textContent || '');
step(tvTurn.includes(first), 'টিভিতে লেখা: এবার বেছে নেবে …', tvTurn);
// the school names are the operator's: edit one right in the live panel, the TV follows
const inp = ctl.locator('.school-row input[type="text"]').first();
await inp.fill('দক্ষিণ খেজুরি আদর্শ বিদ্যালয়'); await inp.press('Tab'); await tv.waitForTimeout(1200);
const edited = await ctl.evaluate(() => window.QC.Sel.team(window.QC.Draw.next()).school);
const tvTurn2 = await tv.evaluate(() => (document.querySelector('.layer:not(.exiting) .draw-turn') || {}).textContent || '');
step(edited === 'দক্ষিণ খেজুরি আদর্শ বিদ্যালয়' && tvTurn2.includes('দক্ষিণ খেজুরি আদর্শ বিদ্যালয়'), 'লাইভ প্যানেলে স্কুলের নাম বদলানো যায় — টিভিতে সঙ্গে সঙ্গে বদলায়', tvTurn2);
const sc = ctl.locator('.school-row input[type="number"]').first();
await sc.fill('19'); await sc.press('Tab'); await ctl.waitForTimeout(400);
step(await ctl.evaluate(() => window.QC.Sel.team(window.QC.Draw.next()).prelim.manual === 19), 'বাছাইয়ের নম্বরও এখানেই বদলানো যায়');
await ctl.screenshot({ path: path.join(out, 'draw-control.png') });
// TV click: once to choose, once more to open
await tv.click('.layer:not(.exiting) [data-draw="4"]'); await tv.waitForTimeout(900);
const pend = await ctl.evaluate(() => window.QC.Store.state.draw.pending);
await tv.screenshot({ path: path.join(out, 'draw2.png') });
step(pend === 4, 'টিভির পর্দায় ক্লিক: ছবি বেছে নেওয়া (জ্বলে ওঠে)', String(pend));
await tv.click('.layer:not(.exiting) [data-draw="4"]'); await tv.waitForTimeout(1800);
const p1 = await ctl.evaluate(() => { const { Store, Sel } = window.QC; const p = Store.state.draw.picks[0]; return p && { code: Sel.code(Sel.team(p.team)), name: Sel.preName(Sel.team(p.team)), podium: p.podium }; });
const tvOpen = await tv.evaluate(() => (document.querySelector('.layer:not(.exiting) .dcard.open') || {}).textContent || '');
step(p1 && p1.name === 'দক্ষিণ খেজুরি আদর্শ বিদ্যালয়' && tvOpen.includes(p1.code) && tvOpen.includes(p1.name), 'আবার ক্লিক: কার্ড খুলে পোডিয়াম ও স্কুলের নাম', JSON.stringify(p1));
await tv.screenshot({ path: path.join(out, 'draw3.png') });
// the rest with the number keys on the control window
for (const c of [0, 1, 2, 3, 5, 6, 7]) { await ctl.keyboard.press(String(c + 1)); await ctl.waitForTimeout(150); await ctl.keyboard.press(String(c + 1)); await ctl.waitForTimeout(250); }
await tv.waitForTimeout(2500);
const fin = await ctl.evaluate(() => { const { Store, Sel } = window.QC; return { n: Store.state.draw.picks.length, uniq: new Set(Store.state.draw.picks.map((p) => p.podium)).size, ok: Store.state.draw.picks.every((p) => Sel.teamIndex(p.team) === p.podium), order: Sel.finalistIds().map((id) => Sel.code(Sel.team(id))).join(',') }; });
step(fin.n === 8 && fin.uniq === 8 && fin.ok, 'কিবোর্ডে ১–৮: সব দল আলাদা পোডিয়াম, কোড = পোডিয়াম', JSON.stringify(fin));
step(fin.order === 'A / 1,B / 2,C / 3,D / 4,E / 5,F / 6,G / 7,H / 8', 'এরপর দলগুলি A / 1 … H / 8 ক্রমে', fin.order);
await tv.screenshot({ path: path.join(out, 'draw4.png') });
const opened = await tv.evaluate(() => document.querySelectorAll('.layer:not(.exiting) .dcard.open').length);
step(opened === 8, 'টিভিতে ৮টি কার্ডই খোলা', String(opened));
await ctl.keyboard.press('Control+z'); await ctl.waitForTimeout(400);
step(await ctl.evaluate(() => window.QC.Store.state.draw.picks.length === 7), 'Ctrl+Z: শেষ চাল ফেরানো যায়');
await ctl.keyboard.press('Control+y'); await ctl.waitForTimeout(400);
await ctl.evaluate(() => window.QC.Show.next()); await tv.waitForTimeout(1500);
const nextScene = await ctl.evaluate(() => window.QC.Store.state.show.scene);
step(nextScene !== 'DRAW', 'পরের ধাপে অনুষ্ঠান এগোয়', nextScene);
step(errs.length === 0, 'কোনো JS ত্রুটি নেই', errs.join(' | '));
console.log(log.join('\n')); await b.close();
