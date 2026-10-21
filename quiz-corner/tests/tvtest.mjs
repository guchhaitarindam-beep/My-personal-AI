// Pre-show: 📺 Test every clip on the TV — each clip plays on the TV, the TV reports back, the show returns to where it was.
// Usage: node tests/tvtest.mjs <built-html> <audio file>
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [, , file, audio] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + file); await p.waitForFunction(() => window.QC && window.QC.Store.state);
const [stage] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('o')]);
await stage.waitForFunction(() => window.QC && window.QC.MODE === 'stage'); await stage.waitForTimeout(2500);
const log = []; const ok = (c, m, d = '') => log.push((c ? 'OK   ' : 'FAIL ') + m + (d ? ' — ' + d : ''));
// a round-3 question with an audio clip too (copied in)
await p.evaluate(async (b64) => { const Q = window.QC; const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const f = new File([bin], 'test.mp3', { type: 'audio/mpeg' }); const id = await Q.Media.add(f, 'audio'); Q.Store.commit('t', (s) => { s.prelim.onStage = true; Q.Sel.roundQuestions('R3')[0].clip = id; }); }, fs.readFileSync(audio).toString('base64'));
await p.evaluate(() => { const Q = window.QC; Q.Show.go(Q.Show.rundown().find((x) => x.scene === 'TEAMS_ALL')); });
const before = await p.evaluate(() => window.QC.Store.state.show.scene);
await p.evaluate(() => window.QC.Actions.tab('preshow')).catch(() => {});
await p.evaluate(() => window.QC.Actions.preshowTv());
const after = await p.evaluate(() => ({ scene: window.QC.Store.state.show.scene, tv: window.QC.PreShow ? window.QC.PreShow.tv : null }));
ok(after.scene === before, 'After the test the show is back where it was', before + ' → ' + after.scene);
const tv = await p.evaluate(() => JSON.stringify(window.__pre = (window.QC.PreShow || {}).tv || {}));
const rows = await p.evaluate(() => Array.from(document.querySelectorAll('#tabBody .li, #tabBody li')).map((e) => e.innerText.replace(/\s+/g, ' ')).filter((t) => /On the TV/.test(t)));
ok(rows.some((r) => /Selection 15: plays with sound/.test(r)), 'The song (selection 15) played on the TV with sound', rows.join(' | ').slice(0, 300));
ok(rows.some((r) => /বুদ্ধির টক্কর 1: plays with sound/.test(r)), 'A round-3 audio clip played on the TV with sound');
ok(rows.some((r) => /Selection 8:/.test(r)), 'The video (selection 8) was tried on the TV and is listed', (rows.find((r) => /Selection 8/.test(r)) || '').slice(0, 160));
ok(!errs.length, 'No JS errors', errs.join(' | '));
console.log(log.join('\n')); console.log(log.some((l) => l.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL OK');
await b.close();
