/**
 * EntityCardMessage
 *
 * The card Gremly shows when the user refers to one of their items in chat.
 * Mockup is spec (Entity Card in Chat canvas, September 2026): title and type,
 * the change laid out as now and change to, one tap either way. Nothing is
 * changed until Yes is tapped; Undo reverts for a short while afterwards.
 * Choose cards list the nearest candidates when there was no clear match.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  Repeat,
  StickyNote,
} from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import type {
  EntityCard,
  EntityCardEntity,
  EntityCardStatus,
  SpaceChatMessage,
} from '../../lib/types';
import {
  applyEntityChange,
  describeChange,
  entitySubtitle,
  isEditCard,
} from '../../lib/chat/entityCards';

const UNDO_WINDOW_MS = 8000;

export interface EntityCardMessageProps {
  card: EntityCard;
  status: EntityCardStatus;
  /** Called after the user taps; the screen persists the new status and adds Gremly's line. */
  onStatus: (status: EntityCardStatus, summary?: string) => void;
  /** Choose cards: the user picked one of the candidates. */
  onPick?: (entity: EntityCardEntity) => void;
  testID?: string;
}

function TypeIcon({ type }: { type: EntityCardEntity['type'] }) {
  const color = lightTokens.colors.mossGreen;
  if (type === 'habit') return <Repeat size={18} color={color} />;
  if (type === 'note') return <StickyNote size={18} color={color} />;
  return <CalendarCheck size={18} color={color} />;
}

