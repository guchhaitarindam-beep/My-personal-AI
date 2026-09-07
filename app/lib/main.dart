import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:vibration/vibration.dart';

void main() => runApp(const MyPersonalAI());

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

enum AiMode { chapter, general, web }

enum VoiceLanguage { bengali, indianEnglish }

class ChatItem {
  final bool user;
  final String text;
  final List<dynamic> citations;
  ChatItem(this.user, this.text, [this.citations = const []]);
}

class SourceItem {
  final String id, name, type;
  final int chunks;
  final int size;
  final Map<String, dynamic> meta;
  const SourceItem(this.id, this.name, this.type, this.chunks, this.size, this.meta);
}

const _brand = Color(0xFF3454D1);
const _brandDark = Color(0xFF1F2A56);
const _accent = Color(0xFF17B890);

// High-contrast palette: pure black background + bright yellow text/controls
// is one of the most legible combinations for low-vision users.
const _hcBg = Color(0xFF000000);
const _hcFg = Color(0xFFFFD400);
const _hcSurface = Color(0xFF121212);

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

class MyPersonalAI extends StatefulWidget {
  const MyPersonalAI({super.key});
  @override
  State<MyPersonalAI> createState() => _MyPersonalAIState();
}

class _MyPersonalAIState extends State<MyPersonalAI> {
  double textScale = 1.0;
  bool highContrast = false;

  @override
  void initState() {
    super.initState();
    _loadDisplayPrefs();
  }

  Future<void> _loadDisplayPrefs() async {
    final p = await SharedPreferences.getInstance();
    setState(() {
      textScale = p.getDouble('textScale') ?? 1.0;
      highContrast = p.getBool('highContrast') ?? false;
    });
  }

  void applyDisplayPrefs({double? scale, bool? contrast}) {
    setState(() {
      if (scale != null) textScale = scale;
      if (contrast != null) highContrast = contrast;
    });
  }

  @override
  Widget build(BuildContext context) {
    final lightScheme = ColorScheme.fromSeed(seedColor: _brand, brightness: Brightness.light).copyWith(secondary: _accent);
    final darkScheme = ColorScheme.fromSeed(seedColor: _brand, brightness: Brightness.dark).copyWith(secondary: _accent);
    final hcScheme = const ColorScheme.dark().copyWith(
      surface: _hcSurface,
      primary: _hcFg,
      onPrimary: Colors.black,
      secondary: _hcFg,
      onSurface: _hcFg,
    );
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'My Personal AI',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: highContrast ? hcScheme : lightScheme,
        scaffoldBackgroundColor: highContrast ? _hcBg : const Color(0xFFF4F6FC),
        appBarTheme: AppBarTheme(centerTitle: false, elevation: 0, backgroundColor: highContrast ? _hcBg : null, foregroundColor: highContrast ? _hcFg : null),
        navigationBarTheme: NavigationBarThemeData(indicatorColor: (highContrast ? hcScheme : lightScheme).primaryContainer, backgroundColor: highContrast ? _hcSurface : null),
        inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
        textTheme: highContrast ? Typography.whiteMountainView.apply(bodyColor: _hcFg, displayColor: _hcFg) : null,
      ),
      darkTheme: ThemeData(useMaterial3: true, colorScheme: darkScheme, appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0)),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: HomePage(onDisplayPrefsChanged: applyDisplayPrefs, textScale: textScale, highContrast: highContrast),
    );
  }
}

class HomePage extends StatefulWidget {
  final void Function({double? scale, bool? contrast}) onDisplayPrefsChanged;
  final double textScale;
  final bool highContrast;
  const HomePage({super.key, required this.onDisplayPrefsChanged, required this.textScale, required this.highContrast});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int tab = 0;
  AiMode mode = AiMode.chapter;
  VoiceLanguage voiceLanguage = VoiceLanguage.bengali;
  final FlutterTts tts = FlutterTts();
  final stt.SpeechToText speech = stt.SpeechToText();
  final AudioPlayer cloudPlayer = AudioPlayer();
  final TextEditingController input = TextEditingController();
  final ScrollController scroll = ScrollController();

  String backendUrl = 'http://10.0.2.2:8000';
  String? sourceName, sourceId;
  String sessionId = '';
  bool listening = false, busy = false, speaking = false, online = false, checkingHealth = false;
  bool cloudVoice = false; // premium Google neural voice via backend /tts
  bool continuousReading = true; // auto-advance through sentences without manual "next" taps
  bool conversationMode = false; // hands-free: listen -> ask -> speak -> listen again
  double rate = .46;
  List<SourceItem> sources = [];
  List<ChatItem> messages = [
    ChatItem(false,
        'নমস্কার! আমি My Personal AI।\n\nবাঁ দিকে Library থেকে একটা বই/PDF/ছবি upload করুন — তারপর আমি শুধু সেই source-এর ভেতর থেকেই উত্তর দেব।\n\nচোখে দেখতে অসুবিধা হলে নিচের বড় মাইক্রোফোন বোতাম চেপে "কথোপকথন মোড" চালু করুন — তারপর শুধু কথা বলে যেতে পারবেন, স্ক্রিনে হাত দেওয়ার দরকার নেই।')
  ];
  List<String> spokenParts = [];
  int spokenIndex = 0;

