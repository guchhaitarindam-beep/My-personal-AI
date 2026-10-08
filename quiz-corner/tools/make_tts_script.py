"""Writes launcher/make_quiz_voices.py: a self-contained script for Google Cloud Shell that turns
every main-round question (and round 1's options, and every answer) into Bengali MP3 files named the
way the quiz's "all at once" upload understands (R1-5.mp3, R1-5-opt.mp3, R1-5-ans.mp3).
Usage: python3 -I tools/make_tts_script.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
qs = json.load(open(os.path.join(ROOT, 'assets', 'questions.json'), encoding='utf-8'))
qs = qs if isinstance(qs, list) else qs['questions']
show = json.load(open(os.path.join(ROOT, 'assets', 'show.json'), encoding='utf-8'))
rounds = [r for r in show['rounds'] if not r.get('skip')][:3]
LET = ['ক', 'খ', 'গ', 'ঘ']
items = []
for r in rounds:
    rid = r['id']
    has_opts = bool((r.get('profile') or {}).get('options', True)) and rid == 'R1'
    for q in sorted([x for x in qs if x.get('roundId') == rid], key=lambda x: x.get('number', 0)):
        n = q['number']; opts = [o for o in q.get('options', [])]
        items.append([f'{rid}-{n}.mp3', q.get('speech') or q['text']])
        if has_opts and sum(1 for o in opts if o) >= 2:
            items.append([f'{rid}-{n}-opt.mp3', '। '.join(f'বিকল্প {LET[i]}: {o}' for i, o in enumerate(opts) if o) + '।'])
        ans = q.get('answerText') or (opts[q.get('answer', 0)] if opts else '')
        if ans: items.append([f'{rid}-{n}-ans.mp3', 'সঠিক উত্তর: ' + ans + '।'])
body = r'''#!/usr/bin/env python3
# ============================================================================
#  Quiz Corner — Bengali readings for the 3 main rounds (Google Cloud Text-to-Speech)
#  Run in Google Cloud Shell:   python3 make_quiz_voices.py
#  It makes quiz_voices.zip with the MP3s named R1-5.mp3 / R1-5-opt.mp3 / R1-5-ans.mp3.
# ============================================================================
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request, zipfile

GENDER = 'FEMALE'   # 'FEMALE' or 'MALE'
VOICE = ''          # empty = the best Bengali (India) voice available; or a name such as 'bn-IN-Wavenet-A'
RATE = 0.92         # speaking speed (1.0 = normal)

ITEMS = __ITEMS__

def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def project():
    p = os.environ.get('GOOGLE_CLOUD_PROJECT') or os.environ.get('DEVSHELL_PROJECT_ID') or sh(['gcloud', 'config', 'get-value', 'project']).stdout.strip()
    if not p or p == '(unset)':
        sys.exit('\n!! No project selected. In the Cloud Shell window click "Select project" at the top (or run:  gcloud config set project YOUR_PROJECT_ID ), then run this again.\n')
    return p

PROJECT = project()
print('Project:', PROJECT)
print('Turning on the Text-to-Speech API (needs billing switched on for the project) ...')
r = sh(['gcloud', 'services', 'enable', 'texttospeech.googleapis.com', '--project', PROJECT])
if r.returncode != 0:
    print(r.stderr.strip()[-600:])
    sys.exit('\n!! Could not turn on the API. Usually the project has no billing account: Console menu > Billing > Link a billing account. Then run this again.\n')
TOKEN = sh(['gcloud', 'auth', 'print-access-token']).stdout.strip()

def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8') if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + TOKEN, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json; charset=utf-8'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 * (attempt + 1)); continue
            sys.exit('\n!! Google answered %s:\n%s\n' % (e.code, msg[:800]))

def pick_voice():
    if VOICE:
        return VOICE
    vs = call('https://texttospeech.googleapis.com/v1/voices?languageCode=bn-IN').get('voices', [])
    rank = lambda n: 0 if 'Chirp3-HD' in n else 1 if 'Chirp-HD' in n else 2 if 'Neural2' in n else 3 if 'Wavenet' in n else 4
    good = [v for v in vs if v.get('ssmlGender') == GENDER] or vs
    if not good:
        sys.exit('!! No Bengali (bn-IN) voice found.')
    good.sort(key=lambda v: (rank(v['name']), v['name']))
    return good[0]['name']

name = pick_voice()
print('Voice:', name)
out = os.path.join(os.path.expanduser('~'), 'quiz_voices'); os.makedirs(out, exist_ok=True)
for i, (fname, text) in enumerate(ITEMS, 1):
    cfg = {'audioEncoding': 'MP3'}
    if 'Chirp' not in name:
        cfg['speakingRate'] = RATE
    res = call('https://texttospeech.googleapis.com/v1/text:synthesize', {'input': {'text': text}, 'voice': {'languageCode': 'bn-IN', 'name': name}, 'audioConfig': cfg})
    open(os.path.join(out, fname), 'wb').write(base64.b64decode(res['audioContent']))
    print('%3d / %d  %s' % (i, len(ITEMS), fname))
zpath = os.path.join(out, 'quiz_voices.zip')
with zipfile.ZipFile(zpath, 'w') as z:
    for fname, _ in ITEMS:
        z.write(os.path.join(out, fname), fname)
print('\nDONE: %d files in  %s' % (len(ITEMS), zpath))
print('Download it: in Cloud Shell click  ⋮ (More)  >  Download  >  type  quiz_voices/quiz_voices.zip  >  Download')
'''
open(os.path.join(ROOT, 'launcher', 'make_quiz_voices.py'), 'w', encoding='utf-8').write(body.replace('__ITEMS__', json.dumps(items, ensure_ascii=False, indent=1)))
print(len(items), 'readings;', sum(len(t) for _, t in items), 'characters')
