/**
 * Your story: what Gremly has understood about the person's life, written by
 * the monthly story job from their own records. The story so far (told to
 * them), how they have used Gremly, milestones, proud moments for the harder
 * days, how things have shifted, patterns and the people who matter.
 *
 * It is opened on purpose, so private items show here in their own words,
 * marked as private. The Not right? button at the bottom is how they say
 * something here is wrong.
 */

import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight, HelpCircle, Lock } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAppEventOnFocus } from '../../lib/appEvents';
import { useOpenQuestions, useStory, useUsage } from '../../lib/story/useStory';
import type { StoryItem, UsageGrain } from '../../lib/story/storyApi';
import {
  NotRightLink,
  NotRightSheet,
  type NotRightTarget,
} from '../../components/story/NotRightSheet';

const C = lightTokens.colors;

function monthYear(d: string | null): string {
  if (!d) return '';
  try {
    return format(parseISO(d), 'MMM yyyy');
  } catch {
    return '';
  }
}

function dayMonth(d: string | null): string {
  if (!d) return '';
  try {
    return format(parseISO(d), 'd MMM');
  } catch {
    return '';
  }
}

function span(item: StoryItem): string {
  const a = monthYear(item.period_start);
  const b = monthYear(item.period_end);
  return b && b !== a ? `${a} – ${b}` : a;
}

const PERIOD_LABEL: Record<UsageGrain, { tab: string; caption: string; noun: string }> = {
  week: { tab: 'Week', caption: 'This week so far', noun: 'week' },
  month: { tab: 'Month', caption: 'This month so far', noun: 'month' },
  year: { tab: 'Year', caption: 'This year so far', noun: 'year' },
};

const PATTERN_TAG: Record<string, { label: string; bg: string; fg: string }> = {
  loves: { label: 'LOVES', bg: '#F6EDD2', fg: '#5C4A12' },
  often: { label: 'OFTEN', bg: '#EAF2E8', fg: '#24452F' },
  rhythm: { label: 'RHYTHM', bg: '#EAF2E8', fg: '#24452F' },
  avoids: { label: 'AVOIDS', bg: '#ECEEFA', fg: '#3F4370' },
  rarely: { label: 'RARELY', bg: '#ECEEFA', fg: '#3F4370' },
};

