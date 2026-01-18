/**
 * Builds Gremly's "birthday" context for system prompts.
 * Gremly's birthday = the day this user's account was created.
 */
export function buildBirthdayContext(accountCreatedAt: string | null): string {
  if (!accountCreatedAt) return '';

  const birthDate = new Date(accountCreatedAt);
  const today = new Date();

  // Calculate days together
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTogether = Math.floor((today.getTime() - birthDate.getTime()) / msPerDay);

  // Format birth date nicely
  const birthDateStr = birthDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Build context string
  let context = `=== RELATIONSHIP ===\n`;
  context += `You were born on ${birthDateStr} (when this user created their account).\n`;
  context += `You've been companions for ${daysTogether} day${daysTogether === 1 ? '' : 's'}.\n`;
  context += `Use this naturally if relevant—anniversaries, reflecting on progress, etc.—but don't force it.`;

  return context;
}
