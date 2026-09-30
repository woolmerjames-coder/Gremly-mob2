/**
 * RelationPopup: "is this drop about something you already have?"
 *
 * Opened from the drop's card (its one quiet line) or in Sweep. The same frame
 * as the question popup, with the item shown the way the chat's entity card
 * shows it. Mockup is spec (Mind Drop "drops about things you already have"
 * canvas, September 2026). Nothing changes until a button is tapped. After a
 * yes the popup shows a short confirmation and closes; a toast then says what
 * happened, with Undo (RelationToast), and the cards that went slide out of
 * Recent Drops. Closing without a tap leaves the question on the card; "Skip
 * for now" files the drop as it was classified.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle,
  ChevronRight,
  Repeat,
  StickyNote,
} from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { eventBus } from '../../lib/events/EventBus';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { getDateService } from '../../lib/date/DateService';
import {
  describeChange,
  entityKind,
  entitySubtitle,
  formatDay,
  formatTime,
} from '../../lib/chat/entityCards';
import {
  fitsRelation,
  rawChangeOf,
  relationButtons,
  relationOf,
  relationQuestion,
  type HeldRelation,
  type RelationChange,
  type RelationEntity,
} from '../../lib/minddrop/dropRelation';
import {
  applyDropRelation,
  changeNow,
  currentEntity,
  keepDropAsNew,
  leavingCardIds,
  type RelationOutcome,
} from '../../lib/minddrop/relationActions';
import { POPUP_FADE_MS, TOAST_AFTER_CARDS_MS } from '../../lib/minddrop/popupTiming';

/** How long the tick shows after a yes before the popup gets out of the way. */
export const CONFIRM_MS = 900;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type RelationResolution = 'applied' | 'kept' | 'clarify';

interface RelationPopupProps {
  visible: boolean;
  /** the held drop (a note carrying views.relation) */
  noteId: string | null;
  /** closed without deciding: the question stays on the card */
  onClose: () => void;
  /** the user decided; Sweep moves on or refreshes the card. targetId: the item a yes changed */
  onResolved?: (outcome: RelationResolution, targetId?: string) => void;
  /** tapping the item opens it in full; the host brings this popup back when it closes */
  onOpenItem?: (entity: RelationEntity) => void;
}

function TypeIcon({ type }: { type: RelationEntity['type'] }) {
  const color = lightTokens.colors.mossGreen;
  if (type === 'habit') return <Repeat size={18} color={color} />;
  if (type === 'note') return <StickyNote size={18} color={color} />;
  return <CalendarCheck size={18} color={color} />;
}

