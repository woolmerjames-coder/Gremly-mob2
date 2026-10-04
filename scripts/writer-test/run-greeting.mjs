// The greeting test: Gremly's line on Chat's fresh home (workers/cortex/greeting.js)
// written from James's real daily context at several hours, with the prompt that
// shipped before beside the new one, through the live helper call on Luna.
//
//   ESBUILD=... node scripts/writer-test/run-greeting.mjs  (bundled like run.sh)
// Reads fixtures/dco.json; keys from the environment (OPENAI_API_KEY).

import { readFileSync, writeFileSync } from 'node:fs';
import { greetingFacts, greetingPrompt } from '../../workers/cortex/greeting.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import { configureModels } from '../../workers/cortex/models.js';

const HERE = new URL('.', import.meta.url).pathname;
configureModels({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: 'gpt-6-luna',
});
const dco = JSON.parse(readFileSync(`${HERE}fixtures/dco.json`, 'utf8'));
const d = Array.isArray(dco) ? dco[0].dco || dco[0] : dco.dco || dco;
const focus = {
  lifeMoment: d.life_moment || null,
  briefHeadline: d.brief_headline || null,
  namedAnchors: d.named_anchors || [],
  todayFocus: d.today_focus || [],
  leadStory: d.lead_story || null,
};

// the prompt as it shipped before
function oldPrompt(timeStr, dayStr) {
  const focusSnippet = [
    focus.lifeMoment && `Life moment: ${focus.lifeMoment}`,
    focus.briefHeadline && `Headline: "${focus.briefHeadline}"`,
    focus.namedAnchors?.length > 0 && `People: ${focus.namedAnchors.map((a) => a.label).join(', ')}`,
    focus.todayFocus?.length > 0 && `Focus: ${focus.todayFocus.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
  return `Generate a 1-2 sentence contextual greeting for Gremly, a productivity companion. This shows on the home screen when the user opens the chat tab.

Current time: ${timeStr} on ${dayStr}.
${focusSnippet ? `\nUSER CONTEXT:\n${focusSnippet}` : 'No context available.'}

Rules:
- It is currently ${timeStr}. Be time-appropriate. Late evening means winding down or looking ahead to tomorrow, not starting a busy day.
- Reference ONE specific detail from the context by name: a person, a project, an event, a milestone. If you can't name something specific, say "What's on your mind?" and nothing else.
- Write like a friend who already knows what's going on. No introductions, no offers to help.
- No productivity language. No "organize", "tasks", "stay on track", "moment to breathe", "focus".
- No questions that a customer service bot would ask.
- No exclamation marks.
- Under 25 words.

Return ONLY the greeting text. No quotes, no JSON, no explanation.`;
}

const SCENES = [
  { id: 'sat-morning', timeStr: '9:10 AM', dayStr: 'Saturday', hour: 9, briefUnread: true, toDecide: 0, laterToday: [] },
  { id: 'sat-afternoon', timeStr: '2:30 PM', dayStr: 'Saturday', hour: 14, briefUnread: false, toDecide: 0, laterToday: [] },
  { id: 'sat-evening', timeStr: '8:45 PM', dayStr: 'Saturday', hour: 20, briefUnread: false, toDecide: 3, laterToday: [] },
  {
    id: 'sun-before-flight',
    timeStr: '11:20 AM',
    dayStr: 'Sunday',
    hour: 11,
    briefUnread: false,
    toDecide: 0,
    laterToday: ['3:56pm Flight to San Francisco (UA 2117)'],
  },
  { id: 'late-night', timeStr: '11:40 PM', dayStr: 'Saturday', hour: 23, briefUnread: false, toDecide: 2, laterToday: [] },
];

async function line(prompt) {
  const res = await helperFetch('general_greeting', {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Write the line.' },
    ],
    max_tokens: 80,
    temperature: 0.7,
  });
  if (!res.ok) return `ERROR ${res.status}`;
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
}

const out = [];
for (const s of SCENES) {
  const facts = greetingFacts({ focus, laterToday: s.laterToday, briefUnread: s.briefUnread, toDecide: s.toDecide });
  const prompts = { before: oldPrompt(s.timeStr, s.dayStr), after: greetingPrompt({ ...s, facts }) };
  const row = { id: s.id, before: [], after: [] };
  for (const k of ['before', 'after'])
    row[k] = await Promise.all([1, 2, 3].map(() => line(prompts[k])));
  out.push(row);
  console.log(`\n== ${s.id} (${s.timeStr} ${s.dayStr}${s.briefUnread ? ', brief unread' : ''}${s.toDecide ? `, ${s.toDecide} to decide` : ''})`);
  for (const k of ['before', 'after']) for (const t of row[k]) console.log(`  ${k}: ${t}`);
}
writeFileSync(`${HERE}out/greetings.json`, JSON.stringify(out, null, 1));
