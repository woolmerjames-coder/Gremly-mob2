/**
 * The bell: one sheet for reminders on any item (todos, habits, events,
 * notes, people). Quick picks first, then Pick a time and Repeat. It only
 * changes the item's reminder list; the server plans and sends them.
 *
 * If notifications are off when someone sets a reminder, the one ask shows
 * right here, because it is the moment they obviously want them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Bell, Check, X } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { getDateService } from '../../lib/date/DateService';
import type { ItemReminder } from '../../lib/types';
import {
  cleanReminders,
  confirmation,
  describeReminder,
  hhmm,
  localDay,
  newReminderId,
  quickPicks,
  type EventStart,
  type ReminderKind,
} from '../../lib/reminders/reminders';
import { pendingAsk } from '../../lib/notifications/ask';
import type { AskVariant } from '../../lib/notifications/constants';
import AskPanel from '../notifications/AskPanel';

const c = BRAND.colors;
const FOREST = '#1A3328';
const OFF = '#4B6A50';
const WASH = '#EAF2E8';
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const REPEATS: Array<{ key: NonNullable<ItemReminder['frequency']>; label: string }> = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'weekly', label: 'Some days' },
];

interface ReminderSheetProps {
  visible: boolean;
  kind: ReminderKind;
  reminders: ItemReminder[] | null | undefined;
  eventStart?: EventStart | null;
  onChange: (next: ItemReminder[]) => void;
  onClose: () => void;
}

type Panel = 'picks' | 'pick-time' | 'repeat' | 'confirm' | 'ask';

function nextHour(): Date {
  const d = getDateService().now();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function ReminderSheet({
  visible,
  kind,
  reminders,
  eventStart,
  onChange,
  onClose,
}: ReminderSheetProps) {
  const [panel, setPanel] = useState<Panel>('picks');
  const [when, setWhen] = useState<Date>(nextHour);
  const [repeat, setRepeat] = useState<NonNullable<ItemReminder['frequency']>>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [said, setSaid] = useState('');
  const [ask, setAsk] = useState<{ variant: AskVariant; step: 'ask' | 'done' } | null>(null);

  useEffect(() => {
    if (visible) {
      setPanel('picks');
      setWhen(nextHour());
      setAsk(null);
    }
  }, [visible]);

  const now = getDateService().now();
  const live = useMemo(() => cleanReminders(reminders, now), [reminders, now]);
  const picks = useMemo(() => quickPicks(kind, { now, eventStart }), [kind, now, eventStart]);

  const add = async (r: ItemReminder) => {
    onChange([...live, r]);
    setSaid(confirmation(r, { now: getDateService().now() }));
    setPanel('confirm');
    const variant = await pendingAsk('bell').catch(() => null);
    if (variant) {
      setAsk({ variant, step: 'ask' });
      setPanel('ask');
    } else {
      setTimeout(onClose, 1200);
    }
  };

  const remove = (id: string) => onChange(live.filter((r) => r.id !== id));

  const setPickedTime = () =>
    add({
      id: newReminderId(now),
      frequency: 'once',
      date: localDay(when),
      time: hhmm(when.getHours(), when.getMinutes()),
    });

  const setRepeating = () => {
    const time = hhmm(when.getHours(), when.getMinutes());
    if (repeat === 'weekly') {
      if (!days.length) return;
      add({ id: newReminderId(now), frequency: 'weekly', days_of_week: [...days].sort(), time });
    } else {
      add({ id: newReminderId(now), frequency: repeat, time });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet} testID="reminder-sheet">
        <View style={styles.handle} />
        {panel === 'ask' && ask ? (
          <AskPanel
            variant={ask.variant}
            step={ask.step}
            onOn={() => setAsk({ ...ask, step: 'done' })}
            onClose={onClose}
            onDone={onClose}
          />
        ) : panel === 'confirm' ? (
          <View style={styles.confirm}>
            <View style={styles.confirmIcon}>
              <Check size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.confirmText}>{said}</Text>
          </View>
        ) : (
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.headRow}>
              <Text style={styles.h}>Remind me</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <X size={20} color={OFF} />
              </Pressable>
            </View>

            {live.length ? (
              <View style={styles.current}>
                {live.map((r) => (
                  <View key={r.id} style={styles.rem}>
                    <Bell size={15} color={c.mossGreen} />
                    <Text style={styles.remText}>{describeReminder(r, { now })}</Text>
                    <Pressable
                      onPress={() => remove(r.id)}
                      hitSlop={10}
                      accessibilityLabel="Remove reminder"
                    >
                      <X size={16} color={OFF} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {panel === 'picks' ? (
              <View style={styles.grid}>
                {picks.map((p) => (
                  <Pressable
                    key={p.key}
                    style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
                    onPress={() =>
                      p.reminder
                        ? add(p.reminder)
                        : setPanel(p.opens === 'repeat' ? 'repeat' : 'pick-time')
                    }
                    testID={`reminder-pick-${p.key}`}
                  >
                    <Text style={styles.pickLabel}>{p.label}</Text>
                    <Text style={styles.pickDetail}>{p.detail}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {panel === 'pick-time' ? (
              <View style={styles.panel}>
                <View style={styles.pickerRow}>
                  <Text style={styles.pickerLabel}>Day</Text>
                  <DateTimePicker
                    value={when}
                    mode="date"
                    display="compact"
                    minimumDate={now}
                    onChange={(_e, d) =>
                      d &&
                      setWhen(
                        new Date(
                          d.getFullYear(),
                          d.getMonth(),
                          d.getDate(),
                          when.getHours(),
                          when.getMinutes(),
                        ),
                      )
                    }
                    accentColor={c.mossGreen}
                  />
                </View>
                <View style={styles.pickerRow}>
                  <Text style={styles.pickerLabel}>Time</Text>
                  <DateTimePicker
                    value={when}
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    onChange={(_e, d) => d && setWhen(d)}
                    accentColor={c.mossGreen}
                  />
                </View>
                <Pressable
                  style={styles.primary}
                  onPress={setPickedTime}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Set reminder</Text>
                </Pressable>
                <Pressable onPress={() => setPanel('picks')}>
                  <Text style={styles.back}>Back</Text>
                </Pressable>
              </View>
            ) : null}

            {panel === 'repeat' ? (
              <View style={styles.panel}>
                <View style={styles.chips}>
                  {REPEATS.map((r) => (
                    <Pressable
                      key={r.key}
                      style={[styles.chip, repeat === r.key && styles.chipOn]}
                      onPress={() => setRepeat(r.key)}
                    >
                      <Text style={[styles.chipText, repeat === r.key && styles.chipTextOn]}>
                        {r.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {repeat === 'weekly' ? (
                  <View style={styles.days}>
                    {DAYS.map((d, i) => {
                      const on = days.includes(i);
                      return (
                        <Pressable
                          key={i}
                          style={[styles.day, on && styles.chipOn]}
                          onPress={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                          accessibilityLabel={
                            [
                              'Sunday',
                              'Monday',
                              'Tuesday',
                              'Wednesday',
                              'Thursday',
                              'Friday',
                              'Saturday',
                            ][i]
                          }
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.pickerRow}>
                  <Text style={styles.pickerLabel}>Time</Text>
                  <DateTimePicker
                    value={when}
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    onChange={(_e, d) => d && setWhen(d)}
                    accentColor={c.mossGreen}
                  />
                </View>
                <Pressable
                  style={[styles.primary, repeat === 'weekly' && !days.length && styles.disabled]}
                  onPress={setRepeating}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Set reminder</Text>
                </Pressable>
                <Pressable onPress={() => setPanel('picks')}>
                  <Text style={styles.back}>Back</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(18,28,22,0.38)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: c.linenCream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D8D3CA',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  h: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 20, color: FOREST },
  current: { gap: 8, marginBottom: 14 },
  rem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: WASH,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  remText: { flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, color: c.mossGreen },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.16)',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 3,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  pickLabel: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: FOREST },
  pickDetail: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: c.inkMuted },
  panel: { gap: 10 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pickerLabel: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 15, color: FOREST },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: WASH },
  chipOn: { backgroundColor: c.mossGreen },
  chipText: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13.5, color: c.mossGreen },
  chipTextOn: { color: '#FFFFFF' },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: WASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    height: 50,
    borderRadius: 15,
    backgroundColor: c.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  disabled: { opacity: 0.45 },
  primaryText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 16, color: '#FFFFFF' },
  back: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: OFF,
    textAlign: 'center',
    paddingVertical: 8,
  },
  confirm: { alignItems: 'center', paddingVertical: 24, gap: 14 },
  confirmIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 16,
    color: FOREST,
    textAlign: 'center',
  },
});
