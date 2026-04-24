// components/worlds/layouts/UnfoldingProgress.tsx
// Arc-shape-aware progress rendering for the UNFOLDING card in ProjectUnfoldingSection.
// Dispatches on chapter.arc_shape and renders a progress representation appropriate
// for that arc's semantic.

import { View, StyleSheet } from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { getDateService } from '../../../lib/date';
import { useHeldDaysForChapter, useSlipEventsForChapter } from '../../../lib/store/worldsSelectors';
import type { Chapter } from '../../../lib/supabase/types';

interface UnfoldingProgressProps {
  chapter: Chapter;
}

export function UnfoldingProgress({ chapter }: UnfoldingProgressProps) {
  switch (chapter.arc_shape) {
    case 'outcome':
      return <OutcomeProgress chapter={chapter} />;
    case 'experience':
      return <ExperienceProgress chapter={chapter} />;
    case 'process':
      return <ProcessProgress chapter={chapter} />;
    case 'commitment':
      return <CommitmentProgress chapter={chapter} />;
    default:
      // null or unknown arc_shape falls through to outcome rendering
      return <OutcomeProgress chapter={chapter} />;
  }
}

// ─── Outcome ─────────────────────────────────────────────────────────────────
// Phase bar + "phase N of M · day D" label

function OutcomeProgress({ chapter }: { chapter: Chapter }) {
  const phaseIndex = chapter.phase_labels?.indexOf(chapter.current_phase_key ?? '') ?? -1;
  const phaseTotal = chapter.phase_labels?.length ?? 0;
  const days = chapter.start_date
    ? differenceInCalendarDays(getDateService().now(), new Date(chapter.start_date)) + 1
    : null;

  const percent = (() => {
    if (phaseTotal === 0) return 0;
    if (phaseTotal === 1) return 100;
    if (phaseIndex < 0) return 0;
    return (phaseIndex / (phaseTotal - 1)) * 100;
  })();

  const labelParts: string[] = [];
  if (phaseIndex >= 0 && phaseTotal > 0) {
    labelParts.push(`phase ${phaseIndex + 1} of ${phaseTotal}`);
  }
  if (days && days > 0) {
    labelParts.push(`day ${days}`);
  }
  const label = labelParts.join(' \u00B7 ');

  return (
    <View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

// ─── Experience ───────────────────────────────────────────────────────────────
// Date-based progress bar (days elapsed / total days). Label: "day D of T".
// If end_date is null, shows day counter only with no bar.

function ExperienceProgress({ chapter }: { chapter: Chapter }) {
  if (!chapter.start_date) return null;

  const now = getDateService().now();
  const days = Math.max(1, differenceInCalendarDays(now, new Date(chapter.start_date)) + 1);

  if (!chapter.end_date) {
    return <Text style={styles.label}>day {days}</Text>;
  }

  const totalDays = Math.max(
    1,
    differenceInCalendarDays(new Date(chapter.end_date), new Date(chapter.start_date)),
  );
  const percent = Math.min(100, (days / totalDays) * 100);

  return (
    <View>
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFill,
            {
              width: `${percent}%`,
              backgroundColor: lightTokens.colors.experienceAccent,
            },
          ]}
        />
      </View>
      <Text style={styles.label}>
        day {days} of {totalDays}
      </Text>
    </View>
  );
}

// ─── Process ──────────────────────────────────────────────────────────────────
// No bar. No label. The phase line above the progress component already shows
// the phase key (the only meaningful indicator for an ongoing rhythm).

function ProcessProgress(_: { chapter: Chapter }) {
  return null;
}

// ─── Commitment ───────────────────────────────────────────────────────────────
// Held-vs-slip strip: full-width green bar + orange tick marks at slip dates.
// Label: "X held · Y slips".

function CommitmentProgress({ chapter }: { chapter: Chapter }) {
  const { heldDays, slipDays, totalDays } = useHeldDaysForChapter(chapter.id);
  const slipEvents = useSlipEventsForChapter(chapter.id);

  if (totalDays === 0) {
    return <Text style={styles.label}>not yet started</Text>;
  }

  // Compute slip marker positions as percentages along the bar
  const startMs = chapter.start_date ? new Date(chapter.start_date).getTime() : null;
  const endMs = chapter.end_date ? new Date(chapter.end_date).getTime() : null;
  const durationMs = startMs != null && endMs != null ? endMs - startMs : null;

  const markers =
    startMs != null && durationMs != null && durationMs > 0
      ? slipEvents.map((s) => {
          const slipMs = new Date(s.date).getTime();
          const pct = ((slipMs - startMs) / durationMs) * 100;
          return Math.max(0, Math.min(100, pct));
        })
      : [];

  return (
    <View>
      <View style={styles.commitmentBarBg}>
        {/* Full-width held fill — slip markers appear on top */}
        <View
          style={[
            styles.commitmentBarFill,
            { backgroundColor: lightTokens.colors.commitmentHeldFill },
          ]}
        />
        {markers.map((pct, i) => (
          <View
            key={i}
            style={[
              styles.slipMarker,
              {
                left: `${pct}%` as unknown as number,
                backgroundColor: lightTokens.colors.commitmentSlipMarker,
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>
        {heldDays} held \u00B7 {slipDays} {slipDays === 1 ? 'slip' : 'slips'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  barBg: {
    height: 3,
    backgroundColor: lightTokens.colors.outcomeAccentSoft,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    backgroundColor: lightTokens.colors.velocityDotGrowing,
    borderRadius: 2,
  },
  commitmentBarBg: {
    position: 'relative',
    height: 3,
    backgroundColor: lightTokens.colors.chapterBannerDivider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  commitmentBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  slipMarker: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 5,
    borderRadius: 1,
  },
  label: {
    marginTop: 6,
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    fontFamily: 'Inter-Regular',
  },
});
