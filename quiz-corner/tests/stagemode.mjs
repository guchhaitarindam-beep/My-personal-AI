// The TV window stays the stage when it reloads without #stage. Usage: node tests/stagemode.mjs <built-html>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext(); const u = 'file://' + process.argv[2]; let fails = 0;
const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + d); };
const c = await ctx.newPage(); await c.goto(u); await c.waitForFunction(() => window.QC && window.QC.Store.state);
ok('control is control', await c.evaluate(() => window.QC.MODE) === 'control');
const s = await ctx.newPage(); await s.goto(u + '#stage'); await s.waitForFunction(() => window.QC);
ok('stage is stage', await s.evaluate(() => window.QC.MODE) === 'stage');
await s.goto(u); await s.waitForFunction(() => window.QC); // same window, address without #stage
ok('stage reloaded WITHOUT #stage stays stage', await s.evaluate(() => window.QC.MODE === 'stage' && /#stage/.test(location.href) && document.title.includes('STAGE')), await s.evaluate(() => window.QC.MODE + ' ' + location.hash));
await s.reload(); await s.waitForFunction(() => window.QC);
ok('stage after F5 still stage', await s.evaluate(() => window.QC.MODE) === 'stage');
await c.reload(); await c.waitForFunction(() => window.QC && window.QC.Store.state);
ok('control after F5 still control', await c.evaluate(() => window.QC.MODE) === 'control');
// O key: control opens the stage window
const [pop] = await Promise.all([ctx.waitForEvent('page'), c.evaluate(() => window.QC.Sync.openStage())]);
await pop.waitForFunction(() => window.QC);
ok('stage opened from control (O) is stage', await pop.evaluate(() => window.QC.MODE) === 'stage');
await pop.goto(u); await pop.waitForFunction(() => window.QC);
ok('that stage, address lost, still stage', await pop.evaluate(() => window.QC.MODE) === 'stage');
const c2 = await ctx.newPage(); await c2.goto(u); await c2.waitForFunction(() => window.QC);
ok('a new plain window is control', await c2.evaluate(() => window.QC.MODE) === 'control');
console.log(fails ? 'FAILS ' + fails : 'ALL OK'); await b.close();
