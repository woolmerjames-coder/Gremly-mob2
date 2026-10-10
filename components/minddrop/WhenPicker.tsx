/**
 * WhenPicker: Pick a date on a card's When is it? (Mind Drop rethink, James's
 * 9 October ask). A calendar from today on, and a time if they know it. On
 * iOS the calendar sits in the strip and the time is a wheel under it; on
 * Android each opens the system dialog. Presentational: the day and time are
 * held by the host (CardAsk).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { formatTime } from '../../lib/chat/dayWords';
import { Calendar, Clock, type LucideIcon } from 'lucide-react-native';
import { getDateService } from '../../lib/date/DateService';

const C = {
  moss: '#2E5540',
  forest: '#1A3328',
  sageWash: '#EAF2E8',
  line: 'rgba(46,85,64,0.2)',
};

function Pill({
  icon: Icon,
  label,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon size={15} strokeWidth={2.2} color={C.moss} />
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export function WhenPicker({
  date,
  time,
  onDate,
  onTime,
  testID,
}: {
  /** the day picked (YYYY-MM-DD) */
  date: string;
  /** the time picked (HH:MM), or null for none */
  time: string | null;
  onDate: (date: string) => void;
  onTime: (time: string | null) => void;
  testID?: string;
}) {
  const ios = Platform.OS === 'ios';
  // the time the wheel shows before it is moved
  const WHEEL_START = '09:00';
  // Android opens its calendar dialog straight away; iOS shows the calendar in place
  const [open, setOpen] = React.useState<'date' | 'time' | null>(ios ? null : 'date');
  const today = getDateService().calendarDay();
  const dayWords = format(parseISO(date), 'EEE d MMM');
  const timeWords = time ? formatTime(time) : null;

  const picked = (kind: 'date' | 'time', event: { type: string }, at?: Date) => {
    // the Android dialog closes itself; the iOS wheel closes with Done
    if (!ios) setOpen(null);
    if (event.type !== 'set' || !at) return;
    if (kind === 'date') onDate(format(at, 'yyyy-MM-dd'));
    else onTime(format(at, 'HH:mm'));
  };

  return (
    <View style={styles.wrap} testID={testID}>
      {ios ? (
        <DateTimePicker
          testID={testID ? `${testID}-calendar` : undefined}
          value={parseISO(date)}
          mode="date"
          display="inline"
          minimumDate={parseISO(today)}
          themeVariant="light"
          accentColor={C.moss}
          onChange={(event, at) => picked('date', event, at)}
        />
      ) : (
        <Pill
          icon={Calendar}
          label={dayWords}
          onPress={() => setOpen('date')}
          testID={testID ? `${testID}-day` : undefined}
        />
      )}
      <View style={styles.row}>
        <Pill
          icon={Clock}
          label={timeWords ?? 'Add a time'}
          onPress={() => setOpen(open === 'time' ? null : 'time')}
          testID={testID ? `${testID}-time` : undefined}
        />
        {time ? (
          <Pressable
            onPress={() => onTime(null)}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel="No time"
            testID={testID ? `${testID}-no-time` : undefined}
          >
            <Text style={styles.clearText}>No time</Text>
          </Pressable>
        ) : null}
      </View>
      {open === 'time' || (!ios && open === 'date') ? (
        <View>
          <DateTimePicker
            testID={testID ? `${testID}-${open}-wheel` : undefined}
            value={open === 'time' ? parseISO(`${date}T${time ?? WHEEL_START}`) : parseISO(date)}
            mode={open}
            display={ios ? 'spinner' : 'default'}
            minimumDate={open === 'date' ? parseISO(today) : undefined}
            themeVariant="light"
            onChange={(event, at) => picked(open, event, at)}
          />
          {ios ? (
            <Pressable
              onPress={() => {
                // Done saves the time the wheel shows, moved or not (final check item 20)
                if (open === 'time' && !time) onTime(WHEEL_START);
                setOpen(null);
              }}
              style={styles.done}
              accessibilityRole="button"
              testID={testID ? `${testID}-time-done` : undefined}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.sageWash,
  },
  pillPressed: { opacity: 0.7 },
  pillText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: C.forest },
  clear: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: '#5C6660' },
  done: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  doneText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: C.moss },
});

export default WhenPicker;
