#!/usr/bin/env python3
# ============================================================================
#  Quiz Corner — Bengali readings for the 3 main rounds (Google Cloud Text-to-Speech)
#  Run in Google Cloud Shell:   python3 make_quiz_voices.py
#  It makes quiz_voices.zip with one MP3 per question, named R1-5.mp3 (round 1, question 5).
# ============================================================================
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request, zipfile

GENDER = 'FEMALE'   # 'FEMALE' or 'MALE'
VOICE = ''          # empty = the best Bengali (India) voice available; or a name such as 'bn-IN-Wavenet-A'
RATE = 0.92         # speaking speed (1.0 = normal)

ITEMS = [
 [
  "R1-1.mp3",
  "সম্প্রতি ২০২৬ সালের সেপ্টেম্বর মাসে ভারতের প্রথম LNG-চালিত ট্রেনটি কোন শহর থেকে উদ্বোধন করা হয়?"
 ],
 [
  "R1-2.mp3",
  "উপেন্দ্রকিশোর রায়চৌধুরীর 'টুনটুনির বই'-এর গল্পে যে চালাক শিয়াল কুমিরের ছানাদের লেখাপড়া শেখানোর ভার নিয়ে একটা একটা করে ছানা খেয়ে ফেলে, তাকে কী বলা হয়?"
 ],
 [
  "R1-3.mp3",
  "শরতে কাশফুল ফোটার সময় কলকাতার যে উৎসব ২০২১ সালে ইউনেস্কোর 'মানবতার অধরা সাংস্কৃতিক ঐতিহ্য'-এর তালিকায় স্থান পেয়েছে, তার নাম কী?"
 ],
 [
  "R1-4.mp3",
  "মানবদেহের সবচেয়ে বড় অঙ্গ কোনটি?"
 ],
 [
  "R1-5.mp3",
  "ফুটবলের ইতিহাসে একমাত্র খেলোয়াড় হিসেবে তিনবার বিশ্বকাপ জিতেছেন ব্রাজিলের যে কিংবদন্তি, যাঁকে আমরা 'কালো মানিক' নামে চিনি, তাঁর নাম কী?"
 ],
 [
  "R1-6.mp3",
  "ভারতের কোন রাজ্যে সবার আগে সূর্যোদয় হয়?"
 ],
 [
  "R1-7.mp3",
  "সূর্যের যে আলো এই মুহূর্তে তোমার চোখে পড়ছে, সেই আলো সূর্য ছেড়ে পৃথিবীতে পৌঁছতে প্রায় কত সময় নিয়েছে?"
 ],
 [
  "R1-8.mp3",
  "২০০৯ সালে ভারত সরকার কোন প্রাণীকে দেশের 'জাতীয় জলজ প্রাণী' হিসেবে ঘোষণা করে?"
 ],
 [
  "R1-9.mp3",
  "সত্যজিৎ রায়ের সৃষ্টি করা এই বিজ্ঞানী নানা আশ্চর্য জিনিস আবিষ্কার করেন এবং পোষা বিড়াল 'নিউটন'-কে নিয়ে অভিযানে যান। চরিত্রটির নাম কী?"
 ],
 [
  "R1-10.mp3",
  "রবীন্দ্রনাথ ঠাকুরের লেখা ও সুর দেওয়া 'জনগণমন' আমাদের জাতীয় সংগীত। তাঁরই লেখা 'আমার সোনার বাংলা' গানটি আমাদের কোন প্রতিবেশী দেশের জাতীয় সংগীত?"
 ],
 [
  "R2-1.mp3",
  "মায়ের গর্ভে থাকার সময়েই চক্রব্যূহে ঢোকার কৌশল শিখেছিলেন, কিন্তু বেরোনোর কৌশল জানতেন না — মহাভারতের এই কিশোর বীর কে?"
 ],
 [
  "R2-2.mp3",
  "সুকুমার রায়ের 'খিচুড়ি' ছড়ায় হাঁস আর সজারু মিলে কোন আজব প্রাণী তৈরি হয়েছিল?"
 ],
 [
  "R2-3.mp3",
  "১৯৩০ সালে চট্টগ্রাম অস্ত্রাগার দখলের নেতৃত্ব দিয়েছিলেন যে শিক্ষক-বিপ্লবী, তাঁকে সবাই কী নামে চেনে?"
 ],
 [
  "R2-4.mp3",
  "নারায়ণ গঙ্গোপাধ্যায়ের লেখা পটলডাঙার দলপতি, যে উত্তেজিত হলেই 'ডি-লা-গ্র্যান্ডি মেফিস্টোফিলিস' বলে চেঁচিয়ে ওঠে, তার নাম কী?"
 ],
 [
  "R2-5.mp3",
  "১৯৮৮ সালে দাবায় ভারতের প্রথম গ্র্যান্ডমাস্টার হয়েছিলেন কে?"
 ],
 [
  "R2-6.mp3",
  "রবীন্দ্রনাথ ঠাকুর ১৯১৩ সালে কোন বইয়ের জন্য প্রথম এশীয় হিসেবে সাহিত্যে নোবেল পুরস্কার পান?"
 ],
 [
  "R2-7.mp3",
  "'পথের পাঁচালী'-র লেখক, যিনি ছোটদের জন্য 'আম আঁটির ভেঁপু' লিখেছিলেন, তাঁর নাম কী?"
 ],
 [
  "R2-8.mp3",
  "'ক্রেস্কোগ্রাফ' যন্ত্র আবিষ্কার করে গাছেরও যে প্রাণ আছে এবং আঘাতে সাড়া দেয়, তা প্রমাণ করেছিলেন কোন বাঙালি বিজ্ঞানী?"
 ],
 [
  "R2-9.mp3",
  "১৯৫২ সালের ২১শে ফেব্রুয়ারি মাতৃভাষার জন্য প্রাণ দেওয়া শহিদদের স্মরণে ইউনেস্কো ঘোষিত যে দিবস সারা বিশ্বে পালিত হয়, তার নাম কী?"
 ],
 [
  "R2-10.mp3",
  "১৯৯৭ সালে মহাকাশে পাড়ি দেওয়া ভারতে জন্মগ্রহণকারী প্রথম মহিলা কে, যিনি ২০০৩ সালে 'কলম্বিয়া' মহাকাশযানের দুর্ঘটনায় প্রাণ হারান?"
 ],
 [
  "R3-1.mp3",
  "আমাদের বিদ্যালয়ে প্রার্থনার সময় আমরা 'বন্দে মাতরম' গানটি গেয়ে থাকি। বঙ্কিমচন্দ্র চট্টোপাধ্যায়ের লেখা এই গানটি তাঁর কোন উপন্যাসে রয়েছে?"
 ],
 [
  "R3-2.mp3",
  "রাবণকে বধ করার আগে শ্রীরামচন্দ্র শরৎকালে দেবী দুর্গার যে অসময়ের পূজা করেছিলেন, তাকে কী বলা হয়?"
 ],
 [
  "R3-3.mp3",
  "সৌরজগতের কোন গ্রহে একটি দিন (নিজের অক্ষে একবার ঘুরতে লাগা সময়) তার একটি বছরের (সূর্যকে একবার প্রদক্ষিণের সময়) চেয়েও লম্বা?"
 ],
 [
  "R3-4.mp3",
  "পশ্চিমবঙ্গের স্কুলগুলিতে পিএম পোষণ (মিড-ডে মিল) প্রকল্প বাস্তবায়নের সঙ্গে যুক্ত যে অলাভজনক সংস্থাটি আগে 'ISKCON Food Relief Foundation' নামে পরিচিত ছিল এবং যার কলকাতার তারাতলায় একটি বিশাল কেন্দ্রীয় রান্নাঘর (মেগা কিচেন) রয়েছে, সেটির বর্তমান নাম কী?"
 ],
 [
  "R3-5.mp3",
  "সত্যজিৎ রায়ের গোয়েন্দা প্রদোষচন্দ্র মিত্র 'মগজাস্ত্র' দিয়ে রহস্যের সমাধান করেন। তাঁর ডাকনাম কী?"
 ],
 [
  "R3-6.mp3",
  "১৯৭৩ সালে হিমালয়ের গ্রামের মানুষ, বিশেষ করে মহিলারা, গাছ কাটা আটকাতে যে আন্দোলন করেছিলেন তার নাম 'চিপকো আন্দোলন'। 'চিপকো' কথাটির অর্থ অনুযায়ী তাঁরা গাছ বাঁচাতে কী করেছিলেন?"
 ],
 [
  "R3-7.mp3",
  "কোন পাখি নিজে বাসা বানায় না, কাকের বাসায় চুপিচুপি ডিম পেড়ে আসে, আর কাক-ই না জেনে তার ছানাদের বড় করে তোলে?"
 ],
 [
  "R3-8.mp3",
  "হুগলি জেলার রাধানগর গ্রামে জন্মানো যে সমাজসংস্কারক সতীদাহ প্রথা বন্ধ করতে লড়াই করেছিলেন এবং যাঁকে 'ভারতীয় নবজাগরণের জনক' বলা হয়, তিনি কে?"
 ],
 [
  "R3-9.mp3",
  "বাঁকুড়া জেলার পাঁচমুড়া গ্রামের কারিগরদের তৈরি কোন পোড়ামাটির শিল্পকর্ম বাংলার লোকশিল্পের প্রতীক হিসেবে পরিচিত?"
 ],
 [
  "R3-10.mp3",
  "১৯৭৫ সালে মহাকাশে পাঠানো ভারতের প্রথম কৃত্রিম উপগ্রহটির নাম কোন প্রাচীন ভারতীয় গণিতবিদ ও জ্যোতির্বিদের নামে রাখা হয়েছিল?"
 ]
]

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
