/* =====================================================================
   SOUND LIBRARY & GENERATIVE MUSIC — ported from the V100 engine.
   Sfx: the crafted built-in effects (no files needed).
   Music: five generative moods that follow the show; the Tagore
   instrumental plays in the first three played rounds.
   SoundDirector: decides the music level (silent under songs, ducked
   under speech and effects, muted on request).
   ===================================================================== */
const Sfx = (() => {
  let ctx = null, master = null, vol = 0.55, muted = false, lastTick = 0;
  let bus = null, noiseB = null, tickFlip = false, boost = 1;
  /* loudness of each built-in effect, measured and balanced so they all sound about equally loud */
  const LEVEL = { siren: 1.6, laser: 2, heartbeat: 1.4, cdhit: 1.3, drumroll: 1.45, applause: 16, suspense: 1.4, gong: 2.4, ding: 3.6, click: 10, transition: 7.5, round: 1.1, question: 7, option: 9, correct: 5.2, wrong: 3.4, score: 6, pass: 7, buzzer: 4, fanfare: 1.5, reveal: 1.6 };
  /* the effects chain: every built-in effect → (dry + a small room reverb) → volume → a soft limiter, so nothing can crackle on the TV speakers */
  function attach(c) {
    if (ctx === c) return; ctx = c; master = ctx.createGain(); master.gain.value = vol;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15; master.connect(lim); lim.connect(ctx.destination);
    bus = ctx.createGain(); bus.connect(master);
    try { const verb = ctx.createConvolver(); verb.buffer = room(ctx); const vg = ctx.createGain(); vg.gain.value = 0.3; bus.connect(verb); verb.connect(vg); vg.connect(master); } catch (_) { /* no reverb: the dry sound still plays */ }
    noiseB = makeNoise(ctx);
  }
  function room(c) { const len = Math.floor(c.sampleRate * 1.6); const b = c.createBuffer(2, len, c.sampleRate); let s = 99991; for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = ((s / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3); } } return b; }
  function makeNoise(c) { const len = c.sampleRate; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0); let s = 4242; for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; } return b; }
  function ensure() { try { if (!ctx) return false; if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {}); return true; } catch (_) { return false; } }
  function out(node, pan) { if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); p.connect(bus); return p; } node.connect(bus); return null; }
  function tone(f, d, type = 'sine', g = 0.05, when = 0, slide = 0, pan = 0) {
    if (muted || !ensure() || !bus) return; try {
      const t = ctx.currentTime + when, o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, g * boost), t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); const p = out(gn, pan); o.start(t); o.stop(t + d + 0.03);
      o.onended = () => { try { o.disconnect(); gn.disconnect(); p && p.disconnect(); } catch (_) {} };
    } catch (_) {}
  }
  /* filtered noise: whooshes, risers, cymbals and the clock tick */
  function hiss(d, g, when, f0, f1, type = 'bandpass', q = 1.2, attack = 0.01, pan0 = 0, pan1 = 0) {
    if (muted || !ensure() || !noiseB) return; try {
      const t = ctx.currentTime + when; const s = ctx.createBufferSource(); s.buffer = noiseB; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + d);
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, g * boost), t + Math.max(0.003, Math.min(attack, d * 0.9))); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(gn); let p = null; if (ctx.createStereoPanner && (pan0 || pan1)) { p = ctx.createStereoPanner(); p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + d); gn.connect(p); p.connect(bus); } else gn.connect(bus);
      s.start(t, (when * 7.31) % 0.5); s.stop(t + d + 0.05); s.onended = () => { try { s.disconnect(); fl.disconnect(); gn.disconnect(); p && p.disconnect(); } catch (_) {} };
    } catch (_) {}
  }
  /* a brass-like stab: two slightly detuned saw waves through a filter that opens on the attack */
  function brass(f, d, g, when = 0, pan = 0) {
    if (muted || !ensure() || !bus) return; try {
      const t = ctx.currentTime + when; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.6; fl.frequency.setValueAtTime(350, t); fl.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 6), t + 0.09); fl.frequency.exponentialRampToValueAtTime(Math.min(3000, f * 3), t + d);
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, g * boost), t + 0.04); gn.gain.setValueAtTime(Math.max(0.0001, g * boost * 0.8), t + Math.max(0.05, d - 0.15)); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      fl.connect(gn); const p = out(gn, pan); const os = [-7, 7].map((dc) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dc; o.connect(fl); o.start(t); o.stop(t + d + 0.03); return o; });
      os[0].onended = () => { try { os.forEach((o) => o.disconnect()); fl.disconnect(); gn.disconnect(); p && p.disconnect(); } catch (_) {} };
    } catch (_) {}
  }
  const kick = (f, d, g, when = 0) => tone(f, d, 'sine', g, when, -(f - 38));
  const bell = (f, d, g, when = 0, pan = 0) => { tone(f, d, 'sine', g, when, 0, pan); tone(f * 2, d * 0.7, 'sine', g * 0.45, when, 0, pan); tone(f * 3.01, d * 0.4, 'sine', g * 0.2, when, 0, pan); };
  const spread = (i, n, w) => (n > 1 ? (i / (n - 1) - 0.5) * w : 0);
  const chord = (fs, d, type, g, when = 0) => fs.forEach((f, i) => tone(f, d, type, g / fs.length * 1.6, when, 0, spread(i, fs.length, 0.6)));
  const brassChord = (fs, d, g, when = 0) => fs.forEach((f, i) => brass(f, d, g / fs.length * 1.5, when, spread(i, fs.length, 0.5)));
  const sparkle = (n, when, g = 0.02) => { for (let i = 0; i < n; i++) bell(1800 + ((i * 733) % 1400), 0.35, g, when + i * 0.06, ((i * 37) % 10) / 5 - 1); };
  const cymbal = (d, g, when) => hiss(d, g, when, 9000, 5000, 'highpass', 0.5, 0.004);
  const LIB = {
    click: () => { tone(1800, 0.03, 'sine', 0.022); hiss(0.03, 0.02, 0, 4000, 3000, 'highpass', 0.7, 0.002); },
    transition: () => { hiss(0.55, 0.09, 0, 400, 5200, 'bandpass', 1.4, 0.25, -0.7, 0.7); bell(1320, 0.5, 0.02, 0.35); },
    round: () => { hiss(0.6, 0.08, 0, 300, 6000, 'bandpass', 1.2, 0.45, -0.5, 0.5); kick(110, 0.6, 0.22, 0.55); cymbal(1.6, 0.05, 0.55); brassChord([392, 494, 587], 0.22, 0.12, 0.55); brassChord([523, 659, 784], 0.8, 0.14, 0.8); bell(1568, 0.9, 0.03, 0.85); },
    question: () => { hiss(0.45, 0.06, 0, 600, 4500, 'bandpass', 1.5, 0.3, 0.6, -0.6); [660, 880, 990, 1320].forEach((f, i) => bell(f, 0.55, 0.028, 0.12 + i * 0.07, (i - 1.5) * 0.3)); },
    option: () => { hiss(0.12, 0.05, 0, 1800, 700, 'bandpass', 1.8, 0.004); tone(740, 0.12, 'triangle', 0.035, 0.03); tone(1110, 0.1, 'sine', 0.02, 0.05); },
    correct: () => { kick(90, 0.3, 0.16); chord([523, 659, 784], 0.18, 'triangle', 0.07); chord([659, 784, 988], 0.18, 'triangle', 0.07, 0.11); chord([784, 988, 1175, 1568], 0.8, 'triangle', 0.08, 0.22); bell(2093, 0.9, 0.035, 0.24); sparkle(8, 0.3); },
    wrong: () => { tone(147, 0.75, 'sawtooth', 0.05); tone(149.5, 0.75, 'square', 0.035); tone(73.5, 0.75, 'sawtooth', 0.03); hiss(0.65, 0.03, 0, 900, 700, 'bandpass', 2, 0.005); kick(60, 0.4, 0.2); },   // a classic game-show buzzer
    score: () => { tone(988, 0.08, 'square', 0.022); bell(1319, 0.5, 0.035, 0.07); sparkle(3, 0.12, 0.015); },
    pass: () => { hiss(0.5, 0.08, 0, 2500, 500, 'bandpass', 1.6, 0.12, -0.9, 0.9); tone(520, 0.25, 'triangle', 0.025, 0.05, -200); },
    /* clock: a soft alternating tick-tock; in the last seconds a heartbeat with a high ping */
    tick: (low) => { const n = performance.now(); if (n - lastTick < 600) return; lastTick = n; tickFlip = !tickFlip; boost = low ? 2.4 : 20;
      if (low) { kick(95, 0.16, 0.2); kick(85, 0.16, 0.14, 0.17); tone(1760, 0.07, 'sine', 0.03); }
      else { hiss(0.04, 0.05, 0, tickFlip ? 2600 : 1900, tickFlip ? 2400 : 1700, 'bandpass', 6, 0.002); tone(tickFlip ? 1250 : 950, 0.035, 'sine', 0.018); } },
    buzzer: () => { for (let k = 0; k < 3; k++) { tone(620, 0.16, 'sawtooth', 0.016, k * 0.3, 560); tone(1180, 0.16, 'sawtooth', 0.016, k * 0.3 + 0.15, -560); } [0.95, 1.23].forEach((w) => { tone(196, 0.24, 'sawtooth', 0.05, w); tone(198, 0.24, 'square', 0.03, w); tone(98, 0.26, 'sine', 0.06, w); }); kick(60, 0.6, 0.18, 0.95); },   // time up: a short siren, then the buzzer
    fanfare: () => { hiss(1.1, 0.07, 0, 120, 170, 'lowpass', 0.7, 1.0); kick(55, 0.9, 0.25, 1.05); cymbal(2.2, 0.06, 1.05);
      brassChord([523, 659, 784], 0.28, 0.16, 1.05); brassChord([587, 740, 880], 0.28, 0.16, 1.31); brassChord([659, 831, 988], 0.28, 0.16, 1.57); brassChord([784, 988, 1175, 1568], 1.8, 0.2, 1.83); kick(65, 1.2, 0.2, 1.83); bell(2093, 1.6, 0.04, 1.85); sparkle(14, 1.9, 0.018); },
    drumroll: () => { let t = 0; for (let i = 0; i < 46; i++) { const k = i / 45; hiss(0.07, 0.03 + 0.09 * k * k, t, 2600 + ((i * 397) % 900), 1800, 'bandpass', 0.9, 0.002, -0.2 + ((i % 2) * 0.4), 0); t += 0.075 - 0.025 * k; } kick(60, 0.9, 0.3, t); cymbal(2.4, 0.09, t); },
    applause: () => { let r = 7; const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; }; for (let i = 0; i < 170; i++) { const t = rnd() * 3.6; const env = t < 0.5 ? t / 0.5 : t > 2.6 ? Math.max(0.1, 1 - (t - 2.6)) : 1; hiss(0.035, (0.025 + rnd() * 0.035) * env, t, 1200 + rnd() * 1800, 900 + rnd() * 900, 'bandpass', 1.4, 0.002, rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8); } },
    suspense: () => { brassChord([98, 104, 147], 2.2, 0.16, 0); kick(50, 1.4, 0.3, 0); tone(110, 2.2, 'sawtooth', 0.012, 0, 110); hiss(2.2, 0.03, 0, 200, 1200, 'bandpass', 2, 1.8); },
    gong: () => { [110, 167.5, 221, 289, 357, 437, 523].forEach((f, i) => tone(f, 4.5 - i * 0.4, 'sine', 0.06 / (1 + i * 0.4), 0.02 * i, 0, (i % 2 ? 0.25 : -0.25))); hiss(3, 0.03, 0, 300, 120, 'lowpass', 0.7, 0.01); kick(70, 1, 0.2, 0); },
    cdhit: (n) => { const k = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 5; const f = 660 + (10 - k) * 75; kick(70, 0.45, 0.24); hiss(0.35, 0.06, 0, 5000, 600, 'bandpass', 1.2, 0.004, -0.4, 0.4); bell(f, 0.35, 0.03, 0.02); bell(f * 1.5, 0.3, 0.015, 0.05, k % 2 ? -0.4 : 0.4); if (k <= 3) { bell(f * 2, 0.45, 0.03, 0.12); tone(f / 2, 0.3, 'square', 0.014, 0.02); } },   // the pitch climbs as the count falls; the last three get an extra accent
    ding: () => { bell(1319, 1.2, 0.06); bell(1760, 1.4, 0.04, 0.12); },
    reveal: () => { hiss(0.45, 0.07, 0, 400, 7000, 'bandpass', 1.3, 0.4); tone(330, 0.45, 'sawtooth', 0.012, 0, 660); kick(70, 0.7, 0.24, 0.45); cymbal(1.3, 0.05, 0.45); chord([392, 494, 587, 784], 0.7, 'triangle', 0.06, 0.45); },
    siren: () => { for (let k = 0; k < 6; k++) { tone(620, 0.16, 'sawtooth', 0.035, k * 0.3, 560); tone(1180, 0.16, 'sawtooth', 0.035, k * 0.3 + 0.15, -560); } },
    laser: () => { [0, 0.09, 0.18].forEach((w, i) => tone(2400, 0.6, 'sawtooth', 0.05 * Math.pow(0.45, i), w, -2310)); },
    heartbeat: () => { for (let k = 0; k < 3; k++) { kick(62, 0.22, 0.3, k * 0.9); kick(56, 0.2, 0.2, k * 0.9 + 0.22); } },
    rin1: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => bell(f, 0.45, 0.034, i * 0.085, (i - 2.5) * 0.28)); kick(100, 0.3, 0.16, 0.5); sparkle(6, 0.55, 0.018); chord([784, 988, 1175, 1568], 0.9, 'triangle', 0.07, 0.52); },
    rin2: () => { hiss(0.9, 0.05, 0, 200, 900, 'bandpass', 1.2, 0.5); brassChord([294, 370, 440], 0.9, 0.13, 0.35); brassChord([330, 415, 494, 659], 1.1, 0.14, 0.95); kick(60, 0.9, 0.22, 0.35); bell(1175, 1.2, 0.03, 1.0); },
    rin3: () => { for (let k = 0; k < 7; k++) hiss(0.05, 0.05, k * 0.07, 2500, 1500, 'bandpass', 2, 0.002, -0.5, 0.5); tone(196, 1.0, 'sawtooth', 0.02, 0.5, 700); hiss(1.0, 0.05, 0.5, 300, 6500, 'bandpass', 1.3, 0.6); chord([392, 494, 587, 740], 0.9, 'triangle', 0.07, 1.4); bell(1568, 1.2, 0.035, 1.42); sparkle(5, 1.5, 0.016); },
    rin4: () => { tone(220, 1.2, 'sine', 0.06, 0); tone(233, 1.2, 'sine', 0.05, 0); kick(52, 1.0, 0.2, 0); [880, 831, 740].forEach((f, i) => bell(f, 0.9, 0.03, 0.5 + i * 0.35)); chord([196, 233, 294], 1.2, 'triangle', 0.06, 1.2); },
    rin5: () => { for (let k = 0; k < 8; k++) { tone(660 + k * 110, 0.09, 'square', 0.028, k * 0.075); kick(110, 0.12, 0.12, k * 0.075); } hiss(0.5, 0.06, 0.6, 600, 8000, 'bandpass', 1.4, 0.2); brassChord([523, 659, 784], 0.5, 0.15, 0.62); cymbal(1.0, 0.05, 0.62); },
    rin6: () => { hiss(0.8, 0.07, 0, 150, 300, 'lowpass', 0.7, 0.7); kick(55, 0.8, 0.24, 0.8); cymbal(2, 0.06, 0.8); brassChord([523, 659, 784], 0.3, 0.15, 0.8); brassChord([659, 831, 988], 0.3, 0.15, 1.1); brassChord([784, 988, 1175, 1568], 1.4, 0.18, 1.4); bell(2093, 1.4, 0.035, 1.42); sparkle(8, 1.5); },
    rq1: () => { bell(988, 0.35, 0.03); bell(1319, 0.4, 0.03, 0.08); },
    rq2: () => { kick(70, 0.35, 0.2); kick(60, 0.4, 0.2, 0.18); bell(740, 0.7, 0.03, 0.2); },
    rq3: () => { hiss(0.04, 0.05, 0, 3000, 2000, 'bandpass', 2, 0.002); hiss(0.5, 0.04, 0.05, 500, 5000, 'bandpass', 1.4, 0.3); bell(1480, 0.5, 0.025, 0.4); },
    rq4: () => { bell(880, 0.5, 0.03); bell(831, 0.6, 0.026, 0.15); tone(110, 0.5, 'sine', 0.05, 0); },
    rq5: () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.07, 'square', 0.026, i * 0.06)); },
    rq6: () => { brassChord([523, 659, 784], 0.35, 0.12); bell(1568, 0.6, 0.03, 0.05); },
  };
  /* renders one built-in sound offline (used by the self-test); the live chain is restored before this returns */
  function render(name, rate = 48000) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC || !LIB[name]) return Promise.resolve(null);
    const off = new OAC(2, Math.ceil(rate * 3), rate); const saved = { ctx, master, bus, noiseB, muted, boost };
    try { ctx = off; master = off.createGain(); master.connect(off.destination); bus = off.createGain(); bus.connect(master); noiseB = makeNoise(off); muted = false; boost = LEVEL[name] || 1; LIB[name](); }
    finally { ({ ctx, master, bus, noiseB, muted, boost } = saved); }
    return off.startRendering();
  }
  function testTone(pan) { if (muted || !ensure()) return false; try { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 440; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(g); if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master); o.start(t); o.stop(t + 0.95); return true; } catch (_) { return false; } }
  function playBuffer(buf, g = 1) { if (muted || !ensure() || !buf) return false; try { const s = ctx.createBufferSource(); s.buffer = buf; const gn = ctx.createGain(); gn.gain.value = g; s.connect(gn); gn.connect(master); s.start(); s.onended = () => { try { s.disconnect(); gn.disconnect(); } catch (_) {} }; return true; } catch (_) { return false; } }
  return { attach, playBuffer, render, decode(ab) { return ensure() ? ctx.decodeAudioData(ab) : Promise.reject(new Error('audio unavailable')); }, testTone, play(n, a) { try { const f = LIB[n]; boost = LEVEL[n] || 1; f && f(a); } catch (_) {} finally { boost = 1; } }, setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = vol; }, setMuted(m) { muted = !!m; }, get muted() { return muted; }, get ctx() { return ctx; }, names: () => Object.keys(LIB) };
})();