function EntityHeader({ entity, right }: { entity: EntityCardEntity; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.iconWrap}>
        <TypeIcon type={entity.type} />
      </View>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {entity.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {entitySubtitle(entity)}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function EntityCardMessage({
  card,
  status,
  onStatus,
  onPick,
  testID,
}: EntityCardMessageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const revertRef = useRef<null | (() => Promise<void>)>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const handleYes = useCallback(async () => {
    if (!isEditCard(card) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await applyEntityChange(card.entity, card.change);
      revertRef.current = applied.revert;
      setUndoOpen(true);
      undoTimer.current = setTimeout(() => setUndoOpen(false), UNDO_WINDOW_MS);
      onStatus('applied', applied.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change did not go through.');
    } finally {
      setBusy(false);
    }
  }, [card, busy, onStatus]);

  const handleUndo = useCallback(async () => {
    const revert = revertRef.current;
    if (!revert || busy) return;
    setBusy(true);
    try {
      await revert();
      revertRef.current = null;
      setUndoOpen(false);
      onStatus('undone', 'Put back the way it was.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  }, [busy, onStatus]);

  if (card.kind === 'choose') {
    return (
      <View style={styles.chooseWrap} testID={testID}>
        {card.candidates.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${c.title}`}
            onPress={() => onPick?.(c)}
            disabled={status !== 'pending'}
            style={({ pressed }) => [styles.card, styles.candidate, pressed && styles.pressed]}
          >
            <EntityHeader
              entity={c}
              right={<ChevronRight size={20} color={lightTokens.colors.subtle} />}
            />
          </Pressable>
        ))}
        {status === 'pending' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onStatus('declined')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>None of these</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const entity = card.entity;
  const words = isEditCard(card) ? describeChange(entity, card.change) : null;
  const applied = status === 'applied';

  return (
    <View style={styles.card} testID={testID}>
      <EntityHeader
        entity={
          applied && isEditCard(card)
            ? {
                ...entity,
                title: card.change.field === 'name' ? card.change.to : entity.title,
                due_day: card.change.field === 'due_day' ? card.change.to : entity.due_day,
                due_time: card.change.field === 'due_time' ? card.change.to : entity.due_time,
                frequency: card.change.field === 'frequency' ? card.change.to : entity.frequency,
              }
            : entity
        }
        right={
          applied ? (
            <View style={styles.chip}>
              <Check size={14} color={lightTokens.colors.deepForest} strokeWidth={2.5} />
              <Text style={styles.chipText}>Updated</Text>
            </View>
          ) : null
        }
      />

      {words && status === 'pending' ? (
        <View style={styles.changeRow}>
          <View style={styles.changeCol}>
            <Text style={styles.changeLabel}>Now</Text>
            <Text style={styles.changeValue}>{words.from}</Text>
          </View>
          <ArrowRight size={20} color={lightTokens.colors.subtle} />
          <View style={styles.changeCol}>
            <Text style={[styles.changeLabel, styles.changeLabelTo]}>{words.label}</Text>
            <Text style={[styles.changeValue, styles.changeValueTo]}>{words.to}</Text>
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isEditCard(card) && status === 'pending' ? (
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={handleYes}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>
              {card.change.field === 'completed' ? 'Yes, mark it done' : 'Yes, change it'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onStatus('declined')}
            disabled={busy}
            style={({ pressed }) => [
              styles.secondaryButton,
              styles.buttonHalf,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryText}>Not that one</Text>
          </Pressable>
        </View>
      ) : null}

      {applied && undoOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleUndo}
          disabled={busy}
          style={styles.undo}
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      ) : null}
      {status === 'declined' ? <Text style={styles.muted}>Not this one</Text> : null}
      {status === 'undone' ? <Text style={styles.muted}>Put back</Text> : null}
    </View>
  );
}

/**
 * EntityCardBubble: the chat row for a persisted entity card message
 * (metadata_json.type === 'entity-card'). Renders the card and, once the user
 * has acted, Gremly's closing line under it.
 */
export function EntityCardBubble({
  message,
  onStatus,
  onPick,
}: {
  message: SpaceChatMessage;
  onStatus: (status: EntityCardStatus, summary?: string) => void;
  onPick?: (entity: EntityCardEntity) => void;
}) {
  const meta = (message.metadata_json || {}) as {
    card?: EntityCard;
    status?: EntityCardStatus;
    summary?: string | null;
  };
  if (!meta.card) return null;
  const status = meta.status || 'pending';
  return (
    <View style={styles.row} testID={`entity-card-${message.id}`}>
      <EntityCardMessage card={meta.card} status={status} onStatus={onStatus} onPick={onPick} />
      {meta.summary && (status === 'applied' || status === 'undone') ? (
        <Text style={styles.closing}>{meta.summary}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  closing: {
    fontSize: lightTokens.chat.bodyFontSize,
    lineHeight: lightTokens.chat.bodyLineHeight,
    color: lightTokens.chat.assistantText,
  },
  card: {
    backgroundColor: lightTokens.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chooseWrap: { gap: 8 },
  candidate: { paddingVertical: 12, paddingHorizontal: 14, minHeight: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightTokens.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, gap: 2 },
  title: {
    fontFamily: lightTokens.typography.fontFamily.bold,
    fontSize: 17,
    color: lightTokens.colors.deepForest,
  },
  subtitle: { fontSize: 13, color: lightTokens.colors.subtle },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: lightTokens.colors.sageMist,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: lightTokens.colors.deepForest },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightTokens.colors.linenCreamLight,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  changeCol: { flex: 1, gap: 1 },
  changeLabel: {
    fontSize: 11,
    color: lightTokens.colors.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  changeLabelTo: { color: lightTokens.colors.mossGreen },
  changeValue: { fontSize: 15, fontWeight: '500', color: lightTokens.colors.text },
  changeValueTo: { fontWeight: '600', color: lightTokens.colors.mossGreen },
  buttons: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightTokens.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: lightTokens.colors.onPrimary, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHalf: { flex: 1 },
  secondaryText: { color: lightTokens.colors.mossGreen, fontWeight: '600', fontSize: 15 },
  undo: { alignSelf: 'flex-start', paddingVertical: 4 },
  undoText: {
    color: lightTokens.colors.mossGreen,
    fontWeight: '600',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  muted: { fontSize: 13, color: lightTokens.colors.subtle },
  error: { fontSize: 13, color: lightTokens.colors.danger },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
