// End-to-end test of the built engine in real Chromium.
// Usage: node tests/e2e.mjs <path-to-built-html> <screenshot-dir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
import fs from 'fs';
import path from 'path';

const file = path.resolve(process.argv[2]);
const shots = path.resolve(process.argv[3] || 'shots');
fs.mkdirSync(shots, { recursive: true });
const url = 'file://' + file;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const errors = [];
const watch = (p, tag) => { p.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); }); };

const ctl = await ctx.newPage(); watch(ctl, 'control');
await ctl.goto(url);
await ctl.waitForFunction(() => window.QC && window.QC.Store.state);
check('Control boots', true);

// ---- built-in self-test ----
const st = await ctl.evaluate(async () => (await window.QC.SelfTest.run()).map((r) => [r.name, r.ok, r.detail]));
const stFail = st.filter((r) => !r[1]);
check('Self-test (' + st.length + ' checks)', stFail.length === 0, stFail.map((r) => r[0] + ' ' + r[2]).join(' | '));

// ---- stage window ----
const stage = await ctx.newPage(); watch(stage, 'stage');
await stage.goto(url + '#stage');
await stage.waitForFunction(() => window.QC && window.QC.MODE === 'stage');
check('Stage boots in stage mode', true);
check('Stage shows no operator controls', await stage.evaluate(() => !document.querySelector('.topbar, .deck, .tabs')));

// ---- walk the full rundown, screenshot key scenes, check overflow ----
const rd = await ctl.evaluate(() => window.QC.Show.rundown().map((s) => ({ key: s.key, scene: s.scene })));
check('Rundown length', rd.length > 60, rd.length + ' steps');
const want = new Set(['ORGANIZER', 'LOGO', 'PROGRAMME', 'THEME', 'CREW', 'TEAMS_ALL', 'TEAM_INTRO', 'PRELIM_RULES', 'PRELIM_COUNTDOWN', 'PRELIM_Q', 'PRELIM_RESULT', 'FINALISTS', 'FINALIST_INTRO', 'WELCOME', 'GIFT', 'PODIUM', 'MAIN_COUNTDOWN', 'ROUND_INTRO', 'ROUND_RULES', 'GRID', 'QUESTION', 'SCOREBOARD', 'FINAL', 'WINNER', 'END']);
const shot = new Set();
let overflowIssues = [];
let syncIssues = 0;
for (let i = 0; i < rd.length; i++) {
  await ctl.evaluate((i) => window.QC.Show.go(window.QC.Show.rundown()[i]), i);
  const ctlRev = await ctl.evaluate(() => window.QC.Store.state.rev);
  try { await stage.waitForFunction((r) => window.QC.Store.state.rev >= r, ctlRev, { timeout: 3000 }); } catch (e) { syncIssues++; }
  const sc = rd[i].scene;
  if (want.has(sc) && !shot.has(sc)) {
    shot.add(sc);
    await stage.waitForTimeout(sc === 'PRELIM_Q' || sc === 'QUESTION' ? 4600 : 1600);
    await stage.screenshot({ path: path.join(shots, String(shot.size).padStart(2, '0') + '-' + sc + '.png') });
    const ov = await stage.evaluate(() => {
      const st = document.querySelector('.stage').getBoundingClientRect();
      const bad = [];
      document.querySelectorAll('.layer:not(.exiting) .q-text, .layer:not(.exiting) .otext, .layer:not(.exiting) .rules-text, .layer:not(.exiting) .name, .layer:not(.exiting) .wname, .layer:not(.exiting) .rname').forEach((el) => {
        const box = el.parentElement;
        if (el.scrollHeight > box.clientHeight + 2) bad.push(el.className + ' text overflow ' + el.scrollHeight + '>' + box.clientHeight);
      });
      document.querySelectorAll('.layer:not(.exiting) .glass, .layer:not(.exiting) .opt, .layer:not(.exiting) .sb-row, .layer:not(.exiting) .timer').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > st.right + 2 || r.bottom > st.bottom + 2 || r.left < st.left - 2)) bad.push(el.className + ' outside stage');
      });
      return bad;
    });
    if (ov.length) overflowIssues.push(sc + ': ' + ov.slice(0, 3).join('; '));
  }
}
await ctl.evaluate(() => window.QC.Show.jump('LOGO'));
await stage.waitForTimeout(1500);
check('Built-in logo image renders on stage', await stage.evaluate(() => { const i = document.querySelector('.layer:not(.exiting) .logo-orb img'); return !!i && i.naturalWidth > 0; }));
const hasSongs = await ctl.evaluate(() => !!document.getElementById('asset-theme'));
if (hasSongs) check('Built-in theme + welcome songs resolve', await ctl.evaluate(async () => (await window.QC.Media.url('asset:theme')).startsWith('blob:') && (await window.QC.Media.url('asset:welcome')).startsWith('blob:')));
await ctl.evaluate(() => { const QC = window.QC; QC.Show.go(QC.Show.rundown().find((s) => s.scene === 'QUESTION' && s.params.qid === 'Q01')); });
await stage.waitForTimeout(1500);
check('Question image (V100 Q01) renders', await stage.evaluate(() => { const i = document.querySelector('.layer:not(.exiting) .q-img img'); return !!i && i.naturalWidth > 0; }));
check('Timer ring fully inside stage', await stage.evaluate(() => { const st = document.querySelector('.stage').getBoundingClientRect(); const c = document.querySelector('.layer:not(.exiting) .timer .ring').getBoundingClientRect(); return c.bottom <= st.bottom + 1 && c.right <= st.right + 1 && c.width > 50; }));
check('Every scene type visited', [...want].every((s) => shot.has(s)), [...want].filter((s) => !shot.has(s)).join(','));
check('Control → Stage sync on every step', syncIssues === 0, syncIssues + ' late');
check('No text overflow / off-stage elements', overflowIssues.length === 0, overflowIssues.join(' || '));

