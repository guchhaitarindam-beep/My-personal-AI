"""Tumi Prothoma v22 -> v23: everything on the TV around the questions is in English (countdown, scoreboards, labels,
numbers); the questions, answers, round names and picture captions stay as written (Bengali).
Usage: python3 -I patch_v23.py v22.html out.html"""
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
R = [
 ("hdr('বাছাই পর্ব শেষ')", "hdr('SELECTION ROUND OVER')"),
 ("hdr('বাছাই পর্ব')", "hdr('SELECTION ROUND')"),
 ("hdr('স্বাগতম')", "hdr('WELCOME')"),
 ("hdr('পোডিয়াম বাছাই')", "hdr('PODIUM DRAW')"),
 ("hdr('রাউন্ড ১ • ' +", "hdr('ROUND 1 • ' +"),
 ("hdr('রাউন্ড ২ • ' +", "hdr('ROUND 2 • ' +"),
 ("hdr('রাউন্ড ৪ • ' +", "hdr('ROUND 4 • ' +"),
 ("hdr('রাউন্ড ' + bn(rnum(rid)) + ' • ' + esc(rd.name))", "hdr('ROUND ' + rnum(rid) + ' • ' + esc(rd.name))"),
 ("label: `প্রশ্ন ${bn(i + 1)} / ${bn(S.c.sel.length)}`", "label: `QUESTION ${i + 1} / ${S.c.sel.length}`"),
 ("label: `প্রশ্ন ${bn(i + 1)} / ${bn(S.c.r5.length)}`", "label: `QUESTION ${i + 1} / ${S.c.r5.length}`"),
 ("label: `${kind === 'video' || kind === 'mute' ? 'ভিডিও' : 'গান'} ${bn(i + 1)} / ${bn(S.c.r2.length)}`", "label: `${kind === 'video' || kind === 'mute' ? 'VIDEO' : 'SONG'} ${i + 1} / ${S.c.r2.length}`"),
 ('<div class="qw-s">সূত্র আসছে…</div>', '<div class="qw-s">GET READY…</div>'),
 ('<small class="stp">স্টার প্রশ্ন • ডবল পয়েন্ট</small>', '<small class="stp">STAR QUESTION • DOUBLE POINTS</small>'),
 ('<div class="qc-ans in"><span>উত্তর</span>', '<div class="qc-ans in"><span>ANSWER</span>'),
 ("👀 ভালো করে দেখুন! <b>${bn(Math.ceil(o.flashLeft / 1000))}</b>", "👀 LOOK CLOSELY! <b>${Math.ceil(o.flashLeft / 1000)}</b>"),
 ("মূল মঞ্চে পৌঁছে গেল সেরা ${bn(q)} দল!", "THE TOP ${q} TEAMS ARE THROUGH!"),
 ("আজ মঞ্চে ${bn(S.teams.length)}টি দল!", "${S.teams.length} TEAMS ON STAGE!"),
 ('<div class="wel-no">দল ${bn(i + 1)}</div>', '<div class="wel-no">TEAM ${i + 1}</div>'),
 ('<div class="wel-pod">পোডিয়াম ${bn(t.podium)}</div>', '<div class="wel-pod">PODIUM ${t.podium}</div>'),
 ("`এবার বেছে নেবে ${avatar(cur, 'pn-av')} <b>${esc(cur.name)}</b>` : '🎉 সব দলের পোডিয়াম ঠিক!'", "`NOW PICKING ${avatar(cur, 'pn-av')} <b>${esc(cur.name)}</b>` : '🎉 EVERY TEAM HAS ITS PODIUM!'"),
 ('<small>পোডিয়াম</small><b>${bn(num)}</b>', '<small>PODIUM</small><b>${num}</b>'),
 ("'<div class=\"r1-wait in\">পরের দল কে?</div>'", "'<div class=\"r1-wait in\">WHO IS NEXT?</div>'"),
 ("${t ? 'একটি কার্ড বেছে নিন!' : 'লুকানো খেলার কার্ড'}", "${t ? 'PICK A CARD!' : 'HIDDEN GAME CARDS'}"),
 ("<small>দল ${bn(teamNo(u))}</small>", "<small>TEAM ${teamNo(u)}</small>"),
 ("spot(t, 'এবার মঞ্চে', true)", "spot(t, 'ON STAGE NOW', true)"),
 ("spot(t, `কার্ড ${R.card}`, false)", "spot(t, `CARD ${R.card}`, false)"),
 ("<span>পয়েন্ট</span><b>${R.pts >= 0 ? '+' : ''}${bn(R.pts || 0)}</b>", "<span>POINTS</span><b>${R.pts >= 0 ? '+' : ''}${R.pts || 0}</b>"),
 ("ph === 'ask' ? 'এবার তোমার পালা' : 'যার পালা ছিল'", "ph === 'ask' ? 'YOUR TURN' : 'WAS ASKED'"),
 ("<span>⚡ চ্যালেঞ্জ!</span> বাজার চাপুন — ", "<span>⚡ CHALLENGE!</span> PRESS THE BUZZER — "),
 ("<small>🔔 বাজার চেপেছে</small>", "<small>🔔 BUZZED</small>"),
 ("🔕 বাজার বন্ধ — প্রশ্ন শুনুন", "🔕 BUZZERS LOCKED — LISTEN"),
 ("🔔 বাজার খোলা! চাপুন!", "🔔 BUZZERS OPEN — PRESS NOW!"),
 ("<div><small>বাজার চেপেছে</small><b>${esc(who.name)}</b></div>", "<div><small>BUZZED</small><b>${esc(who.name)}</b></div>"),
 ("✘ ${bn(teamNo(id))}", "✘ ${teamNo(id)}"),
 ("পরের দল মঞ্চে আসুন!", "NEXT TEAM, PLEASE!"),
 ("'হেডফোন পরে তৈরি হোন!' : 'চোখ বেঁধে তৈরি হোন!'", "'HEADPHONES ON — GET READY!' : 'BLINDFOLD ON — GET READY!'"),
 ("সময় শুরু হলেই খেলা!", "THE GAME STARTS WITH THE TIMER!"),
 ("ঠোঁট নেড়ে বলুন • ঠিক ধরলেই +${bn(rd.pts)}", "SAY IT WITH YOUR LIPS ONLY • +${rd.pts} EACH"),
 ('<div class="hp-lbl">গন্ধ / স্বাদ</div><div class="hp-nose in">👃 ${bn(Math.min(idx + 1, items.length))} / ${bn(items.length)}</div><div class="hp-s">চিনে বলুন!</div>', '<div class="hp-lbl">SMELL / TASTE</div><div class="hp-nose in">👃 ${Math.min(idx + 1, items.length)} / ${items.length}</div><div class="hp-s">NAME IT!</div>'),
 ("<span>${rid === 'r3' ? 'ঠিক ধরেছেন' : 'ঠিক চিনেছেন'}</span><b>${bn(R.ok || 0)}/${bn(items.length)}</b><small>= ${bn((R.ok || 0) * rd.pts)} পয়েন্ট</small>", "<span>CORRECT</span><b>${R.ok || 0}/${items.length}</b><small>= ${(R.ok || 0) * rd.pts} POINTS</small>"),
 ("${mkr[i] === 'ok' ? '✔' : bn(i + 1)}", "${mkr[i] === 'ok' ? '✔' : i + 1}"),
 ('<div class="ch-sub in">${L[1]}</div>', ''),
 ("const no = rid === 'sel' ? 'বাছাই পর্ব' : bn(rnum(rid)) + ' নম্বর রাউন্ড';", "const no = rid === 'sel' ? 'SELECTION ROUND' : 'ROUND ' + rnum(rid);"),
 ("<b>${bn(i + 1)}</b><span>${esc(x)}</span>", "<b>${i + 1}</b><span>${esc(x)}</span>"),
 ("🔇 শব্দ চালু করতে এই উইন্ডোতে একবার ক্লিক করুন", "🔇 CLICK ONCE IN THIS WINDOW FOR SOUND"),
 (": `<div class=\"av ph ${cls}\" style=\"--tc:${tcolor(t.id)}\"><span>${bn(teamNo(t.id))}</span></div>`", ": `<div class=\"av ph ${cls}\" style=\"--tc:${tcolor(t.id)}\"><span>${teamNo(t.id)}</span></div>`"),
]
miss = []
for a, b in R:
    if a not in s: miss.append(a[:70]); continue
    s = s.replace(a, b)
if miss: print('NOT FOUND:', *miss, sep='\n  '); sys.exit(1)
open(dst, 'w', encoding='utf-8').write(s); print('ok', len(s))
