// Run a scenario file through the semantic pipeline with the real models:
// triage (gpt-4.1-mini, two calls) -> matcher over the whole item list (Luna)
// -> reply (gemini-3-flash-preview, real prompt builders) -> extraction (Luna)
// with the extractor's own reconciliation. Cards that ask for a change are
// assumed tapped, and the item list is updated accordingly before the next
// turn. Missing versus the Worker: the life map / session context blocks and
// web search.
//
//   node scenario-run.mjs data/scenarios.json results/scenarios.json [ids]
//
// A spec may take its items (and persona) from another spec with itemsFrom,
// adding its own items to them. A scenario with anchor (an item id) is a chat
// opened about that item ("Talk it through"): it starts with Gremly's opener
// and every turn carries the anchor, as the app sends it.
import { readFileSync, writeFileSync } from 'node:fs';
import { keys } from './keys.mjs';
import { dirname, join } from 'node:path';
import { configureModels, models } from '../../workers/cortex/models.js';
import { triageMessage } from '../../workers/cortex/triage.js';
import {
  matchEntity,
  applyEntityCardToTriage,
  entityCardPromptSection,
  recentCardPromptSection,
  theirItemsPromptSection,
  anchorPromptSection,
  checkNewAgainstTracked,
} from '../../workers/cortex/entityMatch.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { geminiGenerate } from '../../workers/cortex/geminiClient.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import {
  buildChatExtractionPrompt,
  buildPillPrompt,
  withEvidenceRule,
  withEditsRule,
  editsToPillItems,
  evidenceGrounded,
  mentionEditItem,
  cardTrackedNote,
  aboutTrackedNote,
  reconcileSameAs,
  lateCardFrom,
  newItemsOnly,
  NO_EXTRACTION_MODES,
} from '../../workers/cortex/chatPrompts.js';

configureModels({
  OPENAI_API_KEY: keys.openai,
  GOOGLE_API_KEY: keys.gemini,
  CHAT_MODEL: 'gemini-3-flash-preview',
  HELPER_MODEL: 'gpt-6-luna',
  HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
  MODEL_TRIAGE_MODE: 'gpt-4.1-mini',
  MODEL_TRIAGE_SIGNALS: 'gpt-4.1-mini',
  MODEL_LOADING_MESSAGE: 'gpt-4.1-mini',
  TRIAGE_ONE_CALL: 'off',
  CHAT_EXTRACTION_V2: 'on',
  SEARCH_REQUIRED_FORCES: 'off',
  ENTITY_CARDS: 'on',
  ...(process.env.EM ? { MODEL_ENTITY_MATCH: process.env.EM } : {}),
});

const file = process.argv[2];
const outPath = process.argv[3];
const only = process.argv[4] && process.argv[4] !== 'all' ? new Set(process.argv[4].split(',')) : null;
const SPLIT = process.env.PILL_SPLIT === 'on';
const REPEAT = Number(process.env.REPEAT || 1);
const spec = JSON.parse(readFileSync(file, 'utf8'));
if (spec.itemsFrom) {
  const base = JSON.parse(readFileSync(join(dirname(file), spec.itemsFrom), 'utf8'));
  spec.items = [...(base.items || []), ...(spec.items || [])];
  spec.persona = spec.persona ?? base.persona;
  spec.timezone = spec.timezone ?? base.timezone;
  spec.todayIso = spec.todayIso ?? base.todayIso;
  spec.todayStr = spec.todayStr ?? base.todayStr;
}
const { persona, timezone: TZ, todayIso, todayStr } = spec;

// The scenarios are written for one day, so every part of a turn runs on it:
// the reply's own sense of today (gremlyPersona reads the clock) as well as the
// matcher's. Without this the reply names days from the real date while the
// cards use the scenario's. Date.now stays real, so the timings still work.
const RealDate = Date;
function noonIn(dayIso, tz) {
  const [y, m, d] = dayIso.split('-').map(Number);
  const guess = RealDate.UTC(y, m - 1, d, 12);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new RealDate(guess))
      .map((p) => [p.type, p.value]),
  );
  const shown = RealDate.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (shown - guess);
}
const PINNED_MS = noonIn(todayIso, TZ || 'UTC');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(PINNED_MS);
  }
  static now() {
    return RealDate.now();
  }
};