/* the countdown voice: a female English voice counts "ten ... one, go" (an Indian English voice is preferred when installed) */
const CountVoice = (() => {
  let v = null; const WORDS = ['Go!', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  function pick() { try { const vs = speechSynthesis.getVoices().filter((x) => /^en/i.test(x.lang || '')); for (const r of [/neerja/i, /heera/i, /aria/i, /jenny/i, /zira/i, /sonia/i, /libby/i, /female/i, /samantha/i, /hazel/i, /susan/i]) { const f = vs.find((x) => r.test(x.name || '')); if (f) return f; } return vs.find((x) => /en-IN/i.test(x.lang)) || vs[0] || null; } catch (_) { return null; } }
  function say(n) { try { if (typeof speechSynthesis === 'undefined' || n < 0 || n > 10) return; if (!v) v = pick(); speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(WORDS[n]); u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v; u.rate = n === 0 ? 0.95 : 1.05; u.pitch = 1.15; u.volume = 1; speechSynthesis.speak(u); } catch (_) {} }
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', () => { v = null; }); } catch (_) {}
  return { say, voiceName: () => { const x = v || pick(); return x ? x.name : 'none'; } };
})();

const Music = (() => {
  const MOOD_LIST = ['calm', 'lounge', 'focus', 'suspense', 'celebrate'];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const LOOKAHEAD = 3.2, TRIM = 0.5, DEFAULT_VOL = 0.35;
  const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const outGainFor = (v) => TRIM * Math.pow(Math.max(0, v) / DEFAULT_VOL, 1.5);

  /* ---------- graph pieces ---------- */
  function impulse(c) { const len = Math.floor(c.sampleRate * 2.4); const buf = c.createBuffer(2, len, c.sampleRate); const r = rng32(1234567); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let prev = 0; for (let i = 0; i < len; i++) { const x = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6); prev = 0.55 * x + 0.45 * prev; d[i] = prev; } } return buf; }
  function noiseBuf(c) { const len = c.sampleRate; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0); const r = rng32(7654321); for (let i = 0; i < len; i++) d[i] = r() * 2 - 1; return buf; }
  function buildGraph(c, live) {
    const mix = c.createGain(); const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3.2; comp.attack.value = 0.012; comp.release.value = 0.28;
    const out = c.createGain(); out.gain.value = live ? 0 : 1; const lim = c.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
    const sh = c.createWaveShaper(); const cv = new Float32Array(4097); for (let i = 0; i < cv.length; i++) { const x = (i / 2048) - 1, a = Math.abs(x); cv[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28)); } sh.curve = cv; sh.oversample = '2x';
    mix.connect(comp); comp.connect(out); out.connect(lim); lim.connect(sh); const conv = c.createConvolver(); conv.buffer = impulse(c); const ret = c.createGain(); ret.gain.value = 0.5; conv.connect(ret); ret.connect(mix);
    return { mix, comp, out, lim, end: sh, conv, noise: noiseBuf(c) };
  }
  function makeBus(c, g) { const dry = c.createGain(); dry.connect(g.mix); const wet = c.createGain(); wet.connect(g.conv); return { dry, wet }; }

  /* ---------- instrument voices (all take an absolute start time t) ---------- */
  function voices(c, bus, noise, r) {
    const send = (node, wet) => { node.connect(bus.dry); if (wet > 0) { const w = c.createGain(); w.gain.value = wet; node.connect(w); w.connect(bus.wet); } };
    const noiseSrc = (t, dur) => { const s = c.createBufferSource(); s.buffer = noise; s.start(t, r() * 0.5); s.stop(t + dur + 0.02); return s; };
    return {
      pad(t, dur, notes, g, cutoff = 1100) {
        const att = Math.min(1.0, dur * 0.3), rel = Math.min(1.3, dur * 0.35), lvl = (g / notes.length) * 1.7;
        notes.forEach((n) => { const f = midi(n); const vg = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4;
          vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(lvl, t + att); vg.gain.setValueAtTime(lvl, t + dur - rel); vg.gain.linearRampToValueAtTime(0.0001, t + dur);
          for (const d of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); } lp.connect(vg); send(vg, 0.55); });
      },
      pluck(t, note, g, dur = 0.6, type = 'triangle', wet = 0.35, bright = 2600) {
        const o = c.createOscillator(); o.type = type; o.frequency.value = midi(note); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(420, t + dur);
        const vg = c.createGain(); vg.gain.setValueAtTime(0.0001, t); vg.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.008); vg.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(lp); lp.connect(vg); send(vg, wet); o.start(t); o.stop(t + dur + 0.05);
      },
      bell(t, note, g, dur = 1.7, wet = 0.6) {
        const f = midi(note); const ca = c.createOscillator(), mo = c.createOscillator(), mg = c.createGain(), vg = c.createGain(); ca.frequency.value = f; mo.frequency.value = f * 3.5;
        mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.7); mo.connect(mg); mg.connect(ca.frequency);
        vg.gain.setValueAtTime(0.0001, t); vg.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.006); vg.gain.exponentialRampToValueAtTime(0.0001, t + dur); ca.connect(vg); send(vg, wet);
        mo.start(t); ca.start(t); mo.stop(t + dur + 0.05); ca.stop(t + dur + 0.05);
      },
      bass(t, note, g, dur = 0.7) {
        const f = midi(note); const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f; const g2 = c.createGain(); g2.gain.value = 0.22;
        const vg = c.createGain(); vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(g, t + 0.02); vg.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(vg); o2.connect(g2); g2.connect(vg); vg.connect(bus.dry); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      },
      kick(t, g) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(135, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.13); const vg = c.createGain(); vg.gain.setValueAtTime(Math.max(0.0002, g), t); vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(vg); vg.connect(bus.dry); o.start(t); o.stop(t + 0.4); },
      hat(t, g, open = false) { const s = noiseSrc(t, open ? 0.25 : 0.06); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500; const vg = c.createGain(); vg.gain.setValueAtTime(Math.max(0.0002, g), t); vg.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.22 : 0.045)); s.connect(hp); hp.connect(vg); vg.connect(bus.dry); },
      clap(t, g) { const s = noiseSrc(t, 0.2); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8; const vg = c.createGain(); vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(Math.max(0.0002, g), t + 0.004); vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); s.connect(bp); bp.connect(vg); send(vg, 0.25); },
      stab(t, notes, g, dur = 0.28) { notes.forEach((n) => { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(600, t + dur); const vg = c.createGain(); vg.gain.setValueAtTime(0.0001, t); vg.gain.exponentialRampToValueAtTime(Math.max(0.0002, g / notes.length * 1.6), t + 0.012); vg.gain.exponentialRampToValueAtTime(0.0001, t + dur); for (const d of [-9, 9]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); } lp.connect(vg); send(vg, 0.3); }); },
      riser(t, dur, g) { const s = noiseSrc(t, dur); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(4200, t + dur); const vg = c.createGain(); vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(g, t + dur * 0.95); vg.gain.linearRampToValueAtTime(0.0001, t + dur); s.connect(bp); bp.connect(vg); send(vg, 0.5); },
    };
  }

  /* ---------- compositions: each bar function writes one bar of music at time t0 ---------- */
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const CALM = [{ r: 48, ch: [60, 64, 67, 71, 74] }, { r: 45, ch: [57, 60, 64, 67, 71] }, { r: 41, ch: [53, 57, 60, 64, 67] }, { r: 43, ch: [55, 59, 62, 64, 69] }, { r: 48, ch: [55, 60, 64, 67, 71] }, { r: 40, ch: [52, 55, 59, 62, 67] }, { r: 41, ch: [53, 57, 60, 64, 67] }, { r: 43, ch: [55, 60, 62, 67, 71] }];
  const LOUNGE = [{ r: 41, ch: [53, 57, 60, 64] }, { r: 38, ch: [50, 53, 57, 60] }, { r: 46, ch: [58, 62, 65, 69] }, { r: 48, ch: [52, 55, 58, 60] }];
  const FOCUS = [{ r: 45, ch: [57, 60, 64] }, { r: 45, ch: [57, 60, 64] }, { r: 41, ch: [53, 57, 60] }, { r: 43, ch: [55, 59, 62] }];
  const SUSP = [{ r: 38, ch: [50, 57, 62, 65] }, { r: 46, ch: [46, 53, 58, 62] }, { r: 43, ch: [43, 50, 55, 58] }, { r: 45, ch: [45, 52, 57, 61] }];
  const CELEB = [{ r: 48, ch: [60, 64, 67, 72] }, { r: 47, ch: [59, 62, 67, 71] }, { r: 45, ch: [57, 60, 64, 69] }, { r: 41, ch: [53, 57, 60, 65] }, { r: 48, ch: [60, 64, 67, 72] }, { r: 43, ch: [55, 59, 62, 67] }, { r: 41, ch: [53, 57, 60, 65] }, { r: 43, ch: [55, 59, 62, 67] }];
  const MOODS = {
    calm: { bpm: 74, key: 'C major', bar(v, t0, bar, r) {
      const b = 60 / 74, ch = CALM[bar % 8], bd = b * 4; v.pad(t0, bd + 1.2, ch.ch, 0.075, 1000); v.bass(t0, ch.r, 0.17, b * 1.8); v.bass(t0 + b * 2, ch.r, 0.11, b * 1.6);
      const pat = [0, 2, 3, 2, 1, 3, 4, 3]; for (let i = 0; i < 8; i++) { const n = ch.ch[pat[i] % ch.ch.length] + 12; v.pluck(t0 + i * b / 2, n, 0.03 * (0.8 + r() * 0.4), 0.9, 'triangle', 0.5, 2200); }
      v.bell(t0, ch.ch[ch.ch.length - 1] + 12, 0.03, 2.2, 0.7); if (bar % 2 === 0) { const pent = [72, 74, 76, 79, 81, 84]; for (const pos of [0.5, 1.5, 2.5, 3]) if (r() < 0.6) v.bell(t0 + pos * b, pick(r, pent), 0.024, 1.6, 0.7); }
    } },
    lounge: { bpm: 90, key: 'F major', bar(v, t0, bar, r) {
      const b = 60 / 90, ch = LOUNGE[bar % 4], sw = 0.12 * b; v.pad(t0, b * 4 + 0.9, ch.ch, 0.05, 900);
      v.kick(t0, 0.15); v.kick(t0 + b * 2, 0.13); if (bar % 4 === 3) v.kick(t0 + b * 3.5, 0.07);
      for (let i = 0; i < 8; i++) v.hat(t0 + i * b / 2 + (i % 2 ? sw : 0), i % 2 ? 0.024 : 0.014);
      for (const pos of [0, 1.5, 3]) ch.ch.forEach((n, k) => v.pluck(t0 + pos * b + (pos % 1 ? sw : 0) + k * 0.012, n, 0.03, 0.55, 'triangle', 0.4, 1800));
      v.bass(t0, ch.r, 0.16, b * 1.4); v.bass(t0 + b * 2, ch.r + 7, 0.12, b * 1.2); v.bass(t0 + b * 3.5, ch.r + (r() < 0.5 ? 2 : -1), 0.08, b * 0.5);
      if (bar % 2 === 1) for (const pos of [1, 2.5]) if (r() < 0.7) v.bell(t0 + pos * b, pick(r, [65, 67, 69, 72, 74, 77]), 0.022, 1.4, 0.6);
    } },
    focus: { bpm: 100, key: 'A minor', bar(v, t0, bar, r, hot) {
      const b = 0.6, ch = FOCUS[bar % 4]; v.pad(t0, b * 4 + 0.8, ch.ch, 0.06, 760);
      const oct = [0, 0, 12, 0, 0, 12, 0, 12]; for (let i = 0; i < 8; i++) v.bass(t0 + i * b / 2, ch.r + oct[i], hot ? 0.13 : 0.1, 0.2);
      for (let i = 0; i < 16; i++) if (r() < 0.26) v.pluck(t0 + i * b / 4, pick(r, [69, 72, 74, 76, 79]), 0.02, 0.3, 'triangle', 0.4, 1800);
      for (let i = 0; i < 8; i++) if (i % 2) v.hat(t0 + i * b / 2, hot ? 0.02 : 0.012); if (hot) for (let i = 0; i < 16; i += 2) v.hat(t0 + (i + 1) * b / 4, 0.014);
      if (hot) for (let i = 0; i < 4; i++) v.kick(t0 + i * b, 0.11); else if (bar % 2 === 0) v.kick(t0, 0.09);
    } },
    suspense: { bpm: 66, key: 'D minor', bar(v, t0, bar, r) {
      const b = 60 / 66, ch = SUSP[bar % 4]; v.pad(t0, b * 4 + 1.4, ch.ch, 0.085, 700);
      for (let i = 0; i < 4; i++) { v.kick(t0 + i * b, 0.15); v.kick(t0 + i * b + b * 0.42, 0.075); }
      v.bass(t0, ch.r, 0.15, b * 3.4); const hi = [74, 77, 81, 86, 81, 77, 74, 69]; v.bell(t0 + b * 0.5, hi[bar % 8], 0.02, 3.2, 0.8);
      if (bar % 8 === 7) v.riser(t0, b * 4, 0.035);
    } },
    celebrate: { bpm: 116, key: 'C major', bar(v, t0, bar, r) {
      const b = 60 / 116, ch = CELEB[bar % 8]; v.pad(t0, b * 4 + 0.6, ch.ch, 0.06, 1500);
      v.kick(t0, 0.18); v.kick(t0 + b * 2, 0.16); v.clap(t0 + b, 0.05); v.clap(t0 + b * 3, 0.05); for (let i = 0; i < 8; i++) v.hat(t0 + i * b / 2, i % 2 ? 0.024 : 0.014, i === 7);
      v.stab(t0, ch.ch, 0.05); v.stab(t0 + b * 1.5, ch.ch, 0.04); v.stab(t0 + b * 3, ch.ch, 0.04);
      for (let i = 0; i < 16; i++) v.bell(t0 + i * b / 4, ch.ch[i % 4] + 12 * (1 + Math.floor((i % 8) / 4)), 0.02 * (0.85 + r() * 0.3), 0.9, 0.5);
      v.bass(t0, ch.r, 0.18, b * 1.5); v.bass(t0 + b * 1.5, ch.r + 12, 0.11, b * 0.5); v.bass(t0 + b * 2, ch.r, 0.16, b * 1.5); v.bass(t0 + b * 3.5, ch.r + 7, 0.1, b * 0.5);
    } },
  };
  const barDur = (m) => (60 / MOODS[m].bpm) * 4;
  const barRng = (m, bar) => rng32(seedOf(m) + bar * 7919);

  /* ---------- engine state: sound only. The Sound director sets the level (0 = silent). ---------- */
  let ctx = null, gr = null, cur = null, timer = null, lastT = -1, level = 0, vol = DEFAULT_VOL, source = 'generated', phaseMood = null, previewMood = null, previewTimer = 0, hot = 0;
  const listeners = []; let customEl = null, customSrc = null, customGain = null, customName = '', customPauseT = 0; const moodEls = {}, moodNames = {}; const pauseTimers = new Map();   // one pending pause per music file (a timer restarted on every tick never fires)
  const notify = () => { for (const f of listeners) { try { f(); } catch (_) {} } };
  let phaseFallback = null;   // the mood to use if the embedded Tagore track is not (yet) loaded
  const TAGORE = 'tagore';
  const effMood = () => previewMood || (phaseMood === TAGORE && !moodEls[TAGORE] ? phaseFallback : phaseMood);
  const wantAudible = () => level > 0 && !!effMood();
  const fileEl = () => { const m = effMood(); return (m && moodEls[m]) || (source === 'custom' ? customEl : null); };
  const useCustom = () => !!fileEl();
  function syncFiles() {
    const fe = fileEl(); const all = [customEl, ...Object.values(moodEls)].filter(Boolean); const on = wantAudible() && lastT > 0;
    for (const e of all) { if (e !== fe || !on) { if (!e.paused && !pauseTimers.has(e)) { const x = e; pauseTimers.set(x, setTimeout(() => { pauseTimers.delete(x); if (fileEl() !== x || !wantAudible()) { try { x.pause(); } catch (_) {} } }, 400)); } } }
    if (fe && on && fe.paused) { const p = fe.play(); p && p.catch && p.catch(() => {}); }
  }
  function applyGain() {
    if (!ctx || !gr) return; const t = wantAudible() ? outGainFor(vol) * level : 0; if (Math.abs(t - lastT) >= 1e-5) { const up = t > lastT; lastT = t; gr.out.gain.setTargetAtTime(t, ctx.currentTime, up ? 0.7 : 0.06); } syncFiles();
  }
  function startMood(name) {
    if (!ctx) return; const now = ctx.currentTime;
    if (cur) { const old = cur; old.bus.dry.gain.setTargetAtTime(0, now, 0.6); old.bus.wet.gain.setTargetAtTime(0, now, 0.6); setTimeout(() => { try { old.bus.dry.disconnect(); old.bus.wet.disconnect(); } catch (_) {} }, 6000); cur = null; }
    if (!name || useCustom()) return; const bus = makeBus(ctx, gr); bus.dry.gain.setValueAtTime(0, now); bus.dry.gain.linearRampToValueAtTime(1, now + 2.5); bus.wet.gain.setValueAtTime(0, now); bus.wet.gain.linearRampToValueAtTime(1, now + 2.5);
    cur = { mood: name, bus, nextT: now + 0.25, bar: 0 };
  }
  function tick() {
    if (!ctx || !gr) return; applyGain(); const want = effMood(); if (cur && (!want || want !== cur.mood)) startMood(want); else if (!cur && want && !useCustom()) startMood(want);
    if (!cur) return; const now = ctx.currentTime; if (!wantAudible()) { cur.nextT = Math.max(cur.nextT, now + 0.2); return; }
    const M = MOODS[cur.mood]; let guard = 0;
    while (cur.nextT < now + LOOKAHEAD && guard++ < 6) { const r = barRng(cur.mood, cur.bar); const v = voices(ctx, cur.bus, gr.noise, r); try { M.bar(v, cur.nextT, cur.bar, r, hot === 1 && cur.mood === 'focus'); } catch (_) {} cur.nextT += barDur(cur.mood); cur.bar++; }
  }
  async function loadFileEl(file) {
    if (!file || !/^audio\//.test(file.type) || file.size > 400e6) throw new Error('Choose an audio file (MP3, WAV, OGG, M4A).'); if (!ctx) throw new Error('Audio is not available.');
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.src = URL.createObjectURL(file);
    await new Promise((res, rej) => { el.addEventListener('canplay', res, { once: true }); el.addEventListener('error', () => rej(new Error('This audio file cannot be decoded.')), { once: true }); });
    if (!customGain) { customGain = ctx.createGain(); customGain.connect(gr.mix); } ctx.createMediaElementSource(el).connect(customGain); return el;
  }
  const drop = (e) => { if (e) { try { e.pause(); URL.revokeObjectURL(e.src); } catch (_) {} } };
  const api = {
    MOOD_LIST, MOODS: Object.fromEntries(MOOD_LIST.map((m) => [m, { bpm: MOODS[m].bpm, key: MOODS[m].key, barSec: barDur(m) }])),
    /* the director hands over its AudioContext */
    attach(c) { if (ctx === c) return true; ctx = c; gr = buildGraph(ctx, true); gr.an = ctx.createAnalyser(); gr.an.fftSize = 2048; gr.end.connect(gr.an); gr.end.connect(ctx.destination); timer = setInterval(tick, 50); tick(); return true; },
    setMood(m, fb) { const n = (MOOD_LIST.includes(m) || m === TAGORE) ? m : null; const f = MOOD_LIST.includes(fb) ? fb : null; if (n === phaseMood && f === phaseFallback) return; phaseMood = n; phaseFallback = f; tick(); notify(); },
    setIntensity(v) { hot = v ? 1 : 0; },
    setVolume(v) { const n = Math.max(0, Math.min(1, Number(v))); if (Number.isFinite(n) && n !== vol) { vol = n; applyGain(); notify(); } },
    setSource(src) { const ns = src === 'custom' ? 'custom' : 'generated'; if (ns === source) return; source = ns; lastT = -1; if (cur) startMood(null); tick(); notify(); },
    setLevel(l) { const n = Math.max(0, Math.min(1, Number(l) || 0)); if (n === level) return; level = n; applyGain(); },
    preview(m) { if (!MOOD_LIST.includes(m)) return; previewMood = m; clearTimeout(previewTimer); previewTimer = setTimeout(() => api.stopPreview(), 30000); tick(); notify(); },
    stopPreview() { clearTimeout(previewTimer); if (previewMood) { previewMood = null; tick(); notify(); } },
    async loadCustom(file) { const el = await loadFileEl(file); drop(customEl); customEl = el; customName = file.name.slice(0, 100); lastT = -1; if (source === 'custom' && cur) startMood(null); tick(); notify(); return customName; },
    async setMoodFile(mood, file) { if (!MOOD_LIST.includes(mood) && mood !== TAGORE) throw new Error('unknown mood'); const el = await loadFileEl(file); drop(moodEls[mood]); moodEls[mood] = el; moodNames[mood] = file.name.slice(0, 100); if (cur) startMood(null); lastT = -1; tick(); notify(); return moodNames[mood]; },
    clearMoodFile(mood) { drop(moodEls[mood]); delete moodEls[mood]; delete moodNames[mood]; lastT = -1; tick(); notify(); },
    clearCustom() { drop(customEl); customEl = null; customName = ''; if (source === 'custom') { lastT = -1; tick(); } notify(); },
    onChange(f) { listeners.push(f); },
    /* output level of the music bus, for the level meter */
    meter() { if (!gr || !gr.an) return 0; const b = gr.buf || (gr.buf = new Float32Array(gr.an.fftSize)); gr.an.getFloatTimeDomainData(b); let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length); },
    state() { return { mood: effMood(), phase: phaseMood, preview: previewMood, vol, source, hasCustom: !!customEl, customName, moodFiles: { ...moodNames }, target: lastT, ctx: ctx ? ctx.state : 'none', intensity: hot, playing: !!cur, custom: useCustom(), level, tagoreLoaded: !!moodEls[TAGORE], tagorePlaying: !!(moodEls[TAGORE] && !moodEls[TAGORE].paused), tagoreT: moodEls[TAGORE] ? moodEls[TAGORE].currentTime : 0, fileOn: (() => { const fe = fileEl(); return !!(fe && !fe.paused); })(), fileT: (() => { const fe = fileEl(); return fe ? fe.currentTime : 0; })() }; },
    async render(mood, seconds, sr = 22050, v = DEFAULT_VOL) {
      if (!MOODS[mood]) throw new Error('unknown mood'); const oc = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr); const g = buildGraph(oc, false); g.out.gain.value = outGainFor(v); g.end.connect(oc.destination); const bus = makeBus(oc, g);
      for (let bar = 0, t = 0.05; t < seconds; bar++, t += barDur(mood)) { const r = barRng(mood, bar); MOODS[mood].bar(voices(oc, bus, g.noise, r), t, bar, r, false); } const buf = await oc.startRendering(); return { sampleRate: sr, l: buf.getChannelData(0), r: buf.getChannelData(1) };
    },
  };
  return api;
})();