  @override
  void initState() {
    super.initState();
    _load();
    tts.setCompletionHandler(() {
      if (!mounted) return;
      _onSpeechSegmentDone();
    });
    tts.setErrorHandler((_) {
      if (mounted) setState(() => speaking = false);
    });
  }

  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    tts.stop();
    speech.stop();
    cloudPlayer.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    backendUrl = (p.getString('backendUrl') ?? backendUrl).replaceAll(RegExp(r'/$'), '');
    voiceLanguage = p.getString('voiceLanguage') == 'en' ? VoiceLanguage.indianEnglish : VoiceLanguage.bengali;
    rate = p.getDouble('rate') ?? .46;
    sessionId = p.getString('sessionId') ?? '';
    cloudVoice = p.getBool('cloudVoice') ?? false;
    continuousReading = p.getBool('continuousReading') ?? true;
    if (mounted) setState(() {});
    await checkHealth();
    await loadSources();
    if (sessionId.isEmpty && online) await newSession(silent: true);
    // Spoken welcome for a user who cannot see the screen at all.
    await Future.delayed(const Duration(milliseconds: 400));
    await speakRaw(online ? 'My Personal AI চালু হয়েছে। Backend সংযুক্ত আছে।' : 'My Personal AI চালু হয়েছে। Backend সংযুক্ত নেই, Settings থেকে Backend URL পরীক্ষা করুন।');
  }

  String cleanErr(Object e) => e.toString().replaceFirst('Exception: ', '').replaceAll(RegExp(r'\s+'), ' ').trim();

  void snack(String s, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(s),
      backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      behavior: SnackBarBehavior.floating,
    ));
    SemanticsService.announce(s, TextDirection.ltr);
  }

  Future<void> _buzz() async {
    try {
      if (await Vibration.hasVibrator()) Vibration.vibrate(duration: 40);
    } catch (_) {}
  }

  Future<void> savePref(String key, Object value) async {
    final p = await SharedPreferences.getInstance();
    if (value is String) await p.setString(key, value);
    if (value is double) await p.setDouble(key, value);
    if (value is bool) await p.setBool(key, value);
  }

  Future<void> checkHealth() async {
    setState(() => checkingHealth = true);
    try {
      final r = await http.get(Uri.parse('$backendUrl/health')).timeout(const Duration(seconds: 6));
      if (mounted) setState(() => online = r.statusCode == 200);
    } catch (_) {
      if (mounted) setState(() => online = false);
    } finally {
      if (mounted) setState(() => checkingHealth = false);
    }
  }

  Future<void> loadSources() async {
    try {
      final r = await http.get(Uri.parse('$backendUrl/sources')).timeout(const Duration(seconds: 15));
      if (r.statusCode != 200) return;
      final list = (jsonDecode(r.body)['sources'] as List?) ?? [];
      final parsed = list
          .map((x) => SourceItem(
                x['id'].toString(),
                x['name'].toString(),
                x['type'].toString(),
                (x['chunks'] as num?)?.toInt() ?? 0,
                (x['size'] as num?)?.toInt() ?? 0,
                Map<String, dynamic>.from(x['meta'] ?? {}),
              ))
          .toList();
      if (mounted) setState(() => sources = parsed);
    } catch (_) {}
  }

  Future<void> newSession({bool silent = false}) async {
    try {
      final r = await http
          .post(Uri.parse('$backendUrl/sessions'), headers: {'content-type': 'application/json'}, body: jsonEncode({'title': 'My Personal AI Chat'}))
          .timeout(const Duration(seconds: 10));
      if (r.statusCode >= 200 && r.statusCode < 300) {
        sessionId = jsonDecode(r.body)['id'].toString();
        await savePref('sessionId', sessionId);
      }
    } catch (_) {
      if (!silent) snack('নতুন session তৈরি করা যায়নি — backend সংযোগ পরীক্ষা করুন।', error: true);
    }
  }

  // -- Voice / speech output ---------------------------------------------
  //
  // Two paths:
  //  1) Cloud voice (if enabled + configured on backend): POST /tts, play
  //     the returned MP3 through just_audio. More natural bn-IN/en-IN voice.
  //  2) Device voice (always available, no setup): flutter_tts.
  // Both paths go sentence-by-sentence and, when `continuousReading` is on,
  // automatically move to the next sentence so a blind user does not have
  // to keep tapping "next" to hear a full answer.

  Future<void> speakRaw(String text) async {
    // One-shot announcement (welcome message, status changes) -- always
    // device TTS, always a single "sentence".
    try {
      await tts.setLanguage(voiceLanguage == VoiceLanguage.bengali ? 'bn-IN' : 'en-IN');
      await tts.setSpeechRate(rate);
      await tts.speak(text);
    } catch (_) {}
  }

  Future<void> speak(String text) async {
    final parts = text.split(RegExp(r'(?<=[.!?।])\s+')).where((x) => x.trim().isNotEmpty).toList();
    if (parts.isEmpty) return;
    spokenParts = parts;
    spokenIndex = 0;
    await _playCurrentSentence();
  }

  Future<void> _playCurrentSentence() async {
    if (spokenParts.isEmpty || spokenIndex >= spokenParts.length) return;
    if (mounted) setState(() => speaking = true);
    final text = spokenParts[spokenIndex];
    if (cloudVoice && online) {
      final ok = await _playCloud(text);
      if (ok) return;
      // Cloud failed (not configured / network) -> fall back silently to device voice.
    }
    await _playDevice(text);
  }

  Future<bool> _playCloud(String text) async {
    try {
      final r = await http
          .post(Uri.parse('$backendUrl/tts'), headers: {'content-type': 'application/json'}, body: jsonEncode({'text': text, 'lang': voiceLanguage == VoiceLanguage.bengali ? 'bn' : 'en'}))
          .timeout(const Duration(seconds: 30));
      if (r.statusCode != 200) return false;
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/tts_${DateTime.now().microsecondsSinceEpoch}.mp3');
      await file.writeAsBytes(r.bodyBytes);
      await cloudPlayer.setFilePath(file.path);
      cloudPlayer.play().ignore();
      cloudPlayer.playerStateStream.firstWhere((s) => s.processingState == ProcessingState.completed).then((_) {
        if (mounted) _onSpeechSegmentDone();
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _playDevice(String text) async {
    try {
      await tts.setLanguage(voiceLanguage == VoiceLanguage.bengali ? 'bn-IN' : 'en-IN');
      await tts.setSpeechRate(rate);
      await tts.setPitch(1.0);
      await tts.setVolume(1.0);
      await tts.speak(text);
    } catch (_) {
      if (mounted) setState(() => speaking = false);
    }
  }

  // Called when either the device TTS or the cloud audio finishes one sentence.
  void _onSpeechSegmentDone() {
    if (!mounted) return;
    if (continuousReading && spokenIndex < spokenParts.length - 1) {
      spokenIndex++;
      _playCurrentSentence();
      return;
    }
    setState(() => speaking = false);
    // If the user is in hands-free conversation mode, start listening again
    // automatically once the full answer has finished playing.
    if (conversationMode && !listening && !busy) {
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted && conversationMode) toggleListen(forConversation: true);
      });
    }
  }

  Future<void> stopSpeaking() async {
    await tts.stop();
    await cloudPlayer.stop();
    if (mounted) setState(() => speaking = false);
  }

  Future<void> nextSentence() async {
    if (spokenParts.isEmpty) return;
    if (spokenIndex < spokenParts.length - 1) {
      spokenIndex++;
      await stopSpeaking();
      await _playCurrentSentence();
    }
  }

  Future<void> previousSentence() async {
    if (spokenParts.isEmpty) return;
    if (spokenIndex > 0) {
      spokenIndex--;
      await stopSpeaking();
      await _playCurrentSentence();
    }
  }

  // -- Voice input ---------------------------------------------------------

  Future<void> toggleListen({bool forConversation = false}) async {
    if (listening) {
      await speech.stop();
      if (mounted) setState(() => listening = false);
      return;
    }
    final ok = await speech.initialize(
      onStatus: (s) {
        if (s == 'done' && mounted) setState(() => listening = false);
      },
      onError: (_) {
        if (mounted) setState(() => listening = false);
      },
    );
    if (!ok) {
      snack('Speech recognition পাওয়া যাচ্ছে না। Microphone permission এবং Android speech service পরীক্ষা করুন।', error: true);
      return;
    }
    await _buzz();
    if (mounted) setState(() => listening = true);
    await speech.listen(
      localeId: voiceLanguage == VoiceLanguage.bengali ? 'bn_IN' : 'en_IN',
      listenMode: stt.ListenMode.dictation,
      partialResults: true,
      onResult: (r) {
        if (!mounted) return;
        setState(() => input.text = r.recognizedWords);
        // In hands-free conversation mode, submit automatically once speech
        // recognition reports a final result -- no tap needed.
        if (forConversation && r.finalResult && r.recognizedWords.trim().isNotEmpty) {
          setState(() => listening = false);
          ask(r.recognizedWords);
        }
      },
    );
  }

  Future<void> toggleConversationMode() async {
    setState(() => conversationMode = !conversationMode);
    if (conversationMode) {
      snack('কথোপকথন মোড চালু। প্রশ্ন বলুন — উত্তর শোনার পর নিজে থেকেই আবার শুনবে।');
      await speakRaw('কথোপকথন মোড চালু হলো। এখন প্রশ্ন বলুন।');
      await Future.delayed(const Duration(milliseconds: 900));
      if (mounted && conversationMode) toggleListen(forConversation: true);
    } else {
      await speech.stop();
      await stopSpeaking();
      setState(() => listening = false);
      snack('কথোপকথন মোড বন্ধ হলো।');
    }
  }

  // -- Sources -----------------------------------------------------------

  Future<void> upload() async {
    if (!online) {
      snack('Backend offline। Settings থেকে Backend URL পরীক্ষা করুন।', error: true);
      return;
    }
    final r = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      withData: true,
      type: FileType.custom,
      allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'docx', 'txt', 'md', 'csv', 'json'],
    );
    if (r == null || r.files.isEmpty) return;
    final f = r.files.single;
    if (f.bytes == null) {
      snack('File data পড়া যায়নি।', error: true);
      return;
    }
    setState(() => busy = true);
    try {
      final req = http.MultipartRequest('POST', Uri.parse('$backendUrl/ingest'));
      req.files.add(http.MultipartFile.fromBytes('file', Uint8List.fromList(f.bytes!), filename: f.name));
      final rs = await req.send().timeout(const Duration(minutes: 10));
      final body = await rs.stream.bytesToString();
      final d = jsonDecode(body);
      if (rs.statusCode < 200 || rs.statusCode >= 300) throw Exception(d['detail'] ?? body);
      setState(() {
        sourceName = f.name;
        sourceId = d['source_id'];
        mode = AiMode.chapter;
        busy = false;
      });
      await loadSources();
      snack('Source indexed: ${d['chunks']} chunks। Chapter Lock চালু হলো।');
      await speak('সোর্স ইনডেক্স হয়ে গেছে। চ্যাপ্টার লক এখন চালু।');
    } catch (e) {
      if (mounted) setState(() => busy = false);
      snack('Upload failed: ${cleanErr(e)}', error: true);
    }
  }

  Future<void> selectSource(SourceItem s) async {
    setState(() {
      sourceId = s.id;
      sourceName = s.name;
      mode = AiMode.chapter;
      tab = 0;
    });
    await speak('চ্যাপ্টার লক এখন সক্রিয়: ${s.name}');
  }

  Future<void> deleteSource(SourceItem s) async {
    final ok = await _confirm('Source মুছে ফেলবেন?', '"${s.name}" এবং তার সব index তথ্য স্থায়ীভাবে মুছে যাবে।');
    if (ok != true) return;
    try {
      final r = await http.delete(Uri.parse('$backendUrl/sources/${s.id}')).timeout(const Duration(seconds: 20));
      if (r.statusCode >= 200 && r.statusCode < 300) {
        if (sourceId == s.id) setState(() => sourceId = null);
        await loadSources();
        snack('Source মুছে ফেলা হয়েছে।');
      }
    } catch (e) {
      snack(cleanErr(e), error: true);
    }
  }

  Future<bool?> _confirm(String title, String body) => showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('বাতিল')),
            FilledButton.tonal(
              style: FilledButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('মুছে ফেলুন'),
            ),
          ],
        ),
      );

  // -- Chat -----------------------------------------------------------

  Future<void> ask(String q) async {
    q = q.trim();
    if (q.isEmpty || busy) return;
    input.clear();
    if (listening) {
      await speech.stop();
      setState(() => listening = false);
    }
    setState(() => messages = [...messages, ChatItem(true, q)]);
    setState(() => busy = true);
    try {
      if (sessionId.isEmpty && online) await newSession(silent: true);
      final rs = await http
          .post(
            Uri.parse('$backendUrl/chat'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'question': q, 'mode': mode.name, 'source_id': sourceId, 'session_id': sessionId}),
          )
          .timeout(const Duration(minutes: 5));
      final d = jsonDecode(rs.body);
      if (rs.statusCode < 200 || rs.statusCode >= 300) throw Exception(d['detail'] ?? rs.body);
      final a = d['answer']?.toString() ?? 'No answer.';
      final c = (d['citations'] as List?) ?? const [];
      setState(() => messages = [...messages, ChatItem(false, a, c)]);
      setState(() => busy = false);
      await speak(a);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) scroll.animateTo(scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });
    } catch (e) {
      setState(() => messages = [...messages, ChatItem(false, 'দুঃখিত, backend-এ সংযোগ করা যাচ্ছে না। নেটওয়ার্ক/Backend URL পরীক্ষা করুন।')]);
      setState(() => busy = false);
      await speak('দুঃখিত, backend-এ সংযোগ করা যাচ্ছে না।');
      snack(cleanErr(e), error: true);
    }
  }

  // -- UI -----------------------------------------------------------

  IconData iconForType(String type) {
    switch (type) {
      case 'pdf':
        return Icons.picture_as_pdf_outlined;
      case 'docx':
        return Icons.description_outlined;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'bmp':
        return Icons.image_outlined;
      case 'mp4':
      case 'mov':
      case 'mkv':
      case 'webm':
      case 'avi':
        return Icons.movie_outlined;
      case 'csv':
        return Icons.table_chart_outlined;
      case 'json':
        return Icons.data_object_outlined;
      default:
        return Icons.insert_drive_file_outlined;
    }
  }

  String humanSize(int bytes) {
    if (bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    double b = bytes.toDouble();
    int i = 0;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return '${b.toStringAsFixed(b < 10 && i > 0 ? 1 : 0)} ${units[i]}';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Shortcuts(
      shortcuts: const {SingleActivator(LogicalKeyboardKey.space): ActivateIntent()},
      child: Actions(
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) {
            toggleListen();
            return null;
          })
        },
        child: Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(10)),
                  child: Icon(Icons.auto_awesome, size: 18, color: widget.highContrast ? Colors.black : Colors.white),
                ),
                const SizedBox(width: 10),
                const Flexible(child: Text('My Personal AI', style: TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
              ],
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Center(
                  child: Semantics(
                    label: online ? 'Backend online' : 'Backend offline',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: checkHealth,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(color: (online ? Colors.green : Colors.red).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          checkingHealth
                              ? const SizedBox(width: 10, height: 10, child: CircularProgressIndicator(strokeWidth: 2))
                              : Icon(online ? Icons.cloud_done : Icons.cloud_off, size: 16, color: online ? Colors.green : Colors.red),
                          const SizedBox(width: 6),
                          Text(online ? 'Online' : 'Offline', style: TextStyle(fontSize: 12, color: online ? Colors.green.shade800 : Colors.red.shade800)),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
              IconButton(tooltip: 'Settings', onPressed: settings, icon: const Icon(Icons.settings_outlined)),
            ],
          ),
          body: IndexedStack(index: tab, children: [chat(), library(), study(), create(), more()]),
          bottomNavigationBar: NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: (i) {
              setState(() => tab = i);
              const labels = ['AI Chat', 'Library', 'Study', 'Create', 'More'];
              SemanticsService.announce('${labels[i]} স্ক্রিন', TextDirection.ltr);
            },
            destinations: const [
              NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'AI'),
              NavigationDestination(icon: Icon(Icons.library_books_outlined), selectedIcon: Icon(Icons.library_books), label: 'Library'),
              NavigationDestination(icon: Icon(Icons.school_outlined), selectedIcon: Icon(Icons.school), label: 'Study'),
              NavigationDestination(icon: Icon(Icons.palette_outlined), selectedIcon: Icon(Icons.palette), label: 'Create'),
              NavigationDestination(icon: Icon(Icons.tune_outlined), selectedIcon: Icon(Icons.tune), label: 'More'),
            ],
          ),
        ),
      ),
    );
  }

  Widget chat() {
    final scheme = Theme.of(context).colorScheme;
    return Column(children: [
      Container(
        margin: const EdgeInsets.fromLTRB(12, 10, 12, 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(gradient: const LinearGradient(colors: [_brand, _brandDark]), borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(sourceName == null ? Icons.lock_open : Icons.lock, size: 18, color: Colors.white),
            const SizedBox(width: 6),
            Expanded(
              child: Text(sourceName == null ? 'কোনো source নির্বাচিত নেই' : 'LOCKED: $sourceName',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
            ),
            const SizedBox(width: 8),
            DropdownButtonHideUnderline(
              child: DropdownButton<AiMode>(
                value: mode,
                dropdownColor: _brandDark,
                iconEnabledColor: Colors.white,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                onChanged: (v) {
                  if (v != null) setState(() => mode = v);
                },
                items: const [
                  DropdownMenuItem(value: AiMode.chapter, child: Text('Chapter Lock')),
                  DropdownMenuItem(value: AiMode.general, child: Text('General')),
                  DropdownMenuItem(value: AiMode.web, child: Text('Web Agent')),
                ],
              ),
            ),
          ]),
          if (mode == AiMode.chapter)
            const Padding(padding: EdgeInsets.only(top: 4), child: Text('শুধু নির্বাচিত source-এর evidence থেকেই উত্তর দেওয়া হবে।', style: TextStyle(fontSize: 12, color: Colors.white70))),
        ]),
      ),
      Expanded(
        child: ListView.builder(
          controller: scroll,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          itemCount: messages.length,
          itemBuilder: (c, i) => messageCard(messages[i], scheme),
        ),
      ),
      if (busy) const LinearProgressIndicator(minHeight: 2),
      // Big hands-free conversation button -- the primary way a blind user
      // operates the whole app without touching anything else.
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Semantics(
          label: conversationMode ? 'কথোপকথন মোড বন্ধ করুন' : 'কথোপকথন মোড চালু করুন — হাত ছাড়া কথা বলে ব্যবহার করুন',
          button: true,
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: conversationMode ? scheme.error : scheme.primary),
              onPressed: toggleConversationMode,
              icon: Icon(conversationMode ? Icons.stop_circle_outlined : Icons.record_voice_over, size: 26),
              label: Text(
                conversationMode ? (listening ? 'শুনছি… (বন্ধ করতে চাপুন)' : 'কথোপকথন চলছে (বন্ধ করতে চাপুন)') : 'হাত-মুক্ত কথোপকথন শুরু করুন',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 8),
      SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: TextField(
                controller: input,
                minLines: 1,
                maxLines: 5,
                decoration: InputDecoration(
                  hintText: listening ? 'শুনছি…' : 'অথবা এখানে লিখুন…',
                  filled: true,
                  fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onSubmitted: ask,
              ),
            ),
            const SizedBox(width: 6),
            Semantics(
              label: 'Send message',
              button: true,
              child: IconButton.filled(onPressed: busy ? null : () => ask(input.text), icon: const Icon(Icons.send)),
            ),
          ]),
        ),
      ),
    ]);
  }

  Widget messageCard(ChatItem m, ColorScheme scheme) {
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: m.user ? scheme.primary : scheme.surface,
        border: m.user ? null : Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(16),
          topRight: const Radius.circular(16),
          bottomLeft: Radius.circular(m.user ? 16 : 4),
          bottomRight: Radius.circular(m.user ? 4 : 16),
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SelectableText(m.text, style: TextStyle(color: m.user ? Colors.white : null, height: 1.35)),
        if (!m.user) ...[
          const Divider(height: 18),
          Row(children: [
            Tooltip(message: 'Previous sentence', child: IconButton(visualDensity: VisualDensity.compact, onPressed: previousSentence, icon: const Icon(Icons.skip_previous, size: 20))),
            Tooltip(
              message: speaking ? 'Stop' : 'Speak',
              child: IconButton(visualDensity: VisualDensity.compact, onPressed: speaking ? stopSpeaking : () => speak(m.text), icon: Icon(speaking ? Icons.stop_circle_outlined : Icons.volume_up, size: 20)),
            ),
            Tooltip(message: 'Next sentence', child: IconButton(visualDensity: VisualDensity.compact, onPressed: nextSentence, icon: const Icon(Icons.skip_next, size: 20))),
            const Spacer(),
            if (m.citations.isNotEmpty)
              TextButton.icon(onPressed: () => showEvidence(m.citations), icon: const Icon(Icons.fact_check_outlined, size: 16), label: Text('${m.citations.length}টি evidence')),
          ]),
        ],
      ]),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: m.user ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!m.user) ...[CircleAvatar(radius: 14, backgroundColor: scheme.primaryContainer, child: const Icon(Icons.auto_awesome, size: 14)), const SizedBox(width: 6)],
          Flexible(child: bubble),
          if (m.user) ...[const SizedBox(width: 6), CircleAvatar(radius: 14, backgroundColor: scheme.secondaryContainer, child: const Icon(Icons.person, size: 14))],
        ],
      ),
    );
  }

  Widget library() => RefreshIndicator(
        onRefresh: loadSources,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('SOURCE LIBRARY', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const Text('Persistent • Strict-source • page-level evidence', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 14),
          FilledButton.icon(onPressed: busy ? null : upload, icon: const Icon(Icons.upload_file), label: const Text('Upload / Index Source')),
          const SizedBox(height: 14),
          if (sources.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(children: [
                  Icon(Icons.folder_open, size: 40, color: Theme.of(context).colorScheme.outline),
                  const SizedBox(height: 10),
                  const Text('এখনো কোনো source নেই', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text('একটা বই, chapter, PDF, ছবি বা ভিডিও upload করে শুরু করুন।', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                ]),
              ),
            ),
          ...sources.map((s) => Card(
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: s.id == sourceId ? Theme.of(context).colorScheme.primaryContainer : null, child: Icon(s.id == sourceId ? Icons.lock : iconForType(s.type))),
                  title: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${s.type.toUpperCase()} • ${s.chunks} chunks${s.size > 0 ? ' • ${humanSize(s.size)}' : ''}'),
                  onTap: () => selectSource(s),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) {
                      if (v == 'delete') deleteSource(s);
                      if (v == 'detail') showSourceDetail(s);
                    },
                    itemBuilder: (_) => const [PopupMenuItem(value: 'detail', child: Text('Details')), PopupMenuItem(value: 'delete', child: Text('Delete'))],
                  ),
                ),
              )),
        ]),
      );

  Widget study() => ListView(padding: const EdgeInsets.all(16), children: [
        const Text('STUDY ENGINE', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 5),
        Text(sourceName == null ? 'প্রথমে একটা source নির্বাচন করুন।' : 'নির্বাচিত: $sourceName', style: const TextStyle(color: Colors.grey)),
        const SizedBox(height: 12),
        action('Chapter Summary', Icons.summarize_outlined, 'এই নির্বাচিত source-এর সহজ summary তৈরি করো।'),
        action('Source Q&A', Icons.question_answer_outlined, 'এই নির্বাচিত source থেকে প্রশ্ন ও উত্তর তৈরি করো।'),
        action('MCQ Generator', Icons.quiz_outlined, 'এই নির্বাচিত source থেকে MCQ তৈরি করো।'),
        action('Important Questions', Icons.star_outline, 'এই source থেকে পরীক্ষার গুরুত্বপূর্ণ প্রশ্ন তৈরি করো।'),
        action('Viva Practice', Icons.record_voice_over_outlined, 'এই source থেকে viva practice শুরু করো।'),
        action('Revision Sheet', Icons.fact_check_outlined, 'এই source থেকে revision sheet তৈরি করো।'),
        action('Audio Lesson', Icons.headphones_outlined, 'এই source-এর উপর সহজ audio lesson script তৈরি করো।'),
        action('Evidence Search', Icons.search, 'এই source-এর মধ্যে প্রশ্নটির সবচেয়ে প্রাসঙ্গিক evidence খুঁজে দাও।'),
        action('Lesson Plan (Teacher)', Icons.menu_book_outlined, 'এই source থেকে একটা ৪৫ মিনিটের class lesson plan তৈরি করো — objective, activities, blackboard notes ও assessment সহ।'),
        action('Oral Quiz Script (Teacher)', Icons.forum_outlined, 'এই source থেকে ১০টা প্রশ্নের একটা oral/verbal quiz script তৈরি করো, যা শিক্ষক পড়ে ছাত্রছাত্রীদের জিজ্ঞাসা করতে পারবেন।'),
      ]);

  Widget action(String t, IconData i, String p) => Card(
        child: ListTile(
          leading: CircleAvatar(backgroundColor: Theme.of(context).colorScheme.secondaryContainer, child: Icon(i, size: 20)),
          title: Text(t, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: const Text('Tap to run'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            setState(() => tab = 0);
            ask(p);
          },
        ),
      );

  Widget create() => ListView(padding: const EdgeInsets.all(16), children: [
        const Text('CREATIVE STUDIO', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        action('Project Image Brief', Icons.image_outlined, 'একটি professional educational project image-এর সম্পূর্ণ prompt ও layout তৈরি করো।'),
        action('Poster / Banner', Icons.panorama_outlined, 'একটি HD educational poster/banner-এর complete design brief তৈরি করো।'),
        action('Music / Audio', Icons.music_note_outlined, 'এই বিষয়টির জন্য music/audio production brief তৈরি করো।'),
        action('Natural Audio Broadcast', Icons.podcasts_outlined, 'এই বিষয়টির জন্য natural conversational broadcast script তৈরি করো।'),
        Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: const Padding(padding: EdgeInsets.all(14), child: Text('আসল image/music ফাইল তৈরির জন্য backend-এ একটা configured provider adapter লাগবে। App কখনো fake generated file দেখায় না।')),
        ),
      ]);

  Widget more() => ListView(padding: const EdgeInsets.all(16), children: [
        const Text('SETTINGS & ACCESSIBILITY', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        Card(
          child: Column(children: [
            ListTile(leading: const Icon(Icons.translate), title: const Text('Voice language'), subtitle: Text(voiceLanguage == VoiceLanguage.bengali ? 'বাংলা (India)' : 'English (India)'), onTap: chooseVoice, trailing: const Icon(Icons.chevron_right)),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.speed), title: const Text('Speech speed'), subtitle: Text(rate.toStringAsFixed(2)), onTap: chooseRate, trailing: const Icon(Icons.chevron_right)),
            const Divider(height: 1),
            SwitchListTile(
              secondary: const Icon(Icons.graphic_eq),
              title: const Text('Cloud voice (আরো প্রাকৃতিক)'),
              subtitle: const Text('Backend-এ Google Cloud TTS কনফিগার থাকলে ব্যবহার হবে; না থাকলে ফোনের নিজস্ব voice-এ চলবে।'),
              value: cloudVoice,
              onChanged: (v) {
                setState(() => cloudVoice = v);
                savePref('cloudVoice', v);
              },
            ),
            const Divider(height: 1),
            SwitchListTile(
              secondary: const Icon(Icons.playlist_play),
              title: const Text('একটানা পড়া (Continuous reading)'),
              subtitle: const Text('বন্ধ থাকলে প্রতি বাক্যের পর ম্যানুয়ালি Next চাপতে হবে।'),
              value: continuousReading,
              onChanged: (v) {
                setState(() => continuousReading = v);
                savePref('continuousReading', v);
              },
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Card(
          child: Column(children: [
            SwitchListTile(
              secondary: const Icon(Icons.contrast),
              title: const Text('High contrast mode'),
              subtitle: const Text('কালো ব্যাকগ্রাউন্ড + উজ্জ্বল হলুদ লেখা — কম দৃষ্টিশক্তির জন্য সহজ।'),
              value: widget.highContrast,
              onChanged: (v) => widget.onDisplayPrefsChanged(contrast: v),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.format_size),
              title: const Text('লেখার আকার (Text size)'),
              subtitle: Slider(value: widget.textScale, min: 1.0, max: 2.0, divisions: 8, label: '${(widget.textScale * 100).round()}%', onChanged: (v) => widget.onDisplayPrefsChanged(scale: v)),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Card(
          child: Column(children: [
            ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Backend URL'), subtitle: Text(backendUrl), onTap: settings, trailing: const Icon(Icons.chevron_right)),
            const Divider(height: 1),
            ListTile(leading: Icon(online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined), title: const Text('Connection'), subtitle: Text(online ? 'Online' : 'Offline'), trailing: IconButton(onPressed: checkHealth, icon: const Icon(Icons.refresh))),
          ]),
        ),
        const SizedBox(height: 10),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.add_comment_outlined),
              title: const Text('New chat'),
              subtitle: const Text('নতুন session শুরু করো'),
              onTap: () async {
                await newSession();
                setState(() => messages = [ChatItem(false, 'নতুন chat session শুরু হয়েছে।')]);
              },
            ),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.sticky_note_2_outlined), title: const Text('Notes'), subtitle: const Text('Persistent personal notes'), onTap: showNotes, trailing: const Icon(Icons.chevron_right)),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.history_outlined), title: const Text('Audit log'), subtitle: const Text('Recent backend activity'), onTap: showAudit, trailing: const Icon(Icons.chevron_right)),
          ]),
        ),
        const SizedBox(height: 10),
        const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('Accessibility: হাত-মুক্ত কথোপকথন মোড, একটানা audio পড়া, TalkBack-friendly semantic label, high-contrast theme, adjustable text size।'))),
        const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('Security: AI/API key সবসময় backend-এ রাখুন। Public deployment-এর জন্য HTTPS, authentication এবং rate limit ব্যবহার করুন।'))),
        const SizedBox(height: 10),
        Center(child: Text('My Personal AI • v7.0.0', style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12))),
      ]);

  // -- Dialogs / sheets -----------------------------------------------------------

  Future<void> chooseVoice() async {
    final v = await showDialog<VoiceLanguage>(
      context: context,
      builder: (_) => SimpleDialog(title: const Text('Voice language'), children: [
        SimpleDialogOption(onPressed: () => Navigator.pop(context, VoiceLanguage.bengali), child: const Text('বাংলা — India')),
        SimpleDialogOption(onPressed: () => Navigator.pop(context, VoiceLanguage.indianEnglish), child: const Text('English — India')),
      ]),
    );
    if (v != null) {
      setState(() => voiceLanguage = v);
      await savePref('voiceLanguage', v == VoiceLanguage.bengali ? 'bn' : 'en');
    }
  }

  Future<void> chooseRate() async {
    double x = rate;
    final v = await showDialog<double>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Speech speed'),
        content: StatefulBuilder(builder: (c, set) => Slider(value: x, min: .25, max: .8, divisions: 11, label: x.toStringAsFixed(2), onChanged: (z) => set(() => x = z))),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('বাতিল')), FilledButton(onPressed: () => Navigator.pop(context, x), child: const Text('Save'))],
      ),
    );
    if (v != null) {
      setState(() => rate = v);
      await savePref('rate', v);
    }
  }

  Future<void> settings() async {
    final c = TextEditingController(text: backendUrl);
    final v = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Backend URL'),
        content: TextField(controller: c, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: 'http://192.168.1.10:8000')),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('বাতিল')), FilledButton(onPressed: () => Navigator.pop(context, c.text), child: const Text('Save'))],
      ),
    );
    c.dispose();
    if (v != null && v.trim().isNotEmpty) {
      backendUrl = v.trim().replaceAll(RegExp(r'/$'), '');
      await savePref('backendUrl', backendUrl);
      await checkHealth();
      await loadSources();
    }
  }

  Future<void> showEvidence(List<dynamic> citations) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: ListView(padding: const EdgeInsets.all(18), children: [
          const Text('SOURCE EVIDENCE', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          ...citations.map((c) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Text('${c['page'] == null ? 'Source' : 'পৃষ্ঠা ${c['page']}'}\n${c['text'] ?? ''}')))),
        ]),
      ),
    );
  }

  Future<void> showSourceDetail(SourceItem s) async {
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(s.name),
        content: Text('Type: ${s.type}\nChunks: ${s.chunks}\nSize: ${humanSize(s.size)}\nExtraction: ${s.meta['extraction'] ?? 'unknown'}'),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
      ),
    );
  }

  Future<void> showNotes() async {
    try {
      final r = await http.get(Uri.parse('$backendUrl/notes')).timeout(const Duration(seconds: 10));
      final list = (jsonDecode(r.body)['notes'] as List?) ?? [];
      if (!mounted) return;
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (sheetCtx) => DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, controller) => SafeArea(
            child: ListView(controller: controller, padding: const EdgeInsets.all(16), children: [
              Row(children: [
                const Expanded(child: Text('NOTES', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
                FilledButton.icon(
                  onPressed: () async {
                    Navigator.pop(sheetCtx);
                    await createNote();
                  },
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('New'),
                ),
              ]),
              const SizedBox(height: 8),
              if (list.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('এখনো কোনো note নেই।', style: TextStyle(color: Colors.grey))),
              ...list.map((n) => Card(child: ListTile(title: Text(n['title'].toString()), subtitle: Text(n['body'].toString(), maxLines: 2, overflow: TextOverflow.ellipsis), onTap: () => editNote(n)))),
            ]),
          ),
        ),
      );
    } catch (e) {
      snack(cleanErr(e), error: true);
    }
  }

  Future<void> createNote() async {
    final t = TextEditingController();
    final b = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('নতুন Note'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: t, decoration: const InputDecoration(labelText: 'Title')),
          TextField(controller: b, maxLines: 5, decoration: const InputDecoration(labelText: 'Body')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('বাতিল')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save'))],
      ),
    );
    if (ok == true) {
      try {
        await http.post(Uri.parse('$backendUrl/notes'), headers: {'content-type': 'application/json'}, body: jsonEncode({'title': t.text, 'body': b.text}));
        snack('Note তৈরি হয়েছে।');
      } catch (e) {
        snack(cleanErr(e), error: true);
      }
    }
    t.dispose();
    b.dispose();
  }

  Future<void> editNote(dynamic n) async {
    final t = TextEditingController(text: n['title'].toString());
    final b = TextEditingController(text: n['body'].toString());
    final action = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Edit note'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: t, decoration: const InputDecoration(labelText: 'Title')),
          TextField(controller: b, maxLines: 5, decoration: const InputDecoration(labelText: 'Body')),
        ]),
        actions: [
          TextButton(style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error), onPressed: () => Navigator.pop(context, 'delete'), child: const Text('Delete')),
          TextButton(onPressed: () => Navigator.pop(context, 'cancel'), child: const Text('বাতিল')),
          FilledButton(onPressed: () => Navigator.pop(context, 'save'), child: const Text('Save')),
        ],
      ),
    );
    if (action == 'save') {
      await http.put(Uri.parse('$backendUrl/notes/${n['id']}'), headers: {'content-type': 'application/json'}, body: jsonEncode({'title': t.text, 'body': b.text}));
    } else if (action == 'delete') {
      await http.delete(Uri.parse('$backendUrl/notes/${n['id']}'));
    }
    t.dispose();
    b.dispose();
  }

  Future<void> showAudit() async {
    try {
      final r = await http.get(Uri.parse('$backendUrl/audit?limit=50')).timeout(const Duration(seconds: 10));
      final list = (jsonDecode(r.body)['events'] as List?) ?? [];
      if (!mounted) return;
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (_) => DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, controller) => SafeArea(
            child: ListView(controller: controller, padding: const EdgeInsets.all(16), children: [
              const Text('AUDIT LOG', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              if (list.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('এখনো কোনো activity নেই।', style: TextStyle(color: Colors.grey))),
              ...list.map((e) => ListTile(leading: const Icon(Icons.circle, size: 8), title: Text(e['event'].toString()), subtitle: Text('${e['detail'] ?? ''}\n${e['ts'] ?? ''}'), isThreeLine: true)),
            ]),
          ),
        ),
      );
    } catch (e) {
      snack(cleanErr(e), error: true);
    }
  }
}
