/**
 * EntityCardMessage
 *
 * The card Gremly shows, inside its own reply, when the user refers to one of
 * their items in chat. Mockup is spec (Entity Card in Chat canvas, September
 * 2026): the item with its kind and Space, the change laid out as now and
 * change to, one tap either way. Nothing is changed until Yes is tapped; the
 * closing line carries an Undo for a short while afterwards. A view card opens
 * the item. Choose cards list the nearest candidates when there was no clear
 * match, with "None of these" under them.
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
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type {
  EntityCard,
  EntityCardEntity,
  EntityCardStatus,
  SpaceChatMessage,
} from '../../lib/types';
import {
  applyEntityChange,
  describeChange,
  entityAfterChange,
  entitySubtitle,
  isEditCard,
  primaryLabel,
} from '../../lib/chat/entityCards';

const UNDO_WINDOW_MS = 8000;

export interface EntityCardMessageProps {
  card: EntityCard;
  status: EntityCardStatus;
  /** The closing line saved with the card once the user acted. */
  summary?: string | null;
  /** Called after the user taps; the screen persists the new status and the closing line. */
  onStatus: (status: EntityCardStatus, summary?: string) => void;
  /** Choose cards: the user picked one of the candidates. */
  onPick?: (entity: EntityCardEntity) => void;
  /** The user said this was not the one (the item, or null for "none of these"); the screen tells Gremly. */
  onDecline?: (entity: EntityCardEntity | null) => void;
  /** View cards, and the item on an edit card: open it in the app. */
  onOpen?: (entity: EntityCardEntity) => void;
  testID?: string;
}

function TypeIcon({ type }: { type: EntityCardEntity['type'] }) {
  const color = lightTokens.colors.mossGreen;
  if (type === 'habit') return <Repeat size={18} color={color} />;
  if (type === 'note') return <StickyNote size={18} color={color} />;
  return <CalendarCheck size={18} color={color} />;
}

function useSpaceName(spaceId?: string | null): string | null {
  const spaces = useGremlyStore((s) => s.spaces);
  if (!spaceId) return null;
  return spaces.find((s) => s.id === spaceId)?.name ?? null;
}

