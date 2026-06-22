/**
 * SweepHabitCardC — Card C, redesign pass (Option C read treatment on an
 * Option B structural skeleton, per sweep-habit-card-redesign.html).
 *
 * Structure: dark forest header (serif name, compact pills, lifetime total)
 * then a gold-railed body — LAST 6 WEEKS / THIS WEEK / GREMLY'S READ slab /
 * NEXT 7 DAYS. The read is the only tinted slab on the card.
 *
 * Phase 4a scope unchanged: existing mechanics wired; 4b handlers arrive as
 * props (no-op permitted). Props are identical to the previous revision —
 * 4b remains wiring only.
 *
 * NOTE: all text in this file uses React Native's Text directly. The ui
 * primitive applies its own default fontSize, which breaks nested-span
 * inheritance (root cause of the oversized label + stat tokens).
 */

import React from 'react';
import { View, Text as RNText, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  Check,
  Pause,
  Flame,
  X,
  Calendar,
  ChevronDown,
  TrendingDown,
  Sparkles,
} from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { getDateService } from '../../../lib/date/DateService';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitReadEntry } from '../../../lib/store/useGremlyStore';
import type { HabitAdaptationRow, HabitPlanRow } from '../../../lib/store/useGremlyStore';
import type { FrequencyRecommendation } from '../../../lib/habits/habitFrequencyRecommendation';
import { getFrequencyDisplayLabel } from '../../../lib/habits/habitFrequencyRecommendation';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

// Golden pear treatment (Option C) — derived from BRAND.colors.goldenPear #E0C47A
const GOLD_TINT = 'rgba(224, 196, 122, 0.16)';
const GOLD_RAIL = '#C9A75C';
const GOLD_LABEL = '#A9853B';
const GOLD_DEEP = '#8A6A28';
const GOLD_BOLD = '#4A3A12';
const HEADER_BG = BRAND.colors.deepForest;
const CREAM = BRAND.colors.linenCream;

