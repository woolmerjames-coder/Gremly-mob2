/**
 * The shape of the week: deadlines and big moments, the busiest days, and the
 * hours free for todos and habits on a normal day, a busy day and a day off,
 * in half hour steps. It starts from last week's answers, or from Gremly's
 * guess the first time; they change it to what is real.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Minus, Plus, X } from 'lucide-react-native';
import type { DayKind } from '../../lib/week/model';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';

export interface ShapeCardProps {
  /** Deadlines and big moments, each with when it is in words */
  dates: { key: string; when: string; what: string }[];
  /** The days being planned, in order */
  days: { day: string; letter: string; name: string; busy: boolean }[];
  busyNote: string;
  hours: { kind: DayKind; title: string; days: string; value: string }[];
  /** "About 14 hours this week" */
  total: string;
  /** Why Gremly guessed the hours he did, while they are still his guess */
  reason?: string | null;
  editable: boolean;
  editing: boolean;
  locked: boolean;
  disabled?: boolean;
  onRemoveDate: (key: string) => void;
  onAddDate: (text: string) => void;
  onToggleBusy: (day: string) => void;
  onStepHours: (kind: DayKind, delta: number) => void;
  onDone: () => void;
  onChange: () => void;
  onJustPlan: () => void;
}

export function ShapeCard(p: ShapeCardProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    p.onAddDate(t);
  };
  return (
    <View style={[weekStyles.card, styles.card]} testID="week-shape">
      <View style={styles.section}>
        <Text style={weekStyles.label}>{WEEK_COPY.deadlines}</Text>
        {p.dates.length ? (
          p.dates.map((d) => (
            <View key={d.key} style={styles.dateRow}>
              <Text style={styles.when}>{d.when}</Text>
              <Text style={styles.what}>{d.what}</Text>
              {p.editable ? (
                <TouchableOpacity
                  style={styles.remove}
                  onPress={() => p.onRemoveDate(d.key)}
                  disabled={p.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${d.what}`}
                  hitSlop={8}
                >
                  <X size={12} color={WEEK.muted} strokeWidth={3} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={weekStyles.hint}>{WEEK_COPY.noDeadlines}</Text>
        )}
        {p.editable ? (
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={WEEK_COPY.addOne}
              placeholderTextColor={WEEK.faint}
              accessibilityLabel="Add a deadline"
              editable={!p.disabled}
              returnKeyType="done"
              onSubmitEditing={add}
              testID="week-shape-add-input"
            />
            <TouchableOpacity
              style={[styles.addButton, p.disabled && weekStyles.off]}
              onPress={add}
              disabled={p.disabled}
              accessibilityRole="button"
              testID="week-shape-add"
            >
              <Text style={styles.addText}>{WEEK_COPY.add}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={weekStyles.label}>{WEEK_COPY.busiest}</Text>
        <View style={styles.dayRow}>
          {p.days.map((d) => (
            <TouchableOpacity
              key={d.day}
              style={[styles.day, d.busy && styles.dayBusy]}
              onPress={() => p.onToggleBusy(d.day)}
              disabled={!p.editable || p.disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: d.busy }}
              accessibilityLabel={d.busy ? `${d.name}, busy` : d.name}
              testID={`week-busy-${d.day}`}
            >
              <Text style={[styles.dayText, d.busy && styles.dayTextBusy]}>{d.letter}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={weekStyles.hint}>{p.busyNote}</Text>
      </View>

      <View style={styles.section}>
        <Text style={weekStyles.label}>{WEEK_COPY.freeHours}</Text>
        <Text style={weekStyles.hint}>{WEEK_COPY.freeHoursHint}</Text>
        {p.reason ? <Text style={weekStyles.hint}>{p.reason}</Text> : null}
        {p.hours.map((h) => (
          <View key={h.kind} style={styles.hoursRow}>
            <View style={weekStyles.grow}>
              <Text style={weekStyles.label}>{h.title}</Text>
              <Text style={weekStyles.hint}>{h.days}</Text>
            </View>
            <TouchableOpacity
              style={[styles.step, !p.editable && weekStyles.off]}
              onPress={() => p.onStepHours(h.kind, -0.5)}
              disabled={!p.editable || p.disabled}
              accessibilityRole="button"
              accessibilityLabel={`Half an hour less on ${h.title.toLowerCase()}`}
              testID={`week-hours-less-${h.kind}`}
            >
              <Minus size={18} color={WEEK.green} strokeWidth={2.6} />
            </TouchableOpacity>
            <Text style={styles.value} testID={`week-hours-${h.kind}`}>
              {h.value}
            </Text>
            <TouchableOpacity
              style={[styles.step, !p.editable && weekStyles.off]}
              onPress={() => p.onStepHours(h.kind, 0.5)}
              disabled={!p.editable || p.disabled}
              accessibilityRole="button"
              accessibilityLabel={`Half an hour more on ${h.title.toLowerCase()}`}
              testID={`week-hours-more-${h.kind}`}
            >
              <Plus size={18} color={WEEK.green} strokeWidth={2.6} />
            </TouchableOpacity>
          </View>
        ))}
        <Text style={styles.total}>{p.total}</Text>
      </View>

      {p.editable ? (
        <>
          <TouchableOpacity
            style={[weekStyles.main, p.disabled && weekStyles.off]}
            onPress={p.onDone}
            disabled={p.disabled}
            accessibilityRole="button"
            testID="week-shape-done"
          >
            <Text style={weekStyles.mainText}>
              {p.editing ? WEEK_COPY.save : WEEK_COPY.shapeDone}
            </Text>
          </TouchableOpacity>
          {!p.editing ? (
            <TouchableOpacity
              style={weekStyles.link}
              onPress={p.onJustPlan}
              disabled={p.disabled}
              accessibilityRole="button"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.justPlan}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {p.locked ? (
        <TouchableOpacity
          style={weekStyles.link}
          onPress={p.onChange}
          disabled={p.disabled}
          accessibilityRole="button"
          testID="week-shape-change"
        >
          <Text style={weekStyles.linkText}>{WEEK_COPY.change}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  section: { gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  when: { width: 58, fontFamily: 'Inter-SemiBold', fontSize: 12, color: WEEK.amberInk },
  what: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: WEEK.ink },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WEEK.linen2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WEEK.line,
    paddingHorizontal: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: WEEK.ink,
    backgroundColor: WEEK.linen,
  },
  addButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: WEEK.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: WEEK.ink },
  dayRow: { flexDirection: 'row', gap: 5 },
  day: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: WEEK.chipLine,
    backgroundColor: WEEK.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBusy: { borderColor: WEEK.amberDeep, backgroundColor: WEEK.amberWash },
  dayText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: WEEK.ink },
  dayTextBusy: { color: WEEK.amberDark },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: WEEK.line,
    backgroundColor: WEEK.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    width: 62,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: WEEK.ink,
  },
  total: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.green },
});
