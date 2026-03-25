/**
 * Gremly Speech System v2
 *
 * Contextual, personality-driven speech for Gremly mascot.
 * Designed for ADHD productivity app - warm, clever, never generic.
 *
 * Principles:
 * - Every message should feel like it was written for THIS drop
 * - Short enough to read in a glance, memorable enough to screenshot
 * - Never robotic ("Captured." "Noted.") — always has a point of view
 * - Celebrates without being condescending
 * - References the ADHD brain fondly, never clinically
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
const MAX_RECENT = 4;

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
  // Longer base + per-char so speech stays visible long enough to read
  const base = 5000;
  const perChar = 50;
  const max = 8000;
  return Math.min(base + message.length * perChar, max);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech Pools
// ─────────────────────────────────────────────────────────────────────────────

const SPEECH_POOLS = {
  GREETINGS: {
    morning: [
      'Morning! What\u2019s on your mind?',
      'Fresh brain, fresh page.',
      'Good morning. I\u2019m ready when you are.',
      'Let\u2019s get ahead of the day.',
      'Catch it before coffee wears off.',
    ],
    afternoon: [
      'Afternoon. What slipped through the cracks?',
      'Before you forget — drop it here.',
      'Midday mind clear. Go.',
      'That thing you keep thinking about? Drop it.',
      'Caught something? I\u2019ll hold it.',
    ],
    evening: [
      'Wind down. Get it out of your head.',
      'Evening brain sweep — I\u2019ll catch everything.',
      'Almost done. What\u2019s still bouncing around?',
      'Last call for loose thoughts.',
      'Tomorrow-you will thank tonight-you.',
    ],
    night: [
      'Can\u2019t sleep? Drop it, then rest.',
      'Late thoughts are welcome here.',
      'Get it out, then let it go.',
      'Night owl mode. I\u2019ll remember, you don\u2019t have to.',
      'Brain won\u2019t quiet down? That\u2019s what I\u2019m here for.',
    ],
  },

  SUCCESS: {
    todo_with_date: [
      'Locked in for {date}. One less thing to hold.',
      '{date} — handled. Let it go.',
      'On the calendar for {date}. Brain, released.',
      'Future you already feels lighter. {date}, done.',
      '{date}. You won\u2019t have to remember this.',
    ],
    todo_no_date: [
      'Got it. When do you want to do this?',
      'Saved. Pick a day when you\u2019re ready.',
      'Held for you. No rush on the timing.',
      'Parked it. Sweep will ask about timing.',
      'One less thing in your head.',
    ],
    habit: [
      'Habit planted. Let\u2019s see it grow.',
      'Day one starts now.',
      'Small and steady. That\u2019s how it sticks.',
      'Routine in progress. I\u2019ll be tracking.',
      'The hardest part is starting. You just did.',
    ],
    journal: [
      'Heard. Thanks for sharing that.',
      'Written down, weight lifted.',
      'That took honesty. Saved.',
      'Your words, safe with me.',
      'Journaled. That matters more than you think.',
    ],
    idea: [
      'Ooh. That one has potential.',
      'Idea saved. Marinate on it.',
      'Filed under: things worth revisiting.',
      'Good instinct. I\u2019ll keep it warm for you.',
      'Spark saved. Come back to it fresh.',
    ],
    event: [
      'On the radar. You won\u2019t miss it.',
      'Marked. I\u2019ll make sure it shows up.',
      'Event captured. One less thing to juggle.',
    ],
    general: [
      'Grabbed it.',
      'Safe with me.',
      'One less thing in your head.',
      'I\u2019ll hold that for you.',
      'Out of your brain, into mine.',
    ],
  },

  SUCCESS_MEDIUM_CONFIDENCE: [
    'Saved — I took my best guess. Peek at Sweep.',
    'Got it! Might need a small tweak later.',
    'Held for you. Double-check my sorting in Sweep.',
    'Saved. If I got the type wrong, Sweep has your back.',
    'Done! I guessed, but you know best.',
  ],

  SUCCESS_LOW_CONFIDENCE: [
    'Caught it. You sort, I\u2019ll wait.',
    'Safe for now. No rush to organize.',
    'Held in your inbox. Sort whenever.',
    'Saved. Figure out what it is later — no pressure.',
    'Brain dump complete. Sorting can wait.',
  ],

  MILESTONES: {
    3: [
      'Three in a row. That\u2019s a rhythm.',
      'Look at you go. That\u2019s three.',
      'Hat trick. Keep clearing.',
    ],
    5: [
      'Five drops. Your brain\u2019s gotta feel lighter.',
      'Five! That\u2019s a proper brain dump.',
      'Halfway to double digits. Keep going.',
    ],
    10: [
      'Ten. That\u2019s some serious headspace clearing.',
      'Double digits! Your brain thanks you.',
      'Ten drops. You were holding a lot.',
    ],
    every5after: [
      '{count} drops today. You\u2019re unstoppable.',
      '{count}. At this point you\u2019re just showing off.',
    ],
  },

  PHOTO: {
    with_text: [
      'Photo + words = perfect capture.',
      'Visual receipt saved.',
      'Picture\u2019s worth a thousand words. You gave me both.',
      'Screenshot brain, activated.',
    ],
  },

  ERRORS: {
    network: [
      'Offline? No worries. Saved locally, I\u2019ll sync later.',
      'Connection\u2019s shaky, but I\u2019ve got it. Will sync soon.',
      'Saved on your device. I\u2019ll upload when signal\u2019s back.',
    ],
    ai_failed: [
      'Saved, but my brain hiccuped. Sort it in Sweep?',
      'Got it! My classifier stumbled — you decide the type.',
      'Saved to inbox. I\u2019ll let you file this one.',
    ],
    generic: [
      'Something went sideways. Try that again?',
      'Weird glitch. One more time?',
      'That didn\u2019t land. Mind trying again?',
    ],
  },

  FIRST_DROP: [
    'First drop ever! This is where it all starts.',
    'Your first one! Just drop whatever\u2019s on your mind.',
    'And so it begins. Drop anything, anytime.',
  ],

  RETURNING_USER: [
    'You\u2019re back! What\u2019s been piling up?',
    'Missed you. Brain full?',
    'Welcome back. Let\u2019s clear some headspace.',
    'Hey again! What\u2019s been rattling around in there?',
  ],

  EMPTY_STATE: [
    'All clear! …for now.',
    'Nothing here. Enjoy the calm.',
    'Clean slate. What\u2019s on your mind?',
  ],

  MORNING_BRIEF: {
    prompt: [
      'Good morning! What\u2019s your One Thing today?',
      'New day. What matters most?',
      'Morning! Let\u2019s pick a focus.',
      'Rise and plan. What\u2019s the priority?',
      'What would make today feel like a win?',
    ],
    complete: [
      'Locked in. Go make it happen.',
      'That\u2019s the plan. You\u2019ve got this.',
      'Day\u2019s set. Now just do the next thing.',
      'Focused and ready. Let\u2019s go.',
      'Great call. Today\u2019s yours.',
    ],
    skip: [
      'No pressure. I\u2019m here when you\u2019re ready.',
      'All good. Come find me when you want to plan.',
      'Skipped for now. You know where I am.',
    ],
  },

  FED_CELEBRATION: {
    days_remaining_2: [
      'Full for the day. Two more like this and I level up.',
      'Brain cleared, belly full. Two more fed days and I grow.',
      'That\u2019s today sorted. Feed me two more days and watch what happens.',
      'Done. Everything\u2019s safe with me. Two more fed days to level up.',
    ],
    days_remaining_1: [
      'Full again. One more fed day and I level up.',
      'Two down. Feed me one more day and I grow.',
      'Back to back. One more and I hit a new age.',
      'Twice fed. One more day like this and I evolve.',
    ],
    days_remaining_0: [
      'Full. And I feel... different.',
      'Something\u2019s happening...',
      'That did it.',
    ],
  },

  POST_AGE_UP: [
    'Age {age}. Do I look different? I feel different.',
    'Age {age} and thriving. Honestly? I\u2019m impressed with me.',
    'Look at me. Age {age}. Growing up right before your eyes.',
    'Age {age}. I\u2019d thank you but I did most of the growing.',
    'That\u2019s {age} whole days of wisdom. You can tell, right?',
    'Age {age}! I need a moment. ...OK I\u2019m good.',
    'Age {age}. Someone throw me a party. Oh wait, this IS the party.',
    'I just aged. In a good way. Age {age}, baby.',
    '{age}?! When did THAT happen?',
    'Age {age}. Still cute though.',
    'Age {age}. We\u2019re doing this together.',
    'Grew again. Age {age}. Thanks for feeding me.',
    'Age {age}. Every drop got me here.',
    'Age {age}. Not bad for a little brain gremlin.',
    'Age {age}. I\u2019ve seen things. Mostly your to-do lists.',
    'Age {age}. I remember when I was a hatchling. Actually, I don\u2019t. But still.',
    'Age {age}. Starting to feel wise. Don\u2019t quiz me though.',
    'Age {age}. At this point I\u2019m basically your elder.',
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

  // Priority 2: Milestones (5 and 10 only)
  if (!message && ctx.dropsToday > 0) {
    const count = ctx.dropsToday;
    const milestonePool = (SPEECH_POOLS.MILESTONES as Record<number, string[]>)[count];
    if (milestonePool) {
      message = pickRandom(milestonePool, recentMessages);
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

  // Priority 6: Success by kind
  if (!message) {
    const kind = ctx.kind || 'general';
    const logSubtype = ctx.logSubtype || '';
    const hasDueDate = ctx.dueDate != null;

    let pool: string[];

    if (kind === 'todo' || kind === 'task') {
      pool = hasDueDate ? SPEECH_POOLS.SUCCESS.todo_with_date : SPEECH_POOLS.SUCCESS.todo_no_date;
    } else if (kind === 'habit') {
      pool = SPEECH_POOLS.SUCCESS.habit;
    } else if (kind === 'journal' || (kind === 'log' && logSubtype === 'journal')) {
      pool = SPEECH_POOLS.SUCCESS.journal;
    } else if (kind === 'idea' || logSubtype === 'idea') {
      pool = SPEECH_POOLS.SUCCESS.idea;
    } else if (kind === 'event' || logSubtype === 'event') {
      pool = SPEECH_POOLS.SUCCESS.event;
    } else if (kind === 'log') {
      pool = SPEECH_POOLS.SUCCESS.general;
    } else {
      pool = SPEECH_POOLS.SUCCESS.general;
    }

    message = pickRandom(pool, recentMessages);

    // Replace {date} placeholder
    if (message.includes('{date}') && ctx.dueDate) {
      message = message.replace('{date}', formatDate(ctx.dueDate));
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

/**
 * Get greeting speech with DCO awareness.
 * If the DCO has a brief_headline, use it as Gremly's greeting.
 * Otherwise fall back to the existing heuristic greeting.
 */
