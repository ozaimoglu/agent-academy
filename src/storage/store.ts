import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import type {
  AcademyEvent,
  Checkpoint,
  ConceptKnowledge,
  Lesson,
  Question,
  Session,
  Usage,
} from '../core/types.js';
import { hash } from '../core/privacy.js';

export class LessonStore {
  private db: DatabaseSync;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'academy.sqlite');
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, call_id TEXT, data TEXT NOT NULL, UNIQUE(session,id));
      CREATE INDEX IF NOT EXISTS event_session ON events(session,seq);
      CREATE INDEX IF NOT EXISTS event_call ON events(session,call_id);
      CREATE TABLE IF NOT EXISTS checkpoints (file TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lessons (session TEXT NOT NULL, id TEXT PRIMARY KEY, data TEXT NOT NULL, created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lesson_session ON lessons(session,created);
      CREATE TABLE IF NOT EXISTS questions (lesson TEXT NOT NULL, id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (session TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, estimated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  key(s: Pick<Session, 'cwd' | 'id'>) {
    return hash(s.cwd + '\0' + s.id);
  }
  session(s: Session) {
    this.db
      .prepare(
        'INSERT INTO sessions VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data',
      )
      .run(this.key(s), JSON.stringify(s));
  }
  checkpoint(file: string): Checkpoint | undefined {
    return this.json(this.db.prepare('SELECT data FROM checkpoints WHERE file=?').get(file));
  }
  ingest(s: Session, events: AcademyEvent[], checkpoint?: Checkpoint): AcademyEvent[] {
    const fresh: AcademyEvent[] = [];
    const key = this.key(s);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.session(s);
      const stmt = this.db.prepare(
        'INSERT OR IGNORE INTO events(session,id,kind,call_id,data) VALUES (?,?,?,?,?)',
      );
      for (const e of events)
        if (stmt.run(key, e.id, e.kind, e.callId ?? null, JSON.stringify(e)).changes) fresh.push(e);
      if (checkpoint)
        this.db
          .prepare(
            'INSERT INTO checkpoints VALUES (?,?) ON CONFLICT(file) DO UPDATE SET data=excluded.data',
          )
          .run(s.file, JSON.stringify(checkpoint));
      this.db.exec('COMMIT');
      return fresh;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  eventCursor(s: Session): number {
    return Number(
      this.db.prepare('SELECT coalesce(max(seq),0) n FROM events WHERE session=?').get(this.key(s))
        ?.n ?? 0,
    );
  }
  hasEventAfter(s: Session, id: string, after: number): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM events WHERE session=? AND id=? AND seq>?')
      .get(this.key(s), id, after);
  }
  events(s: Session, limit = 400, after = 0): AcademyEvent[] {
    return this.db
      .prepare(
        'SELECT data FROM (SELECT seq,data FROM events WHERE session=? AND seq>? ORDER BY seq DESC LIMIT ?) ORDER BY seq',
      )
      .all(this.key(s), after, limit)
      .map((r) => this.json<AcademyEvent>(r)!);
  }
  latestTask(s: Session, after = 0): AcademyEvent | undefined {
    return this.json(
      this.db
        .prepare(
          "SELECT data FROM events WHERE session=? AND seq>? AND kind='task' ORDER BY seq DESC LIMIT 1",
        )
        .get(this.key(s), after),
    );
  }
  firstTask(s: Session, after = 0): AcademyEvent | undefined {
    return this.json(
      this.db
        .prepare(
          "SELECT data FROM events WHERE session=? AND seq>? AND kind='task' ORDER BY seq LIMIT 1",
        )
        .get(this.key(s), after),
    );
  }
  contextEvents(s: Session, after = 0): AcademyEvent[] {
    const events = this.events(s, 400, after);
    const task = this.latestTask(s, after);
    if (task && !events.some((e) => e.id === task.id)) events.unshift(task);
    return events;
  }
  evidence(s: Session, ids: string[]): AcademyEvent[] {
    const get = this.db.prepare('SELECT data FROM events WHERE session=? AND id=?');
    return ids
      .slice(0, 80)
      .map((id) => this.json<AcademyEvent>(get.get(this.key(s), id)))
      .filter((x): x is AcademyEvent => !!x);
  }
  command(s: Session, callId: string): AcademyEvent | undefined {
    return this.json(
      this.db
        .prepare(
          "SELECT data FROM events WHERE session=? AND call_id=? AND kind='command' ORDER BY seq DESC LIMIT 1",
        )
        .get(this.key(s), callId),
    );
  }
  saveLesson(s: Session, l: Lesson) {
    this.db
      .prepare(
        'INSERT INTO lessons VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(this.key(s), l.id, JSON.stringify(l), l.created);
  }
  lessons(s: Session, limit = 100): Lesson[] {
    return this.db
      .prepare(
        'SELECT data FROM (SELECT data,created FROM lessons WHERE session=? ORDER BY created DESC LIMIT ?) ORDER BY created',
      )
      .all(this.key(s), limit)
      .map((r) => this.json<Lesson>(r)!);
  }
  question(q: Question) {
    this.db
      .prepare('INSERT INTO questions VALUES (?,?,?)')
      .run(q.lessonId, q.id, JSON.stringify(q));
  }
  questions(l: Lesson, limit = 100): Question[] {
    return this.db
      .prepare(
        'SELECT data FROM (SELECT rowid,data FROM questions WHERE lesson=? ORDER BY rowid DESC LIMIT ?) ORDER BY rowid',
      )
      .all(l.id, limit)
      .map((r) => this.json<Question>(r)!);
  }
  conceptKnowledge(project: string): ConceptKnowledge[] {
    return JSON.parse(this.getMeta('concepts:' + hash(project)) ?? '[]');
  }
  rememberConcept(project: string, entry: ConceptKnowledge) {
    const knowledge = this.conceptKnowledge(project).filter((k) => k.key !== entry.key);
    this.setMeta('concepts:' + hash(project), JSON.stringify([...knowledge, entry].slice(-100)));
  }
  getMeta(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  }
  setMeta(key: string, value: string) {
    this.db
      .prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, value);
  }
  recordUsage(s: Session, u: Usage) {
    this.db
      .prepare('INSERT INTO usage VALUES (?,?,?,?)')
      .run(this.key(s), u.input, u.output, u.estimated ? 1 : 0);
  }
  usage(s: Session): Usage {
    const r = this.db
      .prepare(
        'SELECT coalesce(sum(input),0) i,coalesce(sum(output),0) o,coalesce(max(estimated),0) e FROM usage WHERE session=?',
      )
      .get(this.key(s))!;
    return { input: Number(r.i), output: Number(r.o), estimated: !!r.e };
  }
  count(s: Session, after = 0): number {
    return Number(
      this.db
        .prepare('SELECT count(*) n FROM events WHERE session=? AND seq>?')
        .get(this.key(s), after)?.n ?? 0,
    );
  }
  close() {
    this.db.close();
  }
  private json<T>(row: unknown): T | undefined {
    return row ? (JSON.parse((row as { data: string }).data) as T) : undefined;
  }
}
