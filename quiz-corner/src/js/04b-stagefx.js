/* =====================================================================
   STAGE EFFECTS (ported from V100): WebGL 3D background, round mood
   colours; plus fireworks, calibration screens and the TV test card.
   ===================================================================== */
/* ===================== STAGE 3D BACKGROUND — real WebGL, written for this file (no library, nothing to download) =====================
   Three layers on the graphics card: (1) a field of glowing particles flying slowly towards the audience, (2) a turning
   "node cycle" — a ring of light nodes joined by lines, with light pulses running along the lines, (3) one moving key light
   that shades every node like a small sphere (lit side, dark side, highlight, rim), so light and shadow move in real time.
   Every position is computed on the graphics card from fixed seeds: the main thread only sets a few numbers per frame.
   Returns null when WebGL is not available (or would run in slow software mode): the CSS background then stays as it is. */
function createStageGL(canvas, o = {}) {
  const ctxOpt = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !!o.keep, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !o.allowSoftware };
  let gl = null; try { gl = canvas.getContext('webgl', ctxOpt) || null; } catch (_) { gl = null; }
  if (!gl) return null;
  const N_PART = 900, N_NODE = 84;
  let rnd = 97531; const r01 = () => { rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0; return rnd / 4294967296; };
  /* fixed geometry (built once) */
  const seeds = new Float32Array(N_PART * 4); for (let i = 0; i < N_PART; i++) { seeds[i * 4] = r01() * 2 - 1; seeds[i * 4 + 1] = r01() * 2 - 1; seeds[i * 4 + 2] = r01(); seeds[i * 4 + 3] = r01(); }
  const nodes = []; for (let i = 0; i < N_NODE; i++) { const t = (i / N_NODE) * Math.PI * 2; const R = 2.05, rr = 0.62; const x = (R + rr * Math.cos(3 * t)) * Math.cos(2 * t), y = (R + rr * Math.cos(3 * t)) * Math.sin(2 * t), z = rr * Math.sin(3 * t) * 1.6; nodes.push([x + (r01() - 0.5) * 0.18, y + (r01() - 0.5) * 0.18, z + (r01() - 0.5) * 0.18, r01()]); }
  const edges = []; const has = new Set(); const addE = (a, b) => { const k = a < b ? a + ':' + b : b + ':' + a; if (a !== b && !has.has(k)) { has.add(k); edges.push([a, b]); } };
  for (let i = 0; i < N_NODE; i++) { addE(i, (i + 1) % N_NODE); const d = nodes.map((n, j) => [j, (n[0] - nodes[i][0]) ** 2 + (n[1] - nodes[i][1]) ** 2 + (n[2] - nodes[i][2]) ** 2]).sort((a, b) => a[1] - b[1]); for (let k = 1; k <= 3; k++) if (d[k][1] < 0.55) addE(i, d[k][0]); }
  const nodeBuf = new Float32Array(N_NODE * 4); nodes.forEach((n, i) => nodeBuf.set(n, i * 4));
  const lineBuf = new Float32Array(edges.length * 6); edges.forEach(([a, b], i) => { lineBuf.set(nodes[a].slice(0, 3), i * 6); lineBuf.set(nodes[b].slice(0, 3), i * 6 + 3); });
  const pulseBuf = new Float32Array(edges.length * 7); edges.forEach(([a, b], i) => { pulseBuf.set(nodes[a].slice(0, 3), i * 7); pulseBuf.set(nodes[b].slice(0, 3), i * 7 + 3); pulseBuf[i * 7 + 6] = r01(); });
  /* shaders: projection is done by hand (camera at z = 4 looking down -z) */
  const PROJ = 'uniform float uAspect,uF,uH,uScale;vec4 proj(vec3 p){float d=4.0-p.z;return vec4(p.x*uF/uAspect,p.y*uF,0.0,d);}';
  const SRC = {
    partV: 'attribute vec4 aSeed;uniform float uT,uSpeed;uniform mat3 uCam;varying float vA;varying float vW;' + PROJ + 'void main(){float z=fract(aSeed.z+uT*uSpeed*(0.6+0.8*aSeed.w));vec3 p=vec3(aSeed.x*3.0+sin(uT*0.3+aSeed.w*6.28)*0.15,aSeed.y*1.8+cos(uT*0.25+aSeed.w*9.0)*0.12,mix(-7.0,2.0,z));p=uCam*p;gl_Position=proj(p);float d=4.0-p.z;gl_PointSize=clamp((0.03+0.05*aSeed.w)*uF*uH/d*uScale,1.0,48.0);vA=smoothstep(0.0,0.18,z)*(1.0-smoothstep(0.82,1.0,z));vW=aSeed.w;}',
    partF: 'precision mediump float;uniform vec3 uA,uB,uC;varying float vA;varying float vW;void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=dot(q,q);if(r>1.0)discard;float g=exp(-r*3.6);vec3 c=mix(mix(uA,uB,vW),uC,g*g*0.6);float a=g*vA*(0.30+0.45*vW);gl_FragColor=vec4(c*a,a);}',
    lineV: 'attribute vec3 aP;uniform mat3 uM;uniform float uZ;varying float vD;' + PROJ + 'void main(){vec3 p=uM*aP;p.z+=uZ;gl_Position=proj(p);vD=clamp((p.z+2.6)/4.2,0.0,1.0);}',
    lineF: 'precision mediump float;uniform vec3 uA,uB;uniform float uAlpha;varying float vD;void main(){float a=uAlpha*(0.2+0.8*vD);gl_FragColor=vec4(mix(uA,uB,vD)*a,a);}',
    pulseV: 'attribute vec3 aA;attribute vec3 aB;attribute float aPh;uniform mat3 uM;uniform float uZ,uT;varying float vA;' + PROJ + 'void main(){float s=fract(uT*0.32+aPh);vec3 p=uM*mix(aA,aB,s);p.z+=uZ;gl_Position=proj(p);float d=4.0-p.z;gl_PointSize=clamp(0.09*uF*uH/d*uScale,1.0,40.0);vA=sin(s*3.14159)*clamp((p.z+2.6)/4.2,0.15,1.0);}',
    pulseF: 'precision mediump float;uniform vec3 uB,uC;varying float vA;void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=dot(q,q);if(r>1.0)discard;float g=exp(-r*5.0);vec3 c=mix(uB,uC,g);float a=g*vA*0.9;gl_FragColor=vec4(c*a,a);}',
    nodeV: 'attribute vec4 aN;uniform mat3 uM;uniform float uZ;varying float vD;varying float vR;' + PROJ + 'void main(){vec3 p=uM*aN.xyz;p.z+=uZ;gl_Position=proj(p);float d=4.0-p.z;gl_PointSize=clamp((0.085+0.075*aN.w)*uF*uH/d*uScale,2.0,96.0);vD=clamp((p.z+2.6)/4.2,0.0,1.0);vR=aN.w;}',
    nodeF: 'precision mediump float;uniform vec3 uA,uB,uC,uL;varying float vD;varying float vR;void main(){vec2 q=gl_PointCoord*2.0-1.0;q.y=-q.y;float r2=dot(q,q);if(r2>1.0)discard;vec3 base=mix(uA,uB,vR);float halo=exp(-r2*5.0)*0.5;float rr=r2/0.3;vec3 col=vec3(0.0);float a=0.0;if(rr<1.0){vec3 n=vec3(q/0.5477,sqrt(1.0-rr));float diff=max(dot(n,uL),0.0);vec3 hv=normalize(uL+vec3(0.0,0.0,1.0));float spec=pow(max(dot(n,hv),0.0),30.0);float rim=pow(1.0-n.z,2.0)*0.55;col=base*(0.12+1.0*diff)+uC*spec*1.3+base*rim;a=1.0;}float f=0.35+0.65*vD;vec3 oc=col*a+base*halo*(1.0-a);float oa=max(a*0.8,halo);gl_FragColor=vec4(oc*f,oa*f);}',
  };
  let lost = false, P = null, bufs = null, ptSizeMax = 64;
  function compile(v, f) { const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }; const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, v)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); } const at = {}; const m = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); for (let i = 0; i < m; i++) { const nm = gl.getActiveAttrib(p, i).name; at[nm] = gl.getAttribLocation(p, nm); } return { p, u, at }; }
  function buf(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
  function init() { P = { part: compile(SRC.partV, SRC.partF), line: compile(SRC.lineV, SRC.lineF), pulse: compile(SRC.pulseV, SRC.pulseF), node: compile(SRC.nodeV, SRC.nodeF) }; bufs = { part: buf(seeds), line: buf(lineBuf), pulse: buf(pulseBuf), node: buf(nodeBuf) }; const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); ptSizeMax = r && r[1] ? r[1] : 64; gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); }
  try { init(); } catch (e) { return null; }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { try { init(); lost = false; } catch (_) { lost = true; } });
  /* colours: the current palette glides to the target one (about one second) */
  const cur = { a: [0.35, 0.88, 1], b: [0.96, 0.79, 0.36], c: [1, 1, 1] }; const tgt = { a: cur.a.slice(), b: cur.b.slice(), c: cur.c.slice() };
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };
  const mul = (A, B) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2]; return o; };
  let lastT = 0, W = 0, H = 0, frames = 0;
  function resize(cssW, cssH) { if (!cssW || !cssH) return; const k = Math.min(0.6, 1280 / cssW); const w = Math.max(2, Math.round(cssW * k)), h2 = Math.max(2, Math.round(cssH * k)); if (canvas.width !== w || canvas.height !== h2) { canvas.width = w; canvas.height = h2; } W = w; H = h2; }
  function attrib(prog, name, size, stride, off) { const loc = prog.at[name]; if (loc === undefined || loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); }
  function common(prog, t) { const u = prog.u; gl.useProgram(prog.p); u.uAspect && gl.uniform1f(u.uAspect, W / H); u.uF && gl.uniform1f(u.uF, 1.92); u.uH && gl.uniform1f(u.uH, H); u.uScale && gl.uniform1f(u.uScale, 1); u.uT && gl.uniform1f(u.uT, t); u.uA && gl.uniform3fv(u.uA, cur.a); u.uB && gl.uniform3fv(u.uB, cur.b); u.uC && gl.uniform3fv(u.uC, cur.c); }
  function off(prog) { Object.values(prog.at).forEach((l) => { if (l >= 0) gl.disableVertexAttribArray(l); }); }
  /* one frame. level 'full' or 'light'; opt.nodes = false shows the particles only (the opening has its own network) */
  function draw(now, level, opt = {}) {
    if (lost || !P) return false; if (!W) resize(canvas.clientWidth || 640, canvas.clientHeight || 360);
    const t = now / 1000; const dt = lastT ? Math.min(0.2, t - lastT) : 0.016; lastT = t; frames++;
    const k = Math.min(1, dt * 2.2); ['a', 'b', 'c'].forEach((n) => { for (let i = 0; i < 3; i++) cur[n][i] += (tgt[n][i] - cur[n][i]) * k; });
    const light = level === 'light';
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const cam = mul(rotX(Math.sin(t * 0.07) * 0.08), rotY(Math.sin(t * 0.05) * 0.18));
    /* particles (added light) */
    gl.blendFunc(gl.ONE, gl.ONE); let pr = P.part; common(pr, t); gl.uniform1f(pr.u.uSpeed, 0.045); gl.uniformMatrix3fv(pr.u.uCam, false, cam);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.part); attrib(pr, 'aSeed', 4, 16, 0); gl.drawArrays(gl.POINTS, 0, light ? 320 : N_PART); off(pr);
    if (opt.nodes !== false) {
      const M = mul(cam, mul(rotX(1.05 + Math.sin(t * 0.11) * 0.18), mul(rotZ(t * 0.09), rotY(Math.sin(t * 0.13) * 0.25)))); const Z = -1.7;
      pr = P.line; common(pr, t); gl.uniformMatrix3fv(pr.u.uM, false, M); gl.uniform1f(pr.u.uZ, Z); gl.uniform1f(pr.u.uAlpha, light ? 0.3 : 0.42); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.line); attrib(pr, 'aP', 3, 12, 0); gl.drawArrays(gl.LINES, 0, edges.length * 2); off(pr);
      pr = P.pulse; common(pr, t); gl.uniformMatrix3fv(pr.u.uM, false, M); gl.uniform1f(pr.u.uZ, Z); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.pulse); attrib(pr, 'aA', 3, 28, 0); attrib(pr, 'aB', 3, 28, 12); attrib(pr, 'aPh', 1, 28, 24); gl.drawArrays(gl.POINTS, 0, light ? Math.ceil(edges.length / 2) : edges.length); off(pr);
      /* nodes: lit like spheres by one key light that circles the stage */
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); pr = P.node; common(pr, t); gl.uniformMatrix3fv(pr.u.uM, false, M); gl.uniform1f(pr.u.uZ, Z);
      const L = [Math.cos(t * 0.45) * 0.85, 0.45 + 0.25 * Math.sin(t * 0.3), 0.65]; const ln = Math.hypot(...L); gl.uniform3f(pr.u.uL, L[0] / ln, L[1] / ln, L[2] / ln);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.node); attrib(pr, 'aN', 4, 16, 0); gl.drawArrays(gl.POINTS, 0, N_NODE); off(pr);
    }
    return true;
  }
  function setPalette(a, b, c) { if (a) tgt.a = a.slice(0, 3); if (b) tgt.b = b.slice(0, 3); if (c) tgt.c = c.slice(0, 3); }
  return { draw, resize, setPalette, lost: () => lost, stats: () => ({ particles: N_PART, nodes: N_NODE, edges: edges.length, frames, w: W, h: H, error: gl.getError(), pointMax: ptSizeMax, palette: { a: cur.a.slice(), b: cur.b.slice() } }), gl: () => gl };
}
/* stage light colour per round type: Rapid Fire red, Audio/Visual (bonus) violet, Jackpot gold */
const MOOD_COLORS = Object.freeze({ rapid: ['#ff2e4d', '#ff8a2a', '#ffd4cc'], audio: ['#9b5cff', '#ff4fd8', '#eadcff'], jackpot: ['#ffc83a', '#ff9a1a', '#fff4c8'] });
function hexRgb(c) { const m = String(c || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let x = m[1]; if (x.length === 3) x = x.split('').map((ch) => ch + ch).join(''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255); }
/** Which mood colour the stage should glow with now ('' = theme colours). */
function stageMood(s) {
  const sc = s.show.scene;
  if (sc === 'WINNER' || sc === 'TOP3') return 'jackpot';
  if (!['ROUND_INTRO', 'ROUND_RULES', 'GRID', 'QUESTION'].includes(sc)) return '';
  const r = Sel.round(s.show.params.roundId || s.live.roundId);
  if (!r) return '';
  if (r.type === 'rapid') return 'rapid';
  if (r.type === 'bonus') return 'audio';
  if (r.multiplier > 1 || /jackpot|grand\s*final|গ্র্যান্ড ফাইনাল/i.test(r.name + ' ' + r.label)) return 'jackpot';
  return '';
}