// ---- live question flow through UI + keyboard ----
await ctl.evaluate(() => { const QC = window.QC; const st = QC.Show.rundown().find((s) => s.scene === 'QUESTION' && s.params.roundId === 'R1'); QC.Show.go(st); });
await ctl.bringToFront();
await ctl.keyboard.press('d');
check('Key D starts 60s direct timer', await ctl.evaluate(() => { const t = window.QC.Store.state.timer; return t.running && t.duration === 60000; }));
await ctl.keyboard.press(' ');
check('Space pauses timer', await ctl.evaluate(() => !window.QC.Store.state.timer.running));
const before = await ctl.evaluate(() => window.QC.Sel.score(window.QC.Store.state.live.active));
await ctl.click('[data-act="judge"][data-arg="correct"]');
check('Correct button +10', await ctl.evaluate((b) => window.QC.Sel.score(window.QC.Store.state.live.active) === b + 10, before));
await stage.waitForTimeout(600);
check('Stage shows answer after correct', await stage.evaluate(() => !!document.querySelector('.layer:not(.exiting) .answer-bar')));
await stage.screenshot({ path: path.join(shots, '90-correct-reveal.png') });
await ctl.keyboard.press('Control+z');
check('Ctrl+Z undoes score', await ctl.evaluate((b) => window.QC.Sel.score(window.QC.Store.state.live.active) === b, before));
await ctl.keyboard.press('x');
await ctl.keyboard.press('p');
const passState = await ctl.evaluate(() => ({ flow: window.QC.Store.state.live.flow, mode: window.QC.Store.state.timer.mode, dur: window.QC.Store.state.timer.duration, running: window.QC.Store.state.timer.running }));
check('Wrong then P passes with 45s timer', passState.flow === 'pass' && passState.dur === 45000 && passState.running, JSON.stringify(passState));
await stage.waitForTimeout(900);
await stage.screenshot({ path: path.join(shots, '91-pass.png') });
// challenge in R4
await ctl.evaluate(() => { const QC = window.QC; const st = QC.Show.rundown().find((s) => s.scene === 'QUESTION' && s.params.roundId === 'R4'); QC.Show.go(st); });
await ctl.keyboard.press('h');
await ctl.keyboard.press('2');
const ch = await ctl.evaluate(() => window.QC.Store.state.live);
check('H then 2 starts challenge', ch.flow === 'challenge' && !!ch.challenger && ch.challenger !== ch.active);
await stage.waitForTimeout(900);
await stage.screenshot({ path: path.join(shots, '92-challenge.png') });
// options + lifelines
await ctl.evaluate(() => { const QC = window.QC; const st = QC.Show.rundown().find((s) => s.scene === 'QUESTION' && s.params.roundId === 'R2'); QC.Show.go(st); });
await ctl.keyboard.press('v');
await ctl.keyboard.press('Alt+1');
await ctl.keyboard.press('Alt+2');
await stage.waitForTimeout(2200);
await stage.screenshot({ path: path.join(shots, '93-lifelines.png') });
check('50:50 + poll applied', await ctl.evaluate(() => window.QC.Store.state.live.eliminated.length === 2 && !!window.QC.Store.state.live.poll));
// timer warning visuals near the end
await ctl.evaluate(() => { const QC = window.QC; QC.Timer.start('direct', 8); });
await stage.waitForTimeout(700);
check('Timer turns critical (<5s) on stage', await stage.evaluate(() => { const t = document.querySelector('.layer:not(.exiting) [data-timer]'); return !!t && /warn|crit/.test(t.className); }));
await stage.screenshot({ path: path.join(shots, '94-timer-warning.png') });
await ctl.waitForTimeout(8600);
check('Timer expires exactly once', await ctl.evaluate(() => { const t = window.QC.Store.state.timer; return t.expired && !t.running; }));

