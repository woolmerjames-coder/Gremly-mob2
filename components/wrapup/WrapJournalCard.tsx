/**
 * Tonight's journal entry in the thread: what was written, its moods, and
 * Undo. Just pick a mood shows the same card with the moods to pick from and
 * nothing saved until Save.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Maximize2, NotebookPen, Pencil, Undo2 } from 'lucide-react-native';
import type { SweepJournalMeta } from '../../lib/brief/types';
import { useEntryPhotos } from '../../lib/journal/photos';
import { useEntryFacts } from '../../lib/journal/took';
import { ALL_MOODS, MOOD_CONFIG, type Mood } from '../../lib/shared/moods';
import { CARD_COPY, journalLabel, partWords } from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { JournalTookLine, JournalTookSheet } from '../journal/JournalTook';
import { PrivateImage } from '../PrivateImage';
import { wrapStyles } from './wrapStyles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JOURNAL_GREMLY = require('../../assets/mascot/JournalGremly.png');

export type WrapJournalCardProps = {
  meta: SweepJournalMeta;
  interactive?: boolean;
  /** Just pick a mood: save the moods as tonight's reflection */
  onSaveMoods?: (moods: Mood[]) => void;
  onSkipMoods?: () => void;
  /** Change the moods on a saved entry */
  onEditMoods?: (moods: Mood[]) => void;
  /** Present while the entry can still be taken back out */
  onUndo?: () => void;
  /** Open the entry on the journal page, to read it all or add to it */
  onOpen?: () => void;
};

/** How many of an entry's photos the card shows */
const SHOWN_PHOTOS = 3;

/** "and three more answers" under the first answer of an entry written on the page */
function moreAnswers(n: number): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return `and ${words[n] ?? n} more ${n === 1 ? 'answer' : 'answers'}`;
}

function known(moods: string[] | undefined): Mood[] {
  return (moods ?? []).filter((m): m is Mood => (ALL_MOODS as readonly string[]).includes(m));
}

