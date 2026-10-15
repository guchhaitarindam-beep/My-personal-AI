// Rapid-fire (buzzer) round played by keyboard. Usage: node tests/rapid.mjs <built-html> <screenshot-dir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const u = 'file://' + process.argv[2]; const out = process.argv[3];
let fails = 0; const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + d); };
const errs = [];
const c = await ctx.newPage(); c.on('pageerror', (e) => errs.push(e.message)); await c.goto(u); await c.waitForFunction(() => window.QC && window.QC.Store.state);
const s = await ctx.newPage(); s.on('pageerror', (e) => errs.push('stage ' + e.message)); await s.goto(u + '#stage'); await s.waitForTimeout(1500);
const st = () => c.evaluate(() => { const QC = window.QC; const S = QC.Store.state; const q = QC.Sel.liveQuestion(); return { scene: S.show.scene, n: q && q.number, rid: S.live.roundId, active: S.live.active ? QC.Sel.code(QC.Sel.team(S.live.active)) : '', audience: S.live.audience, rev: S.live.revealed, closed: S.live.closed, elim: S.live.eliminated.length }; });
const score = (code) => c.evaluate((code) => { const QC = window.QC; const t = QC.Store.state.teams.find((x) => QC.Sel.code(x) === code); return QC.Sel.score(t.id); }, code);
ok('rundown: rapid round has no board, 20 questions in order', await c.evaluate(() => { const rd = window.QC.Show.rundown(); return !rd.some((x) => x.scene === 'GRID' && x.params.roundId === 'R5') && rd.filter((x) => x.scene === 'QUESTION' && x.params.roundId === 'R5').length === 20; }));
await c.evaluate(() => { const QC = window.QC; QC.Show.go(QC.Show.rundown().find((x) => x.scene === 'ROUND_INTRO' && x.params.roundId === 'R5')); });
await c.bringToFront(); await c.waitForTimeout(600);
await c.keyboard.press('ArrowRight'); await c.waitForTimeout(500); // rules
await c.keyboard.press('ArrowRight'); await c.waitForTimeout(1200); // question 1
let x = await st(); ok('Next after rules → question 1 directly, nobody answering yet, both options', x.scene === 'QUESTION' && x.n === 1 && !x.active && !x.audience && x.elim === 0, JSON.stringify(x));
await s.waitForTimeout(1500); await s.screenshot({ path: out + '/rapid-q1.png' });
const c3 = await score('C / 3');
await c.keyboard.press('3'); await c.waitForTimeout(300);
x = await st(); ok('C / 3 buzzes first: key 3 makes it the answering team', x.active === 'C / 3', JSON.stringify(x));
await c.keyboard.press('c'); await c.waitForTimeout(500);
x = await st(); ok('correct: +5, answer shown', (await score('C / 3')) === c3 + 5 && x.rev, JSON.stringify(x));
await s.waitForTimeout(800); await s.screenshot({ path: out + '/rapid-q1-correct.png' });
await c.keyboard.press('ArrowRight'); await c.waitForTimeout(900);
x = await st(); ok('Next → question 2 (not a board)', x.scene === 'QUESTION' && x.n === 2 && !x.active, JSON.stringify(x));
const e5 = await score('E / 5');
await c.keyboard.press('5'); await c.keyboard.press('x'); await c.waitForTimeout(500);
x = await st(); ok('wrong: −5, question over, answer shown', (await score('E / 5')) === e5 - 5 && x.closed && x.rev, JSON.stringify(x));
// play on to question 12: never an audience question
for (let n = 3; n <= 12; n++) { await c.keyboard.press('ArrowRight'); await c.waitForTimeout(400); await c.keyboard.press(String(((n - 1) % 8) + 1)); await c.keyboard.press('c'); await c.waitForTimeout(200); }
x = await st(); ok('question 12: still a team can score (no audience question after 8)', x.n === 12 && !x.audience && x.rev && x.active, JSON.stringify(x));
for (let n = 13; n <= 20; n++) { await c.keyboard.press('ArrowRight'); await c.waitForTimeout(300); }
x = await st(); ok('question 20 reached in order', x.n === 20, JSON.stringify(x));
await c.keyboard.press('ArrowRight'); await c.waitForTimeout(700);
x = await st(); ok('after question 20 → the round scoreboard', x.scene === 'SCOREBOARD', JSON.stringify(x));
ok('no page errors', errs.length === 0, errs.join(' | '));
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await b.close();
