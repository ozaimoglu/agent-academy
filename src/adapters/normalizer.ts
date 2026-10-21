import type { AcademyEvent, EventKind } from '../core/types.js';
import { hash, safeText } from '../core/privacy.js';
import { isInjectedMessage } from '../core/language.js';

function textContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((x) => x && ['input_text', 'output_text', 'text'].includes(x.type))
    .map((x) => x.text ?? '')
    .join('\n');
}
export function commandResult(text: string): { output: string; exitCode?: number } {
  try {
    const v = JSON.parse(text);
    if (typeof v === 'object' && v)
      return {
        output: safeText(v.output ?? v.stdout ?? text),
        exitCode: typeof v.exit_code === 'number' ? v.exit_code : undefined,
      };
  } catch {
    /* Plain-text tool output. */
  }
  const m = text.match(
    /(?:Process exited with code|exit(?:ed)?(?:_code| code| status)?\s*[:=]?)\s*(-?\d+)/i,
  );
  return { output: text, exitCode: m ? Number(m[1]) : undefined };
}
/** Explicit messages/tool results only. Reasoning and encrypted items are never normalized. */
export class SessionEventNormalizer {
  turnId = 'initial';
  private commands = new Map<string, string>();
  constructor(
    readonly sessionId: string,
    private lookup: (id: string) => string | undefined = () => undefined,
  ) {}
  normalize(raw: unknown): AcademyEvent[] {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as any,
      p = r.payload ?? {};
    const time = typeof r.timestamp === 'string' ? r.timestamp : '1970-01-01T00:00:00.000Z';
    const create = (kind: EventKind, value: unknown, extra: Partial<AcademyEvent> = {}) => {
      const text = safeText(value);
      if (kind === 'task' && (!text.trim() || isInjectedMessage(text))) return [];
      const identity = extra.callId ? `${kind}|${extra.callId}` : `${this.turnId}|${kind}|${text}`;
      return [
        {
          id: hash(`${this.sessionId}|${identity}`),
          sessionId: this.sessionId,
          time,
          kind,
          text,
          origin: 'codex' as const,
          ...extra,
        },
      ];
    };
    const remember = (id: string, cmd: string) => {
      this.commands.set(id, cmd);
      if (this.commands.size > 300) this.commands.delete(this.commands.keys().next().value!);
    };
    if (r.type === 'event_msg') {
      // Codex 0.163+ persists structured TurnItem records, replacing some legacy event messages.
      if (p.type === 'item_completed' && p.item) {
        const item = p.item;
        const kind = String(item.type ?? '');
        if (kind === 'UserMessage') return create('task', textContent(item.content));
        if (kind === 'AgentMessage' && item.phase !== 'analysis')
          return create('message', textContent(item.content));
        if (kind === 'CommandExecution') {
          const command = Array.isArray(item.command)
            ? item.command.join(' ')
            : String(item.command ?? '');
          remember(item.id, command);
          const commandEvent = create('command', command, {
            callId: item.id,
            command: safeText(command),
          });
          const resultEvent = create('result', item.aggregated_output ?? '', {
            callId: item.id,
            command: safeText(command),
            exitCode: typeof item.exit_code === 'number' ? item.exit_code : undefined,
          });
          return [...commandEvent, ...resultEvent];
        }
        if (
          kind === 'FileChange' &&
          p.item.changes &&
          !Array.isArray(p.item.changes) &&
          typeof p.item.changes === 'object'
        ) {
          return Object.entries(p.item.changes).flatMap(([file, value]) => {
            const change = value as {
              type?: string;
              unified_diff?: string;
              content?: string;
            } | null;
            if (!change || typeof change !== 'object') return [];
            const diff = change.unified_diff ?? change.content;
            if (typeof diff !== 'string') return [];
            const operation =
              change.type === 'add' ? 'Add' : change.type === 'delete' ? 'Delete' : 'Update';
            return create('edit', `*** ${operation} File: ${file}\n${diff}`, {
              callId: `${item.id}:${file}`,
              file: safeText(file, 1000),
            });
          });
        }
        if (kind === 'FileChange' || kind === 'Patch')
          return create('edit', item.changes ?? item.diff ?? '', { callId: item.id });
        // Reasoning, raw_content and unknown extension payloads are intentionally ignored.
        return [];
      }
      if (['task_started', 'turn_started'].includes(p.type)) {
        this.turnId = p.turn_id ?? time;
        return [];
      }
      if (p.type === 'user_message') return create('task', p.message ?? '');
      if (p.type === 'agent_message') return create('message', p.message ?? '');
      if (p.type === 'exec_command_begin') {
        const cmd = Array.isArray(p.command) ? p.command.join(' ') : String(p.command ?? '');
        remember(p.call_id, cmd);
        return create('command', cmd, { callId: p.call_id, command: safeText(cmd) });
      }
      if (p.type === 'exec_command_end') {
        const cmd = Array.isArray(p.command)
          ? p.command.join(' ')
          : (this.commands.get(p.call_id) ?? this.lookup(p.call_id));
        return create('result', p.aggregated_output ?? p.stdout ?? p.stderr ?? '', {
          callId: p.call_id,
          command: cmd ? safeText(cmd) : undefined,
          exitCode: typeof p.exit_code === 'number' ? p.exit_code : undefined,
        });
      }
      if (['patch_apply_end', 'turn_diff'].includes(p.type))
        return create('edit', p.unified_diff ?? p.changes ?? p, { callId: p.call_id });
      if (['task_complete', 'turn_complete', 'turn_completed'].includes(p.type))
        return create('completed', p.last_agent_message ?? 'Codex turn completed.');
      if (['turn_aborted', 'error'].includes(p.type))
        return create('error', p.message ?? p.reason ?? p.type);
      return [];
    }
    if (r.type !== 'response_item') return [];
    if (p.type === 'message' && ['user', 'assistant'].includes(p.role)) {
      const text = textContent(p.content);
      // System-injected environment/instructions are not a user's engineering task.
      if (!text || p.channel === 'analysis' || isInjectedMessage(text)) return [];
      return create(p.role === 'user' ? 'task' : 'message', text);
    }
    if (['function_call', 'custom_tool_call'].includes(p.type)) {
      const name =
        String(p.name ?? '')
          .split('.')
          .pop() ?? '';
      let args: any = {};
      try {
        args = JSON.parse(p.arguments ?? '{}');
      } catch {
        /* Custom input is handled below. */
      }
      if (['exec_command', 'shell_command', 'shell', 'run_shell_command'].includes(name)) {
        const cmd = Array.isArray(args.command)
          ? args.command.join(' ')
          : String(args.cmd ?? args.command ?? '');
        remember(p.call_id, cmd);
        return create('command', cmd, { callId: p.call_id, command: safeText(cmd) });
      }
      if (name === 'apply_patch')
        return create('edit', p.input ?? args.patch ?? p.arguments ?? '', { callId: p.call_id });
      return [];
    }
    if (['function_call_output', 'custom_tool_call_output'].includes(p.type)) {
      const rawOutput = typeof p.output === 'string' ? p.output : textContent(p.output);
      const result = commandResult(rawOutput);
      const cmd = this.commands.get(p.call_id) ?? this.lookup(p.call_id);
      // Ignore unrecognized tool outputs rather than treating arbitrary tools as shell commands.
      if (!cmd) return [];
      return create('result', result.output, {
        callId: p.call_id,
        command: safeText(cmd),
        exitCode: result.exitCode,
      });
    }
    return [];
  }
}