export function WrapJournalCard({
  meta,
  interactive = true,
  onSaveMoods,
  onSkipMoods,
  onEditMoods,
  onUndo,
  onOpen,
}: WrapJournalCardProps) {
  const [picked, setPicked] = useState<Mood[]>(() => known(meta.moods));
  const [editing, setEditing] = useState(false);
  // the photos saved with the entry: they arrive a moment after the words, as they are sent
  const photos = useEntryPhotos(meta.status === 'saved' ? meta.note_id : null);
  // what Gremly kept from it, once his reader has been through it
  const took = useEntryFacts(meta.status === 'saved' ? meta.note_id : null);
  const [tookUp, setTookUp] = useState(false);

  if (meta.status === 'removed' || meta.status === 'skipped') {
    return (
      <View style={wrapStyles.collapsed} testID={`wrap-journal-${meta.status}`}>
        <NotebookPen size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={wrapStyles.collapsedText}>
          {meta.status === 'removed' ? CARD_COPY.journalRemoved : partWords(meta.early).journalNone}
        </Text>
      </View>
    );
  }

  const picking = meta.status === 'mood';
  const choosing = picking || editing;
  const shown = choosing ? picked : known(meta.moods);
  const toggle = (m: Mood) =>
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  return (
    <View style={wrapStyles.card} testID="wrap-journal">
      <View style={styles.head}>
        <Image source={JOURNAL_GREMLY} style={styles.mascot} />
        <View style={wrapStyles.rowBody}>
          <Text style={wrapStyles.kicker}>{journalLabel(meta.date)}</Text>
          <Text style={wrapStyles.title} numberOfLines={2}>
            {meta.title}
          </Text>
        </View>
        {picking ? null : (
          <View style={wrapStyles.tag}>
            <Check size={12} color={BRIEF.moss} strokeWidth={2.6} />
            <Text style={wrapStyles.tagText}>{CARD_COPY.saved}</Text>
          </View>
        )}
      </View>
      {meta.parts?.length ? (
        // written on the journal page: its first answer, and how many more there are
        <View style={styles.parts} testID="wrap-journal-parts">
          {meta.parts[0].q ? <Text style={styles.prompt}>{meta.parts[0].q}</Text> : null}
          <Text style={styles.text} numberOfLines={3}>
            {meta.parts[0].text}
          </Text>
          {meta.parts.length > 1 ? (
            <Text style={styles.more}>{moreAnswers(meta.parts.length - 1)}</Text>
          ) : null}
        </View>
      ) : meta.text ? (
        <Text style={styles.text}>{meta.text}</Text>
      ) : null}
      {photos.length ? (
        <View style={styles.photos} testID="wrap-journal-photos">
          {photos.slice(0, SHOWN_PHOTOS).map((p) => (
            <PrivateImage key={p.id} uri={p.url} style={styles.photo} resizeMode="cover" />
          ))}
          {photos.length > SHOWN_PHOTOS ? (
            <Text style={styles.morePhotos}>+{photos.length - SHOWN_PHOTOS}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.moods}>
        {choosing
          ? ALL_MOODS.map((m) => {
              const on = picked.includes(m);
              return (
                <Pressable
                  key={m}
                  style={[styles.mood, on && styles.moodOn]}
                  onPress={() => toggle(m)}
                  disabled={!interactive}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={MOOD_CONFIG[m].label}
                  testID={`wrap-mood-${m}`}
                >
                  <Text style={[styles.moodText, on && styles.moodTextOn]}>
                    {MOOD_CONFIG[m].label}
                  </Text>
                </Pressable>
              );
            })
          : shown.map((m) => (
              <View key={m} style={[styles.mood, styles.moodOn]}>
                <Text style={[styles.moodText, styles.moodTextOn]}>{MOOD_CONFIG[m].label}</Text>
              </View>
            ))}
        {choosing ? null : (
          <>
            {onEditMoods ? (
              <Pressable
                style={[styles.mood, styles.dashed]}
                onPress={() => {
                  setPicked(known(meta.moods));
                  setEditing(true);
                }}
                disabled={!interactive}
                accessibilityRole="button"
                testID="wrap-journal-moods"
              >
                <Pencil size={12} color={BRIEF.moss} strokeWidth={2.2} />
                <Text style={styles.moodText}>{CARD_COPY.journalMoods}</Text>
              </Pressable>
            ) : null}
            {onOpen ? (
              <Pressable
                style={[styles.mood, styles.dashed]}
                onPress={onOpen}
                disabled={!interactive}
                accessibilityRole="button"
                testID="wrap-journal-open"
              >
                <Maximize2 size={12} color={BRIEF.moss} strokeWidth={2.2} />
                <Text style={styles.moodText}>{CARD_COPY.journalOpen}</Text>
              </Pressable>
            ) : null}
            {onUndo ? (
              <Pressable
                style={[styles.mood, styles.dashed]}
                onPress={onUndo}
                disabled={!interactive}
                accessibilityRole="button"
                testID="wrap-journal-undo"
              >
                <Undo2 size={12} color={BRIEF.moss} strokeWidth={2.2} />
                <Text style={styles.moodText}>{CARD_COPY.undo}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      {picking ? (
        <View style={wrapStyles.actions}>
          <Pressable
            style={[
              wrapStyles.btn,
              wrapStyles.btnGrow,
              wrapStyles.btnPrimary,
              !picked.length && wrapStyles.btnOff,
            ]}
            onPress={() => onSaveMoods?.(picked)}
            disabled={!interactive || !picked.length}
            accessibilityRole="button"
            testID="wrap-journal-save"
          >
            <Text style={[wrapStyles.btnText, wrapStyles.btnTextPrimary]}>
              {CARD_COPY.journalSave}
            </Text>
          </Pressable>
          <Pressable
            style={[wrapStyles.btn, wrapStyles.btnSecondary]}
            onPress={onSkipMoods}
            disabled={!interactive}
            accessibilityRole="button"
            testID="wrap-journal-skip"
          >
            <Text style={wrapStyles.btnText}>{CARD_COPY.journalSkip}</Text>
          </Pressable>
        </View>
      ) : editing ? (
        <View style={wrapStyles.actions}>
          <Pressable
            style={[wrapStyles.btn, wrapStyles.btnGrow, wrapStyles.btnPrimary]}
            onPress={() => {
              setEditing(false);
              onEditMoods?.(picked);
            }}
            disabled={!interactive}
            accessibilityRole="button"
            testID="wrap-journal-done"
          >
            <Text style={[wrapStyles.btnText, wrapStyles.btnTextPrimary]}>
              {CARD_COPY.journalDone}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {took.length && !choosing ? (
        <JournalTookLine count={took.length} onPress={() => setTookUp(true)} />
      ) : null}
      {tookUp ? <JournalTookSheet facts={took} onClose={() => setTookUp(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mascot: { width: 44, height: 44, resizeMode: 'contain' },
  text: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22, color: BRIEF.mossInk },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: BRIEF.white,
  },
  moodOn: { borderColor: BRIEF.peri, backgroundColor: '#ECEEFA' },
  dashed: { borderStyle: 'dashed' },
  parts: { gap: 2 },
  photos: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photo: { width: 64, height: 64, borderRadius: 12, backgroundColor: BRIEF.sageWash },
  morePhotos: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.muted },
  prompt: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: BRIEF.mossInk },
  more: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: BRIEF.faint, marginTop: 4 },
  moodText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: BRIEF.moss },
  moodTextOn: { color: BRIEF.periInk },
});
