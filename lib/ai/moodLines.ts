/**
 * moodLines - Dynamic witty one-liners for Space headers
 * Theme-aware, mood-sensitive, daily-stable selections
 */

export type Mood = 'calm' | 'proud' | 'low' | 'neutral';

type Theme = 'fitness' | 'career' | 'travel' | 'learning' | 'finance' | 'home' | 'neutral';

const LINES: Record<Theme, string[]> = {
  fitness: [
    'Move a little. Breathe a lot.',
    'Consistency looks good on you.',
    'One rep at a time, Cortex style.',
    "Strength isn't speed - it's rhythm.",
    'Running your own program - literally.',
    'Progress over perfection, always.',
  ],
  career: [
    'Strategic brilliance loading...',
    'Your growth curve likes this.',
    'Tiny bets, steady gains.',
    'Make the next hour count.',
    'Build the future, one commit at a time.',
    'Focus now, celebrate later.',
  ],
  travel: [
    "Adventures don't plan themselves.",
    "You handle the tacos; I'll handle the details.",
    'Almost there-sunshine pending.',
    'Pack light, explore deep.',
    'Every trip starts with one brave yes.',
    'Wander wisely.',
  ],
  learning: [
    'Curiosity is the plan.',
    'Read. Note. Repeat.',
    'Knowledge compounds quietly.',
    'Learn slow, understand deep.',
    'Your brain loves this.',
    'Small lessons, big shifts.',
  ],
  finance: [
    'Calm money habits > hot takes.',
    'Small steps, strong foundation.',
    'Your future self says thanks.',
    'Numbers tell stories — listen.',
    'Save first, stress less.',
    'Build wealth one choice at a time.',
  ],
  home: [
    'Home is where the calm starts.',
    'Little routines, big comfort.',
    'Your space, your sanctuary.',
    'Tidy corner, clear mind.',
    'Nesting mode: activated.',
    'Home sweet progress.',
  ],
  neutral: [
    'All clear - your Cortex is grounded.',
    "Let's focus on what matters.",
    'One thing at a time.',
    "You're exactly where you need to be.",
    'Small steps, steady pace.',
    'Progress is happening.',
  ],
};

const MOOD_PREFERENCES: Record<Mood, (lines: string[]) => string[]> = {
  proud: (lines) =>
    lines.filter((l) => /good|brilliant|celebrate|progress|yes/.test(l.toLowerCase())),
  low: (lines) => lines.filter((l) => /calm|breathe|small|little|slow/.test(l.toLowerCase())),
  calm: (lines) => lines.filter((l) => /calm|breathe|clear|grounded|rhythm/.test(l.toLowerCase())),
  neutral: (lines) => lines,
};

/**
 * Detect theme from space name
 */
function detectTheme(spaceName: string): Theme {
  const lower = spaceName.toLowerCase();

  if (/(fitness|run|gym|health|exercise|workout|train)/i.test(lower)) return 'fitness';
  if (/(career|work|job|project|business)/i.test(lower)) return 'career';
  if (/(trip|travel|vacation|adventure|mexico|europe|asia)/i.test(lower)) return 'travel';
  if (/(learn|study|course|read|book|skill)/i.test(lower)) return 'learning';
  if (/(finance|money|budget|invest|saving)/i.test(lower)) return 'finance';
  if (/(home|house|family|nest|room)/i.test(lower)) return 'home';

  return 'neutral';
}

/**
 * Simple deterministic hash from string (for stable daily selection)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a witty one-liner for a Space header
 * @param spaceName - Name of the space (used for theme detection)
 * @param mood - Current mood state
 * @param seed - Seed for stable selection (default: today's date YYYY-MM-DD)
 */
export function getWittyLine(spaceName: string, mood: Mood = 'neutral', seed?: string): string {
  const theme = detectTheme(spaceName);
  const allLines = LINES[theme];

  // Apply mood preference filter
  const filter = MOOD_PREFERENCES[mood];
  let candidates = filter(allLines);

  // Fallback to all lines if filter returned empty
  if (candidates.length === 0) {
    candidates = allLines;
  }

  // Use seed (default: today's date) for stable daily selection
  const dailySeed = seed || new Date().toISOString().slice(0, 10);
  const hashInput = `${spaceName}-${theme}-${dailySeed}`;
  const hash = hashString(hashInput);
  const index = hash % candidates.length;

  return candidates[index];
}