const short = (id) => String(id || '').slice(0, 8);
function existingItemsBlock(items, tracked, card, related) {
  const lines = [];
  for (const it of items) {
    tracked.set(short(it.id), {
      id: it.id,
      type: it.type,
      title: it.title,
      due_day: it.due_day,
      due_time: it.due_time,
      frequency: it.frequency,
      logged_days: it.logged_days || [],
    });
    const when =
      it.type === 'habit'
        ? it.frequency
          ? ` (${it.frequency})`
          : ''
        : it.due_day
          ? ` (${it.type === 'note' ? 'dated' : 'due'} ${it.due_day}${it.due_time ? ` ${it.due_time}` : ''})`
          : '';
    lines.push(`- [${it.type} id:${short(it.id)}] ${it.title}${when}`);
  }
  return `\nITEMS ALREADY TRACKED IN THE USER'S SYSTEM (do NOT extract these again, in these words or in others; something is one of these only when it is the same thing):\n${lines.join('\n')}\n${aboutTrackedNote(related)}${cardTrackedNote(card)}`;
}

async function extraction(items, history, card, match, recent, shownCards) {
  const tracked = new Map();
  const block = existingItemsBlock(items, tracked, card, match?.related);
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`)
    .join('\n\n');
  let prompt;
  if (SPLIT) {
    prompt = buildPillPrompt({ todayStr, conversationText, existingItemsBlock: block });
  } else {
    prompt = buildChatExtractionPrompt({
      todayStr,
      runningSummary: null,
      conversationText,
      handledIds: [],
      existingItemsBlock: block,
    });
    prompt = withEditsRule(withEvidenceRule(prompt));
  }
  const res = await helperFetch('chat_extraction', {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Extract items from the conversation above.' },
    ],
    max_tokens: 2000,
    temperature: SPLIT ? 0 : 0.1,
    response_format: { type: 'json_object' },
  });
  if (!res.ok) return { error: res.status, items: [] };
  const json = await res.json();
  let parsed = null;
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
  } catch {
    return { error: 'parse', items: [] };
  }
  const userTexts = history.filter((m) => m.role === 'user').map((m) => m.content);
  const raw = parsed.extractions || [];
  const grounded = raw.filter((e) => evidenceGrounded(e.evidence, userTexts));
  const checked = await checkNewAgainstTracked(grounded, items);
  const news = reconcileSameAs(checked, tracked);
  let edits = editsToPillItems(parsed.edits, tracked, userTexts).filter(
    (e) => !card?.entity || e.entity_id !== card.entity.id,
  );
  const heard = mentionEditItem(match?.mention);
  if (heard && !edits.some((e) => e.entity_id === heard.entity_id && e.field === heard.field))
    edits.push(heard);
  // existing means card, new means pill
  const converted = news.filter((e) => e && e.type === 'edit');
  let lateCard = lateCardFrom([...edits, ...converted], tracked, {
    cardEntityId: card?.entity?.id || null,
    declinedId: recent?.status === 'declined' ? recent.id : null,
    aboutIds: (match?.related || []).map((c) => c.id),
  });
  // the app never shows a late card for a change this chat already had a card
  // for, whatever became of it (lateCardAlreadyShown in lib/chat/entityCards.ts)
  if (lateCard && lateCardAlreadyShown(shownCards, lateCard)) lateCard = null;
  return {
    lateCard: lateCard
      ? { title: lateCard.entity.title, field: lateCard.change.field, to: lateCard.change.to }
      : null,
    lateCardFull: lateCard,
    items: newItemsOnly(news).map((e) => ({ kind: 'new', type: e.type, title: e.title, same_as: e.same_as || null })),
    rawNew: raw.map((e) => ({ title: e.title, type: e.type, same_as: e.same_as || null })),
    ungrounded: raw.length - grounded.length,
  };
}

/** Mirror of the app's lateCardAlreadyShown: a late card for a change this chat already had a card for is not shown again. */
function lateCardAlreadyShown(shown, card) {
  if (card.kind !== 'edit' || !card.late) return false;
  return shown.some(
    (c) =>
      c.kind === 'edit' &&
      c.entity.id === card.entity.id &&
      c.change.field === card.change.field &&
      (card.change.field === 'body_add' || String(c.change.to) === String(card.change.to)),
  );
}

/** Apply a tapped card to the item list (what the app would write). */
function applyTap(items, card) {
  const e = card.entity;
  const c = card.change;
  if (!e || !c) return items;
  if (c.field === 'completed') return items.filter((i) => i.id !== e.id);
  return items.map((i) => {
    if (i.id !== e.id) return i;
    if (c.field === 'logged') return { ...i, logged_days: [c.to, ...(i.logged_days || [])] };
    if (c.field === 'name') return { ...i, title: c.to };
    if (c.field === 'due_day') return { ...i, due_day: c.to, target_date: c.to };
    return { ...i, [c.field]: c.to };
  });
}

const out = [];
const runs = [];
for (const sc of spec.scenarios) {
  if (only && !only.has(sc.id)) continue;
  for (let r = 0; r < REPEAT; r++) runs.push(REPEAT > 1 ? { ...sc, id: `${sc.id}#${r + 1}`, base: sc.id } : sc);
}
for (const sc of runs) {
  let items = spec.items.map((i) => ({ ...i, target_date: i.due_day || null }));
  const history = [];
  let recent = null;
  let pendingTap = null;
  const shownCards = [];
  const turns = [];
  // a chat opened about one item: Gremly's opener comes first, and the item
  // goes with every turn (the opener is not an exchange: no user turn before it)
  const anchorRow = sc.anchor ? items.find((i) => i.id === sc.anchor) : null;
  if (sc.anchor && !anchorRow) throw new Error(`${sc.id}: anchor ${sc.anchor} is not an item`);
  const anchor = anchorRow ? { id: anchorRow.id, type: anchorRow.type, title: anchorRow.title } : null;
  const lead = anchor
    ? [
        {
          role: 'assistant',
          content: sc.opener || `Sure, let's talk about **${anchor.title}**. What's on your mind?`,
        },
      ]
    : [];
  for (const turnSpec of sc.turns) {
    // a turn may be an object: { text, decline: true } means the user tapped
    // "Not that one" on the previous card before sending this text
    const message = typeof turnSpec === 'string' ? turnSpec : turnSpec.text;
    const declines = typeof turnSpec === 'object' && !!turnSpec.decline;
    if (pendingTap && !declines) items = applyTap(items, pendingTap);
    if (declines && recent) {
      recent = { ...recent, status: 'declined', summary: null, turns_ago: 0 };
    }
    pendingTap = null;
    const recentBefore = recent ? { title: recent.title, status: recent.status, turns_ago: recent.turns_ago } : null;
    const exchanges = [];
    for (let i = 0; i + 1 < history.length; i += 2)
      exchanges.push({ userMsg: history[i].content, assistantMsg: history[i + 1].content });
    const previousExchange = exchanges.length ? exchanges[exchanges.length - 1] : null;
    const t0 = Date.now();
    let tCard = 0;
    const [triageRaw, match] = await Promise.all([
      triageMessage({
        userMessage: message,
        previousExchange,
        runningSummary: '',
        chatType: 'general',
        env: {},
        domainNames: [],
        profileSnippet: '',
        messageCount: history.length + 1,
      }),
      (async () => {
        const s = Date.now();
        const m = await matchEntity({
          env: {},
          userId: 'u',
          message,
          previousExchange,
          exchanges,
          todayStr,
          todayIso,
          items,
          recent,
          anchor,
        });
        tCard = Date.now() - s;
        return m;
      })(),
    ]);
    const card = match?.card || null;
    const triage = applyEntityCardToTriage(triageRaw, card);
    const gen = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', persona, TZ, null);
    let system = gen.systemPrompt;
    const anchorNow = match?.anchor || anchor;
    if (card)
      system += entityCardPromptSection(card, { anchorId: anchorNow?.id || null, todayIso });
    system += recentCardPromptSection(recent);
    system += anchorPromptSection(anchorNow, todayIso, { mode: triage.mode });
    const theirs = theirItemsPromptSection(match, todayIso, {
      mode: triage.mode,
      card,
      anchor: anchorNow,
    });
    system += theirs;
    const msgs = [...lead, ...history, { role: 'user', content: message }];
    const r = await geminiGenerate(
      system,
      msgs,
      {
        temperature: gen.temperature,
        maxOutputTokens: gen.maxTokens,
        thinkingLevel: gen.thinkingLevel,
        model: models().chat,
      },
      keys.gemini,
    );
    let reply = r.ok ? r.content : `[reply failed: ${r.error}]`;
    reply = reply.replace(/<!--SAVE:[\s\S]*?-->/g, '').trim();
    history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    const gated = NO_EXTRACTION_MODES.includes(triage.mode);
    // the Worker skips extraction on these modes, so nothing is offered after them
    const pill = gated
      ? { skipped: true, items: [], rawNew: [], lateCard: null, lateCardFull: null, ungrounded: 0 }
      : await extraction(items, [...lead, ...history], card, match, recent, shownCards);
    if (card && card.kind === 'edit') shownCards.push(card);
    if (pill.lateCardFull) shownCards.push(pill.lateCardFull);
    pill.gated = gated;
    // an asked-for card is assumed tapped; one offered in passing is left for the user
    const tapped = !!card && card.kind === 'edit' && !card.inPassing;
    // the tap lands before the next turn, unless that turn turns the card down
    pendingTap = tapped ? card : null;
    if (card && card.kind !== 'choose') {
      recent = {
        ...card.entity,
        status: tapped ? 'applied' : 'pending',
        summary: tapped ? `Done. ${card.entity.title} is now ${card.change.to}.` : null,
        change: card.change ? { field: card.change.field, to: card.change.to } : null,
        // what the card was for, as the app sends it (recentEntityFor)
        card: { kind: card.kind, intent: card.intent || null, already: !!card.already },
        turns_ago: 0,
      };
    } else if (card && card.kind === 'choose') {
      recent = null;
    } else if (recent) {
      recent = { ...recent, turns_ago: (recent.turns_ago ?? 0) + 1 };
    }
    turns.push({
      message,
      mode: triage.mode,
      modeBeforeCard: triage.modeBeforeCard || null,
      card: card
        ? {
            kind: card.kind,
            inPassing: !!card.inPassing,
            title: card.entity?.title || (card.candidates || []).map((c) => c.title).join(' / '),
            change: card.change || null,
            intent: card.intent || null,
            already: !!card.already,
          }
        : null,
      about: (match?.related || []).map((c) => c.title),
      anchor: anchorNow ? { title: anchorNow.title, gone: !!anchorNow.gone } : null,
      known: theirs ? theirs.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) : [],
      reply,
      pill,
      ms: Date.now() - t0,
      cardMs: tCard,
      // the matcher's raw answer, for reading why a turn got the card it got
      raw: match?.answer || null,
      recentIn: recentBefore,
    });
    console.log(
      `${sc.id} | ${message.slice(0, 48)} | ${triage.mode}${card ? ` | card ${card.kind}${card.inPassing ? ' (in passing)' : ''}: ${card.entity?.title || ''}${card.change ? ` ${card.change.field}->${card.change.to}` : ''}` : ''} | about ${(match?.related || []).length} | pill ${pill.items.length}${gated ? ' (gated)' : ''}${pill.lateCard ? ` | late card: ${pill.lateCard.title} ${pill.lateCard.field}->${pill.lateCard.to}` : ''} | ${tCard}ms`,
    );
  }
  out.push({
    id: sc.id,
    base: sc.base || sc.id,
    group: sc.group,
    expect: sc.expect || null,
    note: sc.note || null,
    anchor: anchor ? anchor.title : null,
    lead: lead[0]?.content || null,
    turns,
  });
}
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('written', out.length, 'scenarios to', outPath);
