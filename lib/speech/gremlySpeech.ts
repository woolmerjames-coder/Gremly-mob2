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

import { getDateService } from '../date/DateService';
import { format } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SpeechContext = {
  // Moment
  moment: 'greeting' | 'return' | 'post_drop';

  // Drop info (post_drop only)
  kind?: string;
  logSubtype?: string;
  dueDate?: Date | string | null;
  dropsToday: number;
  isFirstDrop: boolean;
  hasPhotos: boolean;
  isReturningUser: boolean;
  error?: 'network' | 'ai_failed' | 'generic' | null;

  // Gauge
  gaugeValue: number;
  isFedToday: boolean;

  // Timing
  timeSinceLastDrop: number | null;

  // DCO
  briefHeadline: string | null;
  tone: 'relaxed' | 'focused' | 'stretched' | 'recovering' | 'celebratory' | null;
  overdueTodos: number;
  habitStreakRisk: string[];
  upcomingIn7d: (string | { date: string; title: string })[];
  daysSinceLastSweep: number | null;

  // Previous speech (for return cooldown / dedup)
  lastSpeechTime: number | null;
};

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
  const hour = getDateService().now().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d');
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
      "Done. {date}. You don't need to think about this anymore.",
      "{date}, locked in. That one's off your plate.",
      "Set for {date}. I'll worry about it, you won't.",
      'Pinned to {date}. Go forget about it.',
      "{date}. It's handled. Next?",
    ],
    todo_no_date: [
      "Got it. We'll figure out when later.",
      'Saved. No date yet, no pressure.',
      "Parked. We'll add a date in the Sweep.",
      "Caught. Whenever you're ready.",
      "That's mine now. Timing can wait.",
    ],
    habit: [
      "I'll keep track of that one.",
      "Noted. I'll check in on this.",
      "Got it. That's on my list now.",
      "Tracked. Show up and I'll notice.",
      "On it. I'll remind you.",
    ],
    journal: ['Heard.', 'Saved.', "Got it. That's between us.", 'Written down.', 'Safe with me.'],
    idea: [
      "Oh, that's interesting. Saved.",
      'Spark caught. Let it sit for a while.',
      "Filed. You'll want to come back to this.",
      "Good instinct. I'll hold onto it.",
      "Noted. This one's got legs.",
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

  MILESTONES: {
    3: ["Three drops today. You're warming up.", "That's three drops. Brain's loosening up."],
    5: [
      'Five drops today. Your head must feel lighter.',
      "That's five drops out of your brain and into mine.",
    ],
    10: [
      'Ten drops today. That was a lot to carry.',
      'Ten drops. You were holding more than you realized.',
    ],
    every5after: ['{count} drops today. You had a lot in there.', '{count} drops. Clearing house.'],
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
    "You're back. And that's already saved.",
    'Hey. Caught it. What else you been sitting on?',
    "There you are. First one's down, keep going.",
    'Welcome back. Got it. What else?',
    "Been a minute. That one's safe, what's next?",
  ],

  EMPTY_STATE: [
    'All clear! …for now.',
    'Nothing here. Enjoy the calm.',
    'Clean slate. What\u2019s on your mind?',
  ],

  UPCOMING: [
    '{eventName} is coming up this week.',
    "Don't forget, {eventName} is in a few days.",
    '{eventName} is on the horizon.',
  ],

  GAUGE_GREETING: [
    "You're nearly fed for the day. A couple more drops.",
    'Almost fed. Not far to go.',
    "Close to fed. A few more and you're done.",
  ],

  SWEEP_NUDGE: {
    short: [
      "I've been collecting things. Sweep when you're ready.",
      'A few days of drops sitting here. Want to sort through them?',
      "Stuff's been piling up. Sweep whenever.",
    ],
    long: [
      "I've got a decent pile for you. Sweep when you get a chance.",
      'Lot of drops stacked up. Good Sweep session waiting.',
      "There's a solid backlog here. No rush, but Sweep's ready.",
    ],
  },

  RAPID_FIRE: [
    'And another one. Keep going.',
    'Got it. Next?',
    'Caught. What else?',
    'Yep. Keep clearing.',
    "In. Don't stop.",
    "That's mine. What's next?",
    'Another one down.',
  ],

  GAUGE_POST_DROP: {
    high: [
      "Got it. I'm nearly fed for the day.",
      "Saved. A few more drops and I'm fed.",
      'Caught. Getting close to fed.',
    ],
    very_high: [
      "Got it. One or two more and I'm fed.",
      'Saved. So close to being fed.',
      'Nearly fed. Keep going.',
    ],
  },

  BRAND: [
    "That's one less thing to carry.",
    "Out of your head. That's the whole point.",
    "You don't have to remember that anymore.",
    'Gone from your brain. Safe with me.',
    "That's not your problem to hold anymore.",
    "Your head's lighter now.",
    "I've got it. Let it go.",
    "One more thing you don't have to think about.",
  ],

  RETURN: {
    gauge_progress: ["You've made progress. Nearly fed.", 'Closer to fed since last time.'],
    upcoming: ['{eventName} coming up. Just so you know.', 'Reminder: {eventName} this week.'],
    sweep_nudge: [
      "Still got drops to sort. Sweep's there when you want it.",
      'A few things waiting in Sweep.',
    ],
    time_shift: {
      afternoon: [
        'Afternoon. What slipped through the cracks?',
        'Midday. Anything rattling around?',
      ],
      evening: ['Evening. Last chance to dump anything.', 'Winding down. Get it out of your head.'],
    },
  },

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
    'That\u2019s {age} whole levels of wisdom. You can tell, right?',
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
  const isStretched = ctx.tone === 'stretched' || ctx.tone === 'recovering';

  // Priority 1: Errors
  if (ctx.error) {
    const errorPool = SPEECH_POOLS.ERRORS[ctx.error] || SPEECH_POOLS.ERRORS.generic;
    message = pickRandom(errorPool, recentMessages);
  }

  // Priority 2: Milestones (3, 5, 10, every 5 after)
  if (!message && ctx.dropsToday > 0) {
    const count = ctx.dropsToday;
    let milestonePool = (SPEECH_POOLS.MILESTONES as Record<number, string[]>)[count];
    if (!milestonePool && count > 10 && count % 5 === 0) {
      milestonePool = SPEECH_POOLS.MILESTONES.every5after;
    }
    if (milestonePool) {
      message = pickRandom(milestonePool, recentMessages);
      if (message.includes('{count}')) {
        message = message.replace('{count}', String(count));
      }
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

  // Priority 6: Rapid-fire (fast successive drops)
  if (
    !message &&
    !isStretched &&
    ctx.timeSinceLastDrop != null &&
    ctx.timeSinceLastDrop < 120 &&
    ctx.dropsToday >= 3 &&
    Math.random() < 0.4
  ) {
    message = pickRandom(SPEECH_POOLS.RAPID_FIRE, recentMessages);
  }

  // Priority 7: Gauge post-drop callout (nearly fed)
  if (
    !message &&
    !isStretched &&
    !ctx.isFedToday &&
    ctx.gaugeValue >= 0.75 &&
    Math.random() < 0.25
  ) {
    const gaugePool =
      ctx.gaugeValue >= 0.9
        ? SPEECH_POOLS.GAUGE_POST_DROP.very_high
        : SPEECH_POOLS.GAUGE_POST_DROP.high;
    message = pickRandom(gaugePool, recentMessages);
  }

  // Priority 8: Brand reinforcement
  if (!message && !isStretched) {
    const brandChance = ctx.tone === 'celebratory' ? 0.35 : 0.2;
    if (Math.random() < brandChance) {
      message = pickRandom(SPEECH_POOLS.BRAND, recentMessages);
    }
  }

  // Priority 9: Success by kind (fallback)
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

/** @deprecated Use getGreetingSpeechV2 instead */
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
 * @deprecated Use getGreetingSpeechV2 instead
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

/**
 * Context-aware greeting with priority waterfall:
 * briefHeadline → UPCOMING → GAUGE_GREETING → SWEEP_NUDGE → time-of-day GREETINGS
 */
export function getGreetingSpeechV2(ctx: SpeechContext): { message: string; duration: number } {
  let message: string | null = null;

  // Priority 1: DCO brief headline
  if (ctx.briefHeadline) {
    message = ctx.briefHeadline;
  }

  // Priority 2: Upcoming events this week
  if (!message && ctx.upcomingIn7d.length > 0) {
    const template = pickRandom(SPEECH_POOLS.UPCOMING, recentMessages);
    const first = ctx.upcomingIn7d[0];
    const eventName = typeof first === 'string' ? first : first.title;
    message = template.replace('{eventName}', eventName);
  }

  // Priority 3: Gauge nearly fed
  if (!message && !ctx.isFedToday && ctx.gaugeValue >= 0.6) {
    message = pickRandom(SPEECH_POOLS.GAUGE_GREETING, recentMessages);
  }

  // Priority 4: Sweep nudge
  if (!message && ctx.daysSinceLastSweep != null && ctx.daysSinceLastSweep >= 3) {
    const sweepPool =
      ctx.daysSinceLastSweep >= 7 ? SPEECH_POOLS.SWEEP_NUDGE.long : SPEECH_POOLS.SWEEP_NUDGE.short;
    message = pickRandom(sweepPool, recentMessages);
  }

  // Fallback: time-of-day greeting
  if (!message) {
    const timeOfDay = getTimeOfDay();
    message = pickRandom(SPEECH_POOLS.GREETINGS[timeOfDay], recentMessages);
  }

  trackMessage(message);
  return {
    message,
    duration: calculateDuration(message),
  };
}

/**
 * Return speech for when user re-opens the app mid-session.
 * 5-minute cooldown — returns null if too soon after last speech.
 * Waterfall: gauge_progress → upcoming → sweep_nudge → time_shift → null
 */
export function getReturnSpeech(ctx: SpeechContext): { message: string; duration: number } | null {
  // 5-minute cooldown
  if (
    ctx.lastSpeechTime != null &&
    getDateService().now().getTime() - ctx.lastSpeechTime < 5 * 60 * 1000
  ) {
    return null;
  }

  let message: string | null = null;

  // Priority 1: Gauge progress
  if (!ctx.isFedToday && ctx.gaugeValue >= 0.5) {
    message = pickRandom(SPEECH_POOLS.RETURN.gauge_progress, recentMessages);
  }

  // Priority 2: Upcoming event reminder
  if (!message && ctx.upcomingIn7d.length > 0) {
    const template = pickRandom(SPEECH_POOLS.RETURN.upcoming, recentMessages);
    const first = ctx.upcomingIn7d[0];
    const eventName = typeof first === 'string' ? first : first.title;
    message = template.replace('{eventName}', eventName);
  }

  // Priority 3: Sweep nudge
  if (!message && ctx.daysSinceLastSweep != null && ctx.daysSinceLastSweep >= 3) {
    message = pickRandom(SPEECH_POOLS.RETURN.sweep_nudge, recentMessages);
  }

  // Priority 4: Time shift (different time of day than last visit)
  if (!message) {
    const timeOfDay = getTimeOfDay();
    const timeShiftPool = (SPEECH_POOLS.RETURN.time_shift as Record<string, string[]>)[timeOfDay];
    if (timeShiftPool) {
      message = pickRandom(timeShiftPool, recentMessages);
    }
  }

  if (!message) return null;

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
