/**
 * Copy bank for Today v2 screen
 * Phase 9: Energy & Momentum
 */

type TimeWindow = 'morning' | 'midday' | 'evening';

/**
 * Returns a greeting based on time of day and user name
 */
export function getGreeting(timeWindow: TimeWindow, name: string = 'James'): string {
  const greetings: Record<TimeWindow, string> = {
    morning: `Morning, ${name} 👋`,
    midday: `Hey, ${name} 👋`,
    evening: `Evening, ${name} 👋`,
  };
  return greetings[timeWindow];
}

/**
 * Returns a contextual subline based on time of day
 */
export function getSubline(timeWindow: TimeWindow): string {
  const sublines: Record<TimeWindow, string[]> = {
    morning: [
      'Small wins add up fast.',
      "Let's make it a great day.",
      'Start strong, finish stronger.',
    ],
    midday: ['Keep the momentum going.', "You're doing great.", 'Progress over perfection.'],
    evening: ['Finish strong.', 'Almost there - keep going.', 'Great progress today.'],
  };

  // Deterministic selection (first in array for now)
  // TODO: Add variation logic in Phase 9 step 2
  return sublines[timeWindow][0];
}
