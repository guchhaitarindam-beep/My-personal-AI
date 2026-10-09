// Usage: node tests/edits.mjs <built-html> <screenshot-dir>   (Playwright; PW_PATH = playwright module path)
// Every edit the operator makes on the day, typed into the real fields of the control window,
// and checked on the TV window: school names, children's names, prelim points, question text / options / answer,
// main-round title, crew name, lottery card name, score correction, undo.
import { createRequire } from 'module'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const errs = [];
const ctl = await ctx.newPage(); ctl.on('pageerror', (e) => errs.push('control: ' + e.message));
ctl.on('dialog', (d) => d.accept()); // "+ Add / − Subtract" asks for a reason: the operator presses OK
await ctl.goto('file://' + file); await ctl.waitForFunction(() => window.QC && document.querySelector('.dock'));
const tv = await ctx.newPage(); tv.on('pageerror', (e) => errs.push('tv: ' + e.message));
await tv.goto('file://' + file + '#stage'); await tv.waitForFunction(() => window.QC); await tv.waitForTimeout(800);
const log = []; const step = (ok, n, i = '') => log.push((ok ? 'OK   ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const page = (k) => ctl.evaluate((k) => window.QC.Actions.tab(k), k);
const type = async (bind, value) => { const el = ctl.locator('[data-bind="' + bind + '"]').first(); await el.fill(String(value)); await el.press('Tab'); await ctl.waitForTimeout(250); };
const go = (sc, match) => ctl.evaluate(([sc, match]) => { const Q = window.QC; const st = Q.Show.rundown().find((x) => x.scene === sc && Object.keys(match || {}).every((k) => x.params[k] === match[k])); Q.Show.go(st); }, [sc, match || {}]);
const tvText = async (ms = 1600) => { await tv.waitForTimeout(ms); return tv.evaluate(() => (document.querySelector('.layer:not(.exiting)') || {}).innerText || ''); };
const flat = (s) => s.replace(/\s+/g, ' ');

// 1. TEAMS: school + the two children's names → team intro on TV
await page('teams'); await ctl.waitForTimeout(400);
await type('teams.0.school', 'খেজুরি আদর্শ প্রাথমিক বিদ্যালয়');
await type('teams.0.captain', 'রিয়া মাইতি');
await type('teams.0.players.0', 'অয়ন মণ্ডল');
const t0 = await ctl.evaluate(() => window.QC.Store.state.teams[0].id);
await go('TEAM_INTRO', { teamId: t0 }); await ctl.evaluate(() => { window.QC.Show.sub(1); window.QC.Show.sub(1); });
let txt = flat(await tvText(2600));
step(txt.includes('খেজুরি আদর্শ প্রাথমিক বিদ্যালয়') && txt.includes('রিয়া মাইতি') && txt.includes('অয়ন মণ্ডল'), 'TEAMS: স্কুল ও দুই সদস্যের নাম → টিভিতে দল পরিচিতি', txt.slice(0, 160));
await tv.screenshot({ path: path.join(out, 'edit-team-intro.png') });

// 2. live panel at the prelim results: school name + prelim points
await go('PRELIM_RESULT'); await ctl.waitForTimeout(800);
const sname = ctl.locator('.school-row input[type="text"]').nth(1); await sname.fill('দক্ষিণ কলমদান শিশু শিক্ষা কেন্দ্র'); await sname.press('Tab');
const spts = ctl.locator('.school-row input[type="number"]').nth(1); await spts.fill('97'); await spts.press('Tab'); await ctl.waitForTimeout(400);
txt = flat(await tvText(1800));
const top = await ctl.evaluate(() => { const r = window.QC.Sel.prelimRanking()[0]; return r.team.school + ' ' + r.score; });
step(txt.includes('দক্ষিণ কলমদান শিশু শিক্ষা কেন্দ্র') && top === 'দক্ষিণ কলমদান শিশু শিক্ষা কেন্দ্র 97', 'LIVE (বাছাই ফলাফল): স্কুলের নাম ও নম্বর → টিভি ও ক্রম সঙ্গে সঙ্গে বদলায়', top);
await tv.screenshot({ path: path.join(out, 'edit-prelim-result.png') });

// 3. Prelim round page: manual points and manual ★ (tie-break)
await page('prelim'); await ctl.waitForTimeout(500);
await type('teams.4.prelim.manual', '98');
let first = await ctl.evaluate(() => { const r = window.QC.Sel.prelimRanking()[0]; return window.QC.Store.state.teams.indexOf(r.team) + ':' + r.score; });
step(first === '4:98', 'Prelim round পাতা: Manual points দিলে ক্রম বদলায়', first);
await type('teams.6.prelim.manual', '98'); await type('teams.6.prelim.stars', '3');
first = await ctl.evaluate(() => { const r = window.QC.Sel.prelimRanking()[0]; return window.QC.Store.state.teams.indexOf(r.team) + ':' + r.score + ':' + r.stars; });
step(first === '6:98:3', 'Prelim round পাতা: সমান নম্বরে Manual ★ বেশি যার সে এগিয়ে', first);

// 4. QUESTIONS: change a question, its options and the right answer → TV question and the revealed answer
await page('questions'); await ctl.waitForTimeout(400);
const qi = await ctl.evaluate(() => { const Q = window.QC; const q = Q.Sel.roundQuestions('R1').find((x) => x.number === 2); return Q.Store.state.questions.indexOf(q); });
const qid = await ctl.evaluate((qi) => window.QC.Store.state.questions[qi].id, qi);
await ctl.evaluate((id) => window.QC.Actions.qEdit(id), qid); await ctl.waitForTimeout(500);
await type('questions.' + qi + '.text', 'পরীক্ষার প্রশ্ন: ভারতের জাতীয় ফল কোনটি?');
await type('questions.' + qi + '.options.0', 'আম'); await type('questions.' + qi + '.options.1', 'কাঁঠাল');
await type('questions.' + qi + '.options.2', 'কলা'); await type('questions.' + qi + '.options.3', 'আপেল');
await ctl.locator('[data-bind="questions.' + qi + '.answer"][value="0"]').first().check(); await ctl.waitForTimeout(300); // the right answer is a radio button
await go('GRID', { roundId: 'R1' }); await ctl.waitForTimeout(800);
await ctl.evaluate((id) => window.QC.Actions.loadQ(id), qid);
txt = flat(await tvText(2600));
step(txt.includes('পরীক্ষার প্রশ্ন: ভারতের জাতীয় ফল কোনটি?'), 'QUESTIONS: নতুন প্রশ্নের লেখা টিভিতে', txt.slice(0, 120));
await ctl.evaluate(() => document.activeElement && document.activeElement.blur()); // shortcuts work once the cursor is out of the edit boxes
await ctl.keyboard.press('v'); await ctl.waitForTimeout(400); await ctl.keyboard.press('r');
txt = flat(await tvText(2200));
step(txt.includes('কাঁঠাল') && txt.includes('CORRECT ANSWER') && /\(ক\)\s*আম/.test(txt), 'QUESTIONS: নতুন বিকল্প ও সঠিক উত্তর (ক) আম', txt.slice(txt.indexOf('CORRECT'), txt.indexOf('CORRECT') + 40));
await tv.screenshot({ path: path.join(out, 'edit-question.png') });

// 5. Event details: the main-round title; the QUIZ CORNER brand is a separate field and stays
await page('event'); await ctl.waitForTimeout(400);
await type('event.mainTitle', 'JUNIOR GENIUS SEASON 4 TEST');
await go('ROUND_INTRO', { roundId: 'R2' });
txt = flat(await tvText(2200));
step(txt.includes('JUNIOR GENIUS SEASON 4 TEST'), 'Event details: Main-round title বদলালে টিভিতে বদলায়', txt.slice(0, 80));
await go('PROGRAMME');
txt = flat(await tvText(1800));
step(/QUIZ CORNER presents/i.test(txt) && !/JUNIOR GENIUS/.test(txt), 'Brand আলাদা: অনুষ্ঠান পরিচিতিতে QUIZ CORNER presents', txt.slice(0, 80));
await page('event'); await ctl.waitForTimeout(300); await type('event.mainTitle', 'JUNIOR GENIUS SEASON 4');

// 6. crew name and a lottery card name (Event page)
await type('crew.1.name', 'সুব্রত মাইতি (পরীক্ষা)');
await go('CREW'); await ctl.evaluate(() => { for (let i = 0; i < 8; i++) window.QC.Show.sub(1); });
txt = flat(await tvText(2600));
step(txt.includes('সুব্রত মাইতি (পরীক্ষা)'), 'আমাদের টিম: নাম বদলালে টিভিতে বদলায়', '');
await page('event'); await ctl.waitForTimeout(300); await type('crew.1.name', 'সুব্রত মাইতি');
const hasDraw = await ctl.locator('[data-bind="draw.items.0.label"]').count();
if (hasDraw) { await type('draw.items.0.label', 'রয়্যাল বেঙ্গল টাইগার'); await go('DRAW'); txt = flat(await tvText(2000)); step(txt.includes('রয়্যাল বেঙ্গল টাইগার'), 'লটারি: কার্ডের নাম বদলালে টিভিতে বদলায়'); await page('event'); await ctl.waitForTimeout(300); await type('draw.items.0.label', 'বাঘ'); }
else step(false, 'লটারি: কার্ডের নাম বদলানোর ঘর পাওয়া যায়নি');

// 7. score correction: Teams & scores → team, value, + Add / − Subtract; then Undo
await ctl.evaluate(() => window.QC.Actions.navLive()); await go('SCOREBOARD', { roundId: 'R1' }); await ctl.waitForTimeout(800);
const id2 = await ctl.evaluate(() => window.QC.Store.state.teams[2].id);
const before = await ctl.evaluate((id) => window.QC.Sel.score(id), id2);
await ctl.selectOption('#adjTeam', id2); await ctl.fill('#adjVal', '7'); await ctl.click('[data-act="adjust"][data-arg="1"]'); await ctl.waitForTimeout(400);
const added = await ctl.evaluate((id) => window.QC.Sel.score(id), id2);
await ctl.selectOption('#adjTeam', id2); await ctl.fill('#adjVal', '2'); await ctl.click('[data-act="adjust"][data-arg="-1"]'); await ctl.waitForTimeout(400);
const sub = await ctl.evaluate((id) => window.QC.Sel.score(id), id2);
step(added === before + 7 && sub === before + 5, 'নম্বর ঠিক করা: + Add ৭, − Subtract ২', before + ' → ' + added + ' → ' + sub);
await ctl.keyboard.press('Control+z'); await ctl.waitForTimeout(400);
const undone = await ctl.evaluate((id) => window.QC.Sel.score(id), id2);
step(undone === before + 7, 'Ctrl+Z: শেষ সংশোধন ফেরানো যায়', String(undone));

// 8. everything above survives a reload (auto-save)
await ctl.waitForTimeout(1500);
await ctl.reload(); await ctl.waitForFunction(() => window.QC && document.querySelector('.dock'));
const kept = await ctl.evaluate(() => { const s = window.QC.Store.state; return [s.teams[0].school, s.teams[0].captain, s.teams[0].players[0], s.event.mainTitle, s.event.brandEn].join(' | '); });
step(kept === 'খেজুরি আদর্শ প্রাথমিক বিদ্যালয় | রিয়া মাইতি | অয়ন মণ্ডল | JUNIOR GENIUS SEASON 4 | QUIZ CORNER', 'সব বদল নিজে থেকে সেভ — আবার খুললেও থাকে', kept);

step(!errs.length, 'কোনো JS ত্রুটি নেই', errs.join(' | '));
console.log(log.join('\n'));
await b.close();
process.exit(log.some((l) => l.startsWith('FAIL')) ? 1 : 0);
