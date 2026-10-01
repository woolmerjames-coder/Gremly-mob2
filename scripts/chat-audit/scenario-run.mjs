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
// and every turn carries the anchor, as the app sends it. The reply is also
// given what the anchored item holds (itemDetail.js), built from the spec
// item's own fields (body, notes, list_items, floor_note, chat_summary and
// the rest, named as the database names them), as the Worker builds it from
// the row.
import { readFileSync, writeFileSync } from 'node:fs';
import { keys } from './keys.mjs';
import { dirname, join } from 'node:path';
import { configureModels, models } from '../../workers/cortex/models.js';
import { triageMessage } from '../../workers/cortex/triage.js';
import {
  matchEntity,
  applyEntityCardToTriage,
  theirItemsPromptSection,
  turnItemSections,
  offerLateCard,
  checkNewAgainstTracked,
} from '../../workers/cortex/entityMatch.js';
import { buildGeneralChatConfig } from '../../workers/cortex/gremlyPersona.js';
import { toDetail, itemDetailText } from '../../workers/cortex/itemDetail.js';
import { geminiGenerate } from '../../workers/cortex/geminiClient.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import {
  buildChatExtractionPrompt,
  buildPillPrompt,
  withEvidenceRule,
  withEditsRule,
  evidenceGrounded,
  reconcileSameAs,
  trackedRowsFromItems,
  trackedItemsBlock,
  lateCardCandidate,
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
const OLD_APP = process.env.OLD_APP === 'on';
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

