import type { DiagramEdge } from '../core/types.js';
import wrapAnsi from 'wrap-ansi';
import stringWidth from 'string-width';
import { safeText } from '../core/privacy.js';
function box(label: string, width: number): string[] {
  const content = wrapAnsi(safeText(label, 200), Math.max(4, width - 4), {
    hard: true,
    trim: false,
  }).split('\n');
  return [
    '┌' + '─'.repeat(width - 2) + '┐',
    ...content.map((l) => '│ ' + l + ' '.repeat(Math.max(0, width - 3 - stringWidth(l))) + '│'),
    '└' + '─'.repeat(width - 2) + '┘',
  ];
}
export function renderDiagram(edges: DiagramEdge[], width: number, showEvidence = true): string {
  if (!edges.length)
    return 'No evidence-backed relationship yet. The flow will appear as observations arrive.';
  const w = Math.max(12, Math.min(width, 72));
  return edges
    .map((edge) =>
      [
        ...box(edge.from, w),
        '    │',
        ...wrapAnsi(safeText(edge.label, 180), w - 7, { hard: true })
          .split('\n')
          .map((l) => '    │ ' + l),
        '    ▼',
        ...box(edge.to, w),
        ...(showEvidence ? [`Evidence: ${edge.evidence.join(', ')}`] : []),
      ].join('\n'),
    )
    .join('\n\n');
}
