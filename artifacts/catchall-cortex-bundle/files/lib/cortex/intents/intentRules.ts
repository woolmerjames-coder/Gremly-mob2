/**
 * Central intent classification rules
 * Single source of truth for all intent decisions
 *
 * ⚠️ AUTHORITY: This file is the SINGLE SOURCE OF TRUTH for intent classification
 * Established by commit 9d254c86daac76e7b441c6487b0340a1a1a455a1
 *
 * ⚠️ CRITICAL: ALL intent classification MUST go through this file
 * - NO direct regex pattern matching for intents outside this file
 * - NO hardcoded intent.kind assignments outside this file
 * - ALL modules MUST use detectIntent() -> classifyIntent() flow
 *
 * This file defines all intent classification rules in priority order.
 * Rules are checked sequentially, and the first matching rule wins.
 * This eliminates ambiguity and ensures consistent behavior across the app.
 *
 * See lib/cortex/intents/README.md for architecture details and guidelines.
 */

import type { DetectedIntent, IntentKind } from './types';

export interface IntentRule {
  priority: number; // Lower number = higher priority
  name: string; // Human-readable rule name for debugging
  test: (text: string) => boolean;
  classification: {
    kind: IntentKind;
    confidence: number;
    flags: {
      isMetaComment?: boolean;
      suppressChips?: boolean;
      isCommand?: boolean;
      isPlanning?: boolean;
      requiresAction?: boolean;
      showDisambiguationToast?: boolean;
    };
  };
}

