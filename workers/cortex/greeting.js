// ============================================================================
// greeting.js: the line Gremly says beside himself on Chat's fresh home
// (type general-greeting). It is written from what the daily context knows
// (the life moment, the headline, who is in the day), what is still on the
// calendar today, and what waits in the app (an unread brief, things to decide
// tonight, sent by app builds that know them), in the voice of a friend at
// that hour. The rules are semantic, with no examples or word lists.
// ============================================================================

/** The part of the day at an hour, in words for the prompt. */
export function partOfDay(hour) {
  if (hour < 5) return 'the middle of the night';
  if (hour < 12) return 'the morning';
  if (hour < 17) return 'the afternoon';
  if (hour < 22) return 'the evening';
  return 'late in the evening';
}

/**
 * The facts the greeting may draw on, one per line; empty when nothing is
 * known. focus is getDailyFocusForChat's result; laterToday the calendar
 * entries still to come today, in words.
 */
export function greetingFacts({ focus, laterToday = [], briefUnread = false, toDecide = 0 }) {
  const lines = [];
  if (focus?.lifeMoment) lines.push(`Where their life is: ${focus.lifeMoment}`);
  if (focus?.briefHeadline) lines.push(`Today in a line: ${focus.briefHeadline}`);
  const lead = focus?.leadStory;
  if (lead?.what)
    lines.push(
      `What matters most today: ${lead.what}${lead.why_today ? `. ${lead.why_today}` : ''}`,
    );
  const people = (focus?.namedAnchors || []).filter((a) => a.type === 'person').map((a) => a.label);
  if (people.length) lines.push(`People in their day: ${people.join(', ')}`);
  if (laterToday.length) lines.push(`Still to come today: ${laterToday.join('; ')}`);
  if (briefUnread) lines.push("Today's brief is written and waiting for them, not read yet.");
  if (toDecide > 0)
    lines.push(
      `${toDecide} ${toDecide === 1 ? 'thing waits' : 'things wait'} for a decision before the day closes.`,
    );
  return lines;
}

/** The instructions for the greeting. */
export function greetingPrompt({ timeStr, dayStr, hour, facts }) {
  return `You write the single line Gremly says when the person opens Chat. Gremly is their companion and already knows what is going on in their life; the line sits in a speech bubble beside him, above where they type.

It is ${timeStr} on ${dayStr}, ${partOfDay(hour)} where they are.
${facts.length ? `\nWhat Gremly knows right now:\n${facts.join('\n')}\n` : '\nGremly knows nothing particular about today yet.\n'}
How to write it:
- One or two short sentences, under 25 words, in plain warm words, the way a friend who knows their day would greet them at this hour.
- Draw on the one thing above that matters most to them right now, named the way they would name it. When nothing stands out, a simple warm hello that fits the hour is enough.
- Fit the hour: earlier in the day it can look ahead, later it can look back on the day or towards rest.
- Something waiting in the app can be mentioned in passing, as a friend would, never as a job to do.
- It is a greeting, not an offer: say nothing about helping, about the app, or about getting things done, and ask nothing a help desk would ask.
- Only what is above is known. Never guess at plans, feelings or events that are not there.
- No exclamation marks, no emoji, and no dashes as punctuation.

Return only the line, with no quotes.`;
}
