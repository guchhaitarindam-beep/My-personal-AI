"""Builds the download package: dist/QuizCorner_13Oct_Package.zip
(the full quiz file, the one-click launcher and the Bengali guide, in one folder).
Usage: python3 -I tools/package.py   (run tools/build.py first)"""
import os, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'dist'); L = os.path.join(ROOT, 'launcher')
files = [(os.path.join(D, 'Quiz_Corner_V66_FINAL_Broadcast_Engine.html'), 'Quiz_Corner_V66_FINAL_Broadcast_Engine.html'),
         (os.path.join(L, 'START_QUIZ_CORNER.bat'), 'START_QUIZ_CORNER.bat'),
         (os.path.join(L, 'QuizCorner_Launcher.ps1'), 'QuizCorner_Launcher.ps1'),
         (os.path.join(L, 'README_BANGLA.txt'), 'README_BANGLA.txt')]
out = os.path.join(D, 'QuizCorner_13Oct_Package.zip')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for src, name in files:
        z.write(src, 'QuizCorner/' + name)
print(out, round(os.path.getsize(out) / 1e6, 2), 'MB')
