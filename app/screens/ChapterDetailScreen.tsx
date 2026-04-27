// app/screens/ChapterDetailScreen.tsx
//
// Phase B.4 — World vs Chapter v4 redesign.
//
// Sections (in order):
//   1. Nav bar: back ‹ · breadcrumb "in [World] ⊕" · ···
//   2. Chapter title (22px)
//   3. Date banner — tight single-row: date range + countdown + ACTIVE/CLOSED tag
//   4. ChapterDispatcher — section composition depends on arc shape

import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useState } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { format, differenceInCalendarDays } from 'date-fns';
import { getDateService } from '../../lib/date/DateService';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import {
  useChapterById,
  useWorldById,
  useWorldPalette,
  useChapterDrops,
  useActiveHabitsForWorld,
  useHabitWeekGrid,
} from '../../lib/store/worldsSelectors';
import { resolveChapterPhases } from '../../lib/worlds/chapterDisplay';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Chapter } from '../../lib/supabase/types';
import type { Habit } from '../../lib/types';
import { EditableChapterBanner } from '../../components/chapters/EditableChapterBanner';
import { ChapterDateEditSheet } from '../../components/chapters/ChapterDateEditSheet';
import { ChapterTitleEditSheet } from '../../components/chapters/ChapterTitleEditSheet';
import { ChapterDispatcher } from '../../components/chapters/layouts/ChapterDispatcher';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

type RouteT = RouteProp<RootStackParamList, 'ChapterDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'ChapterDetail'>;

const WEEKS_BACK = 13;

export default function ChapterDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const chapter = useChapterById(route.params.chapterId);
  const parentWorld = useWorldById(chapter?.primary_world_id ?? '');
  const worldName = parentWorld?.display_name || parentWorld?.name || 'World';

  if (!chapter) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.hdr}>
          <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
            <ChevronLeft size={22} color={lightTokens.colors.worldsInk} />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Chapter not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID={`chapter-detail-${chapter.id}`}>
      {/* ── Nav bar ── */}
      <View style={styles.hdr}>
        <Pressable onPress={() => nav.goBack()} style={styles.iconBtn} testID="chapter-detail-back">
          <ChevronLeft size={22} color={lightTokens.colors.worldsInk} />
        </Pressable>

        <Pressable
          style={styles.breadcrumb}
          onPress={() =>
            parentWorld ? nav.navigate('WorldDetail', { worldId: parentWorld.id }) : nav.goBack()
          }
        >
          <Text style={styles.breadcrumbText}>in {worldName} ⊕</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            (SheetManager.show as (...args: any[]) => void)('chapter-menu', {
              payload: { chapterId: chapter.id },
            })
          }
          style={styles.iconBtn}
          testID="chapter-detail-menu"
        >
          <MoreHorizontal size={20} color={lightTokens.colors.worldsInk} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <ChapterBody
          chapter={chapter}
          worldId={chapter.primary_world_id ?? ''}
          worldName={worldName}
          onNavigateWorld={() =>
            parentWorld ? nav.navigate('WorldDetail', { worldId: parentWorld.id }) : undefined
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ChapterBody ──────────────────────────────────────────────────────────────

interface ChapterBodyProps {
  chapter: Chapter;
  worldId: string;
  worldName: string;
  onNavigateWorld: () => void;
}

function ChapterBody({ chapter, worldId }: ChapterBodyProps) {
  const palette = useWorldPalette(worldId);
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const updateChapterDates = useGremlyStore((s) => s.updateChapterDates);
  const updateChapterTitle = useGremlyStore((s) => s.updateChapterTitle);

  return (
    <View style={bodyStyles.root}>
      {/* 2. Title */}
      <View style={bodyStyles.titleWrap}>
        <Pressable
          onPress={() => setTitleSheetOpen(true)}
          hitSlop={4}
          testID="chapter-title-pressable"
        >
          <Text style={bodyStyles.title}>{chapter.title}</Text>
        </Pressable>
      </View>

      {/* 3. Date banner */}
      <EditableChapterBanner chapter={chapter} onEdit={() => setEditSheetVisible(true)} />
      <ChapterDateEditSheet
        visible={editSheetVisible}
        chapter={chapter}
        onClose={() => setEditSheetVisible(false)}
        onSave={async (input) => {
          await updateChapterDates({ chapterId: chapter.id, ...input });
        }}
      />
      <ChapterTitleEditSheet
        visible={titleSheetOpen}
        chapter={chapter}
        onClose={() => setTitleSheetOpen(false)}
        onSave={(input) =>
          updateChapterTitle({
            chapterId: chapter.id,
            title: input.title,
            reason: input.reason,
          })
        }
      />

      <ChapterDispatcher chapter={chapter} />
    </View>
  );
}

const bodyStyles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  titleWrap: {
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 28,
    letterSpacing: -0.3,
    color: lightTokens.colors.worldsInk,
    marginBottom: 6,
  },
  epigraphWrap: {
    marginBottom: 26,
  },
  epigraph: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
    fontStyle: 'italic',
  },
});

