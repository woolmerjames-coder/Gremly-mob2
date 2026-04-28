import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useChapterItemCount } from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';

// Arc accent is intentionally hardcoded to mossGreen here.
// Process / Experience / Commitment spines use different primitives (heatmap,
// held-strip) so there is no shared abstraction to generalise to yet.
const DONE_COLOR = lightTokens.colors.mossGreen;
const INACTIVE_COLOR = lightTokens.colors.oatDeeper;
const NOW_FILL_PCT = '60%';

interface ChapterPhaseSpineSectionProps {
  chapter: Chapter;
}

export function ChapterPhaseSpineSection({ chapter }: ChapterPhaseSpineSectionProps) {
  const { phase_labels, current_phase_key, id } = chapter;
  const itemCount = useChapterItemCount(id);

  // Guard: need at least 2 phases to show a spine
  if (!phase_labels || phase_labels.length < 2) return null;

  const nowIndex = current_phase_key ? phase_labels.indexOf(current_phase_key) : -1;

  return (
    <View style={styles.container}>
      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={styles.sectionLabel}>PHASE</Text>
        <Text style={styles.itemCount}> · {itemCount} items</Text>
      </View>

      {/* Spine bar row */}
      <View style={styles.spineRow}>
        {phase_labels.map((phase, idx) => {
          const isDone = nowIndex >= 0 && idx < nowIndex;
          const isNow = idx === nowIndex;
          // future: idx > nowIndex OR nowIndex === -1

          if (isNow) {
            return (
              <View key={idx} style={[styles.segment, { backgroundColor: INACTIVE_COLOR }]}>
                <View style={styles.nowFill} />
              </View>
            );
          }

          return (
            <View
              key={idx}
              style={[styles.segment, { backgroundColor: isDone ? DONE_COLOR : INACTIVE_COLOR }]}
            />
          );
        })}
      </View>

      {/* Labels row */}
      <View style={styles.labelsRow}>
        {phase_labels.map((phase, idx) => {
          const isDone = nowIndex >= 0 && idx < nowIndex;
          const isNow = idx === nowIndex;

          return (
            <Text
              key={idx}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.phaseLabel,
                isDone && styles.phaseLabelDone,
                isNow && styles.phaseLabelNow,
                !isDone && !isNow && styles.phaseLabelFuture,
              ]}
            >
              {phase}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
  },
  itemCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    fontWeight: '400',
    color: lightTokens.colors.warmGrey,
    marginLeft: 4,
  },
  spineRow: {
    flexDirection: 'row',
    gap: 4,
    height: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  nowFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: NOW_FILL_PCT,
    backgroundColor: DONE_COLOR,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  labelsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  phaseLabel: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    textAlign: 'center',
    // default: future color
  },
  phaseLabelDone: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: lightTokens.colors.warmGrey,
  },
  phaseLabelNow: {
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  phaseLabelFuture: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: lightTokens.colors.warmGrey,
    opacity: 0.5,
  },
});
