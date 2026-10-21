// Day lock, photo tray, folder watch and phone-photo touch-up. Usage: node tests/daylock.mjs <built-html> <screenshot-dir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH);
const url = 'file://' + process.argv[2]; const out = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const errs = []; let fails = 0; const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + d); };
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.goto(url); await p.waitForFunction(() => window.QC && window.QC.Store.state);
const st = await ctx.newPage(); st.on('pageerror', e => errs.push('stage ' + e.message)); await st.goto(url + '#stage'); await st.waitForTimeout(1500);
// a "phone photo": 4000x3000, dim and yellow, made from a built-in crew photo
await p.evaluate(async () => {
  const u = await QC.Media.url('asset:crew0'); const im = new Image(); im.src = u; await im.decode();
  const mk = async (w, h, dark, name) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#3a3020'; x.fillRect(0, 0, w, h); const s = h / im.height; x.drawImage(im, (w - im.width * s) / 2, 0, im.width * s, h); x.fillStyle = 'rgba(60,40,0,' + dark + ')'; x.fillRect(0, 0, w, h); const bl = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); return new File([bl], name, { type: 'image/jpeg', lastModified: Date.now() }); };
  window.__ph = [await mk(4000, 3000, 0.55, 'IMG_001.jpg'), await mk(3000, 4000, 0.3, 'IMG_002.jpg'), await mk(1200, 1600, 0.2, 'IMG_003.jpg')];
  const lum = async (blob) => { const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(bm, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let s = 0, rb = 0; for (let i = 0; i < d.length; i += 4) { s += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; rb += d[i] - d[i + 2]; } return [s / 4096, rb / 4096, bm.width, bm.height]; };
  window.__lum = lum;
});
await p.evaluate(() => QC.Actions.navTeams()); await p.waitForTimeout(400);
ok('tray + lock button shown', await p.evaluate(() => !!document.querySelector('.tray') && !!document.querySelector('[data-act=teamLock]')));
// direct file → touch-up
const fx = await p.evaluate(async () => { const before = await __lum(__ph[0]); const id = await QC.Actions.memPhotoFile('teams.0.captainPhoto', __ph[0]); const rec = await QC.Media.getRecord(id); const after = await __lum(rec.blob); return { before, after, id, saved: QC.Store.state.teams[0].captainPhoto === id, info: QC.PhotoFix.last }; });
ok('phone photo → 1080x1440 portrait', fx.after[2] === 1080 && fx.after[3] === 1440, JSON.stringify(fx.after));
ok('brighter', fx.after[0] > fx.before[0] + 15, fx.before[0].toFixed(1) + ' → ' + fx.after[0].toFixed(1));
ok('yellow cast corrected (blue up, red down)', fx.info.gain[2] > 1 && fx.info.gain[0] < 1, JSON.stringify(fx.info.gain));
ok('saved in slot', fx.saved);
// tray: click photo, click circle
await p.evaluate(() => QC.Tray.add(__ph.slice(1))); await p.waitForTimeout(300);
ok('tray shows 2', await p.evaluate(() => document.querySelectorAll('.tray-it').length) === 2);
await p.locator('#tabBody .tray-it').first().click(); await p.waitForTimeout(200);
ok('armed + circles pulse', await p.evaluate(() => !!document.querySelector('.tray-it.armed') && !!document.querySelector('.mthumb.wants')));
await p.locator('#tabBody [data-act=memPhoto][data-arg="teams.1.captainPhoto"]').click(); await p.waitForFunction(() => !!QC.Store.state.teams[1].captainPhoto, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(300);
ok('tray photo → B member 1', await p.evaluate(() => !!QC.Store.state.teams[1].captainPhoto));
// drag second tray photo onto B member 2 (close to the tray, so nothing scrolls during the drag)
await p.locator('#tabBody .tray-it:not(.used)').first().dragTo(p.locator('#tabBody [data-arg="teams.1.playerPhotos.0"][data-act=memPhoto]')); const dragOk = await p.waitForFunction(() => !!QC.Store.state.teams[1].playerPhotos[0], null, { timeout: 8000 }).then(() => true).catch(() => false);
ok('drag tray → B member 2', dragOk, await p.evaluate(() => JSON.stringify({ armed: QC.Tray.armed, used: QC.Tray.items.map(x => x.used) })));
ok('used marks', await p.evaluate(() => document.querySelectorAll('.tray-it.used').length) === 2);
// folder watch with a fake folder
await p.evaluate(() => { window.__dir = []; const fh = (f) => ({ kind: 'file', name: f.name, getFile: async () => f }); window.showDirectoryPicker = async () => ({ name: 'QuizPhotos', async *values() { for (const f of window.__dir) yield fh(f); } }); });
await p.evaluate(() => QC.Actions.tab('teams')); await p.waitForTimeout(300);
await p.locator('#tabBody [data-act=trayWatch]').click(); await p.waitForTimeout(500);
ok('watching pill', await p.evaluate(() => /Watching: QuizPhotos/.test(document.querySelector('.tray').innerText)));
await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 300; c.height = 400; c.getContext('2d').fillRect(0,0,300,400); const bl = await new Promise(r => c.toBlob(r, 'image/jpeg')); window.__dir.push(new File([bl], 'IMG_NEW.jpg', { type: 'image/jpeg', lastModified: Date.now() + 5 })); });
await p.waitForTimeout(3200);
ok('new photo in folder appears in tray', await p.evaluate(() => QC.Tray.items.some(x => x.file.name === 'IMG_NEW.jpg') && !!document.querySelector('.tray-it[title^="IMG_NEW"]')));
// school + name, then lock
await p.locator('#tabBody .mt-school').first().fill('আদর্শ বিদ্যাপীঠ'); await p.locator('#tabBody .mt-school').first().press('Tab');
await p.locator('#tabBody .mslot input[type=text]').first().fill('রিয়া সেন'); await p.locator('#tabBody .mslot input[type=text]').first().press('Tab');
await p.waitForTimeout(300);
await p.locator('#tabBody [data-act=teamLock]').click(); await p.waitForTimeout(400);
const L = await p.evaluate(() => ({ on: QC.TeamLock.on(), dis: document.querySelectorAll('.mt-school[disabled]').length, cams: document.querySelectorAll('[data-act=memCam]').length, tray: !!document.querySelector('.tray'), fs: document.querySelectorAll('fieldset.lockset[disabled]').length }));
ok('locked: inputs disabled, no camera/tray', L.on && L.dis >= 8 && L.cams === 0 && !L.tray && L.fs === 8, JSON.stringify(L));
const snap = await p.evaluate(() => JSON.stringify(QC.Store.state.teams.map(t => [t.id, t.school, t.captain, t.players[0], t.captainPhoto, t.playerPhotos[0], t.color])));
const tries = await p.evaluate(async () => {
  const S = QC.Store; const r = {};
  r.photo = await QC.Actions.memPhotoFile('teams.0.captainPhoto', __ph[2]);
  S.commit('x', s => { s.teams[0].school = 'ভুল'; s.teams[1].captain = 'ভুল'; s.teams[2].playerPhotos[0] = ''; });
  r.undo = S.undo(); S.undo(); S.undo();
  const raw = JSON.parse(JSON.stringify(S.state)); raw.teams.reverse(); raw.teams[0].school = 'ইমপোর্ট'; S.replace(raw, 'import');
  r.del = await QC.Media.remove(S.state.teams[0].captainPhoto);
  QC.Actions.teamDel(S.state.teams[0].id); QC.Actions.teamMove(S.state.teams[0].id + '|1'); QC.Actions.clearMedia('teams.0.captainPhoto');
  S.commit('score', s => { s.teams[0].gift.item = 'আম'; });
  S.commit('crew', s => { s.crew[0].name = 'নতুন নাম'; });
  r.crew = S.state.crew[0].name; r.gift = S.state.teams[0].gift.item;
  return r;
});
const snap2 = await p.evaluate(() => JSON.stringify(QC.Store.state.teams.map(t => [t.id, t.school, t.captain, t.players[0], t.captainPhoto, t.playerPhotos[0], t.color])));
ok('nothing about the teams changed (edit, undo, import, delete, move)', snap === snap2, snap2.slice(0, 200));
ok('locked photo file not deletable', tries.del === false);
ok('crew page still editable', tries.crew === 'নতুন নাম');
ok('other team fields (gift) editable', tries.gift === 'আম');
// typing into a locked input via bind is refused
await p.evaluate(() => { const i = document.createElement('input'); i.dataset.bind = 'teams.0.school'; i.value = 'হ্যাক'; document.querySelector('#tabBody').appendChild(i); i.dispatchEvent(new Event('change', { bubbles: true })); });
ok('bound input refused', await p.evaluate(() => QC.Store.state.teams[0].school) === 'আদর্শ বিদ্যাপীঠ');
// reload keeps the lock
await p.reload(); await p.waitForFunction(() => window.QC && window.QC.Store.state);
ok('lock survives reload', await p.evaluate(() => QC.TeamLock.on()));
// next day
await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('qc66.teamlock')); v.day = '2026-10-12x'; localStorage.setItem('qc66.teamlock', JSON.stringify(v)); });
ok('next day: unlocked by itself', await p.evaluate(() => !QC.TeamLock.on() && (QC.Store.commit('e', s => { s.teams[0].school = 'পরের দিন'; }), QC.Store.state.teams[0].school === 'পরের দিন')));
await p.evaluate(() => QC.Store.commit('e', s => { s.teams[0].school = 'আদর্শ বিদ্যাপীঠ'; }));
// auto-lock at main countdown; manual unlock stops it for the day
await p.evaluate(() => { localStorage.removeItem('qc66.teamlock'); localStorage.removeItem('qc66.teamlock.off'); QC.TeamLock.auto(); });
ok('auto-lock when the show starts', await p.evaluate(() => QC.TeamLock.on()));
await p.evaluate(() => QC.Actions.teamUnlock()); await p.evaluate(() => QC.TeamLock.auto());
ok('after manual unlock no auto re-lock today', await p.evaluate(() => !QC.TeamLock.on()));
// TV: team intro of team A
await p.evaluate(() => QC.Store.commit('t', s => { s.show.scene = 'TEAM_INTRO'; s.show.params = { teamId: s.teams[0].id, n: 1, of: 8, sub: 2 }; }));
await st.waitForTimeout(3500); await st.screenshot({ path: out + '/lk-intro.png' });
await p.evaluate(() => QC.Store.commit('t', s => { s.show.scene = 'TEAMS_ALL'; s.show.params = {}; }));
await st.waitForTimeout(3000); await st.screenshot({ path: out + '/lk-all.png' });
await p.evaluate(() => QC.Actions.tab('teams')); await p.waitForTimeout(500);
await p.screenshot({ path: out + '/lk-panel.png' });
ok('no page errors', errs.length === 0, errs.join(' | '));
console.log(fails ? 'FAILS ' + fails : 'ALL OK');
await b.close();
