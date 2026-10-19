// Question audio / video: the audio-video page, full-screen first, then the question. Usage: node tests/clips.mjs <built-html> <shot-dir> R1-3.webm R2-4.mp3
// (make the two clips with: ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=25 -f lavfi -i sine -t 4 R1-3.webm ; ffmpeg -f lavfi -i sine=frequency=660 -t 10 R2-4.mp3)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out, ...clips] = process.argv.slice(2);
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
// the audio / video page, from the Home card; many files at once by name
await p.evaluate(() => window.QC.Actions.clipPage('R1'));
ok('page opens', await p.evaluate(() => !!document.querySelector('#clipPage .clip-row')));
await p.screenshot({ path: out + '/clip-page.png' });
await p.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'tin'; document.body.appendChild(i); });
await p.setInputFiles('#tin', clips);
await p.evaluate(() => window.QC.Actions.qMediaBulkFiles(Array.from(document.getElementById('tin').files), true));
await p.waitForFunction(() => { const Q = window.QC; return Q.Sel.roundQuestions('R1').find((q) => q.number === 3).clip && Q.Sel.roundQuestions('R2').find((q) => q.number === 4).clip; }, null, { timeout: 15000 }).catch(() => {});
const set = await p.evaluate(() => { const Q = window.QC; return { v: Q.Sel.clipKind(Q.Sel.roundQuestions('R1').find((q) => q.number === 3)), a: Q.Sel.clipKind(Q.Sel.roundQuestions('R2').find((q) => q.number === 4)), voice: Q.Sel.roundQuestions('R2').find((q) => q.number === 4).voiceQ }; });
ok('R1-3.webm → video clip, R2-4.mp3 → audio clip (not a reading)', set.v === 'video' && set.a === 'audio' && !set.voice, JSON.stringify(set));
await p.keyboard.press('Escape');
// video question: full screen first, plays by itself, then the question when it ends
await p.evaluate(() => { const Q = window.QC; const q = Q.Sel.roundQuestions('R1').find((x) => x.number === 3); Q.Show.jump('QUESTION', { key: q.id, roundId: 'R1', qid: q.id }); });
await stage.waitForTimeout(1800);
const v1 = await stage.evaluate(() => { const v = document.querySelector('.layer:not(.exiting) .q-clipfull video'); return { full: !!v, playing: !!v && !v.paused && v.currentTime > 0, strip: !!document.querySelector('.layer:not(.exiting) .sstrip'), card: !!document.querySelector('.layer:not(.exiting) .q-wrap'), logo: !document.querySelector('.corner-logo').hidden }; });
ok('video full screen, playing by itself, scores underneath, no question card, no logo', v1.full && v1.playing && v1.strip && !v1.card && !v1.logo, JSON.stringify(v1));
await stage.waitForTimeout(900); await stage.screenshot({ path: out + '/clip-video.png' });
await stage.waitForTimeout(3300);
const v2 = await p.evaluate(() => ({ done: window.QC.Store.state.live.clipDone, alone: window.QC.Sel.qAlone(), clip: window.QC.Store.state.live.clip.action }));
ok('when the video ends: the question comes by itself (full screen), video stopped', v2.done && v2.alone && v2.clip === 'stop', JSON.stringify(v2));
await stage.waitForTimeout(1500);
const v3 = await stage.evaluate(() => ({ card: !!document.querySelector('.layer:not(.exiting) .q-wrap.alone'), full: !!document.querySelector('.layer:not(.exiting) .q-clipfull') }));
ok('question alone on the TV after the video', v3.card && !v3.full, JSON.stringify(v3));
await stage.screenshot({ path: out + '/clip-after.png' });
await p.evaluate(() => window.QC.Actions.next());
ok('Next: team photo and timer', await p.evaluate(() => window.QC.Store.state.live.panel === true));
// audio question: big sound picture, Next skips to the question, the music goes on
await p.evaluate(() => { const Q = window.QC; const q = Q.Sel.roundQuestions('R2').find((x) => x.number === 4); Q.Show.jump('QUESTION', { key: q.id, roundId: 'R2', qid: q.id }); });
await stage.waitForTimeout(1500);
const a1 = await stage.evaluate(() => ({ vis: !!document.querySelector('.layer:not(.exiting) .q-clipfull.audio .cf-eq'), playing: (() => { const a = document.querySelector('.layer:not(.exiting) audio[data-clip]'); return !!a && !a.paused; })() }));
ok('audio: full-screen sound picture, playing', a1.vis && a1.playing, JSON.stringify(a1));
await stage.screenshot({ path: out + '/clip-audio.png' });
await p.evaluate(() => window.QC.Actions.next());
await stage.waitForTimeout(900);
const a2 = await stage.evaluate(() => ({ q: !!document.querySelector('.layer:not(.exiting) .q-wrap.alone'), playing: (() => { const a = document.querySelector('.layer:not(.exiting) audio[data-clip]'); return !!a && !a.paused; })() }));
ok('Next during audio: the question comes, the music keeps playing', a2.q && a2.playing, JSON.stringify(a2));
ok('no page errors', !errs.length, errs.join(' / '));
console.log(res.join('\n')); console.log(res.some((r) => r.startsWith('FAIL')) ? 'FAILS' : 'ALL OK');
await b.close();
