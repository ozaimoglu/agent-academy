import { EventEmitter } from 'node:events';
import type { AcademyEvent, Lesson, Question, Session, Stage, Usage } from './types.js';
import type { Config } from '../storage/config.js';
import { LessonStore } from '../storage/store.js';
import { CodexSessionAdapter, matchSessions, type CodexCheckpoint } from '../adapters/codex.js';
import { EvidenceCollector } from './evidence.js';
import { GitChangeTracker } from './git.js';
import { EngineeringMilestoneDetector } from './milestones.js';
import { TeachingEngine } from './teaching.js';
import { createProvider } from '../providers/openai-compatible.js';
import { hash, safeText } from './privacy.js';
import { generateReport, exportReport } from './report.js';
import { associatedPane, createHerdrCall } from '../integration/herdr.js';

export interface AcademySnapshot {
  learning: 'paused' | 'starting' | 'active' | 'finishing';
  sessions: Session[];
  selected?: Session;
  events: AcademyEvent[];
  lessons: Lesson[];
  stage: Stage;
  status: string;
  warning?: string;
  busy: boolean;
  report?: string;
  eventCount: number;
  usage?: Usage;
}
export class Academy extends EventEmitter {
  snapshot: AcademySnapshot = {
    learning: 'paused',
    sessions: [],
    events: [],
    lessons: [],
    stage: 'INVESTIGATING',
    status: 'Codex oturumu aranıyor…',
    busy: false,
    eventCount: 0,
  };
  private adapter: CodexSessionAdapter;
  private git = new GitChangeTracker();
  private collector = new EvidenceCollector();
  private detector = new EngineeringMilestoneDetector();
  private engine: TeachingEngine;
  private timer?: NodeJS.Timeout;
  private polling = false;
  private stopped = false;
  private manual = false;
  private pending = false;
  private manualPending = false;
  private generation = 0;
  private lastGit = 0;
  private lastDiscovery = 0;
  private lastRequest = 0;
  private controller?: AbortController;
  private work?: Promise<void>;
  private questionBusy = false;
  private identity?: { kind: string; value: string };
  private captureCheckpoint?: CodexCheckpoint;
  private window?: { after: number; started: string; task?: AcademyEvent; id: string };
  private controlsGeneration = 0;
  constructor(
    readonly root: string,
    readonly sessionRoot: string,
    readonly stateDir: string,
    public config: Config,
    readonly store: LessonStore,
    private env: NodeJS.ProcessEnv = process.env,
  ) {
    super();
    this.engine = this.makeEngine();
    this.adapter = new CodexSessionAdapter((id, call) =>
      this.snapshot.selected?.id === id
        ? this.store.command(this.snapshot.selected, call)?.command
        : undefined,
    );
  }
  private makeEngine() {
    try {
      const provider = createProvider(this.config.provider, this.root, this.env);
      return new TeachingEngine(
        this.config,
        provider
          ? {
              name: provider.name,
              explain: async (system, context, signal) => {
                const selected = this.snapshot.selected;
                const reply = await provider.explain(system, context, signal);
                if (selected && reply.usage) this.store.recordUsage(selected, reply.usage);
                return reply;
              },
            }
          : undefined,
      );
    } catch (e) {
      this.snapshot.warning = safeText((e as Error).message, 300);
      return new TeachingEngine(this.config);
    }
  }
  private emitChange() {
    if (this.snapshot.selected) this.snapshot.usage = this.store.usage(this.snapshot.selected);
    this.emit('change', this.snapshot);
  }
  watch() {
    if (this.timer || this.stopped) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 1000);
  }
  async beginLearning({ replay = false } = {}) {
    if (this.stopped) throw new Error('Academy kapatıldı.');
    if (this.snapshot.learning !== 'paused') return;
    if (this.snapshot.busy) throw new Error('Mevcut isteğin tamamlanmasını bekleyin.');
    const controls = this.controlsGeneration;
    while (this.polling && !this.stopped) await new Promise((resolve) => setTimeout(resolve, 10));
    // Discovery is local and never starts capture or a model request.
    await this.tick();
    if (controls !== this.controlsGeneration || this.stopped || this.snapshot.learning !== 'paused')
      return;
    const selected = this.snapshot.selected;
    if (!selected)
      throw new Error('Önce Codex oturumunu başlatın; birden fazla varsa C ile seçin.');
    const generation = ++this.generation;
    this.snapshot.learning = 'starting';
    this.snapshot.status = 'Seçili görev için öğrenme başlatılıyor…';
    this.emitChange();
    try {
      const tail = replay ? undefined : await this.adapter.tail(selected);
      if (generation !== this.generation || this.stopped) return;
      this.window = {
        after: replay ? 0 : this.store.eventCursor(selected),
        started: new Date().toISOString(),
        task: tail?.task,
        id: hash(`${selected.id}|${Date.now()}|${generation}`),
      };
      this.store.setMeta('capture:' + this.store.key(selected), JSON.stringify(this.window));
      this.captureCheckpoint = tail?.checkpoint ?? this.store.checkpoint(selected.file);
      this.pending = false;
      this.manualPending = false;
      this.lastRequest = 0;
      this.lastGit = 0;
      this.detector = new EngineeringMilestoneDetector();
      if (tail?.task) {
        this.store.ingest(selected, [tail.task]);
        this.detector.observe(tail.task);
        this.pending = true;
      }
      this.snapshot.events = this.windowEvents(selected);
      this.snapshot.eventCount = this.windowCount(selected);
      this.snapshot.stage = 'INVESTIGATING';
      this.snapshot.report = undefined;
      this.snapshot.learning = 'active';
      this.snapshot.status = 'Öğrenme açık · bu görev / sonraki gözlenen tur';
      this.emitChange();
      await this.tick();
    } catch (error) {
      if (generation === this.generation)
        this.pauseLearning('Başlatılamadı; B ile tekrar deneyin.');
      throw error;
    }
  }
  pauseLearning(message = 'Durduruldu · yeniden öğrenmek için B Başlat.') {
    this.controlsGeneration++;
    this.controller?.abort();
    this.generation++;
    this.pending = false;
    this.manualPending = false;
    this.captureCheckpoint = undefined;
    this.snapshot.learning = 'paused';
    this.snapshot.status = message;
    this.emitChange();
  }
  private windowEvents(session: Session, limit = 400) {
    const events =
      limit === 400
        ? this.store.contextEvents(session, this.window?.after ?? 0)
        : this.store.events(session, limit, this.window?.after ?? 0);
    const task = this.window?.task ?? this.store.firstTask(session, this.window?.after ?? 0);
    if (task && !events.some((e) => e.id === task.id)) events.unshift(task);
    return events;
  }
  private windowCount(session: Session) {
    const count = this.store.count(session, this.window?.after ?? 0);
    return (
      count +
      (this.window?.task &&
      !this.store.hasEventAfter(session, this.window.task.id, this.window.after)
        ? 1
        : 0)
    );
  }
  private captureEvidence(events: AcademyEvent[]) {
    return this.window
      ? events.map((event) => ({ ...event, id: hash(this.window!.id + '|' + event.id) }))
      : events;
  }
  setConfig(config: Config) {
    this.pauseLearning('Ayarlar kaydedildi · B ile öğrenmeyi başlat.');
    this.config = config;
    this.engine = this.makeEngine();
    this.emitChange();
  }
  async stop() {
    this.pauseLearning('Academy kapatılıyor.');
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort();
    await this.work?.catch(() => {});
    while (this.polling || this.questionBusy) await new Promise((r) => setTimeout(r, 10));
  }
  async select(session: Session, manual = true) {
    if (session.cwd !== this.root) throw new Error('Oturum proje bağlamıyla eşleşmiyor.');
    if (this.snapshot.selected?.id === session.id) {
      this.manual = manual;
      return;
    }
    if (manual || this.snapshot.learning !== 'paused' || this.snapshot.busy)
      this.pauseLearning('Oturum seçildi · B ile öğrenmeyi başlat.');
    this.controller?.abort();
    this.generation++;
    this.manual = manual;
    this.pending = false;
    this.manualPending = false;
    this.window = undefined;
    const window = this.store.getMeta('capture:' + this.store.key(session));
    if (window) this.window = JSON.parse(window);
    this.snapshot = {
      ...this.snapshot,
      selected: session,
      events: this.windowEvents(session),
      lessons: this.store.lessons(session),
      eventCount: this.windowCount(session),
      report: undefined,
    };
    this.detector = new EngineeringMilestoneDetector();
    for (const e of this.snapshot.events) this.detector.observe(e);
    this.snapshot.stage = this.detector.stage;
    this.lastGit = 0;
    this.lastRequest = Number(this.store.getMeta('request:' + this.store.key(session)) ?? 0);
    this.snapshot.status = `Hazır · ${session.id.slice(0, 12)} · B Başlat`;
    this.emitChange();
  }
  async tick() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      if (Date.now() - this.lastDiscovery > 3000) {
        if (this.env.HERDR_ENV === '1' && this.env.ACADEMY_TARGET_PANE_ID) {
          try {
            const pane = await associatedPane(createHerdrCall(this.env), this.env);
            this.identity = pane?.agent_session?.agent === 'codex' ? pane.agent_session : undefined;
          } catch {
            this.snapshot.warning =
              'Herdr bağlantısı kesildi; seçili dosya yerel olarak izleniyor.';
          }
        }
        const sessions = await this.adapter.discover(this.sessionRoot);
        const matched = matchSessions(sessions, this.root, this.identity);
        this.snapshot.sessions = matched.choices;
        const selected = this.snapshot.selected;
        if (!this.manual && matched.selected && (!selected || matched.selected.id !== selected.id))
          await this.select(matched.selected, false);
        else if (selected) {
          const updated = matched.choices.find((s) => s.id === selected.id);
          if (updated)
            this.snapshot.selected = {
              ...selected,
              file: updated.file,
              modified: updated.modified,
            };
        }
        if (!this.snapshot.selected) this.snapshot.status = matched.reason;
        this.lastDiscovery = Date.now();
      }
      const selected = this.snapshot.selected;
      if (selected && this.snapshot.learning === 'active') {
        const generation = this.generation;
        const current = () =>
          generation === this.generation && this.snapshot.learning === 'active' && !this.stopped;
        let more = true;
        let batches = 0;
        let ended = false;
        let nextTask = false;
        while (more && batches++ < 4) {
          const batch = await this.adapter.read(selected, this.captureCheckpoint);
          if (!current()) return;
          more = batch.more;
          this.captureCheckpoint = batch.checkpoint;
          // A single read may already contain the next task. It needs another explicit start.
          const completion = batch.events.findIndex((e) => e.kind === 'completed');
          let events = completion >= 0 ? batch.events.slice(0, completion + 1) : batch.events;
          for (let i = 0; i < events.length; i++) {
            const event = events[i]!;
            if (event.kind !== 'task' || !this.window) continue;
            if (!this.window.task) {
              this.window.task = event;
              this.store.setMeta(
                'capture:' + this.store.key(selected),
                JSON.stringify(this.window),
              );
            } else if (event.text !== this.window.task.text) {
              events = events.slice(0, i);
              nextTask = true;
              break;
            }
          }
          const fresh = this.store.ingest(selected, events, batch.checkpoint);
          if (batch.warnings.length) this.snapshot.warning = batch.warnings[0];
          for (const e of fresh) {
            if (this.detector.observe(e)) this.pending = true;
            if (e.kind === 'completed') ended = true;
          }
          if (fresh.length && !this.snapshot.lessons.length) this.pending = true;
          if (fresh.length) {
            const sources = await this.collector.sources(selected, fresh);
            if (!current()) return;
            this.store.ingest(selected, this.captureEvidence(sources));
            this.snapshot.events = this.windowEvents(selected);
            this.snapshot.stage = this.detector.stage;
          }
          if (nextTask) break;
          if (completion >= 0) {
            ended = true;
            break;
          }
        }
        if (Date.now() - this.lastGit > 8000) {
          const git = await this.git.collect(selected);
          if (!current()) return;
          this.snapshot.selected = git.session;
          this.store.ingest(git.session, this.captureEvidence(git.events));
          this.snapshot.events = this.windowEvents(git.session);
          this.lastGit = Date.now();
        }
        this.snapshot.eventCount = this.windowCount(selected);
        if (nextTask) {
          this.pauseLearning('Yeni görev görüldü · öğrenmek için yeniden B Başlat.');
          await this.export();
          return;
        }
        if (ended) {
          this.snapshot.stage = 'COMPLETED';
          this.snapshot.learning = 'finishing';
          this.snapshot.status = 'Tur tamamlandı · son değerlendirme hazırlanıyor.';
          this.pending = true;
          await this.export();
          if (generation !== this.generation || this.stopped) return;
          if (!this.config.provider.autoAnalyze) this.finishLearning();
        }
        if (
          this.pending &&
          !this.snapshot.busy &&
          (this.config.provider.autoAnalyze || this.manualPending)
        )
          this.schedule(this.manualPending || ended);
      } else if (
        selected &&
        this.snapshot.learning === 'finishing' &&
        this.pending &&
        !this.snapshot.busy
      ) {
        this.schedule(true);
      }
      this.emitChange();
    } catch (e) {
      this.snapshot.warning = safeText(e instanceof Error ? e.message : 'Gözlem hatası', 300);
      this.emitChange();
    } finally {
      this.polling = false;
    }
  }
  requestLesson() {
    if (this.snapshot.busy) throw new Error('Mevcut açıklama tamamlanınca tekrar deneyin.');
    if (!this.snapshot.selected || !this.snapshot.events.length)
      throw new Error('Önce B ile seçtiğiniz görevi gözlemleyin.');
    this.pending = true;
    this.manualPending = true;
    this.schedule(true);
  }
  private schedule(force = false) {
    const s = this.snapshot.selected;
    if (!s || this.snapshot.busy || this.stopped) return;
    if (!force && Date.now() - this.lastRequest < this.config.provider.minIntervalSeconds * 1000)
      return;
    this.pending = false;
    this.manualPending = false;
    this.snapshot.busy = true;
    this.lastRequest = Date.now();
    this.store.setMeta('request:' + this.store.key(s), String(this.lastRequest));
    const generation = this.generation;
    const stage = this.snapshot.stage;
    const events = [...this.snapshot.events];
    const key = hash(
      JSON.stringify([this.window?.id, events.map((e) => e.id), stage, this.config]),
    );
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const engine = this.engine;
    this.work = (async () => {
      try {
        if (this.store.getMeta('lesson-cache:' + this.store.key(s)) === key) return;
        const lesson = await engine.lesson(
          s.id,
          stage,
          events,
          this.snapshot.lessons.filter((l) => !this.window || l.captureId === this.window.id),
          signal,
        );
        if (generation !== this.generation || this.stopped) return;
        lesson.id = hash(this.store.key(s) + '|' + (this.window?.id ?? '') + '|' + lesson.id);
        lesson.captureId = this.window?.id;
        this.store.saveLesson(s, lesson);
        this.snapshot.lessons = this.store.lessons(s);
        if (!lesson.error) this.store.setMeta('lesson-cache:' + this.store.key(s), key);
        if (stage === 'COMPLETED') await this.export();
      } catch (e) {
        if (!signal.aborted) this.snapshot.warning = safeText((e as Error).message, 300);
      } finally {
        this.snapshot.busy = false;
        if (
          generation === this.generation &&
          this.snapshot.learning === 'finishing' &&
          !this.pending
        )
          this.finishLearning();
        this.emitChange();
      }
    })();
  }
  private finishLearning() {
    this.pending = false;
    this.manualPending = false;
    this.captureCheckpoint = undefined;
    this.snapshot.learning = 'paused';
    this.snapshot.status = 'Tur tamamlandı · sonraki iş için B Başlat.';
  }
  async settle() {
    await this.work;
  }
  questions(l: Lesson) {
    return this.store.questions(l);
  }
  evidence(l: Lesson) {
    const s = this.snapshot.selected;
    return s ? this.store.evidence(s, l.evidenceIds) : [];
  }
  async ask(l: Lesson, text: string): Promise<Question> {
    if (this.questionBusy || this.snapshot.busy)
      throw new Error('Mevcut açıklama tamamlanınca tekrar deneyin.');
    if (!text.trim()) throw new Error('Bir soru yazın.');
    this.questionBusy = true;
    this.snapshot.busy = true;
    const controller = new AbortController();
    this.controller = controller;
    const generation = this.generation;
    try {
      const q = await this.engine.ask(
        l,
        text,
        this.evidence(l),
        this.store.questions(l),
        controller.signal,
      );
      if (generation !== this.generation || this.stopped)
        throw new Error('Oturum değişti; yanıt kaydedilmedi.');
      this.store.question(q);
      return q;
    } finally {
      this.questionBusy = false;
      this.snapshot.busy = false;
      this.emitChange();
    }
  }
  report() {
    const s = this.snapshot.selected;
    if (!s) return 'Henüz seçili oturum yok.';
    const events = this.windowEvents(s, 3000);
    const lessons = this.store
      .lessons(s, 200)
      .filter((l) => !this.window || l.captureId === this.window.id);
    return generateReport(
      s,
      events,
      lessons,
      lessons.flatMap((l) => this.store.questions(l, 10)),
      this.windowCount(s),
    );
  }
  async export() {
    const s = this.snapshot.selected;
    if (!s) throw new Error('Önce bir Codex oturumu seçin.');
    const captureId = this.window?.id;
    const file = await exportReport(this.stateDir, s, this.report(), captureId);
    if (this.snapshot.selected?.id === s.id && this.window?.id === captureId)
      this.snapshot.report = file;
    return file;
  }
}
