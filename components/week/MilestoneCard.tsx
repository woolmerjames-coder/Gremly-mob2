/**
 * What is ahead: a card for each big thing more than a week out, with steps
 * along the way to tap in or out. Setting one up adds its step todos and its
 * check ins; until the review moves on it can be undone with a tap.
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { WEEK_COPY, setUpButton } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const SPACE_GREMLY = WEEK_MASCOTS.space;

export interface MilestoneView {
  key: string;
  goal: string;
  /** The date it is for, in words ("24 Oct") */
  when: string;
  steps: { when: string; title: string; check: boolean; kept: boolean }[];
  /** Its steps are set up */
  setUp: boolean;
  /** Set up in this sitting: a tap takes it back */
  canUndo: boolean;
}

export interface MilestoneCardsProps {
  milestones: MilestoneView[];
  editable: boolean;
  editing: boolean;
  locked: boolean;
  disabled?: boolean;
  onToggleStep: (key: string, index: number) => void;
  onSetUp: (key: string) => void;
  onUndo: (key: string) => void;
  onDone: () => void;
  onChange: () => void;
  onJustPlan: () => void;
}

export function MilestoneCards(p: MilestoneCardsProps) {
  const anySet = p.milestones.some((m) => m.setUp);
  return (
    <View style={styles.wrap} testID="week-ahead">
      <Image
        source={SPACE_GREMLY}
        style={styles.mascot}
        accessibilityLabel="Gremly in a space helmet"
      />
      {p.milestones.map((m) => {
        const kept = m.steps.filter((s) => s.kept).length;
        // steps are chosen before it is set up
        const choosing = p.editable && !m.setUp;
        return (
          <View
            key={m.key}
            style={[weekStyles.card, styles.card]}
            testID={`week-milestone-${m.key}`}
          >
            <View style={styles.head}>
              <Text style={styles.goal}>{m.goal}</Text>
              <Text style={styles.date}>{m.when}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.steps}
            >
              {m.steps.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.step,
                    s.kept ? (s.check ? styles.stepCheck : styles.stepTodo) : styles.stepOut,
                  ]}
                  onPress={() => p.onToggleStep(m.key, i)}
                  disabled={!choosing || p.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.kept ? 'Leave out' : 'Keep'} ${s.title}`}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.tick,
                      s.kept ? (s.check ? styles.tickCheck : styles.tickTodo) : styles.tickOut,
                    ]}
                  >
                    {s.kept ? <Check size={12} color={WEEK.white} strokeWidth={3.5} /> : null}
                  </View>
                  <Text style={styles.stepWhen}>{s.when}</Text>
                  <Text
                    style={[styles.stepTitle, !s.kept && styles.stepTitleOut]}
                    numberOfLines={4}
                  >
                    {s.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: WEEK.green }]} />
                <Text style={styles.legendText}>{WEEK_COPY.legendTodo}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: WEEK.amberDeep }]} />
                <Text style={styles.legendText}>{WEEK_COPY.legendCheck}</Text>
              </View>
            </View>
            {m.setUp ? (
              <TouchableOpacity
                style={[styles.setUp, styles.setUpDone]}
                onPress={() => p.onUndo(m.key)}
                disabled={!p.editable || !m.canUndo || p.disabled}
                accessibilityRole="button"
                testID={`week-milestone-undo-${m.key}`}
              >
                <Check size={15} color={WEEK.green} strokeWidth={3} />
                <Text style={[styles.setUpText, styles.setUpTextDone]}>
                  {p.editable && m.canUndo ? WEEK_COPY.setUpDone : WEEK_COPY.setUp}
                </Text>
              </TouchableOpacity>
            ) : p.editable ? (
              <TouchableOpacity
                style={[styles.setUp, (!kept || p.disabled) && weekStyles.off]}
                onPress={() => p.onSetUp(m.key)}
                disabled={!kept || p.disabled}
                accessibilityRole="button"
                testID={`week-milestone-setup-${m.key}`}
              >
                <Text style={styles.setUpText}>{setUpButton(kept)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
      {p.editable ? (
        <>
          <TouchableOpacity
            style={[weekStyles.second, p.disabled && weekStyles.off]}
            onPress={p.onDone}
            disabled={p.disabled}
            accessibilityRole="button"
            testID="week-ahead-done"
          >
            <Text style={weekStyles.secondText}>
              {p.editing ? WEEK_COPY.save : anySet ? WEEK_COPY.aheadNext : WEEK_COPY.notNow}
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
          testID="week-ahead-change"
        >
          <Text style={weekStyles.linkText}>{WEEK_COPY.change}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  mascot: { alignSelf: 'center', width: 88, height: 88 },
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goal: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 16, color: WEEK.ink },
  date: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: WEEK.amberInk,
    backgroundColor: WEEK.amberWash,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  steps: { gap: 6, paddingBottom: 2 },
  step: {
    width: 104,
    minHeight: 104,
    borderRadius: 14,
    padding: 8,
    gap: 4,
    borderWidth: 1.5,
  },
  stepTodo: { backgroundColor: WEEK.stepWash, borderColor: WEEK.green },
  stepCheck: { backgroundColor: WEEK.amberWash, borderColor: WEEK.amberDeep },
  stepOut: { backgroundColor: WEEK.white, borderColor: WEEK.line, borderStyle: 'dashed' },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tickTodo: { backgroundColor: WEEK.green },
  tickCheck: { backgroundColor: WEEK.amberDeep },
  tickOut: { backgroundColor: WEEK.off },
  stepWhen: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.green },
  stepTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 15, color: WEEK.ink },
  stepTitleOut: { textDecorationLine: 'line-through', color: WEEK.faint },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 11, color: WEEK.muted },
  setUp: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: WEEK.green,
    backgroundColor: WEEK.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  setUpDone: { backgroundColor: WEEK.white },
  setUpText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: WEEK.linen },
  setUpTextDone: { color: WEEK.green },
});
