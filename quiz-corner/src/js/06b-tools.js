/* =====================================================================
   TOOLS (ported from V100): import pipeline (CSV / TSV / Excel .xlsx /
   AI JSON / numbered plain text, Bengali headers & answers), Bengali +
   English text auditor, AI bridge (local or online, air-gapped by
   default), certificates + ZIP, CSV exports, V100 backup restore.
   ===================================================================== */
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const toInt = (v, lo, hi, dflt) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
function cleanStr(v, max = 2000, multiline = false) {
  let s = typeof v === 'string' ? v : (v == null ? '' : String(v));
  s = s.normalize('NFC');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​⁠﻿­‪-‮⁦-⁩]/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n') : s.replace(/[\r\n\t]+/g, ' ');
  return s.slice(0, max);
}
function hashId(v) { let h = 2166136261; const t = String(v || ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const ROUND_META = [['R1', 'মজার মিশেল', 'Warm-up'], ['R2', 'চিন্তা ও চয়েস', 'Challenge'], ['R3', 'দেখো তো চিনতে পারো কিনা', 'Audio / Visual'], ['R4', 'সূত্র সন্ধান', 'Strategic'], ['R5', 'বাজাও বাজার', 'Rapid Fire'], ['R6', 'ঝটপট জবাব', 'Final'], ['R7', 'সংরক্ষিত প্রশ্ন', 'Reserve']];
/** A V100-shaped question {round,num,text,options,optionCount,answer,timeLimit,hint,explain,difficulty} → V66 question. */
function buildQuestion(q, i) {
  const n = q.optionCount === 2 ? 2 : 4;
  const opts = arr(q.options).slice(0, n).map((o) => cleanStr(o, 400));
  return questionFromSeed({ id: q.id || uid('Q'), roundId: /^R\d+$/.test(q.round || q.roundId) ? (q.round || q.roundId) : 'R1', number: q.num || q.number || i + 1, text: cleanStr(q.text, 1200, true), options: opts.concat(['', '', '', '']).slice(0, 4), answer: int(q.answer, 0, 0, 3), timer: q.timeLimit ? int(q.timeLimit, 30, 5, 600) : null, explanation: cleanStr(q.explain || q.explanation, 800, true), hint: cleanStr(q.hint, 400), difficulty: q.difficulty }, i);
}
/** V66 question → the shape the V100 auditor expects. */
function auditShape(q) { const n = q.options[2] || q.options[3] ? 4 : 2; return { id: q.id, round: q.roundId, num: q.number, text: q.text || '', options: q.options.concat(['', '', '', '']).slice(0, 4), optionCount: n, answer: q.answer }; }
/* =============== Import pipeline: Excel / CSV / AI text → validated QC60 questions =============== */
const NexusImport = (() => {
  const MAX_ROWS = 300, MAX_FILE = 8 * 1024 * 1024, MAX_ENTRY = 40 * 1024 * 1024;
  const SCHEMA = Object.freeze({ text: 1200, option: 300, hint: 400, explain: 800, time: [5, 300, 30], num: [1, 99] });
  const XL_ERR = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!|SPILL!|CALC!|GETTING_DATA)$/i;
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const latin = (s) => String(s == null ? '' : s).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  /** clean one cell: NFC, no BOM / zero-width / bidi overrides / control characters, tidy spaces */
  function cleanCell(v, multiline) {
    let s = String(v == null ? '' : v); try { s = s.normalize('NFC'); } catch (_) { /* keep as is */ }
    s = s.replace(/[\uFEFF\u200B\u2060\u202A-\u202E\u2066-\u2069]/g, '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    s = multiline ? s.split('\n').map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
    return s.trim();
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {};
    if (u8.length >= 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) throw new Error('This is an old .xls or a password-protected workbook. In Excel choose File → Save As → Excel Workbook (.xlsx) without a password.');
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This file is not a valid .xlsx (zip) file');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const td = new TextDecoder('utf-8');
    for (let k = 0; k < n; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged .xlsx directory');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nl)); if (lo + 30 > u8.length) throw new Error('Damaged .xlsx entry ' + name);
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true); if (ds + csize > u8.length) throw new Error('Damaged .xlsx entry ' + name);
      out[name] = { method, usize, data: u8.subarray(ds, ds + csize) }; p += 46 + nl + xl + cl;
    }
    return {
      names: Object.keys(out),
      async text(name) {
        const e = out[name]; if (!e) return null; if (e.usize > MAX_ENTRY) throw new Error(name + ' is too large to be a question sheet');
        if (e.method === 0) return td.decode(e.data); if (e.method !== 8) throw new Error('Unsupported compression in ' + name);
        if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open .xlsx; save the sheet as CSV UTF-8 instead');
        const ab = await new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        if (ab.byteLength > MAX_ENTRY) throw new Error(name + ' is too large to be a question sheet'); return td.decode(ab);
      },
    };
  }
  const tags = (doc, t) => Array.from(doc.getElementsByTagNameNS('*', t));
  const xmlOf = (s, name) => { const d = new DOMParser().parseFromString(s, 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('Damaged XML in ' + name); return d; };
  /** @returns {Promise<string[][]>} rows of the first worksheet */
  async function parseXLSX(buf) {
    const z = await unzip(buf); let sheetPath = 'xl/worksheets/sheet1.xml';
    const wbT = await z.text('xl/workbook.xml'), relT = await z.text('xl/_rels/workbook.xml.rels');
    if (wbT && relT) { try { const wb = xmlOf(wbT, 'workbook'), rels = xmlOf(relT, 'workbook links'); const first = tags(wb, 'sheet')[0], rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')); const rel = tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid); if (rel) { const t = rel.getAttribute('Target').replace(/^\//, ''); sheetPath = t.startsWith('xl/') ? t : 'xl/' + t; } } catch (_) { /* fall back to sheet1 */ } }
    const shared = [], ss = await z.text('xl/sharedStrings.xml'); if (ss) for (const si of tags(xmlOf(ss, 'shared strings'), 'si')) shared.push(tags(si, 't').map((t) => t.textContent).join(''));
    const sh = await z.text(sheetPath); if (!sh) throw new Error('No worksheet found in this .xlsx');
    const colIdx = (ref) => { const m = /^([A-Z]{1,3})/.exec(ref || ''); if (!m) return -1; let v = 0; for (const ch of m[1]) v = v * 26 + ch.charCodeAt(0) - 64; return v - 1; };
    const rows = [];
    for (const r of tags(xmlOf(sh, 'worksheet'), 'row')) {
      if (rows.length > MAX_ROWS + 1) break; const row = [];
      for (const c of tags(r, 'c')) {
        const t = c.getAttribute('t'), v = tags(c, 'v')[0], raw = v ? v.textContent : ''; let val;
        if (t === 's') val = shared[+raw] ?? ''; else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join(''); else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE'; else if (t === 'e') val = raw || '#VALUE!'; else if (t === 'n' || !t) val = /^-?\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, '') : raw; else val = raw;
        let i = colIdx(c.getAttribute('r')); if (i < 0) i = row.length; if (i < 64) row[i] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = ''; rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  const ALIAS = Object.freeze({
    round: ['round', 'roundid', 'round name', 'রাউন্ড', 'পর্ব'], num: ['number', 'no', 'no.', '#', 'num', 'qno', 'q no', 'question no', 'নম্বর', 'ক্রমিক'],
    text: ['question', 'q', 'text', 'question text', 'প্রশ্ন'], a: ['a', 'option a', 'opt a', 'option1', 'option 1', 'op0', 'ক', 'বিকল্প ক'], b: ['b', 'option b', 'opt b', 'option2', 'option 2', 'op1', 'খ', 'বিকল্প খ'],
    c: ['c', 'option c', 'opt c', 'option3', 'option 3', 'op2', 'গ', 'বিকল্প গ'], d: ['d', 'option d', 'opt d', 'option4', 'option 4', 'op3', 'ঘ', 'বিকল্প ঘ'],
    ans: ['answer', 'ans', 'correct', 'correct answer', 'key', 'উত্তর', 'সঠিক উত্তর'], time: ['seconds', 'time', 'sec', 'time limit', 'timelimit', 'সময়', 'সময়'],
    hint: ['hint', 'clue', 'সংকেত'], explain: ['explain', 'explanation', 'ব্যাখ্যা'], diff: ['difficulty', 'level', 'কাঠিন্য'],
  });
  const headKey = (h) => cleanCell(h).toLowerCase();
  /** spreadsheet rows → raw records (header row optional) */
  function rowsToRecords(rows) {
    if (!rows.length) return [];
    const head = rows[0].map(headKey), map = {};
    for (const k of Object.keys(ALIAS)) { const i = head.findIndex((h) => ALIAS[k].map(headKey).includes(h)); if (i >= 0) map[k] = i; }
    const hasHeader = 'text' in map; const body = hasHeader ? rows.slice(1) : rows;
    if (!hasHeader) Object.assign(map, { round: 0, num: 1, text: 2, a: 3, b: 4, c: 5, d: 6, ans: 7, time: 8 });
    return body.map((r, i) => { const g = (k) => (map[k] != null ? String(r[map[k]] == null ? '' : r[map[k]]) : ''); return { row: i + (hasHeader ? 2 : 1), round: g('round'), num: g('num'), text: g('text'), opts: [g('a'), g('b'), g('c'), g('d')], ans: g('ans'), time: g('time'), hint: g('hint'), explain: g('explain'), diff: g('diff') }; });
  }
  /** LLM answer → JSON value (code fences, prose around it, smart quotes, comments, trailing commas, Python literals, bare keys) */
  function cleanJSON(raw) {
    let t = String(raw || '').replace(/^\uFEFF/, '').replace(/```(?:json|javascript|js)?/gi, '').replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'");
    t = t.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const s = t.search(/[[{]/); if (s < 0) throw new Error('No JSON found. Paste the part that starts with [ or {');
    const close = t[s] === '[' ? ']' : '}', e = t.lastIndexOf(close); if (e <= s) throw new Error('The JSON is cut off: the closing ' + close + ' is missing');
    t = t.slice(s, e + 1).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(t); } catch (first) {
      const t2 = t.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":').replace(/:\s*True\b/g, ': true').replace(/:\s*False\b/g, ': false').replace(/:\s*None\b/g, ': null');
      try { return JSON.parse(t2); } catch (_) { throw new Error('JSON problem: ' + first.message); }
    }
  }
  function aiToRecords(data) {
    const recs = []; const pick = (o, ks) => { for (const k of ks) for (const ok of Object.keys(o)) if (ok.toLowerCase() === k) return o[ok]; return undefined; };
    const one = (o, round, idx) => {
      if (!isObj(o)) return; let opts = pick(o, ['options', 'choices', 'answers', 'option']);
      if (isObj(opts)) opts = ['a', 'b', 'c', 'd'].map((k) => pick(opts, [k]) || '');
      if (!Array.isArray(opts)) opts = ['a', 'b', 'c', 'd'].map((k) => pick(o, [k, 'option_' + k, 'option ' + k, 'option' + k]) || '');
      opts = opts.map((x) => String(x == null ? '' : (isObj(x) ? (x.text || x.label || '') : x)).replace(/^\s*[A-Da-dকখগঘ][).:-]\s+/, ''));
      let ans = pick(o, ['answer', 'correct', 'correct_answer', 'correctanswer', 'ans', 'answer_index', 'correct_option']);
      const zeroBased = pick(o, ['answer_index']) !== undefined || /^R[1-7]$/.test(String(pick(o, ['roundid', 'round']) || ''));   // index keys and the QC60 export use 0-3
      if (typeof ans === 'number' && Number.isInteger(ans) && zeroBased) ans = 'ABCD'[ans] || '';
      recs.push({ row: recs.length + 1, round: String(pick(o, ['round', 'roundid', 'round_name']) || round || ''), num: String(pick(o, ['number', 'no', 'num', 'question_number']) || idx + 1), text: String(pick(o, ['question', 'q', 'text', 'prompt', 'question_text']) || ''), opts, ans: ans == null ? '' : String(ans), time: String(pick(o, ['time', 'seconds', 'time_limit', 'timelimit']) || ''), hint: String(pick(o, ['hint', 'clue']) || ''), explain: String(pick(o, ['explain', 'explanation']) || ''), diff: String(pick(o, ['difficulty']) || '') });
    };
    const walk = (d, round, depth) => {
      if (depth > 6) return;
      if (Array.isArray(d)) { d.forEach((x, i) => (isObj(x) && (x.questions || x.items) ? walk(x.questions || x.items, x.name || x.title || x.round || round, depth + 1) : one(x, round, i))); return; }
      if (isObj(d)) { if (Array.isArray(d.rounds)) { d.rounds.forEach((r) => isObj(r) && walk(r.questions || r.items || [], r.name || r.title || r.round || r.id, depth + 1)); return; } const qs = d.questions || d.items || (isObj(d.quiz) && (d.quiz.questions || d.quiz.rounds)); if (qs) { walk(qs, d.name || d.title || round, depth + 1); return; } one(d, round, 0); }
    };
    walk(data, '', 0); return recs;
  }
  /** plain LLM text: "1. Question … A) … B) … Answer: B", optional "Round 3" headers */
  function plainToRecords(text) {
    const recs = []; let round = '', cur = null; const push = () => { if (cur && cur.text) recs.push(cur); cur = null; };
    for (const line0 of String(text).split(/\r?\n/)) {
      const line = line0.replace(/^[\s*#>-]+/, '').replace(/\*\*/g, '').trim(); if (!line) continue; let m;
      if ((m = /^(?:round|রাউন্ড|পর্ব)\s*[:.-]?\s*([0-9০-৯]+)\b/i.exec(line))) { push(); round = m[1]; continue; }
      if ((m = /^(?:answer|ans|correct answer|উত্তর|সঠিক উত্তর)\s*[:：.-]\s*(.+)$/i.exec(line))) { if (cur) cur.ans = m[1]; continue; }
      if ((m = /^\(?([A-Da-dকখগঘ])[).:]\s*(.+)$/.exec(line)) && cur) { const i = 'abcd'.indexOf(m[1].toLowerCase()) >= 0 ? 'abcd'.indexOf(m[1].toLowerCase()) : 'কখগঘ'.indexOf(m[1]); cur.opts[i] = m[2]; continue; }
      if ((m = /^(?:q(?:uestion)?\s*|প্রশ্ন\s*)?([0-9০-৯]{1,2})\s*[.):।]\s*(.+)$/i.exec(line))) { push(); cur = { row: recs.length + 1, round, num: m[1], text: m[2], opts: ['', '', '', ''], ans: '', time: '', hint: '', explain: '', diff: '' }; continue; }
      if (cur && !cur.opts[0]) cur.text += ' ' + line;
    }
    push(); return recs;
  }
  function roundOfValue(v, dflt, rounds) {
    const s = cleanCell(latin(v)); if (!s) return { id: dflt, ok: true };
    const m = /^(?:R|ROUND|রাউন্ড|পর্ব)?\s*([1-7])(?:\.0+)?$/i.exec(s); if (m) return { id: 'R' + m[1], ok: true };
    const low = s.toLowerCase(); const list = Array.isArray(rounds) && rounds.length ? rounds : ROUND_META.map((r) => ({ id: r[0], name: r[1], label: r[2] }));
    const hit = list.find((r) => [r.name, r.label].some((x) => { const t = String(x || '').toLowerCase().trim(); return t.length > 2 && (t === low || t.includes(low) || low.includes(t)); }));
    return hit ? { id: hit.id, ok: true } : { id: dflt, ok: false };
  }
  function answerOf(raw, opts) {
    const a = cleanCell(latin(raw)); if (!a) return -1;
    const al = a.toUpperCase().replace(/^(OPTION|OPT|ANSWER|ANS|উত্তর)\s*[:.-]?\s*/, '').replace(/[).:]/g, '').trim();
    if (al.length === 1 && 'ABCD'.includes(al)) return 'ABCD'.indexOf(al);
    if (/^[1-4]$/.test(al)) return Number(al) - 1;
    const bi = ['ক', 'খ', 'গ', 'ঘ'].indexOf(al.replace(/\s/g, '')); if (bi >= 0) return bi;
    const t = a.replace(/^\s*[A-Da-dকখগঘ][).:-]\s+/, '').toLowerCase(); return opts.findIndex((o) => o && o.toLowerCase() === t);
  }
  /** strict schema: every record becomes a valid QC60 question object or a row error; warnings never block */
  function validate(records, dflt = 'R1', rounds) {
    const list = [], errors = [], warnings = []; const seen = new Set();
    const cut = (s, max, label, row) => { if (s.length > max) { warnings.push('Row ' + row + ': ' + label + ' shortened to ' + max + ' characters'); return s.slice(0, max); } return s; };
    const errCell = (s, label, row) => { if (XL_ERR.test(s)) { warnings.push('Row ' + row + ': ' + label + ' had the Excel error ' + s + ', left empty'); return ''; } return s; };
    for (const r of records) {
      if (list.length >= MAX_ROWS) { errors.push('Only the first ' + MAX_ROWS + ' questions are taken; split the file'); break; }
      const row = r.row;
      const text = cut(errCell(cleanCell(r.text, true), 'question', row), SCHEMA.text, 'question', row); if (!text) { if ((r.opts || []).some((o) => cleanCell(o))) errors.push('Row ' + row + ': question text is empty'); continue; }
      const opts = [0, 1, 2, 3].map((i) => cut(errCell(cleanCell((r.opts || [])[i]), 'option ' + 'ABCD'[i], row), SCHEMA.option, 'option ' + 'ABCD'[i], row));
      if (!opts[0] || !opts[1]) { errors.push('Row ' + row + ': options A and B are both needed'); continue; }
      if ((opts[2] && !opts[3]) || (!opts[2] && opts[3])) { errors.push('Row ' + row + ': give two options (A, B) or all four (A to D)'); continue; }
      const optionCount = opts[2] ? 4 : 2;
      const dup = opts.slice(0, optionCount).map((o) => o.toLowerCase()); if (new Set(dup).size !== dup.length) { errors.push('Row ' + row + ': two options are the same'); continue; }
      const ans = answerOf(r.ans, opts.slice(0, optionCount)); if (ans < 0 || ans >= optionCount) { errors.push('Row ' + row + ': answer "' + cleanCell(r.ans) + '" is not A-' + 'ABCD'[optionCount - 1] + ', 1-' + optionCount + ', ক-' + 'কখগঘ'[optionCount - 1] + ' or an option text'); continue; }
      const rd = roundOfValue(r.round, dflt, rounds); if (!rd.ok) warnings.push('Row ' + row + ': round "' + cleanCell(r.round) + '" not recognised, put in ' + rd.id);
      const key = text.toLowerCase(); if (seen.has(key)) { warnings.push('Row ' + row + ': same question as an earlier row, skipped'); continue; } seen.add(key);
      const n = parseInt(latin(r.num), 10), tl = parseInt(latin(r.time), 10), diff = cleanCell(r.diff).toLowerCase();
      if (cleanCell(r.time) && !(tl >= SCHEMA.time[0] && tl <= SCHEMA.time[1])) warnings.push('Row ' + row + ': time "' + cleanCell(r.time) + '" outside 5-300 s, 30 s used');
      list.push({ round: rd.id, num: n >= SCHEMA.num[0] && n <= SCHEMA.num[1] ? n : list.filter((q) => q.round === rd.id).length + 1, text, options: opts, optionCount, answer: ans, timeLimit: tl >= SCHEMA.time[0] && tl <= SCHEMA.time[1] ? tl : SCHEMA.time[2], hint: cut(cleanCell(r.hint), SCHEMA.hint, 'hint', row), explain: cut(cleanCell(r.explain, true), SCHEMA.explain, 'explanation', row), difficulty: ['easy', 'medium', 'hard'].includes(diff) ? diff : 'medium' });
    }
    return { list, errors, warnings };
  }
  /** any pasted / loaded text → records (JSON from an AI, a numbered plain-text quiz, or CSV / TSV) */
  function textToRecords(text) {
    const t = String(text || '').trim(); if (!t) throw new Error('Nothing to import: choose a file or paste text first');
    if (/[[{]/.test(t)) { try { const r = aiToRecords(cleanJSON(t)); if (r.length) return r; } catch (_) { /* not JSON: try the next form */ } }
    if (/^(?:answer|ans|correct answer|উত্তর|সঠিক উত্তর)\s*[:：.-]/im.test(t)) { const r = plainToRecords(t); if (r.length) return r; }
    return rowsToRecords(parseCSV(t));
  }
  /** a file's text with the right encoding (Excel "Unicode text" is UTF-16) */
  async function fileText(f) {
    const u8 = new Uint8Array(await f.arrayBuffer());
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    const s = new TextDecoder('utf-8').decode(u8); const bad = (s.match(/\uFFFD/g) || []).length;
    if (bad > 3) throw new Error('This file is not saved as UTF-8, so Bengali letters would be broken. In Excel choose Save As → CSV UTF-8, or use the .xlsx file directly.');
    return s;
  }
  const summary = (r, src) => [r.list.length + ' question(s) read from ' + src + '.', r.errors.length ? r.errors.length + ' row(s) not imported: ' + r.errors.slice(0, 5).join(' • ') + (r.errors.length > 5 ? ' …' : '') : '', r.warnings.length ? r.warnings.length + ' note(s): ' + r.warnings.slice(0, 5).join(' • ') + (r.warnings.length > 5 ? ' …' : '') : ''].filter(Boolean).join(' ');
  /**
   * Import PREVIEW: the original QC60 parser runs first, unchanged; the Nexus pipeline handles what it cannot read
   * (.xlsx, Bengali headers, AI text). Never touches the show state — the operator still presses ADD IMPORTED QUESTIONS.
   * @returns {Promise<{list:object[], note:string}>}
   */
  async function preview({ file, text, defaultRound, rounds, legacy }) {
    const dflt = /^R[1-7]$/.test(defaultRound) ? defaultRound : 'R1';
    if (file && file.size > MAX_FILE) throw new Error('The file is larger than 8 MB; a question sheet is never that big. Check that you chose the right file.');
    let records, src;
    if (file && /\.xlsx$/i.test(file.name)) { records = rowsToRecords(await parseXLSX(await file.arrayBuffer())); src = 'the Excel file'; }
    else if (file && /\.xls$/i.test(file.name)) throw new Error('Old .xls files cannot be read. In Excel choose Save As → Excel Workbook (.xlsx).');
    else {
      const t = file ? await fileText(file) : String(text || ''); src = file ? 'the file ' + file.name : 'the pasted text';
      let legacyError = '';
      try { const list = legacy(t); if (list.length) return { list, note: '' }; } catch (e) { legacyError = String(e && e.message || e); }
      try { records = textToRecords(t); } catch (e) { throw new Error((legacyError ? legacyError + ' ' : '') + String(e.message || e)); }
    }
    const r = validate(records, dflt, rounds);
    if (!r.list.length) throw new Error('No questions could be imported from ' + src + '. ' + (r.errors.slice(0, 5).join(' • ') || 'Check that there is a question column and an answer column.'));
    return { list: r.list.map((q, i) => buildQuestion(q, i)), note: summary(r, src) };
  }
  return Object.freeze({ MAX_ROWS, SCHEMA, cleanCell, unzip, parseXLSX, rowsToRecords, cleanJSON, aiToRecords, plainToRecords, roundOfValue, answerOf, validate, textToRecords, fileText, preview });
})();

const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function parseCSV(text) {
  const t = text.replace(/^\uFEFF/, ''); const first = t.split(/\r?\n/)[0] || ''; const delim = [',', '\t', ';'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); } return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/* ===================== BENGALI + ENGLISH TEXT AUDITOR (rule-based, offline) ===================== */
const NLP = (() => {
  const B = '\u0980-\u09FF';
  const CONS = '[\u0995-\u09B9\u09DC\u09DD\u09DF\u09CE]';          // consonants incl. khanda-ta
  const BASE = '[\u0995-\u09B9\u09DC-\u09DF\u09CE\u0985-\u0994]';  // consonant or independent vowel
  const SIGN = '[\u09BE-\u09CC\u09D7\u09C1-\u09C4]';               // dependent vowel signs
  const isBn = (c) => c >= '\u0980' && c <= '\u09FF';
  function issue(rule, sev, index, length, msg, fix) { return { rule, sev, index, length, msg, fix: fix === undefined ? null : fix }; }
  function words(text) { const out = []; const re = /[^\s]+/gu; let m; while ((m = re.exec(text))) out.push({ w: m[0], i: m.index }); return out; }
  const EN_TYPOS = { teh: 'the', recieve: 'receive', occured: 'occurred', seperate: 'separate', definately: 'definitely', wich: 'which', untill: 'until', adress: 'address', becuase: 'because', beleive: 'believe', freind: 'friend', goverment: 'government', enviroment: 'environment', tommorow: 'tomorrow', wierd: 'weird', acheive: 'achieve', calender: 'calendar', collegue: 'colleague', embarass: 'embarrass', existance: 'existence', foriegn: 'foreign', grammer: 'grammar', independant: 'independent', knowlege: 'knowledge', neccessary: 'necessary', occassion: 'occasion', priviledge: 'privilege', publically: 'publicly', refered: 'referred', succesful: 'successful', writting: 'writing' };
  const AN_EXC = /^(uni([^nmd]|$)|use|usu|uti|eur|one|once|ubi)/i; const A_EXC = /^(hour|honest|honou?r|heir)/i;

  function auditBengali(text) {
    const out = []; const t = text;
    // 1. invisible / dangerous characters
    const inv = /[\u200B\u2060\uFEFF\u00AD]/g; let m;
    while ((m = inv.exec(t))) out.push(issue('invisible-char', 'warn', m.index, 1, 'Invisible character U+' + m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + ' can break matching and spacing.', ''));
    const zw = /(^|\s)[\u200C\u200D]|[\u200C\u200D](\s|$)|[\u200C\u200D]{2,}/g;
    while ((m = zw.exec(t))) out.push(issue('stray-zwj', 'warn', m.index, m[0].length, 'Stray joiner / non-joiner next to a space or doubled.', m[0].replace(/[\u200C\u200D]/g, '')));
    // 2. encoding consistency (precomposed vs decomposed nukta letters)
    const src = t.normalize('NFC');
    // NOTE: all further rules use NFC-normalised offsets; if lengths differ we still report on the NFC text.
    const T = src;
    // 3. অ + া  → আ
    for (const x of T.matchAll(/\u0985\u09BE/g)) out.push(issue('a-aa', 'error', x.index, 2, 'অা should be written as আ.', '\u0986'));
    // 4. hasanta problems
    for (const x of T.matchAll(/\u09CD\u09CD+/g)) out.push(issue('double-hasanta', 'error', x.index, x[0].length, 'Repeated hasanta (্) — remove the extra one.', '\u09CD'));
    for (const x of T.matchAll(/\u09A4\u09CD(?=$|[\s.,;:!?।)\]"'\u2019\u201D-])/gu)) out.push(issue('khanda-ta', 'error', x.index, 2, 'Word-final ত্ should be খণ্ড-ত (ৎ).', '\u09CE'));
    for (const x of T.matchAll(new RegExp('(' + BASE + '[\u09BC]?)\u09CD(?=$|[\\s.,;:!?।)\\]"\'\u2019\u201D-])', 'gu'))) { if (x[1] === '\u09A4') continue; out.push(issue('dangling-hasanta', 'error', x.index, x[0].length, 'Hasanta (্) at the end of a word — the conjunct is unfinished.', x[1])); }
    for (const x of T.matchAll(/(^|[\s(])\u09CD/gu)) out.push(issue('hasanta-start', 'error', x.index + x[1].length, 1, 'Word starts with hasanta (্).', ''));
    // 5. dependent vowel sign without a base
    for (const x of T.matchAll(new RegExp('(^|[^' + B + '\u200C\u200D]|[\\s])(' + SIGN + '+)', 'gu'))) {
      out.push(issue('orphan-sign', 'error', x.index + x[1].length, x[2].length, 'Vowel sign without a consonant in front of it.', null));
    }
    for (const x of T.matchAll(/([\u09BE-\u09CC\u09D7\u09C1-\u09C4])([\u09BE-\u09CC\u09D7\u09C1-\u09C4])/g)) {
      out.push(issue('double-sign', 'error', x.index, 2, 'Two vowel signs in a row.', x[1]));
    }
    // 6. visual-order typing: sign typed BEFORE its consonant cluster at the start of a word (ি ে ৈ)
    for (const x of T.matchAll(new RegExp('(^|[^' + B + '])([\u09BF\u09C7\u09C8])(' + CONS + '\u09BC?(?:\u09CD' + CONS + '\u09BC?)*)([\u09BE\u09D7])?', 'gu'))) {
      const sign = x[2]; const cluster = x[3]; const tail = x[4] || '';
      let fixed = cluster + sign; if (sign === '\u09C7' && tail === '\u09BE') fixed = cluster + '\u09CB'; else if (sign === '\u09C7' && tail === '\u09D7') fixed = cluster + '\u09CC'; else fixed = cluster + sign + tail;
      out.push(issue('misplaced-sign', 'error', x.index + x[1].length, x[0].length - x[1].length, 'Vowel sign is before the consonant (visual-order typing). Move it after the consonant.', fixed.normalize('NFC')));
    }
    // 7. nukta only after ড ঢ য
    for (const x of T.matchAll(/([\u0980-\u09FF])\u09BC/gu)) { if (!/[\u09A1\u09A2\u09AF]/.test(x[1])) out.push(issue('odd-nukta', 'warn', x.index, 2, 'Nukta (়) after an unexpected letter.', x[1])); }
    // 8. punctuation
    for (const x of T.matchAll(/(?<=[\u0980-\u09FF\s])\|(?=\s|$)/g)) out.push(issue('pipe-danda', 'warn', x.index, 1, 'Use the Bengali danda । instead of the pipe |.', '\u0964'));
    for (const x of T.matchAll(/ {2,}/g)) out.push(issue('double-space', 'info', x.index, x[0].length, 'Multiple spaces.', ' '));
    for (const x of T.matchAll(/[ \t]+(?=[,;:!?\u0964.])/g)) out.push(issue('space-before-punct', 'info', x.index, x[0].length, 'Space before punctuation.', ''));
    for (const x of T.matchAll(/([\u0964?!])\1{1,}/g)) out.push(issue('repeat-punct', 'info', x.index, x[0].length, 'Repeated punctuation.', x[1]));
    // 9. mixed digit scripts inside a single number token
    for (const x of T.matchAll(/(?=[0-9\u09E6-\u09EF]*[0-9])(?=[0-9\u09E6-\u09EF]*[\u09E6-\u09EF])[0-9\u09E6-\u09EF]+/g)) out.push(issue('mixed-digits', 'warn', x.index, x[0].length, 'Bengali and Latin digits mixed in one number.', null));
    // 10. immediate repeated word (informational; Bengali reduplication is common)
    const ws = words(T);
    for (let i = 1; i < ws.length; i++) { const a = ws[i - 1].w.replace(/[^\p{L}\p{M}]/gu, ''), b = ws[i].w.replace(/[^\p{L}\p{M}]/gu, ''); if (a && a === b && a.length > 1) out.push(issue('repeated-word', 'info', ws[i].i, ws[i].w.length, 'Repeated word "' + a + '" (intentional reduplication is fine).', null)); }
    return { text: T, issues: dedupe(out) };
  }
  function auditEnglish(text) {
    const out = []; const T = text;
    for (const x of T.matchAll(/\b([A-Za-z']+)\b/g)) { const k = x[1].toLowerCase(); if (hasOwn(EN_TYPOS, k)) { const f = EN_TYPOS[k]; out.push(issue('typo', 'error', x.index, x[1].length, '"' + x[1] + '" → "' + f + '"', x[1][0] === x[1][0].toUpperCase() ? f[0].toUpperCase() + f.slice(1) : f)); } }
    for (const x of T.matchAll(/\b(\w+)\s+\1\b/gi)) if (/^[A-Za-z]+$/.test(x[1]) && x[1].length > 1) out.push(issue('repeated-word', 'warn', x.index, x[0].length, 'Repeated word "' + x[1] + '".', x[1]));
    for (const x of T.matchAll(/\b[Aa]n?\s+([A-Za-z]+)/g)) {
      const w = x[1]; const art = x[0].split(/\s/)[0]; const vowelStart = /^[aeiou]/i.test(w) && !AN_EXC.test(w) || A_EXC.test(w);
      const want = vowelStart ? 'an' : 'a'; if (art.toLowerCase() !== want && /^[a-zA-Z]{2,}$/.test(w)) out.push(issue('a-an', 'warn', x.index, art.length, '"' + art + ' ' + w + '" → "' + want + ' ' + w + '"', art[0] === 'A' ? want[0].toUpperCase() + want.slice(1) : want));
    }
    for (const x of T.matchAll(/(^|[.!?]\s+)([a-z])/g)) out.push(issue('capital', 'info', x.index + x[1].length, 1, 'Sentence should start with a capital letter.', x[2].toUpperCase()));
    for (const x of T.matchAll(/\bi\b(?!['’.])/g)) out.push(issue('pronoun-i', 'warn', x.index, 1, 'Pronoun "I" should be capitalised.', 'I'));
    for (const x of T.matchAll(/,(?=[A-Za-z])/g)) out.push(issue('space-after-comma', 'info', x.index, 1, 'Missing space after comma.', ', '));
    for (const x of T.matchAll(/ {2,}/g)) out.push(issue('double-space', 'info', x.index, x[0].length, 'Multiple spaces.', ' '));
    for (const x of T.matchAll(/ +(?=[,;:!?.](?:\s|$))/g)) out.push(issue('space-before-punct', 'info', x.index, x[0].length, 'Space before punctuation.', ''));
    return { text: T, issues: dedupe(out) };
  }
  function dedupe(a) { const seen = new Set(); return a.filter((x) => { const k = x.rule + ':' + x.index + ':' + x.length; if (seen.has(k)) return false; seen.add(k); return true; }).sort((p, q) => p.index - q.index); }
  function audit(text) {
    const raw = typeof text === 'string' ? text.slice(0, 5000) : ''; const s = raw.normalize('NFC'); const mixed = /[\u09DC\u09DD\u09DF]/.test(raw) && /[\u09A1\u09A2\u09AF]\u09BC/.test(raw); const hasBn = /[\u0980-\u09FF]/.test(s); const hasEn = /[A-Za-z]/.test(s);
    const b = hasBn ? auditBengali(s) : { text: s.normalize('NFC'), issues: [] };
    const e = hasEn ? auditEnglish(b.text) : { issues: [] };
    // English rules run on the same normalised text so offsets agree; Bengali ones only inspect Bengali runs
    const issues = dedupe([...(mixed ? [issue('mixed-encoding', 'info', 0, 0, 'Text mixes precomposed (ড় ঢ় য়) and decomposed nukta forms; normalised to NFC.', s)] : []), ...b.issues, ...e.issues.filter((i) => !b.issues.some((x) => x.rule === i.rule && x.index === i.index))]);
    return { text: b.text, issues, lang: hasBn && hasEn ? 'mixed' : hasBn ? 'bn' : hasEn ? 'en' : 'none' };
  }
  function applyFix(text, iss) {
    if (iss.fix === null || iss.fix === undefined) return text;
    if (iss.rule === 'mixed-encoding') return iss.fix;
    return text.slice(0, iss.index) + iss.fix + text.slice(iss.index + iss.length);
  }
  function fixAll(text) {
    let cur = audit(text).text;
    for (let pass = 0; pass < 6; pass++) {
      const r = audit(cur); const fixable = r.issues.filter((i) => i.fix !== null && i.rule !== 'mixed-encoding' && i.sev !== 'info' || (i.fix !== null && i.rule !== 'mixed-encoding'));
      if (!fixable.length) break;
      let next = cur; let guard = Infinity;
      for (const i of fixable.sort((a, b) => b.index - a.index)) { if (i.index + i.length > guard) continue; next = applyFix(next, i); guard = i.index; }
      if (next === cur) break; cur = next;
    }
    return cur;
  }
  const norm = (s) => cleanStr(s, 400).normalize('NFC').toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
  function auditQuestion(q) {
    const out = []; const add = (sev, code, msg) => out.push({ sev, code, msg });
    const n = q.optionCount;
    if (!q.text.trim()) add('error', 'empty-text', 'Question text is empty.');
    const opts = q.options.slice(0, n);
    opts.forEach((o, i) => { if (!o.trim()) add('error', 'empty-option', 'Option ' + 'ABCD'[i] + ' is empty.'); });
    const seen = new Map(); opts.forEach((o, i) => { const k = norm(o); if (!k) return; if (seen.has(k)) add('error', 'duplicate-option', 'Options ' + 'ABCD'[seen.get(k)] + ' and ' + 'ABCD'[i] + ' are identical.'); else seen.set(k, i); });
    if (q.answer < 0 || q.answer >= n) add('error', 'bad-answer', 'Answer key points outside the options.');
    else if (!opts[q.answer].trim()) add('error', 'empty-answer', 'The correct option is empty.');
    if (q.text && opts[q.answer] && norm(q.text).includes(norm(opts[q.answer])) && norm(opts[q.answer]).length > 3) add('warn', 'answer-in-question', 'The correct answer appears inside the question text.');
    if (q.text.length > 420) add('info', 'long-text', 'Question is long (' + q.text.length + ' characters); the stage will shrink the type to fit.');
    if (opts.some((o) => o.length > 120)) add('info', 'long-option', 'An option is very long; the stage will shrink the type to fit.');
    if (q.text && !/[?\u0964.!:]\s*$/.test(q.text.trim()) && !/(কী|কি|কে|কোন|কত|কবে)/.test(q.text)) add('info', 'no-terminal', 'Question has no closing punctuation.');
    if (opts.some((o) => /^(all|none) of the above$|উপরের সবগুলি|উপরের সবকটি|কোনটিই নয়/i.test(o.trim()))) add('info', 'all-none-above', 'Uses an "all/none of the above" option.');
    const ta = audit(q.text); ta.issues.filter((i) => i.sev !== 'info').forEach((i) => add(i.sev === 'error' ? 'warn' : i.sev, 'text-' + i.rule, 'Question text: ' + i.msg));
    opts.forEach((o, k) => audit(o).issues.filter((i) => i.sev === 'error').forEach((i) => add('warn', 'opt-' + i.rule, 'Option ' + 'ABCD'[k] + ': ' + i.msg)));
    return out;
  }
  function auditBank(questions) {
    const rows = questions.map((q) => ({ id: q.id, round: q.round, num: q.num, findings: auditQuestion(q) }));
    const dist = [0, 0, 0, 0]; questions.forEach((q) => { dist[q.answer]++; });
    const bank = [];
    if (questions.length >= 8) { const mx = Math.max(...dist); if (mx / questions.length > 0.5) bank.push({ sev: 'warn', code: 'answer-skew', msg: 'Answer positions are skewed: ' + dist.map((d, i) => 'ABCD'[i] + '=' + d).join(', ') + '. Contestants can guess. Use SHUFFLE ANSWER POSITIONS.' }); }
    const texts = new Map(); questions.forEach((q) => { const k = norm(q.text); if (k) { if (texts.has(k)) bank.push({ sev: 'error', code: 'duplicate-question', msg: q.id + ' has the same text as ' + texts.get(k) + '.' }); else texts.set(k, q.id); } });
    return { rows, bank, dist };
  }
  return { audit, auditBengali, auditEnglish, applyFix, fixAll, auditQuestion, auditBank, norm };
})();

/* ===================== AI BRIDGE — fully decoupled from the quiz store =====================
   Nothing here can touch quiz state. Results are drafts shown in the AI panel; the operator applies them
   through the normal validated actions. Every call has a hard timeout and is aborted on failure. */
const AI = (() => {
  const KEY = 'QC60_AI';
  const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  const PROVIDERS = {
    ollama: { label: 'Ollama (local)', local: true, base: 'http://127.0.0.1:11434', model: 'llama3.1', needsKey: false },
    lmstudio: { label: 'LM Studio (local)', local: true, base: 'http://127.0.0.1:1234', model: 'local-model', needsKey: false },
    custom: { label: 'Local OpenAI-compatible server', local: true, base: 'http://127.0.0.1:8080', model: 'local-model', needsKey: false },
    openai: { label: 'OpenAI (online)', local: false, base: 'https://api.openai.com', model: 'gpt-4o-mini', needsKey: true },
    anthropic: { label: 'Claude (online)', local: false, base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', needsKey: true },
    gemini: { label: 'Gemini (online)', local: false, base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', needsKey: true },
  };
  const defaults = () => ({ provider: 'ollama', airGapped: true, fallback: 'none', timeoutSec: 45, keys: {}, models: {}, bases: {}, autoCommentary: false });
  function sanitizeCfg(r) {
    const d = defaults(); const x = isObj(r) ? r : {};
    const c = {
      provider: hasOwn(PROVIDERS, x.provider) ? x.provider : d.provider, airGapped: x.airGapped === undefined ? true : !!x.airGapped,
      fallback: x.fallback === 'none' || !hasOwn(PROVIDERS, x.fallback) ? 'none' : x.fallback, timeoutSec: toInt(x.timeoutSec, 5, 180, 45), keys: {}, models: {}, bases: {}, autoCommentary: !!x.autoCommentary,
    };
    for (const p of Object.keys(PROVIDERS)) { if (isObj(x.keys) && typeof x.keys[p] === 'string') c.keys[p] = x.keys[p].slice(0, 300); if (isObj(x.models) && typeof x.models[p] === 'string') c.models[p] = cleanStr(x.models[p], 80); if (isObj(x.bases) && typeof x.bases[p] === 'string') c.bases[p] = cleanStr(x.bases[p], 200); }
    return c;
  }
  let cfg = defaults();
  try { cfg = sanitizeCfg(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { cfg = defaults(); }
  const status = { state: 'idle', msg: 'AI not used yet.', last: 0 };
  const listeners = new Set();
  const setStatus = (state, msg) => { status.state = state; status.msg = msg; status.last = Date.now(); listeners.forEach((f) => { try { f(status); } catch (_) {} }); };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {} }
  const baseOf = (p) => (cfg.bases[p] || PROVIDERS[p].base).replace(/\/+$/, '');
  const modelOf = (p) => cfg.models[p] || PROVIDERS[p].model;
  function assertAllowed(provider) {
    const url = new URL(baseOf(provider));
    if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) endpoints are allowed.');
    if (cfg.airGapped && !LOOPBACK.has(url.hostname)) throw new Error('Air-gapped mode is ON: only 127.0.0.1 / localhost AI servers are allowed.');
    if (!PROVIDERS[provider].local) { if (cfg.airGapped) throw new Error('Air-gapped mode blocks online providers.'); if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('No internet connection.'); if (!cfg.keys[provider]) throw new Error('API key missing for ' + PROVIDERS[provider].label + '.'); }
    return url;
  }
  async function http(url, init, timeoutMs, outer) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), timeoutMs);
    if (outer) outer.addEventListener('abort', () => ac.abort(), { once: true });
    try {
      const res = await fetch(url, { ...init, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      const txt = await res.text(); if (txt.length > 2e6) throw new Error('Response too large.');
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 160));
      try { return JSON.parse(txt); } catch (_) { throw new Error('Server returned invalid JSON.'); }
    } catch (e) { if (e.name === 'AbortError') throw new Error('Timed out after ' + Math.round(timeoutMs / 1000) + ' s.'); throw e; } finally { clearTimeout(to); }
  }
  async function callProvider(provider, system, user, { json = false, timeoutMs, signal } = {}) {
    assertAllowed(provider); const base = baseOf(provider); const model = modelOf(provider); const T = timeoutMs || cfg.timeoutSec * 1000;
    const JH = { 'Content-Type': 'application/json' };
    if (provider === 'ollama') {
      const j = await http(base + '/api/chat', { method: 'POST', headers: JH, body: JSON.stringify({ model, stream: false, format: json ? 'json' : undefined, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], options: { temperature: 0.4 } }) }, T, signal);
      return String(j && j.message && j.message.content || '');
    }
    if (provider === 'anthropic') {
      const j = await http(base + '/v1/messages', { method: 'POST', headers: { ...JH, 'x-api-key': cfg.keys.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 3000, system, messages: [{ role: 'user', content: user }] }) }, T, signal);
      return String(j && j.content && j.content[0] && j.content[0].text || '');
    }
    if (provider === 'gemini') {
      const j = await http(base + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { ...JH, 'x-goog-api-key': cfg.keys.gemini }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.4, responseMimeType: json ? 'application/json' : 'text/plain' } }) }, T, signal);
      return String(j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text || '');
    }
    const headers = { ...JH }; if (cfg.keys[provider]) headers.Authorization = 'Bearer ' + cfg.keys[provider];
    const j = await http(base + '/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) }, T, signal);
    return String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
  }
  /* Primary provider first; optional secondary; never throws into the caller's UI loop — returns {ok,text|error}. */
  async function ask(system, user, opts = {}) {
    const chain = [cfg.provider]; if (cfg.fallback !== 'none' && cfg.fallback !== cfg.provider) chain.push(cfg.fallback);
    let lastErr = 'AI failed.';
    for (const p of chain) {
      try { setStatus('busy', 'Asking ' + PROVIDERS[p].label + '…'); const text = await callProvider(p, system, user, opts); if (!text.trim()) throw new Error('Empty answer.'); setStatus('ok', PROVIDERS[p].label + ' answered.'); return { ok: true, text, provider: p }; }
      catch (e) { lastErr = PROVIDERS[p].label + ': ' + (e && e.message || e); }
    }
    setStatus('error', lastErr); return { ok: false, error: lastErr };
  }
  async function test() {
    const p = cfg.provider;
    try {
      assertAllowed(p); setStatus('busy', 'Testing ' + PROVIDERS[p].label + '…');
      if (p === 'ollama') { const j = await http(baseOf(p) + '/api/tags', { method: 'GET' }, 6000); const names = (j.models || []).map((m) => m.name).slice(0, 12); setStatus('ok', 'Ollama reachable. Models: ' + (names.join(', ') || 'none installed')); return { ok: true, models: names }; }
      if (p === 'lmstudio' || p === 'custom' || p === 'openai') { const j = await http(baseOf(p) + '/v1/models', { method: 'GET', headers: cfg.keys[p] ? { Authorization: 'Bearer ' + cfg.keys[p] } : {} }, 8000); const names = (j.data || []).map((m) => m.id).slice(0, 12); setStatus('ok', PROVIDERS[p].label + ' reachable. Models: ' + (names.join(', ') || 'unknown')); return { ok: true, models: names }; }
      const r = await ask('Reply with the single word OK.', 'ping', { timeoutMs: 15000 }); return r;
    } catch (e) { setStatus('error', PROVIDERS[p].label + ': ' + (e && e.message || e)); return { ok: false, error: String(e && e.message || e) }; }
  }
  function extractJson(text, open) {
    let s = String(text).replace(/^\uFEFF/, '').replace(/```(?:json)?/gi, '');
    const o = s.indexOf(open); const c = s.lastIndexOf(open === '[' ? ']' : '}'); if (o < 0 || c <= o) throw new Error('No JSON found in the AI answer.');
    return JSON.parse(s.slice(o, c + 1));
  }
  const SYS_Q = 'You are a meticulous quiz-setter for a live school quiz show. Reply with ONLY a JSON array, no commentary. Each element: {"text": string, "options": [4 distinct strings], "answer": integer 0-3, "hint": string, "explain": string (one or two sentences), "difficulty": "easy"|"medium"|"hard"}. Exactly one option must be correct and unambiguous. Vary the position of the correct option. Use correct spelling and orthography in the requested language.';
  async function generateQuestions({ topic, count, lang, difficulty, notes }) {
    const n = toInt(count, 1, 10, 5); const language = lang === 'en' ? 'English' : lang === 'mixed' ? 'Bengali with English terms where natural' : 'Bengali (বাংলা)';
    const r = await ask(SYS_Q, 'Write ' + n + ' multiple-choice questions.\nTopic: ' + cleanStr(topic, 300) + '\nLanguage: ' + language + '\nDifficulty: ' + (difficulty || 'medium') + '\n' + (notes ? 'Source notes to base the questions on (do not invent beyond them):\n' + cleanStr(notes, 6000, true) : ''), { json: true });
    if (!r.ok) return r;
    try {
      const arr = extractJson(r.text, '['); if (!Array.isArray(arr)) throw new Error('Not an array.');
      const drafts = []; arr.slice(0, 20).forEach((x, i) => { try { const q = buildQuestion({ ...x, id: 'D' + (i + 1), options: Array.isArray(x.options) ? x.options : [] }, i); drafts.push({ q, audit: NLP.auditQuestion(q) }); } catch (_) { /* invalid draft discarded */ } });
      if (!drafts.length) throw new Error('No valid question in the answer.');
      return { ok: true, drafts, provider: r.provider };
    } catch (e) { setStatus('error', 'Could not read the AI answer: ' + e.message); return { ok: false, error: 'Could not read the AI answer: ' + e.message }; }
  }
  async function verifyQuestion(q) {
    const n = q.optionCount; const opts = q.options.slice(0, n).map((o, i) => 'ABCD'[i] + ') ' + o).join('\n');
    const r = await ask('You are an expert fact-checker. Reply with ONLY JSON: {"answerIndex": integer, "ambiguous": boolean, "confidence": number 0-1, "reason": string}.', 'Question: ' + q.text + '\n' + opts + '\nWhich option is correct? Set ambiguous=true if more than one option could be argued correct or the question is unclear.', { json: true, timeoutMs: 40000 });
    if (!r.ok) return r;
    try { const j = extractJson(r.text, '{'); const idx = toInt(j.answerIndex, 0, 3, -1); return { ok: true, answerIndex: idx, ambiguous: !!j.ambiguous, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)), reason: cleanStr(j.reason, 300), agrees: idx === q.answer }; }
    catch (e) { return { ok: false, error: 'Unreadable verification: ' + e.message }; }
  }
  async function proofread(text) {
    const r = await ask('You are a careful Bengali and English copy-editor. Fix only spelling, orthography (juktakkhor, hasanta, vowel signs), spacing and punctuation. Do not change meaning. Reply with ONLY the corrected text.', cleanStr(text, 2000, true));
    return r.ok ? { ok: true, text: cleanStr(r.text.trim().replace(/^["“]|["”]$/g, ''), 2000, true) } : r;
  }
  /* ----- Host assistant: instant offline templates, optionally upgraded by AI ----- */
  const T_BN = {
    score: ['দারুণ! {team} এখন {score} পয়েন্টে।', '{team} {delta} পয়েন্ট যোগ করল — মোট {score}!', 'চমৎকার উত্তর! {team}-এর ঝুলিতে এখন {score}।'],
    wrong: ['এবার হলো না, {team}। পরের সুযোগ আসছে!', 'ভুল উত্তর — কিন্তু খেলা এখনও শেষ হয়নি!'],
    tension: ['ঘড়ির কাঁটা এগিয়ে চলেছে… সময় খুব কম!', 'শেষ কয়েক সেকেন্ড — সবার নিঃশ্বাস বন্ধ!'],
    open: ['এবার শুরু হচ্ছে {round}। প্রস্তুত তো সবাই?', '{round} — দেখা যাক কারা এগিয়ে থাকে!'],
    win: ['অভিনন্দন {team}! আজকের চ্যাম্পিয়ন!', 'এবারের সেরা {team} — {score} পয়েন্টে!'],
  };
  const T_EN = {
    score: ['Brilliant! {team} moves to {score} points.', '{team} adds {delta} — now on {score}!', 'Excellent answer, {team} now has {score}.'],
    wrong: ['Not this time, {team}. The next chance is coming!', 'Wrong answer — but the game is far from over!'],
    tension: ['The clock is ticking… very little time left!', 'Final seconds — everyone is holding their breath!'],
    open: ['{round} begins now. Is everybody ready?', '{round} — let us see who takes the lead!'],
    win: ['Congratulations {team}! Today’s champion!', 'The best of the day: {team} with {score} points!'],
  };
  function hostLine(kind, ctx, lang = 'bn') {
    const bank = (lang === 'en' ? T_EN : T_BN)[kind] || T_EN.score; const i = hashId(kind + JSON.stringify(ctx) + (ctx.n || 0)) % bank.length;
    return bank[i].replace(/\{(\w+)\}/g, (_, k) => (ctx[k] === undefined ? '' : String(ctx[k])));
  }
  async function hostLineAI(kind, ctx, lang) {
    const r = await ask('You are the energetic host of a school quiz show. Write ONE short spoken line (max 25 words) in ' + (lang === 'en' ? 'English' : 'Bengali') + '. Reply with the line only.', 'Situation: ' + kind + '. Details: ' + cleanStr(JSON.stringify(ctx), 500), { timeoutMs: 8000 });
    return r.ok ? { ok: true, text: cleanStr(r.text, 300) } : r;
  }
  return { PROVIDERS, get cfg() { return cfg; }, setCfg(patch) { cfg = sanitizeCfg({ ...cfg, ...patch, keys: { ...cfg.keys, ...(patch.keys || {}) }, models: { ...cfg.models, ...(patch.models || {}) }, bases: { ...cfg.bases, ...(patch.bases || {}) } }); save(); return cfg; }, status, onStatus: (f) => { listeners.add(f); return () => listeners.delete(f); }, test, ask, generateQuestions, verifyQuestion, proofread, hostLine, hostLineAI, assertAllowed, extractJson, baseOf, modelOf, sanitizeCfg };
})();

/* a minimal ZIP writer (stored, no compression): the certificates are PNG pictures that are already compressed */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {   // files: [{ name, data: Uint8Array }]
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0; const now = new Date(); const dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(); const tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  for (const f of files) { const nm = enc.encode(f.name); const crc = crc32(f.data); const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true); central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + f.data.length; }
  const csize = central.reduce((n, p) => n + p.length, 0); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* =====================================================================
   V66 glue for the ported tools.
   ===================================================================== */
const csvBlob = (rows) => new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
const safeName = (s) => String(s || 'team').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);

/** Certificate PNG (layout from V100 renderCertificate, 2400×1500). */
async function renderCertificate(team, rank) {
  const s = Store.state;
  const FONT = '"Hind Siliguri","Nirmala UI","Noto Sans Bengali","Segoe UI",system-ui,sans-serif';
  const W = 2400, Hh = 1500; const c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, Hh); g.addColorStop(0, '#0a1330'); g.addColorStop(1, '#1a1040'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  x.strokeStyle = '#e9c45b'; x.lineWidth = 22; x.strokeRect(50, 50, W - 100, Hh - 100); x.lineWidth = 4; x.strokeRect(90, 90, W - 180, Hh - 180);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 96px ' + FONT; x.fillText(s.event.brandEn || 'QUIZ CORNER', W / 2, 230);
  x.fillStyle = '#c9d2ff'; x.font = '44px ' + FONT; x.fillText('CERTIFICATE OF ACHIEVEMENT • কৃতিত্বের শংসাপত্র', W / 2, 310);
  const titleEn = ['CHAMPION', 'FIRST RUNNER-UP', 'SECOND RUNNER-UP'][rank - 1] || 'FINALIST';
  x.fillStyle = '#e9c45b'; x.font = '900 110px ' + FONT; x.fillText(titleEn + ' • ' + Sel.rankTitle(rank), W / 2, 490);
  let photoDrawn = false;
  const pu = team.photo ? await Media.url(team.photo) : '';
  if (pu) { try { const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = pu; }); const r = 170, cx = W / 2, cy = 700; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip(); const k = Math.max(2 * r / img.width, 2 * r / img.height); x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); x.restore(); x.strokeStyle = '#e9c45b'; x.lineWidth = 10; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); photoDrawn = true; } catch (e) { /* certificate still valid without a photo */ } }
  const ny = photoDrawn ? 1000 : 800; x.fillStyle = '#fff'; let fs = 110; x.font = '900 ' + fs + 'px ' + FONT; while (x.measureText(team.name).width > W - 400 && fs > 40) { fs -= 4; x.font = '900 ' + fs + 'px ' + FONT; } x.fillText(team.name, W / 2, ny);
  const pl = [team.captain && 'অধিনায়ক: ' + team.captain, ...team.players.filter(Boolean)].filter(Boolean).join('  •  '); let py = ny + 90;
  if (team.school) { x.font = '54px ' + FONT; x.fillStyle = '#ffe9a8'; x.fillText(team.school, W / 2, py); py += 80; }
  if (pl) { let f2 = 48; x.font = f2 + 'px ' + FONT; x.fillStyle = '#c9d2ff'; while (x.measureText(pl).width > W - 400 && f2 > 24) { f2 -= 2; x.font = f2 + 'px ' + FONT; } x.fillText(pl, W / 2, py); py += 80; }
  x.fillStyle = '#fff'; x.font = '52px ' + FONT; x.fillText(s.event.programme, W / 2, py + 20); x.fillText('স্থান ' + bn(rank) + '   •   পয়েন্ট ' + bn(Sel.score(team.id)), W / 2, py + 100);
  x.fillStyle = '#e9c45b'; x.font = 'italic 46px ' + FONT; x.fillText(s.event.tagline || 'Knowledge is Power', W / 2, Hh - 200); x.fillStyle = '#c9d2ff'; x.font = '34px ' + FONT; x.fillText(new Date().toLocaleDateString('en-GB') + (s.event.organizer ? '  •  ' + s.event.organizer : ''), W / 2, Hh - 140);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
}

