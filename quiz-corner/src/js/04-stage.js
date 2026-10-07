/* =====================================================================
   STAGE RENDERER — pure function of state → scene parts.
   Parts (data-part) are diffed against their source HTML, so a judge or
   reveal only swaps the changed part: no flicker, no re-animated options.
   ===================================================================== */
const H = {
  photo(mediaId, name, cls = '', color, label) {
    const initial = esc(label || str(name || '?').trim().charAt(0) || '?');
    const style = color ? ' style="--team:' + esc(color) + '"' : '';
    return '<div class="team-photo ' + cls + '"' + style + '>' + (mediaId ? '<img data-media="' + esc(mediaId) + '" alt="" hidden>' : '') + '<span class="initial"' + (mediaId ? ' data-fallback' : '') + '>' + initial + '</span></div>';
  },
  /** Team photo with the team number as a broadcast-style fallback. */
  tphoto(t, cls = '') { return H.photo(t.photo, t.name, cls, '', bn(Sel.teamIndex(t.id) + 1)); },
  teamVars(t) { return t ? '--team:' + esc(t.color) + ';' : ''; },
  roundVars(r) { return r ? '--r-primary:' + esc(r.design.primary) + ';--r-secondary:' + esc(r.design.secondary) + ';--r-accent:' + esc(r.design.accent) + ';' : ''; },
  logo(s, cls = 'logo-chip') { return s.logo ? '<img class="' + cls + '" data-media="' + esc(s.logo) + '" alt="">' : ''; },
  head(s, left, right = '') {
    return '<div class="s-head" data-part="head">' + H.logo(s) + left + '<span class="spacer"></span>' + right + '</div>';
  },
  part(name, html, cls = '', style = '') { return '<div data-part="' + name + '" class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '>' + html + '</div>'; },
  timer() {
    return '<div class="timer idle" data-part="timer" data-timer><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52" stroke-width="2"/><circle class="ring" cx="60" cy="60" r="52" stroke-width="7" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/><text class="digits" x="60" y="56">60</text><text class="mode" x="60" y="86">DIRECT</text></svg></div>';
  },
  teamCard(t, tag, score) {
    if (!t) return '<div class="team-card glass" data-part="team"><div class="flowtag">' + esc(tag) + '</div><div class="tname">দল নির্বাচন করুন</div></div>';
    return '<div class="team-card glass" data-part="team" style="' + H.teamVars(t) + '"><div class="flowtag">' + esc(tag) + '</div>' + H.tphoto(t) + '<div class="tname">' + esc(t.name) + '</div>' + (t.school ? '<div class="tschool">' + esc(t.school) + '</div>' : '') + '<div class="tscore">' + bn(score) + ' পয়েন্ট</div></div>';
  },
  mini(t, label) { return t ? '<div class="mini-team" style="' + H.teamVars(t) + '">' + H.tphoto(t) + '<small>' + esc(label) + '</small><b>' + esc(t.name) + '</b></div>' : '<div></div>'; },
};

const Scenes = {
  ORGANIZER(s) {
    const p = s.poster;
    if (p.media) {
      const fit = p.fit === 'cover' ? 'cover' : p.fit === 'fill' ? 'fill' : 'contain';
      const img = '<img data-media="' + esc(p.media) + '" alt="" style="object-fit:' + fit + ';object-position:' + p.posX + '% ' + p.posY + '%;transform:scale(' + p.zoom + ');opacity:' + p.opacity + '">';
      return { key: 'ORG:' + p.media, anim: p.anim, bare: true, html: '<div class="poster" data-part="poster" style="background:' + esc(p.bg) + '">' + img + '</div>' };
    }
    const e = s.event;
    return { key: 'ORG', anim: p.anim, html: H.part('body', '<div class="glass" style="padding:4cqh 5cqw;max-width:86cqw;display:flex;flex-direction:column;gap:1.6cqh;align-items:center">' + H.logo(s, 'logo-hero') + '<div class="s-kicker">' + esc(e.organizer || 'আয়োজক') + '</div><h1 class="s-title">' + esc(e.programme) + '</h1><div class="s-sub">' + esc(e.subtitle) + '</div><div class="banner-lines">' + esc([e.year, e.venue ? 'স্থান: ' + e.venue : '', e.conductedBy ? 'পরিচালনায়: ' + e.conductedBy : ''].filter(Boolean).join('\n')) + '</div></div>', 'center-col') };
  },
  LOGO(s) { return { key: 'LOGO', anim: 'zoom', html: H.part('brand', Scenes.brand(s, true), 'brand-stage') }; },
  brand(s, big) {
    const e = s.event;
    const logo = s.logo ? '<img data-media="' + esc(s.logo) + '" alt=""><div class="logo-fallback" style="z-index:-1">QC</div>' : '<div class="logo-fallback">QC</div>';
    return '<div class="brand-3d"><div class="logo-orb"' + (big ? '' : ' style="width:30cqh;height:30cqh"') + '><span class="ring3d"></span><span class="ring3d r2"></span>' + logo + '</div><div class="brand-name">' + esc(e.brandEn) + '</div><div class="brand-bn">' + esc(e.brandBn) + '</div><div class="brand-tag">' + esc(e.tagline) + '</div></div>';
  },
  PROGRAMME(s) {
    const e = s.event;
    const items = [['Season', [e.season, e.year].filter(Boolean).join(' • ')], ['Organized by', e.organizer], ['Venue', e.venue], ['Date', e.date], ['Presenter', e.presenter], ['Quiz Master', e.quizMaster], ['Question Compiler', e.compiler], ['Editor', e.editor], ['Conducted by', e.conductedBy], ['Sponsors', e.sponsors]].filter((x) => x[1]);
    return { key: 'PROG', anim: 'push', html: H.part('body', '<div class="s-kicker">' + esc(e.brandEn) + ' presents</div><h1 class="s-title">' + esc(e.programme) + '</h1><div class="s-sub">' + esc(e.subtitle) + '</div><div class="prog-grid">' + items.map((x, i) => '<div class="prog-item glass" style="--i:' + i + '"><small>' + esc(x[0]) + '</small><span>' + esc(x[1]) + '</span></div>').join('') + '</div>', 'center-col') };
  },
  THEME(s) {
    const bars = Array.from({ length: 24 }, (_, i) => '<i style="animation-delay:' + (i * 0.07).toFixed(2) + 's"></i>').join('');
    return { key: 'THEME', anim: 'orbit', html: H.part('brand', Scenes.brand(s, false) + '<div class="eq">' + bars + '</div><div class="s-sub" style="text-align:center">♪ ' + esc(s.event.programme) + ' — থিম সং ♪</div>', 'center-col') };
  },
  CREW(s) {
    const crew = s.crew.map((c, i) => '<div class="crew-card glass" style="--i:' + i + '">' + H.photo(c.photo, c.name) + '<b>' + esc(c.name) + '</b><small>' + esc(c.role) + '</small>' + (c.about ? '<small class="about">' + esc(c.about) + '</small>' : '') + '</div>').join('');
    const n = s.crew.length;
    const cols = s.groupPhoto ? (n <= 4 ? 2 : 3) : n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
    const group = s.groupPhoto ? '<div class="glass" style="padding:1.2cqh;max-width:40cqw;flex:0 0 auto;display:flex;flex-direction:column;gap:1cqh;align-items:center"><img data-media="' + esc(s.groupPhoto) + '" alt="" style="max-height:52cqh;border-radius:1.4cqh;object-fit:contain"><small class="s-sub" style="font-size:2cqh;text-align:center">' + esc(s.groupCaption) + '</small></div>' : '';
    return { key: 'CREW', anim: 'slide', html: H.head(s, '<span class="round-tag">আয়োজক দল ও কৃতজ্ঞতা</span>') + H.part('body', group + '<div class="crew-grid" style="--cols:' + cols + '">' + crew + '</div>', '', 'flex:1;display:flex;gap:2cqw;align-items:center;min-height:0;margin-top:2cqh') };
  },
  teamGrid(teams, extra) {
    const cols = teams.length <= 8 ? 4 : teams.length <= 12 ? 4 : teams.length <= 18 ? 6 : 8;
    return '<div class="team-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + teams.map((t, i) => '<div class="team-tile glass" style="--i:' + i + ';' + H.teamVars(t) + '">' + H.tphoto(t) + '<b>' + esc(t.name) + '</b>' + (t.school ? '<small>' + esc(t.school) + '</small>' : '') + (extra ? extra(t, i) : '') + '</div>').join('') + '</div>';
  },
  TEAMS_ALL(s) { return { key: 'TEAMS_ALL', anim: 'flip', html: H.head(s, '<span class="round-tag">অংশগ্রহণকারী দলসমূহ</span>', '<span class="qnum">' + bn(s.teams.length) + ' টি দল</span>') + H.part('grid', Scenes.teamGrid(s.teams), '', 'flex:1;display:flex;min-height:0') }; },
  intro(s, p, finalist) {
    const t = Sel.team(p.teamId);
    if (!t) return { key: 'INTRO:none', html: H.part('body', '<h1 class="s-title">দল পাওয়া যায়নি</h1>', 'center-col') };
    const players = [['CAPTAIN', t.captain, t.captainPhoto || '']].concat(t.players.map((n, i) => ['PLAYER ' + (i + 1), n, t.playerPhotos[i]]));
    const pr = finalist ? Sel.prelimRanking().find((r) => r.team.id === t.id) : null;
    const tag = finalist ? 'FINALIST ' + p.n + (pr ? ' • প্রাথমিক র‍্যাঙ্ক ' + bn(pr.rank) + ' • ' + bn(pr.score) + ' পয়েন্ট' : '') : 'TEAM ' + String(p.n).padStart(2, '0');
    const playerHtml = players.filter((x) => x[1]).map((x, i) => '<div class="player" style="--i:' + i + '">' + H.photo(x[2], x[1]) + '<small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>').join('');
    return {
      key: (finalist ? 'FIN:' : 'TEAM:') + t.id, anim: finalist ? 'push' : 'orbit', style: H.teamVars(t),
      html: H.part('body', H.tphoto(t, 'big-photo') + '<div class="intro-info"><div class="num">' + esc(tag) + '</div><div class="name-box"><div class="name" data-fit="8">' + esc(t.name) + '</div></div>' + (t.school ? '<div class="school">' + esc(t.school) + '</div>' : '') + (playerHtml ? '<div class="player-row">' + playerHtml + '</div>' : '') + '</div>', 'intro-card'),
    };
  },
  TEAM_INTRO(s, p) { return Scenes.intro(s, p, false); },
  FINALIST_INTRO(s, p) { return Scenes.intro(s, p, true); },
  rulesScene(s, title, rules, key, r) {
    const pic = r ? r.rulesImage : Store.state.prelim.rulesImage;
    return { key, anim: 'flip', style: H.roundVars(r), html: H.head(s, '<span class="round-tag">' + esc(title) + '</span>', '<span class="qnum">নিয়মাবলি</span>') + (pic ? H.part('rules', '<img data-media="' + esc(pic) + '" alt="' + esc(rules) + '" style="width:100%;height:100%;object-fit:contain">', 'rules-box glass') : H.part('rules', '<div class="rules-text" data-fit="3.6">' + esc(rules || 'নিয়ম লেখা হয়নি') + '</div>', 'rules-box glass')) };
  },
  OVERVIEW(s) {
    const played = s.rounds.filter((r) => r.enabled && Sel.roundQuestions(r.id).length);
    return {
      key: 'OVERVIEW', anim: 'flip',
      html: H.head(s, '<span class="round-tag">আজকের অনুষ্ঠান</span>', '<span class="qnum">TONIGHT</span>') +
        H.part('body', '<div class="ov-stats"><div class="glass"><b>' + bn(Sel.prelimQuestions().length) + '</b><small>বাছাই প্রশ্ন</small></div><div class="glass"><b>' + bn(s.teams.length) + '</b><small>অংশগ্রহণকারী দল</small></div><div class="glass"><b>' + bn(s.prelim.finalistCount) + '</b><small>দল মূল পর্বে</small></div><div class="glass"><b>' + bn(played.length) + '</b><small>মূল রাউন্ড</small></div></div><div class="ov-rounds">' + played.map((r, i) => '<span style="' + H.roundVars(r) + '">' + bn(i + 1) + '. ' + esc(r.name) + '</span>').join('') + '</div>' + (s.event.welcomeNote ? '<div class="s-sub" style="text-align:center">' + esc(s.event.welcomeNote) + '</div>' : ''), 'center-col'),
    };
  },
  PRELIM_RULES(s) { return Scenes.rulesScene(s, 'বাছাই পর্ব', s.prelim.rules, 'PRULES'); },
  countdown(s, title) {
    return { key: 'CD:' + s.show.startedAt, anim: 'zoom', html: H.head(s, '<span class="round-tag">' + esc(title) + '</span>') + H.part('cd', '<div class="cd-ring" data-countdown><svg viewBox="0 0 100 100"><circle class="cd-track" cx="50" cy="50" r="46"/><circle class="cd-prog" cx="50" cy="50" r="46" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/></svg><div class="cd-digit">' + bn(s.settings.countdownFrom) + '</div></div>', 'countdown') };
  },
  PRELIM_COUNTDOWN(s) { return Scenes.countdown(s, 'বাছাই পর্ব শুরু হচ্ছে'); },
  MAIN_COUNTDOWN(s) { return Scenes.countdown(s, 'মূল পর্ব শুরু হচ্ছে'); },
  drone(deliverAt, enabled) {
    const ms = Show.droneMs();
    if (!enabled || !(now() - deliverAt < ms)) return { html: '', style: '--drone-ms:0' };
    const path = { left: 'droneLeft', right: 'droneRight', top: 'droneTop' }[Store.state.settings.drone.path] || 'droneLeft';
    return { html: '<div class="drone-wrap" data-part="drone"><div class="drone" style="--drone-path:' + path + '">' + DRONE_SVG + '</div></div>', style: '--drone-ms:' + ms, delivered: true };
  },
  PRELIM_Q(s, p) {
    const qs = Sel.prelimQuestions();
    const i = clamp(int(p.idx), 0, Math.max(0, qs.length - 1));
    const q = qs[i];
    if (!q || !q.text) return { key: 'PQ:' + i, html: H.head(s, '<span class="round-tag">বাছাই পর্ব</span>', '<span class="qnum">প্রশ্ন ' + bn(i + 1) + '</span>') + H.part('body', '<div class="s-sub">প্রশ্ন ' + bn(i + 1) + ' এখনও লেখা হয়নি</div>', 'center-col') };
    const dr = Scenes.drone(s.prelimLive.deliverAt, s.prelim.drone);
    const img = q.image ? '<div class="q-img"><img data-media="' + esc(q.image) + '" alt=""></div>' : '';
    const ans = s.prelimLive.reveal ? H.part('answer', '<span class="lbl">সঠিক উত্তর</span><div class="ans-box"><div class="ans" data-fit="4.6">' + esc(q.answer) + '</div></div>', 'answer-bar') : '';
    return {
      key: 'PQ:' + i + ':' + s.prelimLive.deliverAt, anim: dr.delivered ? 'none' : s.design.anim, style: dr.style,
      html: H.head(s, '<span class="round-tag">বাছাই পর্ব</span>' + (q.star ? '<span class="star-badge">★ তারকা প্রশ্ন</span>' : ''), '<span class="qnum">প্রশ্ন ' + bn(i + 1) + ' / ' + bn(qs.length) + '</span>') +
        '<div class="q-wrap" data-part="wrap" data-morph style="grid-template-columns:1fr 22cqw"><div class="q-main" data-part="main" data-morph>' + H.part('card', img + '<div class="q-text-box"><div class="q-text" data-fit="6.4">' + esc(q.text) + '</div></div>', 'q-card glass' + (dr.delivered ? ' delivered' : '')) + ans + '</div>' +
        '<div class="q-side" data-part="side" data-morph>' + H.part('info', '<div class="flowtag" style="background:var(--gold)">PRELIMINARY</div><div class="tname">উত্তর খাতায় লিখুন</div><div class="tschool">প্রতিটি সঠিক উত্তরে ' + bn(s.prelim.points) + ' নম্বর</div>', 'team-card glass') + H.timer() + '</div></div>' + dr.html,
    };
  },
  PRELIM_RESULT(s) {
    const rows = Sel.prelimRanking();
    const half = Math.ceil(rows.length / 2);
    const body = '<div class="res-table" style="grid-template-rows:repeat(' + half + ',1fr)">' + rows.map((r, i) => '<div class="res-row' + (r.qualified ? ' q' : '') + '" style="--i:' + i + '"><span class="rk">' + bn(r.rank) + '</span><b>' + esc(r.team.name) + (r.team.school ? ' <small class="muted" style="font-weight:500">' + esc(r.team.school) + '</small>' : '') + '</b><span class="sc">' + bn(r.score) + '</span><span class="st">★' + bn(r.stars) + '</span></div>').join('') + '</div>';
    return { key: 'PRES', anim: 'slide', html: H.head(s, '<span class="round-tag">বাছাই পর্বের ফলাফল</span>', '<span class="qnum">শীর্ষ ' + bn(s.prelim.finalistCount) + ' দল মূল পর্বে</span>') + H.part('table', body, '', 'flex:1;display:flex;flex-direction:column;min-height:0') };
  },
  FINALISTS(s) {
    const teams = Sel.finalists();
    return { key: 'FINALISTS', anim: 'cube', html: H.part('title', '<div class="s-kicker">Qualified for the main stage</div><h1 class="s-title" style="font-family:var(--font-en);letter-spacing:.12em">THE FINAL ' + teams.length + '</h1>', 'center-col', 'flex:0 0 auto') + H.part('grid', Scenes.teamGrid(teams, (t, i) => '<span class="gift">' + bn(i + 1) + '</span>'), '', 'flex:1;display:flex;min-height:0') };
  },
  WELCOME(s) {
    const bars = Array.from({ length: 24 }, (_, i) => '<i style="animation-delay:' + (i * 0.07).toFixed(2) + 's"></i>').join('');
    const names = Sel.finalists().map((t) => esc(t.name)).join('  ✦  ');
    return { key: 'WELCOME', anim: 'zoom', html: H.part('body', H.logo(s, 'logo-hero') + '<h1 class="s-title gold">স্বাগতম</h1><div class="s-sub" style="max-width:78cqw">' + esc(s.event.welcomeNote) + '</div><div class="eq">' + bars + '</div><div class="s-sub" style="color:var(--accent)">' + names + '</div>', 'center-col') };
  },
  GIFT(s, p) {
    const t = Sel.team(p.teamId);
    if (!t) return { key: 'GIFT:none', html: H.part('body', '<h1 class="s-title">দল পাওয়া যায়নি</h1>', 'center-col') };
    const g = t.gift || {};
    return {
      key: 'GIFT:' + t.id, anim: 'flip', style: H.teamVars(t),
      html: H.head(s, '<span class="round-tag">বিশেষ উপস্থাপনা</span>', '<span class="qnum">দল ' + bn(p.n) + '</span>') +
        H.part('body', '<div class="team-card glass" style="' + H.teamVars(t) + ';height:100%">' + H.tphoto(t) + '<div class="tname" style="font-size:5cqh">' + esc(t.name) + '</div>' + (t.school ? '<div class="tschool" style="font-size:2.8cqh">' + esc(t.school) + '</div>' : '') + '</div>' +
          '<div class="gift-item glass">' + (g.image ? '<img class="gimg" data-media="' + esc(g.image) + '" alt="">' : '') + '<div class="cat">' + esc(g.category || 'বিশেষ পরিচয়') + '</div><div class="item">' + esc(g.item || '—') + '</div></div>', 'gift-card'),
    };
  },
  PODIUM(s) {
    const teams = Sel.finalists();
    return { key: 'PODIUM', anim: 'push', html: H.head(s, '<span class="round-tag">মূল পর্বের দলসমূহ</span>', '<span class="qnum">' + esc(s.event.programme) + '</span>') + H.part('grid', '<div class="podium" style="flex:1;display:flex;min-height:0">' + Scenes.teamGrid(teams, (t) => (t.gift && t.gift.item ? '<span class="gift">' + esc(t.gift.item) + '</span>' : '') + (t.players.filter(Boolean).length ? '<small>' + esc(t.players.filter(Boolean).join(' • ')) + '</small>' : '')) + '</div>', '', 'flex:1;display:flex;min-height:0') };
  },
  ROUND_INTRO(s, p) {
    const r = Sel.round(p.roundId);
    if (!r) return { key: 'RI:none', html: '' };
    const n = s.rounds.filter((x) => x.enabled).indexOf(r) + 1;
    const a = r.design.anim;
    const fx = a === 'door' ? '<div class="doors" data-part="doors"><i></i><i></i></div>' : a === 'sweep' || a === 'glass' ? '<div class="sweep" data-part="sweep"></div>' : '';
    return {
      key: 'RI:' + r.id, anim: a === 'burst' ? 'zoom' : ['flip', 'cube', 'zoom', 'spin', 'slide', 'door', 'push', 'orbit'].includes(a) ? a : 'fade', style: H.roundVars(r), burst: a === 'burst' || a === 'sweep', bg: r.design.bg,
      html: H.part('body', '<div class="rnum">ROUND ' + n + '</div><div class="rname" data-fit="13" style="' + (r.design.titleFont ? 'font-family:' + esc(FONT_MAP[r.design.titleFont] || r.design.titleFont) : '') + '">' + esc(r.name) + '</div>' + (r.label ? '<div class="rlabel">' + esc(r.label) + '</div>' : '') + (r.description ? '<div class="rdesc">' + esc(r.description) + '</div>' : ''), 'round-intro ri-anim-' + a) + fx,
    };
  },
  ROUND_RULES(s, p) { const r = Sel.round(p.roundId); return Object.assign(Scenes.rulesScene(s, r ? r.name : '', r ? r.rules : '', 'RR:' + p.roundId, r), { bg: r && r.design.bg }); },
  GRID(s, p) {
    const r = Sel.round(p.roundId);
    if (!r) return { key: 'GRID:none', html: '' };
    const qs = Sel.roundQuestions(r.id);
    const cols = qs.length <= 10 ? 5 : qs.length <= 20 ? 5 : 8;
    const turn = Sel.team(Game.turnFor(r.id));
    const tiles = qs.length ? qs.map((q, i) => '<div class="tile' + (s.board.played[q.id] ? ' played' : '') + (s.live.qid === q.id ? ' current' : '') + '" style="--i:' + i + '">' + bn(q.number) + '</div>').join('') : '<div class="s-sub" style="grid-column:1/-1;text-align:center;align-self:center">এই রাউন্ডে এখনও প্রশ্ন যোগ করা হয়নি</div>';
    return {
      key: 'GRID:' + r.id, anim: 'flip', style: H.roundVars(r), bg: r.design.bg,
      html: H.head(s, '<span class="round-tag">' + esc(r.name) + '</span>', turn ? '<span class="qnum" style="' + H.teamVars(turn) + 'color:var(--team)">পালা: ' + esc(turn.name) + '</span>' : '') + H.part('board', tiles, 'board', 'grid-template-columns:repeat(' + cols + ',1fr)'),
    };
  },
  QUESTION(s, p) {
    const l = s.live;
    const q = Sel.question(l.qid) || Sel.question(p.qid);
    const r = Sel.round((q && q.roundId) || p.roundId);
    if (!q) return { key: 'Q:none', html: H.part('body', '<div class="s-sub">প্রশ্ন পাওয়া যায়নি</div>', 'center-col') };
    const n = s.rounds.filter((x) => x.enabled).indexOf(r) + 1;
    const dr = Scenes.drone(l.deliverAt, !!l.drone);
    const active = Sel.team(l.active);
    const flowTag = { direct: 'DIRECT', pass: 'PASS TO', bonus: 'BONUS TO', challenge: 'CHALLENGE' }[l.flow] || 'DIRECT';
    let side;
    if (l.flow === 'challenge' && l.challenger) {
      side = '<div class="glass" data-part="team" style="padding:1.6cqh;display:flex;flex-direction:column;gap:1cqh"><div class="flowtag" style="align-self:center;font-family:var(--font-en);font-weight:800;letter-spacing:.18em;font-size:2cqh;padding:.4cqh 1.4cqw;border-radius:99cqh;background:var(--warn);color:#000">CHALLENGE</div><div class="vs-row">' + H.mini(Sel.team(l.challenger), 'CHALLENGER') + '<span class="vs">VS</span>' + H.mini(active, 'TARGET') + '</div></div>';
    } else if ((l.flow === 'pass' || l.flow === 'bonus') && l.passChain.length) {
      const from = Sel.team(l.passChain[l.passChain.length - 1]);
      side = '<div class="glass" data-part="team" style="padding:1.6cqh;display:flex;flex-direction:column;gap:1cqh;' + H.teamVars(active) + 'border-color:var(--team)"><div style="align-self:center;font-family:var(--font-en);font-weight:800;letter-spacing:.18em;font-size:2cqh;padding:.4cqh 1.4cqw;border-radius:99cqh;background:var(--team);color:#000">' + flowTag + '</div>' + (active ? H.tphoto(active) + '<div class="tname" style="font-size:3.2cqh;font-weight:800;text-align:center;line-height:1.3">' + esc(active.name) + '</div>' : '') + '<div style="text-align:center;color:var(--muted);font-size:1.9cqh">' + (from ? 'পাস এসেছে: ' + esc(from.name) : '') + (l.flow === 'bonus' ? ' • মান ' + bn(Game.pointsFor('correct')) : '') + '</div></div>';
    } else side = H.teamCard(active, flowTag, active ? Sel.score(active.id) : 0);
    const hands = l.hands.length ? H.part('hands', '<div class="hands-title">✋ ' + (r && r.features.singleChallenger ? 'বাজার চেপে চ্যালেঞ্জ' : 'চ্যালেঞ্জ / হাত তুলেছে') + '</div>' + l.hands.map((id) => { const t = Sel.team(id); const j = l.handsJudged[id]; return t ? '<span class="hand ' + (j || '') + '" style="' + H.teamVars(t) + '">' + (j === 'right' ? '✓' : j === 'wrong' ? '✕' : '✋') + ' ' + esc(t.name) + '</span>' : ''; }).join(''), 'hands-rack glass') : '';
    const lifelines = s.settings.showLifelines && r && r.features.lifelines && active ? H.part('life', [['fifty', '50:50'], ['poll', 'POLL'], ['flip', 'FLIP']].map(([k, lab]) => '<span class="' + (Sel.lifelineUsed(active.id, k) ? 'used' : '') + '">' + lab + '</span>').join(''), 'lifeline-row') : '';
    const clipKind = q.clip ? ((Media.index.find((m) => m.id === q.clip) || {}).kind || (/\.(mp3|wav|m4a|ogg)$/i.test(q.clip) ? 'audio' : 'video')) : '';
    const img = q.clip ? '<div class="q-img">' + (clipKind === 'audio' ? '<div class="clip-audio">♪<audio data-clip data-media="' + esc(q.clip) + '" preload="auto"></audio></div>' : '<video data-clip data-media="' + esc(q.clip) + '" preload="auto" playsinline></video>') + '</div>' : q.image ? '<div class="q-img"><img data-media="' + esc(q.image) + '" alt=""></div>' : '';
    const showOpts = l.optionsShown && q.options.filter(Boolean).length >= 2;
    const opts = showOpts ? H.part('opts', q.options.map((o, i) => {
      if (!o) return '';
      const cls = (l.eliminated.includes(i) ? ' gone' : '') + (l.revealed && i === q.answer ? ' right' : '') + (l.picked === i && !(l.revealed && i === q.answer) ? (l.revealed || l.result === 'wrong' ? ' wrongpick' : ' picked') : '');
      return '<div class="opt' + cls + '" style="--i:' + i + '"><span class="badge">' + OPT_LABELS[i] + '</span><div class="otext-box"><div class="otext" data-fit="3.9">' + esc(o) + '</div></div></div>';
    }).join(''), 'opts', dr.delivered ? '--opt-delay:' + (Show.droneMs() * 0.0008).toFixed(2) + 's' : '') : '';
    const poll = l.poll ? H.part('poll', l.poll.map((v, i) => (q.options[i] ? '<div class="bar"><span class="pct">' + bn(v) + '%</span><div class="fill" style="--h:' + Math.max(2, v) + '%"></div><span class="lab">' + OPT_LABELS[i] + '</span></div>' : '<div></div>')).join(''), 'poll glass') : '';
    const ansText = q.answerText || q.options[q.answer] || '';
    const ans = l.revealed ? H.part('answer', '<span class="lbl">সঠিক উত্তর</span><div class="ans-box"><div class="ans" data-fit="4.6">' + (q.options[q.answer] && !q.answerText ? '(' + OPT_LABELS[q.answer] + ') ' : '') + esc(ansText) + (q.explanation ? '<span class="exp">' + esc(q.explanation) + '</span>' : '') + '</div></div>', 'answer-bar') : '';
    const stamp = l.result ? '<div class="stamp ' + l.result + '" data-part="stamp-' + l.resultAt + '">' + ({ correct: 'সঠিক ✓', wrong: 'ভুল ✗', noscore: 'নো স্কোর' }[l.result]) + '</div>' + (l.lastPoints ? '<div class="points-fly" data-part="pts-' + l.resultAt + '">' + signed(l.lastPoints) + '</div>' : '') : '';
    const qFont = r && r.design.questionFont ? 'font-family:' + esc(FONT_MAP[r.design.questionFont] || r.design.questionFont) + ';' : '';
    const oFont = r && r.design.optionFont ? '--font-opt:' + esc(FONT_MAP[r.design.optionFont] || r.design.optionFont) + ';' : '';
    const qScale = r && r.design.qScale && r.design.qScale !== 1 ? r.design.qScale : 1;
    return {
      key: 'Q:' + q.id + ':' + l.deliverAt, anim: dr.delivered ? 'none' : s.design.anim, style: H.roundVars(r) + dr.style + oFont + (active ? H.teamVars(active) : ''), bg: r && r.design.bg,
      html: H.head(s, '<span class="round-tag">' + (n > 0 ? 'রাউন্ড ' + bn(n) + ' • ' : '') + esc(r ? r.name : '') + '</span>', (r && r.multiplier > 1 ? '<span class="mult">×' + bn(r.multiplier) + ' পয়েন্ট</span>' : '') + '<span class="qnum">প্রশ্ন ' + bn(q.number) + '</span>') +
        '<div class="q-wrap" data-part="wrap" data-morph><div class="q-main" data-part="main" data-morph>' + H.part('card', img + '<div class="q-text-box"><div class="q-text" data-fit="' + (6.2 * qScale).toFixed(2) + '" style="' + qFont + '">' + esc(q.text) + '</div></div>', 'q-card glass' + (dr.delivered ? ' delivered' : '')) + opts + poll + ans + '</div>' +
        '<div class="q-side" data-part="side" data-morph>' + side + hands + lifelines + H.timer() + '</div></div>' + stamp + dr.html,
    };
  },
  standingsRows(s, rows, rid, revealFrom = 0, titles = false) {
    return rows.map((r, i) => {
      const hidden = i < revealFrom;
      const mv = r.move > 0 ? '<span class="mv up">▲ ' + bn(r.move) + '</span>' : r.move < 0 ? '<span class="mv down">▼ ' + bn(-r.move) + '</span>' : '<span class="mv same">—</span>';
      if (hidden) return '<div class="sb-row" style="--i:' + i + ';--team:#555"><span class="rank">' + bn(r.rank) + '</span><div class="team-photo"><span class="initial">?</span></div><div class="nm"><b>? ? ?</b></div><span class="rs"></span><span class="tot">—</span><span></span></div>';
      return '<div class="sb-row' + (r.rank === 1 && r.score > 0 ? ' lead' : '') + (revealFrom && i === revealFrom ? ' just' : '') + '" data-team="' + esc(r.team.id) + '" style="--i:' + i + ';' + H.teamVars(r.team) + '"><span class="rank">' + bn(r.rank) + '</span>' + H.tphoto(r.team) + '<div class="nm"><b>' + esc(r.team.name) + '</b>' + (titles ? '<small class="rtitle">' + Sel.rankTitle(r.rank) + (rows.filter((x) => x.rank === r.rank).length > 1 ? ' • সমান' : '') + '</small>' : (r.team.school ? '<small>' + esc(r.team.school) + '</small>' : '')) + '</div><span class="rs">' + (rid ? signed(r.rscore).replace(/\d/g, (d) => BN_DIGITS[d]) : '') + '</span><span class="tot">' + bn(r.score) + '</span>' + mv + '</div>';
    }).join('');
  },
  SCOREBOARD(s, p) {
    const r = Sel.round(p.roundId);
    const rows = Sel.standings(undefined, r ? r.id : '');
    const star = r ? Sel.roundStar(r.id) : null;
    return {
      key: 'SB:' + (r ? r.id : 'all'), anim: 'slide', style: H.roundVars(r),
      html: H.head(s, '<span class="round-tag">স্কোরবোর্ড' + (r ? ' • ' + esc(r.name) : '') + '</span>', '<span class="qnum">' + esc(s.event.programme) + '</span>') +
        H.part('sb', '<div class="sb-head"><span>RANK</span><span></span><span>TEAM</span><span>' + (r ? 'ROUND' : '') + '</span><span>TOTAL</span><span>MOVE</span></div>' + Scenes.standingsRows(s, rows, r ? r.id : ''), 'sb') +
        (star ? H.part('star', '★ রাউন্ড স্টার: ' + star.teams.map((t) => esc(t.name)).join(' ও ') + ' — এই রাউন্ডে +' + bn(star.pts), 'round-star') : ''),
    };
  },
  FINAL(s) {
    const rows = Sel.standings();
    const revealFrom = Math.max(0, rows.length - s.finalReveal);
    return { key: 'FINAL', anim: 'cube', html: H.head(s, '<span class="round-tag">চূড়ান্ত ফলাফল</span>', '<span class="qnum">' + (s.finalReveal >= rows.length ? 'সম্পূর্ণ' : bn(s.finalReveal) + ' / ' + bn(rows.length)) + '</span>') + H.part('sb-' + s.finalReveal, '<div class="sb-head"><span>RANK</span><span></span><span>TEAM</span><span></span><span>TOTAL</span><span>MOVE</span></div>' + Scenes.standingsRows(s, rows, '', revealFrom, true), 'sb') };
  },
  WINNER(s) {
    const w = Show.winner();
    if (!w) return { key: 'WIN:none', html: H.part('body', '<h1 class="s-title">বিজয়ী নির্ধারিত হয়নি</h1>', 'center-col') };
    const t = w.team;
    const photo = s.winnerPhoto || t.photo;
    return {
      key: 'WIN:' + t.id, anim: 'zoom', style: H.teamVars(t), confetti: true,
      html: H.part('body', H.photo(photo, t.name, 'wphoto', '', bn(Sel.teamIndex(t.id) + 1)) + '<div class="wtxt">' + TROPHY_SVG + '<div class="champ">CHAMPION</div><div class="name-box"><div class="wname" data-fit="10">' + esc(t.name) + '</div></div>' + (t.school ? '<div class="wschool">' + esc(t.school) + '</div>' : '') + (t.captain ? '<div class="wcap">অধিনায়ক: ' + esc(t.captain) + '</div>' : '') + '<div class="wscore">' + bn(w.score) + ' পয়েন্ট</div></div>', 'winner'),
    };
  },
  TOP3(s) {
    const rows = Sel.standings().slice(0, 3);
    const order = [[rows[1], 2], [rows[0], 1], [rows[2], 3]].filter((x) => x[0]);
    // Column height follows the podium position; titles and crowns follow the real (possibly tied) rank.
    const cols = order.map(([r, pos]) => '<div class="pod pod' + pos + '" style="' + H.teamVars(r.team) + '">' + (r.rank === 1 ? '<div class="crown">👑</div>' : '<div class="crown" style="visibility:hidden">👑</div>') + H.tphoto(r.team) + '<b>' + esc(r.team.name) + '</b><small>' + Sel.rankTitle(r.rank) + '</small><div class="pod-block"><span>' + bn(r.rank) + '</span><em>' + bn(r.score) + '</em></div></div>').join('');
    return { key: 'TOP3', anim: 'push', confetti: true, html: H.head(s, '<span class="round-tag">বিজয়ী মঞ্চ</span>', '<span class="qnum">CONGRATULATIONS</span>') + H.part('podium', cols, 'podium3') };
  },
  END(s) { return { key: 'END', anim: 'orbit', html: H.part('brand', Scenes.brand(s, false) + '<h1 class="s-title gold" style="font-size:7cqh">ধন্যবাদ</h1><div class="s-sub">' + esc(s.event.programme) + ' • ' + esc(s.event.organizer) + '</div>', 'center-col') }; },
  GRAPHIC(s, p) { return { key: 'GFX:' + p.media, anim: 'zoom', bare: true, html: '<div class="poster" data-part="poster"><img data-media="' + esc(p.media || '') + '" alt="" style="object-fit:contain"></div>' }; },
};

/* ---------- StageView: owns one rendered stage (TV window or preview) ---------- */
class StageView {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts;
    host.classList.add('stage-host');
    host.innerHTML = '<div class="stage"><div class="bg-image" data-bg></div><canvas class="gl"></canvas><div class="mood"></div><canvas class="fx"></canvas><div class="light-rays"></div><div class="grid-floor"></div><div class="layers"></div><div class="ticker" hidden><span></span></div><div class="strobe"></div><div class="calib" hidden></div><div class="testcard" hidden></div><div class="blackout" hidden></div></div>';
    this.stage = $('.stage', host);
    this.layers = $('.layers', host);
    this.fx = safe('fx-init', () => new FxField($('canvas.fx', host)), null);
    this.cur = null; this.curKey = ''; this.lastResultAt = 0; this.lastScene = ''; this.cdStep = -1; this.mood = ''; this.clipAt = 0;
    // The real 3D background runs on the TV window only (the operator preview stays light).
    this.gl = opts.preview ? null : safe('webgl', () => createStageGL($('canvas.gl', host)), null);
    if (!this.gl) $('canvas.gl', host).hidden = true;
    this.ro = new ResizeObserver(() => { this.layout(); this.fitAll(); });
    new ResizeObserver(() => this.layout()).observe(host);
    this.ro.observe(this.stage);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  render() {
    const s = Store.state;
    let sc;
    try {
      const fn = Scenes[s.show.scene] || Scenes.LOGO;
      sc = fn(s, s.show.params || {});
    } catch (e) {
      Log.err('scene:' + s.show.scene, e);
      sc = { key: 'ERR', html: H.part('body', Scenes.brand(s, false), 'center-col') }; // audience sees the logo, never an error
    }
    const fx = s.sceneFx && s.sceneFx[s.show.scene];
    if (fx) { if (fx.anim) sc.anim = fx.anim; if (fx.bg) sc.bg = fx.bg; }
    safe('stage-render', () => this.apply(sc, s));
  }
  apply(sc, s) {
    const tpl = document.createElement('template');
    tpl.innerHTML = sc.html;
    if (sc.key !== this.curKey || !this.cur) {
      const old = this.cur;
      if (old) { old.classList.remove('enter'); old.classList.add('exiting'); setTimeout(() => old.remove(), 700); }
      const layer = document.createElement('div');
      layer.className = 'layer enter' + (sc.bare ? ' bare' : '');
      if (sc.bare) layer.style.padding = '0';
      layer.dataset.anim = s.design.motion ? (sc.anim || s.design.anim) : 'none';
      layer.setAttribute('style', (sc.bare ? 'padding:0;' : '') + (sc.style || ''));
      Array.from(tpl.content.children).forEach((c) => { c._src = c.outerHTML; layer.appendChild(c); });
      this.layers.appendChild(layer);
      this.cur = layer; this.curKey = sc.key;
      if (sc.burst && this.fx) this.fx.burst(false);
      if (sc.confetti && this.fx) { this.fx.burst(true); clearInterval(this.confettiIv); let k = 0; this.confettiIv = setInterval(() => { if (++k > 5 || this.curKey !== sc.key) { clearInterval(this.confettiIv); return; } this.fx && this.fx.burst(true); }, 2600); }
      requestAnimationFrame(() => this.fitAll());
    } else {
      this.cur.setAttribute('style', (sc.bare ? 'padding:0;' : '') + (sc.style || ''));
      this.patch(this.cur, tpl.content);
    }
    // Derived one-shot effects (identical in every window because they come from state).
    if (s.live.result === 'correct' && s.live.resultAt !== this.lastResultAt && s.show.scene === 'QUESTION' && this.fx) this.fx.burst(false);
    this.lastResultAt = s.live.resultAt;
    Media.hydrate(this.cur);
    const bgId = sc.bg || s.design.bgImage;
    const bg = $('[data-bg]', this.stage);
    if (bg.getAttribute('data-media') !== (bgId || '')) { bg.style.backgroundImage = ''; delete bg.dataset.loaded; if (bgId) bg.setAttribute('data-media', bgId); else bg.removeAttribute('data-media'); Media.hydrate(this.stage); }
    $('.blackout', this.stage).hidden = !s.show.blackout;
    this.layout();
    // Round mood glow + palette for the 3D background.
    const mood = s.design.motion ? stageMood(s) : '';
    if (mood !== this.mood) { this.mood = mood; this.stage.dataset.mood = mood; const m = $('.mood', this.stage); m.classList.remove('flash'); void m.offsetWidth; if (mood) m.classList.add('flash'); }
    if (this.gl) { const c = MOOD_COLORS[mood]; this.gl.setPalette(hexRgb(c ? c[0] : s.design.colors.accent), hexRgb(c ? c[1] : s.design.colors.gold), hexRgb(c ? c[2] : '#ffffff')); }
    // Rapid Fire strobe when a new question lands.
    if (mood === 'rapid' && s.display.strobe && s.show.scene === 'QUESTION' && s.live.deliverAt !== this.strobeAt) { this.strobeAt = s.live.deliverAt; const st = $('.strobe', this.stage); st.classList.remove('go'); void st.offsetWidth; st.classList.add('go'); }
    if (sc.confetti && this.fx && s.display.fireworks && sc.key !== this.fwKey) { this.fwKey = sc.key; this.fx.fireworks(10); }
    this.calibrate(s);
    this.clip(s);
    const tk = $('.ticker', this.stage); tk.hidden = !(s.event.showTicker && s.event.ticker); $('span', tk).textContent = s.event.ticker;
    $('.grid-floor', this.stage).hidden = !s.design.floor;
    $('.light-rays', this.stage).hidden = !s.design.rays;
    if (this.opts.preview) {
      let b = $('.rehearsal-badge', this.stage);
      if (Store.rehearsal && !b) { b = document.createElement('div'); b.className = 'rehearsal-badge'; b.textContent = 'REHEARSAL'; this.stage.appendChild(b); }
      if (!Store.rehearsal && b) b.remove();
    }
  }
  /** Replace only parts whose source HTML changed; recurse into data-morph containers. */
  patch(oldParent, newParent) {
    const nk = Array.from(newParent.children);
    const ok = Array.from(oldParent.children).filter((c) => !c.classList.contains('exiting'));
    const same = nk.length === ok.length && nk.every((n, i) => n.dataset.part && n.dataset.part === ok[i].dataset.part);
    if (!same) {
      // Structure changed (part added/removed): keep unchanged parts, insert the rest in order.
      const keep = new Map(ok.filter((o) => o.dataset.part).map((o) => [o.dataset.part, o]));
      const frag = [];
      nk.forEach((n) => { const o = keep.get(n.dataset.part); if (o && o._src === n.outerHTML) { frag.push(o); keep.delete(n.dataset.part); } else if (o && n.hasAttribute('data-morph')) { this.patch(o, n); this.copyAttrs(o, n); o._src = n.outerHTML; frag.push(o); keep.delete(n.dataset.part); } else { n._src = n.outerHTML; frag.push(n); } });
      oldParent.replaceChildren(...frag);
      requestAnimationFrame(() => this.fitAll());
      return;
    }
    nk.forEach((n, i) => {
      const o = ok[i];
      const src = n.outerHTML;
      if (o._src === src) return;
      if (n.hasAttribute('data-morph')) { this.patch(o, n); this.copyAttrs(o, n); o._src = src; return; }
      n._src = src;
      o.replaceWith(n);
    });
    requestAnimationFrame(() => this.fitAll());
  }
  copyAttrs(o, n) { for (const a of Array.from(n.attributes)) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value); }
  fitAll() {
    const h = this.stage.clientHeight;
    if (!h) return;
    $$('[data-fit]', this.stage).forEach((el) => {
      const cqh = num(el.getAttribute('data-fit'), 5);
      const T = Store.state.design.text;
      const scale = el.classList.contains('q-text') ? T.question.size : el.classList.contains('otext') ? T.option.size : el.classList.contains('rname') ? T.title.size : el.classList.contains('ans') ? T.answer.size : (el.classList.contains('name') || el.classList.contains('wname')) ? T.team.size : 1;
      fitText(el, h * cqh / 100 * scale, Math.max(10, h * 0.016));
    });
  }
  loop() {
    if (!this.host.isConnected) return;
    requestAnimationFrame(this.loop);
    const s = Store.state;
    safe('stage-loop', () => {
      this.drawTimer(s);
      this.drawCountdown(s);
      if (this.fx) this.fx.frame({ particles: s.design.particles && s.design.motion, accent: s.design.colors.accent });
      if (this.gl) { const on = s.display.webgl && s.design.motion && s.display.calib === 'off'; $('canvas.gl', this.stage).hidden = !on; if (on) this.gl.draw(performance.now(), this.fx && this.fx.quality < 0.5 ? 'light' : 'full'); }
    });
  }
  /** Screen shape (16:9, 16:10, 4:3, fill) and safe margin for TVs that crop the picture. */
  layout() {
    const s = Store.state; const d = s.display;
    const W = this.host.clientWidth, Hh = this.host.clientHeight;
    if (!W || !Hh) return;
    const ar = { '16:9': 16 / 9, '16:10': 1.6, '4:3': 4 / 3 }[d.aspect];
    let w = W, h = Hh;
    if (ar && !this.opts.preview) { if (W / Hh > ar) w = Hh * ar; else h = W / ar; }
    else if (ar) h = W / ar;
    const key = w + 'x' + h + d.safeMargin;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    if (this.opts.preview) { this.stage.style.width = ''; this.stage.style.height = ''; this.stage.style.aspectRatio = ar ? String(ar) : '16 / 9'; }
    else { this.stage.style.width = w + 'px'; this.stage.style.height = h + 'px'; this.stage.style.aspectRatio = 'auto'; }
    this.stage.style.transform = d.safeMargin ? 'scale(' + (1 - 2 * d.safeMargin / 100) + ')' : '';
  }
  calibrate(s) {
    const c = $('.calib', this.stage); const mode = s.display.calib;
    c.hidden = mode === 'off'; c.className = 'calib ' + mode;
    c.innerHTML = mode === 'off' ? '' : '<span>' + ({ bars: 'SMPTE COLOUR BARS • রং যেন পরিষ্কার দেখায়, ঝলসে না যায়', grid: 'GRID • বৃত্তটি গোল, চার কোণের লাল দাগ দেখা যাবে', ramp: 'BRIGHTNESS • ২% ও ৯৮% দুটো পটিই সবে দেখা যাবে' }[mode]) + '</span>' + (mode === 'grid' ? '<i class="circle"></i><b class="corner tl"></b><b class="corner tr"></b><b class="corner bl"></b><b class="corner br"></b>' : '') + (mode === 'ramp' ? '<em class="p2">2%</em><em class="p98">98%</em>' : '');
    const tc = $('.testcard', this.stage); tc.hidden = !s.display.testCard;
    if (s.display.testCard) tc.innerHTML = '<div><b>QUIZ CORNER • TEST CARD</b><br>' + screen.width + '×' + screen.height + ' • DPR ' + (window.devicePixelRatio || 1) + ' • স্টেজ ' + Math.round(this.stage.clientWidth) + '×' + Math.round(this.stage.clientHeight) + '<br>' + (document.fullscreenElement ? 'ফুলস্ক্রিন ✓' : 'ফুলস্ক্রিন নয় — F চাপুন') + ' • সেফ মার্জিন ' + s.display.safeMargin + '%</div>';
  }
  /** Question audio / video clips, controlled from the operator panel. */
  clip(s) {
    const el = $('.layer:not(.exiting) [data-clip]', this.stage);
    const c = s.live.clip || {};
    if (!el || c.at === this.clipAt) return;
    this.clipAt = c.at;
    if (this.opts.preview) el.muted = true;
    safe('clip', () => {
      if (c.action === 'play') { const p = el.play(); if (p && p.catch) p.catch((e) => Log.err('clip', e)); }
      else if (c.action === 'pause') el.pause();
      else if (c.action === 'restart') { el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      else { el.pause(); el.currentTime = 0; }
    });
  }
  drawTimer(s) {
    const t = s.timer;
    const rem = Sel.timerRemaining(t);
    const waiting = t.running && now() < t.startedAt;
    const frac = t.duration ? rem / t.duration : 0;
    const sec = Math.ceil(rem / 1000);
    const state = t.expired ? 'done' : !t.running && rem >= t.duration ? 'idle' : sec <= s.settings.critAt ? 'crit' : sec <= s.settings.warnAt ? 'warn' : '';
    const mode = { direct: 'DIRECT', pass: 'PASS', bonus: 'BONUS', challenge: 'CHALLENGE', raise: 'HANDS UP' }[t.mode] || 'TIMER';
    $$('[data-timer]', this.stage).forEach((el) => {
      const ring = $('.ring', el); const dg = $('.digits', el); const md = $('.mode', el);
      if (ring) { ring.setAttribute('stroke-dashoffset', String(Math.round((1 - frac) * 1000))); ring.setAttribute('stroke-width', String(s.design.ringWidth)); }
      const txt = t.expired ? '০' : bn(fmtTime(rem));
      if (dg && dg.textContent !== txt) dg.textContent = txt;
      const mtxt = t.expired ? "TIME'S UP" : waiting ? 'READY' : t.running ? mode : rem < t.duration ? 'PAUSED' : mode;
      if (md && md.textContent !== mtxt) md.textContent = mtxt;
      const cls = 'timer ' + (state || '');
      if (el.className !== cls) el.className = cls;
    });
  }
  drawCountdown(s) {
    const el = $('[data-countdown]', this.stage);
    if (!el) return;
    const from = s.settings.countdownFrom; const stepMs = s.settings.countdownStepMs;
    const elapsed = now() - s.show.startedAt;
    const step = Math.floor(elapsed / stepMs);
    const prog = $('.cd-prog', el);
    if (prog) prog.setAttribute('stroke-dashoffset', String(Math.round(Math.min(1, elapsed / (from * stepMs)) * 1000)));
    if (step === this.cdStep) return;
    this.cdStep = step;
    const d = $('.cd-digit, .cd-final', el);
    if (step < from) { d.className = 'cd-digit pop'; d.textContent = bn(from - step); void d.offsetWidth; }
    else { d.className = 'cd-final'; d.textContent = s.show.scene === 'PRELIM_COUNTDOWN' ? 'বাছাই পর্ব শুরু!' : 'QUIZ BEGINS'; if (this.fx && step === from) this.fx.burst(false); }
  }
}
