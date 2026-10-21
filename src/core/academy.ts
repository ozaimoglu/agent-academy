import { EventEmitter } from 'node:events';
import type { AcademyEvent, Lesson, Question, Session, Stage, Usage } from './types.js';
import type { Config } from '../storage/config.js';
import { LessonStore } from '../storage/store.js';
import { CodexSessionAdapter, matchSessions } from '../adapters/codex.js';
import { EvidenceCollector } from './evidence.js';
import { GitChangeTracker } from './git.js';
import { EngineeringMilestoneDetector } from './milestones.js';
import { TeachingEngine } from './teaching.js';
import { createProvider } from '../providers/openai-compatible.js';
import { hash, safeText } from './privacy.js';
import { generateReport, exportReport } from './report.js';
import { associatedPane, createHerdrCall } from '../integration/herdr.js';

export interface AcademySnapshot {
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
      const provider = createProvider(this.config.provider, this.root);
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
  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 1000);
  }
  setConfig(config: Config) {
    this.controller?.abort();
    this.generation++;
    this.config = config;
    this.engine = this.makeEngine();
    this.pending = true;
    this.emitChange();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort();
    await this.work?.catch(() => {});
    while (this.polling || this.questionBusy) await new Promise((r) => setTimeout(r, 10));
  }
  async select(session: Session, manual = true) {
    if (session.cwd !== this.root) throw new Error('Oturum proje bağlamıyla eşleşmiyor.');
    this.controller?.abort();
    this.generation++;
    this.manual = manual;
    this.pending = false;
    this.manualPending = false;
    this.snapshot = {
      ...this.snapshot,
      selected: session,
      events: this.store.contextEvents(session),
      lessons: this.store.lessons(session),
      report: undefined,
    };
    this.detector = new EngineeringMilestoneDetector();
    for (const e of this.snapshot.events) this.detector.observe(e);
    this.snapshot.stage = this.detector.stage;
    this.lastGit = 0;
    this.lastRequest = Number(this.store.getMeta('request:' + this.store.key(session)) ?? 0);
    this.snapshot.status = `Bağlı · ${session.id.slice(0, 12)}`;
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
      if (selected) {
        let more = true;
        let batches = 0;
        let ended = false;
        while (more && batches++ < 4) {
          const batch = await this.adapter.read(selected, this.store.checkpoint(selected.file));
          more = batch.more;
          const fresh = this.store.ingest(selected, batch.events, batch.checkpoint);
          if (batch.warnings.length) this.snapshot.warning = batch.warnings[0];
          for (const e of fresh) {
            if (this.detector.observe(e)) this.pending = true;
            if (e.kind === 'completed') ended = true;
          }
          if (fresh.length && !this.snapshot.lessons.length) this.pending = true;
          if (fresh.length) {
            this.store.ingest(selected, await this.collector.sources(selected, fresh));
            this.snapshot.events = this.store.contextEvents(selected);
            this.snapshot.stage = this.detector.stage;
          }
        }
        if (Date.now() - this.lastGit > 8000) {
          const git = await this.git.collect(selected);
          this.snapshot.selected = git.session;
          this.store.ingest(git.session, git.events);
          this.snapshot.events = this.store.contextEvents(git.session);
          this.lastGit = Date.now();
        }
        this.snapshot.eventCount = this.store.count(selected);
        if (ended) await this.export();
        if (
          this.pending &&
          !this.snapshot.busy &&
          (this.config.provider.autoAnalyze || this.manualPending)
        )
          this.schedule(this.manualPending);
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
    const key = hash(JSON.stringify([events.map((e) => e.id), stage, this.config]));
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const engine = this.engine;
    this.work = (async () => {
      try {
        if (this.store.getMeta('lesson-cache:' + this.store.key(s)) === key) return;
        const lesson = await engine.lesson(s.id, stage, events, this.snapshot.lessons, signal);
        if (generation !== this.generation || this.stopped) return;
        lesson.id = hash(this.store.key(s) + '|' + lesson.id);
        this.store.saveLesson(s, lesson);
        this.snapshot.lessons = this.store.lessons(s);
        if (!lesson.error) this.store.setMeta('lesson-cache:' + this.store.key(s), key);
        if (stage === 'COMPLETED') this.snapshot.report = await this.export();
      } catch (e) {
        if (!signal.aborted) this.snapshot.warning = safeText((e as Error).message, 300);
      } finally {
        this.snapshot.busy = false;
        this.emitChange();
      }
    })();
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
    const events = this.store.events(s, 3000);
    const firstTask = this.store.firstTask(s);
    if (firstTask && !events.some((e) => e.id === firstTask.id)) events.unshift(firstTask);
    const lessons = this.store.lessons(s, 200);
    return generateReport(
      s,
      events,
      lessons,
      lessons.flatMap((l) => this.store.questions(l, 10)),
      this.store.count(s),
    );
  }
  async export() {
    const s = this.snapshot.selected;
    if (!s) throw new Error('Önce bir Codex oturumu seçin.');
    const file = await exportReport(this.stateDir, s, this.report());
    this.snapshot.report = file;
    return file;
  }
}
