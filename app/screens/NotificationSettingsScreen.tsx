/**
 * Settings, under Notifications. Everything is on after the one ask; this is
 * where people change it. The top row says whether this phone can receive
 * notifications, with a fix when it can't. Changes save straight away.
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Moon,
  Pause,
  Repeat,
  Sparkles,
  Sunrise,
  Sunset,
  CalendarDays,
  FlaskConical,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { getDateService, nowTimestamp } from '../../lib/date/DateService';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { maybeAsk } from '../../lib/notifications/ask';
import {
  useNotificationSettings,
  type NotificationSettings,
  type PhoneHealth,
} from '../../hooks/useNotificationSettings';

const c = BRAND.colors;
const FOREST = '#1A3328';
const OFF = '#4B6A50';
const WASH = '#EAF2E8';
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "08:00:00" or "08:00" as a Date today, for the time pickers. */
function asDate(time: string | null | undefined, fallback: string): Date {
  const [h, m] = String(time || fallback)
    .split(':')
    .map(Number);
  const d = getDateService().now();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
const asTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function healthWords(
  h: PhoneHealth | null,
  pausedUntil: string | null,
): { title: string; sub: string; ok: boolean; fix?: string } {
  if (pausedUntil && new Date(pausedUntil).getTime() > getDateService().now().getTime()) {
    const day = DAY_NAMES[new Date(pausedUntil).getDay()];
    return { title: `Paused until ${day}`, sub: 'Your reminders still come through.', ok: true };
  }
  if (!h) return { title: 'Checking this iPhone…', sub: '', ok: true };
  switch (h.kind) {
    case 'on': {
      if (!h.lastDeliveredAt)
        return { title: 'On, reaching this iPhone', sub: 'Ready for the next one.', ok: true };
      const d = new Date(h.lastDeliveredAt);
      const when = getDateService().isTimestampToday(h.lastDeliveredAt)
        ? `at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} today`
        : `on ${DAY_NAMES[d.getDay()]}`;
      return { title: 'On, reaching this iPhone', sub: `The last one arrived ${when}.`, ok: true };
    }
    case 'off-in-settings':
      return {
        title: 'Off in iPhone Settings',
        sub: 'Nothing can reach you until they’re on.',
        ok: false,
        fix: 'Open Settings',
      };
    case 'not-asked':
      return {
        title: 'Not on yet',
        sub: 'Turn them on to get your brief, sweep and reminders.',
        ok: false,
        fix: 'Turn on',
      };
    default:
      return {
        title: 'This iPhone isn’t receiving',
        sub: 'Tap fix and Gremly will reconnect it.',
        ok: false,
        fix: 'Fix',
      };
  }
}

function Row({
  icon,
  title,
  sub,
  value,
  onChange,
  children,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  value?: boolean;
  onChange?: (v: boolean) => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const off = value === false;
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, off && styles.rowTitleOff]}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
        {children ? <View style={[styles.extra, off && styles.extraOff]}>{children}</View> : null}
      </View>
      {onChange ? (
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: '#E2E2E6', true: c.mossGreen }}
          thumbColor="#FFFFFF"
          accessibilityLabel={title}
        />
      ) : null}
    </View>
  );
}

function TimeChip({
  value,
  fallback,
  onPick,
}: {
  value: string;
  fallback: string;
  onPick: (t: string) => void;
}) {
  return (
    <DateTimePicker
      value={asDate(value, fallback)}
      mode="time"
      display="compact"
      minuteInterval={5}
      onChange={(_e, d) => d && onPick(asTime(d))}
      accentColor={c.mossGreen}
    />
  );
}

