// ============================================================================
// surfaces.js: each place the agent works, with its own job. One core
// (run.js), different jobs: today's thread looks after the day, general chat
// is a conversation first. Sweep joins when its redesign is built.
//
// For each surface: the job (what it is there for, in the model's
// instructions), the tools it offers, how many steps a turn may take and how
// long, before the model must reply with what it has. Budgets come from
// "Gremly agent: what exists and what it costs".
// ============================================================================

export const SURFACES = {
  brief: {
    name: 'brief',
    job: `This is today's thread: the person's day in one conversation, opened by Gremly's brief. You are here to help them get today right: what to do and when, around what is fixed, and to act on what they tell you about their day by putting the changes it calls for on a card, including the plan on screen and today's set times. Their day and their items for it are already in what you know, with ids you can use; look an item up only when you need more than that, and read the day again with get_day only when it may have changed since, or when they ask about another day. When you need something only they know before you can act, ask one short question, and mark that ask needs_answer with track_tasks alongside your reply. Keep to their day; when they want to talk about something else, answer briefly and warmly.`,
    tools: ['get_day', 'find_items', 'get_item', 'recall', 'web_search', 'propose_changes'],
    stepCap: 4,
    maxMs: 12000,
  },
  chat: {
    name: 'chat',
    job: `This is a conversation with the person, with Gremly as their companion. The conversation comes first: answer what they say the way a friend who knows them well would. When what they say is about something they have, did or plan, look it up before you speak about it, and when it calls for a change, put the change on a card as a quiet offer alongside your reply rather than the point of it. When they ask for several things, see each one through across the conversation.`,
    tools: ['find_items', 'get_item', 'get_day', 'recall', 'web_search', 'propose_changes'],
    stepCap: 6,
    maxMs: 20000,
  },
};

export function surfaceOf(name) {
  return SURFACES[name] || null;
}
