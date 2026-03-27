/**
 * Builds Gremly's "birthday" context for system prompts.
 * Gremly's birthday = the day this user's account was created.
 * Always includes today's date so Gremly knows the current date.
 */
import { getDateService } from '../date/DateService';
import { format } from 'date-fns';

export function buildBirthdayContext(accountCreatedAt: string | null): string {
  const today = getDateService().now();
  const todayStr = format(today, 'EEEE, MMMM d, yyyy');

  let context = `=== DATE & RELATIONSHIP ===\n`;
  context += `Today is ${todayStr}.\n`;

  if (accountCreatedAt) {
    const birthDate = new Date(accountCreatedAt);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysTogether = Math.floor((today.getTime() - birthDate.getTime()) / msPerDay);

    const birthDateStr = format(birthDate, 'MMMM d, yyyy');

    context += `You were born on ${birthDateStr} (when this user created their account).\n`;
    context += `You've been companions for ${daysTogether} day${daysTogether === 1 ? '' : 's'}.`;
  }

  return context;
}
