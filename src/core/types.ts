export type Stage =
  | 'INVESTIGATING'
  | 'HYPOTHESIS'
  | 'ROOT_CAUSE_IDENTIFIED'
  | 'IMPLEMENTING'
  | 'VALIDATING'
  | 'COMPLETED';
export type Confidence = 'Confirmed' | 'Strongly supported' | 'Hypothesis' | 'Unknown';
export type EventKind =
  'task' | 'message' | 'command' | 'result' | 'edit' | 'diff' | 'source' | 'completed' | 'error';
export interface Session {
  id: string;
  file: string;
  cwd: string;
  modified: number;
  source: string;
  branch?: string;
  commit?: string;
  version?: string;
}
export interface AcademyEvent {
  id: string;
  sessionId: string;
  time: string;
  kind: EventKind;
  text: string;
  callId?: string;
  command?: string;
  exitCode?: number;
  file?: string;
  startLine?: number;
  endLine?: number;
  origin: 'codex' | 'git' | 'source';
}
export interface Checkpoint {
  offset: number;
  identity: string;
  prefix: string;
}
export interface Section {
  heading: string;
  body: string;
  evidence: string[];
  confidence: Confidence;
}
export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  evidence: string[];
}
export interface Usage {
  input: number;
  output: number;
  estimated: boolean;
}
export interface Lesson {
  language?: string;
  captureId?: string;
  id: string;
  sessionId: string;
  created: string;
  stage: Stage;
  title: string;
  sections: Section[];
  walkthrough?: Section[];
  concepts: string[];
  diagram: DiagramEdge[];
  evidenceIds: string[];
  provider: string;
  usage?: Usage;
  error?: string;
}
export interface Question {
  id: string;
  lessonId: string;
  question: string;
  answer: Section[];
  created: string;
  usage?: Usage;
}
export interface ModelReply {
  text: string;
  usage?: Usage;
}
export interface LLMProvider {
  name: string;
  explain(system: string, context: string, signal?: AbortSignal): Promise<ModelReply>;
}
export interface SessionAdapter {
  discover(root: string): Promise<Session[]>;
  read(
    session: Session,
    checkpoint?: Checkpoint,
  ): Promise<{ events: AcademyEvent[]; checkpoint: Checkpoint; warnings: string[]; more: boolean }>;
}
export const stageLabels: Record<Stage, string> = {
  INVESTIGATING: 'Investigating',
  HYPOTHESIS: 'Hypothesis',
  ROOT_CAUSE_IDENTIFIED: 'Root cause observation',
  IMPLEMENTING: 'Implementing',
  VALIDATING: 'Validating',
  COMPLETED: 'Turn completed',
};
export const confidenceLabels: Record<Confidence, string> = {
  Confirmed: 'Confirmed',
  'Strongly supported': 'Strongly supported',
  Hypothesis: 'Hypothesis',
  Unknown: 'Unknown',
};