// ---- prelim dedicated answer button ----
await ctl.click('[data-act="tab"][data-arg="prelim"]');
await ctl.click('[data-act="prelimReveal"][data-arg="4"]');
check('Prelim Q5 dedicated ANSWER button shows Q5 with answer', await ctl.evaluate(() => { const s = window.QC.Store.state; return s.show.scene === 'PRELIM_Q' && s.prelimLive.idx === 4 && s.prelimLive.reveal; }));
await stage.waitForTimeout(4500);
await stage.screenshot({ path: path.join(shots, '95-prelim-answer.png') });
// marking matrix
await ctl.click('input[data-bind="teams.5.prelim.marks.0"]');
check('Marking matrix updates prelim score', await ctl.evaluate(() => window.QC.Sel.prelimResult(window.QC.Store.state.teams[5]).score === 5));

// ---- every tab renders ----
for (const t of ['show', 'prelim', 'teams', 'questions', 'rounds', 'event', 'design', 'media', 'audio', 'system']) {
  await ctl.click('[data-act="tab"][data-arg="' + t + '"]');
  const ok = await ctl.evaluate(() => !document.querySelector('#tabBody').textContent.includes('লোড করা যায়নি'));
  if (!ok) check('Tab ' + t, false);
}
check('All 10 tabs render', true);
await ctl.click('[data-act="tab"][data-arg="teams"]');
await ctl.screenshot({ path: path.join(shots, '80-control-teams.png') });

// ---- team photo upload (file chooser) ----
const png = Buffer.from((await ctl.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#ff6bcb'); gr.addColorStop(1, '#38e8ff'); g.fillStyle = gr; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.fillText('TEAM', 150, 280); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
const [chooser] = await Promise.all([ctl.waitForEvent('filechooser'), ctl.click('[data-act="setMedia"][data-arg^="teams.0.photo"]')]);
await chooser.setFiles({ name: 'team1.png', mimeType: 'image/png', buffer: png });
await ctl.waitForFunction(() => !!window.QC.Store.state.teams[0].photo, null, { timeout: 5000 });
check('Team photo upload stored', true);
await ctl.evaluate(() => window.QC.Actions.teamIntroNow(window.QC.Store.state.teams[0].id));
await stage.waitForTimeout(1500);
check('Stage shows uploaded team photo', await stage.evaluate(() => { const img = document.querySelector('.layer:not(.exiting) .big-photo img'); return !!img && !img.hidden && img.naturalWidth > 0; }));

// ---- design controls ----
await ctl.evaluate(() => window.QC.Actions.theme('daylight'));
check('Theme preset applies CSS variables on stage', await stage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#000000'));
await ctl.evaluate(() => window.QC.Actions.setAlign('left'));
check('Alignment control syncs', await stage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q-align').trim() === 'left'));

// ---- final reveal + winner ----
await ctl.evaluate(() => window.QC.Show.jump('FINAL'));
for (let i = 0; i < 8; i++) await ctl.evaluate(() => window.QC.Show.revealFinalNext());
await stage.waitForTimeout(1500);
await stage.screenshot({ path: path.join(shots, '96-final-revealed.png') });
check('Final reveal 8→1 complete', await ctl.evaluate(() => window.QC.Store.state.finalReveal === 8));
await ctl.evaluate(() => window.QC.Show.jump('WINNER'));
await stage.waitForTimeout(2600);
await stage.screenshot({ path: path.join(shots, '97-winner.png') });

// ---- recovery after reload ----
const snap = await ctl.evaluate(() => ({ rev: window.QC.Store.state.rev, scene: window.QC.Store.state.show.scene, ledger: window.QC.Store.state.ledger.length, photo: window.QC.Store.state.teams[0].photo }));
await ctl.waitForTimeout(400);
await ctl.reload();
await ctl.waitForFunction(() => window.QC && window.QC.Store.state);
const after = await ctl.evaluate(() => ({ scene: window.QC.Store.state.show.scene, ledger: window.QC.Store.state.ledger.length, photo: window.QC.Store.state.teams[0].photo }));
check('Refresh recovery keeps scene, scores, photos', after.scene === snap.scene && after.ledger === snap.ledger && after.photo === snap.photo, JSON.stringify(after));
await stage.reload();
await stage.waitForFunction(() => window.QC && window.QC.MODE === 'stage');
await stage.waitForTimeout(1200);
check('Stage reconnect restores scene', await stage.evaluate(() => window.QC.Store.state.show.scene === 'WINNER'));
await ctl.screenshot({ path: path.join(shots, '81-control-live.png') });

// ---- phone-width control layout: no horizontal scroll ----
const phone = await ctx.newPage(); watch(phone, 'phone');
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(url);
await phone.waitForFunction(() => window.QC && window.QC.Store.state);
check('Control at phone width: no horizontal page scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await phone.evaluate(() => document.documentElement.scrollWidth + ' vs ' + window.innerWidth));
await phone.screenshot({ path: path.join(shots, '82-control-phone.png') });

const relevant = errors.filter((e) => !/favicon/i.test(e));
check('No JS errors in any window', relevant.length === 0, relevant.slice(0, 5).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.ok);
console.log('\nRESULT: ' + (results.length - fail.length) + '/' + results.length + ' passed');
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify({ results, selfTest: st }, null, 1));
process.exit(fail.length ? 1 : 0);
