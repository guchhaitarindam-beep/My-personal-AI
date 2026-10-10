"""Downloads Bengali+Latin woff2 subsets from Google Fonts once and writes
assets/fonts.css with the files embedded as data URIs, so the built engine
renders every Bengali font fully offline."""
import re, base64, urllib.request, sys
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
FAMILIES = [
    'Hind+Siliguri:wght@400;600;700',
    'Tiro+Bangla:ital@0;1',
    'Noto+Serif+Bengali:wght@400;700',
    'Noto+Sans+Bengali:wght@400;700',
    'Mina:wght@400;700',
    'Galada',
    'Anek+Bangla:wght@400;700',
]
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=60).read()
out = ['/* Embedded Bengali font subsets (SIL Open Font License) */']
for fam in FAMILIES:
    css = get('https://fonts.googleapis.com/css2?family=' + fam + '&display=swap').decode()
    for comment, block in re.findall(r'/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})', css, re.S):
        if comment not in ('bengali', 'latin'):
            continue
        url = re.search(r'url\((https://[^)]+)\)', block).group(1)
        data = base64.b64encode(get(url)).decode()
        out.append(block.replace(url, 'data:font/woff2;base64,' + data))
        print(fam, comment, len(data), file=sys.stderr)
# Variable fonts return the same file for each weight: merge into one range.
merged, seen = [out[0]], {}
for b in out[1:]:
    src = re.search(r'url\((data:[^)]+)\)', b).group(1)
    if src in seen:
        i = seen[src]
        ws = sorted(re.findall(r'font-weight: (\d+)', merged[i] + b), key=int)
        merged[i] = re.sub(r'font-weight: [\d ]+;', f'font-weight: {ws[0]} {ws[-1]};', merged[i])
        continue
    seen[src] = len(merged)
    merged.append(b)
open(sys.argv[1], 'w').write('\n'.join(merged))
