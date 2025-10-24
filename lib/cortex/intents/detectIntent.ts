/**
 * Phase 10.7: Conversational Intelligence v2
 * Phase 10.7D: Hardened intent detection with advice-first mode
 * Intent detection helper using rule-based classification
 *
 * This uses simple regex patterns for now. Can be replaced with
 * an ML endpoint later while keeping the same interface.
 */

import type { DetectedIntent } from './types';

/**
 * Detect user intent from input text
 * Returns intent kind, confidence, and suggested title
 *
 * Phase 10.7D Changes:
 * - Priority: question > note > habit > todo > reflection > idea
 * - New thresholds: habit≥0.85, todo≥0.88, note≥0.80, question≥0.70
 * - Planning/exploring detector forces question mode
 * - Advice-first: default to guidance, not creation
 *
 * Phase 10.10 Changes:
 * - Detect explicit command verbs (set/add/create/save/send/log)
 * - Set isCommand flag to bypass cooldown and enable immediate action
 * - "remember" excluded from commands (it's a note hint, not explicit command)
 */
export function detectIntent(text: string): DetectedIntent {
  const t = text.toLowerCase();
  const trimmed = text.trim();

  // Phase 10.10: Detect explicit command verbs
  // Note: "remember" removed - it's a note hint, not an explicit command
  const commandPattern = /^(set|add|create|save|send|log)\b/i;
  const isCommand = commandPattern.test(trimmed);

  // Phase 10.11: Action-verb + object combos should produce actionable intents
  // Handles phrasing like "Can you create a habit?" by checking combos BEFORE generic question detection
  // Verbs: create|log|set|set up|add|make|track|start
  // Objects: habit|reminder|todo|note
  // Also special patterns: "remind me", "set a reminder", "make a note"
  const verbObjectRe = new RegExp(
    `\\b(?:create|log|set(?:\\s+up)?|add|make|track|start)\\b[\\s\n\r]*(?:a|the|my)?[\\s\n\r]*(habit|reminder|todo|to-?do|note)s?\\b`,
    'i',
  );
  const hasVerbObject = verbObjectRe.test(text);
  const hasRemindMe = /\bremind\s+me\b/i.test(text);
  const hasSetReminder = /\bset(?:\s+up)?\s+(?:a\s+)?reminder\b/i.test(text);
  const hasMakeNote = /\bmake\s+(?:a\s+)?note\b/i.test(text);

  if (hasVerbObject || hasRemindMe || hasSetReminder || hasMakeNote) {
    let target: 'habit' | 'todo' | 'note' | null = null;

    if (hasRemindMe || hasSetReminder) {
      target = 'todo';
    } else if (hasMakeNote) {
      target = 'note';
    } else {
      const m = text.match(verbObjectRe);
      const obj = (m && m[1] ? m[1].toLowerCase() : '') as string;
      if (obj.includes('habit')) target = 'habit';
      else if (obj.includes('todo') || obj.includes('to-do') || obj.includes('reminder'))
        target = 'todo';
      else if (obj.includes('note')) target = 'note';
    }

    if (target) {
      return {
        kind: target,
        confidence: 0.95,
        title: trimmed,
        isCommand: true,
        curiositySuggestion:
          target === 'habit'
            ? 'Want structured help building this habit, or just exploring?'
            : target === 'todo'
              ? 'Want me to add this as a to-do, or just planning ahead?'
              : 'Should I capture this as a note, or just keeping it in mind?',
      };
    }
  }

  // Special-case: creative exploration phrases should be classified as ideas
  // Ensure these do not get downgraded to questions by planning/exploring detector
  if (
    /^\s*what if\b/i.test(text) ||
    /^\s*maybe we could\b/i.test(text) ||
    /^\s*imagine\b/i.test(text)
  ) {
    return {
      kind: 'idea',
      confidence: 0.9,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
      isCommand,
    };
  }

  // 0. Planning/exploring detector (HIGHEST PRIORITY)
  // Phase 10.10 B2: Enhanced planning/exploring detection
  // Forces advice-first mode instead of chips
  if (
    /\b(planning ahead|planning|thinking about|explore|exploring|not ready|just planning|considering|might|where to start|where do i start|how do i start)\b/i.test(
      t,
    )
  ) {
    return {
      kind: 'question',
      confidence: 0.75,
      suppressChips: true, // B2: Suppress chips for this turn
      isPlanning: true, // B2: Flag for advice-first mode
      isCommand,
    };
  }

  // 0.5 Idea-first phrases that look like questions but are ideation
  // Ensure "what if" and "maybe we could" classify as idea before generic question detection
  if (/\b(what if|maybe we could)\b/i.test(t)) {
    return {
      kind: 'idea',
      confidence: 0.8,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
      isCommand,
    };
  }

  // 1. Question patterns: question words or question mark
  // Lowered threshold to 0.70 for better question detection
  if (
    /\?/.test(t) ||
    /^(who|what|where|when|why|how|can|could|would|should|is|are|do|does)\b/i.test(t)
  ) {
    return { kind: 'question', confidence: 0.92, isCommand };
  }

  // Precompute candidate confidences for note and todo to allow ambiguity handling
  const matchesNotePhraseRaw = /\b(note|remember|keep in mind|write down|jot down)\b/i.test(t);
  const matchesReminderPhrase = /\b(reminder|remind me|set(?:\s+up)?\s+(?:a\s+)?reminder)\b/i.test(
    t,
  );
  // Heuristic: phrases like "remember to" or "don't forget" imply actionable follow-up
  const matchesRememberTo = /\bremember\s+to\b/i.test(t) || /\bdon't\s+forget\b/i.test(t);
  // Heuristic: temporal hints without strong verb ("tomorrow", "next week") slightly bias toward todo
  const matchesTemporal =
    /\b(today|tomorrow|tonight|this\s+week|next\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
      t,
    );

  let noteCandidate = 0;
  if (matchesNotePhraseRaw) {
    noteCandidate = 0.9;
  }
  // If it's a reminder phrase, still consider a weaker note candidate for ambiguity
  if (matchesNotePhraseRaw && matchesReminderPhrase) {
    noteCandidate = Math.max(noteCandidate, 0.75);
  }

  // 4. To-do patterns: action verbs, deadlines, reminder phrases
  // Raised threshold to 0.92 for highest confidence
  const todoHardMatch =
    /(\bremind\s+me\b|\bset(?:\s+up)?\s+(?:a\s+)?reminder\b|\b(todo|buy|finish|email|send|book|call|schedule|check|complete|submit|review|sign|pay|order|pick up|drop off|get|make|do)\b)/i.test(
      t,
    ) && !/\b(how do|how to|how can)\b/i.test(t);

  let todoCandidate = 0;
  if (todoHardMatch) {
    todoCandidate = 0.92;
  }
  // "remember to" implies actionable, but only boost toward todo when temporal hints exist
  if (matchesRememberTo && matchesTemporal) {
    todoCandidate = Math.max(todoCandidate, 0.85);
  }
  if (matchesTemporal && matchesNotePhraseRaw) {
    // temporal + note-ish phrasing: weak todo bias
    todoCandidate = Math.max(todoCandidate, 0.72);
  }

  // Ambiguity tie-break: if both candidates strong (>=0.7) and within 0.2, surface chooser
  if (noteCandidate >= 0.7 && todoCandidate >= 0.7) {
    const diff = Math.abs(todoCandidate - noteCandidate);
    if (diff < 0.2) {
      return {
        kind: 'ambiguous',
        confidence: Math.max(noteCandidate, todoCandidate),
        title: trimmed,
        options: ['todo', 'note'],
        confidences: { todo: todoCandidate, note: noteCandidate },
        showDisambiguationToast: true,
        isCommand,
        curiositySuggestion: 'Should I save this as a to-do or a note?',
      } as any;
    }
  }

  // 2. Note patterns: memory/note words (exclude reminders which map to To-Do)
  // Moved up priority: question > note > habit > todo
  if (matchesNotePhraseRaw && !matchesReminderPhrase) {
    return {
      kind: 'note',
      confidence: 0.9, // High confidence required for downstream handling
      title: trimmed,
      curiositySuggestion: 'Should I capture this as a note, or just keeping it in mind?',
      isCommand,
    };
  }

  // 3. Habit patterns: routine, frequency words
  // Raised threshold to 0.90 for more confidence
  if (
    /every\s+(day|morning|night|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
      t,
    ) ||
    /habit|routine|daily|weekly/i.test(t)
  ) {
    return {
      kind: 'habit',
      confidence: 0.9, // P0 Fix: Raised to match pipeline threshold
      title: trimmed,
      curiositySuggestion: 'Want structured help building this habit, or just exploring?',
      isCommand,
    };
  }

  if (todoHardMatch) {
    return {
      kind: 'todo',
      confidence: 0.92, // P0 Fix: Raised to match pipeline threshold
      title: trimmed,
      curiositySuggestion: 'Want me to add this as a to-do, or just planning ahead?',
      isCommand,
    };
  }

  // 5. Reflection patterns: introspective words
  if (
    /\b(reflect|journal|grateful|thankful|learned|realized|felt|feeling|today was|today has been|proud of|great day|wonderful|amazing day)\b/i.test(
      t,
    )
  ) {
    return {
      kind: 'reflection',
      confidence: 0.9,
      title: trimmed,
      curiositySuggestion: 'Want to save this as a reflection, or just thinking out loud?',
      isCommand,
    };
  }

  // 6. Idea patterns: creative/conceptual words (LOWEST PRIORITY)
  if (/\b(idea|concept|maybe we could|what if|brainstorm|imagine)\b/i.test(t)) {
    return {
      kind: 'idea',
      confidence: 0.9,
      title: trimmed,
      curiositySuggestion: 'Should I capture this idea, or just brainstorming?',
      isCommand,
    };
  }

  // No clear intent detected
  return { kind: 'none', confidence: 0, isCommand };
}
