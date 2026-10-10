/**
 * A Chapter's steps and a World's open todos: tick one, add one, show the
 * ones already done, and on a closed Chapter, bring one back.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import type { Todo } from '../../lib/types';
import { F, W } from '../../lib/worlds/look';
import { dayOf, daysFrom, dayShort, dayPlain, isDone } from '../../lib/worlds/model';
import { stepTitle } from './UpNextCard';
import { todoDayOf } from '../../workers/shared/todoDay';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Small numbers as words: three, not 3. */
export const numWord = (n: number) => WORDS[n] || String(n);

/** When a step is due, short: today, tomorrow, by Sat 12 Dec, was 3 Oct. */
function dueShort(t: Todo, today: string): { text: string; late: boolean } | null {
  // its day by the shared rule: the day planned, else its deadline (final check item 17)
  const d = dayOf(todoDayOf(t));
  if (!d) return null;
  const n = daysFrom(today, d);
  if (n < 0) return { text: `was ${dayPlain(d)}`, late: true };
  if (n === 0) return { text: 'today', late: false };
  if (n === 1) return { text: 'tomorrow', late: false };
  return { text: `by ${dayShort(d)}`, late: false };
}

export function StepRow({
  step,
  today,
  onToggle,
}: {
  step: Todo;
  today: string;
  onToggle: (step: Todo) => void;
}) {
  const on = isDone(step);
  const due = on ? null : dueShort(step, today);
  return (
    <Pressable
      onPress={() => onToggle(step)}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: 'rgba(46,85,64,0.04)' }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${stepTitle(step)}${due ? `, due ${due.text}` : ''}`}
      testID={`step-${step.id}`}
    >
      <View style={[styles.o, on && styles.oOn]}>
        {on ? <Check size={14} strokeWidth={3} color={W.linen} /> : null}
      </View>
      <Text style={[styles.title, on && styles.titleOn]}>{stepTitle(step)}</Text>
      {due ? <Text style={[styles.due, due.late && styles.dueLate]}>{due.text}</Text> : null}
    </Pressable>
  );
}

/** Add a step (or a todo) where it is: type, then return for the next one. */
export function AddStepRow({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (text: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);

  async function submit() {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) {
      setOpen(false);
      return;
    }
    setText('');
    await onAdd(t);
    input.current?.focus();
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.add}
        accessibilityRole="button"
        testID="step-add"
      >
        <View style={styles.pl}>
          <Plus size={18} color={W.moss} />
        </View>
        <Text style={styles.addText}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.add}>
      <View style={styles.pl}>
        <Plus size={18} color={W.moss} />
      </View>
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder={label}
        placeholderTextColor="#9a9a9a"
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={submit}
        onBlur={() => {
          if (!text.trim()) setOpen(false);
        }}
        style={styles.addInput}
        accessibilityLabel={label}
        testID="step-add-input"
      />
    </View>
  );
}

export function ShowDoneToggle({
  count,
  open,
  onPress,
}: {
  count: number;
  open: boolean;
  onPress: () => void;
}) {
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <Pressable
      onPress={onPress}
      style={styles.more}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      testID="steps-done-toggle"
    >
      <Text style={styles.moreText}>
        {open ? 'Hide' : 'Show'} the {numWord(count)} already done
      </Text>
      <Icon size={15} color={W.moss} />
    </Pressable>
  );
}

/** A step ticked before the Chapter closed. */
export function DoneStepRow({ step }: { step: Todo }) {
  return (
    <View style={styles.step} accessible accessibilityLabel={`Done: ${stepTitle(step)}`}>
      <View style={[styles.o, styles.oOn]}>
        <Check size={14} strokeWidth={3} color={W.linen} />
      </View>
      <Text style={[styles.title, styles.titleOn]}>{stepTitle(step)}</Text>
    </View>
  );
}

/** A step left on a closed Chapter, with the way back to Today. */
export function LeftStepRow({ step, onBring }: { step: Todo; onBring: (step: Todo) => void }) {
  return (
    <View style={styles.step}>
      <View style={styles.o} />
      <Text style={[styles.title, { color: W.muted }]}>{stepTitle(step)}</Text>
      <Pressable
        onPress={() => onBring(step)}
        style={({ pressed }) => [styles.bring, pressed && { backgroundColor: W.sageWash }]}
        accessibilityRole="button"
        accessibilityLabel={`Bring back: ${stepTitle(step)}`}
        testID={`bring-${step.id}`}
      >
        <Text style={styles.bringText}>Bring back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: W.line,
    borderRadius: 8,
  },
  o: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: W.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oOn: { backgroundColor: W.moss, borderColor: W.moss },
  title: { flex: 1, fontFamily: F.bodyMedium, fontSize: 16, lineHeight: 21, color: W.ink },
  titleOn: { color: W.done, textDecorationLine: 'line-through' },
  due: {
    fontFamily: F.body,
    fontSize: 13,
    color: W.pearInk,
    backgroundColor: W.pearWash,
    borderRadius: 10,
    overflow: 'hidden',
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  dueLate: { backgroundColor: '#F3E2C9', color: '#8A5A12' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: W.line,
  },
  pl: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: F.bodySemi, fontSize: 15, color: W.moss },
  addInput: { flex: 1, fontFamily: F.bodyMedium, fontSize: 16, color: W.ink, padding: 0 },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: W.line,
  },
  moreText: { fontFamily: F.bodySemi, fontSize: 13.5, color: W.moss },
  bring: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bringText: { fontFamily: F.bodySemi, fontSize: 13.5, color: W.moss },
});