export default function YourStoryScreen() {
  useAppEventOnFocus('story_view', { type: 'story' });
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: story, loading } = useStory();
  const { data: questions } = useOpenQuestions();
  const [grain, setGrain] = useState<UsageGrain>('year');
  const { data: usage } = useUsage(grain);
  const [notRight, setNotRight] = useState<NotRightTarget | null>(null);

  const by = useMemo(() => {
    const pick = (k: StoryItem['kind']) => story.items.filter((i) => i.kind === k);
    return {
      milestones: pick('milestone'),
      proud: pick('proud'),
      shifts: pick('shift'),
      patterns: pick('pattern'),
      people: pick('person'),
    };
  }, [story.items]);

  const updated = story.header.writtenAt
    ? format(new Date(story.header.writtenAt), 'd MMMM')
    : null;
  const empty = !loading && !story.header.storyForThem && story.items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => nav.goBack()}
          style={styles.back}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color={C.mossGreen} />
        </Pressable>
        <Text style={styles.h1}>Your story</Text>
        <Text style={styles.sub}>
          Written by Gremly from what you’ve shared{updated ? `. Updated ${updated}.` : '.'}
        </Text>

        {loading && story.items.length === 0 ? (
          <ActivityIndicator color={C.mossGreen} style={{ marginTop: 40 }} />
        ) : null}

        {empty ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              Your story is still being written. It fills in as you use Gremly, and Gremly will
              never guess at it.
            </Text>
          </View>
        ) : null}

        {story.header.storyForThem ? (
          <View style={styles.card}>
            <Text style={styles.kicker}>SO FAR</Text>
            <Text style={styles.storyText}>{story.header.storyForThem}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>You and Gremly</Text>
            <View style={styles.segment}>
              {(['week', 'month', 'year'] as UsageGrain[]).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGrain(g)}
                  style={[styles.segBtn, grain === g && styles.segBtnOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: grain === g }}
                >
                  <Text style={[styles.segText, grain === g && styles.segTextOn]}>
                    {PERIOD_LABEL[g].tab}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={styles.caption}>{PERIOD_LABEL[grain].caption}</Text>
          <View style={styles.statGrid}>
            {[
              { v: usage?.active_days, l: 'days in the app' },
              { v: usage?.drops, l: 'drops' },
              { v: usage?.chat_messages, l: 'chat messages' },
              { v: usage?.todos_done, l: 'to-dos done' },
              { v: usage?.habit_checkins, l: 'habit check-ins' },
              { v: usage?.journals, l: 'journal entries' },
            ].map((s) => (
              <View key={s.l} style={styles.stat}>
                <Text style={styles.statValue}>{s.v != null ? s.v.toLocaleString() : '–'}</Text>
                <Text style={styles.statLabel}>{s.l}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.caption}>
            {usage?.sweeps ? `${usage.sweeps} sweeps` : ''}
            {usage?.age_ups
              ? `${usage.sweeps ? ', and ' : ''}your Gremly aged up ${usage.age_ups} time${usage.age_ups === 1 ? '' : 's'}`
              : ''}
            {usage?.sweeps || usage?.age_ups ? '. ' : ''}
            Counts of how you used the app, not how your {PERIOD_LABEL[grain].noun} went.
          </Text>
        </View>

        {by.milestones.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>Milestones</Text>
            {by.milestones.map((m, idx) => (
              <View key={m.id} style={styles.tlRow}>
                <Text style={styles.tlWhen}>{span(m)}</Text>
                <View style={styles.tlRail}>
                  <View style={styles.tlDot} />
                  {idx < by.milestones.length - 1 ? <View style={styles.tlLine} /> : null}
                </View>
                <View style={styles.tlBody}>
                  <Text style={styles.itemTitle}>{m.title}</Text>
                  <Text style={styles.itemBody}>{m.body}</Text>
                  {m.private ? <PrivateTag /> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {by.proud.length ? (
          <View style={[styles.section, styles.proudBox]}>
            <Text style={[styles.h2, { color: '#3F3108' }]}>Proud moments</Text>
            <Text style={[styles.caption, { color: '#5C4A12', marginTop: -6 }]}>
              For the harder days.
            </Text>
            {by.proud.map((p) => (
              <View key={p.id} style={styles.proudCard}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.itemTitle, { color: '#2E2405', flex: 1 }]}>{p.title}</Text>
                  <Text style={styles.proudWhen}>{dayMonth(p.period_start)}</Text>
                </View>
                <Text style={[styles.itemBody, { color: '#4A3B10' }]}>{p.body}</Text>
                {p.private ? <PrivateTag tone="pear" /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {by.shifts.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>How things have shifted</Text>
            {by.shifts.map((s) => (
              <View key={s.id} style={styles.card}>
                <Text style={styles.itemTitle}>{s.title}</Text>
                {span(s) ? <Text style={styles.when}>{span(s)}</Text> : null}
                <Text style={styles.itemBody}>{s.body}</Text>
                {s.private ? <PrivateTag /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {by.patterns.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>What Gremly’s noticed about you</Text>
            {by.patterns.map((p) => {
              const tag = PATTERN_TAG[p.pattern_kind ?? ''] ?? PATTERN_TAG.often;
              return (
                <View key={p.id} style={[styles.card, styles.patternRow]}>
                  <View style={[styles.tag, { backgroundColor: tag.bg }]}>
                    <Text style={[styles.tagText, { color: tag.fg }]}>{tag.label}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemTitle}>{p.title}</Text>
                    <Text style={styles.itemBody}>{p.body}</Text>
                    {p.private ? <PrivateTag /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {by.people.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>People who matter</Text>
            <View style={styles.peopleGrid}>
              {by.people.map((p, i) => {
                const [name, ...rest] = p.title.split(', ');
                const pal = C.avatarPalette[i % C.avatarPalette.length];
                return (
                  <View key={p.id} style={styles.person}>
                    <View style={[styles.avatar, { backgroundColor: pal.bg }]}>
                      <Text style={[styles.avatarText, { color: pal.fg }]}>
                        {name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.personName} numberOfLines={2}>
                      {name}
                    </Text>
                    {rest.length ? (
                      <Text style={styles.personRole} numberOfLines={2}>
                        {rest.join(', ')}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {questions.length ? (
          <Pressable
            onPress={() => nav.navigate('GremlyQuestions')}
            style={styles.questionsCard}
            accessibilityRole="button"
          >
            <View style={styles.qIcon}>
              <HelpCircle size={20} color="#4A4E7A" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.qTitle}>
                {questions.length} thing{questions.length === 1 ? '' : 's'} I’m unsure about
              </Text>
              <Text style={styles.qSub}>Answer any, skip any. I’d rather ask than guess.</Text>
            </View>
            <ChevronRight size={18} color="#4A4E7A" />
          </Pressable>
        ) : null}

        <NotRightLink onPress={() => setNotRight({ text: '', kind: 'story' })} />
        <Pressable
          onPress={() => nav.navigate('WhatGremlyKnows')}
          style={styles.manage}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.manageText}>Edit or clear what Gremly remembers</Text>
        </Pressable>
      </ScrollView>
      <NotRightSheet visible={!!notRight} target={notRight} onClose={() => setNotRight(null)} />
    </SafeAreaView>
  );
}

function PrivateTag({ tone }: { tone?: 'pear' }) {
  const color = tone === 'pear' ? '#6E5413' : '#4D5A52';
  return (
    <View style={styles.privateRow}>
      <Lock size={12} color={color} />
      <Text style={[styles.privateText, { color }]}>
        Private: only here, never on cards or notifications
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.linenCream },
  content: { paddingHorizontal: 18, paddingBottom: 60, gap: 22 },
  back: { width: 40, height: 40, justifyContent: 'center', marginTop: 4, marginBottom: -14 },
  h1: {
    fontFamily: 'Fraunces-SemiBold',
    fontSize: 34,
    lineHeight: 38,
    color: C.worldsInk,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 20,
    color: '#4D5A52',
    marginTop: -14,
  },
  section: { gap: 12 },
  h2: { fontFamily: 'Fraunces-SemiBold', fontSize: 22, lineHeight: 27, color: C.worldsInk },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.worldsCardBorder,
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  kicker: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: C.mossGreen,
  },
  storyText: { fontFamily: 'Fraunces', fontSize: 17, lineHeight: 26, color: C.worldsInk },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22, color: C.worldsInk },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 999,
    backgroundColor: '#EFEBE2',
  },
  segBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  segBtnOn: { backgroundColor: C.mossGreen },
  segText: { fontFamily: 'Inter-Medium', fontSize: 12.5, fontWeight: '700', color: '#4D5A52' },
  segTextOn: { color: C.linenCream },
  caption: { fontFamily: 'Inter-Regular', fontSize: 12.5, lineHeight: 18, color: '#4D5A52' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.worldsCardBorder,
    borderRadius: 16,
    padding: 12,
    gap: 2,
  },
  statValue: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, lineHeight: 28, color: C.worldsInk },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, color: '#4D5A52' },
  tlRow: { flexDirection: 'row', gap: 8 },
  tlWhen: {
    width: 70,
    textAlign: 'right',
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#4D5A52',
    paddingTop: 2,
  },
  tlRail: { width: 18, alignItems: 'center' },
  tlDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.mossGreen, marginTop: 4 },
  tlLine: { width: 2, flex: 1, backgroundColor: '#D6E3D4' },
  tlBody: { flex: 1, paddingBottom: 18, gap: 3 },
  itemTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: C.worldsInk,
  },
  itemBody: { fontFamily: 'Inter-Regular', fontSize: 13.5, lineHeight: 20, color: '#33463C' },
  when: { fontFamily: 'Inter-Medium', fontSize: 12, color: C.mossGreen },
  proudBox: { backgroundColor: '#F6EDD2', borderRadius: 24, padding: 18 },
  proudCard: { backgroundColor: '#FFFBF0', borderRadius: 16, padding: 14, gap: 4 },
  proudWhen: { fontFamily: 'Inter-Regular', fontSize: 12, color: '#6E5413' },
  patternRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tag: {
    minWidth: 56,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: { fontFamily: 'Inter-Medium', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  person: { width: '25%', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Fraunces-SemiBold', fontSize: 18 },
  personName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    color: C.worldsInk,
  },
  personRole: {
    fontFamily: 'Inter-Regular',
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'center',
    color: '#4D5A52',
  },
  questionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ECEEFA',
    borderRadius: 22,
    padding: 18,
  },
  qIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qTitle: { fontFamily: 'Inter-Medium', fontSize: 15, fontWeight: '700', color: '#2B2F55' },
  qSub: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18, color: '#4A4E7A' },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  privateText: { fontFamily: 'Inter-Medium', fontSize: 12, fontWeight: '600' },
  manage: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', marginTop: -16 },
  manageText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    color: '#4D5A52',
    textDecorationLine: 'underline',
  },
});
