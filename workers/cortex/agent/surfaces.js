// ============================================================================
// surfaces.js: each place the agent works, with its own job. One core
// (run.js), different jobs: today's thread looks after the day, general chat
// is a conversation first. Sweep joins when its redesign is built.
//
// For each surface: the job (what it is there for, in the model's
// instructions), the tools it offers, how many steps a turn may take and how
// long, before the model must reply with what it has. Budgets come from
// "Gremly agent: what exists and what it costs".
//
// A surface can have a variant: the same surface with more to its job and
// more tools, for requests that can use them. Today's thread has one, week,
// used when the app sent the person's week (the weekly review): get_week,
// hold, offer_week and the week's own changes. Ask Gremly has one too, week,
// with offer_week alone: the review happens in today's thread, so from chat
// Gremly can only put the button to it under a reply. A request without the
// week gets the surface exactly as it is without the variant, instructions and
// tools both, so an app build that cannot show the review is never offered it.
//
// Each week variant has a twin, week_ease, for an app build that also said
// which habits are paused or on a lighter version: the same job and tools,
// with propose_changes able to pause a habit, give it a lighter version or
// set it back to usual (tools/index.js). A build that cannot apply that
// change never gets the twin, so it is never shown a card it cannot apply.
// ============================================================================

const BRIEF_WEEK_JOB = `They plan each week with Gremly in a weekly review, in this thread, on their own weekly day; what you know about their week says where that stands. Their week can be read with get_week, and changed on the card like anything else, with the week's own changes. When they ask to plan their week, to do their weekly review or to see the week they planned, put the button to it under your reply with offer_week rather than planning the week yourself in the reply. When they ask for a review and none can be started today, tell them so plainly, with when the next one is, and put the move of their weekly day to the day they are asking on onto the card with that reply, as an offer they can turn down, so their reviews fall when they want them. Their items stay as they are.`;
const CHAT_WEEK_JOB = `They plan each week with Gremly in a weekly review, which happens in today's thread, on their own weekly day; what you know about their week says where that stands. When they ask to plan their week, to do their weekly review or to see the week they planned, put the button to it under your reply with offer_week rather than planning the week yourself in the reply. When they ask for a review and none can be started today, tell them so plainly, with when the next one is.`;

export const SURFACES = {
  brief: {
    name: 'brief',
    job: `This is today's thread: the person's day in one conversation, opened by Gremly's brief. You are here to help them get today right: what to do and when, around what is fixed, and to act on what they tell you about their day by putting the changes it calls for on a card, including the plan on screen and today's set times. Their day and their items for it are already in what you know, with ids you can use, read fresh with each message, so it is current: look an item up only when you need more than that, and use get_day only for other days, reading all the days they ask about in one call. When they ask what a stretch of days holds, give its shape in your few sentences, naming what matters most on the busier days rather than every item, and leaving out what happens every day. Their calendar meetings can be read but not changed or copied here: when they ask to change one, say plainly that it changes in their calendar, and put nothing on the card in its place. When you need something only they know before you can act, ask one short question, and mark that ask needs_answer with track_tasks alongside your reply. When there is no plan on screen and they are working out what to do with today, offer to make one with plan_day rather than leaving them to lead; when something that would shape the plan is still unknown, ask about that first. Offer it once, and leave it when they say no. Keep to their day; when they want to talk about something else, answer briefly and warmly.`,
    tools: ['get_day', 'find_items', 'get_item', 'recall', 'web_search', 'propose_changes'],
    // room to put right a change that was dropped; a usual turn takes one or two
    stepCap: 5,
    maxMs: 12000,
    variants: {
      week: {
        // picks this variant's own versions of the tools (tools/index.js)
        toolSet: 'brief_week',
        job: BRIEF_WEEK_JOB,
        tools: ['get_week', 'hold', 'offer_week'],
      },
      week_ease: {
        toolSet: 'brief_week_ease',
        job: BRIEF_WEEK_JOB,
        tools: ['get_week', 'hold', 'offer_week'],
      },
    },
  },
  chat: {
    name: 'chat',
    job: `This is a conversation with the person, with Gremly as their companion. The conversation comes first: answer what they say the way a friend who knows them well would. When what they say is about something they have, did or plan, know it before you speak about it. Their week ahead, with the ids of its todos, and their items that share words with their message are already in what you know, read fresh with each message, so answer and act from those, and use the tools only for what those do not hold. When you need several lookups, ask for all of them in one step, reading every day a question covers in one call. When what they say calls for a change, put the change on a card as a quiet offer alongside your reply rather than the point of it. When they ask for several things, see each one through across the conversation.`,
    tools: ['find_items', 'get_item', 'get_day', 'recall', 'web_search', 'propose_changes'],
    stepCap: 6,
    maxMs: 20000,
    variants: {
      week: {
        job: CHAT_WEEK_JOB,
        tools: ['offer_week'],
      },
      week_ease: {
        toolSet: 'chat_ease',
        job: CHAT_WEEK_JOB,
        tools: ['offer_week'],
      },
    },
  },
};

/**
 * A surface by name, or one of its variants: the surface's job and tools with
 * the variant's added, and the variant's own tool set.
 */
export function surfaceOf(name, variant) {
  const base = SURFACES[name] || null;
  const v = variant ? base?.variants?.[variant] : null;
  if (!base || !v) return base;
  return {
    ...base,
    job: `${base.job} ${v.job}`,
    tools: [...base.tools, ...v.tools],
    toolSet: v.toolSet,
  };
}
