import { decideGating, type IntentKind } from '../cortex/policy/gating';
import { detectSignals } from '../cortex/policy/signals';

export interface ChatIntentInfo {
  kind: IntentKind | 'person';
  confidence?: number;
  isCommand?: boolean;
  isMetaComment?: boolean;
}

/** Map chat-specific intent kinds to the gating policy kinds. */
function toPolicyKind(kind: ChatIntentInfo['kind']): IntentKind {
  if (kind === 'person') return 'note'; // chat may surface 'person'; treat as note for gating
  const allowed: IntentKind[] = [
    'todo',
    'habit',
    'note',
    'question',
    'reflection',
    'idea',
    'ambiguous',
    'none',
  ];
  return (allowed.includes(kind as IntentKind) ? kind : 'ambiguous') as IntentKind;
}

/** Decide how Action Toast should behave for this message. Pure function, easy to test. */
export function decideChatToastGating(userText: string, intent: ChatIntentInfo) {
  const { hasActionSignal, hasTimeSignal } = detectSignals(userText);
  return decideGating({
    intent: toPolicyKind(intent.kind),
    confidence: Number.isFinite(intent.confidence) ? (intent.confidence as number) : 0,
    isCommand: !!intent.isCommand,
    isMetaComment: !!intent.isMetaComment,
    hasActionSignal,
    hasTimeSignal,
  });
}