export default function NotificationSettingsScreen() {
  const navigation = useNavigation<any>();
  const isTester = useGremlyStore((s) => s.isTester);
  const { settings: s, health, save, repair } = useNotificationSettings();
  const words = healthWords(health, s?.paused_until ?? null);

  const fix = () => {
    if (!health) return;
    if (health.kind === 'off-in-settings') void Linking.openSettings();
    else if (health.kind === 'not-asked') void maybeAsk('settings');
    else void repair();
  };

  const set = (patch: Partial<NotificationSettings>) => void save(patch);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.back}
          hitSlop={12}
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color={c.mossGreen} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.health, !words.ok && styles.healthWarn]} testID="notification-health">
          <View style={[styles.dot, !words.ok && styles.dotWarn]} />
          <View style={styles.healthText}>
            <Text style={styles.healthTitle}>{words.title}</Text>
            {words.sub ? <Text style={styles.healthSub}>{words.sub}</Text> : null}
          </View>
          {words.fix ? (
            <Pressable style={styles.fix} onPress={fix} accessibilityRole="button">
              <Text style={styles.fixText}>{words.fix}</Text>
            </Pressable>
          ) : null}
        </View>

        {s ? (
          <>
            <View style={styles.group}>
              <Row
                icon={<Sunrise size={16} color={c.mossGreen} />}
                title="Morning brief"
                sub="When your day is ready in Chat"
                value={s.morning_enabled}
                onChange={(v) => set({ morning_enabled: v })}
              >
                <TimeChip
                  value={s.morning_time}
                  fallback="08:00"
                  onPick={(t) => set({ morning_time: t })}
                />
              </Row>
              <Row
                icon={<Sunset size={16} color={c.mossGreen} />}
                title="Evening sweep"
                sub="When a few things are waiting"
                value={s.evening_enabled}
                onChange={(v) => set({ evening_enabled: v })}
              >
                <TimeChip
                  value={s.evening_time}
                  fallback="20:00"
                  onPick={(t) => set({ evening_time: t })}
                />
              </Row>
              <Row
                icon={<Bell size={16} color={c.mossGreen} />}
                title="Reminders you set"
                sub="On any item, at the time you pick"
                value={s.reminders_enabled}
                onChange={(v) => set({ reminders_enabled: v })}
              />
              <Row
                icon={<Repeat size={16} color={c.mossGreen} />}
                title="Habit check-ins"
                sub="If a habit you gave a time is still waiting"
                value={s.habit_checkins_enabled}
                onChange={(v) => set({ habit_checkins_enabled: v })}
              />
              <Row
                icon={<Sparkles size={16} color={c.mossGreen} />}
                title="Notes from Gremly"
                sub="The odd note when there’s a reason"
                value={s.checkins_enabled}
                onChange={(v) =>
                  set(
                    v
                      ? {
                          checkins_enabled: true,
                          // switching this on here is a yes to these words
                          ...({
                            checkins_opted_in_at: nowTimestamp(),
                            checkins_opt_in_words:
                              'Notes from Gremly: the odd note when there’s a reason',
                          } as any),
                        }
                      : { checkins_enabled: false },
                  )
                }
                testID="notes-from-gremly"
              />
              <Row
                icon={<CalendarDays size={16} color={c.mossGreen} />}
                title="Weekly summary"
                sub="When your week in review is ready"
                value={s.weekly_enabled}
                onChange={(v) => set({ weekly_enabled: v, good_news_enabled: v })}
              >
                <View style={styles.days}>
                  {DAYS.map((d, i) => (
                    <Pressable
                      key={i}
                      style={[styles.day, s.weekly_day === i && styles.dayOn]}
                      onPress={() => set({ weekly_day: i })}
                      accessibilityLabel={DAY_NAMES[i]}
                    >
                      <Text style={[styles.dayText, s.weekly_day === i && styles.dayTextOn]}>
                        {d}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TimeChip
                  value={s.weekly_time}
                  fallback="18:00"
                  onPick={(t) => set({ weekly_time: t })}
                />
              </Row>
            </View>

            <View style={styles.group}>
              <Row
                icon={<Moon size={16} color={c.mossGreen} />}
                title="Quiet hours"
                sub="Nothing from Gremly overnight"
              >
                <View style={styles.quiet}>
                  <TimeChip
                    value={s.quiet_start}
                    fallback="21:30"
                    onPick={(t) => set({ quiet_start: t })}
                  />
                  <Text style={styles.to}>to</Text>
                  <TimeChip
                    value={s.quiet_end}
                    fallback="07:30"
                    onPick={(t) => set({ quiet_end: t })}
                  />
                </View>
              </Row>
              <Row
                icon={<Pause size={16} color={c.mossGreen} />}
                title="Pause for a week"
                sub="Your reminders still come through"
                value={
                  !!s.paused_until &&
                  new Date(s.paused_until).getTime() > getDateService().now().getTime()
                }
                onChange={(v) =>
                  set({
                    paused_until: v
                      ? new Date(getDateService().now().getTime() + 7 * 86400000).toISOString()
                      : null,
                  })
                }
              />
            </View>

            {isTester ? (
              <Pressable
                style={styles.lab}
                onPress={() => navigation.navigate('NotificationLab')}
                accessibilityRole="button"
              >
                <FlaskConical size={18} color={c.mossGreen} />
                <Text style={styles.labText}>Notification Lab</Text>
                <ChevronRight size={18} color={OFF} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.linenCream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,85,64,0.08)',
  },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 22, color: FOREST },
  content: { padding: 20, paddingBottom: 60 },
  health: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: WASH,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.14)',
    marginBottom: 18,
  },
  healthWarn: { backgroundColor: '#F6EDD2', borderColor: 'rgba(110,84,19,0.18)' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4E8A5C' },
  dotWarn: { backgroundColor: '#B07A2A' },
  healthText: { flex: 1 },
  healthTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: FOREST },
  healthSub: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: OFF, marginTop: 2 },
  fix: {
    backgroundColor: c.mossGreen,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fixText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: '#FFFFFF' },
  group: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
    overflow: 'hidden',
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46,85,64,0.12)',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: WASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: FOREST },
  rowTitleOff: { color: '#9AA19C' },
  rowSub: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: '#6A6F76', marginTop: 2 },
  extra: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  extraOff: { opacity: 0.45 },
  days: { flexDirection: 'row', gap: 4 },
  day: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: c.mossGreen },
  dayText: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 12, color: c.mossGreen },
  dayTextOn: { color: '#FFFFFF' },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  to: { fontFamily: 'Inter-Regular', fontSize: 13, color: OFF },
  lab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
  },
  labText: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: FOREST },
});
