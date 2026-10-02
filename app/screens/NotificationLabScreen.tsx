/**
 * Notification Lab, for tester accounts: this phone as the server sees it,
 * today's plan and why anything was left out, a real "send now", and every
 * decision with its reason. Works the same in the simulator and TestFlight.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Send } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { supabase } from '../../lib/supabase/client';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { callNotificationTest } from '../../lib/cortex/CortexClient';
import { getInstallId } from '../../lib/notifications/device';

const c = BRAND.colors;
const FOREST = '#1A3328';
const OFF = '#4B6A50';
const MOMENTS: Array<{ key: string; label: string }> = [
  { key: 'brief', label: 'Morning brief' },
  { key: 'sweep', label: 'Evening sweep' },
  { key: 'nudge', label: 'Note from Gremly' },
  { key: 'return_note', label: 'Return note' },
  { key: 'good_news', label: 'Weekly summary' },
  { key: 'canary', label: 'Silent canary' },
];
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  delivered: { label: 'Delivered', bg: '#E1EFE3', fg: '#2F6B3F' },
  sent: { label: 'Sent', bg: '#F6EDD2', fg: '#6E5413' },
  sending: { label: 'Sending', bg: '#F6EDD2', fg: '#6E5413' },
  suppressed: { label: 'Held back', bg: '#ECEEFA', fg: '#4A4E7A' },
  cancelled: { label: 'Cancelled', bg: '#ECEEFA', fg: '#4A4E7A' },
  failed: { label: 'Failed', bg: '#F6E1DC', fg: '#9A3F2D' },
  planned: { label: 'Planned', bg: '#ECEEFA', fg: '#4A4E7A' },
};

const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export default function NotificationLabScreen() {
  const navigation = useNavigation();
  const userId = useGremlyStore((s) => s.userId);
  const [devices, setDevices] = useState<any[]>([]);
  const [installId, setInstallId] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [d, e, l, id] = await Promise.all([
      supabase
        .from('push_devices')
        .select(
          'install_id,platform,environment,permission,expo_token,disabled_at,disabled_reason,app_version,build_number,last_seen_at',
        )
        .eq('user_id', userId)
        .order('last_seen_at', { ascending: false }),
      supabase
        .from('user_engagement')
        .select('state,days_away,plan')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('notification_log')
        .select(
          'id,moment,status,reason,title,body,created_at,sent_at,opened_at,is_test,used_fallback,angle',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40),
      getInstallId(),
    ]);
    setDevices(d.data ?? []);
    setPlan(e.data ?? null);
    setLog(l.data ?? []);
    setInstallId(id);
  }, [userId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const sendNow = async (moment: string) => {
    setBusy(moment);
    setSaid(null);
    const res = await callNotificationTest(moment);
    setBusy(null);
    setSaid(
      res.ok
        ? 'Sent through the real sender. It shows below in a moment.'
        : `Not sent: ${res.error}`,
    );
    setTimeout(() => void load(), 3000);
  };

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
        <Text style={styles.title}>Notification Lab</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.label}>Phones</Text>
        <View style={styles.card}>
          {devices.length === 0 ? <Text style={styles.muted}>No phone registered yet.</Text> : null}
          {devices.map((d) => (
            <View key={d.install_id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>
                  {d.install_id === installId ? 'This phone' : d.platform} ·{' '}
                  {d.environment ?? 'unknown'}
                </Text>
                <Text style={styles.small}>
                  {d.permission} · {d.expo_token ? 'has a token' : 'no token'} · build{' '}
                  {d.build_number ?? '?'} · seen {clock(d.last_seen_at)}
                </Text>
                {d.disabled_at ? <Text style={styles.bad}>Off: {d.disabled_reason}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.label}>Send now</Text>
        <View style={styles.grid}>
          {MOMENTS.map((m) => (
            <Pressable
              key={m.key}
              style={styles.send}
              onPress={() => sendNow(m.key)}
              disabled={!!busy}
            >
              <Send size={14} color={c.mossGreen} />
              <Text style={styles.sendText}>{busy === m.key ? 'Sending…' : m.label}</Text>
            </Pressable>
          ))}
        </View>
        {said ? <Text style={styles.said}>{said}</Text> : null}

        <Text style={styles.label}>
          Today’s plan{plan ? ` · ${plan.state}, ${plan.days_away} days since last open` : ''}
        </Text>
        <View style={styles.card}>
          {(plan?.plan?.items ?? []).map((i: any) => (
            <View key={i.key} style={styles.line}>
              <Text style={styles.time}>{clock(i.at)}</Text>
              <Text style={styles.strong}>{i.moment.replace('_', ' ')}</Text>
            </View>
          ))}
          {(plan?.plan?.skipped ?? []).map((s: any, n: number) => (
            <View key={`s${n}`} style={styles.line}>
              <Text style={styles.time}>left out</Text>
              <Text style={styles.small}>
                {s.moment.replace('_', ' ')}: {s.reason}
              </Text>
            </View>
          ))}
          {!plan?.plan ? <Text style={styles.muted}>Not planned yet today.</Text> : null}
        </View>

        <Text style={styles.label}>Every decision</Text>
        <View style={styles.card}>
          {log.length === 0 ? <Text style={styles.muted}>Nothing yet.</Text> : null}
          {log.map((r) => {
            const st = STATUS[r.status] ?? STATUS.planned;
            return (
              <View key={r.id} style={styles.line}>
                <Text style={styles.time}>{clock(r.sent_at || r.created_at)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>
                    {r.moment.replace('_', ' ')}
                    {r.is_test ? ' (test)' : ''}
                  </Text>
                  {r.body ? (
                    <Text style={styles.small}>
                      {r.title ? `${r.title}: ` : ''}
                      {r.body}
                    </Text>
                  ) : null}
                  {r.reason ? <Text style={styles.small}>{r.reason}</Text> : null}
                  {r.used_fallback ? (
                    <Text style={styles.bad}>Fixed line (the writer failed)</Text>
                  ) : null}
                  {r.opened_at ? (
                    <Text style={styles.small}>Opened {clock(r.opened_at)}</Text>
                  ) : null}
                </View>
                <View style={[styles.pill, { backgroundColor: st.bg }]}>
                  <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
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
  label: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: '#9AA19C',
    marginTop: 14,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
    paddingHorizontal: 14,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46,85,64,0.12)',
  },
  time: { width: 64, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 12.5, color: '#6A6F76' },
  strong: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: FOREST,
    textTransform: 'capitalize',
  },
  small: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: OFF, marginTop: 2, lineHeight: 17 },
  muted: { fontFamily: 'Inter-Regular', fontSize: 13, color: '#9AA19C', paddingVertical: 12 },
  bad: { fontFamily: 'Inter-Medium', fontSize: 12.5, color: '#9A3F2D', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  send: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.16)',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  sendText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: FOREST },
  said: { fontFamily: 'Inter-Regular', fontSize: 13, color: OFF, marginTop: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 11 },
});
