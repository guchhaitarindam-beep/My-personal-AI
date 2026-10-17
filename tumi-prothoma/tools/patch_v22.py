"""Tumi Prothoma v21 -> v22: every TV screen fits (long questions / answers / rules never run off the screen),
Bengali on the TV (scoreboards, countdown, digits), bigger score strip, sound hint out of the way.
Usage: python3 -I patch_v22.py v21.html out.html"""
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

CSS = r"""
/* v22: bigger, clearer score strip; sound hint small at the top; Bengali headings */
.tk em{font-size:44px!important;font-weight:900!important;text-shadow:0 3px 0 rgba(0,0,0,.5)}
.tk .tkn{word-break:keep-all!important;overflow-wrap:normal!important;font-size:28px!important;font-weight:700!important}
.snd{right:auto!important;bottom:auto!important;left:190px!important;top:8px!important;padding:4px 16px!important;font-size:18px!important;opacity:.85}
.sb-head{letter-spacing:0!important;font-size:30px!important}
.rules.cmp{padding-top:140px}.rules.cmp .rl-ic{font-size:70px}.rules.cmp .rl-name{font-size:92px}.rules.cmp .rl-sub{font-size:36px}.rules.cmp .rl-list{margin-top:14px}
"""
rep('</style></head>', CSS + '</style></head>')

# --- TV text in Bengali ---
rep("'SCOREBOARD — AFTER ROUND ' + rnum(rid)", "'স্কোরবোর্ড — রাউন্ড ' + bn(rnum(rid)) + '-এর পরে'")
rep("${hdr('FINAL SCOREBOARD')}${ranksTable(null, n === 0 ? 0 : S.teams.length, 'FINAL SCOREBOARD')}", "${hdr('চূড়ান্ত ফলাফল')}${ranksTable(null, n === 0 ? 0 : S.teams.length, 'চূড়ান্ত স্কোরবোর্ড')}")
rep("<div class=\"sb-head\"><span>RANK</span><span></span><span>TEAM</span><span></span><span>${roundId ? 'ROUND' : ''}</span><span>TOTAL</span></div>",
    "<div class=\"sb-head\"><span>স্থান</span><span></span><span>দল</span><span></span><span>${roundId ? 'এই রাউন্ড' : ''}</span><span>মোট</span></div>")
rep("<div class=\"sb-rk\">${vis ? r.rank : ''}</div>", "<div class=\"sb-rk\">${vis ? bn(r.rank) : ''}</div>")
rep("<div class=\"sb-rp\">${vis && roundId ? (rp > 0 ? '+' : '') + rp : ''}</div>", "<div class=\"sb-rp\">${vis && roundId ? (rp > 0 ? '+' : '') + bn(rp) : ''}</div>")
rep("<div class=\"sb-tot\">${vis ? r.tot : ''}</div>", "<div class=\"sb-tot\">${vis ? bn(r.tot) : ''}</div>")
rep("<div class=\"ch-s\">${r.tot} POINTS</div>", "<div class=\"ch-s\">${bn(r.tot)} পয়েন্ট</div>")
rep("<b>${teamNo(t.id)}</b><span class=\"tkn\">${esc(t.name)}</span><em>${total(t.id)}</em>", "<b>${bn(teamNo(t.id))}</b><span class=\"tkn\">${esc(t.name)}</span><em>${bn(total(t.id))}</em>")
rep("<div class=\"cd-lbl\">SELECTION ROUND STARTS IN</div><div class=\"cd-ring\"></div><div class=\"cd-txt in\">GET READY!</div>", "<div class=\"cd-lbl\">বাছাই পর্ব শুরু হচ্ছে</div><div class=\"cd-ring\"></div><div class=\"cd-txt in\">তৈরি তো?</div>")
rep("lbl = id === 'cd1' ? 'SELECTION ROUND STARTS IN' : 'THE MAIN ROUND STARTS IN'", "lbl = id === 'cd1' ? 'বাছাই পর্ব শুরু হচ্ছে' : 'মূল পর্ব শুরু হচ্ছে'")
rep("st === -1 ? `<div class=\"cd-txt in\">GET READY!</div>` : st === 0 ? `<div class=\"cd-txt in\">COUNTDOWN BEGINS…</div>` : st === 11 ? `<div class=\"cd-go in\">GO!</div>` : `<div class=\"cd-num in\">${11 - st}</div>`",
    "st === -1 ? `<div class=\"cd-txt in\">তৈরি তো?</div>` : st === 0 ? `<div class=\"cd-txt in\">গোনা শুরু…</div>` : st === 11 ? `<div class=\"cd-go in\">শুরু!</div>` : `<div class=\"cd-num in\">${bn(11 - st)}</div>`")
