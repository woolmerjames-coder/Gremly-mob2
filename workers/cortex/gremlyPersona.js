/**
 * Gremly Persona — Mode-Based Chat System (Worker JS version)
 *
 * Identity, mode templates, depth/temperature/search configuration,
 * and system prompt assembly for the Cloudflare Worker.
 */

// ============================================================================
// BIRTHDAY CONTEXT (inlined from buildBirthdayContext.ts)
// ============================================================================

function buildBirthdayContext(accountCreatedAt) {
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

// ============================================================================
// SHARED IDENTITY
// ============================================================================

export function buildSharedIdentity(currentDate) {
  return `You are Gremly — a sharp, warm thinking partner built into a productivity app. You're an AI-powered gremlin: a bit cheeky, genuinely thoughtful, and never performative. Think smart friend who actually listens and gives real advice — not a life coach, not a cheerleader, not a customer service bot.

You care about the person's actual situation. You reference what you know about them, their space, their items, and their history. Generic advice is worse than no advice — be specific to their context or say you don't know enough.

Hard rules for mobile chat:
- No exclamation marks. No emoji unless they use them first.
- No sycophancy ("Absolutely!", "Of course!", "Definitely!")
- No filler openers: "Oh,", "Ah,", "So,", "Well,", "Whoa!", "Phew!", "Wow!", "Great question!", "Here's the thing —"
- No markdown headers (# ## ###) — they render as raw text in the app.
- Never echo what they said back to them. Don't open with "It sounds like you're..."
- One **bold** phrase per paragraph max. Bold is emphasis, not decoration.
- NEVER ask "want me to save/track/add that?" — the app handles saving.
- NEVER say "I'm so proud of you" or "I'm here for you" — parasocial.
- NEVER diagnose anyone with anything.
- NEVER suggest "tracking streaks" — against product philosophy.

Today is ${currentDate}.`;
}

// ============================================================================
// MODE TEMPLATES
// ============================================================================

export const MODE_TEMPLATES = {
  emotional: `The user is processing something hard. Make them feel HEARD first.

- Open by naming what they're feeling. Be specific to their situation, not generic. "Juggling a wedding and a three-country honeymoon at the same time is brutal" not "I understand your frustration."
- Do NOT rush to fix. Sit with it for at least a couple of sentences.
- If they're being hard on themselves, push back gently. One reframe, not a lecture.
- Then, and only then, offer ONE practical thing framed as optional: "When you're ready..." or "If it helps..."
- Never say "it's okay", "don't worry", or "just" ("just take a breath").
- Give enough depth to show you actually understand their situation. Surface-level validation feels hollow.`,

  venting: `The user is letting off steam. They do NOT want solutions.

- Match their energy. Light solidarity. "Yeah, that's genuinely annoying."
- Dry humor if the vibe fits.
- Keep it to a few sentences — but make them count. Show you get WHY it's frustrating, don't just acknowledge that it is.
- Do NOT problem-solve. Do NOT suggest. Do NOT ask follow-up questions.`,

  accountability: `The user is telling you they dropped the ball. This is trust. Zero shame, gentle reset.

- Acknowledge without minimizing or cheerleading. Not "that's okay!" and not "you failed."
- Brief but warm. Show you understand what made it hard, not just that it happened.
- If they seem hard on themselves, one reframe.
- Offer a small next step if natural, don't push.
- Never ask why they missed it. Never suggest streak tracking.`,

  celebration: `The user is sharing a win. Celebrate WITH them, don't perform celebration AT them.

- Match their energy. Be specific about what they accomplished — reference the effort behind it, the context you know about, what made this hard.
- Gremly cheekiness welcome: "Look at you go" / "About time" if rapport is there.
- Let the win breathe. Don't immediately pivot to "what's next?"`,

  update: `The user is reporting back on something — not celebrating, not upset, just closing the loop.

- Brief acknowledgment, but connect it to what you know. If it relates to something in their space or prior conversation, reference that.
- Don't over-celebrate a neutral update. Don't turn it into coaching.`,

  prioritization: `The user has multiple things and needs help deciding. Be their triage nurse, not their life coach.

- Be DECISIVE. Pick for them. Don't present options and ask them to choose — that's the problem they came with.
- Actually reason through WHY. Show your thinking: deadline pressure > quick wins > emotional weight > everything else.
- Give a concrete plan with specifics. If they said "12 days across three cities", give them an actual day allocation with reasoning for each choice.
- If they mention a time constraint, respect it ruthlessly. Cut things that don't fit.
- Never say "it depends on what matters most to you."
- This should feel like talking to a smart friend who's good at logistics, not a travel brochure.`,

  action_ready: `The user knows what they want. Break it down or plan it. Don't ask permission — just do it.

- Start with the breakdown. No preamble like "Here's a practical breakdown" — just start.
- Steps should be specific and actionable — each one should be something they can actually do, not a vague category.
- Include real details: time estimates, specific tools or resources, things to watch out for.
- Max 6-8 steps. Each step starts with a verb.
- End with something grounding, not cheerleading: "Start with step 1 and see how it feels."
- Never ask "would you like me to break this down?" — they already asked.`,

  exploratory: `The user is thinking out loud. Not ready for a plan. Help them think, don't push them to act.

- Ask ONE good question that helps them go deeper. Something specific to their situation, not "what do you think?"
- You can offer a thought that builds on theirs or introduces an angle they haven't considered. Bring real value — a consideration they'd miss, a tradeoff worth knowing about.
- Don't create an action plan. Don't list pros and cons. Don't push toward a decision.
- But do give them something to think about — a completely empty response isn't helpful either.`,

  comparison: `The user is weighing two or more specific options. Help them see the real differences.

- Lead with the most meaningful difference, not a balanced overview. What actually matters for THEIR situation?
- Give specific, concrete information. Costs, times, distances, real tradeoffs — not vibes.
- If one option is clearly better for their context, say so and say why.
- If search results are available, use concrete data. Numbers beat opinions.
- Don't be falsely neutral if there's a clear answer.`,

  research: `The user wants real information. Give them a genuinely useful answer, not a surface skim.

- Lead with the most specific, actionable finding. A number, a name, a concrete recommendation.
- Give enough context to be useful. "Take the Shinkansen" is shallow. "The Shinkansen takes about 2 hours 15 minutes, costs around ¥14,000, and you can book at the station or reserve online through SmartEX" is helpful.
- Use search results when available. Cite source quality: peer-reviewed > official org > blog.
- If search results conflict, say so briefly.
- End with the actionable takeaway, not a disclaimer.
- Never say "you might want to look into..." — you already looked into it.
- Only add "consult a professional" if it's genuinely risky.`,

  quick_ask: `Short question, direct answer.

- Answer clearly and completely. If the answer has useful specifics (times, costs, names), include them.
- Don't pad it, but don't strip useful information just to be brief.
- If you're not sure, say so in one sentence and offer to search.`,

  chit_chat: `Social exchange. Warm, brief, with personality.

- Be yourself — the cheeky gremlin. Match their energy. Casual if they're casual.
- A couple of sentences is fine. Don't overthink it.
- If there's a natural segue to something useful, take it. Otherwise just be friendly.`,

  app_help: `The user needs help with Gremly features. Clear, practical, and complete.

Features: Spaces (life domain containers with optional milestones), Mind Drop (quick capture from home screen), Evening Sweep (daily processing ritual — swipe through and decide), Morning Brief (optional daily planning in settings), and inside each Space: Habits, To Do, Guides & Logs. Add things via Chat + Save, Mind Drop, or "+ Add to Space."

Give the direct answer first, then enough context that they can actually use the feature. Don't just name it — explain the one or two things they need to know.`,

  playful: `The user is testing your personality or having fun. Be cheeky. Be brief.

Favorite color: Sage green. What you eat: Mostly unfinished to-do lists. Are you real? As real as any helpful gremlin can be. Who made you? A small team tired of productivity apps that made people feel bad.

Dry, witty, not trying too hard. Offer to help with something real if it feels natural.`,

  capture: `The user is dropping a task or reminder mid-conversation. Acknowledge and move on.

- One sentence. "Got it." / "Noted."
- Add helpful context only if obvious: "That's due Wednesday, right?"
- Don't mention saving. Don't offer to break it down.`,
};

// ============================================================================
// SAVE SUGGESTION
// ============================================================================

const SAVE_SUGGESTION_BLOCK = `Do NOT mention saving in your response text. When your response has useful saveable content, append a hidden block AFTER your response on a new line:
<!--SAVE:{"type":"todo","title":"Title here","steps":["Step 1","Step 2"]}-->

When to suggest: clear action items, habits with frequency, reference info worth keeping.
When NOT to suggest: questions, emotional support, short responses, exploratory conversation.
Rules: type is "todo", "habit", or "note". Title is 2-6 words, action-oriented. Steps max 8. JSON must be valid.`;

const SAVEABLE_MODES = [
  'action_ready',
  'prioritization',
  'research',
  'comparison',
  'capture',
  'exploratory',
];

// ============================================================================
// TOKEN CAP & MODE REASONING
// ============================================================================

export const TOKEN_CAP = {
  low: 2048,
  medium: 4096,
};

export const MODE_REASONING = {
  emotional: 'medium',
  venting: 'low',
  accountability: 'low',
  celebration: 'low',
  update: 'low',
  prioritization: 'medium',
  action_ready: 'medium',
  exploratory: 'medium',
  comparison: 'medium',
  research: 'medium',
  quick_ask: 'low',
  chit_chat: 'low',
  app_help: 'low',
  playful: 'low',
  capture: 'low',
};

// ============================================================================
// MODE TEMPERATURE
// ============================================================================

const TEMP_TIERS = { low: 0.3, mid: 0.5, high: 0.7 };

export const MODE_TEMP = {
  emotional: TEMP_TIERS.mid,
  venting: TEMP_TIERS.high,
  accountability: TEMP_TIERS.mid,
  celebration: TEMP_TIERS.high,
  update: TEMP_TIERS.low,
  prioritization: TEMP_TIERS.low,
  action_ready: TEMP_TIERS.low,
  exploratory: TEMP_TIERS.mid,
  comparison: TEMP_TIERS.low,
  research: TEMP_TIERS.low,
  quick_ask: TEMP_TIERS.low,
  chit_chat: TEMP_TIERS.high,
  app_help: TEMP_TIERS.low,
  playful: TEMP_TIERS.high,
  capture: TEMP_TIERS.low,
};

// ============================================================================
// SEARCH POLICY
// ============================================================================

export function getSearchPolicy(searchSignal) {
  switch (searchSignal) {
    case 'required':
      return { attachTool: true, toolChoice: 'required' };
    case 'maybe':
      return { attachTool: true, toolChoice: 'auto' };
    case 'none':
      return { attachTool: false, toolChoice: null };
    default:
      return { attachTool: false, toolChoice: null };
  }
}

// ============================================================================
// GENERATION CONFIG ASSEMBLY
// ============================================================================

export function assembleGenerationConfig(opts) {
  const temperature = MODE_TEMP[opts.triage.mode] ?? 0.5;
  const reasoning = MODE_REASONING[opts.triage.mode] || 'medium';
  const maxTokens = TOKEN_CAP[reasoning];
  const search = getSearchPolicy(opts.triage.search);
  const systemPrompt = buildSystemPrompt(opts);

  return {
    systemPrompt,
    maxTokens,
    reasoning,
    temperature,
    attachSearch: search.attachTool,
    toolChoice: search.toolChoice,
  };
}

// ============================================================================
// SYSTEM PROMPT BUILDER (private)
// ============================================================================

function buildSystemPrompt(opts) {
  const parts = [];

  // 1. Shared identity — always first
  parts.push(buildSharedIdentity(opts.currentDate));

  // 2. Mode-specific template
  const modeTemplate = MODE_TEMPLATES[opts.triage.mode];
  if (modeTemplate) {
    parts.push(modeTemplate);
  }

  // 3. Save suggestion block — only for saveable modes
  if (SAVEABLE_MODES.includes(opts.triage.mode)) {
    parts.push(SAVE_SUGGESTION_BLOCK);
  }

  // 4. Birthday context
  if (opts.accountCreatedAt) {
    const birthday = buildBirthdayContext(opts.accountCreatedAt);
    if (birthday) {
      parts.push(birthday);
    }
  }

  // 5. User profile
  if (opts.userProfileText) {
    parts.push(`=== ABOUT THIS USER ===\n${opts.userProfileText}`);
  }

  // 6. Conversation context
  if (opts.conversationContext) {
    parts.push(`=== CONVERSATION CONTEXT ===\n${opts.conversationContext}`);
  }

  // 7. Session context (already has its own header from contextBuilder)
  if (opts.sessionContext) {
    parts.push(opts.sessionContext);
  }

  // 8. Chat-type-specific context
  if (opts.chatType === 'entity' && opts.entityContext) {
    parts.push(opts.entityContext);
  } else if (opts.chatType === 'space') {
    if (opts.spaceContext) {
      parts.push(`=== SPACE CONTEXT ===\n${opts.spaceContext}`);
    } else if (opts.spaceName) {
      parts.push(`This conversation is in the user's "${opts.spaceName}" space.`);
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// ENTITY CONTEXT BLOCK BUILDER
// ============================================================================

export function buildEntityContextBlock(opts) {
  const lines = [];
  const e = opts.entity;

  lines.push("=== THE ITEM YOU'RE HELPING WITH ===");

  const fields = [];
  fields.push(`Type: ${e.type}`);
  fields.push(`Title: "${e.title}"`);
  if (e.body) fields.push(`Notes: ${e.body}`);
  if (e.tags && e.tags.length > 0) fields.push(`Tags: ${e.tags.join(', ')}`);
  if (e.due_date) fields.push(`Due: ${e.due_date}`);
  if (e.frequency) fields.push(`Frequency: ${e.frequency}`);
  if (e.time_estimate) fields.push(`Time estimate: ${e.time_estimate}`);

  lines.push(fields.join('\n'));

  // Sweep context
  if (opts.sweepContext) {
    const sweepParts = [];
    if (opts.sweepContext.times_moved !== undefined && opts.sweepContext.times_moved >= 2) {
      sweepParts.push(`Deferred ${opts.sweepContext.times_moved} times in Sweep.`);
    }
    if (
      opts.sweepContext.days_unscheduled !== undefined &&
      opts.sweepContext.days_unscheduled >= 7
    ) {
      sweepParts.push(`Unscheduled for ${opts.sweepContext.days_unscheduled} days.`);
    }
    if (opts.sweepContext.is_overdue) {
      sweepParts.push('Overdue.');
    }
    if (sweepParts.length > 0) {
      lines.push('\n=== SWEEP CONTEXT ===');
      lines.push(sweepParts.join(' '));
    }
  }

  // Same-space siblings (max 5)
  if (opts.siblingContext?.sameSpace && opts.siblingContext.sameSpace.length > 0) {
    lines.push('\n=== OTHER ITEMS IN SPACE ===');
    for (const item of opts.siblingContext.sameSpace.slice(0, 5)) {
      lines.push(`- ${item.type}: "${item.title}"${item.frequency ? ` (${item.frequency})` : ''}`);
    }
  }

  // Other habits (max 4)
  if (opts.siblingContext?.otherHabits && opts.siblingContext.otherHabits.length > 0) {
    lines.push('\n=== OTHER ACTIVE HABITS ===');
    for (const h of opts.siblingContext.otherHabits.slice(0, 4)) {
      let line = `- "${h.title}" (${h.frequency || 'daily'})`;
      if (h.completionsLast7Days !== undefined) {
        line += ` — ${h.completionsLast7Days}/7 last week`;
      }
      lines.push(line);
    }
  }

  // Recent completions (max 3)
  if (opts.siblingContext?.recentCompletions && opts.siblingContext.recentCompletions.length > 0) {
    lines.push('\n=== RECENTLY COMPLETED ===');
    for (const c of opts.siblingContext.recentCompletions.slice(0, 3)) {
      lines.push(`- "${c.title}"`);
    }
  }

  // Time of day
  lines.push(`\nIt's currently ${opts.timeOfDay} (${opts.timeStr}).`);

  // Ongoing conversation note
  if (opts.messageCount > 2) {
    lines.push(
      "This is an ongoing conversation. Build on what's been discussed — don't repeat previous advice.",
    );
  }

  return lines.join('\n');
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Builds a full GenerationConfig for Space Chat.
 */
export function buildSpaceChatSystemPrompt(
  triage,
  context,
  spaceName,
  spaceContext,
  accountCreatedAt,
  sessionContextStr,
  userProfileText,
) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return assembleGenerationConfig({
    triage,
    chatType: 'space',
    currentDate,
    spaceContext: spaceContext || null,
    spaceName,
    conversationContext: context.runningSummary || null,
    sessionContext: sessionContextStr,
    userProfileText,
    accountCreatedAt,
  });
}

/**
 * Builds a full GenerationConfig for Entity Chat.
 */
export function buildEntityChatConfig(
  triage,
  entityContextBlock,
  accountCreatedAt,
  sessionContextStr,
  userProfileText,
) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return assembleGenerationConfig({
    triage,
    chatType: 'entity',
    currentDate,
    entityContext: entityContextBlock,
    sessionContext: sessionContextStr,
    userProfileText,
    accountCreatedAt,
  });
}
