/**
 * Gremly Speech System
 *
 * Contextual, personality-driven speech for Gremly mascot.
 * Designed for ADHD productivity app - supportive, slightly quirky.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SpeechContext = {
  kind?: string;
  logSubtype?: string;
  confidence?: 'high' | 'medium' | 'low';
  dueDate?: Date | string | null;
  mode?: string;
  dropsToday: number;
  isFirstDrop: boolean;
  hasPhotos: boolean;
  isReturningUser: boolean;
  error?: 'network' | 'ai_failed' | 'generic' | null;
};

export type SpeechCategory =
  | 'greeting'
  | 'success'
  | 'streak'
  | 'photo'
  | 'error'
  | 'empty'
  | 'returning';

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level state for avoiding repetition
// ─────────────────────────────────────────────────────────────────────────────

const recentMessages: string[] = [];
const MAX_RECENT = 3;

function trackMessage(message: string): void {
  recentMessages.push(message);
  if (recentMessages.length > MAX_RECENT) {
    recentMessages.shift();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function pickRandom<T>(options: T[], exclude?: T[]): T {
  const filtered = exclude ? options.filter((opt) => !exclude.includes(opt)) : options;
  const pool = filtered.length > 0 ? filtered : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calculateDuration(message: string): number {
  const base = 2500;
  const perChar = 40;
  const max = 5000;
  return Math.min(base + message.length * perChar, max);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech Pools
// ─────────────────────────────────────────────────────────────────────────────

const SPEECH_POOLS = {
  GREETINGS: {
    morning: [
      "Morning! What's floating around up there?",
      "New day, fresh start. What's on your mind?",
      "Coffee thoughts? Drop 'em here.",
      'Morning brain dump time?',
      "What's brewing today?",
    ],
    afternoon: [
      "Afternoon check-in. What's up?",
      'Midday brain clear?',
      "What's rattling around in there?",
      'Quick drop before you forget?',
      'Caught something? Drop it.',
    ],
    evening: [
      "Winding down? Let's capture what's left.",
      'Evening brain sweep?',
      "Before it escapes — what's on your mind?",
      'Last thoughts of the day?',
      'Anything lingering?',
    ],
    night: [
      'Late night thoughts?',
      "Can't sleep? Drop it here.",
      "Night owl mode. What's up?",
      'Get it out of your head.',
      "Brain won't quiet down? I got you.",
    ],
  },

  SUCCESS_HIGH_CONFIDENCE: {
    todo_with_date: [
      "Locked in for {date}. You won't forget.",
      'On your radar for {date}.',
      "{date} — it's handled.",
      'Scheduled. Future you says thanks.',
      'Pinned to {date}. Done.',
    ],
    todo_no_date: [
      "Captured! When's it due?",
      'Got it. Give it a date in Sweep?',
      'Task saved. Timing TBD.',
      "Added. Don't forget to date it!",
      'Safe with me. Set a deadline?',
    ],
    habit: [
      'New habit, who dis?',
      "Habit locked in. Let's build it.",
      'Tracking starts now.',
      'One step at a time. Habit saved.',
      'Consistency starts here.',
      "Habit planted. Let's grow it.",
    ],
    journal: [
      'Noted. Your future self might thank you.',
      'Journal entry safe.',
      'Captured that moment.',
      'Written down, weight lifted?',
      "Journaled. How's that feel?",
      'Thought preserved.',
    ],
    idea: [
      'Ooh, idea captured!',
      'Interesting... saved.',
      'Idea banked. Revisit anytime.',
      "That's a good one. Saved.",
      'Spark captured ✨',
      'Filed under: brilliant ideas.',
    ],
    general: ['Got it.', 'Safe with me.', 'Noted!', 'Captured.', 'Done.', 'Tucked away.'],
  },

  SUCCESS_MEDIUM_CONFIDENCE: [
    'Saved! I made my best guess — check it in Sweep.',
    'Got it. Might need a tweak — peek at Sweep?',
    'Captured, but double-check my work?',
    'Saved. I took a guess on the type.',
    'Done! Review in Sweep if I got it wrong.',
  ],

  SUCCESS_LOW_CONFIDENCE: [
    "Saved to your inbox. Sort it when you're ready.",
    'Captured! Not sure what it is yet — you decide.',
    'Safe for now. Sweep will help you sort it.',
    "Got it. Let's figure out what it is later.",
    'Tucked away. No rush to categorize.',
  ],

  STREAKS: {
    3: [
      "That's 3 today. Nice rhythm!",
      "Third one! You're on a roll.",
      '3 and counting. Keep going!',
    ],
    5: [
      "5 drops! Brain's getting lighter.",
      "High five — that's 5 today!",
      'Halfway to double digits!',
    ],
    10: [
      '10 drops! Your brain must feel clearer.',
      "Double digits! You're crushing it.",
      "10! That's some serious brain-clearing.",
    ],
    every5after: ['Another 5! Unstoppable.', '{count} drops today. Legend.'],
  },

  PHOTO: {
    with_text: [
      'Photo + context = perfect capture.',
      'Visual memory saved.',
      'Got the pic! Good call adding notes.',
      'Screenshot brain activated.',
    ],
  },

  ERRORS: {
    network: [
      "Hmm, no signal. Saved locally — I'll sync when we're back.",
      "Offline mode activated. Don't worry, I've got it.",
      'Connection hiccup. Saved it anyway!',
    ],
    ai_failed: [
      'Saved, but my brain glitched. Check it in Sweep?',
      "Got it! My sorter broke — you'll need to file this one.",
      "Saved to your inbox. I couldn't figure out where it goes.",
    ],
    generic: [
      'Something went weird. Try again?',
      'Oops. Mind dropping that again?',
      'Glitch! One more time?',
    ],
  },

  FIRST_DROP: [
    'First drop! This is where the magic starts.',
    "Welcome! Just drop whatever's on your mind.",
    "Your brain's new best friend. Drop anything.",
  ],

  RETURNING_USER: [
    "Hey, welcome back! What's accumulated?",
    "Missed you! What's been piling up?",
    "Back again! Let's clear some headspace.",
    'There you are! Brain full?',
  ],

  EMPTY_STATE: [
    'All clear! ...for now.',
    'Inbox zero! Enjoy it while it lasts.',
    "Nothing here yet. What's on your mind?",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Speech Function
// ─────────────────────────────────────────────────────────────────────────────

export function getGremlySpeech(ctx: SpeechContext): { message: string; duration: number } | null {
  let message: string | null = null;

  // Priority 1: Errors
  if (ctx.error) {
    const errorPool = SPEECH_POOLS.ERRORS[ctx.error] || SPEECH_POOLS.ERRORS.generic;
    message = pickRandom(errorPool, recentMessages);
  }

  // Priority 2: Streaks (3, 5, 10, then every 5 after)
  if (!message && ctx.dropsToday > 0) {
    const count = ctx.dropsToday;
    if (count === 3) {
      message = pickRandom(SPEECH_POOLS.STREAKS[3], recentMessages);
    } else if (count === 5) {
      message = pickRandom(SPEECH_POOLS.STREAKS[5], recentMessages);
    } else if (count === 10) {
      message = pickRandom(SPEECH_POOLS.STREAKS[10], recentMessages);
    } else if (count > 10 && count % 5 === 0) {
      message = pickRandom(SPEECH_POOLS.STREAKS.every5after, recentMessages);
      message = message.replace('{count}', String(count));
    }
  }

  // Priority 3: Photo drops
  if (!message && ctx.hasPhotos) {
    message = pickRandom(SPEECH_POOLS.PHOTO.with_text, recentMessages);
  }

  // Priority 4: First drop ever
  if (!message && ctx.isFirstDrop) {
    message = pickRandom(SPEECH_POOLS.FIRST_DROP, recentMessages);
  }

  // Priority 5: Returning user (>24h)
  if (!message && ctx.isReturningUser) {
    message = pickRandom(SPEECH_POOLS.RETURNING_USER, recentMessages);
  }

  // Priority 6: Success by confidence
  if (!message) {
    const confidence = ctx.confidence || 'high';

    if (confidence === 'low') {
      message = pickRandom(SPEECH_POOLS.SUCCESS_LOW_CONFIDENCE, recentMessages);
    } else if (confidence === 'medium') {
      message = pickRandom(SPEECH_POOLS.SUCCESS_MEDIUM_CONFIDENCE, recentMessages);
    } else {
      // High confidence - pick by kind
      const kind = ctx.kind || 'general';
      const hasDueDate = ctx.dueDate != null;

      let pool: string[];

      if (kind === 'todo' || kind === 'task') {
        pool = hasDueDate
          ? SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.todo_with_date
          : SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.todo_no_date;
      } else if (kind === 'habit') {
        pool = SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.habit;
      } else if (kind === 'journal' || kind === 'log') {
        pool = SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.journal;
      } else if (kind === 'idea') {
        pool = SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.idea;
      } else {
        pool = SPEECH_POOLS.SUCCESS_HIGH_CONFIDENCE.general;
      }

      message = pickRandom(pool, recentMessages);

      // Replace {date} placeholder
      if (message.includes('{date}') && ctx.dueDate) {
        message = message.replace('{date}', formatDate(ctx.dueDate));
      }
    }
  }

  if (!message) return null;

  trackMessage(message);

  return {
    message,
    duration: calculateDuration(message),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getGreetingSpeech(): { message: string; duration: number } {
  const timeOfDay = getTimeOfDay();
  const pool = SPEECH_POOLS.GREETINGS[timeOfDay];
  const message = pickRandom(pool, recentMessages);
  trackMessage(message);
  return {
    message,
    duration: calculateDuration(message),
  };
}

export function getEmptyStateSpeech(): { message: string; duration: number } {
  const message = pickRandom(SPEECH_POOLS.EMPTY_STATE, recentMessages);
  trackMessage(message);
  return {
    message,
    duration: calculateDuration(message),
  };
}
