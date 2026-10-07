/**
 * Forget Everything (WhatGremlyKnowsScreen): Gremly forgets what he has learned
 * about the person, as the screen promises, once they have tapped it and said
 * yes. What they made themselves (their todos, notes, journal, habits, Worlds,
 * Chapters and chats) stays; what Gremly wrote about them goes:
 *
 *   the ledger of facts, with where each came from and how it changed
 *   the story, the Life Map and the weekly runs that wrote them
 *   the profile Gremly wrote (their name, pronouns and time zone stay)
 *   what they told Gremly about themselves on that screen
 *   Gremly's open and answered questions, and the date anchors
 *   the daily pictures and the weekly summaries
 *   Gremly's words on Worlds and Chapters (never words the person wrote)
 *   his summaries of chats, on items and on chats
 *   what each of his sentences was written from (passage_refs)
 *
 * Reading starts again from now, so what is forgotten is not read back in.
 */
import { db } from '../../shared/db.js';
import { invalidateChatCache } from '../../shared/chatCache.js';

const NOT_THEIRS = (col) => `or=(${col}.is.null,${col}.neq.user)`;

export async function forgetPerson(env, userId) {
  if (!userId) throw new Error('forgetPerson needs a person');
  const d = db(env);
  const u = `user_id=eq.${userId}`;
  const o = `owner_id=eq.${userId}`;
  const count = (rows) => (Array.isArray(rows) ? rows.length : 0);
  const out = {};
  // Facts first: where each came from and how it changed go with them (on delete cascade)
  out.facts = count(await d.remove(`life_facts?${u}&select=id`));
  out.story = count(await d.remove(`story_items?${u}&select=id`));
  out.life_map = count(await d.remove(`user_life_map?${u}&select=id`));
  out.weekly_runs = count(await d.remove(`synthesis_runs?${u}&select=id`));
  out.questions = count(await d.remove(`gremly_questions?${u}&select=id`));
  out.anchors = count(await d.remove(`user_temporal_anchors?${u}&select=id`));
  out.told = count(await d.remove(`user_profile_overrides?${u}&select=id`));
  out.daily_pictures = count(await d.remove(`user_daily_state?${u}&select=id`));
  out.weekly_summaries = count(await d.remove(`weekly_summaries?${u}&select=id`));
  out.passages = count(await d.remove(`passage_refs?${u}&select=id`));
  out.profile = count(
    await d.update(`user_profiles?${u}`, {
      profile_text: null,
      signals: null,
      generated_at: null,
      model_used: null,
    }),
  );
  const now = new Date().toISOString();
  out.world_words = count(
    await d.update(`worlds?${o}&summary=not.is.null&${NOT_THEIRS('summary_source')}`, {
      summary: null,
      summary_updated_at: now,
    }),
  );
  out.world_lines = count(
    await d.update(`worlds?${o}&card_subtitle=not.is.null&${NOT_THEIRS('card_subtitle_source')}`, {
      card_subtitle: null,
      card_subtitle_updated_at: now,
    }),
  );
  out.chapter_words = count(
    await d.update(`chapters?${o}&summary=not.is.null&${NOT_THEIRS('summary_source')}`, {
      summary: null,
      summary_updated_at: now,
    }),
  );
  out.chapter_lines = count(
    await d.update(
      `chapters?${o}&card_subtitle=not.is.null&${NOT_THEIRS('card_subtitle_source')}`,
      {
        card_subtitle: null,
        card_subtitle_updated_at: now,
      },
    ),
  );
  out.chapter_epigraphs = count(
    await d.update(`chapters?${o}&epigraph=not.is.null&${NOT_THEIRS('epigraph_source')}`, {
      epigraph: null,
      epigraph_updated_at: now,
    }),
  );
  for (const table of ['todos', 'notes', 'habits']) {
    out[`${table}_chat_summaries`] = count(
      await d.update(`${table}?${o}&chat_summary=not.is.null&select=id`, {
        chat_summary: null,
        chat_summary_at: null,
      }),
    );
  }
  out.chat_summaries = count(
    await d.update(`scope_chats?${u}&running_summary=not.is.null&select=id`, {
      running_summary: null,
    }),
  );
  // Reading starts again from now: nothing forgotten is read back in
  await d.upsert(
    'ledger_cursor',
    [{ user_id: userId, read_through: now, backfilled_at: now, updated_at: now }],
    'user_id',
  );
  out.cache = (await invalidateChatCache(env, userId)).invalidated;
  return out;
}