# selection title showed "বাছাই পর্ব" twice
rep("<div class=\"rl-no\">${no}</div>", "${no && no !== rd.name ? `<div class=\"rl-no\">${no}</div>` : ''}")

# --- every screen fits: shrink long text until nothing runs off the TV ---
JS = r"""
function fitStage(sc) {
  if (!sc || !sc.clientHeight) return; // hidden preview: fitted again on the next change
  const fs = (el) => parseFloat(getComputedStyle(el).fontSize) || 40;
  const set = (el, px) => el.style.setProperty('font-size', px + 'px', 'important');
  // what the content needs, from layout sizes (animations that move things do not count)
  const oh = (c) => { const m = getComputedStyle(c); return c.offsetHeight + (parseFloat(m.marginTop) || 0) + (parseFloat(m.marginBottom) || 0); };
  const need = (box) => {
    const cs = getComputedStyle(box), kids = [...box.children].filter((c) => c.offsetParent !== null && getComputedStyle(c).position !== 'absolute');
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), gap = parseFloat(cs.rowGap) || 0;
    if (cs.display.includes('flex') && cs.flexDirection.startsWith('row') && cs.flexWrap === 'nowrap') return pad + Math.max(0, ...kids.map((c) => oh(c)));
    if (cs.display.includes('flex') && cs.flexDirection.startsWith('row')) { const rows = {}; kids.forEach((c) => { rows[c.offsetTop] = Math.max(rows[c.offsetTop] || 0, oh(c)); }); const v = Object.values(rows); return pad + v.reduce((x, y) => x + y, 0) + gap * Math.max(0, v.length - 1); }
    return pad + kids.reduce((x, c) => x + oh(c), 0) + gap * Math.max(0, kids.length - 1);
  };
  $$('.qc', sc).forEach((qc) => {
    const body = $('.qc-body', qc) || $('.qc-wait', qc); if (!body) return;
    const avail = () => qc.clientHeight - [...qc.children].filter((c) => c !== body && getComputedStyle(c).position !== 'absolute').reduce((x, c) => x + c.offsetHeight, 0);
    const shrink = [...$$('.qc-prompt, .qc-ans b, .qw-ic, .qw-t, .qw-s, .opt', qc)];
    for (let k = 0; k < 40 && need(body) > avail() - 24; k++) shrink.forEach((el) => set(el, Math.max(28, fs(el) * 0.94)));
  });
  const rl = $('.rules', sc), ol = rl && $('.rl-list', rl);
  if (ol && ol.offsetTop + ol.offsetHeight > rl.clientHeight - 16) {
    rl.classList.add('cmp'); const lis = $$('li', ol);
    for (let k = 0; k < 30 && ol.offsetTop + ol.offsetHeight > rl.clientHeight - 16; k++) lis.forEach((li) => { set(li, Math.max(26, fs(li) * 0.94)); li.style.padding = '8px 22px'; li.style.margin = '8px 0'; });
  }
}
function fitSoon(sc) { fitStage(sc); [120, 450, 1200].forEach((ms) => setTimeout(() => fitStage(sc), ms)); $$('img', sc).forEach((im) => { if (!im.complete) im.addEventListener('load', () => fitStage(sc), { once: true }); }); }
if (document.fonts) { const refit = () => { if (stageEl) fitStage($('#sc', stageEl)); }; if (document.fonts.ready) document.fonts.ready.then(refit); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', refit); }
"""
rep("function renderStage() {", JS + "function renderStage() {")
rep("""    $$('[data-tmr]', sc).forEach((e) => { e._k = ''; });
    tickTimers();
  }
  applyAv(v.av);""", """    $$('[data-tmr]', sc).forEach((e) => { e._k = ''; });
    tickTimers(); fitSoon(sc);
  }
  applyAv(v.av);""")
open(dst, 'w', encoding='utf-8').write(s)
print('ok', len(s))
