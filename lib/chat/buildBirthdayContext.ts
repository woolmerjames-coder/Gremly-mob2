/**
 * Builds Gremly's "birthday" context for system prompts.
 * Gremly's birthday = the day this user's account was created.
 * Always includes today's date so Gremly knows the current date.
 */
export function buildBirthdayContext(accountCreatedAt: string | null): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  let context = `=== DATE & RELATIONSHIP ===\n`;
  context += `Today is ${todayStr}.\n`;

  if (accountCreatedAt) {
    const birthDate = new Date(accountCreatedAt);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysTogether = Math.floor((today.getTime() - birthDate.getTime()) / msPerDay);

    const birthDateStr = birthDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    context += `You were born on ${birthDateStr} (when this user created their account).\n`;
    context += `You've been companions for ${daysTogether} day${daysTogether === 1 ? '' : 's'}.`;
  }

  return context;
}
