// Adding audio / video from anywhere: one button, the selection round on the same page, 📺 Play on TV.
// Usage: node tests/clipadd.mjs <built-html> <video file> <audio file>   (files outside the QuizCorner_Media folder)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [, , file, video, audio] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + file); await p.waitForFunction(() => window.QC && window.QC.Store.state);
const [stage] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('o')]);
await stage.waitForFunction(() => window.QC && window.QC.MODE === 'stage'); await stage.waitForTimeout(1500);
const log = []; const ok = (c, m, d = '') => log.push((c ? 'OK   ' : 'FAIL ') + m + (d ? ' — ' + d : ''));
await p.evaluate(() => window.QC.Actions.clipPage());
await p.waitForSelector('#clipPage');
// the selection round has its own tab
await p.click('[data-act="clipRound"][data-arg="PRELIM"]'); await p.waitForTimeout(300);
const rows = await p.locator('#clipPage .clip-row').count();
ok(rows === 15, 'Selection round tab lists its 15 questions', String(rows));
const built = await p.locator('#clipPage .clip-row').nth(7).innerText();
ok(/built into the quiz/.test(built), 'Question 8: the cricket video shows as built into the quiz', built.replace(/\s+/g, ' ').slice(0, 90));
// one button: a file from anywhere is taken (copied in whole), no second step
const pid = await p.evaluate(() => window.QC.Store.state.prelim.questions[0].id);
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(`[data-act="clipAny"][data-arg="${pid}"]`)]); await fc.setFiles(video);
await p.waitForFunction((id) => /^m/.test(window.QC.Store.state.prelim.questions.find((q) => q.id === id).clip || ''), pid, { timeout: 15000 }).catch(() => {});
const c1 = await p.evaluate((id) => window.QC.Store.state.prelim.questions.find((q) => q.id === id).clip, pid);
ok(/^m/.test(c1 || ''), 'Selection Q1: ＋ Add audio / video takes a file from anywhere (kept in the engine)', c1);
// a main-round question gets an audio file the same way
await p.click('[data-act="clipRound"][data-arg="R1"]'); await p.waitForTimeout(300);
const qid = await p.evaluate(() => window.QC.Sel.roundQuestions('R1')[1].id);
const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click(`[data-act="clipAny"][data-arg="${qid}"]`)]); await fc2.setFiles(audio);
await p.waitForFunction((id) => /^m/.test(window.QC.Sel.question(id).clip || ''), qid, { timeout: 15000 }).catch(() => {});
ok(/^m/.test(await p.evaluate((id) => window.QC.Sel.question(id).clip, qid) || ''), 'Round 1 Q2: audio added with the same button');
// 📺 Play on TV: the selection question with its video, playing full screen
await p.click('[data-act="clipRound"][data-arg="PRELIM"]'); await p.waitForTimeout(300);
await p.evaluate(() => window.QC.Store.commit('t', (s) => { s.prelim.onStage = true; }));
await p.click(`[data-act="clipTv"][data-arg="${pid}"]`); await stage.waitForTimeout(3500);
const tv = await stage.evaluate(() => { const e = document.querySelector('.layer:not(.exiting) [data-clip]'); return { scene: window.QC.Store.state.show.scene, idx: window.QC.Store.state.prelimLive.idx, tag: e && e.tagName, playing: !!(e && !e.paused && e.currentTime > 0.3) }; });
ok(tv.scene === 'PRELIM_Q' && tv.idx === 0 && tv.tag === 'VIDEO' && tv.playing, '📺 Play on TV: the video plays full screen on the TV', JSON.stringify(tv));
// the clip survives a reload (kept on this laptop)
await p.reload(); await p.waitForFunction(() => window.QC && window.QC.Store.state);
const u = await p.evaluate(async (id) => { const c = window.QC.Store.state.prelim.questions.find((q) => q.id === id).clip; const x = await window.QC.Media.url(c); return !!x; }, pid);
ok(u, 'After closing and opening again, the added clip is still there');
ok(!errs.length, 'No JS errors', errs.join(' | '));
console.log(log.join('\n')); console.log(log.some((l) => l.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL OK');
await b.close();
