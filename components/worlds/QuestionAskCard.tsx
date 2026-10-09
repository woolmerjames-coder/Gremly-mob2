/**
 * A question about a Chapter on Answer some Gremly questions: the Worlds
 * card, with the items it rests on and its own two buttons, in place of
 * answers to tap (a gap left from the Worlds rebuild). A tap is made through
 * the same actions as on Worlds and in the chat (lib/worlds/askAct.ts), and
 * their own words go to Gremly as they do on Worlds.
 *
 * When it has been answered or put aside somewhere else since, or its
 * Chapter has closed, there is nothing left to ask and the screen moves on
 * (onGone).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useToday } from '../../lib/date/useDateService';
import {
  fetchWorldsQuestion,
  stillStands,
  tellGremly,
  type AskAct,
  type WorldsQuestion,
} from '../../lib/worlds/questions';
import { actOn } from '../../lib/worlds/askAct';
import type { Undo } from '../../lib/worlds/actions';
import { F, W } from '../../lib/worlds/look';
import { AskCard } from './AskCard';

type Loaded =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; q: WorldsQuestion | null };

/** What the line under their answer says once their own words have gone to Gremly. */
export const SENT_TO_GREMLY = 'Sent to Gremly. He will take it from there.';

export function QuestionAskCard({
  id,
  onDone,
  onGone,
}: {
  id: string;
  /** Answered: what it did, and what puts it back when there is something to */
  onDone: (done: { line: string; undo?: Undo }) => void;
  /** Nothing left to ask */
  onGone: () => void;
}) {
  const today = useToday();
  const worlds = useGremlyStore((s) => s.worlds) ?? [];
  const chapters = useGremlyStore((s) => s.chapters) ?? [];
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // once they have answered, a Chapter closing because of it is not a reason to move on twice
  const answering = useRef(false);
  const left = useRef(false);

  useEffect(() => {
    let live = true;
    fetchWorldsQuestion(id).then(
      (q) => {
        if (live) setLoaded({ state: 'ready', q });
      },
      (err) => {
        console.warn('[QuestionAskCard] the question could not be read:', err);
        if (live) setLoaded({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const gone = loaded.state === 'ready' && (!loaded.q || !stillStands(loaded.q, chapters));
  useEffect(() => {
    if (!gone || answering.current || left.current) return;
    left.current = true;
    onGone();
  }, [gone, onGone]);

  const act = async (a: AskAct) => {
    if (busy || loaded.state !== 'ready' || !loaded.q) return;
    answering.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const { undo, line } = await actOn(loaded.q, a, { today, worlds, chapters });
      onDone({ line, undo });
    } catch (err) {
      console.warn('[QuestionAskCard] the answer did not go through:', err);
      answering.current = false;
      setFailed(true);
      setBusy(false);
    }
  };

  const tell = async (said: string) => {
    if (busy || loaded.state !== 'ready' || !loaded.q) return;
    answering.current = true;
    setBusy(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await tellGremly(loaded.q, said);
    } catch (err) {
      console.warn('[QuestionAskCard] their words did not send:', err);
    }
    if (ok) {
      onDone({ line: SENT_TO_GREMLY });
      return;
    }
    answering.current = false;
    setFailed(true);
    setBusy(false);
  };

  if (loaded.state === 'loading') {
    return <ActivityIndicator color={W.moss} style={{ marginTop: 24 }} />;
  }
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
  if (gone || !loaded.q) return null;
  return (
    <View>
      <AskCard
        question={loaded.q}
        busy={busy}
        onAct={(a) => void act(a)}
        onTell={(said) => void tell(said)}
      />
      {failed ? (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          That did not go through. Try again in a moment.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  failed: { fontFamily: F.body, fontSize: 13.5, color: W.muted, marginTop: 8 },
  retry: { paddingVertical: 10 },
  retryText: { fontFamily: F.body, fontSize: 14, color: W.moss },
});