// Priority-ordered rules (check in order, first match wins)
export const INTENT_RULES: IntentRule[] = [
  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 0-9: SYSTEM META-COMMENTS (HIGHEST PRIORITY)
  // These should NEVER create actions, always return clarification
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 0,
    name: 'meta_comment_confusion',
    test: (text) => {
      const normalized = text.toLowerCase().trim();

      // Debug log for "doesn't make sense" detection
      if (normalized.includes('make sense')) {
        console.log('[META_DEBUG] Checking meta-comment for:', normalized);
        console.log(
          '[META_DEBUG] Contains "doesn\'t make sense"?',
          normalized.includes("doesn't make sense"),
        );
        console.log(
          '[META_DEBUG] Contains "doesnt make sense"?',
          normalized.includes('doesnt make sense'),
        );
        console.log(
          '[META_DEBUG] Contains "does not make sense"?',
          normalized.includes('does not make sense'),
        );
      }

      // Check each pattern individually for better debugging
      if (normalized.includes("doesn't make sense")) return true;
      if (normalized.includes('doesnt make sense')) return true;
      if (normalized.includes('does not make sense')) return true;
      if (/why did you/i.test(normalized)) return true;
      if (/why would you/i.test(normalized)) return true;
      if (/what did you/i.test(normalized)) return true;
      if (/what are you doing/i.test(normalized)) return true;
      if (/why are you/i.test(normalized)) return true;
      if (/that'?s? wrong/i.test(normalized)) return true;
      if (/that'?s? incorrect/i.test(normalized)) return true;
      if (/that'?s? not right/i.test(normalized)) return true;
      if (/\bhuh\??\b/i.test(normalized)) return true;
      if (/i don'?t understand/i.test(normalized)) return true;
      if (/can you explain/i.test(normalized)) return true;
      if (/what'?s? going on/i.test(normalized)) return true;

      return false;
    },
    classification: {
      kind: 'question',
      confidence: 0.95,
      flags: {
        isMetaComment: true,
        suppressChips: true,
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 10-19: EXPLICIT OPT-OUTS
  // User explicitly doesn't want action
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 10,
    name: 'opt_out_explicit',
    test: (text) => {
      const patterns = [
        /\b(just thinking|just thought|just wondering|just chatting)\b/i,
        /\b(never mind|nevermind)\b/i,
        /\b(forget it|ignore that)\b/i,
        /\b(not really|not now|later maybe)\b/i,
        /\bmaybe\b.*\blater\b/i, // "Maybe I could do this later"
        /^just\b/i, // "Just thinking about..."
        /\b(don't|dont) save\b/i, // "Don't save that"
        /\bno need\b/i, // "No need to save"
        /\bcancel that\b/i, // "Cancel that"
        /^i'?m good\b/i, // "I'm good"
        /^maybe\?*$/i, // "Maybe?" by itself
        /^not sure\b(?!\s+about\s+(what|whether|if))/i, // "Not sure" but NOT "Not sure about what/whether/if" (those are ambiguous)
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'none', // Changed back to 'none' to match meta-comments test
      confidence: 0,
      flags: {
        suppressChips: true,
        requiresAction: false,
      },
    },
  },

  {
    priority: 11,
    name: 'opt_out_planning',
    test: (text) => {
      // Only match planning mode if it has modal verbs (might/maybe/perhaps)
      // Don't match simple "thinking about X" which could be ambiguous
      // IMPORTANT: Don't match idea patterns like "maybe we could" or "what if"
      const ideaPatterns = [
        /^what if\b/i,
        /^(maybe|perhaps) (i|we) could\b/i,
        /\bwouldn't it be (cool|great|nice|interesting) (if|to)\b/i,
      ];

      // If it matches an idea pattern, don't classify as planning
      if (ideaPatterns.some((pattern) => pattern.test(text))) {
        return false;
      }

      // Don't match if it has "later" (that's an opt-out, handled above)
      if (/\blater\b/i.test(text)) {
        return false;
      }

      const modalPlanning = /\b(might|maybe|perhaps|possibly)\b.*\b(could|should|would)\b/i;
      const brainstorming = /\b(brainstorming|ideating)\b/i;

      return modalPlanning.test(text) || brainstorming.test(text);
    },
    classification: {
      kind: 'question',
      confidence: 0.7,
      flags: {
        isPlanning: true,
        suppressChips: true,
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 12: AMBIGUOUS REFLECTION/ADVICE-SEEKING
  // User is pondering/uncertain - could want reflection OR advice
  // Needs to come BEFORE commands/todos (20+) to catch uncertainty
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 12,
    name: 'ambiguous_reflection_seeking_advice',
    test: (text) => {
      // Patterns that could be either reflection OR seeking advice
      const ponderingPatterns = [
        /\b(thinking|wondering|pondering|considering) (about|if|whether)\b/i,
        /\bnot sure (about|if|whether|what)\b/i,
        /\b(confused|torn|conflicted|undecided) about\b/i,
        /\btrying to (figure out|decide|understand)\b/i,
        /\bcontemplating\b/i,
      ];

      // Don't match if it's clearly a command or has explicit intent
      const hasExplicitIntent = /^(create|add|set|remind me|note:)/i.test(text);
      const hasQuestionMark = text.includes('?');

      // Only ambiguous if NOT explicit and NOT clearly a question
      return !hasExplicitIntent && !hasQuestionMark && ponderingPatterns.some((p) => p.test(text));
    },
    classification: {
      kind: 'ambiguous',
      confidence: 0.7,
      flags: {
        requiresAction: false,
        showDisambiguationToast: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 5: EXPLICIT REFLECTIONS
  // High priority to catch "I've been thinking about X" before question rules
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 5,
    name: 'reflection_explicit_been_thinking',
    test: (text) => {
      // Explicitly catch "I've been thinking/pondering/reflecting about X"
      return /^i'?ve been (thinking|pondering|reflecting|wondering|contemplating) (about|on)\b/i.test(
        text,
      );
    },
    classification: {
      kind: 'reflection',
      confidence: 0.85,
      flags: {
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 15: COMPLETE HABIT STATEMENTS
  // User provides activity AND frequency in one statement
  // E.g., "I want to run 3 times a week" - should trigger toast immediately
  // High priority to catch before partial habit patterns
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 15,
    name: 'habit_complete_statement',
    test: (text) => {
      const normalized = text.toLowerCase().trim();

      // Pattern 1: "I want to [activity] N times a week"
      const wantToFrequency =
        /\b(i want to|i'd like to|i wanna)\s+(run|walk|exercise|meditate|read|write|practice|work\s*out|journal|yoga|stretch|cycle|swim|jog)\s+(\d+|once|twice)\s+times?\s+(a|per)\s+week/i;

      // Pattern 2: "I'll [activity] daily/every day"
      const dailyCommitment =
        /\b(i'?ll|i will)\s+(run|walk|exercise|meditate|read|write|practice|work\s*out|journal|yoga|stretch|cycle|swim|jog)\s+(daily|every\s+day|each\s+day|every\s+morning|every\s+evening)/i;

      // Pattern 3: "Let me [activity] Nx a week"
      const shorthandFrequency =
        /\b(let me|let's|i'll)\s+(run|walk|exercise|meditate|read|write|practice|work\s*out|journal)\s+(\d+)x\s*(a|per)?\s*week/i;

      // Pattern 4: "[activity] N times a week" (more casual)
      const casualFrequency =
        /^(run|walk|exercise|meditate|read|write|practice|work\s*out|journal|yoga|stretch)\s+(\d+|once|twice)\s+times?\s+(a|per)\s+week/i;

      return (
        wantToFrequency.test(normalized) ||
        dailyCommitment.test(normalized) ||
        shorthandFrequency.test(normalized) ||
        casualFrequency.test(normalized)
      );
    },
    classification: {
      kind: 'habit',
      confidence: 0.95,
      flags: {
        requiresAction: true,
        isCommand: false, // Not an explicit command, but complete enough to act on
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 17: ACTION-ORIENTED REMINDERS
  // "Remember to [action]" should be todo, not note
  // Must come BEFORE generic "remember" → note rule (priority 18)
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 17,
    name: 'reminder_action_todo',
    test: (text) => {
      // Match "remember to [action]" or "remind me to [action]" or "don't forget to [action]"
      // Exclude information capture like "remember the name" or "remember that"
      const actionReminderPatterns = [
        /\bremember to\s+(?!the\b|that\b|this\b|my\b|your\b)(\w+)/i,
        /\bremind me to\s+(?!the\b|that\b|this\b|my\b|your\b)(\w+)/i,
        /\bdon'?t forget to\s+(?!the\b|that\b|this\b|my\b|your\b)(\w+)/i,
      ];
      return actionReminderPatterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'todo',
      confidence: 0.9,
      flags: {
        isCommand: false,
        requiresAction: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 18-19: INFORMATION CAPTURE HINTS (NOT COMMANDS)
  // Generic "remember" without "to [action]" is information storage
  // Must come AFTER action-oriented reminders (priority 17)
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 18,
    name: 'hint_remember_information',
    test: (text) => {
      // "remember the/that/this" or standalone "remember" are information hints
      // This will catch "Remember the restaurant name" but NOT "Remember to call mom"
      const informationPatterns = [
        /\bremember\s+(the|that|this|my|your|about)\b/i,
        /^remember$/i, // Just "remember" alone
      ];
      return informationPatterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'note',
      confidence: 0.85,
      flags: {
        isCommand: false,
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 20-29: EXPLICIT COMMANDS
  // User explicitly commands action with verb+object
  // Detect command verbs anywhere in sentence, not just at start
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 20,
    name: 'command_explicit_habit',
    test: (text) => {
      // Match command verb anywhere, followed by habit words within 4 words
      const commandPattern =
        /\b(create|add|set|start|begin|make|log|track|save)\b(?:\s+\w+){0,4}\s*(a\s+)?(habit|routine|practice)\b/i;
      const frequencyPattern = /\b(daily|weekly|every (day|week|morning|evening))\b/i;
      return (
        commandPattern.test(text) ||
        (frequencyPattern.test(text) && /\b(add|create|set|start|make)\b/i.test(text))
      );
    },
    classification: {
      kind: 'habit',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 21,
    name: 'command_explicit_todo',
    test: (text) => {
      // Match command verb anywhere, followed by todo/task/reminder within 4 words
      const commandPattern =
        /\b(create|add|set|make|log|save)\b(?:\s+\w+){0,4}\s*(a\s+)?(todo|task|reminder|to-do)\b/i;
      return commandPattern.test(text);
    },
    classification: {
      kind: 'todo',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 22,
    name: 'command_remind_me',
    test: (text) => {
      // "Remind me" or "Set a reminder" are explicit commands
      return /\b(remind me|set (a |an )?reminder)\b/i.test(text);
    },
    classification: {
      kind: 'todo',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 23,
    name: 'command_send_email',
    test: (text) => {
      // "send an email" or "send email to" is a command
      return /\bsend\b(?:\s+\w+){0,3}\s*(an\s+)?email\b/i.test(text);
    },
    classification: {
      kind: 'todo',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 24,
    name: 'command_save_idea',
    test: (text) => {
      // "save this idea" or "save idea" is a command
      return /\bsave\b(?:\s+\w+){0,3}\s*(this\s+|an\s+)?idea\b/i.test(text);
    },
    classification: {
      kind: 'idea',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 25,
    name: 'command_log_reflection',
    test: (text) => {
      // "log today was" or "log" with reflection keywords is a command
      const hasLogVerb = /\blog\b/i.test(text);
      const hasReflectionContext = /\b(today|yesterday|this (week|month)|was|felt|feeling)\b/i.test(
        text,
      );
      return hasLogVerb && hasReflectionContext;
    },
    classification: {
      kind: 'reflection',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  {
    priority: 26,
    name: 'command_explicit_note',
    test: (text) => {
      // Match command verb anywhere, followed by note/journal/entry within 4 words
      const commandPattern =
        /\b(create|add|make|write|log|save)\b(?:\s+\w+){0,4}\s*(a\s+)?(note|journal|entry|memo)\b/i;
      return commandPattern.test(text);
    },
    classification: {
      kind: 'note',
      confidence: 0.95,
      flags: {
        isCommand: true,
        requiresAction: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 30-39: GREETINGS (should be handled elsewhere)
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 30,
    name: 'greeting',
    test: (text) => {
      const greetings = /^(hi|hey|hello|good morning|good afternoon|good evening|sup|yo)\b/i;
      return greetings.test(text.trim()) && text.split(/\s+/).length <= 3;
    },
    classification: {
      kind: 'none',
      confidence: 0,
      flags: {
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 35-39: SOCIAL/COMPLIMENT PATTERNS
  // Compliments, gratitude, social interactions - not actions
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 35,
    name: 'social_compliment',
    test: (text) => {
      const patterns = [
        /\byou'?re (amazing|awesome|great|wonderful|the best|incredible|fantastic|brilliant|lovely|kind)\b/i,
        /\b(thank you|thanks|appreciate|grateful to you|love you|love this|love it)\b/i,
        /\byou (rock|rule|kill it|nailed it)\b/i,
        /\bthat'?s (amazing|awesome|great|wonderful|perfect|brilliant)\b/i,
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'social',
      confidence: 0.95,
      flags: {
        isMetaComment: true,
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 36: AFFIRMATIVE ACTIVITY RESPONSES
  // Context-aware responses that continue habit discussion
  // E.g., "Running sounds good", "I'll run", "Let me exercise"
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 36,
    name: 'affirmative_activity',
    test: (text) => {
      const normalized = text.toLowerCase().trim();

      // Activity-specific affirmatives like "Running sounds good"
      const activityAffirmative =
        /\b(running|walking|swimming|yoga|meditation|exercise|exercising|gym|workout|working out|jogging|cycling|hiking|stretching)\s+(sounds\s+(good|great|perfect|nice)|is\s+(good|great|perfect)|works)\b/i;

      // Commitment phrases with activities
      const commitmentActivity =
        /\b(i'll|let's|let me|i will|i can)\s+(run|walk|swim|exercise|meditate|workout|jog|cycle|hike|stretch)\b/i;

      // Simple affirmatives (only in conversational context)
      const simpleAffirmative =
        /^(sounds?\s+(good|great|perfect|nice|cool)|that('s|\s+is)\s+(good|great|perfect)|works\s+for\s+me|okay|ok|sure|yeah|yep|yes|alright|got it)$/i;

      return (
        activityAffirmative.test(normalized) ||
        commitmentActivity.test(normalized) ||
        simpleAffirmative.test(normalized)
      );
    },
    classification: {
      kind: 'habit',
      confidence: 0.7,
      flags: {
        requiresAction: false, // Don't create immediately - this is conversational
        suppressChips: false, // Keep chips to offer next steps
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 40-49: HABIT PATTERNS
  // Strong indicators of recurring behavior
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 40,
    name: 'habit_want_to',
    test: (text) => {
      const normalized = text.toLowerCase().trim();

      // Patterns like "I want to run", "I'd like to exercise", "I wanna meditate"
      const wantToPatterns = [
        /\b(i want to|i'd like to|i wanna|let's|i'm going to|i'll)\s+(\w+)/i,
        /\bstart (running|walking|exercising|working out|meditating|reading|writing|jogging|yoga|stretching)/i,
        /\b(run|walk|exercise|workout|meditate|read|write|jog|stretch)\s+(daily|every|regularly|more|often)/i,
      ];

      // Also catch simple activity statements with frequency hints
      const simpleActivity =
        /^(run|running|exercise|exercising|meditate|meditation|walk|walking)$/i;
      const hasFrequency = /\b(daily|every|regularly|\d+\s*times)/i.test(normalized);

      return (
        wantToPatterns.some((p) => p.test(normalized)) ||
        (simpleActivity.test(normalized) && hasFrequency)
      );
    },
    classification: {
      kind: 'habit',
      confidence: 0.85,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 41,
    name: 'habit_frequency',
    test: (text) => {
      const frequencyPatterns = [
        /\b(every|each) (day|morning|evening|night|week|month)\b/i,
        /\b(daily|weekly|monthly|regularly|consistently)\b/i,
        /\b(routine|practice|discipline|ritual)\b/i,
        /\b\d+ times (a|per) (day|week|month)\b/i,
      ];
      return frequencyPatterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'habit',
      confidence: 0.9,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 42,
    name: 'habit_start',
    test: (text) => {
      const startPatterns = [
        /\b(start|begin|initiate|commence)\b.*\b(habit|routine|practice)\b/i,
        /\b(want to|need to|should|must) (start|begin)\b/i,
        /\bi want to make.*a habit/i,
      ];
      return startPatterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'habit',
      confidence: 0.88,
      flags: {
        requiresAction: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 49: HABIT REMINDER CONFIGURATION
  // When user is specifying reminder times/frequency for a habit
  // This prevents "remind me at 7am" from creating a TODO when in habit context
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 49,
    name: 'habit_reminder_details',
    test: (text) => {
      const normalized = text.toLowerCase().trim();

      // Check if this message is about setting reminder times/frequency
      const isAboutReminders = /\b(remind|alert|notify|ping)\s*(me)?\b/i.test(normalized);
      const hasTimeSpecification =
        /\b(\d{1,2}(:\d{2})?\s*(am|pm)|morning|afternoon|evening|night|noon|midnight)\b/i.test(
          normalized,
        );
      const hasFrequencyPattern =
        /\b(every|each|mon|tue|wed|thu|fri|sat|sun|weekday|weekend|daily|weekly)\b/i.test(
          normalized,
        );

      // This is likely reminder configuration if it mentions times AND (reminders OR frequencies)
      const isSettingReminders = isAboutReminders && (hasTimeSpecification || hasFrequencyPattern);

      // Check for "Yes" confirmation pattern (user confirming they want reminders)
      const isConfirmingReminders =
        /^(yes|yeah|yep|yup|sure|ok|okay|sounds good|that works),?\s*(remind|alert|notify|that sounds good|please)/i.test(
          normalized,
        );

      // Also catch standalone time specifications that follow habit discussion
      const isTimeOnly =
        hasTimeSpecification && !isAboutReminders && normalized.split(/\s+/).length <= 5; // Short response like "7am and 5pm"

      return isSettingReminders || isConfirmingReminders || isTimeOnly;
    },
    classification: {
      kind: 'habit_reminder' as any, // Special kind to signal context-aware handling
      confidence: 0.85,
      flags: {
        requiresAction: false, // Don't create action directly
        // @ts-expect-error - Adding custom flag for context awareness
        needsContext: true, // Signal to check conversation context
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 50-59: TODO/REMINDER PATTERNS
  // Time-bound or action-oriented tasks
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 50,
    name: 'todo_explicit_prefix',
    test: (text) => {
      // Match explicit "Todo:", "Task:", "To-do:", or "TODO:" prefix
      return /^(todo|task|to-do):/i.test(text);
    },
    classification: {
      kind: 'todo',
      confidence: 0.95,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 51,
    name: 'todo_reminder_explicit',
    test: (text) => {
      const patterns = [
        /\b(remind me|set (a )?reminder)\b/i,
        /\bdon't (let me )?forget (to)?\b/i,
        /\bneed to remember (to)?\b/i,
        /\bremember to\b/i, // "Remember to [action]" = todo
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'todo',
      confidence: 0.92,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 52,
    name: 'todo_temporal',
    test: (text) => {
      const timePatterns = [
        /\b(tomorrow|today|tonight|this (morning|afternoon|evening|week|weekend))\b/i,
        /\b(next (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
        /\b(at|by|before|after) \d+/i,
      ];
      const actionVerbs = /\b(need to|should|must|have to|got to|gotta)\b/i;
      return timePatterns.some((p) => p.test(text)) && actionVerbs.test(text);
    },
    classification: {
      kind: 'todo',
      confidence: 0.88,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 53,
    name: 'todo_modal_action',
    test: (text) => {
      // "Need to call", "Have to buy", "Must finish", "I should finish the report"
      // But NOT "Should I do..." (that's a question)

      // FIRST: Check if it's a question - questions should not be todos
      if (text.includes('?')) return false; // Explicit question mark
      if (/^(should|could|would|can|will) (i|we|you|they)\b/i.test(text)) return false; // Question form

      // Modal + action patterns for todos
      const modalPattern = /^(need to|have to|must|got to|gotta)\b/i;
      const shouldPattern = /\b(i|we|you|they) should\b/i; // "I should finish" = todo
      const actionVerbs =
        /\b(call|email|text|message|contact|buy|purchase|get|pick up|grab|schedule|book|arrange|organize|finish|complete|submit|send|check|review|read|watch|write|create|start|do|make)\b/i;

      const hasModalAction = modalPattern.test(text) && actionVerbs.test(text);
      const hasShouldAction = shouldPattern.test(text) && actionVerbs.test(text);

      return hasModalAction || hasShouldAction;
    },
    classification: {
      kind: 'todo',
      confidence: 0.9,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 54,
    name: 'todo_imperative',
    test: (text) => {
      const imperativeVerbs = [
        /^(call|email|text|message|contact)\b/i,
        /^(buy|purchase|get|pick up|grab)\b/i,
        /^(schedule|book|arrange|organize)\b/i,
        /^(finish|complete|submit|send)\b/i,
        /^(check|review|read|watch)\b/i,
      ];
      // Match imperative verbs, OR "need/must/should + action" with time
      const hasImperative = imperativeVerbs.some((pattern) => pattern.test(text));
      const hasModalAction = /^(need to|have to|must|should)\b/i.test(text);
      const hasTime = /\b(by|before|tomorrow|today|next)\b/i.test(text);

      return hasImperative || (hasModalAction && hasTime);
    },
    classification: {
      kind: 'todo',
      confidence: 0.85,
      flags: {
        requiresAction: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 60-69: NOTE PATTERNS
  // Information capture, not action-oriented
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 60,
    name: 'note_remember_prefix',
    test: (text) => {
      const patterns = [
        /^(note to self|note:|remember to note|keep in mind|don't forget)\b/i,
        /^(jot down|write down|make a note)\b/i,
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'note',
      confidence: 0.9,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 61,
    name: 'note_remember',
    test: (text) => {
      const hasRemember = /\b(remember|note|keep track)\b/i.test(text);
      const noTimeReference = !/\b(tomorrow|today|next|by|at|before)\b/i.test(text);
      const noActionVerb = !/\b(need to|should|must|have to|call|buy|send)\b/i.test(text);
      return hasRemember && noTimeReference && noActionVerb;
    },
    classification: {
      kind: 'note',
      confidence: 0.85,
      flags: {
        requiresAction: true,
      },
    },
  },

  {
    priority: 62,
    name: 'note_factual',
    test: (text) => {
      const factPatterns = [
        /^(the|a|an) .{3,} (is|are|was|were|has|have)\b/i,
        /^(my|his|her|their|our) .{3,} (is|are|was|were|has|have)\b/i,
        /^\w+ (said|mentioned|told me|explained)\b/i,
      ];
      const isShort = text.split(/\s+/).length >= 5;
      return isShort && factPatterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'note',
      confidence: 0.8,
      flags: {
        requiresAction: true,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 70-79: IDEA/REFLECTION
  // Exploratory, future-thinking (BEFORE questions to catch "I've been thinking...")
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 70,
    name: 'reflection',
    test: (text) => {
      const patterns = [
        /\bthinking about\b/i,
        /\breflecting on\b/i,
        /\bpondering\b/i,
        /\bi wonder\b/i,
        /\bi'?m curious\b/i,
        /\bi'?ve been thinking/i, // Remove \b at end - "I've been thinking about..."
        /\bi'?m thinking/i, // "I'm thinking about..."
        /\b(learned|realized|noticed|observed) (that)?\b/i,
        /\b(grateful|thankful|blessed) (for|that)\b/i, // "Grateful for...", "Thankful that..."
        /\b(had a|what a) (great|good|wonderful|amazing|tough|difficult|challenging) (day|week|time)\b/i, // "Had a great day"
        /^grateful\b/i, // "Grateful for my team"
        /^learned\b/i, // "Learned a lot about..."
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'reflection',
      confidence: 0.8,
      flags: {
        requiresAction: false,
      },
    },
  },

  {
    priority: 71,
    name: 'idea_explicit',
    test: (text) => {
      // Match explicit "Idea:" prefix or "Idea for/about..."
      return /^idea\s*(:|for|about)\b/i.test(text);
    },
    classification: {
      kind: 'idea',
      confidence: 0.95,
      flags: {
        requiresAction: false,
      },
    },
  },

  {
    priority: 72,
    name: 'idea_what_if',
    test: (text) => {
      const patterns = [
        /^what if\b/i,
        /^(maybe|perhaps) (i|we) could\b/i,
        /\bwouldn't it be (cool|great|nice|interesting) (if|to)\b/i,
        /\b(imagine if|picture this|consider)\b/i,
      ];
      return patterns.some((pattern) => pattern.test(text));
    },
    classification: {
      kind: 'idea',
      confidence: 0.85,
      flags: {
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 80-89: QUESTIONS
  // Seeking information or clarification
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 80,
    name: 'question_interrogative',
    test: (text) => {
      // Exclude reflective statements that might start with "I've been" or "I'm thinking"
      if (/\bi'?ve been (thinking|reflecting|pondering)/i.test(text)) return false;
      if (/\bi'?m thinking about/i.test(text)) return false;

      const hasQuestionMark = text.includes('?');
      const startsWithWh = /^(what|how|why|when|where|who|which)\b/i.test(text);
      // Question form: auxiliary verb + pronoun (Should I, Can you, etc.)
      const startsWithAux =
        /^(can|could|would|should|will|do|does|did|is|are|was|were) (i|you|we|they|he|she|it|this|that)\b/i.test(
          text,
        );

      return hasQuestionMark || startsWithWh || startsWithAux;
    },
    classification: {
      kind: 'question',
      confidence: 0.92,
      flags: {
        requiresAction: false,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 90-98: AMBIGUOUS CASES
  // Could be multiple things
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 90,
    name: 'ambiguous_note_todo',
    test: (text) => {
      const hasRemember = /\b(remember|note)\b/i.test(text);
      const hasAction = /\b(need to|should|must|call|buy|send|email)\b/i.test(text);
      const hasTime = /\b(tomorrow|today|next|by|at)\b/i.test(text);
      // Ambiguous if has remember + (action OR time), unclear which takes precedence
      return hasRemember && (hasAction || hasTime);
    },
    classification: {
      kind: 'ambiguous',
      confidence: 0.5,
      flags: {
        requiresAction: false, // Let disambiguation UI handle it
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIORITY 999: DEFAULT (LOWEST PRIORITY)
  // Catch-all for everything else
  // ═══════════════════════════════════════════════════════════════
  {
    priority: 999,
    name: 'default_none',
    test: () => true,
    classification: {
      kind: 'none',
      confidence: 0,
      flags: {
        requiresAction: false,
      },
    },
  },
];

/**
 * Classify intent based on centralized rules
 * This is the single source of truth for intent classification
 *
 * @param text - User input text to classify
 * @returns DetectedIntent with kind, confidence, and flags
 */
export function classifyIntent(input: unknown): DetectedIntent {
  // Defensive: coerce input to string and trim
  const text = String(input ?? '').trim();

  // Early return for empty input
  if (!text) {
    return {
      kind: 'none',
      confidence: 0,
      title: '',
      isCommand: false,
      isMetaComment: false,
      suppressChips: false,
      requiresAction: false,
      showDisambiguationToast: false,
    };
  }

  try {
    const normalized = text.toLowerCase();

    // Process rules in priority order
    const sortedRules = [...INTENT_RULES].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (rule.test(normalized)) {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[intentRules] Matched rule:', {
            name: rule.name,
            priority: rule.priority,
            kind: rule.classification.kind,
            text: text.substring(0, 50),
          });
        }

        return {
          kind: rule.classification.kind,
          confidence: rule.classification.confidence,
          title: text,
          isCommand: false, // Default to false
          isMetaComment: false, // Default to false
          suppressChips: false, // Default to false
          showDisambiguationToast: false, // Default to false
          ...rule.classification.flags, // Flags can override defaults
        };
      }
    }

    // Should never reach here due to default rule, but safety fallback
    if (__DEV__) {
      console.warn('[intentRules] No rule matched (should not happen):', text.substring(0, 50));
    }

    return {
      kind: 'none',
      confidence: 0,
      title: text,
      isCommand: false,
      isMetaComment: false,
      suppressChips: false,
      requiresAction: false,
      showDisambiguationToast: false,
    };
  } catch (error) {
    // Fail-safe: if any error occurs, return safe default
    console.error('[intentRules] Error classifying intent:', error);
    return {
      kind: 'none',
      confidence: 0,
      title: text,
      isCommand: false,
      isMetaComment: false,
      suppressChips: false,
      requiresAction: false,
      showDisambiguationToast: false,
    };
  }
}

/**
 * Get human-readable explanation of why a rule matched
 * Useful for debugging and user transparency
 */
export function explainClassification(text: string): string {
  const sortedRules = [...INTENT_RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (rule.test(text.toLowerCase())) {
      return `Matched rule "${rule.name}" (priority ${rule.priority})`;
    }
  }

  return 'No rule matched';
}