// ─── Date banner ─────────────────────────────────────────────────────────────

interface PaletteProps {
  palette: { dot: string; base: string; tint: string; textOnBase: string };
}

function ChapterDateBanner({ chapter, palette }: { chapter: Chapter } & PaletteProps) {
  const startLabel = chapter.start_date
    ? format(new Date(chapter.start_date), 'MMM d').toUpperCase()
    : null;
  const endLabel = chapter.end_date
    ? format(new Date(chapter.end_date), 'MMM d').toUpperCase()
    : null;

  let dayLabel: string | null = null;
  let totalDays: number | null = null;
  let progress = 0;

  if (chapter.start_date) {
    const start = new Date(chapter.start_date);
    const today = getDateService().now();
    const dayNumber = differenceInCalendarDays(today, start) + 1;
    dayLabel = `day ${dayNumber}`;

    if (chapter.end_date) {
      const end = new Date(chapter.end_date);
      totalDays = differenceInCalendarDays(end, start) + 1;
      const daysElapsed = Math.max(1, differenceInCalendarDays(today, start) + 1);
      progress = Math.min(1, daysElapsed / totalDays);
      dayLabel = `day ${dayNumber} of ~${totalDays}`;
    }
  }

  if (!startLabel && !endLabel && !dayLabel) return null;

  return (
    <View style={bannerStyles.banner}>
      <View style={bannerStyles.topRow}>
        {startLabel && endLabel ? (
          <Text style={bannerStyles.dateRange}>
            {startLabel} → {endLabel}
          </Text>
        ) : startLabel ? (
          <Text style={bannerStyles.dateRange}>since {startLabel}</Text>
        ) : null}
        {dayLabel ? <Text style={bannerStyles.dayLabel}>{dayLabel}</Text> : null}
      </View>
      {chapter.end_date && chapter.start_date ? (
        <View style={bannerStyles.track}>
          <View
            style={[
              bannerStyles.fill,
              { width: `${Math.round(progress * 100)}%`, backgroundColor: palette.dot },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: lightTokens.colors.worldsInk,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateRange: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    letterSpacing: 0.4,
    color: '#F5F0E6',
  },
  dayLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
  },
  track: {
    height: 3,
    backgroundColor: '#5F5E5A',
    borderRadius: 2,
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
});

// ─── WHERE YOU ARE ────────────────────────────────────────────────────────────

function WhereYouAreSection({ chapter, palette }: { chapter: Chapter } & PaletteProps) {
  const phases = resolveChapterPhases(chapter);
  if (phases.labels.length === 0) return null;

  // Insight: prefer card_subtitle (classifier-authored), then summary excerpt
  const insight =
    chapter.card_subtitle?.trim() ||
    (chapter.summary?.trim() ? chapter.summary.trim().slice(0, 120) : null);

  return (
    <View style={whereStyles.container}>
      <Text style={whereStyles.sectionLabel}>WHERE YOU ARE</Text>

      {/* Phase spine */}
      <View style={whereStyles.spineRow}>
        {phases.labels.map((label, i) => {
          const active = phases.segments[i];
          const isCurrent = i === phases.currentIndex;
          return (
            <View key={label} style={whereStyles.phaseSegWrap}>
              <View
                style={[
                  whereStyles.phaseSeg,
                  {
                    backgroundColor: active ? palette.dot : lightTokens.colors.worldsCardBorder,
                  },
                  isCurrent && {
                    shadowColor: palette.dot,
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 1,
                  },
                ]}
              />
              <Text
                style={[
                  whereStyles.phaseLabel,
                  isCurrent && { color: lightTokens.colors.worldsInk, fontWeight: '600' },
                ]}
              >
                {label.toLowerCase()}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Insight text */}
      {insight ? <Text style={whereStyles.insight}>{insight}</Text> : null}
    </View>
  );
}

const whereStyles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  spineRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  phaseSegWrap: {
    flex: 1,
  },
  phaseSeg: {
    height: 4,
    borderRadius: 2,
    marginBottom: 5,
  },
  phaseLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: lightTokens.colors.warmGrey,
    textAlign: 'center',
  },
  insight: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
    color: lightTokens.colors.worldsInk,
    paddingHorizontal: 2,
  },
});

// ─── NEEDS YOU ────────────────────────────────────────────────────────────────

function ChapterNeedsYouSection({
  chapterId,
  palette,
}: {
  chapterId: string;
  palette: { dot: string };
}) {
  const drops = useChapterDrops(chapterId);
  const open = drops.todos
    .filter((t) => !t.completed_at && !t.archived)
    .sort((a, b) => {
      const aB = a.priority_kind === 'blocker' ? 0 : 1;
      const bB = b.priority_kind === 'blocker' ? 0 : 1;
      if (aB !== bB) return aB - bB;
      if (a.due_day && b.due_day) return a.due_day.localeCompare(b.due_day);
      if (a.due_day) return -1;
      if (b.due_day) return 1;
      return 0;
    })
    .slice(0, 5);

  if (open.length === 0) return null;
  const totalOpen = drops.todos.filter((t) => !t.completed_at && !t.archived).length;

  return (
    <View style={needsStyles.container}>
      <Text style={needsStyles.sectionLabel}>NEEDS YOU · {totalOpen}</Text>
      {open.map((todo, idx) => {
        const isLast = idx === open.length - 1;
        return (
          <View key={todo.id} style={[needsStyles.row, !isLast && needsStyles.rowDivider]}>
            <View style={[needsStyles.checkbox, { borderColor: palette.dot }]} />
            <Text style={needsStyles.todoLabel} numberOfLines={1}>
              {todo.name || todo.title || '(untitled)'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const needsStyles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  row: {
    paddingVertical: 7,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    flexShrink: 0,
  },
  todoLabel: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.worldsInk,
  },
});

// ─── THIS CHAPTER'S RHYTHM ────────────────────────────────────────────────────

interface ChapterRhythmSectionProps {
  worldId: string;
  chapterStartDate: string | null;
  palette: { dot: string };
}

function ChapterRhythmSection({ worldId, chapterStartDate, palette }: ChapterRhythmSectionProps) {
  const habits = useActiveHabitsForWorld(worldId);
  if (habits.length === 0) return null;

  // Label: "since [month year]" derived from start date
  const sinceLabel = chapterStartDate
    ? format(new Date(chapterStartDate), 'MMM d').toUpperCase()
    : null;

  return (
    <View style={rhythmStyles.container}>
      <Text style={rhythmStyles.sectionLabel}>
        THIS CHAPTER'S RHYTHM{sinceLabel ? ` · since ${sinceLabel}` : ''}
      </Text>
      {habits.map((habit, idx) => {
        const isLast = idx === habits.length - 1;
        return <ChapterHabitRow key={habit.id} habit={habit} isLast={isLast} palette={palette} />;
      })}
    </View>
  );
}

interface ChapterHabitRowProps {
  habit: Habit;
  isLast: boolean;
  palette: { dot: string };
}

function ChapterHabitRow({ habit, isLast, palette }: ChapterHabitRowProps) {
  const grid = useHabitWeekGrid(habit.id, WEEKS_BACK);

  return (
    <View style={[rhythmStyles.habitWrap, !isLast && rhythmStyles.habitDivider]}>
      <View style={rhythmStyles.habitHeader}>
        <Text style={rhythmStyles.habitName} numberOfLines={1}>
          {habit.name || '(untitled)'}
        </Text>
        <Text style={rhythmStyles.hitCount}>
          {grid.hitCount} / {WEEKS_BACK} weeks
        </Text>
      </View>
      <View style={rhythmStyles.tileRow}>
        {grid.weeks.map((hit, i) => {
          const isCurrent = i === WEEKS_BACK - 1;
          return (
            <View
              key={i}
              style={[
                rhythmStyles.tile,
                hit
                  ? isCurrent
                    ? [rhythmStyles.tileHit, { backgroundColor: palette.dot, opacity: 1 }]
                    : [rhythmStyles.tileHit, { backgroundColor: palette.dot }]
                  : rhythmStyles.tileMiss,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const rhythmStyles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  habitWrap: {
    paddingBottom: 14,
    paddingHorizontal: 2,
  },
  habitDivider: {
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  habitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  habitName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.worldsInk,
  },
  hitCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 3,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 2,
  },
  tileHit: {
    opacity: 0.85,
  },
  tileMiss: {
    backgroundColor: '#F5F1E8',
    borderWidth: 0.5,
    borderColor: '#E5DFD2',
  },
});

// ─── WHEN THIS CLOSES ─────────────────────────────────────────────────────────

function ChapterClosureFooter({ text }: { text: string }) {
  return (
    <View style={closureStyles.container}>
      <Text style={closureStyles.label}>WHEN THIS CLOSES</Text>
      <View style={closureStyles.box}>
        <Text style={closureStyles.body}>{text}</Text>
      </View>
    </View>
  );
}

const closureStyles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  box: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.dashedFrameBorder,
    borderRadius: 8,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 16,
    color: lightTokens.colors.worldsInk,
  },
});

// ─── Global screen styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.worldsSurface },
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  breadcrumbText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
});
