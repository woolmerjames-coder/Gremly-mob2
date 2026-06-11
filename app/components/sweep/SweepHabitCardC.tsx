/**
 * SweepHabitCardC — Card C per the Phase 0 spec mockup (sweep-card-c-phase0-spec).
 *
 * Presentational card for the weekly sweep habit deck. Periwinkle "Gremly's
 * read" accent. Renders every spec state: offering, loading shimmer, code
 * fallback, dismissed, daily, break habit, new habit, applied frequency
 * change, active adaptations.
 *
 * Phase 4a scope: full layout + existing mechanics wired (day tap-to-fix,
 * plan cell toggles, frequency chips, dismiss, remove adaptation).
 * Phase 4b adds: option tap -> create adaptation, confirmed pill, start-date
 * menu, adapt form entry. Those handlers arrive as props already (no-op
 * permitted) so 4b is wiring only.
 *
 * Mockup is spec: visual decisions trace to the spec file, not to taste.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, Pause, Flame, X, Calendar, ChevronDown, TrendingDown } from 'lucide-react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { getDateService } from '../../../lib/date/DateService';
import type { HabitCardStats } from '../../../lib/habits/habitCardStats';
import type { HabitReadEntry } from '../../../lib/store/useGremlyStore';
import type { HabitAdaptationRow, HabitPlanRow } from '../../../lib/store/useGremlyStore';
import type { FrequencyRecommendation } from '../../../lib/habits/habitFrequencyRecommendation';
import { getFrequencyDisplayLabel } from '../../../lib/habits/habitFrequencyRecommendation';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

// Periwinkle tints (derived from BRAND.colors.periwinkleSmoke #9CA6E0)
const PERI_TINT = 'rgba(156, 166, 224, 0.15)';
const PERI_DEEP = '#4F5AA8';
const PERI_BORDER = 'rgba(79, 90, 168, 0.16)';

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

/** Render the paragraph with the disruption label and date range bolded. */
function ReadParagraph({ paragraph, boldTerms }: { paragraph: string; boldTerms: string[] }) {
  if (boldTerms.length === 0) {
    return <Text style={styles.readPara}>{paragraph}</Text>;
  }
  const pattern = boldTerms
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const parts = paragraph.split(new RegExp(`(${pattern})`, 'i'));
  return (
    <Text style={styles.readPara}>
      {parts.map((part, i) =>
        boldTerms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <Text key={i} style={styles.readParaBold}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
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

  // ── Plan cells (logic mirrors the v7-2 plan strip; pause-aware) ──
  const pauseCovers = (date: string) =>
    adaptationsForCard.some(
      (a) => a.mode === 'pause' && a.period_start <= date && a.period_end >= date,
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
      isPaused: pauseCovers(date),
      isToday: date === today,
    };
  });
  const plannedCount = planCells.filter((c) => c.isPlanned).length;

  // ── On-target weeks for trend + fallback line ──
  const onTarget = card.trend.bars.filter((b) => b.hits >= b.target).length;
  const totalWeeks = card.trend.bars.length;

  // ── Code fallback sentence (always renderable; never imitates the AI voice) ──
  const fallbackLead =
    card.trend.read === 'building'
      ? 'Building.'
      : card.trend.read === 'drifting'
        ? 'Drifting.'
        : 'Steady.';
  const fallbackBody =
    totalWeeks > 0
      ? `On target ${onTarget} of the last ${totalWeeks} weeks.`
      : card.totalCompletions > 0
        ? `${card.totalCompletions} done${sinceLabel ? ` since ${sinceLabel}` : ''}.`
        : '';

  const disruption = read?.disruption ?? null;
  const showChips = rec?.show === true && !appliedChange;

  return (
    <View style={styles.card}>
      {/* ── Header: break tag, serif name, pills ── */}
      {card.isBreak && (
        <View style={styles.breakTag}>
          <Text style={styles.breakTagText}>BREAKING HABIT</Text>
        </View>
      )}
      <Text style={styles.name}>{card.name}</Text>
      <View style={styles.pills}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {getFrequencyDisplayLabel(card.cadence, card.targetPerPeriod) ?? card.cadence}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {card.weekHits} of {card.weekTarget} {card.isBreak ? 'clear ' : ''}this week
          </Text>
        </View>
        {card.streak.count > 0 && (
          <View style={[styles.pill, styles.pillGold]}>
            <Flame size={11} strokeWidth={2} color="#B8923F" />
            <Text style={[styles.pillText, styles.pillTextGold]}>
              {card.streak.count} {card.streak.unit === 'week' ? 'wk' : 'day'}
              {card.streak.count !== 1 ? 's' : ''}
              {card.isBreak ? ' clear' : ' streak'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Heat row: past 7 days ── */}
      <View style={styles.heatHead}>
        <Text style={styles.heatLabel}>{card.isBreak ? 'DAYS CLEAR · PAST 7' : 'PAST 7 DAYS'}</Text>
        <Text style={styles.heatHint}>tap a day to fix it</Text>
      </View>
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
            <Text style={styles.sqLabel}>{day.dayLabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Trend lines ── */}
      {totalWeeks > 0 && (
        <View style={styles.trendRow}>
          <Text style={styles.trendMuted}>last {totalWeeks} weeks</Text>
          <View style={styles.trendDots}>
            {card.trend.bars.map((bar) => (
              <View
                key={bar.weekLabel}
                style={[
                  styles.wdot,
                  bar.hits >= bar.target ? null : styles.wdotMiss,
                  bar.isCurrent && styles.wdotCurrent,
                ]}
              />
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.trendStrong}>
            {onTarget} of {totalWeeks} on target
          </Text>
        </View>
      )}
      <Text style={styles.trendLine2}>
        {card.isBreak ? (
          <>
            Longest run <Text style={styles.trendB}>{card.bestStreak} days</Text>
            {' · clear '}
            <Text style={styles.trendB}>{card.totalCompletions}</Text>
            {sinceLabel ? ` days since ${sinceLabel}` : ' days'}
          </>
        ) : (
          <>
            {card.bestDayAllTime ? (
              <>
                Best on <Text style={styles.trendB}>{card.bestDayAllTime}</Text>
                {' · '}
              </>
            ) : null}
            <Text style={styles.trendB}>{card.totalCompletions}</Text>
            {' done'}
            {sinceLabel ? ` since ${sinceLabel}` : ''}
          </>
        )}
      </Text>

      {/* ── Read region: shimmer | Gremly's read | fallback | new-habit ── */}
      {readLoading && !readEntry ? (
        <View style={styles.shimmer} />
      ) : read?.read_paragraph ? (
        <View style={styles.read}>
          <View style={styles.readHead}>
            <View style={styles.diamond} />
            <Text style={styles.readHeadText}>GREMLY'S READ</Text>
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
              <View style={styles.optGroup}>
                {disruption.ideas.map((idea, i) => (
                  <React.Fragment key={idea}>
                    {i > 0 ? <View style={styles.optDivider} /> : null}
                    <TouchableOpacity
                      style={styles.opt}
                      activeOpacity={0.75}
                      onPress={() =>
                        onSelectIdea?.(idea, disruption.start, disruption.end, disruption.ref)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Choose backup: ${idea}`}
                    >
                      <View style={styles.optRadio} />
                      <Text style={styles.optText} numberOfLines={2} ellipsizeMode="tail">
                        {idea}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
                {disruption.offer_pause && (
                  <>
                    <View style={styles.optDivider} />
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
                      <Text style={styles.optText} numberOfLines={2} ellipsizeMode="tail">
                        Pause {formatShortDate(disruption.start)} to{' '}
                        {formatShortDate(disruption.end)}
                      </Text>
                      <Text style={styles.pauseSub}>no penalty</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <Text style={styles.optCaption}>Any of these still counts toward your week.</Text>
            </>
          )}
          {(showChips || appliedChange || read.frequency_line) && (
            <View style={styles.stepup}>
              {appliedChange ? (
                <View style={styles.appliedRow}>
                  <Check size={13} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
                  <Text style={styles.appliedText}>
                    Updated to {appliedChange.label}, from {appliedChange.from}x
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.stepupText}>
                    {read.frequency_line ?? rec?.sentence ?? ''}
                  </Text>
                  {showChips && (
                    <View style={styles.chipRow}>
                      {rec!.chips.map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.chip, n === rec!.currentTarget && styles.chipOn]}
                          onPress={() => onChipPress(n)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[styles.chipText, n === rec!.currentTarget && styles.chipTextOn]}
                          >
                            {n === rec!.currentTarget ? `Keep ${n}x` : `${n}x`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      ) : isNewHabit ? (
        <View style={styles.emptyRead}>
          <Text style={styles.emptyReadText}>
            Your read appears after a few weeks of rhythm. For now, plan the week below and Gremly
            watches the pattern build.
          </Text>
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>
            <Text style={styles.trendB}>{fallbackLead}</Text> {fallbackBody}
            {showChips ? ` ${rec!.sentence}` : ''}
          </Text>
          {showChips && (
            <View style={styles.chipRow}>
              {rec!.chips.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, n === rec!.currentTarget && styles.chipOn]}
                  onPress={() => onChipPress(n)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, n === rec!.currentTarget && styles.chipTextOn]}>
                    {n === rec!.currentTarget ? `Keep ${n}x` : `${n}x`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {appliedChange && (
            <View style={styles.appliedRow}>
              <Check size={13} strokeWidth={2.6} color={BRAND.colors.mossGreen} />
              <Text style={styles.appliedText}>
                Updated to {appliedChange.label}, from {appliedChange.from}x
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Plan zone ── */}
      {showPlanZone && (
        <View style={styles.plan}>
          <View style={styles.planHead}>
            <Text style={styles.planTitle}>Map your week</Text>
            <TouchableOpacity
              style={styles.startPill}
              onPress={onPressPlanStart}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Plan start: ${planStartLabel}`}
            >
              <Text style={styles.startPillText}>Starts {planStartLabel}</Text>
              <ChevronDown size={13} strokeWidth={2} color="#1E3D2B" />
            </TouchableOpacity>
          </View>

          {adaptationsForCard.map((a) => (
            <View key={a.id} style={styles.adaptPill}>
              <View style={styles.adaptPillLeft}>
                {a.mode === 'pause' ? (
                  <Pause size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                ) : (
                  <TrendingDown size={11} strokeWidth={2} color={BRAND.colors.charcoalInk} />
                )}
                <Text style={styles.adaptPillText}>
                  {a.mode === 'pause' ? 'Paused' : 'Floor'} {formatShortDate(a.period_start)} to{' '}
                  {formatShortDate(a.period_end)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onRemoveAdaptation(a.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Remove adaptation"
              >
                <Text style={styles.adaptPillRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.strip}>
            {planCells.map((c) => (
              <TouchableOpacity
                key={c.date}
                style={[
                  styles.pc,
                  c.isPlanned && styles.pcPlanned,
                  c.isToday && !c.isPlanned && styles.pcToday,
                  c.isPaused && styles.pcPaused,
                ]}
                onPress={() => onTogglePlanCell(c.date, c.isPlanned, c.isPaused)}
                activeOpacity={0.75}
                disabled={c.isPaused}
                accessibilityRole="button"
                accessibilityState={{ selected: c.isPlanned, disabled: c.isPaused }}
                accessibilityLabel={`${c.dow} ${c.dayNum}${c.isPlanned ? ' planned' : ''}${c.isPaused ? ' paused' : ''}`}
              >
                <Text
                  style={[
                    styles.pcDow,
                    c.isPlanned && styles.pcDowOn,
                    c.isPaused && styles.pcMuted,
                  ]}
                >
                  {c.dow}
                </Text>
                <Text
                  style={[
                    styles.pcNum,
                    c.isPlanned && styles.pcNumOn,
                    c.isPaused && styles.pcMuted,
                  ]}
                >
                  {c.dayNum}
                </Text>
                <View style={styles.pcInd}>
                  {c.isPlanned ? (
                    <Check size={10} strokeWidth={2.6} color={BRAND.colors.linenCream} />
                  ) : c.isPaused ? (
                    <Pause size={9} strokeWidth={2} color="rgba(34,34,34,0.30)" />
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.planCap}>
            <Text style={styles.planCapText}>
              {plannedCount} of {card.targetPerPeriod} planned · or leave it flexible
            </Text>
            <TouchableOpacity
              style={styles.adaptLink}
              onPress={onPressAdapt}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Adapt for travel or a break"
            >
              <Calendar size={12} strokeWidth={1.8} color={BRAND.colors.mossGreen} />
              <Text style={styles.adaptLinkText}>Adapt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — values trace to sweep-card-c-phase0-spec.html
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: BRAND.colors.surface,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 22,
    ...BRAND.elevation.one,
  },
  breakTag: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND.colors.periwinkleSmoke,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 9,
  },
  breakTagText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.4, color: '#FFFFFF' },
  name: {
    fontFamily: SERIF,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    color: '#1E3D2B',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 5.5,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(191,216,192,0.28)',
  },
  pillGold: { backgroundColor: 'rgba(224,196,122,0.16)' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#1E3D2B' },
  pillTextGold: { color: '#8A6A28' },

  heatHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 21,
    marginBottom: 10,
  },
  heatLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: 'rgba(34,34,34,0.38)' },
  heatHint: { fontSize: 11.5, color: 'rgba(34,34,34,0.38)' },
  sqRow: { flexDirection: 'row', gap: 6 },
  sq: { flex: 1, alignItems: 'center', gap: 5 },
  sqBox: {
    width: '100%',
    height: 40,
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

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  trendMuted: { fontSize: 12, color: BRAND.colors.inkMuted },
  trendDots: { flexDirection: 'row', gap: 5 },
  wdot: { width: 10, height: 10, borderRadius: 99, backgroundColor: BRAND.colors.sageMist },
  wdotMiss: { backgroundColor: 'rgba(34,34,34,0.10)' },
  wdotCurrent: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
  },
  trendStrong: { fontSize: 12, fontWeight: '600', color: BRAND.colors.charcoalInk },
  trendLine2: { fontSize: 12, lineHeight: 18, color: BRAND.colors.inkMuted, marginTop: 7 },
  trendB: { fontWeight: '600', color: BRAND.colors.charcoalInk },

  shimmer: { marginTop: 19, borderRadius: 18, height: 96, backgroundColor: 'rgba(34,34,34,0.055)' },

  read: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: PERI_TINT,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  diamond: {
    width: 9,
    height: 9,
    backgroundColor: BRAND.colors.periwinkleSmoke,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  readHeadText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: PERI_DEEP },
  readPara: { fontSize: 12, lineHeight: 17, color: '#2B2B2B', marginTop: 7 },
  readParaBold: { color: '#39418A' },

  optGroup: {
    marginTop: 9,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.86)',
    overflow: 'hidden',
  },
  optDivider: { height: 1, backgroundColor: 'rgba(34,34,34,0.1)' },
  opt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optRadio: {
    width: 14,
    height: 14,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: 'rgba(34,34,34,0.25)',
    marginTop: 2,
  },
  optText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  pauseSub: { fontSize: 11, color: 'rgba(34,34,34,0.38)' },
  optCaption: { marginTop: 5, fontSize: 10.5, color: 'rgba(34,34,34,0.42)' },

  stepup: {
    marginTop: 9,
    gap: 3,
  },
  stepupText: { fontSize: 13, lineHeight: 18, color: '#4A4F7E' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 5.5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.22)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  chipOn: { backgroundColor: BRAND.colors.mossGreen, borderColor: BRAND.colors.mossGreen },
  chipText: { fontSize: 11.5, fontWeight: '600', color: BRAND.colors.charcoalInk },
  chipTextOn: { color: BRAND.colors.linenCream },
  appliedRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  appliedText: { fontSize: 12.5, fontWeight: '600', color: BRAND.colors.mossGreen },

  emptyRead: {
    marginTop: 19,
    borderRadius: 14,
    backgroundColor: 'rgba(34,34,34,0.035)',
    padding: 14,
  },
  emptyReadText: { fontSize: 12.5, lineHeight: 18.5, color: BRAND.colors.inkMuted },
  fallback: {
    marginTop: 19,
    borderRadius: 14,
    backgroundColor: 'rgba(191,216,192,0.28)',
    padding: 14,
  },
  fallbackText: { fontSize: 13, lineHeight: 19.5, color: '#26442F', marginBottom: 0 },

  plan: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(191,216,192,0.28)',
    padding: 14,
    paddingTop: 16,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  planTitle: { fontSize: 14.5, fontWeight: '700', color: '#1E3D2B' },
  startPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND.colors.surface,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  startPillText: { fontSize: 12.5, fontWeight: '600', color: '#1E3D2B' },
  adaptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 11,
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
    backgroundColor: 'rgba(255,255,255,0.66)',
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
  pcNumOn: { color: BRAND.colors.linenCream },
  pcMuted: { color: 'rgba(34,34,34,0.30)' },
  pcInd: { height: 12, alignItems: 'center', justifyContent: 'center' },
  planCap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  planCapText: { fontSize: 11, color: '#3A5A45' },
  adaptLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adaptLinkText: { fontSize: 12, fontWeight: '500', color: BRAND.colors.mossGreen },
});
