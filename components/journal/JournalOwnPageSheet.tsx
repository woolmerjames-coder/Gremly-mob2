/**
 * The sheet for a page of the person's own: its name and its questions.
 *
 * It rises over the journal page, inside it, so the page underneath keeps
 * what is written. Nothing is kept until Save, and Save stays on the sheet
 * with the reason when the page could not be kept.
 */
import React, { useRef, useState } from 'react';
import {
  type Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Plus, Trash2, X } from 'lucide-react-native';
import {
  OWN_NAME_MAX,
  OWN_PROMPTS_MAX,
  OWN_PROMPT_MAX,
  cleanForm,
  cleanPrompt,
  type OwnPageForm,
} from '../../lib/journal/ownPages';
import { JOURNAL_COPY } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';
import { JournalSheet } from './JournalSheet';
import { journalStyles } from './journalStyles';

export type JournalOwnPageSheetProps = {
  /** The page being changed, or what a new one starts with */
  initial: OwnPageForm;
  /** How far the keyboard pushes the sheet up */
  lift: Animated.Value;
  /**
   * Keep what is filled in. `reworded` says which of the questions the sheet
   * opened with were changed, old wording to new, so an answer already written
   * under one can stay with it.
   */
  onSave: (
    form: OwnPageForm,
    reworded: Record<string, string>,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Only for a page that is already kept */
  onDelete?: () => void;
  onClose: () => void;
};

/**
 * A question's row. Its key stays with it, so taking one out leaves the others
 * as they are, and `from` is the wording it had when the sheet opened.
 */
type Row = { key: number; q: string; from: string | null };
let made = 0;
function row(q: string, from: string | null = null): Row {
  made += 1;
  return { key: made, q, from };
}

/** A new page starts with room for three questions */
const EMPTY_ROWS = 3;

export function JournalOwnPageSheet({
  initial,
  lift,
  onSave,
  onDelete,
  onClose,
}: JournalOwnPageSheetProps) {
  const [name, setName] = useState(initial.name);
  const [rows, setRows] = useState<Row[]>(() => {
    const given = initial.prompts.slice(0, OWN_PROMPTS_MAX);
    return given.length
      ? given.map((q) => row(q, q))
      : Array.from({ length: EMPTY_ROWS }, () => row(''));
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The question just added, which the keyboard opens on */
  const [added, setAdded] = useState<number | null>(null);
  const form = useRef<ScrollView>(null);
  const editing = !!initial.id;

  const addQuestion = () => {
    const fresh = row('');
    setAdded(fresh.key);
    setRows((all) => [...all, fresh]);
  };

  const save = async () => {
    if (busy) return;
    const filled = { id: initial.id ?? null, name, prompts: rows.map((r) => r.q) };
    if (!cleanForm(filled)) {
      setError(JOURNAL_COPY.ownNeedsQuestion);
      return;
    }
    const reworded: Record<string, string> = {};
    for (const r of rows) {
      const now = cleanPrompt(r.q);
      if (r.from && now && now !== r.from) reworded[r.from] = now;
    }
    setBusy(true);
    setError(null);
    const res = await onSave(filled, reworded);
    setBusy(false);
    if (!res.ok) setError(res.message);
  };

  return (
    <JournalSheet
      onClose={onClose}
      closeLabel={JOURNAL_COPY.ownClose}
      lift={lift}
      testID="journal-own-sheet"
      closeTestID="journal-own-close"
    >
      <>
        <Text style={styles.title} accessibilityRole="header">
          {editing ? JOURNAL_COPY.ownEditTitle : JOURNAL_COPY.ownNewTitle}
        </Text>
        <Text style={styles.sub}>{JOURNAL_COPY.ownSub}</Text>

        <ScrollView
          ref={form}
          style={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // a question just added is at the bottom: bring it into view
          onContentSizeChange={() => {
            if (added !== null) form.current?.scrollToEnd({ animated: true });
          }}
        >
          <Text style={styles.label}>{JOURNAL_COPY.ownName}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={JOURNAL_COPY.ownNamePlaceholder}
            placeholderTextColor={BRIEF.faint}
            maxLength={OWN_NAME_MAX}
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel={JOURNAL_COPY.ownName}
            testID="journal-own-name"
          />

          <Text style={styles.label}>{JOURNAL_COPY.ownQuestions}</Text>
          {rows.map((r, i) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{i + 1}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={r.q}
                onChangeText={(q) => {
                  setError(null);
                  setRows((all) => all.map((x) => (x.key === r.key ? { ...x, q } : x)));
                }}
                placeholder={
                  i === 0 ? JOURNAL_COPY.ownFirstPlaceholder : JOURNAL_COPY.ownNextPlaceholder
                }
                placeholderTextColor={BRIEF.faint}
                maxLength={OWN_PROMPT_MAX}
                autoFocus={r.key === added}
                returnKeyType="done"
                accessibilityLabel={`Question ${i + 1}`}
                testID={`journal-own-question-${i}`}
              />
              {rows.length > 1 ? (
                <Pressable
                  style={styles.remove}
                  onPress={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${JOURNAL_COPY.ownRemoveQuestion}, ${i + 1}`}
                  testID={`journal-own-question-${i}-remove`}
                >
                  <X size={16} color={BRIEF.faint} strokeWidth={2.2} />
                </Pressable>
              ) : (
                <View style={styles.remove} />
              )}
            </View>
          ))}
          {rows.length < OWN_PROMPTS_MAX ? (
            <Pressable
              style={[journalStyles.add, styles.more]}
              onPress={addQuestion}
              accessibilityRole="button"
              testID="journal-own-add-question"
            >
              <Plus size={15} color={BRIEF.moss} strokeWidth={2.3} />
              <Text style={journalStyles.addText}>{JOURNAL_COPY.ownAddQuestion}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite" testID="journal-own-error">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={[styles.save, busy && styles.saveBusy]}
            onPress={() => void save()}
            disabled={busy}
            accessibilityRole="button"
            testID="journal-own-save"
          >
            <Text style={styles.saveText}>
              {editing ? JOURNAL_COPY.ownSaveChanges : JOURNAL_COPY.ownSave}
            </Text>
          </Pressable>
          {editing && onDelete ? (
            <Pressable
              style={styles.delete}
              onPress={onDelete}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={JOURNAL_COPY.ownDelete}
              testID="journal-own-delete"
            >
              <Trash2 size={18} color={DELETE_INK} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </>
    </JournalSheet>
  );
}

const DELETE_INK = '#A0492F';

const styles = StyleSheet.create({
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 19, color: BRIEF.mossInk },
  sub: {
    marginTop: 5,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: BRIEF.muted,
  },
  form: { flexGrow: 0, flexShrink: 1, marginTop: 6 },
  label: {
    marginTop: 14,
    marginBottom: 7,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: BRIEF.periInk,
  },
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: BRIEF.white,
    paddingHorizontal: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: BRIEF.mossInk,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rowInput: { flex: 1 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
    color: BRIEF.moss,
    fontVariant: ['tabular-nums'],
  },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { alignSelf: 'flex-start', marginTop: 2, marginBottom: 4 },
  error: {
    marginTop: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: DELETE_INK,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  save: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRIEF.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBusy: { opacity: 0.6 },
  saveText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: BRIEF.linen },
  delete: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(160, 73, 47, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
