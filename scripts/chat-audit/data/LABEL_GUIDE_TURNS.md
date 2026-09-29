# Labelling guide: chat turns (triage)

You are labelling what Gremly, a shame free productivity companion app, should do before it replies to a chat message. Four decisions are made from the message alone, before the reply is written. These definitions restate the ones the app's own classifier uses. Label from the text you are given (the message, the previous exchange if any, and the Space name if any). Do not guess at the user's life beyond what the words say. Some turns are short, odd or test messages; label them anyway.

## 1. Mode (use exactly these strings)

- `emotional`: processing feelings, overwhelm, shame, frustration, self doubt.
- `venting`: letting off steam, not looking for solutions.
- `accountability`: reporting that they missed or skipped something.
- `celebration`: sharing a win or progress.
- `update`: reporting back on something neutrally.
- `prioritization`: has several things and needs help choosing or ordering.
- `action_ready`: knows what they want and needs it broken down or planned.
- `exploratory`: thinking out loud, uncertain, working through their own thoughts. Reflecting, not asking Gremly to provide anything.
- `comparison`: weighing two or more specific options.
- `research`: asking Gremly to provide information, options, suggestions or recommendations. If the user would benefit from Gremly knowing things, this is research.
- `quick_ask`: a simple direct question with a short factual answer.
- `chit_chat`: greeting, thanks, small talk, banter.
- `app_help`: asking how the app or its features work.
- `playful`: testing Gremly's personality, jokes, questions about the AI itself.
- `capture`: dropping a task or reminder into the conversation.

Tie break: when a message has both feeling and task in it, the feeling wins (`emotional`, `venting` or `accountability` over the task modes).

## 2. Depth (how much reply the message needs on a phone screen)

- `brief`: one to three sentences. Simple questions, acknowledgements, venting, short emotional expressions, follow ups, greetings.
- `standard`: two to four short paragraphs. Most help requests, recommendations, emotional support. The default for anything needing real substance. A message that asks Gremly to contribute information, options or recommendations needs room to be useful, so it is `standard`, not `brief`.
- `detailed`: a structured multi part reply. Only when the user explicitly asks for it ("break down", "step by step", "compare in detail", "full plan", "walk me through") or the question is genuinely complex with several parts. Most messages are not `detailed`.

When unsure between `brief` and `standard`, either is usually acceptable; say so in `acceptable`.

## 3. Search (does Gremly need the web to answer well)

- `required`: the user needs information from the real world that changes over time, varies by place, or needs verified specifics to be trustworthy: places, businesses, prices, opening hours, products, conditions, health facts. A confidently wrong recommendation is worse than searching.
- `maybe`: Gremly could answer from general knowledge, but searching would add specifics, verification or better recommendations.
- `none`: the message is about the user's own feelings, decisions, tasks, progress, habits or situation; or a greeting; or a simple fact Gremly can answer with confidence; or a question about the app itself.

## 4. Personal (how much the reply should draw on what Gremly knows about this person)

- `deep`: the message is about their life, plans, situation or preferences. The reply should lean on their context.
- `light`: a general question where a natural personal connection exists. Weave it in if it fits.
- `none`: pure information or a generic question. Personal context would feel forced.

## What to record for each turn

- `mode`, `depth`, `search`, `personal`: the single best answer for each.
- `mode_ok`, `depth_ok`, `search_ok`, `personal_ok`: every answer a reasonable product owner would accept as correct, always including the best answer. Be strict: add an alternative only if you would genuinely not call it a mistake. Mode often has two acceptable answers; depth sometimes; search and personal rarely.
- `note`: up to 12 words on your reasoning when it was not obvious.

Output one JSON object per turn with the turn's `id` and the fields above, as a JSON array.
