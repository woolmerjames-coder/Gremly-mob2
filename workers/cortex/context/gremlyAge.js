/**
 * Returns age-appropriate guidance for Gremly's voice
 * Uses both relationship age AND data maturity to determine stage
 *
 * Stages:
 * - NEW: Still learning, ask questions, don't assume
 * - BUILDING: Developing rapport, gentle pattern observations
 * - TRUSTED: Warm familiarity, can reference patterns (hedged)
 */

export function getAgeGuidance(relationshipStartedAt, signals = null) {
  const days = calculateDays(relationshipStartedAt);
  const normalizedSignals = normalizeSignals(signals);
  const stage = determineStage(days, normalizedSignals);

  return {
    stage,
    days,
    promptGuidance: getPromptGuidance(stage),
    logSummary: `Voice: ${stage} (${days} days)`,
  };
}

function calculateDays(relationshipStartedAt) {
  if (!relationshipStartedAt) return 0;

  const startDate = new Date(relationshipStartedAt);

  // Handle invalid dates
  if (isNaN(startDate.getTime())) return 0;

  const now = new Date();
  const days = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

  // Clamp negatives
  return Math.max(0, days);
}

function normalizeSignals(signals) {
  // Handle all edge cases: null, undefined, string, malformed
  if (!signals) return { messageCount: 0, todoCount: 0 };

  // If it's a string (Supabase sometimes returns JSON as text), parse it
  let parsed = signals;
  if (typeof signals === 'string') {
    try {
      parsed = JSON.parse(signals);
    } catch {
      return { messageCount: 0, todoCount: 0 };
    }
  }

  return {
    messageCount: parsed.message_count || 0,
    todoCount: parsed.patterns?.todoCount || 0,
    // Future: add sweep_count, journal_count, days_active when available
  };
}

function determineStage(days, signals) {
  const { messageCount, todoCount } = signals;

  // Data maturity thresholds
  const hasMinimalData = messageCount >= 10 || todoCount >= 20;
  const hasSubstantialData = messageCount >= 30 || todoCount >= 50;

  // Stage logic: time AND data maturity required to advance
  // Old account with sparse data stays NEW (this is intentional)
  if (days <= 14) {
    return 'NEW';
  } else if (days <= 60) {
    return hasMinimalData ? 'BUILDING' : 'NEW';
  } else {
    // 60+ days
    if (hasSubstantialData) return 'TRUSTED';
    if (hasMinimalData) return 'BUILDING';
    return 'NEW';
  }
}

function getPromptGuidance(stage) {
  switch (stage) {
    case 'NEW':
      return `VOICE MODE: NEW
- You're still getting to know this person
- Ask questions rather than assume
- Don't claim to know their patterns yet
- Be warm but don't overstep
- Avoid phrases like "I've noticed you tend to..." or "You always..."`;

    case 'BUILDING':
      return `VOICE MODE: BUILDING
- You're developing a comfortable rapport
- You can gently reference recent patterns you've observed
- Hedge observations: "it seems like", "lately", "I've noticed recently"
- Still learning — don't claim certainty about their tendencies`;

    case 'TRUSTED':
      return `VOICE MODE: TRUSTED
- You have a warm, familiar relationship
- You can reference patterns when relevant, but use hedged language
- Prefer "it seems", "often", "lately" over absolute statements
- Never say "you always" or "you never" — even long patterns have exceptions
- Only reference patterns when it directly helps the current question
- Speak with warmth, not authority`;

    default:
      return getPromptGuidance('NEW');
  }
}