/** Restore an old Quiz Corner V100 (QC60) backup or saved state into the V66 model. */
const Legacy = {
  isV100(j) { return isObj(j) && (j.format === 'QC60-BACKUP' || (j.schema === 60 && Array.isArray(j.teams))); },
  async convert(j) {
    const st = j.format === 'QC60-BACKUP' ? j.state : j;
    if (j.format === 'QC60-BACKUP' && j.checksum && typeof cyrb53 === 'function' && j.checksum !== cyrb53(JSON.stringify(j.state))) throw new Error('ব্যাকআপ ফাইলের checksum মেলেনি — ফাইলটি ক্ষতিগ্রস্ত বা সম্পাদিত');
    const photos = isObj(j.photos) ? j.photos : {};
    const put = async (data, name) => { if (typeof data !== 'string' || !/^data:image\//.test(data)) return ''; const id = uid('m'); try { await Media.putDataURL(id, name, 'image', data); return id; } catch (e) { return ''; } };
    const base = defaultState();
    const teams = [];
    for (let i = 0; i < arr(st.teams).length; i++) {
      const t = st.teams[i]; const d = defaultTeam(i);
      d.name = cleanStr(t.name, 80) || d.name; d.school = cleanStr(t.school, 120); d.captain = cleanStr(t.captain, 80);
      d.players = arr(t.players).concat(['', '', '']).slice(0, 3).map((p) => cleanStr(p, 80));
      d.photo = await put(t.photo, 'team' + (i + 1) + '.jpg');
      d.captainPhoto = await put(photos['m' + i + '0'], 'team' + (i + 1) + '_m1.jpg');
      d.playerPhotos[0] = await put(photos['m' + i + '1'], 'team' + (i + 1) + '_m2.jpg');
      teams.push(d);
    }
    if (teams.length) base.teams = teams;
    base.finalists = teams.slice(0, 8).map((t) => t.id);
    base.questions = arr(st.questions).map((q, i) => buildQuestion(q, i));
    if (arr(st.prelim).length) base.prelim.questions = st.prelim.filter((p) => isObj(p) && cleanStr(p.text)).map((p) => ({ id: uid('P'), text: cleanStr(p.text, 800, true), answer: cleanStr(p.answer, 300), star: !!p.star, image: '', source: 'v100' }));
    if (isObj(st.event)) {
      const e = st.event; const lines = cleanStr(e.banner, 600, true).split('\n');
      if (e.name) base.event.programme = cleanStr(e.name, 120);
      if (lines[0]) base.event.subtitle = lines[0];
      if (e.credits) base.event.credits = cleanStr(e.credits, 600, true);
      if (e.overviewNote) base.event.welcomeNote = cleanStr(e.overviewNote, 400, true);
    }
    if (arr(st.crew).length) base.crew = await Promise.all(st.crew.filter((c) => isObj(c) && cleanStr(c.name)).map(async (c, i) => ({ name: cleanStr(c.name, 80), role: cleanStr(c.role, 120), about: cleanStr(c.about, 500, true), photo: (await put(photos['crew' + i], 'crew' + i + '.jpg')) || (base.crew[i] || {}).photo || '' })));
    arr(st.rounds).forEach((r, i) => {
      const b = base.rounds.find((x) => x.id === r.id) || base.rounds[i]; if (!b || !isObj(r)) return;
      if (r.name) b.name = cleanStr(r.name, 120); if (r.label) b.label = cleanStr(r.label, 160); if (r.rules) b.rules = cleanStr(r.rules, 4000, true);
      if (r.skip) b.enabled = false; if (r.multiplier) b.multiplier = toInt(r.multiplier, 1, 5, 1);
      if (r.type === 'rapid') b.type = 'rapid'; else if (r.type === 'audio') b.type = 'bonus';
      if (Number.isFinite(r.pointsCorrect)) b.scoring.direct = r.pointsCorrect;
    });
    base.ledger = arr(st.ledger).filter(isObj).map((e) => ({ id: uid('L'), t: e.ts || Date.now(), team: (teams[e.team] || {}).id || 'T1', delta: int(e.delta, 0), before: e.before, after: e.after, reason: cleanStr(e.label || e.key || 'V100', 120), round: '', q: cleanStr(e.qid, 24), kind: { main: 'correct', challenge: 'challenge', cwrong: 'cwrong', bonus: 'bonus', wrong: 'wrong', adjust: 'adjust' }[e.key] || 'adjust' }));
    // Very old saves kept only a total score per team.
    if (!base.ledger.length) arr(st.teams).forEach((t, i) => { if (teams[i] && Number(t.score)) base.ledger.push({ id: uid('L'), t: Date.now(), team: teams[i].id, delta: int(t.score, 0), before: 0, after: int(t.score, 0), reason: 'IMPORTED SCORE', round: '', q: '', kind: 'adjust' }); });
    return base;
  },
};
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Spelling / quality findings for one V66 question, from the V100 auditor. */
function auditHtml(q) {
  const f = safe('audit', () => NLP.auditQuestion(auditShape(q)), []);
  const textIss = safe('audit', () => NLP.audit(q.text).issues.filter((i) => i.fix !== null && i.rule !== 'mixed-encoding'), []);
  if (!f.length) return '<p class="pass" style="color:var(--correct)">✔ বানান ও গঠন ঠিক আছে</p>';
  return '<div class="list">' + f.map((x) => '<div class="li" style="grid-template-columns:auto 1fr"><span class="n" style="color:' + (x.sev === 'error' ? 'var(--wrong)' : x.sev === 'warn' ? 'var(--warn)' : 'var(--muted)') + '">' + (x.sev === 'error' ? '✘' : x.sev === 'warn' ? '⚠' : 'ℹ') + '</span><div class="t">' + esc(x.msg) + '</div></div>').join('') + '</div>' + (textIss.length ? '<div class="row" style="margin-top:.4rem">' + textIss.slice(0, 8).map((i, k) => F.btn('auditFix', 'ঠিক করুন: ' + esc(i.msg.slice(0, 40)), 'sm', q.id + '|' + k)).join('') + F.btn('auditFixAll', '✔ সব ঠিক করুন (FIX ALL)', 'sm good', q.id) + '</div>' : '');
}

/** Import preview modal: file, drop zone or pasted text → validated questions. */
const ImportUI = {
  pending: null,
  open() {
    const s = Store.state;
    UI.modal('প্রশ্ন আমদানি — CSV / Excel / JSON / AI-র লেখা', '<p class="big-hint">CSV, TSV, Excel (.xlsx), JSON (AI বা পুরনো রপ্তানি) বা নম্বর দেওয়া সাধারণ লেখা ("1. প্রশ্ন … ক) … উত্তর: খ") — সব চলে। বাংলা কলাম-নাম (প্রশ্ন, উত্তর, বিকল্প ক …) ও উত্তর (ক–ঘ, ১–৪, A–D বা বিকল্পের লেখা) বোঝে। কিছুই বদলাবে না যতক্ষণ না "যোগ করুন" চাপছেন।</p>' +
      '<div id="dropZone" class="drop" tabindex="0">📂 ফাইল এখানে টেনে আনুন বা <button class="btn sm primary" data-act="importChoose">ফাইল বেছে নিন</button></div>' +
      '<label class="field"><span>অথবা লেখা পেস্ট করুন</span><textarea id="importText" rows="6" placeholder="1. বিশ্বের বৃহত্তম ম্যানগ্রোভ অরণ্য কোনটি?&#10;ক) সুন্দরবন&#10;খ) আমাজন&#10;উত্তর: ক"></textarea></label>' +
      '<div class="row"><label class="field"><span>রাউন্ড না থাকলে যে রাউন্ডে যাবে</span><select id="importRound">' + s.rounds.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label>' + F.btn('importPreview', '👁 প্রিভিউ', 'primary') + F.btn('csvTemplate', '⇩ CSV টেমপ্লেট') + '</div><div id="importOut"></div>');
    const dz = $('#dropZone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) this.preview(f); });
  },
  async preview(file) {
    const out = $('#importOut'); if (!out) return;
    const text = file ? '' : ($('#importText') || {}).value || '';
    const round = ($('#importRound') || {}).value || 'R1';
    try {
      const rounds = Store.state.rounds.map((r) => ({ id: r.id, name: r.name, label: r.label }));
      // V66 / V100 JSON files are handled by the full importer, not as a question list.
      const legacy = (t) => { try { const j = JSON.parse(t); if (isObj(j) && (j.qc66 || Legacy.isV100(j))) throw new Error('এটি পূর্ণ ইভেন্ট/ব্যাকআপ ফাইল — "সংরক্ষণ ও ব্যাকআপ ▸ আমদানি / পুনরুদ্ধার" ব্যবহার করুন'); if (Array.isArray(j) && j.length && isObj(j[0]) && ('roundId' in j[0])) return j.map((q, i) => questionFromSeed(Object.assign({}, q, { id: uid('Q') }), i)); } catch (e) { if (/ব্যাকআপ/.test(e.message)) throw e; } return []; };
      const r = await NexusImport.preview({ file, text, defaultRound: round, rounds, legacy });
      this.pending = r.list.map((q) => Object.assign(q, { id: uid('Q') }));
      out.innerHTML = '<p class="ok">' + esc(r.note || (r.list.length + 'টি প্রশ্ন পড়া হয়েছে।')) + '</p><div class="list" style="max-height:40vh;overflow:auto">' + this.pending.slice(0, 60).map((q) => '<div class="li"><span class="n">' + esc(q.roundId) + '</span><div class="t">' + esc(q.text.slice(0, 120)) + '<small>উত্তর: ' + esc(q.options[q.answer] || '') + '</small></div><span></span></div>').join('') + '</div><div class="row" style="margin-top:.5rem">' + F.btn('importAdd', '✔ ' + bn(this.pending.length) + 'টি প্রশ্ন যোগ করুন', 'good') + '</div>';
    } catch (e) { this.pending = null; out.innerHTML = '<p class="badge-warn">✘ ' + esc(e.message || String(e)) + '</p>'; }
  },
};

/** AI configuration lives only in this browser (never in backups or on the stage). */
const AIStudio = { drafts: [], verify: [], busy: false };

/* ---------------- AI STUDIO page ---------------- */
TabRender.ai = function aiPage(s) {
  const c = AI.cfg; const P = AI.PROVIDERS; const p = c.provider;
  const prov = Object.entries(P).map(([k, v]) => [k, v.label]);
  const st = AI.status;
  const drafts = AIStudio.drafts.map((d, i) => '<div class="li" style="grid-template-columns:1fr auto"><div class="t"><b>' + esc(d.q.text) + '</b><small>' + d.q.options.filter(Boolean).map((o, k) => OPT_LABELS[k] + ') ' + esc(o)).join(' • ') + ' — উত্তর: ' + esc(d.q.options[d.q.answer]) + '</small>' + (d.audit.length ? '<span class="badge-warn">' + esc(d.audit.map((a) => a.msg).join(' • ').slice(0, 200)) + '</span>' : '') + '</div><div class="acts">' + F.btn('aiAddDraft', '✔ যোগ', 'sm good', String(i)) + F.btn('aiDiscard', '✕', 'sm bad', String(i)) + '</div></div>').join('');
  const ver = AIStudio.verify.map((v) => '<div class="li" style="grid-template-columns:1fr"><div class="t">' + esc(v.label) + '<small style="color:' + (v.ok && v.agrees && !v.ambiguous ? 'var(--correct)' : 'var(--warn)') + '">' + esc(v.msg) + '</small></div></div>').join('');
  return F.card('AI সংযোগ', '<p class="big-hint">ডিফল্টে <b>Air-gapped</b>: শুধু এই কম্পিউটারের লোকাল AI (Ollama / LM Studio) চলে, ইন্টারনেটে কিছু যায় না। API key শুধু এই ব্রাউজারে থাকে — ব্যাকআপে বা স্টেজে যায় না। AI-র উত্তর সবসময় খসড়া; আপনি "যোগ" না চাপলে কিছু বদলায় না। Ollama-র জন্য OLLAMA_ORIGINS দিয়ে file পেজ অনুমতি দিন; LM Studio-তে CORS চালু করুন।</p>' +
      '<div class="g3"><label class="field"><span>প্রোভাইডার</span><select id="aiProvider">' + prov.map(([k, l]) => '<option value="' + k + '"' + (k === p ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label><label class="field"><span>মডেল</span><input id="aiModel" type="text" value="' + esc(AI.modelOf(p)) + '"></label><label class="field"><span>সার্ভারের ঠিকানা</span><input id="aiBase" type="text" value="' + esc(AI.baseOf(p)) + '"></label><label class="field"><span>API key (অনলাইন হলে)</span><input id="aiKey" type="password" value="' + esc(c.keys[p] || '') + '" autocomplete="off"></label><label class="field"><span>বিকল্প প্রোভাইডার</span><select id="aiFallback"><option value="none">নেই</option>' + prov.map(([k, l]) => '<option value="' + k + '"' + (k === c.fallback ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label><label class="field"><span>সময়সীমা (সেকেন্ড)</span><input id="aiTimeout" type="number" min="5" max="180" value="' + c.timeoutSec + '"></label></div>' +
      '<div class="row"><label class="check"><input id="aiAir" type="checkbox"' + (c.airGapped ? ' checked' : '') + '> Air-gapped: শুধু লোকাল সার্ভার</label><label class="check"><input id="aiAuto" type="checkbox"' + (c.autoCommentary ? ' checked' : '') + '> স্কোর বদলালে AI ধারাভাষ্য</label></div>' +
      '<div class="row">' + F.btn('aiSave', '💾 AI সেটিংস সংরক্ষণ', 'primary') + F.btn('aiTest', '🔌 সংযোগ পরীক্ষা') + '<span class="status-pill ' + (st.state === 'ok' ? 'ok' : st.state === 'error' ? 'bad' : '') + '">AI: ' + esc(st.msg) + '</span></div>') +
    F.card('AI দিয়ে প্রশ্ন তৈরি (খসড়া)', '<div class="g3"><label class="field"><span>বিষয়</span><input id="aiTopic" type="text" placeholder="যেমন: সুন্দরবন, সৌরজগৎ"></label><label class="field"><span>সংখ্যা (১–১০)</span><input id="aiCount" type="number" min="1" max="10" value="5"></label><label class="field"><span>ভাষা</span><select id="aiLang"><option value="bn">বাংলা</option><option value="mixed">বাংলা + ইংরেজি শব্দ</option><option value="en">English</option></select></label><label class="field"><span>কাঠিন্য</span><select id="aiDiff"><option value="easy">সহজ</option><option value="medium" selected>মাঝারি</option><option value="hard">কঠিন</option></select></label><label class="field"><span>যে রাউন্ডে যোগ হবে</span><select id="aiRound">' + s.rounds.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label></div><label class="field"><span>উৎস-নোট (ঐচ্ছিক — AI এর বাইরে কিছু বানাবে না)</span><textarea id="aiNotes" rows="3"></textarea></label><div class="row">' + F.btn('aiGenerate', AIStudio.busy ? '⏳ চলছে…' : '✨ খসড়া তৈরি করুন', 'primary') + '</div><div class="list" style="margin-top:.5rem">' + (drafts || '<p class="muted">এখনও কোনো খসড়া নেই</p>') + '</div>') +
    F.card('AI দিয়ে উত্তর যাচাই ও ধারাভাষ্য', '<div class="row"><select id="aiVerifyRound" style="width:auto">' + s.rounds.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select>' + F.btn('aiVerifyRound', '🔎 এই রাউন্ডের উত্তর যাচাই') + F.btn('aiHostLine', '🎙 AI হোস্ট লাইন') + '</div><div class="list" style="margin-top:.5rem">' + ver + '</div>');
};

Object.assign(Actions, {
  importChoose() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.txt,.json,.xlsx,text/*,application/json';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) ImportUI.preview(f); };
    inp.click();
  },
  importOpen() { ImportUI.open(); },
  importPreview() { ImportUI.preview(null); },
  importAdd() {
    const list = ImportUI.pending; if (!list || !list.length) return;
    Store.commit('import-csv', (s) => { s.questions = s.questions.concat(list); });
    ImportUI.pending = null; UI.closeModal(); UI.toast(list.length + 'টি প্রশ্ন যোগ হয়েছে', 'ok');
  },
  csvTemplate() { download('QuizCorner_template.csv', csvBlob([['round', 'number', 'text', 'a', 'b', 'c', 'd', 'answer', 'time', 'hint', 'explain', 'difficulty'], ['R1', '1', 'বিশ্বের বৃহত্তম ম্যানগ্রোভ অরণ্য কোনটি?', 'সুন্দরবন', 'আমাজন', 'কঙ্গো', 'বোর্নিও', 'A', '60', '', '', 'easy']])); },
  exportScoresCsv() { download('QuizCorner_scores.csv', csvBlob([['rank', 'team', 'school', 'score']].concat(Sel.standings().map((r) => [r.rank, r.team.name, r.team.school, r.score])))); },
  exportLedgerCsv() { const s = Store.state; download('QuizCorner_ledger.csv', csvBlob([['id', 'time', 'team', 'team_name', 'round', 'question', 'kind', 'label', 'before', 'delta', 'after']].concat(s.ledger.map((e) => [e.id, new Date(e.t).toISOString(), e.team, (Sel.team(e.team) || {}).name || '', e.round, e.q, e.kind || '', e.reason, e.before == null ? '' : e.before, e.delta, e.after == null ? '' : e.after])))); },
  exportQuestionsCsv() { const s = Store.state; download('QuizCorner_questions.csv', csvBlob([['round', 'number', 'text', 'a', 'b', 'c', 'd', 'answer', 'time', 'hint', 'explain', 'difficulty']].concat(s.questions.map((q) => [q.roundId, q.number, q.text, q.options[0], q.options[1], q.options[2], q.options[3], 'ABCD'[q.answer], q.timer || '', q.hint || '', q.explanation, q.difficulty || 'medium'])))); },
  async certificate(id) {
    const row = Sel.standings(Store.state.teams.map((t) => t.id)).find((r) => r.team.id === id); if (!row) return;
    try { download('Quiz_Corner_Certificate_' + safeName(row.team.name) + '.png', await renderCertificate(row.team, row.rank)); UI.toast('সার্টিফিকেট ডাউনলোড হয়েছে', 'ok'); } catch (e) { UI.toast('সার্টিফিকেট তৈরি হয়নি: ' + e.message, 'err'); }
  },
  async certificatesAll() {
    try {
      UI.toast('সার্টিফিকেট তৈরি হচ্ছে…');
      const files = []; const used = new Set();
      for (const r of Sel.standings()) { const blob = await renderCertificate(r.team, r.rank); let base = r.rank + '_' + safeName(r.team.name); while (used.has(base)) base += '_'; used.add(base); files.push({ name: 'Quiz_Corner_Certificate_' + base + '.png', data: new Uint8Array(await blob.arrayBuffer()) }); }
      download('Quiz_Corner_Certificates.zip', zipStore(files)); UI.toast(files.length + 'টি সার্টিফিকেট একটি ZIP-এ', 'ok');
    } catch (e) { UI.toast('সার্টিফিকেট তৈরি হয়নি: ' + e.message, 'err'); }
  },
  auditFix(arg) {
    const [id, k] = String(arg).split('|'); const q = Sel.question(id); if (!q) return;
    const iss = NLP.audit(q.text).issues.filter((i) => i.fix !== null && i.rule !== 'mixed-encoding')[int(k)];
    if (!iss) return;
    Store.commit('audit-fix', (s) => { const x = s.questions.find((y) => y.id === id); x.text = NLP.applyFix(NLP.audit(x.text).text, iss); });
  },
  auditFixAll(id) { Store.commit('audit-fix-all', (s) => { const x = s.questions.find((y) => y.id === id); if (!x) return false; x.text = NLP.fixAll(x.text); x.options = x.options.map((o) => (o ? NLP.fixAll(o) : o)); }); UI.toast('স্বয়ংক্রিয় সংশোধন প্রয়োগ হয়েছে', 'ok'); },
  bankAudit() {
    const s = Store.state; const f = UI.qFilter;
    const qs = s.questions.filter((q) => !f || q.roundId === f);
    const r = NLP.auditBank(qs.map(auditShape));
    const rows = r.rows.filter((x) => x.findings.some((y) => y.sev !== 'info'));
    UI.modal('প্রশ্ন-ব্যাংক পরীক্ষা (' + qs.length + ')', (r.bank.length ? '<div class="list">' + r.bank.map((b) => '<p class="badge-warn">' + esc(b.msg) + '</p>').join('') + '</div>' : '<p class="pass" style="color:var(--correct)">উত্তরের অবস্থান ও ডুপ্লিকেট ঠিক আছে (A=' + r.dist[0] + ', B=' + r.dist[1] + ', C=' + r.dist[2] + ', D=' + r.dist[3] + ')</p>') + '<div class="list">' + (rows.map((x) => '<div class="li" style="grid-template-columns:auto 1fr auto"><span class="n">' + esc(x.round) + '·' + bn(x.num) + '</span><div class="t">' + x.findings.filter((y) => y.sev !== 'info').map((y) => esc(y.msg)).join('<br>') + '</div>' + F.btn('qEditClose', '✎', 'sm', x.id) + '</div>').join('') || '<p class="muted">কোনো ত্রুটি নেই</p>') + '</div>');
  },
  qEditClose(id) { UI.closeModal(); Actions.qEdit(id); },
  prelimBulk() {
    const t = ($('#prelimBulk') || {}).value || ''; const items = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [q, a] = l.split('|'); return { id: uid('P'), text: cleanStr(q, 800), answer: cleanStr(a || '', 300), star: false, image: '', source: 'bulk' }; }).filter((x) => x.text);
    if (!items.length) { UI.toast('প্রতি লাইনে "প্রশ্ন|উত্তর" লিখুন', 'err'); return; }
    const replace = confirm('ঠিক আছে = বর্তমান বাছাই প্রশ্ন প্রতিস্থাপন\nবাতিল = শেষে যোগ');
    Store.commit('prelim-bulk', (s) => { s.prelim.questions = replace ? items : s.prelim.questions.concat(items); s.prelim.questions.forEach((q, i) => { if (q.source === 'bulk') q.star = (i + 1) % 3 === 0; }); s.prelim.count = Math.max(1, Math.min(100, s.prelim.questions.length)); });
    UI.toast(items.length + 'টি বাছাই প্রশ্ন', 'ok');
  },
  aiSave() {
    const p = ($('#aiProvider') || {}).value;
    AI.setCfg({ provider: p, airGapped: $('#aiAir').checked, autoCommentary: $('#aiAuto').checked, fallback: $('#aiFallback').value, timeoutSec: $('#aiTimeout').value, models: { [p]: $('#aiModel').value }, bases: { [p]: $('#aiBase').value }, keys: { [p]: $('#aiKey').value } });
    UI.toast('AI সেটিংস সংরক্ষিত (শুধু এই ব্রাউজারে)', 'ok'); UI.renderTab(true);
  },
  async aiTest() { Actions.aiSave(); await AI.test(); UI.renderTab(true); },
  async aiGenerate() {
    if (AIStudio.busy) return; AIStudio.busy = true; UI.renderTab(true);
    const round = $('#aiRound') ? $('#aiRound').value : 'R1';
    const r = await AI.generateQuestions({ topic: ($('#aiTopic') || {}).value || '', count: ($('#aiCount') || {}).value, lang: ($('#aiLang') || {}).value, difficulty: ($('#aiDiff') || {}).value, notes: ($('#aiNotes') || {}).value });
    AIStudio.busy = false;
    if (r.ok) { AIStudio.drafts = r.drafts.map((d) => ({ q: Object.assign(d.q, { roundId: round, id: uid('Q') }), audit: d.audit })); UI.toast(r.drafts.length + 'টি খসড়া', 'ok'); } else UI.toast(r.error, 'err');
    UI.renderTab(true);
  },
  aiAddDraft(i) { const d = AIStudio.drafts[int(i)]; if (!d) return; Store.commit('ai-add', (s) => { d.q.number = Sel.roundQuestions(d.q.roundId).length + 1; s.questions.push(d.q); }); AIStudio.drafts.splice(int(i), 1); UI.renderTab(true); },
  aiDiscard(i) { AIStudio.drafts.splice(int(i), 1); UI.renderTab(true); },
  async aiVerifyRound() {
    const rid = ($('#aiVerifyRound') || {}).value; AIStudio.verify = [];
    for (const q of Sel.roundQuestions(rid)) {
      if (q.options.filter(Boolean).length < 2) continue;
      const v = await AI.verifyQuestion(auditShape(q));
      AIStudio.verify.push({ label: 'প্রশ্ন ' + bn(q.number) + ': ' + q.text.slice(0, 70), ok: v.ok, agrees: v.agrees, ambiguous: v.ambiguous, msg: v.ok ? (v.agrees ? 'AI একমত' : 'AI ভিন্নমত (বেছেছে ' + 'ABCD'[v.answerIndex] + ', উত্তর ' + 'ABCD'[q.answer] + ')') + (v.ambiguous ? ' • অস্পষ্ট' : '') + ' — ' + v.reason : v.error });
      UI.renderTab(true);
      if (!v.ok) break;
    }
  },
  async aiHostLine() { const r = await AI.hostLineAI('score', { lead: (Sel.standings()[0] || { team: {} }).team.name }, 'bn'); if (r.ok) { UI.hostLine = r.text; UI.hostOpen = true; UI.liveSig = ''; UI.renderLive(); UI.toast('হোস্ট লাইন তৈরি', 'ok'); } else UI.toast(r.error, 'err'); },
});

/* ---------------- Pre-show check (V100 list, adapted) ---------------- */
const PreShow = {
  backupDone: false,
  run(s) {
    const out = [];
    const add = (ok, msg, warnOnly) => out.push([ok ? 'pass' : warnOnly ? 'warn' : 'fail', msg]);
    const ua = navigator.userAgent;
    add(/Chrome|Edg/.test(ua), 'ব্রাউজার: ' + (/Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : 'অন্য (Chrome বা Edge প্রস্তাবিত)'), true);
    add(screen.width >= 1280, 'স্ক্রিন: ' + screen.width + '×' + screen.height + ' • DPR ' + (window.devicePixelRatio || 1), true);
    add(Store.storageOk, Store.storageOk ? 'স্বয়ংক্রিয় সংরক্ষণ কাজ করছে' : 'ব্রাউজারে সংরক্ষণ ব্যর্থ — ব্যাকআপ নিন');
    add(!!(AudioDirector.unlocked && AudioDirector.ctx && AudioDirector.ctx.state === 'running'), AudioDirector.unlocked ? 'অডিও চালু' : 'অডিও এখনও চালু হয়নি — যেকোনো বোতামে একবার ক্লিক করুন', true);
    add(!!s.audio.music.theme.media, s.audio.music.theme.media ? 'থিম সং: ' + Media.label(s.audio.music.theme.media) : 'থিম সং নেই', true);
    const bnVoice = Speech.voices.some((v) => /^bn/i.test(v.lang));
    add(bnVoice, bnVoice ? 'বাংলা ভয়েস ইনস্টল আছে' : 'বাংলা ভয়েস নেই (Windows Settings ▸ Speech)', true);
    add(Sync.connected(), Sync.connected() ? 'স্টেজ উইন্ডো সংযুক্ত' : 'স্টেজ উইন্ডো খোলা নেই (O)', true);
    add(KeepAwake.state === 'on', 'স্ক্রিন জাগিয়ে রাখা: ' + KeepAwake.state, true);
    const calOk = s.display.calib === 'off' && !s.display.testCard;
    add(calOk, calOk ? 'ক্যালিব্রেশন / টেস্ট কার্ড বন্ধ' : 'ক্যালিব্রেশন বা টেস্ট কার্ড চালু — অনুষ্ঠানের আগে বন্ধ করুন');
    const fin = Sel.finalists();
    add(fin.length >= s.prelim.finalistCount, 'চূড়ান্ত দল: ' + fin.length + ' / ' + s.prelim.finalistCount);
    const generic = fin.some((t) => /^দল [০-৯]+$/.test(t.name));
    add(!generic, generic ? 'কিছু দলের নাম এখনও "দল ১…" — আসল নাম দিন' : 'সব চূড়ান্ত দলের নাম দেওয়া', true);
    const photos = fin.filter((t) => t.photo).length; add(photos === fin.length, 'দলের ছবি: ' + photos + ' / ' + fin.length, true);
    const played = s.rounds.filter((r) => r.enabled);
    played.forEach((r) => { const n = Sel.roundQuestions(r.id).length; add(n > 0 && !!r.rules, r.name + ': ' + n + 'টি প্রশ্ন' + (r.rules ? '' : ' • নিয়ম লেখা নেই'), n > 0); });
    add(!!s.prelim.rules, s.prelim.rules ? 'বাছাই পর্বের নিয়ম লেখা আছে' : 'বাছাই পর্বের নিয়ম লেখা নেই', true);
    const emptyP = Sel.prelimQuestions().filter((q) => !q.text || !q.answer).length; add(!emptyP, emptyP ? emptyP + 'টি বাছাই প্রশ্ন/উত্তর খালি' : 'সব বাছাই প্রশ্নে উত্তর আছে');
    const bank = safe('bank', () => NLP.auditBank(s.questions.filter((q) => played.some((r) => r.id === q.roundId)).map(auditShape)), { rows: [], bank: [] });
    const errs = bank.rows.filter((r) => r.findings.some((f) => f.sev === 'error')).length; add(!errs, errs ? errs + 'টি প্রশ্নে ত্রুটি (প্রশ্ন ▸ বানান পরীক্ষা)' : 'প্রশ্ন-ব্যাংকে গুরুতর ত্রুটি নেই', true);
    bank.bank.forEach((b) => add(false, b.msg, b.sev !== 'error'));
    add(this.backupDone, this.backupDone ? 'এই সেশনে ব্যাকআপ নেওয়া হয়েছে' : 'এই সেশনে এখনও ব্যাকআপ নেওয়া হয়নি', true);
    add(SoundDirector.tagoreStatus === 'ready' || !s.audio.bgm.tagore, 'রবীন্দ্র ইন্সট্রুমেন্টাল: ' + SoundDirector.tagoreStatus, true);
    out.push(['pass', 'টাইমার: সরাসরি ' + (played[0] ? played[0].timers.direct : 60) + 's • পাস ' + (played[0] ? played[0].timers.pass : 45) + 's • সতর্কতা ' + s.settings.warnAt + 's']);
    return out;
  },
};
