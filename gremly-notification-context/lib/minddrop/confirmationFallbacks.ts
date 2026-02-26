const TODO_FALLBACKS = [
  "This one won't slip away",
  'Consider it on the radar',
  'Future you will see this',
  'Queued up and waiting',
  'Not going anywhere now',
  'Safe on the list',
  "You'll come back to this",
  "Stored for when you're ready",
  'Holding onto this for you',
  "It'll be here when you need it",
];

const HABIT_FALLBACKS = [
  'Starting something good here',
  'One step at a time',
  'Building something that matters',
  'The first rep is the hardest',
  'Showing up is the work',
  'This is how it starts',
  'Rooting for you on this',
  'Small moves, real change',
  'Consistency beats intensity',
  'Here for the long haul',
];

const JOURNAL_FALLBACKS = [
  'Thanks for sharing that',
  "That's worth holding onto",
  'No judgment, just listening',
  'Sometimes saying it helps',
  'Feelings noted, space made',
  'That took courage to write',
  'Sitting with this alongside you',
  'Your words are safe here',
  'Honored you shared that',
  'This matters, even if messy',
];

const IDEA_FALLBACKS = [
  'Spark safely stored away',
  'Worth coming back to later',
  'Letting this one breathe',
  'Could turn into something',
  'Seeds for future thinking',
  'Interesting thread to pull',
  'Tucked away for pondering',
  'The vault of maybes grows',
  'Something to chew on later',
  'Good instinct to capture this',
];

const GENERAL_FALLBACKS = [
  'Tucked away for later',
  'Safe in the vault now',
  'Stored for future reference',
  "This won't get lost",
  'Here when you need it',
  'Filed for safekeeping',
  'Keeping this one handy',
  "Won't disappear on you",
  'Saved and accounted for',
  'Holding onto this one',
];

export function getRandomFallback(bucket: string, subtype?: string | null): string {
  let pool: string[];

  if (bucket === 'todo') {
    pool = TODO_FALLBACKS;
  } else if (bucket === 'habit') {
    pool = HABIT_FALLBACKS;
  } else if (bucket === 'log') {
    if (subtype === 'journal') {
      pool = JOURNAL_FALLBACKS;
    } else if (subtype === 'idea') {
      pool = IDEA_FALLBACKS;
    } else {
      pool = GENERAL_FALLBACKS;
    }
  } else {
    pool = GENERAL_FALLBACKS;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}