/** "added 4 min ago", from the item's created time. */
function addedAgo(createdAt: string | null | undefined, nowMs: number): string | null {
  if (!createdAt) return null;
  const ms = nowMs - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'added just now';
  if (mins < 60) return `added ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `added ${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `added ${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (days < 60) return `added ${weeks} weeks ago`;
  return `added ${Math.round(days / 30)} months ago`;
}

/** "logged Mon, Tue" for the days logged in the last week. */
function loggedLately(days: string[] | undefined, todayIso: string): string {
  const d0 = new Date(`${todayIso}T12:00:00Z`).getTime();
  const recent = (days || [])
    .filter((d) => {
      const diff = (d0 - new Date(`${d}T12:00:00Z`).getTime()) / 86400000;
      return diff >= 0 && diff < 7;
    })
    .sort();
  if (!recent.length) return 'nothing logged this week';
  return `logged ${recent.map((d) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]).join(', ')}`;
}

function createdAtOf(e: RelationEntity): string | null {
  const s = useGremlyStore.getState();
  const list: Array<{ id: string; created_at?: string }> =
    e.type === 'todo' ? s.todos : e.type === 'habit' ? s.habits : s.notes;
  return list.find((x) => x.id === e.id)?.created_at ?? null;
}

function changeWords(entity: RelationEntity, change: RelationChange) {
  const words = describeChange(entity, change);
  if (change.field === 'due_day' && change.time_to) {
    return { ...words, to: `${formatDay(change.to)}, ${formatTime(change.time_to)}` };
  }
  return words;
}

function ItemCard({
  entity,
  subtitle,
  change,
  extra,
  onPress,
  pressLabel,
  testID,
}: {
  entity: RelationEntity;
  subtitle: string;
  change?: RelationChange | null;
  extra?: string | null;
  onPress?: () => void;
  /** what tapping it does, for screen readers */
  pressLabel?: string;
  testID?: string;
}) {
  const words = change ? changeWords(entity, change) : null;
  const body = (
    <>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <TypeIcon type={entity.type} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {entity.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {onPress ? <ChevronRight size={20} color={lightTokens.colors.subtle} /> : null}
      </View>
      {change && words ? (
        change.field === 'body_add' ? (
          <View style={styles.addBox}>
            <Text style={styles.addLabel}>Adds a line</Text>
            <Text style={styles.addText} numberOfLines={3}>
              {change.to}
            </Text>
          </View>
        ) : (
          <View style={styles.changeRow}>
            <View style={styles.changeCol}>
              <Text style={styles.changeLabel}>Now</Text>
              <Text style={styles.changeValue} numberOfLines={1}>
                {words.from}
              </Text>
            </View>
            <ArrowRight size={16} color={lightTokens.colors.subtle} />
            <View style={styles.changeCol}>
              <Text style={styles.changeLabel}>{words.label}</Text>
              <Text style={[styles.changeValue, styles.changeValueTo]} numberOfLines={1}>
                {words.to}
              </Text>
            </View>
          </View>
        )
      ) : null}
      {extra ? (
        <Text style={styles.extra} numberOfLines={2}>
          Adds: {extra}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.card} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={pressLabel ?? `Choose ${entity.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export function RelationPopup({
  visible,
  noteId,
  onClose,
  onResolved,
  onOpenItem,
}: RelationPopupProps) {
  const note = useGremlyStore((s) => (noteId ? s.notes.find((n) => n.id === noteId) : undefined));
  const live = relationOf(note?.views);
  const originalText = String((note as { body?: string } | undefined)?.body || note?.title || '');

  // The question as it was when the popup opened, so the done state can
  // still show it after the drop has been cleared away.
  const [snap, setSnap] = useState<HeldRelation | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [view, setView] = useState<'ask' | 'choose' | 'done'>('ask');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RelationOutcome | null>(null);
  const finished = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the cards a yes will clear, held in place until the popup has gone
  const leavingIds = useRef<string[]>([]);
  // Guards that hold within a frame, where state would be stale
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    if (visible && live?.status === 'pending' && !snap) {
      queueMicrotask(() => {
        setSnap(live);
        setNowMs(getDateService().now().getTime());
        setView(live.kind === 'choose' ? 'choose' : 'ask');
      });
    }
  }, [visible, live, snap]);

  useEffect(() => {
    if (!visible) {
      queueMicrotask(() => {
        setSnap(null);
        setView('ask');
        setBusy(false);
        setError(null);
        setDone(null);
      });
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
  }, [visible]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const rel = snap;
  const todayIso = getDateService().today();

  const shown = useMemo(() => {
    if (!rel || rel.kind === 'choose') return null;
    return currentEntity(rel.entity);
  }, [rel]);

  const otherChoices = useMemo(() => {
    if (!rel) return [];
    if (rel.kind === 'choose') return rel.candidates;
    const raw = rawChangeOf(rel);
    return rel.others.filter(
      (o) => !!currentEntity(o).entity && fitsRelation(rel.intent, o, raw, todayIso),
    );
  }, [rel, todayIso]);

  const startBusy = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };
  const endBusy = () => {
    busyRef.current = false;
    if (mounted.current) setBusy(false);
  };

  // The caller's callbacks as of the latest render, so the close timer is not
  // restarted every time the screen behind re-renders
  const latest = useRef({ onClose, onResolved, done });
  useEffect(() => {
    latest.current = { onClose, onResolved, done };
  });

  // After the tick the popup closes. Once it has faded, the cards slide away
  // and then the toast (with Undo) comes in: one thing at a time, so each is
  // seen. Runs once, from the timer or from a tap outside.
  const finishApplied = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    const { onClose: close, onResolved: resolved, done: outcome } = latest.current;
    if (finished.current || !outcome) return;
    finished.current = true;
    const ids = leavingIds.current;
    const toast = {
      ...outcome.toast,
      undo: outcome.undo,
      // a removed item has nothing to open
      target:
        outcome.toast.icon === 'removed'
          ? null
          : { id: outcome.targetId, type: outcome.targetType },
    };
    resolved?.('applied', outcome.targetId);
    close();
    // not tied to this popup: it is closing, and the screen behind carries on
    setTimeout(() => {
      if (ids.length) eventBus.emit('minddrop:cards_go', { ids });
      setTimeout(() => eventBus.emit('minddrop:relation_done', toast), TOAST_AFTER_CARDS_MS);
    }, POPUP_FADE_MS);
  }, []);

  const keep = useCallback(async () => {
    if (!noteId || !startBusy()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const outcome = await keepDropAsNew(noteId);
      if (!mounted.current) return;
      onResolved?.(outcome);
      onClose();
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      endBusy();
    }
  }, [noteId, onClose, onResolved]);

  const yes = useCallback(
    async (picked?: RelationEntity) => {
      if (!noteId || !startBusy()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setError(null);
      // The cards that will go: Recent Drops holds them in place, and slides
      // them out once the popup has gone rather than dropping them behind it
      const leaving = leavingCardIds(noteId, picked);
      leavingIds.current = leaving;
      if (leaving.length) eventBus.emit('minddrop:cards_leaving', { ids: leaving, hold: true });
      try {
        const outcome = await applyDropRelation(noteId, picked);
        latest.current = { ...latest.current, done: outcome };
        if (!mounted.current) {
          finishApplied();
          return;
        }
        setDone(outcome);
        setView('done');
      } catch (err) {
        leavingIds.current = [];
        if (leaving.length) eventBus.emit('minddrop:cards_stay', { ids: leaving });
        if (mounted.current) {
          setError(err instanceof Error ? err.message : 'That change did not go through.');
        }
      } finally {
        endBusy();
      }
    },
    [noteId, finishApplied],
  );

  // After a yes the tick shows briefly, then the toast takes over
  useEffect(() => {
    if (view !== 'done' || !done) return;
    closeTimer.current = setTimeout(() => finishApplied(), CONFIRM_MS);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [view, done, finishApplied]);

  const notThatOne = useCallback(() => {
    if (otherChoices.length) {
      setError(null);
      setView('choose');
      return;
    }
    keep();
  }, [otherChoices, keep]);

  // Nothing closes the popup while a tap is being saved
  const dismiss = () => {
    if (busyRef.current) return;
    if (view === 'done') finishApplied();
    else onClose();
  };

  if (!visible) return null;

  const subtitleFor = (e: RelationEntity, withWhen: boolean) => {
    if (rel?.intent === 'same') {
      const ago = addedAgo(createdAtOf(e), nowMs);
      return [entityKind(e), ago].filter(Boolean).join(' · ');
    }
    if (e.type === 'habit' && rel?.intent === 'logged') {
      return [entitySubtitle(e), loggedLately(e.logged_days, todayIso)].join(' · ');
    }
    return entitySubtitle(e, { withWhen });
  };

  let content: React.ReactNode;
  if (!rel && live && live.status !== 'pending') {
    // opened on a drop that has been sorted since (another screen, a sync)
    content = (
      <>
        <Text style={styles.question}>This one has already been sorted.</Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
      </>
    );
  } else if (!rel) {
    content = <ActivityIndicator size="small" color="#4A7C59" />;
  } else if (view === 'done' && done) {
    content = (
      <View style={styles.doneWrap} testID="relation-done">
        <CheckCircle size={40} color="#4A7C59" />
        <Text style={styles.doneText}>{done.confirm}</Text>
      </View>
    );
  } else if (view === 'choose') {
    content = (
      <>
        <Text style={styles.question}>Which one did you mean?</Text>
        <View style={styles.list}>
          {otherChoices.map((c) => {
            const now = currentEntity(c).entity ?? c;
            return (
              <ItemCard
                key={c.id}
                entity={now}
                subtitle={subtitleFor(now, true)}
                onPress={busy ? undefined : () => yes(now)}
                testID={`relation-choice-${c.id}`}
              />
            );
          })}
        </View>
        <Pressable
          testID="relation-none"
          onPress={keep}
          disabled={busy}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>None of these, keep it as new</Text>
        </Pressable>
      </>
    );
  } else if (rel.kind !== 'choose' && shown && !shown.entity) {
    content = (
      <>
        <Text style={styles.question}>{shown.gone}</Text>
        <Pressable
          testID="relation-keep-new"
          onPress={keep}
          disabled={busy}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Keep this as new</Text>
        </Pressable>
      </>
    );
  } else if (rel.kind !== 'choose') {
    const entity = shown?.entity ?? rel.entity;
    const buttons = relationButtons(rel);
    // the change as it would be made now, against the item as it is now
    const change = rel.kind === 'edit' ? (changeNow(rel, entity) ?? rel.change) : null;
    // "Keep both" and "Keep separate" file it as new; "Not that one" offers the others first
    const secondary = rel.kind === 'edit' && rel.intent !== 'add' ? notThatOne : keep;
    content = (
      <>
        <Text style={styles.question}>{relationQuestion(rel)}</Text>
        <ItemCard
          entity={entity}
          subtitle={subtitleFor(entity, !change)}
          change={change}
          extra={rel.kind === 'same' ? rel.extra : null}
          onPress={onOpenItem && !busy ? () => onOpenItem(entity) : undefined}
          pressLabel={`Open ${entity.title}`}
          testID="relation-item"
        />
        <View style={styles.buttons}>
          <Pressable
            testID="relation-yes"
            accessibilityRole="button"
            onPress={() => yes()}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>{buttons.primary}</Text>
          </Pressable>
          <Pressable
            testID="relation-no"
            accessibilityRole="button"
            onPress={secondary}
            disabled={busy}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{buttons.secondary}</Text>
          </Pressable>
        </View>
        {buttons.hint ? <Text style={styles.hint}>{buttons.hint}</Text> : null}
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={dismiss} testID="relation-backdrop">
        <Pressable style={styles.sheet} onPress={() => {}} testID="relation-popup">
          {view !== 'done' && originalText ? (
            <View style={styles.originalTextContainer}>
              <Text style={styles.originalTextLabel}>You dropped:</Text>
              <Text style={styles.originalText} numberOfLines={3}>
                “{originalText}”
              </Text>
            </View>
          ) : null}
          {content}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {view !== 'done' && rel ? (
            <Pressable
              testID="relation-skip"
              onPress={keep}
              disabled={busy}
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    maxWidth: 340,
    width: '100%',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  originalTextContainer: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 156, 142, 0.2)',
  },
  originalTextLabel: {
    fontSize: 13,
    color: '#8A8F8A',
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: 'Inter-Regular',
  },
  originalText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E3A2E',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
    fontStyle: 'italic',
  },
  question: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2E3A2E',
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
  },
  list: { gap: 8 },
  card: {
    backgroundColor: lightTokens.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightTokens.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1 },
  title: {
    fontFamily: lightTokens.typography.fontFamily.bold,
    fontSize: 16,
    color: lightTokens.colors.deepForest,
  },
  subtitle: { fontSize: 13, color: lightTokens.colors.subtle },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightTokens.colors.linenCreamLight,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  changeCol: { flex: 1 },
  changeLabel: { fontSize: 11, color: lightTokens.colors.subtle },
  changeValue: { fontSize: 14, fontWeight: '500', color: lightTokens.colors.text },
  changeValueTo: { fontWeight: '600', color: lightTokens.colors.mossGreen },
  addBox: {
    backgroundColor: lightTokens.colors.linenCreamLight,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 2,
  },
  addLabel: { fontSize: 11, color: lightTokens.colors.subtle },
  addText: { fontSize: 14, fontWeight: '500', color: lightTokens.colors.mossGreen },
  extra: { fontSize: 13, color: lightTokens.colors.subtle },
  buttons: { gap: 10 },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4A7C59',
    alignItems: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', fontFamily: 'Inter-SemiBold' },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2E5540',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  hint: { fontSize: 12.5, color: '#8A8F8A', textAlign: 'center' },
  linkButton: { paddingVertical: 6, alignSelf: 'center' },
  skipText: { fontSize: 14, color: '#8A8F8A', textAlign: 'center', fontFamily: 'Inter-Regular' },
  doneWrap: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  doneText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E5540',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  error: { fontSize: 13, color: lightTokens.colors.danger, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
});

export default RelationPopup;
