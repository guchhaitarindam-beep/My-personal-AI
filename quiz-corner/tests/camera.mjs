// Laptop camera (fake device). Usage: node tests/camera.mjs <built-html> <screenshot-dir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const url = 'file://' + process.argv[2]; const out = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, permissions: ['camera'] });
const errs = []; const ok = (n, c, d='') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + d);
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForFunction(() => window.QC && window.QC.Store.state);
const st = await ctx.newPage(); await st.goto(url + '#stage'); await st.waitForTimeout(1500);
await p.evaluate(() => QC.Actions.navTeams ? QC.Actions.navTeams() : QC.Actions.tab('teams')); await p.waitForTimeout(500);
const n = await p.evaluate(() => ({ sch: document.querySelectorAll('.mt-school').length, cam: document.querySelectorAll('[data-act=memCam]').length, teams: QC.Store.state.teams.length }));
ok('panel on teams page', n.sch === n.teams && n.cam === n.teams * 2, JSON.stringify(n));
await p.screenshot({ path: out + '/cam-teams.png' });
// type school + name
const sch = p.locator('.mt-school').first(); await sch.fill('নতুন বিদ্যালয় পরীক্ষা'); await sch.press('Tab');
const nm = p.locator('.mslot input[type=text]').first(); await nm.fill('নতুন নাম'); await nm.press('Tab');
await p.waitForTimeout(400);
const s1 = await p.evaluate(() => ({ school: QC.Store.state.teams[0].school, n: JSON.stringify(QC.Store.state.teams[0]).includes('নতুন নাম') }));
ok('school + name saved', s1.school === 'নতুন বিদ্যালয় পরীক্ষা' && s1.n, JSON.stringify(s1));
// camera
await p.locator('[data-act=memCam]').first().click();
await p.waitForFunction(() => { const v = document.querySelector('#camVideo'); return v && v.videoWidth > 0; }, null, { timeout: 8000 }).then(() => ok('camera preview', true)).catch(() => ok('camera preview', false));
await p.screenshot({ path: out + '/cam-modal.png' });
await p.locator('[data-act=camSnap]').first().click(); await p.waitForTimeout(3000);
const shot = await p.evaluate(() => { const c = document.querySelector('#camShot'); return c && !c.hidden ? [c.width, c.height] : null; });
ok('3-2-1 shot portrait', shot && shot[0] < shot[1], JSON.stringify(shot));
await p.locator('[data-act=camUse]').click(); await p.waitForFunction(() => !!QC.Store.state.teams[0].captainPhoto && !document.querySelector('.modal-back'), null, { timeout: 15000 }).catch(() => {}); // the photo touch-up takes a moment
const r = await p.evaluate(() => ({ id: QC.Store.state.teams[0].captainPhoto, modal: !!document.querySelector('.modal-back'), live: (() => { const v = document.querySelector('#camVideo'); return !!v; })() }));
ok('photo saved in slot, modal closed', r.id && !r.modal, JSON.stringify(r));
const thumb = await p.evaluate(() => !!document.querySelector('.mthumb.has img'));
ok('thumb shows', thumb);
// TV shows it
await p.evaluate(() => QC.Actions.scene ? QC.Actions.scene('TEAMS_ALL') : null).catch(()=>{});
await p.evaluate(() => QC.Store.commit('t', s => { s.show.scene = 'TEAMS_ALL'; }));
await st.waitForTimeout(2500);
const tv = await st.evaluate(() => ({ txt: document.body.innerText.includes('নতুন বিদ্যালয় পরীক্ষা'), imgs: document.querySelectorAll('#stage img, img').length }));
ok('TV shows school', tv.txt, JSON.stringify(tv));
await st.screenshot({ path: out + '/cam-tv.png' });
// second modal open/close stops stream
await p.evaluate(() => { window.__stops = 0; const o = MediaStreamTrack.prototype.stop; MediaStreamTrack.prototype.stop = function(){ window.__stops++; return o.call(this); }; });
await p.locator('[data-act=memCam]').nth(1).click(); await p.waitForTimeout(1500);
await p.evaluate(() => QC.UI.closeModal()); await p.waitForTimeout(400);
const live = await p.evaluate(() => window.__stops);
ok('stream stopped on close', live >= 1, String(live));
ok('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
