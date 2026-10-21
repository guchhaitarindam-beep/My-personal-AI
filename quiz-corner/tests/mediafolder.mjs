// Audio / video straight from the QuizCorner_Media folder next to the quiz file.
// Usage: copy the built html into a folder with QuizCorner_Media/R1-3.webm (≈6 s, 1920×1080) and QuizCorner_Media/R2-4.mp3 (≈12 s), then
//        node tests/mediafolder.mjs <that copy of the html> <shot-dir>   (Chromium here has no H.264, so the test uses webm; Chrome / Edge play mp4)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const res = []; const ok = (n, v, d = '') => res.push((v ? 'PASS ' : 'FAIL ') + n + (d ? ' ' + d : ''));
await p.goto('file://' + file); await p.waitForFunction(() => window.QC && window.QC.Store.state);
await p.evaluate(() => window.QC.Store.commit('test-pass-round', (s) => window.QC.SelfTest.addPassRound(s))); // the show has no round 2 any more: the pass-round checks use the built-in test round
await p.mouse.click(400, 300);
const [stage] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('o')]);
stage.on('pageerror', (e) => errs.push('stage ' + e.message));
await stage.setViewportSize({ width: 1920, height: 1080 }); await stage.waitForTimeout(1200);
await p.evaluate(() => window.QC.Actions.clipPage('R1'));
const path = await p.evaluate(() => document.getElementById('clipFolder').textContent);
ok('the folder path is shown', /QuizCorner_Media$/.test(path) && path.includes('Quiz Corner'), path);
await p.screenshot({ path: out + '/mf-page.png' });
const t0 = Date.now(); await p.evaluate(() => document.querySelectorAll('#clipPage details').forEach((d) => { d.open = true; })); // the folder scan is under 'More ways'
await p.click('[data-act="clipScan"]');
await p.waitForFunction(() => /linked|No R1/.test((document.getElementById('clipScanOut') || {}).textContent || ''), null, { timeout: 120000 });
const sc = await p.evaluate(() => ({ txt: document.getElementById('clipScanOut').textContent, v: window.QC.Sel.roundQuestions('R1').find((q) => q.number === 3).clip, a: window.QC.Sel.roundQuestions('R2').find((q) => q.number === 4).clip }));
ok('Find the files: R1-3.webm and R2-4.mp3 linked from the folder (' + Math.round((Date.now() - t0) / 1000) + ' s for every question)', sc.v === 'file:R1-3.webm' && sc.a === 'file:R2-4.mp3', JSON.stringify(sc));
await p.screenshot({ path: out + '/mf-found.png' });
// not in the folder → says where to put it, offers copying in
await p.evaluate(() => window.QC.ClipUI ? 0 : 0);
await p.keyboard.press('Escape');
await p.evaluate(() => { const Q = window.QC; const q = Q.Sel.roundQuestions('R1').find((x) => x.number === 3); Q.Show.jump('QUESTION', { key: q.id, roundId: 'R1', qid: q.id }); });
await stage.waitForTimeout(2600);
const v1 = await stage.evaluate(() => { const v = document.querySelector('.layer:not(.exiting) .q-clipfull video'); return { src: v && v.currentSrc, w: v && v.videoWidth, playing: !!v && !v.paused && v.currentTime > 0 }; });
ok('plays the laptop file itself, full screen, 1920×1080', v1.playing && /^file:.*QuizCorner_Media\/R1-3\.webm$/.test(v1.src) && v1.w === 1920, JSON.stringify(v1));
await stage.screenshot({ path: out + '/mf-video.png' });
await stage.waitForTimeout(5500);
ok('after the video: the question by itself', await p.evaluate(() => window.QC.Store.state.live.clipDone && window.QC.Sel.qAlone()));
await p.evaluate(() => { window.QC.Actions.next(); window.QC.Game.judge('correct'); window.QC.Game.reveal(); });
await stage.waitForTimeout(1500);
ok('then the answer as usual', await stage.evaluate(() => !!document.querySelector('.layer:not(.exiting) .q-pic.is-answer, .layer:not(.exiting) .answer-bar')));
await p.evaluate(() => { const Q = window.QC; const q = Q.Sel.roundQuestions('R2').find((x) => x.number === 4); Q.Show.jump('QUESTION', { key: q.id, roundId: 'R2', qid: q.id }); });
await stage.waitForTimeout(2000);
const au = await stage.evaluate(() => { const a = document.querySelector('.layer:not(.exiting) audio[data-clip]'); return { has: !!a, paused: a && a.paused, src: a && a.currentSrc, err: a && a.error && a.error.code }; });
ok('audio from the folder plays', au.has && !au.paused && /QuizCorner_Media\/R2-4\.mp3$/.test(au.src), JSON.stringify(au));
ok('no page errors', !errs.length, errs.join(' / '));
console.log(res.join('\n')); console.log(res.some((r) => r.startsWith('FAIL')) ? 'FAILS' : 'ALL OK');
await b.close();
