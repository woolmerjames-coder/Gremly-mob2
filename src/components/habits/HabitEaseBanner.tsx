/**
 * A habit's pause or lighter version, on the habit's own screen: the days it
 * runs, what that means, and the way back to usual. A paused habit is off
 * Today and nothing asks about it, so this is where it says so. Nothing shows
 * for a habit that is as usual.
 */
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather, Pause } from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { getDateService } from '../../../lib/date';
import { EASE_COPY, easeLine, easeToShow } from '../../../lib/habits/easeWords';

export function HabitEaseBanner({ habitId }: { habitId: string }) {
  const rows = useGremlyStore((s) => s.habitAdaptations);
  const easeHabit = useGremlyStore((s) => s.easeHabit);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const today = getDateService().today();
  const ease = easeToShow(rows, habitId, today);
  if (!ease) return null;

  // Back to usual from today, for the one shown: the days it has already run
  // stay as they were, and another set for later is left as it is (it is the
  // next one this shows).
  const ahead = ease.first > today;
  const end = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await easeHabit(habitId, {
        mode: 'usual',
        first: ahead ? ease.first : today,
        last: ease.last,
        note: '',
      });
    } catch (err) {
      console.warn('[HabitEaseBanner] the habit could not be set back to usual:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const Icon = ease.mode === 'pause' ? Pause : Feather;
  return (
    <View style={styles.banner} testID="habit-ease-banner">
      <View style={styles.row}>
        <Icon size={16} color={BRAND.colors.mossGreen} strokeWidth={2.2} />
        <Text style={styles.line}>{easeLine(ease, today)}</Text>
        <TouchableOpacity
          style={[styles.button, busy && styles.off]}
          onPress={() => void end()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          testID="habit-ease-end"
        >
          <Text style={styles.buttonText}>{ahead ? EASE_COPY.remove : EASE_COPY.backToUsual}</Text>
        </TouchableOpacity>
      </View>
      {/* what it means is said once it is running: one still to come changes nothing yet */}
      {failed ? (
        <Text style={styles.note}>{EASE_COPY.failed}</Text>
      ) : ahead ? null : (
        <Text style={styles.note}>
          {ease.mode === 'pause' ? EASE_COPY.pausedNote : EASE_COPY.lighterNote}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: BRAND.colors.surface,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: BRAND.colors.charcoalInk,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
  },
  off: { opacity: 0.5 },
  buttonText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: BRAND.colors.mossGreen },
  note: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Regular', color: BRAND.colors.inkMuted },
});
