/**
 * One card on the journal page: a prompt with the answer under it, or free
 * writing. A prompt's number turns to a tick once something is written.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import type { JournalCard } from '../../lib/journal/page';
import { JOURNAL_COPY } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';
import { JournalEditor, type FormatState, type JournalEditorHandle } from './JournalEditor';
import { JournalRichText } from './JournalRichText';
import { journalStyles } from './journalStyles';

export type JournalCardPlace = 'solo' | 'tail' | 'card';

export type JournalCardViewProps = {
  card: JournalCard;
  /** Its number among the prompts. Free writing has none. */
  number: number | null;
  /** The only card on the page, the free writing under the prompts, or any other card */
  place: JournalCardPlace;
  /** Whether anything is written on it */
  has: boolean;
  /** False while looking back at a saved entry */
  editable: boolean;
  editorRef?: (handle: JournalEditorHandle | null) => void;
  onFocus?: () => void;
  onChangeText?: (text: string) => void;
  onFormat?: (state: FormatState) => void;
  /** The person naming a prompt of their own */
  onPrompt?: (q: string) => void;
  onRemove?: () => void;
  /** Open the keyboard on the prompt's name, for one just added */
  namePrompt?: boolean;
  fontFamily?: string;
  testID: string;
};

const MIN_HEIGHT: Record<JournalCardPlace, number> = { solo: 236, tail: 56, card: 28 };

export function JournalCardView({
  card,
  number,
  place,
  has,
  editable,
  editorRef,
  onFocus,
  onChangeText,
  onFormat,
  onPrompt,
  onRemove,
  namePrompt,
  fontFamily,
  testID,
}: JournalCardViewProps) {
  const [focused, setFocused] = useState(false);
  const prompt = card.q !== null;
  const typing = prompt && !!card.custom && editable;
  const placeholder = prompt
    ? JOURNAL_COPY.placeholderPrompt
    : place === 'tail'
      ? JOURNAL_COPY.placeholderTail
      : JOURNAL_COPY.placeholderFree;

  return (
    <View style={[journalStyles.card, focused && journalStyles.cardFocused]} testID={testID}>
      {prompt ? (
        <View style={styles.head}>
          <View style={[styles.badge, has && styles.badgeOn]}>
            {has ? (
              <Check size={14} color={BRIEF.linen} strokeWidth={3} />
            ) : (
              <Text style={styles.badgeText}>{number}</Text>
            )}
          </View>
          {typing ? (
            <TextInput
              style={styles.promptInput}
              defaultValue={card.q ?? ''}
              onChangeText={onPrompt}
              placeholder={JOURNAL_COPY.placeholderOwnPrompt}
              placeholderTextColor={BRIEF.faint}
              maxLength={70}
              autoFocus={namePrompt}
              returnKeyType="done"
              accessibilityLabel={JOURNAL_COPY.placeholderOwnPrompt}
              testID={`${testID}-prompt`}
            />
          ) : (
            <Text style={styles.prompt}>{card.q}</Text>
          )}
          {editable && onRemove ? (
            <Pressable
              style={styles.remove}
              onPress={onRemove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={JOURNAL_COPY.removePrompt}
              testID={`${testID}-remove`}
            >
              <X size={16} color={BRIEF.faint} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {editable ? (
        <JournalEditor
          ref={editorRef}
          initialHtml={card.html}
          placeholder={placeholder}
          minHeight={MIN_HEIGHT[place]}
          fontFamily={fontFamily}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFormat={onFormat}
          testID={`${testID}-editor`}
        />
      ) : (
        <JournalRichText html={card.html} fontFamily={fontFamily} testID={`${testID}-text`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: BRIEF.moss },
  badgeText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
    color: BRIEF.moss,
    fontVariant: ['tabular-nums'],
  },
  prompt: {
    flex: 1,
    marginTop: 3,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    lineHeight: 21,
    color: BRIEF.mossInk,
  },
  promptInput: {
    flex: 1,
    marginTop: 1,
    paddingVertical: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: BRIEF.chipBorder,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: BRIEF.mossInk,
  },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -1,
  },
});