function EntityHeader({
  entity,
  withWhen,
  right,
}: {
  entity: EntityCardEntity;
  withWhen: boolean;
  right?: React.ReactNode;
}) {
  const spaceName = useSpaceName(entity.space_id);
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
          {entitySubtitle(entity, { spaceName, withWhen })}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function EntityCardMessage({
  card,
  status,
  summary,
  onStatus,
  onPick,
  onDecline,
  onOpen,
  testID,
}: EntityCardMessageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [after, setAfter] = useState<EntityCardEntity | null>(null);
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
      setAfter(applied.entity);
      setUndoOpen(true);
      undoTimer.current = setTimeout(() => setUndoOpen(false), UNDO_WINDOW_MS);
      onStatus('applied', `Done. ${applied.summary}`);
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
      setAfter(null);
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
              withWhen
              right={<ChevronRight size={20} color={lightTokens.colors.subtle} />}
            />
          </Pressable>
        ))}
        {status === 'pending' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onStatus('declined');
              onDecline?.(null);
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>None of these</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>{status === 'declined' ? 'None of these' : ''}</Text>
        )}
      </View>
    );
  }

  const edit = isEditCard(card);
  const applied = status === 'applied';
  const pending = status === 'pending';
  // once applied the card reads as the item now is, including after a restart
  const entity =
    after ?? (applied && edit ? entityAfterChange(card.entity, card.change) : card.entity);
  const words = edit ? describeChange(card.entity, card.change) : null;

  // A view card is one tap to open the item; on an edit card the header opens it too.
  const open = onOpen ? () => onOpen(entity) : undefined;

  const body = (
    <>
      <Pressable
        onPress={open}
        disabled={!open}
        accessibilityRole={open ? 'button' : undefined}
        accessibilityLabel={open ? `Open ${entity.title}` : undefined}
        style={({ pressed }) => [pressed && open && styles.pressed]}
      >
        <EntityHeader
          entity={entity}
          withWhen={!edit || applied}
          right={
            applied ? (
              <View style={styles.chip}>
                <Check size={14} color={lightTokens.colors.deepForest} strokeWidth={2.5} />
                <Text style={styles.chipText}>Updated</Text>
              </View>
            ) : !edit && open ? (
              <ChevronRight size={20} color={lightTokens.colors.subtle} />
            ) : null
          }
        />
      </Pressable>

      {words && pending ? (
        <View style={styles.changeRow}>
          {isEditCard(card) && card.change.field === 'body_add' ? (
            <Text style={[styles.changeValue, styles.changeValueTo]} numberOfLines={3}>
              {words.label}: {words.to}
            </Text>
          ) : (
            <>
              <Text style={styles.changeValue} numberOfLines={1}>
                {words.from}
              </Text>
              <ArrowRight size={16} color={lightTokens.colors.subtle} />
              <Text style={[styles.changeValue, styles.changeValueTo]} numberOfLines={1}>
                {words.to}
              </Text>
            </>
          )}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {edit && pending ? (
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
            <Text style={styles.primaryText}>{primaryLabel(card.change)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onStatus('declined');
              onDecline?.(entity);
            }}
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
      {status === 'declined' ? <Text style={styles.muted}>Not this one</Text> : null}
    </>
  );

  return (
    <View testID={testID}>
      <View style={styles.card}>{body}</View>
      {summary && (status === 'applied' || status === 'undone') ? (
        <Text style={styles.closing}>
          {summary}
          {applied && undoOpen ? (
            <Text
              style={styles.undoText}
              onPress={handleUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo"
            >
              {' '}
              Undo
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * EntityCardBubble: the persisted entity card message (metadata_json.type ===
 * 'entity-card') rendered inside Gremly's reply, or on its own when a chat
 * has a card with no reply before it.
 */
export function EntityCardBubble({
  message,
  onStatus,
  onPick,
  onDecline,
  onOpen,
  standalone = false,
}: {
  message: SpaceChatMessage;
  onStatus: (status: EntityCardStatus, summary?: string) => void;
  onPick?: (entity: EntityCardEntity) => void;
  onDecline?: (entity: EntityCardEntity | null) => void;
  onOpen?: (entity: EntityCardEntity) => void;
  /** True when this is its own chat row rather than part of a reply. */
  standalone?: boolean;
}) {
  const meta = (message.metadata_json || {}) as {
    card?: EntityCard;
    status?: EntityCardStatus;
    summary?: string | null;
  };
  if (!meta.card) return null;
  const status = meta.status || 'pending';
  return (
    <View style={standalone ? styles.row : styles.inReply} testID={`entity-card-${message.id}`}>
      <EntityCardMessage
        card={meta.card}
        status={status}
        summary={meta.summary}
        onStatus={onStatus}
        onPick={onPick}
        onDecline={onDecline}
        onOpen={onOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 6 },
  inReply: { marginTop: 10, width: '100%' },
  closing: {
    marginTop: 10,
    fontSize: lightTokens.chat.bodyFontSize,
    lineHeight: lightTokens.chat.bodyLineHeight,
    color: lightTokens.chat.assistantText,
  },
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
  chooseWrap: { gap: 8 },
  candidate: { paddingVertical: 9, paddingHorizontal: 12, minHeight: 50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightTokens.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, gap: 0 },
  title: {
    fontFamily: lightTokens.typography.fontFamily.bold,
    fontSize: 16,
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
    gap: 8,
    backgroundColor: lightTokens.colors.linenCreamLight,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  changeValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: lightTokens.colors.text,
  },
  changeValueTo: { fontWeight: '600', color: lightTokens.colors.mossGreen },
  buttons: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightTokens.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: lightTokens.colors.onPrimary, fontWeight: '600', fontSize: 14 },
  secondaryButton: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHalf: { flex: 1 },
  secondaryText: { color: lightTokens.colors.mossGreen, fontWeight: '600', fontSize: 14 },
  undoText: {
    color: lightTokens.colors.mossGreen,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  muted: { fontSize: 13, color: lightTokens.colors.subtle },
  error: { fontSize: 13, color: lightTokens.colors.danger },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
