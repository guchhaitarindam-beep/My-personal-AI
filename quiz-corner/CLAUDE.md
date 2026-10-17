# Quiz Corner — standing rules (from the organiser, অরিন্দম গুছাইত)

Offline single-HTML quiz engine for "জুনিয়র জিনিয়াস". Control panel on the laptop, stage on the TV.
Reply to the organiser in Bengali. Questions, rules and everything on the TV stay in Bengali.

## Every delivery
- Build (`python3 tools/build.py`, and `--lite`), run the self-test and the Playwright suites in `tests/`
  (one at a time; they share the CPU), commit, push to the session's branch, then send:
  `dist/Quiz_Corner_V66_FINAL_Broadcast_Engine.html`, `launcher/START_QUIZ_CORNER.bat`,
  `launcher/QuizCorner_Launcher.ps1` and `dist/QuizCorner_13Oct_Package.zip` (`python3 -I tools/package.py`).
- Keep `launcher/README_BANGLA.txt` (CRLF) up to date with anything new.
- Everything stays on the organiser's one laptop; nothing needs to move to another computer.

## Pictures — always
- Every question / answer picture the organiser sends (PPTX decks or image files) is sharpened with AI
  before it goes into the engine: `tools/sr_build.py` + `tools/sr_run.py` (Real-ESRGAN general x4v3 via
  onnxruntime, long side 2400). Keep the picture exactly as it is otherwise (same crop as on the slide, so
  printed answers stay hidden).
- Never show or hint an answer on the TV before the answer button (R). Operator-only lists are fine.

## The question screen (rounds 1–3; the buzzer round keeps its own layout)
1. If the question has audio / video: it plays first, full screen, by itself (scores underneath only).
   When it ends — or on Next — the question comes. A video stops; audio may go on.
2. The question alone, full screen: flush with the top, left and right edges, no title line (no round name,
   no JUNIOR GENIUS SEASON 4, no question number), no corner logo. Only the score strip at the bottom.
   A picture keeps its own shape at full height (no stretching or cropping).
3. On Next (or after `settings.qAloneSec`, 12 s, or when the timer starts): the question shrinks to the side;
   the corner logo, the answering team's card (one photo of both children, 4:3), the timer come in;
   options (where a round has them) and everything else after that.
- Big / long / high-quality audio and video play straight from the `QuizCorner_Media` folder next to the quiz
  file (clip id `file:<name>`, files named `R1-5.mp4` …); small clips may be copied into the engine.
- The score strip is always at the bottom. Round-end scoreboards and the champion screens stay as they are
  (or better).

## Rounds and rules
- Old quizzes arrive as `.pptx` decks; the in-engine importer (`src/js/06c-pptx.js`) reads them. When the
  organiser sends a deck here, follow that deck's way of playing (options or none, its rules) — the
  organiser sends the rules beforehand; set them up before the show. Ask when a deck's rules clash with
  the engine's current round rules.
- Current show: round 1 মজার মিশেল (picture questions, challenge), round 2 চিন্তা ও চয়েস (pass round,
  H/8 → A/1, passes backwards), round 3 বুদ্ধির টক্কর (picture questions, challenge), buzzer round
  বাজাও বাজার (20 two-option questions, 15 s).

## Git
- No pull request unless asked. No model names in commits or files.
