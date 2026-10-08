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
// The prelim questions are off by default (the day starts from the prelim results); switch them on here so every scene is still exercised.
await ctl.evaluate(() => window.QC.Store.commit('test-prelim-on', (s) => { s.prelim.onStage = true; }));
const rd = await ctl.evaluate(() => window.QC.Show.rundown().map((s) => ({ key: s.key, scene: s.scene })));
check('Rundown length', rd.length > 60, rd.length + ' steps');
const want = new Set(['ORGANIZER', 'LOGO', 'PROGRAMME', 'THEME', 'CREW', 'TEAMS_ALL', 'TEAM_INTRO', 'PRELIM_RULES', 'PRELIM_COUNTDOWN', 'PRELIM_Q', 'PRELIM_RESULT', 'FINALISTS', 'FINALIST_INTRO', 'WELCOME', 'DRAW', 'IDENTITY', 'PODIUM', 'MAIN_COUNTDOWN', 'ROUND_INTRO', 'ROUND_RULES', 'GRID', 'QUESTION', 'SCOREBOARD', 'FINAL', 'TOP3', 'WINNER', 'END', 'OVERVIEW']);
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
    // let one-shot entrance animations (e.g. scale(1.2) row reveals) settle before measuring
    await stage.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); }).map((a) => a.finished.catch(() => 0))), new Promise((r) => setTimeout(r, 5000))]));
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
check('Coach card guides the operator', await ctl.evaluate(() => /answer/i.test((document.querySelector('.coach-t') || {}).textContent || '')));
check('Action announced for screen readers', await ctl.evaluate(() => /সঠিক/.test(document.querySelector('#announce').textContent)));
check('Coach makes the right buttons glow', await ctl.evaluate(() => document.querySelectorAll('#live .btn.glow').length > 0));
await ctl.keyboard.press('Control+z');
check('Ctrl+Z undoes score', await ctl.evaluate((b) => window.QC.Sel.score(window.QC.Store.state.live.active) === b, before));
await ctl.keyboard.press('x');
await ctl.keyboard.press('p');
const passState = await ctl.evaluate(() => ({ flow: window.QC.Store.state.live.flow, mode: window.QC.Store.state.timer.mode, dur: window.QC.Store.state.timer.duration, running: window.QC.Store.state.timer.running }));
check('Wrong then P passes with 45s timer', passState.flow === 'pass' && passState.dur === 45000 && passState.running, JSON.stringify(passState));
await stage.waitForTimeout(900);
await stage.screenshot({ path: path.join(shots, '91-pass.png') });
// challenge in R4
const chKey = await ctl.evaluate(() => { const QC = window.QC; QC.Store.commit('test-enable-r4', (s) => { QC.Sel.round('R4').enabled = true; }); const st = QC.Show.rundown().find((s) => s.scene === 'QUESTION' && s.params.roundId === 'R4'); QC.Show.go(st); const act = QC.Store.state.live.active; const id = QC.Sel.finalistIds().find((x) => x !== act); return String(QC.Sel.teamIndex(id) + 1); });
await ctl.keyboard.press('h');
await ctl.keyboard.press(chKey);
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
const openPage = (k) => ctl.evaluate((k) => window.QC.Actions.tab(k), k);
await openPage('');
check('Settings home lists Android-style rows', await ctl.evaluate(() => document.querySelectorAll('.set-row').length >= 15));
await ctl.click('.set-row[data-arg="prelim"]');
check('Settings page has back button', await ctl.evaluate(() => !!document.querySelector('[data-act="tabHome"]')));
await ctl.click('[data-act="prelimReveal"][data-arg="4"]');
check('Prelim Q5 dedicated ANSWER button shows Q5 with answer', await ctl.evaluate(() => { const s = window.QC.Store.state; return s.show.scene === 'PRELIM_Q' && s.prelimLive.idx === 4 && s.prelimLive.reveal; }));
await stage.waitForTimeout(4500);
await stage.screenshot({ path: path.join(shots, '95-prelim-answer.png') });
// marking matrix
await ctl.click('input[data-bind="teams.5.prelim.marks.0"]');
check('Marking matrix updates prelim score', await ctl.evaluate(() => window.QC.Sel.prelimResult(window.QC.Store.state.teams[5]).score === 5));

