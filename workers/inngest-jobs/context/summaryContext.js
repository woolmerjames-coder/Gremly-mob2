/**
 * What the Sunday weekly summary reads about the person's life, for people on
 * the context pipeline: the fact ledger with states, what happened or changed
 * this week, what is genuinely coming up, their corrections, and the parts of
 * their story worth weaving in. Private facts and items are left out, because
 * the summary is something the person is shown.
 */

import { db, addDays } from './db';
import { recentCorrections } from './corrections';
import { loadStory } from './story';

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export async function weeklySummaryContext(env, userId, weekStart, weekEnd) {
  const d = db(env);
  const after = addDays(weekEnd, 1);
  const [open, thisWeek, corrections, story] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&private=eq.false&state=in.(current,planned,unconfirmed)&select=statement,about_date,about_date_end,state&order=about_date.asc.nullslast&limit=150`),
    d.select(`life_facts?user_id=eq.${userId}&private=eq.false&state=in.(happened,changed,superseded)&about_date=gte.${weekStart}&about_date=lte.${weekEnd}&select=statement,about_date,state,state_reason&order=about_date.asc&limit=60`),
    recentCorrections(env, userId, 365),
    loadStory(env, userId, { includePrivate: false, limit: 60 }).catch(() => []),
  ]);
  const during = open.filter((f) => f.about_date && f.about_date >= weekStart && f.about_date <= weekEnd);
  const ahead = open.filter((f) => f.about_date && f.about_date >= after && f.about_date <= addDays(weekEnd, 21));
  const passedPlans = open.filter((f) => f.about_date && f.about_date < weekStart && f.state === 'planned');
  const undated = open.filter((f) => !f.about_date).slice(0, 40);
  const line = (f) => `- ${f.state} | ${f.about_date ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''}` : 'no date'} | ${trim(f.statement, 200)}`;
  const storyLine = (s) => `- ${s.kind}${s.pattern_kind ? `/${s.pattern_kind}` : ''} | ${s.period_start || 'undated'} | ${trim(s.title, 100)}: ${trim(s.body, 220)}`;

  return [
    `WEEK: ${weekStart} to ${weekEnd}.`,
    `HAPPENED OR CHANGED THIS WEEK:\n${thisWeek.map((f) => `- ${f.state} | ${f.about_date} | ${trim(f.statement, 200)}${f.state_reason ? ` (${trim(f.state_reason, 120)})` : ''}`).join('\n') || '(nothing recorded)'}`,
    `PLANNED FOR DURING THE WEEK (whether it happened is in the week's own records):\n${during.map(line).join('\n') || '(nothing recorded)'}`,
    `COMING UP IN THE THREE WEEKS AFTER IT:\n${ahead.map(line).join('\n') || '(nothing recorded)'}`,
    `PLANS WHOSE DATE PASSED WITH NO RECORD OF WHAT HAPPENED (not upcoming; mention only if the week's records do):\n${passedPlans.slice(-15).map(line).join('\n') || '(none)'}`,
    `ONGOING, WITHOUT A DATE:\n${undated.map(line).join('\n') || '(none)'}`,
    `CORRECTIONS THE PERSON MADE (never repeat the corrected claim): ${corrections.map((c) => `"${trim(c.statement, 140)}" is wrong; they said "${trim(c.correction_text, 160)}"`).join('; ') || 'none'}`,
    `THEIR STORY (milestones, shifts, proud moments, patterns, people):\n${story.map(storyLine).join('\n') || '(not written yet)'}`,
  ].join('\n\n');
}
