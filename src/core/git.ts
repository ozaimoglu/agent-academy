import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AcademyEvent, Session } from './types.js';
import { hash, readSource, safeText, sensitivePath } from './privacy.js';
const exec = promisify(execFile);
export class GitChangeTracker {
  private async git(root: string, args: string[]) {
    const r = await exec(
      'git',
      [
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'diff.external=',
        '-C',
        root,
        ...args,
      ],
      {
        timeout: 6000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      },
    );
    return r.stdout;
  }
  async collect(
    s: Session,
  ): Promise<{ session: Session; events: AcademyEvent[]; warning?: string }> {
    try {
      const [branch, commit, names] = await Promise.all([
        this.git(s.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
        this.git(s.cwd, ['rev-parse', 'HEAD']),
        this.git(s.cwd, ['diff', '--name-only', '-z', 'HEAD', '--']),
      ]);
      const files = names
        .split('\0')
        .filter((f) => f && !sensitivePath(f))
        .slice(0, 12);
      const events: AcademyEvent[] = [];
      for (const file of files) {
        // Verify realpath before Git can read a worktree path; symlink escapes are excluded.
        try {
          await readSource(s.cwd, file, 1, 1);
        } catch {
          continue;
        }
        const diff = await this.git(s.cwd, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--unified=6',
          'HEAD',
          '--',
          file,
        ]);
        if (!diff.trim()) continue;
        const text = safeText(diff, 16000);
        events.push({
          id: hash(s.id + '|git|' + text),
          sessionId: s.id,
          time: new Date().toISOString(),
          kind: 'diff',
          origin: 'git',
          text,
          file,
        });
        const match = diff.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        const start = Math.max(1, Number(match?.[1] ?? 1) - 4);
        try {
          const source = await readSource(s.cwd, file, start, start + 70);
          events.push({
            id: hash(s.id + '|source|' + file + source.text),
            sessionId: s.id,
            time: new Date().toISOString(),
            kind: 'source',
            origin: 'source',
            text: source.text,
            file,
            startLine: source.start,
            endLine: source.end,
          });
        } catch {
          /* Deleted/large/sensitive source remains diff-only. */
        }
      }
      return { session: { ...s, branch: branch.trim(), commit: commit.trim() }, events };
    } catch {
      return {
        session: s,
        events: [],
        warning: 'Git bilgisi alınamadı (repo veya HEAD olmayabilir).',
      };
    }
  }
}