export interface SweepHabitCardCProps {
  card: HabitCardStats;
  readEntry: HabitReadEntry | null;
  readLoading: boolean;
  rec: FrequencyRecommendation | null;
  appliedChange: { from: number; to: number; label: string } | null;
  adaptationsForCard: HabitAdaptationRow[];
  planStart: string;
  planStartLabel: string;
  habitPlans: HabitPlanRow[];
  onToggleDay: (date: string, isCompleted: boolean) => void;
  onTogglePlanCell: (date: string, planned: boolean, paused: boolean) => void;
  onChipPress: (n: number) => void;
  onDismissRead: () => void;
  onRemoveAdaptation: (id: string) => void;
  /** 4b: tapping an idea creates a floor adaptation. No-op in 4a. */
  onSelectIdea?: (idea: string, start: string, end: string, ref: string) => void;
  /** 4b: tapping the pause option creates a pause adaptation. No-op in 4a. */
  onSelectPause?: (start: string, end: string, ref: string) => void;
  /** 4b: opens the start-date menu. No-op in 4a. */
  onPressPlanStart?: () => void;
  /** 4b: opens the adapt form. No-op in 4a. */
  onPressAdapt?: () => void;
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatShortDate(iso: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

function formatSinceLabel(iso: string | null): string {
  if (!iso || iso.length < 7) return '';
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[parseInt(iso.slice(5, 7), 10) - 1] ?? '';
}

/** Paragraph with the disruption label + date range emphasized (Option C: bold, gold-dark). */
function ReadParagraph({ paragraph, boldTerms }: { paragraph: string; boldTerms: string[] }) {
  if (boldTerms.length === 0) {
    return <RNText style={styles.readPara}>{paragraph}</RNText>;
  }
  const pattern = boldTerms
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const parts = paragraph.split(new RegExp(`(${pattern})`, 'i'));
  return (
    <RNText style={styles.readPara}>
      {parts.map((part, i) =>
        boldTerms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <RNText key={i} style={styles.readParaBold}>
            {part}
          </RNText>
        ) : (
          part
        ),
      )}
    </RNText>
  );
}

/** Gold rail section header: dot in gutter, caps label, right-aligned stat. */
function SectionHead({
  label,
  right,
  filled,
}: {
  label: string;
  right?: string;
  filled?: boolean;
}) {
  return (
    <View style={styles.secHead}>
      <View style={styles.gutter}>
        <View style={[styles.railDot, filled && styles.railDotFilled]} />
      </View>
      <RNText style={styles.secLabel}>{label}</RNText>
      <View style={{ flex: 1 }} />
      {right ? <RNText style={styles.secRight}>{right}</RNText> : null}
    </View>
  );
}

export function SweepHabitCardC(props: SweepHabitCardCProps) {
  const {
    card,
    readEntry,
    readLoading,
    rec,
    appliedChange,
    adaptationsForCard,
    planStart,
    planStartLabel,
    habitPlans,
    onToggleDay,
    onTogglePlanCell,
    onChipPress,
    onDismissRead,
    onRemoveAdaptation,
    onSelectIdea,
    onSelectPause,
    onPressPlanStart,
    onPressAdapt,
  } = props;

  const ds = getDateService();
  const today = ds.today();
  const read = readEntry && !readEntry.dismissed ? readEntry.read : null;
  const showPlanZone = !card.isBreak && card.cadence !== 'daily';
  const isNewHabit = card.trend.bars.length === 0 && card.totalCompletions < 4;
  const sinceLabel = formatSinceLabel(card.trackingSince);

  // ── Plan cells (pause-aware; logic unchanged) ──
  const pauseCovers = (date: string) =>
    adaptationsForCard.some(
      (a) => a.mode === 'pause' && a.period_start <= date && a.period_end >= date,
    );
  const floorCovers = (date: string) =>
    adaptationsForCard.some(
      (a) => a.mode === 'floor' && a.period_start <= date && a.period_end >= date,
    );
  const planEnd = ds.addDays(planStart, 6);
  const localPlanned = [
    ...new Set(
      habitPlans
        .filter(
          (p) => p.habit_id === card.id && p.planned_date >= planStart && p.planned_date <= planEnd,
        )
        .map((p) => p.planned_date),
    ),
  ];
  const planCells = Array.from({ length: 7 }, (_, i) => {
    const date = ds.addDays(planStart, i);
    const js = ds.fromLocalDate(date) ?? ds.now();
    return {
      date,
      dow: DOW[js.getDay()],
      dayNum: js.getDate(),
      isPlanned: localPlanned.includes(date),
      isCommitted: localPlanned.includes(date) || floorCovers(date),
      isPaused: pauseCovers(date),
      isToday: date === today,
    };
  });
  const plannedCount = planCells.filter((c) => c.isCommitted).length;

  const onTarget = card.trend.bars.filter((b) => b.hits >= b.target).length;
  const totalWeeks = card.trend.bars.length;
  const disruption = read?.disruption ?? null;
  const showChips = rec?.show === true && !appliedChange;

  const chipsRow = (
    <View style={styles.chipRow}>
      {rec?.chips.map((n) => (
        <TouchableOpacity
          key={n}
          style={[styles.chip, n === rec.currentTarget && styles.chipOn]}
          onPress={() => onChipPress(n)}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <RNText style={[styles.chipText, n === rec.currentTarget && styles.chipTextOn]}>
            {n === rec.currentTarget ? `Keep ${n}x` : `${n}x`}
          </RNText>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.card}>
      {/* ════ Header slab: break tag, serif name, one-line pills, lifetime line ════ */}
      <View style={styles.header}>
        {card.isBreak && (
          <View style={styles.breakTag}>
            <RNText style={styles.breakTagText}>BREAKING HABIT</RNText>
          </View>
        )}
        <RNText style={styles.name} numberOfLines={2}>
          {card.name}
        </RNText>
        <View style={styles.headerRow}>
          <View style={styles.pills}>
            <View style={styles.pill}>
              <RNText style={styles.pillText}>
                {getFrequencyDisplayLabel(card.cadence, card.targetPerPeriod) ?? card.cadence}
              </RNText>
            </View>
            {card.streak.count > 0 && (
              <View style={[styles.pill, styles.pillGold]}>
                <Flame size={11} strokeWidth={2} color={BRAND.colors.goldenPear} />
                <RNText style={[styles.pillText, styles.pillTextGold]}>
                  {card.streak.count} {card.streak.unit === 'week' ? 'wk' : 'day'}
                  {card.streak.count !== 1 ? 's' : ''}
                  {card.isBreak ? ' clear' : ''}
                </RNText>
              </View>
            )}
          </View>
          <RNText style={styles.lifetime} numberOfLines={1}>
            {card.totalCompletions > 0
              ? `${sinceLabel ? `since ${sinceLabel} · ` : ''}${card.totalCompletions} ${card.isBreak ? 'clear' : 'done'}`
              : sinceLabel
                ? `since ${sinceLabel}`
                : ''}
          </RNText>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.railLine} />

        {/* ════ LAST 6 WEEKS ════ */}
        {totalWeeks > 0 && (
          <>
            <SectionHead
              label={`LAST ${totalWeeks} WEEKS`}
              right={`${onTarget} of ${totalWeeks} on target`}
            />
            <View style={styles.secContent}>
              <View style={styles.trendDots}>
                {card.trend.bars.map((bar) => (
                  <View
                    key={bar.weekLabel}
                    style={[
                      styles.wk,
                      bar.hits >= bar.target ? styles.wkHit : styles.wkMiss,
                      bar.isCurrent && styles.wkCurrent,
                    ]}
                  >
                    {bar.hits >= bar.target ? (
                      <Check size={12} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                    ) : null}
                  </View>
                ))}
              </View>
              {card.isBreak ? (
                <RNText style={styles.statLine}>
                  Longest run <RNText style={styles.statB}>{card.bestStreak} days</RNText>
                </RNText>
              ) : card.bestDayAllTime ? (
                <RNText style={styles.statLine}>
                  Best on <RNText style={styles.statB}>{card.bestDayAllTime}</RNText>
                </RNText>
              ) : null}
            </View>
          </>
        )}

        {/* ════ THIS WEEK ════ */}
        <SectionHead
          label={card.isBreak ? 'THIS WEEK · DAYS CLEAR' : 'THIS WEEK'}
          right={`${card.weekHits} of ${card.weekTarget} ${card.isBreak ? 'clear' : 'done'}`}
          filled
        />
        <View style={styles.secContent}>
          <View style={styles.sqRow}>
            {card.days.map((day) => (
              <TouchableOpacity
                key={day.date}
                style={styles.sq}
                onPress={() => onToggleDay(day.date, day.isCompleted)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: day.isCompleted }}
                accessibilityLabel={`${day.dayLabel} ${day.date}${day.isCompleted ? ' completed' : ''}`}
              >
                <View
                  style={[
                    styles.sqBox,
                    day.isCompleted && styles.sqBoxDone,
                    day.isToday && !day.isCompleted && styles.sqBoxToday,
                    !day.isCompleted && day.isPaused && styles.sqBoxPaused,
                  ]}
                >
                  {day.isCompleted ? (
                    <Check size={13} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                  ) : day.isPaused ? (
                    <Pause size={10} strokeWidth={2} color="rgba(34,34,34,0.32)" />
                  ) : null}
                </View>
                <RNText style={styles.sqLabel}>{day.dayLabel}</RNText>
              </TouchableOpacity>
            ))}
          </View>
          <RNText style={styles.sqHint}>Forgot one? Tap the day to add it.</RNText>
        </View>

        {/* ════ Read slot: shimmer | gold read slab | new-habit note | chips-only ════ */}
        {readLoading && !readEntry ? (
          <View style={styles.shimmer} />
        ) : read?.read_paragraph ? (
          <View style={styles.read}>
            <View style={styles.readHead}>
              <Sparkles size={12} strokeWidth={2} color={GOLD_DEEP} />
              <RNText style={styles.readHeadText}>GREMLY'S READ</RNText>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={onDismissRead}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss read"
              >
                <X size={14} strokeWidth={2} color={BRAND.colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <ReadParagraph
              paragraph={read.read_paragraph}
              boldTerms={
                disruption
                  ? [
                      disruption.label,
                      `${formatShortDate(disruption.start)} to ${formatShortDate(disruption.end)}`,
                    ]
                  : []
              }
            />
            {disruption && (
              <>
                <RNText style={styles.optLead}>Pick a backup:</RNText>
                <View style={styles.optGroup}>
                  {disruption.ideas.map((idea) => (
                    <TouchableOpacity
                      key={idea}
                      style={styles.opt}
                      activeOpacity={0.75}
                      onPress={() =>
                        onSelectIdea?.(idea, disruption.start, disruption.end, disruption.ref)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Choose backup: ${idea}`}
                    >
                      <View style={styles.optRadio} />
                      <RNText style={styles.optText} numberOfLines={2} ellipsizeMode="tail">
                        {idea}
                      </RNText>
                      <RNText style={styles.optSub}>still counts</RNText>
                    </TouchableOpacity>
                  ))}
                  {disruption.offer_pause && (
                    <TouchableOpacity
                      style={styles.opt}
                      activeOpacity={0.75}
                      onPress={() =>
                        onSelectPause?.(disruption.start, disruption.end, disruption.ref)
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Pause for these days"
                    >
                      <View style={styles.optRadio} />
                      <RNText style={styles.optText} numberOfLines={2} ellipsizeMode="tail">
                        Pause {formatShortDate(disruption.start)} to{' '}
                        {formatShortDate(disruption.end)}
                      </RNText>
                      <RNText style={styles.optSub}>no penalty</RNText>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
            {(showChips || appliedChange || read.frequency_line) && (
              <View style={styles.stepup}>
                {appliedChange ? (
                  <View style={styles.appliedRow}>
                    <Check size={13} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                    <RNText style={styles.appliedText}>
                      Updated to {appliedChange.label}, from {appliedChange.from}x
                    </RNText>
                  </View>
                ) : (
                  <View style={styles.stepupRow}>
                    <RNText style={styles.stepupText}>
                      {read.frequency_line ?? rec?.sentence ?? ''}
                    </RNText>
                    {showChips && chipsRow}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : isNewHabit ? (
          <View style={styles.emptyRead}>
            <RNText style={styles.emptyReadText}>
              Your read appears after a few weeks of rhythm. Plan the week below and Gremly watches
              the pattern build.
            </RNText>
          </View>
        ) : showChips || appliedChange ? (
          <View style={styles.barebones}>
            {appliedChange ? (
              <View style={styles.appliedRow}>
                <Check size={13} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                <RNText style={styles.appliedText}>
                  Updated to {appliedChange.label}, from {appliedChange.from}x
                </RNText>
              </View>
            ) : (
              <View style={styles.stepupRow}>
                <RNText style={styles.stepupText}>{rec!.sentence}</RNText>
                {chipsRow}
              </View>
            )}
          </View>
        ) : null}

        {/* ════ NEXT 7 DAYS ════ */}
        {showPlanZone && (
          <>
            <View style={styles.planHead}>
              <View style={styles.gutter}>
                <View style={styles.railDot} />
              </View>
              <RNText style={styles.secLabel}>NEXT 7 DAYS</RNText>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.startPill}
                onPress={onPressPlanStart}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Plan start: ${planStartLabel}`}
              >
                <RNText style={styles.startPillText}>Starts {planStartLabel}</RNText>
                <ChevronDown size={12} strokeWidth={2} color="#1E3D2B" />
              </TouchableOpacity>
            </View>
            <View style={styles.secContent}>
              {adaptationsForCard.map((a) => (
                <View key={a.id} style={styles.adaptPill}>
                  <View style={styles.adaptPillLeft}>
                    {a.mode === 'pause' ? (
                      <Pause size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    ) : (
                      <TrendingDown size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                    )}
                    <RNText style={styles.adaptPillText}>
                      {a.mode === 'pause' ? 'Paused' : 'Floor'} {formatShortDate(a.period_start)} to{' '}
                      {formatShortDate(a.period_end)}
                    </RNText>
                  </View>
                  <TouchableOpacity
                    onPress={() => onRemoveAdaptation(a.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove adaptation"
                  >
                    <RNText style={styles.adaptPillRemove}>Remove</RNText>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.strip}>
                {planCells.map((c) => (
                  <TouchableOpacity
                    key={c.date}
                    style={[
                      styles.pc,
                      c.isCommitted && styles.pcPlanned,
                      c.isToday && !c.isCommitted && styles.pcToday,
                      c.isPaused && styles.pcPaused,
                    ]}
                    onPress={() => onTogglePlanCell(c.date, c.isPlanned, c.isPaused)}
                    activeOpacity={0.75}
                    disabled={c.isPaused}
                    accessibilityRole="button"
                    accessibilityState={{ selected: c.isPlanned, disabled: c.isPaused }}
                    accessibilityLabel={`${c.dow} ${c.dayNum}${c.isPlanned ? ' planned' : ''}${c.isCommitted && !c.isPlanned ? ' floor committed' : ''}${c.isPaused ? ' paused' : ''}`}
                  >
                    <RNText
                      style={[
                        styles.pcDow,
                        c.isCommitted && styles.pcDowOn,
                        c.isPaused && styles.pcMuted,
                      ]}
                    >
                      {c.dow}
                    </RNText>
                    <RNText
                      style={[
                        styles.pcNum,
                        c.isCommitted && styles.pcNumOn,
                        c.isPaused && styles.pcMuted,
                      ]}
                    >
                      {c.dayNum}
                    </RNText>
                    <View style={styles.pcInd}>
                      {c.isCommitted ? (
                        <Check size={10} strokeWidth={2.6} color={CREAM} />
                      ) : c.isPaused ? (
                        <Pause size={9} strokeWidth={2} color="rgba(34,34,34,0.30)" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.planCap}>
                <RNText style={styles.planCapText}>
                  {plannedCount} of {card.targetPerPeriod} planned · or leave it flexible
                </RNText>
                <TouchableOpacity
                  style={styles.adaptLink}
                  onPress={onPressAdapt}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Adapt for travel or a break"
                >
                  <Calendar size={12} strokeWidth={1.8} color={BRAND.colors.mossGreen} />
                  <RNText style={styles.adaptLinkText}>Adapt</RNText>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace to sweep-habit-card-redesign.html, Option C + Option B header/rail
// ─────────────────────────────────────────────────────────────────────────────

const GUTTER_W = 22;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: BRAND.colors.surface,
    overflow: 'hidden',
    ...BRAND.elevation.one,
  },

  // Header slab
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  breakTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(249,246,241,0.16)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 9,
  },
  breakTagText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.4, color: CREAM },
  name: {
    fontFamily: SERIF,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    color: CREAM,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  pills: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 4.5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(249,246,241,0.14)',
  },
  pillGold: { backgroundColor: 'rgba(224,196,122,0.2)' },
  pillText: { fontSize: 11.5, fontWeight: '600', color: CREAM },
  pillTextGold: { color: '#EBD8A4' },
  lifetime: { fontSize: 11.5, color: 'rgba(249,246,241,0.6)', flexShrink: 1 },

  // Body + rail
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 20, position: 'relative' },
  railLine: {
    position: 'absolute',
    left: 18 + 4.5,
    top: 26,
    bottom: 28,
    width: 1.5,
    backgroundColor: 'rgba(201,167,92,0.28)',
  },
  gutter: { width: GUTTER_W, alignItems: 'flex-start', justifyContent: 'center' },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: GOLD_RAIL,
    backgroundColor: BRAND.colors.surface,
  },
  railDotFilled: { backgroundColor: GOLD_RAIL },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  secLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: GOLD_LABEL },
  secRight: { fontSize: 12, fontWeight: '600', color: BRAND.colors.charcoalInk },
  secContent: { marginLeft: GUTTER_W, marginTop: 10 },

  // Last N weeks
  trendDots: { flexDirection: 'row', gap: 7 },
  wk: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wkHit: { backgroundColor: 'rgba(191,216,192,0.5)' },
  wkMiss: { backgroundColor: 'rgba(34,34,34,0.05)' },
  wkCurrent: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1.5,
    borderColor: BRAND.colors.mossGreen,
  },
  statLine: { fontSize: 12.5, lineHeight: 18, color: BRAND.colors.inkMuted, marginTop: 9 },
  statB: { fontSize: 12.5, fontWeight: '700', color: BRAND.colors.charcoalInk },

  // This week
  sqRow: { flexDirection: 'row', gap: 6 },
  sq: { flex: 1, alignItems: 'center', gap: 5 },
  sqBox: {
    width: '100%',
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(34,34,34,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sqBoxDone: { backgroundColor: 'rgba(191,216,192,0.5)' },
  sqBoxToday: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1.5,
    borderColor: BRAND.colors.mossGreen,
  },
  sqBoxPaused: { backgroundColor: 'rgba(34,34,34,0.05)' },
  sqLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(34,34,34,0.38)' },
  sqHint: { fontSize: 11, color: 'rgba(34,34,34,0.38)', marginTop: 7 },

  // Read slab (golden pear, Option C)
  shimmer: {
    marginTop: 16,
    borderRadius: 16,
    height: 96,
    backgroundColor: 'rgba(34,34,34,0.055)',
  },
  read: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: GOLD_TINT,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readHeadText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: GOLD_DEEP },
  readPara: { fontSize: 13, lineHeight: 19, color: '#33301F', marginTop: 8 },
  readParaBold: { fontWeight: '700', color: GOLD_BOLD },
  optLead: { fontSize: 12, fontWeight: '700', color: GOLD_DEEP, marginTop: 10 },
  optGroup: { marginTop: 7, gap: 6 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  optRadio: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: 'rgba(34,34,34,0.25)',
  },
  optText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  optSub: { fontSize: 10.5, color: 'rgba(34,34,34,0.38)' },

  stepup: {
    marginTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,167,92,0.25)',
    paddingTop: 10,
  },
  stepupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  stepupText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, color: '#6B5A2A' },
  chipRow: { flexDirection: 'row', gap: 7 },
  chip: {
    borderRadius: 999,
    paddingVertical: 5.5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.22)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipOn: { backgroundColor: BRAND.colors.mossGreen, borderColor: BRAND.colors.mossGreen },
  chipText: { fontSize: 11.5, fontWeight: '600', color: BRAND.colors.charcoalInk },
  chipTextOn: { color: CREAM },
  appliedRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  appliedText: { fontSize: 12.5, fontWeight: '600', color: BRAND.colors.mossGreen },

  emptyRead: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(34,34,34,0.035)',
    padding: 14,
  },
  emptyReadText: { fontSize: 12.5, lineHeight: 18.5, color: BRAND.colors.inkMuted },
  barebones: { marginTop: 16, borderRadius: 14, backgroundColor: GOLD_TINT, padding: 13 },

  // Next 7 days
  planHead: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  startPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(191,216,192,0.3)',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  startPillText: { fontSize: 12, fontWeight: '600', color: '#1E3D2B' },
  adaptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(191,216,192,0.24)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  adaptPillLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  adaptPillText: { fontSize: 12.5, fontWeight: '600', color: BRAND.colors.charcoalInk },
  adaptPillRemove: { fontSize: 12, fontWeight: '600', color: BRAND.colors.mossGreen },
  strip: { flexDirection: 'row', gap: 5 },
  pc: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(34,34,34,0.04)',
  },
  pcPlanned: { backgroundColor: BRAND.colors.mossGreen },
  pcToday: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1.5,
    borderColor: BRAND.colors.mossGreen,
  },
  pcPaused: { backgroundColor: 'rgba(34,34,34,0.05)' },
  pcDow: { fontSize: 9.5, fontWeight: '600', color: '#3A5A45' },
  pcDowOn: { color: 'rgba(249,246,241,0.7)' },
  pcNum: { fontSize: 13, fontWeight: '600', color: '#1E3D2B' },
  pcNumOn: { color: CREAM },
  pcMuted: { color: 'rgba(34,34,34,0.30)' },
  pcInd: { height: 12, alignItems: 'center', justifyContent: 'center' },
  planCap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  planCapText: { fontSize: 11, color: '#3A5A45' },
  adaptLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adaptLinkText: { fontSize: 12, fontWeight: '500', color: BRAND.colors.mossGreen },
});
