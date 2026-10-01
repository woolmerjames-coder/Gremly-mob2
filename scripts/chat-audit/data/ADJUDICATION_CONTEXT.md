# What each decision does inside Gremly (for the adjudicator)

The two blind labellers only saw the guide. You also know what the app does with each answer, so use that to judge which answer serves the user best.

## Mode

The mode picks a tone template that goes into Gremly's system prompt, the sampling temperature, and whether the reply may end with a "save suggestion" (only for action_ready, prioritization, research, comparison, capture, exploratory). The templates, in one line each:

- emotional: the user is processing something hard, make them feel heard first
- venting: letting off steam, they do not want solutions
- accountability: they dropped the ball, zero shame, gentle reset
- celebration: celebrate with them, not at them
- update: reporting back, closing the loop, not celebrating, not upset
- prioritization: several things, help them decide, be a triage nurse not a life coach
- action_ready: they know what they want, break it down or plan it, do not ask permission
- exploratory: thinking out loud, not ready for a plan, help them think, do not push to act
- comparison: weighing specific options, show the real differences
- research: they want real information, give a genuinely useful answer
- quick_ask: short question, direct answer
- chit_chat: social exchange, warm, brief, personality
- app_help: help with Gremly's features, clear, practical, complete
- playful: testing Gremly's personality, be cheeky, be brief
- capture: dropping a task or reminder mid conversation, acknowledge and move on

So the question behind mode is: which template would produce the reply this person needs. A message that is a question about the world but where the person clearly wants a plan is action_ready; a question that wants facts or options is research; a short factual question that needs a sentence is quick_ask.

## Depth

- brief: up to 2,000 output tokens, told to answer in one to three sentences
- standard: up to 4,500, told "2-4 short chunks, under 150 words, no chunk longer than 3 sentences"
- detailed: up to 6,500, medium thinking (slower, dearer), a structured multi part reply

This is a phone chat. Standard is already short. Detailed should be rare and only when the person explicitly asks for a breakdown, a full plan, step by step, or a detailed comparison.

## Search

Gremly has a web search tool (Google search through Gemini, plus a page reader for links the user pastes). The search signal decides how the tool is attached:

- required: the tool is attached and the model is forced to search before answering. Adds one to three seconds and can pull odd results if the question did not need it.
- maybe: the tool is attached and the model decides.
- none: the tool is not attached, so the model cannot search even if that would help.

Gremly already knows the user's own todos, habits, notes, calendar, a daily context summary and a life map. It does not know live facts: today's opening hours, prices, current products, news, local places. So: required for questions whose answer depends on live, local or verifiable outside facts where a confident guess would be worse than a search (places, businesses, prices, products, health and medication specifics, travel logistics); maybe when general knowledge is enough but specifics would help; none for anything about the user's own life, feelings, tasks, plans, the app, or a simple fact any model knows.

## Personal

- deep: a long instruction to use the user's context as a lens
- light: connect to the user's life if natural
- none: no personal context

Not in the review. Both labellers' answers are accepted.

## The saveable items (Ask Gremly conversations)

After each reply, a background job reads the conversation and may show a small "Save items" pill. Tapping it saves the item as a todo, habit, note or event. The pill interrupts, and Gremly is meant to be shame free, so offering something the user never committed to feels like being managed. Rule: a wrong offer is worse than a missed one. Offer only what the user themselves committed to, decided, or asked to keep: not Gremly's suggestions unless the user took them up ("yes, let's do that", "adding it"), not things the user is merely exploring, not emotional processing. Events (a trip, an appointment, a deadline the user mentions) are worth offering even without a date, because knowing something is coming up helps other conversations.
