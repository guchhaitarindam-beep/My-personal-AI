"""Builds the single-file Quiz Corner engine.

Usage: python3 -I tools/build.py [--lite]
  default  -> dist/Quiz_Corner_V66_FINAL_Broadcast_Engine.html (all media embedded)
  --lite   -> dist/Quiz_Corner_V66_FINAL_LITE.html (no built-in songs; add your own in the Audio tab)
"""
import base64, json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
lite = '--lite' in sys.argv

def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()

def data_uri(name, mime):
    with open(os.path.join(A, name), 'rb') as f:
        return 'data:' + mime + ';base64,' + base64.b64encode(f.read()).decode()

seed = {
    'questions': json.load(open(os.path.join(A, 'questions.json'), encoding='utf-8')),
    'testQuestions': json.load(open(os.path.join(A, 'test-questions.json'), encoding='utf-8')),
    'prelim': json.load(open(os.path.join(A, 'prelim.json'), encoding='utf-8')),
    'show': json.load(open(os.path.join(A, 'show.json'), encoding='utf-8')),
}
seed_json = json.dumps(seed, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

assets = [('logo', 'logo.jpg', 'image/jpeg'), ('crew0', 'photo_crew0.jpg', 'image/jpeg'), ('crew1', 'photo_crew1.jpg', 'image/jpeg'),
          ('group', 'photo_group.jpg', 'image/jpeg'), ('Q01_bankim.jpg', 'qmedia_Q01_bankim.jpg', 'image/jpeg'),
          ('Q04_mega_kitchen.jpg', 'qmedia_Q04_mega_kitchen.jpg', 'image/jpeg')]
if not lite:
    assets += [('theme', 'theme.mp3', 'audio/mpeg'), ('welcome', 'welcome_tagore.mp3', 'audio/mpeg')]
asset_html = '\n'.join('<script type="text/plain" id="asset-%s">%s</script>' % (aid, data_uri(f, m)) for aid, f, m in assets)

js_parts = sorted(glob.glob(os.path.join(ROOT, 'src', 'js', '*.js')))
js = "(() => {\n'use strict';\n" + '\n'.join(read('src', 'js', os.path.basename(p)) for p in js_parts) + '\n})();'
if '</script' in js.lower():
    raise SystemExit('script contains a closing script tag')

html = read('src', 'template.html')
html = html.replace('/*@@FONTS@@*/', read('assets', 'fonts.css'))
html = html.replace('/*@@STYLES@@*/', read('src', 'styles.css'))
html = html.replace('/*@@SEED@@*/', seed_json)
html = html.replace('<!--@@ASSETS@@-->', asset_html)
html = html.replace('/*@@SCRIPT@@*/', js)

out = os.path.join(ROOT, 'dist', 'Quiz_Corner_V66_FINAL_LITE.html' if lite else 'Quiz_Corner_V66_FINAL_Broadcast_Engine.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
