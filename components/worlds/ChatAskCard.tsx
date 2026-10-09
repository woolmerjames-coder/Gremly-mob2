/**
 * A question about a Chapter in the chat, in the brief or the wrap up: the
 * Worlds card under Gremly's own words, with the items it rests on and its
 * own two buttons, in place of answers to tap (the gap left from stage 3 of
 * the Worlds rebuild). A tap is made through the same actions as on Worlds
 * (lib/worlds/askAct.ts), marks the question answered there and
 * then, and says what it did, with Undo while the app is open. Their own
 * words go in the chat's box, which answers it as before.
 *
 * The first tap lets the brief or the wrap up carry on (onAnswered). After
 * Undo the card is there to answer again, and the thread does not move on a
 * second time.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useToday } from '../../lib/date/useDateService';
import { nowTimestamp } from '../../lib/date/DateService';
import type { BriefOfferMeta } from '../../lib/brief/types';
import {
  fetchWorldsQuestion,
  stillStands,
  type AskAct,
  type WorldsQuestion,
} from '../../lib/worlds/questions';
import { actOn, canUndoChatAnswer, keepChatUndo, undoChatAnswer } from '../../lib/worlds/askAct';
import { F, W } from '../../lib/worlds/look';
import { AskCard } from './AskCard';

type Loaded =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; q: WorldsQuestion | null };

// each question read once while the app is open, so the thread drawn again does not read it again
const reads = new Map<string, Promise<WorldsQuestion | null>>();
function readQuestion(id: string, fresh: boolean): Promise<WorldsQuestion | null> {
  const known = reads.get(id);
  if (known && !fresh) return known;
  const p = fetchWorldsQuestion(id);
  reads.set(id, p);
  p.catch(() => reads.delete(id));
  return p;
}

export function ChatAskCard({
  messageId,
  meta,
  patch,
  onAnswered,
}: {
  messageId: string;
  meta: BriefOfferMeta;
  /** Keep on the message what the card did, so the thread shows it next time */
  patch: (patch: Partial<BriefOfferMeta>) => Promise<void> | void;
  /** The card answered it: the brief or the wrap up carries on */
  onAnswered: () => void;
}) {
  const today = useToday();
  const worlds = useGremlyStore((s) => s.worlds) ?? [];
  const chapters = useGremlyStore((s) => s.chapters) ?? [];
  const done = meta.card && 'act' in meta.card ? meta.card : null;
  const undone = !!meta.card && 'undone' in meta.card;
  // answered in their own words (or by an old build's buttons): Gremly's words are enough
  const open = !done && (!meta.chosen || undone);
  const id = meta.question_id ?? null;
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [undoable, setUndoable] = useState(() => canUndoChatAnswer(messageId));

  useEffect(() => {
    if (!open || !id) return;
    let live = true;
    readQuestion(id, attempt > 0).then(
      (q) => {
        if (live) setLoaded({ state: 'ready', q });
      },
      (err) => {
        console.warn('[ChatAskCard] the question could not be read:', err);
        if (live) setLoaded({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [open, id, attempt]);

  const act = async (a: AskAct) => {
    if (busy || loaded.state !== 'ready' || !loaded.q || !id) return;
    setBusy(true);
    setFailed(false);
    const first = !meta.chosen;
    try {
      const { undo, line } = await actOn(loaded.q, a, { today, worlds, chapters });
      keepChatUndo(messageId, undo);
      reads.delete(id);
      setUndoable(true);
      await patch({
        ...(first ? { chosen: { id: `card_${a}`, at: nowTimestamp() } } : {}),
        card: { act: a, line },
      });
      if (first) onAnswered();
    } catch (err) {
      console.warn('[ChatAskCard] the answer did not go through:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await undoChatAnswer(messageId);
      setUndoable(false);
      setLoaded({ state: 'loading' });
      await patch({ card: { undone: true } });
      setAttempt((n) => n + 1);
    } catch (err) {
      console.warn('[ChatAskCard] could not undo:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const failedLine = failed ? (
    <Text style={styles.failed} accessibilityLiveRegion="polite">
      That did not go through. Try again in a moment.
    </Text>
  ) : null;

  if (done) {
    return (
      <View>
        <View style={styles.done} testID="ask-done">
          <View style={styles.tick}>
            <Check size={15} color={W.linen} strokeWidth={3} />
          </View>
          <Text style={styles.doneText} accessibilityLiveRegion="polite">
            {done.line}
          </Text>
          {undoable ? (
            <Pressable
              onPress={() => void undo()}
              disabled={busy}
              style={({ pressed }) => [styles.undo, (pressed || busy) && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              testID="ask-undo"
            >
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
        {failedLine}
      </View>
    );
  }
  if (!open || !id) return null;
  if (loaded.state === 'failed') {
    return (
      <Pressable
        onPress={() => {
          setLoaded({ state: 'loading' });
          setAttempt((n) => n + 1);
        }}
        style={styles.retry}
        accessibilityRole="button"
        testID="ask-retry"
      >
        <Text style={styles.retryText}>Gremly's card did not load. Tap to try again.</Text>
      </Pressable>
    );
  }
  // answered or put aside somewhere else since, or its Chapter has closed
  if (loaded.state !== 'ready' || !loaded.q || !stillStands(loaded.q, chapters)) return null;
  return (
    <View>
      <AskCard question={loaded.q} busy={busy} inChat onAct={(a) => void act(a)} />
      {failedLine}
    </View>
  );
}

const styles = StyleSheet.create({
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: W.sageWash,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: W.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { flex: 1, fontFamily: F.ui, fontSize: 15, lineHeight: 20, color: W.forest },
  undo: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: W.line2,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  undoText: { fontFamily: F.uiSemi, fontSize: 14, color: W.moss },
  failed: { fontFamily: F.body, fontSize: 13.5, color: W.muted, marginTop: 8 },
  retry: { paddingVertical: 10 },
  retryText: { fontFamily: F.body, fontSize: 14, color: W.moss },
});