// ---- every tab renders ----
for (const t of ['show', 'prelim', 'teams', 'questions', 'rounds', 'scores', 'ai', 'event', 'text', 'colors', 'effects', 'scenes', 'media', 'audio', 'voice', 'backup', 'flow', 'tests', 'help']) {
  await openPage(t);
  const ok = await ctl.evaluate(() => !/লোড করা যায়নি|could not be loaded|couldn't load|could not load/i.test(document.querySelector('#tabBody').textContent));
  if (!ok) check('Tab ' + t, false);
}
check('All settings pages render', true);
// Office-style toolbar: bold/italic/underline/align/size apply to the stage
await openPage('text');
await ctl.click('[data-act="textEl"][data-arg="question"]');
await ctl.click('[data-act="textToggle"][data-arg="italic"]');
await ctl.click('[data-act="textToggle"][data-arg="underline"]');
await ctl.click('[data-act="textAlign"][data-arg="right"]');
await ctl.click('[data-act="textSize"][data-arg="0.05"]');
await stage.waitForTimeout(300);
check('Office toolbar: italic/underline/right/size reach the stage', await stage.evaluate(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--q-style').trim() === 'italic' && cs.getPropertyValue('--q-decor').trim() === 'underline' && cs.getPropertyValue('--q-align').trim() === 'right' && cs.getPropertyValue('--q-scale').trim() === '1.05'; }));
await ctl.click('[data-act="textReset"]');
await openPage('colors');
await ctl.evaluate(() => window.QC.Store.commit('t', (s) => { s.design.colors.text = '#ffee00'; s.design.colors.bg = '#101010'; s.design.box.width = 0.6; }));
await stage.waitForTimeout(300);
check('Text/background colour and border width are editable', await stage.evaluate(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--text').trim() === '#ffee00' && cs.getPropertyValue('--bg').trim() === '#101010' && cs.getPropertyValue('--box-w').trim() === '0.6'; }));
await ctl.evaluate(() => window.QC.Actions.theme('broadcast'));
await openPage('teams');
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
await ctl.evaluate(() => { const k = ['qc66.state.A', 'qc66.state.B'].map((x) => [x, JSON.parse(localStorage.getItem(x))]).sort((p, q) => q[1].seq - p[1].seq)[0][0]; localStorage.setItem(k + '.bak', localStorage.getItem(k)); });
await ctl.reload();
await ctl.waitForFunction(() => window.QC && window.QC.Store.state);
const after = await ctl.evaluate(() => ({ scene: window.QC.Store.state.show.scene, ledger: window.QC.Store.state.ledger.length, photo: window.QC.Store.state.teams[0].photo }));
await ctl.evaluate(() => { const ks = ['qc66.state.A', 'qc66.state.B'].map((x) => [x, JSON.parse(localStorage.getItem(x))]).sort((p, q) => q[1].seq - p[1].seq); const env = ks[0][1]; env.body = env.body.slice(0, -40) + 'garbage'; localStorage.setItem(ks[0][0], JSON.stringify(env)); });
const ctl2 = await ctx.newPage(); watch(ctl2, 'control2');
await ctl2.goto(url); await ctl2.waitForFunction(() => window.QC && window.QC.Store.state);
check('Damaged save slot is ignored; older good slot restores the show', await ctl2.evaluate(() => window.QC.Store.damaged === true && window.QC.Store.state.teams.length > 0));
await ctl2.close();
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

// ---- audio: V100 sound library + generative music ----
const audio = await ctl.evaluate(async () => {
  const QC = window.QC;
  const rms = (b) => { if (!b) return 0; const d = b.getChannelData(0); let t = 0; for (let i = 0; i < d.length; i++) t += d[i] * d[i]; return Math.sqrt(t / d.length); };
  const names = QC.Sfx.names();
  const lib = ['applause', 'drumroll', 'gong', 'ding', 'suspense', 'siren', 'laser', 'heartbeat', 'buzzer', 'score', 'option', 'click', 'cdhit', 'rin1', 'rin6', 'rq1', 'rq6'].every((n) => names.includes(n));
  const applause = rms(await QC.Sfx.render('applause'));
  const music = await QC.Music.render('calm', 2);
  let m = 0; for (let i = 0; i < music.l.length; i++) m += music.l[i] * music.l[i];
  const st = QC.Store.state;
  const q = QC.Sel.roundQuestions('R1')[0];
  QC.Show.jump('QUESTION', { key: q.id, roundId: 'R1', qid: q.id });
  const focus = QC.SoundDirector.moodFor(QC.Store.state) === 'focus';
  const tagore = QC.SoundDirector.tagoreWanted(QC.Store.state);
  return { lib, applause, music: Math.sqrt(m / music.l.length), focus, tagore };
});
check('V100 sound library present (applause, drumroll, gong, rin1–6, rq1–6 …)', audio.lib);
check('Built-in applause renders audible sound', audio.applause > 0.001, String(audio.applause));
check('Generative background music renders', audio.music > 0.001, String(audio.music));
check('Music mood follows scene; Tagore plays in round 1', audio.focus && audio.tagore);
// ---- V100 tools: import, auditor, certificates, legacy backup ----
const tools = await ctl.evaluate(async () => {
  const QC = window.QC; const out = {};
  const rounds = QC.Store.state.rounds.map((r) => ({ id: r.id, name: r.name, label: r.label }));
  const csv = 'রাউন্ড,প্রশ্ন,বিকল্প ক,বিকল্প খ,বিকল্প গ,বিকল্প ঘ,উত্তর\n2,ভারতের জাতীয় পশু কী?,সিংহ,বাঘ,হাতি,ময়ূর,খ\n3,গঙ্গা কোথায় মিশেছে?,বঙ্গোপসাগর,আরব সাগর,ভারত মহাসাগর,প্রশান্ত মহাসাগর,1';
  const r1 = await QC.NexusImport.preview({ text: csv, defaultRound: 'R1', rounds, legacy: () => [] });
  out.csv = r1.list.length === 2 && r1.list[0].roundId === 'R2' && r1.list[0].answer === 1 && r1.list[1].answer === 0;
  const plain = '1. সুন্দরবন কোন রাজ্যে?\nক) পশ্চিমবঙ্গ\nখ) বিহার\nগ) ওড়িশা\nঘ) অসম\nউত্তর: ক';
  const r2 = await QC.NexusImport.preview({ text: plain, defaultRound: 'R1', rounds, legacy: () => [] });
  out.plain = r2.list.length === 1 && r2.list[0].answer === 0;
  const ai = '```json\n[{"question":"2+2?","options":["3","4","5","6"],"answer_index":1}]\n```';
  const r3 = await QC.NexusImport.preview({ text: ai, defaultRound: 'R4', rounds, legacy: () => [] });
  out.ai = r3.list.length === 1 && r3.list[0].answer === 1 && r3.list[0].roundId === 'R4';
  const enc = new TextEncoder();
  const sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>question</t></is></c><c r="B1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>b</t></is></c><c r="D1" t="inlineStr"><is><t>answer</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>পৃথিবীর উপগ্রহ?</t></is></c><c r="B2" t="inlineStr"><is><t>চাঁদ</t></is></c><c r="C2" t="inlineStr"><is><t>সূর্য</t></is></c><c r="D2" t="inlineStr"><is><t>A</t></is></c></row></sheetData></worksheet>';
  const zip = QC.zipStore([{ name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }]);
  const file = new File([zip], 'q.xlsx');
  const r4 = await QC.NexusImport.preview({ file, defaultRound: 'R1', rounds, legacy: () => [] });
  out.xlsx = r4.list.length === 1 && r4.list[0].options[1] === 'সূর্য';
  const au = QC.NLP.audit('অামাদের বিদ্যালয়');
  out.audit = au.issues.some((i) => i.rule === 'a-aa') && QC.NLP.fixAll('অামাদের') === 'আমাদের';
  const t = QC.Store.state.teams[0];
  const png = await QC.renderCertificate(t, 1);
  out.cert = png.size > 20000 && png.type === 'image/png';
  const backup = { format: 'QC60-BACKUP', state: { schema: 60, teams: [{ name: 'পুরনো দল', captain: 'রাহুল', players: ['সীমা'], score: 25 }, { name: 'দল B', players: [], score: 10 }], questions: [{ id: 'Q1', round: 'R2', num: 1, text: 'পুরনো প্রশ্ন?', options: ['ক', 'খ', 'গ', 'ঘ'], optionCount: 4, answer: 2, timeLimit: 30 }], prelim: [{ text: 'বাছাই?', answer: 'হ্যাঁ', star: true }], event: { name: 'পুরনো অনুষ্ঠান', banner: 'লাইন এক' }, crew: [{ name: 'অরিন্দম', role: 'অধিনায়ক', about: 'পরিচিতি' }], rounds: [{ id: 'R1', name: 'নতুন নাম', skip: false }], ledger: [] }, photos: {} };
  backup.checksum = undefined;
  const conv = await QC.Legacy.convert(backup);
  out.legacy = conv.teams[0].name === 'পুরনো দল' && conv.questions[0].answer === 2 && conv.questions[0].roundId === 'R2' && conv.ledger.find((e) => e.team === conv.teams[0].id).delta === 25 && conv.event.programme === 'পুরনো অনুষ্ঠান' && conv.crew[0].about === 'পরিচিতি' && conv.rounds[0].name === 'নতুন নাম';
  return out;
});
check('Import: Bengali-header CSV with ক–ঘ / 1–4 answers', tools.csv);
check('Import: numbered plain text (প্রশ্ন / ক) / উত্তর:)', tools.plain);
check('Import: AI JSON with code fences and answer_index', tools.ai);
check('Import: Excel .xlsx', tools.xlsx);
check('Text auditor finds and fixes অা → আ', tools.audit);
check('Certificate PNG renders', tools.cert);
check('Old V100 (QC60) backup converts: teams, scores, questions, crew, rounds', tools.legacy);
await openPage('ai');
check('AI Studio page renders (air-gapped by default)', await ctl.evaluate(() => /Air-gapped/.test(document.querySelector('#tabBody').textContent) && window.QC.AI.cfg.airGapped === true));
// ---- stage/system parity ----
await ctl.evaluate(() => { const QC = window.QC; const q = QC.Sel.roundQuestions('R2')[3]; QC.Show.jump('QUESTION', { key: q.id, roundId: 'R2', qid: q.id }); });
await stage.waitForTimeout(500);
check('TV never receives the answer before it is revealed', await stage.evaluate(() => { const QC = window.QC; const q = QC.Sel.liveQuestion(); return q && q.answer === -1 && QC.Store.state.questions.every((x) => x.answer === -1); }));
await ctl.evaluate(() => window.QC.Game.reveal());
await stage.waitForTimeout(400);
check('Answer reaches the TV once revealed', await stage.evaluate(() => window.QC.Sel.liveQuestion().answer >= 0));
await ctl.evaluate(() => window.QC.Store.commit('t', (s) => { s.display.calib = 'bars'; s.display.aspect = '4:3'; }, { undo: false }));
await stage.waitForTimeout(500);
check('Calibration bars show on TV', await stage.evaluate(() => !document.querySelector('.calib').hidden && document.querySelector('.calib').classList.contains('bars')));
check('Screen shape 4:3 letterboxes the stage', await stage.evaluate(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return Math.abs(r.width / r.height - 4 / 3) < 0.02; }));
await stage.screenshot({ path: path.join(shots, '98-calibration-4x3.png') });
await ctl.evaluate(() => window.QC.Store.commit('t', (s) => { s.display.calib = 'off'; s.display.aspect = '16:9'; }, { undo: false }));
check('Two checksummed save slots exist', await ctl.evaluate(() => { const a = JSON.parse(localStorage.getItem('qc66.state.A') || 'null'); const b = JSON.parse(localStorage.getItem('qc66.state.B') || 'null'); return !!(a && b && a.f === 'QC66' && b.f === 'QC66' && a.sum && b.sum); }));
check('Clip control commands reach state', await ctl.evaluate(() => { window.QC.Actions.clip('play'); return window.QC.Store.state.live.clip.action === 'play'; }));
await ctl.evaluate(() => window.QC.Actions.clip('stop'));
await ctl.evaluate(() => window.QC.Store.commit('t', (s) => { s.settings.keyLayout = 'v100'; }, { undo: false }));
await ctl.evaluate(() => { const QC = window.QC; const q = QC.Sel.roundQuestions('R2')[4]; QC.Show.jump('QUESTION', { key: q.id, roundId: 'R2', qid: q.id }); });
const kb = await ctl.evaluate(() => window.QC.Sel.score(window.QC.Store.state.live.active));
await ctl.bringToFront(); await ctl.keyboard.press('k');
check('V100 key layout: K = correct', await ctl.evaluate((b) => window.QC.Sel.score(window.QC.Store.state.live.active) === b + 10, kb));
await ctl.evaluate(() => window.QC.Store.commit('t', (s) => { s.settings.keyLayout = 'v66'; }, { undo: false }));
await openPage('preshow');
check('Pre-show check lists items', await ctl.evaluate(() => document.querySelectorAll('#tabBody .li').length >= 12));
await openPage('display');
check('TV & screen page renders', await ctl.evaluate(() => /second screen/.test(document.querySelector('#tabBody').textContent)));
// ---- host script window + roles ----
const host = await ctx.newPage(); watch(host, 'host');
await host.goto(url + '#host');
await host.waitForFunction(() => window.QC && window.QC.MODE === 'host');
await host.waitForTimeout(800);
check('Host script window shows scores', await host.evaluate(() => document.querySelectorAll('#host .chip').length >= 8));
await ctl.selectOption('#roleSel', 'quizmaster');
check('Quiz-master role hides preparation tabs', await ctl.evaluate(() => getComputedStyle(document.querySelector('.ctl-main > section:last-child')).display === 'none'));
await ctl.selectOption('#roleSel', 'controller');
// ---- scene engine override ----
await ctl.evaluate(() => { window.QC.Store.commit('t', (s) => { s.sceneFx.SCOREBOARD = { anim: 'cube', cue: 'none', bg: '' }; }); window.QC.Show.scoreboard(); });
await stage.waitForTimeout(500);
check('Scene Engine per-scene animation applies', await stage.evaluate(() => document.querySelector('.layer:not(.exiting)').dataset.anim === 'cube'));
// ---- stress: long Bengali text at maximum font scale, 4K viewport ----
await stage.setViewportSize({ width: 3840, height: 2160 });
await ctl.evaluate(() => {
  const QC = window.QC;
  QC.Store.commit('stress', (s) => {
    ['question', 'option', 'title', 'team', 'answer'].forEach((k) => { s.design.text[k].size = 1.6; });
    const q = s.questions.find((x) => x.roundId === 'R1');
    q.text = 'পশ্চিমবঙ্গের স্কুলগুলিতে পিএম পোষণ (মিড-ডে মিল) প্রকল্প বাস্তবায়নের সঙ্গে যুক্ত যে অলাভজনক সংস্থাটি আগে ‘ISKCON Food Relief Foundation’ নামে পরিচিত ছিল এবং যার কলকাতার তারাতলায় একটি বিশাল কেন্দ্রীয় রান্নাঘর (মেগা কিচেন) রয়েছে, সেটির বর্তমান নাম কী? '.repeat(2);
    q.options = q.options.map((o) => (o + ' — দীর্ঘ বিকল্প পাঠ্য যা স্টেজে ফিট হতে হবে ').repeat(2));
    s.teams[0].name = 'খেজুরি আদর্শ প্রাথমিক বিদ্যালয় জ্ঞানদীপ্ত কুইজ দল (লাল)';
    s.teams[0].school = 'খেজুরি আদর্শ প্রাথমিক বিদ্যালয়, পূর্ব মেদিনীপুর, পশ্চিমবঙ্গ';
    s.ledger.push({ id: 'Lx', t: Date.now(), team: s.teams[0].id, delta: 999, reason: 'stress', round: 'R1', q: '' });
  });
  const q = QC.Store.state.questions.find((x) => x.roundId === 'R1');
  QC.Show.jump('QUESTION', { key: q.id, roundId: 'R1', qid: q.id });
  QC.Game.setActive(QC.Store.state.teams[0].id);
  QC.Game.showOptions();
  QC.Game.reveal();
});
const overflowAt = async (label) => {
  await stage.waitForTimeout(1800);
  await stage.screenshot({ path: path.join(shots, 'stress-' + label + '.png') });
  return stage.evaluate(() => {
    const bad = [];
    const st = document.querySelector('.stage').getBoundingClientRect();
    document.querySelectorAll('.layer:not(.exiting) [data-fit]').forEach((el) => { if (el.scrollHeight > el.parentElement.clientHeight + 2 || el.scrollWidth > el.parentElement.clientWidth + 2) bad.push(el.className); });
    document.querySelectorAll('.layer:not(.exiting) .glass, .layer:not(.exiting) .opt, .layer:not(.exiting) .answer-bar, .layer:not(.exiting) .sb-row').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.bottom > st.bottom + 2 || r.right > st.right + 2)) bad.push(el.className + ' off-stage'); });
    return bad;
  });
};
const sq = await overflowAt('question-4k');
check('4K + max font + long Bengali question/options/answer: no overflow', sq.length === 0, sq.join(', '));
await ctl.evaluate(() => window.QC.Actions.teamIntroNow(window.QC.Store.state.teams[0].id));
const si = await overflowAt('team-intro-long-name');
check('Long team name intro: no overflow', si.length === 0, si.join(', '));
await ctl.evaluate(() => window.QC.Show.scoreboard());
const ss = await overflowAt('scoreboard-long');
check('Scoreboard with long names: no overflow', ss.length === 0, ss.join(', '));
await ctl.evaluate(() => window.QC.Show.jump('WINNER'));
const sw = await overflowAt('winner-long');
check('Winner with long name: no overflow', sw.length === 0, sw.join(', '));
await ctl.evaluate(() => window.QC.Store.undo());
// the question text stays large: a picture beside it may not shrink the words
const qFont = async () => { await stage.waitForTimeout(2600); return stage.evaluate(() => { const el = document.querySelector('.layer:not(.exiting) .q-text'); return el ? parseFloat(getComputedStyle(el).fontSize) : 0; }); };
await ctl.evaluate(() => { const QC = window.QC; QC.Show.go(QC.Show.rundown().find((x) => x.scene === 'QUESTION' && x.params.qid === 'Q07')); });
const withImg = await qFont();
const hasImg = await stage.evaluate(() => !!document.querySelector('.layer:not(.exiting) .q-img img'));
await ctl.evaluate(() => { const QC = window.QC; QC.Store.commit('test-noimg', (s) => { s.questions.find((q) => q.id === 'Q07').image = ''; }); });
const noImg = await qFont();
await ctl.evaluate(() => window.QC.Store.undo());
check('Question picture shows and the question text stays large (≥ 85% of text-only size)', hasImg && withImg >= noImg * 0.85, withImg.toFixed(1) + 'px with picture vs ' + noImg.toFixed(1) + 'px without');
// the spinning badge is in the corner of every screen, first to last
const noLogo = [];
for (const sc of ['ORGANIZER', 'LOGO', 'THEME', 'IDENTITY', 'TEAM_INTRO', 'ROUND_RULES', 'QUESTION', 'SCOREBOARD', 'WINNER', 'END']) {
  await ctl.evaluate((sc) => { const QC = window.QC; const st = QC.Show.rundown().find((x) => x.scene === sc); if (st) QC.Show.go(st); else QC.Show.jump(sc); }, sc);
  await stage.waitForTimeout(500);
  const ok = await stage.evaluate(() => { const c = document.querySelector('.corner-logo'); const st = document.querySelector('.stage').getBoundingClientRect(); if (!c || c.hidden) return false; const r = c.getBoundingClientRect(); return r.width > 20 && r.right <= st.right + 2 && r.top >= st.top - 2; });
  if (!ok) noLogo.push(sc);
}
check('Corner logo on every screen (first to last)', noLogo.length === 0, noLogo.join(', '));
const relevant = errors.filter((e) => !/favicon/i.test(e));
check('No JS errors in any window', relevant.length === 0, relevant.slice(0, 5).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.ok);
console.log('\nRESULT: ' + (results.length - fail.length) + '/' + results.length + ' passed');
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify({ results, selfTest: st }, null, 1));
process.exit(fail.length ? 1 : 0);