// The tracked items block, the late card and its check are the Worker's own
// functions (chatPrompts.js, entityMatch.js), so the runner reads what
// production reads.
async function extraction(items, history, card, match, recent, shownCards, message, exchanges) {
  const { block, tracked } = trackedItemsBlock(trackedRowsFromItems(items), {
    editsOn: true,
    related: match?.related,
    card,
  });
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
  // existing means card, new means pill
  const { lateCard: candidate } = lateCardCandidate(
    { extractions: news, edits: parsed.edits },
    tracked,
    userTexts,
    {
      mention: match?.mention,
      cardEntityId: card?.entity?.id || null,
      declinedId: recent?.status === 'declined' ? recent.id : null,
      aboutIds: (match?.related || []).map((c) => c.id),
    },
  );
  // the app never shows a late card for a change this chat already had a card
  // for, whatever became of it (lateCardAlreadyShown in lib/chat/entityCards.ts)
  const unseen = candidate && !lateCardAlreadyShown(shownCards, candidate) ? candidate : null;
  // the Worker's last word: offered only when their own words asked for it
  const offered = unseen
    ? await offerLateCard({ card: unseen, message, exchanges, todayStr, todayIso })
    : false;
  const lateCard = offered ? unseen : null;
  const brief = (c) =>
    c
      ? {
          title: c.entity.title,
          field: c.change.field,
          to: c.change.days ? c.change.days.join(',') : c.change.to,
        }
      : null;
  return {
    lateCard: brief(lateCard),
    // found by the extraction, held back by the check
    lateCardHeld: offered ? null : brief(unseen),
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

/**
 * The closing line saved on a tapped card, as builds before the change was
 * sent wrote it (Today and Tomorrow when they applied). Newer builds send the
 * change itself and the Worker words it, so this only matters with OLD_APP=on.
 */
function appSummary(card, todayIso) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00Z`);
    const t = new Date(`${todayIso}T12:00:00Z`);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
  };
  const c = card.change;
  const title = card.entity.title;
  if (c.field === 'due_day') return `Done. ${title} is now ${day(c.to)}.`;
  if (c.field === 'logged') return `Done. Logged ${title} for ${(c.days || [c.to]).map(day).join(' and ')}.`;
  if (c.field === 'completed') return `Done. ${title} is marked done.`;
  return `Done. ${title} is now ${c.to}.`;
}

/** Apply a tapped card to the item list (what the app would write). */
function applyTap(items, card) {
  const e = card.entity;
  const c = card.change;
  if (!e || !c) return items;
  if (c.field === 'completed') return items.filter((i) => i.id !== e.id);
  return items.map((i) => {
    if (i.id !== e.id) return i;
    if (c.field === 'logged')
      return { ...i, logged_days: [...(c.days || [c.to]), ...(i.logged_days || [])] };
    if (c.field === 'name') return { ...i, title: c.to };
    if (c.field === 'due_day') return { ...i, due_day: c.to, target_date: c.to };
    if (c.field === 'body_add') return { ...i, body: i.body ? `${i.body}\n\n${c.to}` : c.to };
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
    const anchorNow = match?.anchor || anchor;
    // what the anchored item holds, from its row as it is now (taps applied)
    const anchorItemNow = anchorNow && !anchorNow.gone ? items.find((i) => i.id === anchorNow.id) : null;
    const detailText = anchorItemNow
      ? itemDetailText(
          toDetail(anchorItemNow, anchorItemNow.type, {
            loggedDays: anchorItemNow.logged_days || [],
            spaceName: anchorItemNow.space_name || null,
            timezone: TZ,
          }),
          todayIso,
        )
      : '';
    const system =
      gen.systemPrompt +
      turnItemSections({
        match,
        card,
        recent,
        anchor: anchorNow,
        mode: triage.mode,
        todayIso,
        detailText,
      });
    // what the reply was told it can see, for the results file
    const theirs = theirItemsPromptSection(match, todayIso, {
      mode: triage.mode,
      card,
      anchor: anchorNow,
    });
    // DUMP_PROMPTS=<dir> keeps each turn's reply prompt, for reading what the reply was told
    if (process.env.DUMP_PROMPTS)
      writeFileSync(
        join(process.env.DUMP_PROMPTS, `${sc.id.replace(/[^\w.-]/g, '_')}-${turns.length + 1}.txt`),
        system,
      );
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
    const tPill = Date.now();
    const pill = gated
      ? {
          skipped: true,
          items: [],
          rawNew: [],
          lateCard: null,
          lateCardHeld: null,
          lateCardFull: null,
          ungrounded: 0,
        }
      : await extraction(
          items,
          [...lead, ...history],
          card,
          match,
          recent,
          shownCards,
          message,
          exchanges,
        );
    if (card && card.kind === 'edit') shownCards.push(card);
    if (pill.lateCardFull) shownCards.push(pill.lateCardFull);
    pill.gated = gated;
    // how long the extraction took (the Worker adds a Supabase read and write)
    pill.ms = gated ? 0 : Date.now() - tPill;
    // an asked-for card is assumed tapped; one offered in passing is left for the user
    const tapped = !!card && card.kind === 'edit' && !card.inPassing;
    // the tap lands before the next turn, unless that turn turns the card down
    pendingTap = tapped ? card : null;
    if (card && card.kind !== 'choose') {
      recent = {
        ...card.entity,
        status: tapped ? 'applied' : 'pending',
        summary: tapped ? appSummary(card, todayIso) : null,
        // what the card was for, as the app sends it (recentEntityFor): an
        // edit card carries the change, a view card what it was shown for
        // (OLD_APP=on sends what builds before the change was sent: the kind only)
        card:
          card.kind === 'edit'
            ? OLD_APP
              ? { kind: 'edit' }
              : { kind: 'edit', change: card.change }
            : { kind: card.kind, intent: card.intent || null, already: !!card.already },
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
      `${sc.id} | ${message.slice(0, 48)} | ${triage.mode}${card ? ` | card ${card.kind}${card.inPassing ? ' (in passing)' : ''}: ${card.entity?.title || ''}${card.change ? ` ${card.change.field}->${card.change.days ? card.change.days.join(',') : card.change.to}` : ''}` : ''} | about ${(match?.related || []).length} | pill ${pill.items.length}${gated ? ' (gated)' : ''}${pill.lateCard ? ` | late card: ${pill.lateCard.title} ${pill.lateCard.field}->${pill.lateCard.to}` : ''}${pill.lateCardHeld ? ` | held: ${pill.lateCardHeld.title} ${pill.lateCardHeld.field}->${pill.lateCardHeld.to}` : ''} | ${tCard}ms`,
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
