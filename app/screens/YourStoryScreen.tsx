/**
 * Your story: what Gremly has understood about the person's life, written by
 * the monthly story job from their own records. The story so far (told to
 * them), how they have used Gremly, milestones, proud moments for the harder
 * days, how things have shifted, patterns and the people who matter.
 *
 * Reached from Looking back on Worlds, and drawn in the Worlds look (look A):
 * a dark header like a Chapter's, then the parts on linen. A part with
 * nothing in it is left out.
 *
 * It is opened on purpose, so private items show here in their own words,
 * marked as private. The Not right? button at the bottom is how they say
 * something here is wrong.
 */

import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, HelpCircle, Lock } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAppEventOnFocus } from '../../lib/appEvents';
import { getDateService } from '../../lib/date/DateService';
import { useOpenQuestions, useStory, useUsage } from '../../lib/story/useStory';
import type { StoryItem, UsageGrain } from '../../lib/story/storyApi';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { dayPlain } from '../../lib/worlds/model';
import { PageTop } from '../../components/worlds/PageTop';
import { GremlyImage } from '../../components/worlds/GremlyFace';
import { Diamond, SectionHead, TextLink } from '../../components/worlds/parts';
import {
  NotRightLink,
  NotRightSheet,
  type NotRightTarget,
} from '../../components/story/NotRightSheet';

const AVATARS = lightTokens.colors.avatarPalette;

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
  return b && b !== a ? `${a} to ${b}` : a;
}

const PERIOD_LABEL: Record<UsageGrain, { tab: string; caption: string; noun: string }> = {
  week: { tab: 'Week', caption: 'This week so far', noun: 'week' },
  month: { tab: 'Month', caption: 'This month so far', noun: 'month' },
  year: { tab: 'Year', caption: 'This year so far', noun: 'year' },
};

