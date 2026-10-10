/**
 * CardAsk and CardDupe: a drop card's question, asked on the card (Mind Drop
 * rethink stage 6). No popup opens from Mind Drop any more.
 *
 * - CardAsk shows the card's strip (the ask chosen by asks.cardStripAsk): an
 *   unclear drop's question with its answers and Something else, a relation's
 *   question with the item it means, or a which one list. One strip at a
 *   time: a new ask, or the next step of this one (When is it?, Which one did
 *   you mean?), comes in once the last has closed. Answers go through
 *   askActions.answerAsk, so the card and Sweep share one path.
 * - An unsure split asks One job or two? with its pieces shown, from the
 *   sort (stage 7): Split saves the pieces as their own items and the card
 *   gives way to them; Keep as one keeps the one item; Not now keeps it as
 *   one and Sweep asks again. Each answer is logged (splitActions).
 * - CardDupe is the quiet duplicate line, with Keep just one: the drop glides
 *   into the one they had, which pulses once it arrives.
 *
 * After a yes: the cards that go are held in place, the change is made, the
 * strip closes, the cards slide away, the toast comes in with Undo, and
 * Gremly's bubble says what happened (the outcome's own words, no new call).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { format, parseISO } from 'date-fns';
import { Check, Split } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getDateService } from '../../lib/date/DateService';
import { eventBus, type EventMap } from '../../lib/events/EventBus';
import { useReducedMotion } from '../../design/animations';
import { AskStrip, ASK_CLOSE_MS, type AskButton } from './AskStrip';
import { DupeLine } from './DupeLine';
import { KIND_ICONS } from './DropCard';
import type { Ask } from '../../lib/minddrop/asks';
import { answerAsk, notNow } from '../../lib/minddrop/askActions';
import {
  buildFallbackClarification,
  hasUsableClarification,
  mapWorkerOptions,
  type ClarificationOption,
  type ClarificationWhen,
} from '../../lib/minddrop/clarification';
import {
  fitsRelation,
  rawChangeOf,
  relationButtons,
  relationQuestion,
  type HeldRelation,
  type RelationChange,
  type RelationEntity,
} from '../../lib/minddrop/dropRelation';
import {
  applyDropRelation,
  changeNow,
  currentEntity,
  leavingCardIds,
  type RelationOutcome,
} from '../../lib/minddrop/relationActions';
import { describeChange, formatDay, formatTime } from '../../lib/chat/entityCards';
import {
  KIND_COLORS,
  dropCardKind,
  howOftenWords,
  itemStateWords,
  type DropCardKind,
} from '../../lib/minddrop/dropCardModel';
import { TOAST_AFTER_CARDS_MS } from '../../lib/minddrop/popupTiming';
import { weekAround, weeklyTarget } from '../../lib/week/habitWeek';
import {
  keepSplitAsOne,
  logSplitAnswer,
  numberWord,
  splitDropNow,
} from '../../lib/minddrop/splitActions';
import { wordsAsTitle } from '../../workers/shared/titles';
import type { UnifiedDrop } from '../../types/UnifiedDrop';

/** The gap between one strip closing and the next opening (the prototype's .38s). */
export const ASK_SWAP_MS = 380;
/** After Log it, the week dot pops before the strip closes. */
const LOGGED_POP_MS = 650;
/** Keep just one: the drop glides into the one they had (the prototype's .52s), then it pulses. */
export const GLIDE_MS = 520;
const BUBBLE_MS = 4000;
const DIDNT_GO = 'That did not go through. Try again in a moment.';

type Step =
  | { name: 'main' }
  | { name: 'when'; optionId: string }
  | { name: 'choose'; options: RelationEntity[] };
const MAIN: Step = { name: 'main' };

/** What a strip says and offers. */
type StripWords = {
  question: string;
  extra?: React.ReactNode;
  buttons: AskButton[];
  hint?: string | null;
  onFreeText?: (text: string) => void;
  onNotNow?: () => void;
};

/** Which ask this is, so a new one is told apart from the one showing. */
export function askKey(ask: Ask): string {
  const rel = ask.relation;
  if (!rel) return ask.kind;
  const about = rel.kind === 'choose' ? rel.candidates.map((c) => c.id).join(',') : rel.entity.id;
  return `${ask.kind}:${rel.intent}:${about}`;
}

const upFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

type StoreItem = Record<string, any> & { id: string };

function storeItemOf(e: RelationEntity): StoreItem | null {
  const s = useGremlyStore.getState() as unknown as Record<string, StoreItem[]>;
  const list = e.type === 'todo' ? s.todos : e.type === 'habit' ? s.habits : s.notes;
  return (list || []).find((x) => x.id === e.id) ?? null;
}

/** The card kind of an item they have, for its tile. */
function kindOfItem(e: RelationEntity, item: StoreItem | null): DropCardKind {
  if (e.type !== 'note') return e.type;
  return dropCardKind({ kind: 'note', noteSubtype: item?.subtype ?? null });
}

/** A weekly habit's week: its target and how many are done (the prototype's dots). */
function habitWeek(item: StoreItem | null): { target: number; done: number } | null {
  if (!item) return null;
  const target = weeklyTarget(item);
  if (!target || target < 2 || target > 7) return null;
  const s = useGremlyStore.getState();
  const today = getDateService().today();
  const { first } = weekAround(today, s.weeklyDay);
  const done = (s.habitProgress || []).filter(
    (p: { habit_id: string; occurred_day: string }) =>
      p.habit_id === item.id && p.occurred_day >= first && p.occurred_day <= today,
  ).length;
  return { target, done: Math.min(done, target) };
}

