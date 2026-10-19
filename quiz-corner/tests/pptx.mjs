// PowerPoint import of real decks, through the real buttons. Usage: node tests/pptx.mjs <built-html> <screenshot-dir> 1ST_ROUND.pptx 2ND_ROUND.pptx 3RD_ROUND.pptx
// (the decks of the 1 Sep 2026 show: 10 questions each; round 1 and 3 picture questions, round 2 four options)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out, ...decks] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + file); await p.waitForFunction(() => window.QC && window.QC.Store.state);
await p.evaluate(() => window.QC.Store.commit('test-pass-round', (s) => window.QC.SelfTest.addPassRound(s))); // the show has no round 2 any more: the pass-round checks use the built-in test round
await p.mouse.click(400, 300);
const [stage] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('o')]);
await stage.setViewportSize({ width: 1920, height: 1080 });
await p.evaluate(() => { window.QC.Actions.tab('questions'); window.QC.Actions.pptxOpen(); const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'tin'; document.body.appendChild(i); });
await p.setInputFiles('#tin', decks);
await p.evaluate(() => window.QC.PptxUI.load(Array.from(document.getElementById('tin').files)));
await p.waitForSelector('[data-act="pptxApply"]', { timeout: 120000 });
await p.screenshot({ path: out + '/pptx-preview.png' });
const t0 = Date.now(); await p.click('[data-act="pptxApply"]');
await p.waitForFunction(() => !document.querySelector('[data-act="pptxApply"]'), null, { timeout: 300000 });
console.log('apply took', Math.round((Date.now() - t0) / 1000), 's');
const st = await p.evaluate(async () => { const Q = window.QC; const r = {}; for (const rid of ['R1', 'R2', 'R3']) { const qs = Q.Sel.roundQuestions(rid); r[rid] = { n: qs.length, nums: qs.map((q) => q.number).join(','), pic: qs.filter((q) => q.picOnly).length, ansImg: qs.filter((q) => q.answerImage).length, ansTxt: qs.filter((q) => q.answerText).length, opts: qs.filter((q) => q.options.filter(Boolean).length === 4).length, imgOk: (await Promise.all(qs.filter((q) => q.image).map((q) => Q.Media.url(q.image)))).every((u) => /^blob:/.test(u)) }; } return r; });
console.log(JSON.stringify(st));
const ok = st.R1.n === 10 && st.R1.pic === 10 && st.R1.ansImg === 10 && st.R2.n === 10 && st.R2.opts === 10 && st.R3.n === 10 && st.R3.pic === 10 && st.R3.ansImg + st.R3.ansTxt === 10 && st.R1.imgOk && st.R3.imgOk;
console.log(ok ? "PASS decks imported" : "FAIL decks imported");
for (const [rid, n] of [['R1', 1], ['R1', 2], ['R2', 3], ['R3', 6]]) {
  await p.evaluate(([rid, n]) => { const Q = window.QC; const q = Q.Sel.roundQuestions(rid).find((x) => x.number === n); Q.Show.jump('QUESTION', { key: q.id, roundId: rid, qid: q.id }); }, [rid, n]);
  await stage.waitForTimeout(2500); await stage.screenshot({ path: `${out}/imp-${rid}-${n}.png` });
  await p.evaluate(() => { window.QC.Actions.next(); window.QC.Game.judge('correct'); window.QC.Game.reveal(); }); await stage.waitForTimeout(2200);
  await stage.screenshot({ path: `${out}/imp-${rid}-${n}-ans.png` });
}
console.log(errs.length ? "FAIL page errors " + errs.join(" / ") : "PASS no page errors"); await b.close();