const PATTERN_TAG: Record<string, { label: string; bg: string; fg: string }> = {
  loves: { label: 'Loves', bg: W.pearWash, fg: W.pearInk },
  often: { label: 'Often', bg: W.sageWash, fg: W.moss },
  rhythm: { label: 'Rhythm', bg: W.sageWash, fg: W.moss },
  avoids: { label: 'Avoids', bg: W.periWash, fg: W.periInk },
  rarely: { label: 'Rarely', bg: W.periWash, fg: W.periInk },
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

  const updatedDay = getDateService().extractLocalDate(story.header.writtenAt);
  const updated = updatedDay ? dayPlain(updatedDay) : null;
  const empty = !loading && !story.header.storyForThem && story.items.length === 0;

  const stats = [
    { v: usage?.active_days, l: 'days in the app' },
    { v: usage?.drops, l: 'drops' },
    { v: usage?.chat_messages, l: 'chat messages' },
    { v: usage?.todos_done, l: 'to-dos done' },
    { v: usage?.habit_checkins, l: 'habit check-ins' },
    { v: usage?.journals, l: 'journal entries' },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="your-story">
      <PageTop dark crumb="Looking back" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <View style={styles.glow} pointerEvents="none" />
          <Text style={styles.title} accessibilityRole="header">
            Your story
          </Text>
          <Text style={styles.sub}>Written by Gremly from what you’ve shared.</Text>
          {updated ? <Text style={styles.updated}>Updated {updated}</Text> : null}
          <View style={styles.headGremly}>
            <GremlyImage slug="JournalGremly" size={104} />
          </View>
        </View>

        <View style={styles.body}>
          {loading && story.items.length === 0 ? (
            <ActivityIndicator color={W.moss} style={{ marginTop: 32 }} />
          ) : null}

          {empty ? (
            <View style={[styles.card, styles.firstCard]}>
              <Text style={styles.plain}>
                Your story is still being written. It fills in as you use Gremly, and Gremly will
                never guess at it.
              </Text>
            </View>
          ) : null}

          {story.header.storyForThem ? (
            <View style={[styles.card, styles.firstCard]}>
              <View style={styles.gmark}>
                <Diamond />
                <Text style={styles.gmarkText}>So far, by Gremly</Text>
              </View>
              <Text style={styles.storyText}>{story.header.storyForThem}</Text>
            </View>
          ) : null}

          <View style={styles.rowBetween}>
            <SectionHead title="You and Gremly" />
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
            {stats.map((s) => (
              <View key={s.l} style={styles.stat}>
                <Text style={styles.statValue}>{s.v != null ? s.v.toLocaleString() : '·'}</Text>
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

          {by.milestones.length ? (
            <>
              <SectionHead title="Milestones" />
              <View style={styles.card}>
                {by.milestones.map((m, idx) => (
                  <View key={m.id} style={styles.tlRow}>
                    <View style={styles.tlRail}>
                      <View style={styles.tlDot} />
                      {idx < by.milestones.length - 1 ? <View style={styles.tlLine} /> : null}
                    </View>
                    <View
                      style={[
                        styles.tlBody,
                        idx === by.milestones.length - 1 && { paddingBottom: 0 },
                      ]}
                    >
                      {span(m) ? <Text style={styles.when}>{span(m)}</Text> : null}
                      <Text style={styles.itemTitle}>{m.title}</Text>
                      <Text style={styles.itemBody}>{m.body}</Text>
                      {m.private ? <PrivateTag /> : null}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {by.proud.length ? (
            <>
              <SectionHead title="Proud moments" />
              <View style={styles.proudBox}>
                <Text style={styles.proudNote}>For the harder days.</Text>
                {by.proud.map((p) => (
                  <View key={p.id} style={styles.proudCard}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.itemTitle, { flex: 1 }]}>{p.title}</Text>
                      <Text style={styles.proudWhen}>{dayMonth(p.period_start)}</Text>
                    </View>
                    <Text style={[styles.itemBody, { color: W.pearInk }]}>{p.body}</Text>
                    {p.private ? <PrivateTag tone="pear" /> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {by.shifts.length ? (
            <>
              <SectionHead title="How things have shifted" />
              <View style={styles.stack}>
                {by.shifts.map((s) => (
                  <View key={s.id} style={styles.card}>
                    {span(s) ? <Text style={styles.when}>{span(s)}</Text> : null}
                    <Text style={styles.itemTitle}>{s.title}</Text>
                    <Text style={styles.itemBody}>{s.body}</Text>
                    {s.private ? <PrivateTag /> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {by.patterns.length ? (
            <>
              <SectionHead title="What Gremly’s noticed about you" />
              <View style={styles.list}>
                {by.patterns.map((p, idx) => {
                  const tag = PATTERN_TAG[p.pattern_kind ?? ''] ?? PATTERN_TAG.often;
                  return (
                    <View key={p.id} style={[styles.patternRow, idx > 0 && styles.rowLine]}>
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
            </>
          ) : null}

          {by.people.length ? (
            <>
              <SectionHead title="People who matter" />
              <View style={[styles.card, styles.peopleGrid]}>
                {by.people.map((p, i) => {
                  const [name, ...rest] = p.title.split(', ');
                  const pal = AVATARS[i % AVATARS.length];
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => nav.navigate('PersonDetail', { personName: name })}
                      style={({ pressed }) => [styles.person, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${name}`}
                      testID={`story-person-${p.id}`}
                    >
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
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {questions.length ? (
            <Pressable
              onPress={() => nav.navigate('GremlyQuestions')}
              style={({ pressed }) => [styles.questions, pressed && { opacity: 0.92 }]}
              accessibilityRole="button"
            >
              <View style={styles.qIcon}>
                <HelpCircle size={20} color={W.periInk} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.qTitle}>
                  {questions.length} thing{questions.length === 1 ? '' : 's'} I’m unsure about
                </Text>
                <Text style={styles.qSub}>Answer any, skip any. I’d rather ask than guess.</Text>
              </View>
              <ChevronRight size={18} color={W.periInk} />
            </Pressable>
          ) : null}

          <View style={styles.foot}>
            <NotRightLink onPress={() => setNotRight({ text: '', kind: 'story' })} />
            <TextLink
              label="Edit or clear what Gremly remembers"
              onPress={() => nav.navigate('WhatGremlyKnows')}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </View>
      </ScrollView>
      <NotRightSheet visible={!!notRight} target={notRight} onClose={() => setNotRight(null)} />
    </SafeAreaView>
  );
}

function PrivateTag({ tone }: { tone?: 'pear' }) {
  const color = tone === 'pear' ? W.pearInk : W.off;
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
  screen: { flex: 1, backgroundColor: W.forest },
  scroll: { flexGrow: 1, backgroundColor: W.linen, paddingBottom: 60 },
  head: {
    backgroundColor: W.forest,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 24,
    minHeight: 150,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -70,
    top: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(191,216,192,0.10)',
  },
  title: {
    marginTop: 4,
    marginRight: 110,
    fontFamily: F.ui,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.6,
    color: W.linen,
  },
  sub: {
    marginTop: 8,
    marginRight: 116,
    fontFamily: F.body,
    fontSize: 15,
    lineHeight: 21,
    color: W.onDark,
  },
  updated: { marginTop: 6, fontFamily: F.body, fontSize: 13.5, color: W.sage },
  headGremly: { position: 'absolute', right: 14, bottom: 14 },
  body: { paddingHorizontal: 20, paddingTop: 4 },
  firstCard: { marginTop: 18 },
  card: {
    backgroundColor: W.white,
    borderRadius: 20,
    padding: 16,
    gap: 4,
    ...SHADOW,
  },
  stack: { gap: 10 },
  list: {
    backgroundColor: W.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    ...SHADOW,
  },
  rowLine: { borderTopWidth: 1, borderTopColor: W.line },
  gmark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  gmarkText: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(46,85,64,0.55)',
  },
  storyText: { fontFamily: F.body, fontSize: 16.5, lineHeight: 25, color: W.ink },
  plain: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: W.ink },
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
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: W.track,
  },
  segBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  segBtnOn: { backgroundColor: W.moss },
  segText: { fontFamily: F.uiSemi, fontSize: 12.5, color: W.off },
  segTextOn: { color: W.linen },
  caption: {
    fontFamily: F.body,
    fontSize: 13,
    lineHeight: 18,
    color: W.muted,
    marginHorizontal: 2,
    marginBottom: 8,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  stat: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: W.white,
    borderRadius: 16,
    padding: 12,
    gap: 2,
    ...SHADOW,
  },
  statValue: { fontFamily: F.ui, fontSize: 24, lineHeight: 28, color: W.forest },
  statLabel: { fontFamily: F.body, fontSize: 12, lineHeight: 16, color: W.muted },
  tlRow: { flexDirection: 'row', gap: 10 },
  tlRail: { width: 14, alignItems: 'center' },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: W.moss, marginTop: 5 },
  tlLine: { width: 2, flex: 1, backgroundColor: W.track, marginTop: 2 },
  tlBody: { flex: 1, paddingBottom: 18, gap: 3 },
  when: { fontFamily: F.bodySemi, fontSize: 12.5, color: W.off },
  itemTitle: { fontFamily: F.ui, fontSize: 15.5, lineHeight: 21, color: W.forest },
  itemBody: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: '#33463C' },
  proudBox: { backgroundColor: W.pearWash, borderRadius: 22, padding: 14, gap: 10 },
  proudNote: { fontFamily: F.body, fontSize: 13.5, color: W.pearInk, marginHorizontal: 2 },
  proudCard: { backgroundColor: '#FFFBF0', borderRadius: 16, padding: 14, gap: 4 },
  proudWhen: { fontFamily: F.body, fontSize: 12.5, color: W.pearInk },
  patternRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  tag: {
    minWidth: 62,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 1,
  },
  tagText: { fontFamily: F.uiSemi, fontSize: 12 },
  peopleGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, paddingHorizontal: 8 },
  person: { width: '25%', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: F.ui, fontSize: 18 },
  personName: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    color: W.forest,
  },
  personRole: {
    fontFamily: F.body,
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'center',
    color: W.muted,
  },
  questions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: W.periWash,
    borderRadius: 20,
    padding: 16,
    marginTop: 24,
  },
  qIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: W.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qTitle: { fontFamily: F.ui, fontSize: 15, color: '#2B2F55' },
  qSub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: W.periInk },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  privateText: { fontFamily: F.bodyMedium, fontSize: 12 },
  foot: { marginTop: 22, gap: 6, alignItems: 'center' },
});