/* ---------- Sound director: music mood per scene + V100 sound policy ---------- */
const SoundDirector = {
  duckUntil: 0,
  duckLevel: 1,
  muted: false,
  tagoreStatus: 'idle',
  started: false,
  /** Which generative mood fits the current scene (V100 moodFor). */
  moodFor(s) {
    const sc = s.show.scene;
    if (['CREW', 'TEAMS_ALL', 'TEAM_INTRO', 'FINALIST_INTRO', 'PRELIM_RULES', 'PRELIM_RESULT', 'ROUND_INTRO', 'ROUND_RULES', 'GIFT', 'PODIUM', 'PROGRAMME', 'PRELIM_COUNTDOWN', 'MAIN_COUNTDOWN'].includes(sc)) return 'calm';
    if (['FINALISTS', 'GRID'].includes(sc)) return 'lounge';
    if (['PRELIM_Q', 'QUESTION'].includes(sc)) return 'focus';
    if (sc === 'FINAL') return 'suspense';
    if (['SCOREBOARD', 'TOP3', 'WINNER'].includes(sc)) return 'celebrate';
    return null; // ORGANIZER, LOGO, THEME, WELCOME, END: the songs / silence own these screens
  },
  /** V100 rule: the Tagore instrumental plays on round rules, board and questions of the first three played rounds. */
  tagoreWanted(s) {
    if (!s.audio.bgm.tagore) return false;
    if (!['ROUND_INTRO', 'ROUND_RULES', 'GRID', 'QUESTION'].includes(s.show.scene)) return false;
    const rid = s.show.params.roundId || s.live.roundId;
    const played = s.rounds.filter((r) => r.enabled && Sel.roundQuestions(r.id).length).slice(0, 3).map((r) => r.id);
    return played.includes(rid);
  },
  duck(level, ms) { this.duckLevel = Math.min(this.duckUntil > performance.now() ? this.duckLevel : 1, level); this.duckUntil = Math.max(this.duckUntil, performance.now() + ms); },
  async loadTagore() {
    if (this.tagoreStatus !== 'idle') return;
    this.tagoreStatus = 'loading';
    try {
      const u = await Media.url('asset:welcome');
      if (!u) throw new Error('no embedded track');
      const blob = await (await fetch(u)).blob();
      await Music.setMoodFile('tagore', new File([blob], 'Tagore instrumental.mp3', { type: blob.type || 'audio/mpeg' }));
      this.tagoreStatus = 'ready';
    } catch (e) { this.tagoreStatus = 'failed'; Log.add('WARN', 'Tagore track: ' + (e.message || e)); }
  },
  start(ctx) {
    if (this.started) return;
    this.started = true;
    Sfx.attach(ctx);
    Music.attach(ctx);
    this.loadTagore();
    setInterval(() => safe('sound-director', () => this.tick()), 100);
  },
  tick() {
    const s = Store.state;
    const b = s.audio.bgm;
    const songPlaying = Object.keys(AudioDirector.musicEls).length > 0;
    const t = Sel.timerRemaining(s.timer);
    Music.setIntensity(s.show.scene === 'QUESTION' && s.timer.running && t <= s.settings.warnAt * 1000);
    const mood = this.moodFor(s);
    if (this.tagoreWanted(s)) Music.setMood('tagore', mood); else Music.setMood(mood, null);
    Music.setVolume(b.vol * s.audio.master);
    let level = 1;
    if (!b.on || this.muted || songPlaying || !AudioDirector.isOutput()) level = 0;
    else {
      if ('speechSynthesis' in window && speechSynthesis.speaking) level = Math.min(level, 0.2);
      if (performance.now() < this.duckUntil) level = Math.min(level, this.duckLevel);
    }
    Music.setLevel(level);
  },
  setMuted(m) {
    this.muted = !!m;
    Sfx.setMuted(this.muted);
    Object.values(AudioDirector.musicEls).forEach((el) => { el.muted = this.muted; });
    if (this.muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  },
};
/* Effects that duck the music harder (V100 SOUND_POLICY.heavy) and the one that never ducks (tick). */
const HEAVY_SFX = new Set(['buzzer', 'fanfare', 'drumroll', 'applause', 'gong', 'suspense']);
