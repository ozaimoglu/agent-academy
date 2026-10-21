import type { AcademyEvent, Stage } from './types.js';
export function isTestCommand(cmd: string): boolean {
  return /(?:\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check)|\b(?:mvnw?|gradle|gradlew|pytest|vitest|jest|cargo test|go test|node --test)\b|\.\/gradlew\s+test)/i.test(
    cmd,
  );
}
export class EngineeringMilestoneDetector {
  stage: Stage = 'INVESTIGATING';
  observe(e: AcademyEvent): Stage | undefined {
    let next: Stage | undefined;
    if (e.kind === 'task') next = 'INVESTIGATING';
    else if (e.kind === 'completed') next = 'COMPLETED';
    else if (e.kind === 'edit' || e.kind === 'diff') next = 'IMPLEMENTING';
    else if (e.kind === 'result' && isTestCommand(e.command ?? '')) next = 'VALIDATING';
    else if (
      e.kind === 'message' &&
      /(?:root cause|kök neden|asıl (?:neden|sorun)|caused by|sorunun nedeni)/i.test(e.text)
    )
      next = 'ROOT_CAUSE_IDENTIFIED';
    else if (
      e.kind === 'message' &&
      /(?:hypothes|suspect|probably|likely|hipotez|olabilir|şüphe|muhtemelen)/i.test(e.text)
    )
      next = 'HYPOTHESIS';
    else if (
      e.kind === 'error' ||
      (e.kind === 'result' && e.exitCode !== undefined && e.exitCode !== 0)
    )
      next = 'INVESTIGATING';
    if (next && next !== this.stage) {
      this.stage = next;
      return next;
    }
    return e.kind === 'task' || (next && ['edit', 'result', 'completed'].includes(e.kind))
      ? this.stage
      : undefined;
  }
}
