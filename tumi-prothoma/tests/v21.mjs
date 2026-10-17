// Tumi Prothoma v21 checks: jump bar, pre-show check, media test, 1-page guide, unplayable-file warning, TV window follows jumps.
// Usage: PW_PATH=… node tests/v21.mjs /abs/path/Tumi_Prothoma_Game_Show.html outdir [good.webm]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const [file, out, good] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
await p.goto('file://' + file); await p.waitForFunction(() => window.DIDI && window.DIDI.S());
await p.waitForTimeout(1500);
const tv = await ctx.newPage(); tv.on('pageerror', (e) => errs.push('TV ' + e.message)); await tv.goto('file://' + file + '#stage'); await tv.waitForTimeout(1500);
ok(await p.locator('#panel .jumpbar button').count() >= 20, 'jump bar has the buttons');
await p.click('#panel .jumpbar [data-v="r3"]'); await p.waitForTimeout(400);
ok(await p.evaluate(() => window.DIDI.S().scene) === 'r3', 'jump to round 3 play');
ok(await p.locator('#panel .jumpbar [data-v="r3"].cur').count() === 1, 'current scene highlighted');
await p.evaluate(() => window.DIDI.A.adj ? 0 : 0);
const before = await p.evaluate(() => JSON.stringify(window.DIDI.standings().map((r) => r.tot)));
await p.click('#panel .jumpbar [data-v="r5s"]'); await p.waitForTimeout(300);
await p.click('#panel .jumpbar [data-v="selTitle"]'); await p.waitForTimeout(300);
ok(await p.evaluate(() => JSON.stringify(window.DIDI.standings().map((r) => r.tot))) === before, 'jumping keeps the scores');
await p.click('#panel .jumpbar [data-v="r2"]'); await p.waitForTimeout(800);
ok(await tv.evaluate(() => window.DIDI.S().scene) === 'r2', 'TV window follows the jump');
await p.screenshot({ path: out + '/jump.png' });
await p.click('[data-a="preCheck"]'); await p.waitForTimeout(300);
ok(await p.locator('#pcov:not([hidden]) .pcl span').count() >= 20, 'pre-show check opens with rows');
await p.click('#pcov [data-a="preMedia"]'); await p.waitForFunction(() => /OK/.test(document.querySelector('#pcov h2').textContent) && !/Testing/.test((document.querySelector('#pcmsg') || {}).textContent || ''), null, { timeout: 120000 });
const txt = await p.locator('#pcov').innerText(); console.log(txt.split('\n').slice(0, 30).join('\n'));
ok(/play|do not play/.test(txt), 'media test result shown');
await p.screenshot({ path: out + '/precheck.png' });
await p.click('#pcov [data-a="preClose"]'); ok(await p.locator('#pcov').isHidden(), 'check closes');
const [gw] = await Promise.all([ctx.waitForEvent('page'), p.evaluate(() => { window.DIDI.A.guidePrint(); })]).catch(() => [null]);
if (gw) { await gw.waitForTimeout(300); const g = await gw.content(); ok(/অপারেটর গাইড/.test(g) && /Round 1/.test(g), 'guide page'); await gw.screenshot({ path: out + '/guide.png', fullPage: true }); await gw.close(); } else ok(false, 'guide page opened');
// an unplayable "video" is flagged when it is added
const bad = { name: 'broken.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('not a video at all') };
await p.click('.tabbtn[data-tab="av"]'); await p.waitForTimeout(400);
const inp = p.locator('input[data-up^="vid:"]').first();
await inp.setInputFiles(bad); await p.waitForTimeout(12000);
ok(/does not play/.test(await p.locator('#toast').textContent()), 'unplayable file warned: ' + (await p.locator('#toast').textContent()));
if (good) { await inp.setInputFiles(good); await p.waitForTimeout(4000); ok(!/does not play/.test(await p.locator('#toast').textContent()), 'good file not warned'); }
ok(!errs.length, 'no page errors ' + errs.join(' | '));
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); await b.close(); process.exit(fails ? 1 : 0);
