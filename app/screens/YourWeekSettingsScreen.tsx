/**
 * Your week (Settings): the day of the week their weekly review happens on,
 * and the days that count as days off.
 *
 * Everything weekly runs on their weekly day: Gremly's look at the week, the
 * weekly summary and the review. The week it plans is the seven days after
 * it. Days off are the days that count as days off when the week's free hours
 * are set, so a week that is not Monday to Friday plans properly.
 *
 * Both are held in one place in the app (lib/week/thisWeek), which saves each
 * choice straight away and gives it to every screen.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import { useThisWeek } from '../../lib/week/thisWeek';
import { DAY_NAMES } from '../../lib/week/review/words';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// shown Monday first, as a week reads
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export const YOUR_WEEK_COPY = {
  title: 'Your week',
  weeklyDay: 'Weekly day',
  weeklyDayHint:
    'The day you plan your week with Gremly. Your weekly summary comes on this day too, and the week you plan is the seven days after it.',
  daysOff: 'Days off',
  daysOffHint:
    'The days that count as days off when you set how much time you have. Tap a day to change it.',
  failed: "That didn't save. Check your connection and try again.",
};

export default function YourWeekSettingsScreen() {
  const navigation = useNavigation();
  const { weeklyDay, daysOff, loaded, refresh, chooseWeeklyDay, chooseDaysOff } = useThisWeek();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // their own settings, read when the screen opens
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (work: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await work();
    } catch (err) {
      console.warn('[YourWeek] could not save:', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleOff = (day: number) =>
    save(() =>
      chooseDaysOff(daysOff.includes(day) ? daysOff.filter((d) => d !== day) : [...daysOff, day]),
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>{YOUR_WEEK_COPY.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{YOUR_WEEK_COPY.weeklyDay}</Text>
          <Text style={styles.cardDescription}>{YOUR_WEEK_COPY.weeklyDayHint}</Text>
          <View style={styles.days}>
            {ORDER.map((day) => {
              const on = loaded && weeklyDay === day;
              return (
                <Pressable
                  key={day}
                  style={[styles.day, on && styles.dayOn]}
                  onPress={() => void save(() => chooseWeeklyDay(day))}
                  disabled={!loaded || saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={DAY_NAMES[day]}
                  testID={`weekly-day-${day}`}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{LETTERS[day]}</Text>
                </Pressable>
              );
            })}
          </View>
          {loaded ? <Text style={styles.chosen}>{DAY_NAMES[weeklyDay]}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{YOUR_WEEK_COPY.daysOff}</Text>
          <Text style={styles.cardDescription}>{YOUR_WEEK_COPY.daysOffHint}</Text>
          <View style={styles.days}>
            {ORDER.map((day) => {
              const on = loaded && daysOff.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[styles.day, on && styles.dayOff]}
                  onPress={() => void toggleOff(day)}
                  disabled={!loaded || saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={on ? `${DAY_NAMES[day]}, a day off` : DAY_NAMES[day]}
                  testID={`day-off-${day}`}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOff]}>{LETTERS[day]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {failed ? (
          <Text style={styles.failed} testID="your-week-failed">
            {YOUR_WEEK_COPY.failed}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  backButton: { padding: spacing.xs },
  title: { fontSize: 18, fontFamily: 'PlusJakartaSans-Bold', color: BRAND.colors.charcoalInk },
  headerSpacer: { width: 32 },
  scrollView: { flex: 1 },
  content: { padding: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  cardTitle: { fontSize: 16, fontFamily: 'Inter-Medium', color: BRAND.colors.charcoalInk },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#DCE5DE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: BRAND.colors.mossGreen, borderColor: BRAND.colors.mossGreen },
  dayOff: { backgroundColor: '#FBF1DC', borderColor: '#E3A63A' },
  dayText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: '#1A3328' },
  dayTextOn: { color: '#FFFFFF' },
  dayTextOff: { color: '#8A5A0B' },
  chosen: {
    marginTop: spacing.sm,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: BRAND.colors.mossGreen,
  },
  failed: { fontFamily: 'Inter-Regular', fontSize: 13, color: '#A2402F', marginTop: spacing.xs },
});