export function getDcoGreetingSpeech(briefHeadline: string | null): {
  message: string;
  duration: number;
} {
  // If DCO has a specific headline, use it
  if (briefHeadline) {
    trackMessage(briefHeadline);
    return {
      message: briefHeadline,
      duration: calculateDuration(briefHeadline),
    };
  }

  // Fall back to existing time-of-day heuristic
  return getGreetingSpeech();
}

export function getEmptyStateSpeech(): { message: string; duration: number } {
  const message = pickRandom(SPEECH_POOLS.EMPTY_STATE, recentMessages);
  trackMessage(message);
  return {
    message,
    duration: calculateDuration(message),
  };
}

export function getFirstVisitSpeech(): { message: string; duration: number } {
  const message =
    "Here we go! Drop your first thought below. A task, a reminder, anything. I'll take it from there.";
  return {
    message,
    duration: 15000, // Stay visible until user acts — long duration as fallback
  };
}

export function getMorningBriefSpeech(event: 'prompt' | 'complete' | 'skip'): {
  message: string;
  duration: number;
} {
  const pool = SPEECH_POOLS.MORNING_BRIEF[event];
  const message = pickRandom(pool, recentMessages);
  trackMessage(message);
  return {
    message,
    duration: calculateDuration(message),
  };
}

export function getFedCelebrationSpeech(fedDaysCount: number): {
  message: string;
  duration: number;
  variant: 'celebration';
} {
  const daysRemaining = 2 - fedDaysCount;
  const key =
    daysRemaining >= 2
      ? 'days_remaining_2'
      : daysRemaining === 1
        ? 'days_remaining_1'
        : 'days_remaining_0';
  const pool = SPEECH_POOLS.FED_CELEBRATION[key];
  const message = pickRandom(pool, recentMessages);
  trackMessage(message);
  return {
    message,
    duration: 5000,
    variant: 'celebration' as const,
  };
}

export function getPostAgeUpSpeech(newAge: number): {
  message: string;
  duration: number;
  variant: 'celebration';
} {
  const template = pickRandom(SPEECH_POOLS.POST_AGE_UP, recentMessages);
  const message = template.replace(/\{age\}/g, String(newAge));
  trackMessage(message);
  return {
    message,
    duration: 5000,
    variant: 'celebration' as const,
  };
}
