// Usage: node tests/walkthrough.mjs <built-html> <screenshot-dir> <a-photo.jpg>  (Playwright; PW_PATH = playwright module path)
// Operator walkthrough: the whole show as a person would run it, keyboard first.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out, photo] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
const errs = []; const log = []; const step = (ok, name, info = '') => { log.push((ok ? 'OK   ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
const ctl = await ctx.newPage(); ctl.on('pageerror', (e) => errs.push('control: ' + e.message)); ctl.on('console', (m) => { if (m.type() === 'error') errs.push('control console: ' + m.text()); });
await ctl.goto('file://' + file); await ctl.waitForFunction(() => window.QC);
// record which sounds play (the operator would hear these)
await ctl.evaluate(() => { window.__cues = []; const A = window.QC.AudioDirector; const orig = A.playCue.bind(A); A.playCue = (n, o) => { window.__cues.push(n); return orig(n, o); }; });
const cues = async () => ctl.evaluate(() => { const c = window.__cues.slice(); window.__cues.length = 0; return c; });
await ctl.mouse.click(400, 300);
// 1. open the stage window with O, like the operator
const [stage] = await Promise.all([ctx.waitForEvent('page'), ctl.keyboard.press('o')]);
stage.on('pageerror', (e) => errs.push('stage: ' + e.message));
await stage.setViewportSize({ width: 1920, height: 1080 }); await stage.waitForTimeout(1500);
step(stage.url().endsWith('#stage'), 'O খোলে স্টেজ উইন্ডো');
const scene = () => ctl.evaluate(() => window.QC.Store.state.show.scene);
const shot = (n) => stage.screenshot({ path: out + '/' + n + '.png' });
const next = async (ms = 900) => { await ctl.keyboard.press('ArrowRight'); await stage.waitForTimeout(ms); return scene(); };
const logoVisible = () => stage.evaluate(() => !document.querySelector('.corner-logo').hidden);
// 2. opening: organiser banner → … → finalists
let sc = await scene(); step(sc === 'ORGANIZER', 'শুরু: আয়োজক ব্যানার', sc); await shot('01-organizer');
const seen = [sc]; let guard = 0;
while (sc !== 'FINALIST_INTRO' && guard++ < 60) { sc = await next(sc === 'PRELIM_COUNTDOWN' ? 5200 : 700); if (seen[seen.length - 1] !== sc) seen.push(sc); }
step(true, 'ক্রম', seen.join(' → '));
// mark preliminary scores so the finalists have numbers and schools
await ctl.evaluate(() => { const QC = window.QC; QC.Store.commit('walk-setup', (s) => { s.teams.forEach((t, i) => { t.school = ['উত্তর কলমদান প্রাথমিক বিদ্যালয়', 'টিকাশী প্রাথমিক বিদ্যালয়', 'খেজুরি বালিকা বিদ্যালয়', 'কলমদান শিশু শিক্ষা কেন্দ্র', 'হেঁড়িয়া প্রাথমিক বিদ্যালয়', 'জনকা প্রাথমিক বিদ্যালয়', 'বীরবন্দর প্রাথমিক বিদ্যালয়', 'বাঁশগোড়া প্রাথমিক বিদ্যালয়'][i]; t.prelim.manual = 70 - i * 5; }); }); });
await stage.waitForTimeout(1200); await shot('02-finalist-call');
const fin = await stage.evaluate(() => document.querySelector('.layer:not(.exiting)').innerText);
step(/FINALIST/.test(fin) && /৭০/.test(fin) && /বিদ্যালয়/.test(fin), 'মঞ্চে আহ্বান: দলের নম্বর, স্কুল ও বাছাইয়ের নম্বর', fin.replace(/\s+/g, ' ').slice(0, 120));
while (sc !== 'WELCOME' && guard++ < 90) sc = await next(500);
step(sc === 'WELCOME', 'স্বাগত সংগীত'); await stage.waitForTimeout(1200); await shot('03-welcome');
sc = await next(4500); step(sc === 'DRAW', 'পোডিয়াম লটারি (স্বাগতের পরেই)', sc); await stage.waitForTimeout(1200); await shot('03b-draw');
for (const k of ['3', '1', '8', '2', '6', '4', '7', '5']) { await ctl.keyboard.press(k); await ctl.waitForTimeout(200); await ctl.keyboard.press(k); await ctl.waitForTimeout(400); }
await stage.waitForTimeout(2000); await shot('03c-draw-done');
const dr = await ctl.evaluate(() => { const { Store, Sel } = window.QC; return { n: Store.state.draw.picks.length, ok: Store.state.draw.picks.every((p) => Sel.teamIndex(p.team) === p.podium), first: Sel.code(Sel.team(Store.state.draw.picks[0].team)), school: Sel.team(Store.state.draw.picks[0].team).school }; });
step(dr.n === 8 && dr.ok && dr.school === 'উত্তর কলমদান প্রাথমিক বিদ্যালয়', 'লটারি: বাছাইয়ে প্রথম দল প্রথমে বাছে, ৮ দল ৮ পোডিয়ামে, কোড = পোডিয়াম', JSON.stringify(dr));
sc = await next(1500); step(sc === 'IDENTITY', 'আমাদের পরিচয়', sc); await shot('04-identity');
sc = await next(1500); step(sc === 'CREW', 'আমাদের টিম', sc);
await stage.waitForTimeout(2800 * 5); const crewSub = await ctl.evaluate(() => window.QC.Store.state.show.params.sub); step(crewSub >= await ctl.evaluate(() => window.QC.Sel.crew().length), 'আমাদের টিমের কার্ড নিজে নিজে একে একে আসে', 'দেখা গেল ' + crewSub + 'টি'); await shot('05-crew');
sc = await next(1200); step(sc === 'TEAMS_ALL', 'সব দল', sc);
sc = await next(1500); step(sc === 'TEAM_INTRO', 'দল পরিচিতি শুরু', sc);
// 3. add the two member photos of team A / 1 from the live panel (click → file), as at the venue
const slot = ctl.locator('.mthumb').first();
const [fc] = await Promise.all([ctl.waitForEvent('filechooser'), slot.click()]); await fc.setFiles(photo);
await ctl.waitForTimeout(1500);
const [fc2] = await Promise.all([ctl.waitForEvent('filechooser'), ctl.locator('.mthumb').nth(1).click()]); await fc2.setFiles(photo);
await ctl.waitForTimeout(1500);
await ctl.locator('.mslot input').first().fill('রিয়া মাইতি'); await ctl.locator('.mslot input').first().press('Tab');
await ctl.locator('.mslot input').nth(1).fill('সোহম দাস'); await ctl.locator('.mslot input').nth(1).press('Tab');
await stage.waitForTimeout(800);
sc = await next(1500); sc = await next(1500); await shot('06-team-intro-members');
const mem = await stage.evaluate(() => ({ cards: document.querySelectorAll('.layer:not(.exiting) .mem-card:not(.hidden)').length, imgs: Array.from(document.querySelectorAll('.layer:not(.exiting) .mem-card img')).filter((i) => i.complete && i.naturalWidth).length }));
step(mem.cards === 2 && mem.imgs === 2, 'দল A / 1: সদস্য ১ ও ২ ছবিসহ একে একে', JSON.stringify(mem));
while (sc !== 'MAIN_COUNTDOWN' && guard++ < 160) sc = await next(450);
step(sc === 'MAIN_COUNTDOWN', 'মূল পর্বের কাউন্টডাউন'); const cd0 = (await cues()).filter((c) => c === 'countdown'); await stage.waitForTimeout(1600); await shot('07-countdown'); await stage.waitForTimeout(11500); // 10, 9 … 1, then GO! (no zero)
const cdc = cd0.concat(await cues()); step(cdc.filter((c) => c === 'countdown').length === 10 && cdc.includes('impact'), 'Countdown sounds: 10 … 1 beeps, then GO! (impact)', cdc.join(','));
// 4. round 1
sc = await next(2600); step(sc === 'ROUND_INTRO', 'রাউন্ড ১ শুরু', sc); await shot('08-round-intro');
sc = await next(4500); step(sc === 'ROUND_RULES', 'রাউন্ড ১-এর নিয়ম', sc); await shot('09-rules');
sc = await next(1500); step(sc === 'GRID', 'প্রশ্ন বোর্ড', sc); await shot('10-grid');
await cues(); await ctl.keyboard.press('5'); await stage.waitForTimeout(3000);
let st = await ctl.evaluate(() => { const s = window.QC.Store.state; const q = window.QC.Sel.question(s.live.qid); return { scene: s.show.scene, n: q && q.number, team: window.QC.Sel.code(window.QC.Sel.team(s.live.active)) }; });
step(st.scene === 'QUESTION' && st.n === 5, 'বোর্ডে ৫ টিপলে প্রশ্ন ৫', JSON.stringify(st));
let c = await cues(); step(c.includes('question'), 'প্রশ্ন আসার সাউন্ড', c.join(','));
await ctl.keyboard.press('d'); await stage.waitForTimeout(1500); await shot('11-question-direct');
const corner = await stage.evaluate(() => document.querySelector('.layer:not(.exiting) .q-side').innerText.replace(/\s+/g, ' '));
step(/TEAM A \/ 1/.test(corner) && /পয়েন্ট/.test(corner), 'কোণে উত্তরদাতা দল: ছবি, TEAM A / 1, স্কোর', corner.slice(0, 80));
await ctl.keyboard.press('v'); await stage.waitForTimeout(1200); c = await cues(); step(c.includes('option'), '৪ বিকল্প দেখানোর সাউন্ড', c.join(',')); await shot('12-four-options');
const ans = await ctl.evaluate(() => window.QC.Sel.liveQuestion().answer);
const wrongKey = 'abcd'[[0, 1, 2, 3].find((i) => i !== ans)];
let before = await ctl.evaluate(() => window.QC.Sel.score(window.QC.Store.state.live.active));
await ctl.keyboard.press('Shift+' + wrongKey.toUpperCase()); await stage.waitForTimeout(1400); c = await cues(); await shot('13-option-wrong');
st = await ctl.evaluate(() => ({ r: window.QC.Store.state.live.result, sc: window.QC.Sel.score(window.QC.Store.state.live.active) }));
step(st.r === 'wrong' && st.sc === before && c.includes('wrong'), 'ভুল বিকল্প: ভুলের সাউন্ড, নম্বর ০', JSON.stringify(st) + ' ' + c.join(','));
await ctl.keyboard.press('p'); await stage.waitForTimeout(1500); await shot('14-pass');
st = await ctl.evaluate(() => { const s = window.QC.Store.state; return { flow: s.live.flow, team: window.QC.Sel.code(window.QC.Sel.team(s.live.active)), t: s.timer.duration, run: s.timer.running }; });
step(st.flow === 'pass' && st.t === 45000 && st.run, 'P: পরের দলে পাস, ৪৫ সেকেন্ড চালু', JSON.stringify(st));
const pcard = await stage.evaluate(() => document.querySelector('.layer:not(.exiting) .q-side').innerText.replace(/\s+/g, ' '));
step(pcard.includes('PASS TO') && pcard.includes('TEAM ' + st.team), 'পাস হলে নতুন দলের ছবি, কোড ও স্কোর কোণে', pcard.slice(0, 80));
before = await ctl.evaluate(() => window.QC.Sel.score(window.QC.Store.state.live.active));
await ctl.keyboard.press('Shift+' + 'abcd'[ans].toUpperCase()); await stage.waitForTimeout(2200); c = await cues(); await shot('15-pass-correct');
st = await ctl.evaluate(() => ({ r: window.QC.Store.state.live.result, sc: window.QC.Sel.score(window.QC.Store.state.live.active), rev: window.QC.Store.state.live.revealed }));
step(st.r === 'correct' && st.sc === before + 5 && c.includes('correct') && c.includes('applause') && st.rev, 'পাসে সঠিক বিকল্প: +৫, সঠিকের সাউন্ড ও হাততালি, উত্তর প্রকাশ', JSON.stringify(st) + ' ' + c.join(','));
// next question by the board: B / 2's turn, direct answer
await ctl.keyboard.press('Escape'); await ctl.keyboard.press('ArrowRight'); await stage.waitForTimeout(1500);
st = await ctl.evaluate(() => { const s = window.QC.Store.state; return { scene: s.show.scene, turn: window.QC.Sel.code(window.QC.Sel.team(window.QC.Game.turnFor('R1'))) }; });
step(st.scene === 'GRID' && st.turn === 'B / 2', '→ after the answer: back to the board, B / 2 chooses next', JSON.stringify(st)); await shot('15b-board-next-team');
await ctl.keyboard.press('5'); await stage.waitForTimeout(800);
step(await ctl.evaluate(() => window.QC.Store.state.show.scene === 'GRID'), 'Played number 5 does not open again');
await ctl.keyboard.press('0'); await stage.waitForTimeout(2500);
st = await ctl.evaluate(() => { const s = window.QC.Store.state; return { n: window.QC.Sel.question(s.live.qid).number, team: window.QC.Sel.code(window.QC.Sel.team(s.live.active)) }; });
step(st.n === 10, 'বোর্ডে ০ টিপলে প্রশ্ন ১০; পালা পরের দলের', JSON.stringify(st));
before = await ctl.evaluate(() => window.QC.Sel.score(window.QC.Store.state.live.active));
await ctl.keyboard.press('c'); await stage.waitForTimeout(2000); c = await cues(); await shot('16-direct-correct');
st = await ctl.evaluate(() => ({ sc: window.QC.Sel.score(window.QC.Store.state.live.active) }));
step(st.sc === before + 10 && c.includes('applause'), 'সরাসরি সঠিক: +১০ ও হাততালি', JSON.stringify(st) + ' ' + c.join(','));
const strip = await stage.evaluate(() => document.querySelectorAll('.layer:not(.exiting) .scell').length);
step(strip === 8, 'নিচে ৮ দলের স্কোরের পট্টি', String(strip));
// two options
await ctl.evaluate(() => window.QC.Actions.gotoGrid()); await stage.waitForTimeout(1200); await ctl.keyboard.press('3'); await stage.waitForTimeout(2500);
await ctl.keyboard.press('Shift+V'); await stage.waitForTimeout(1200); await shot('17-two-options');
st = await ctl.evaluate(() => ({ elim: window.QC.Store.state.live.eliminated.length, pts: window.QC.Game.pointsFor('correct') }));
step(st.elim === 2 && st.pts === 3, 'Shift+V: দুই বিকল্পে নামে, মান ৩', JSON.stringify(st));
// last ten seconds
await ctl.evaluate(() => window.QC.Timer.start('direct', 9)); await stage.waitForTimeout(1200);
const l10 = await stage.evaluate(() => document.querySelector('.stage').classList.contains('last10')); step(l10, 'শেষ ১০ সেকেন্ডে লাল আভা'); await shot('18-last10');
// 5. round 3 challenge
await ctl.evaluate(() => { const QC = window.QC; QC.Show.go(QC.Show.rundown().find((x) => x.scene === 'GRID' && x.params.roundId === 'R3')); }); await stage.waitForTimeout(1500);
await ctl.keyboard.press('2'); await stage.waitForTimeout(2500);
await ctl.keyboard.press('x'); await stage.waitForTimeout(600);
const act = await ctl.evaluate(() => window.QC.Store.state.live.active);
const chId = await ctl.evaluate((a) => window.QC.Sel.finalistIds().find((x) => x !== a), act);
const chKey = await ctl.evaluate((id) => String(window.QC.Sel.teamIndex(id) + 1), chId);
await ctl.keyboard.press(chKey); await stage.waitForTimeout(1500); await shot('19-r3-challenge');
const vs = await stage.evaluate(() => document.querySelector('.layer:not(.exiting) .q-side').innerText.replace(/\s+/g, ' '));
step(vs.includes('CHALLENGE') && vs.includes('VS'), 'রাউন্ড ৩: নম্বর টিপলে চ্যালেঞ্জার VS উত্তরদাতা', vs.slice(0, 100));
before = await ctl.evaluate((id) => window.QC.Sel.score(id), chId);
await ctl.evaluate((id) => window.QC.Actions.judgeHand(id + '|1'), chId); await stage.waitForTimeout(2000); c = await cues(); await shot('20-r3-challenge-right');
const after = await ctl.evaluate((id) => window.QC.Sel.score(id), chId);
step(after === before + 10 && c.includes('applause'), 'চ্যালেঞ্জে সঠিক: +১০ ও হাততালি', before + '→' + after + ' ' + c.join(','));
// 6. ending
await ctl.keyboard.press('s'); await stage.waitForTimeout(2500); step(await scene() === 'SCOREBOARD', 'S: স্কোরবোর্ড'); await shot('21-scoreboard');
for (const sc2 of ['FINAL', 'TOP3', 'WINNER', 'END']) { await ctl.evaluate((x) => window.QC.Show.jump(x), sc2); await stage.waitForTimeout(sc2 === 'FINAL' ? 1500 : 3000); if (sc2 === 'FINAL') { for (let i = 0; i < 8; i++) { await ctl.keyboard.press('r'); await stage.waitForTimeout(300); } await stage.waitForTimeout(1500); } await shot('22-' + sc2.toLowerCase()); step(await logoVisible(), sc2 + ' পর্দা, কোণে লোগো'); }
step(errs.length === 0, 'কোনো উইন্ডোতে কোনো গোলমাল (JS error) নেই', errs.slice(0, 4).join(' | '));
fs.writeFileSync(out + '/walk.txt', log.join('\n')); console.log(log.join('\n'));
await b.close();