function Dot({ on, pop }: { on: boolean; pop: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  React.useEffect(() => {
    if (!pop || reduced) return;
    scale.value = withSequence(
      withTiming(1.5, { duration: 180 }),
      withTiming(1, { duration: 220 }),
    );
  }, [pop, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Reanimated.View style={[styles.dot, on && styles.dotOn, style]} />;
}

/** The item a relation means, as a mini row: its tile, title and state (and a habit's week). */
export function ItemRow({
  entity,
  change,
  extra,
  logged,
  testID,
}: {
  entity: RelationEntity;
  change?: RelationChange | null;
  extra?: string | null;
  /** Log it was tapped: the next dot fills */
  logged?: boolean;
  testID?: string;
}) {
  const item = storeItemOf(entity);
  const kind = kindOfItem(entity, item);
  const Icon = KIND_ICONS[kind];
  const week = entity.type === 'habit' ? habitWeek(item) : null;
  const done = week ? Math.min(week.target, week.done + (logged ? 1 : 0)) : 0;

  let sub: string | null;
  if (
    change &&
    change.field !== 'body_add' &&
    change.field !== 'completed' &&
    change.field !== 'logged'
  ) {
    const words = describeChange(entity, change);
    const to =
      change.field === 'due_day' && change.time_to
        ? `${formatDay(change.to)}, ${formatTime(change.time_to)}`
        : words.to;
    sub = `${words.from} → ${to}`;
  } else if (change?.field === 'body_add') {
    sub = `Adds: ${change.to}`;
  } else if (extra) {
    sub = `Adds: ${extra}`;
  } else if (entity.type === 'habit') {
    const often = item ? howOftenWords(item)?.text : null;
    sub = week ? [often, `${done} done`].filter(Boolean).join(' · ') : (often ?? null);
  } else {
    const state = item ? itemStateWords(item, entity.type) : null;
    sub = state ? upFirst(state) : null;
  }

  return (
    <View style={styles.mini} testID={testID}>
      <View style={[styles.miniTile, { backgroundColor: KIND_COLORS[kind].wash }]}>
        <Icon size={16} strokeWidth={2} color={KIND_COLORS[kind].ink} />
      </View>
      <View style={styles.miniText}>
        <Text style={styles.miniTitle} numberOfLines={2}>
          {entity.title}
        </Text>
        {sub ? (
          <Text style={styles.miniSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {week ? (
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`${done} of ${week.target} this week`}
        >
          {Array.from({ length: week.target }, (_, i) => (
            <Dot key={i} on={i < done} pop={!!logged && i === done - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The kind tile of a piece of an unsure split, as views.split keeps its kind word. */
function pieceKind(word: unknown): DropCardKind {
  if (word === 'question') return 'ask';
  if (
    word === 'todo' ||
    word === 'habit' ||
    word === 'event' ||
    word === 'journal' ||
    word === 'idea'
  ) {
    return word;
  }
  return 'note';
}

/** An unsure split's pieces, each with its kind tile and its words. */
export function SplitPieces({
  pieces,
  testID,
}: {
  pieces: Array<Record<string, unknown>>;
  testID?: string;
}) {
  return (
    <View style={styles.pieces} testID={testID}>
      {pieces.map((p, i) => {
        const kind = pieceKind(p.kind);
        const Icon = KIND_ICONS[kind];
        return (
          <View key={i} style={styles.piece} testID={testID ? `${testID}-${i}` : undefined}>
            <View style={[styles.pieceTile, { backgroundColor: KIND_COLORS[kind].wash }]}>
              <Icon size={13} strokeWidth={2.2} color={KIND_COLORS[kind].ink} />
            </View>
            <Text style={styles.pieceText} numberOfLines={2}>
              {wordsAsTitle(String(p.text || ''))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

type ToastPayload = EventMap['minddrop:relation_done'];

function toastOf(outcome: RelationOutcome): ToastPayload {
  return {
    ...outcome.toast,
    undo: outcome.undo,
    // a removed item has nothing to open
    target:
      outcome.toast.icon === 'removed' ? null : { id: outcome.targetId, type: outcome.targetType },
  };
}

/**
 * After a yes: the strip has closed (or the line has gone), so the held cards
 * slide away, the toast follows a beat later, and the bubble says what
 * happened. Not tied to the card, which may be leaving.
 */
function afterYes(outcome: RelationOutcome, leaving: string[], pulseId?: string, pulseAfterMs = 0) {
  setTimeout(() => {
    if (leaving.length) eventBus.emit('minddrop:cards_go', { ids: leaving });
    // after Keep just one, the one they had pulses once the drop has glided into it
    if (pulseId) {
      if (pulseAfterMs > 0) {
        setTimeout(() => eventBus.emit('minddrop:card_pulse', { id: pulseId }), pulseAfterMs);
      } else {
        eventBus.emit('minddrop:card_pulse', { id: pulseId });
      }
    }
    eventBus.emit('gremly:speak', { message: outcome.summary, duration: BUBBLE_MS });
    setTimeout(
      () => eventBus.emit('minddrop:relation_done', toastOf(outcome)),
      TOAST_AFTER_CARDS_MS,
    );
  }, ASK_CLOSE_MS);
}

/** The clarify answers as the strip shows them, or the fixed copy when the saved ones are not usable. */
function clarifyWords(item: UnifiedDrop): { question: string; options: ClarificationOption[] } {
  const views = (item.views || {}) as Record<string, unknown>;
  const question = (item.clarification_question || views.clarification_question) as
    | string
    | undefined;
  const raw = item.clarification_options || views.clarification_options;
  const bucket = item.kind === 'todo' ? 'todo' : item.kind === 'habit' ? 'habit' : 'log';
  const options = mapWorkerOptions(raw, bucket);
  if (question && options && hasUsableClarification(question, options)) {
    return { question, options };
  }
  const type = (views.ambiguity_type as string | undefined) ?? null;
  console.warn('[CardAsk] the saved question is not usable; asking with the fixed copy', {
    id: item.id,
    hasQuestion: !!question,
    options: Array.isArray(raw) ? raw.length : 0,
  });
  const fallback = buildFallbackClarification(type);
  return { question: fallback.question, options: fallback.options };
}

export function CardAsk({
  item,
  ask,
  testID,
}: {
  item: UnifiedDrop;
  ask: Ask | null;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const swapMs = reduced ? 0 : ASK_SWAP_MS;
  const [shown, setShown] = React.useState<{ ask: Ask; step: Step } | null>(
    ask ? { ask, step: MAIN } : null,
  );
  const [open, setOpen] = React.useState(!!ask);
  const [error, setError] = React.useState<string | null>(null);
  const [logged, setLogged] = React.useState(false);
  // a which one answered Log it: the habit picked, shown with its dot filling
  const [loggedTo, setLoggedTo] = React.useState<RelationEntity | null>(null);
  // an answer is being made: the strip stays as it is until it finishes
  const busy = React.useRef(false);
  const swapping = React.useRef(false);
  const swapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAsk = React.useRef<Ask | null>(ask);
  React.useEffect(() => {
    latestAsk.current = ask;
  });
  React.useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  /** Close what shows; then show `next`, or whatever the card asks by then. */
  const closeThen = React.useCallback(
    (next?: { ask: Ask; step: Step }) => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
      swapping.current = true;
      setOpen(false);
      swapTimer.current = setTimeout(() => {
        swapping.current = false;
        const now = latestAsk.current;
        const to = next ?? (now ? { ask: now, step: MAIN } : null);
        setError(null);
        setLogged(false);
        setLoggedTo(null);
        setShown(to);
        setOpen(!!to);
      }, swapMs);
    },
    [swapMs],
  );

  // A new ask, or none: the one showing closes and the next comes in
  React.useEffect(() => {
    if (busy.current || swapping.current) return;
    if (shown && ask && askKey(shown.ask) === askKey(ask)) return;
    if (!shown && !ask) return;
    if (!shown && ask) {
      setShown({ ask, step: MAIN });
      setOpen(true);
      return;
    }
    closeThen();
  }, [ask, shown, closeThen]);

  if (!shown) return null;
  const id = item.id;
  const tid = testID ?? `minddrop-ask-${id}`;

  const onNotNow = () => {
    notNow(id).catch((err) => {
      console.warn('[CardAsk] Not now did not save', { id, error: String(err) });
      setError(DIDNT_GO);
    });
  };

  // ── clarify ────────────────────────────────────────────────────────────
  const answerClarify = (
    optionId: string,
    opts: { isFreeText?: boolean; when?: ClarificationWhen | null } = {},
  ) => {
    setError(null);
    const key = askKey(shown.ask);
    answerAsk(id, {
      kind: 'clarify',
      optionId,
      isFreeText: opts.isFreeText,
      when: opts.when ?? null,
    })
      .then(() => {
        // nothing changed (the option was not found, or the item has gone): say so
        const now = latestAsk.current;
        if (now && askKey(now) === key) setError(DIDNT_GO);
      })
      .catch((err) => {
        console.warn('[CardAsk] the answer did not save', { id, error: String(err) });
        setError(DIDNT_GO);
      });
  };

  function relationStrip(rel: HeldRelation): StripWords {
    const yes = async (picked?: RelationEntity) => {
      busy.current = true;
      setError(null);
      const leaving = leavingCardIds(id, picked);
      if (leaving.length) eventBus.emit('minddrop:cards_leaving', { ids: leaving, hold: true });
      try {
        const outcome = (await answerAsk(id, {
          kind: 'relation',
          yes: true,
          picked,
        })) as RelationOutcome;
        if (outcome.toast.icon === 'logged') {
          // the small card of the habit shows its week's next dot fill, then the strip closes
          setLogged(true);
          if (picked) setLoggedTo(picked);
          if (!reduced) await new Promise((r) => setTimeout(r, LOGGED_POP_MS));
        }
        busy.current = false;
        closeThen();
        afterYes(outcome, leaving);
      } catch (err) {
        busy.current = false;
        if (leaving.length) eventBus.emit('minddrop:cards_stay', { ids: leaving });
        setError(err instanceof Error && err.message ? err.message : DIDNT_GO);
      }
    };
    const no = () => {
      setError(null);
      answerAsk(id, { kind: 'relation', yes: false }).catch((err) => {
        console.warn('[CardAsk] keeping it as new did not save', { id, error: String(err) });
        setError(DIDNT_GO);
      });
    };
    const chooseFrom = (options: RelationEntity[]): StripWords => ({
      question: 'Which one did you mean?',
      extra: loggedTo ? (
        <ItemRow entity={loggedTo} logged={logged} testID={`${tid}-item`} />
      ) : undefined,
      buttons: [
        ...options.map((o) => {
          const now = currentEntity(o).entity ?? o;
          return {
            key: `pick-${o.id}`,
            label: now.title,
            testID: `${tid}-pick-${o.id}`,
            onPress: () => yes(now),
          };
        }),
        { key: 'none', label: 'None of these, keep it as new', testID: `${tid}-none`, onPress: no },
      ],
      onNotNow,
    });

    if (shown!.step.name === 'choose') return chooseFrom(shown!.step.options);
    if (rel.kind === 'choose') return chooseFrom(rel.candidates);

    const now = currentEntity(rel.entity);
    if (!now.entity) {
      return {
        question: now.gone || 'That one is no longer on your list.',
        buttons: [
          { key: 'keep', label: 'Keep this as new', testID: `${tid}-keep-new`, onPress: no },
        ],
        onNotNow,
      };
    }
    const entity = now.entity;
    const words = relationButtons(rel);
    const change = rel.kind === 'edit' ? (changeNow(rel, entity) ?? rel.change) : null;
    const notThatOne = () => {
      const today = getDateService().today();
      const raw = rawChangeOf(rel);
      const others = rel.others.filter(
        (o) => !!currentEntity(o).entity && fitsRelation(rel.intent, o, raw, today),
      );
      if (others.length) {
        closeThen({ ask: shown!.ask, step: { name: 'choose', options: others } });
        return;
      }
      no();
    };
    const tick = rel.intent === 'logged' || rel.intent === 'complete';
    return {
      question: relationQuestion(rel),
      extra: (
        <ItemRow
          entity={entity}
          change={change}
          extra={rel.kind === 'same' ? rel.extra : null}
          logged={logged}
          testID={`${tid}-item`}
        />
      ),
      buttons: [
        {
          key: 'yes',
          label: words.primary,
          icon: tick ? Check : undefined,
          testID: `${tid}-yes`,
          onPress: () => yes(),
        },
        {
          key: 'no',
          label: words.secondary,
          testID: `${tid}-no`,
          // "Not that one" offers the others first; "Keep both" and "Keep separate" keep it as new
          onPress: rel.kind === 'edit' && rel.intent !== 'add' ? notThatOne : no,
        },
      ],
      hint: words.hint,
      onNotNow,
    };
  }

  function splitStrip(): StripWords {
    const views = (item.views || {}) as Record<string, any>;
    const pieces: Array<Record<string, unknown>> = Array.isArray(views.split?.pieces)
      ? views.split.pieces
      : [];
    const count = numberWord(pieces.length);
    const target = { type: item.kind, id };
    const split = async () => {
      busy.current = true;
      setError(null);
      // the card waits in place while its pieces are saved, then gives way to them
      eventBus.emit('minddrop:cards_leaving', { ids: [id], hold: true, as: 'fade' });
      try {
        await splitDropNow(id);
        busy.current = false;
        closeThen();
        setTimeout(() => eventBus.emit('minddrop:cards_go', { ids: [id] }), ASK_CLOSE_MS);
      } catch (err) {
        busy.current = false;
        eventBus.emit('minddrop:cards_stay', { ids: [id] });
        console.warn('[CardAsk] the split did not go through', { id, error: String(err) });
        setError(err instanceof Error && err.message ? err.message : DIDNT_GO);
      }
    };
    const keep = () => {
      setError(null);
      keepSplitAsOne(id)
        .then((kept) => {
          // nothing changed (the item has gone, or it was answered elsewhere): say so
          if (!kept) setError(DIDNT_GO);
        })
        .catch((err) => {
          console.warn('[CardAsk] keeping it as one did not save', { id, error: String(err) });
          setError(DIDNT_GO);
        });
    };
    return {
      question: `One job or ${count}?`,
      extra: <SplitPieces pieces={pieces} testID={`${tid}-pieces`} />,
      buttons: [
        {
          key: 'split',
          label: `Split into ${count}`,
          icon: Split,
          testID: `${tid}-split`,
          onPress: () => void split(),
        },
        { key: 'keep', label: 'Keep as one', testID: `${tid}-keep-one`, onPress: keep },
      ],
      hint: 'Keep as one is the safe choice',
      onNotNow: () => {
        notNow(id)
          .then(() => logSplitAnswer('unsure', 'not_now', pieces.length, target))
          .catch((err) => {
            console.warn('[CardAsk] Not now did not save', { id, error: String(err) });
            setError(DIDNT_GO);
          });
      },
    };
  }

  let strip: StripWords;
  if (shown.ask.kind === 'split') {
    strip = splitStrip();
  } else if (shown.ask.kind === 'clarify' && shown.step.name === 'when') {
    const optionId = shown.step.optionId;
    const ds = getDateService();
    const today = ds.today();
    const days = [
      { key: 'tomorrow', label: 'Tomorrow', date: ds.addDays(today, 1) },
      {
        key: 'in-two',
        label: format(parseISO(ds.addDays(today, 2)), 'EEE d MMM'),
        date: ds.addDays(today, 2),
      },
      { key: 'next-week', label: 'Next week', date: ds.addDays(today, 7) },
    ];
    strip = {
      question: 'When is it?',
      buttons: days.map((d) => ({
        key: d.key,
        label: d.label,
        testID: `${tid}-when-${d.key}`,
        onPress: () => answerClarify(optionId, { when: { date: d.date, time: null } }),
      })),
      hint: 'You can add a time later',
      // the prototype's When is it?: Not now files it without a day
      onNotNow: () => answerClarify(optionId),
    };
  } else if (shown.ask.kind === 'clarify') {
    const words = clarifyWords(item);
    strip = {
      question: words.question,
      buttons: words.options.map((o) => ({
        key: o.id,
        label: o.label,
        testID: `${tid}-option-${o.id}`,
        onPress: () => {
          if (o.action?.followUp === 'when') {
            closeThen({ ask: shown.ask, step: { name: 'when', optionId: o.id } });
            return;
          }
          answerClarify(o.id);
        },
      })),
      onFreeText: (text) => answerClarify(text, { isFreeText: true }),
      onNotNow,
    };
  } else if (shown.ask.relation) {
    strip = relationStrip(shown.ask.relation);
  } else {
    // a same is the quiet line, never a strip (cardStripAsk does not offer one)
    console.warn('[CardAsk] no strip for this ask', { id, kind: shown.ask.kind });
    return null;
  }

  return (
    <AskStrip
      key={`${askKey(shown.ask)}:${shown.step.name}`}
      open={open}
      question={strip.question}
      extra={strip.extra}
      buttons={strip.buttons}
      onFreeText={strip.onFreeText}
      hint={strip.hint}
      error={error}
      onNotNow={strip.onNotNow}
      testID={tid}
    />
  );
}

/**
 * The quiet duplicate line: You already have this, its state, and Keep just
 * one, which keeps anything new the drop said on the one they had and
 * archives the drop, with Undo. The one they had pulses once as the drop
 * leaves.
 */
export function CardDupe({ item, ask, testID }: { item: UnifiedDrop; ask: Ask; testID?: string }) {
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const rel = ask.relation;
  if (!rel || rel.kind !== 'same') return null;
  const now = currentEntity(rel.entity);
  const had = now.entity ? storeItemOf(now.entity) : null;
  const state = had ? itemStateWords(had, rel.entity.type) : null;
  const tid = testID ?? `minddrop-dupe-${item.id}`;

  const keepOne = async () => {
    // a ref, so two quick taps cannot both start it
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const leaving = leavingCardIds(item.id);
    // the drop glides into the one they had (when its card is on the list)
    if (leaving.length) {
      eventBus.emit('minddrop:cards_leaving', {
        ids: leaving,
        hold: true,
        as: 'into',
        into: rel.entity.id,
      });
    }
    try {
      const outcome = await applyDropRelation(item.id);
      afterYes(outcome, leaving, outcome.targetId, GLIDE_MS);
    } catch (err) {
      if (leaving.length) eventBus.emit('minddrop:cards_stay', { ids: leaving });
      setError(err instanceof Error && err.message ? err.message : DIDNT_GO);
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <DupeLine state={state} error={error} onKeepOne={keepOne} busy={busy} testID={tid} />;
}

const styles = StyleSheet.create({
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#F9F6F1',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.08)',
  },
  miniTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniText: { flex: 1, minWidth: 0 },
  miniTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: '#1A3328' },
  miniSub: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: '#5C6660' },
  dots: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  pieces: { gap: 6 },
  piece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F9F6F1',
  },
  pieceTile: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieceText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 13.5, color: '#1F2421' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#D5DED4' },
  dotOn: { backgroundColor: '#454A86' },
});

export default CardAsk;
