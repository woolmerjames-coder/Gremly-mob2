// components/worlds/sections/PulseSection.tsx
//
// PULSE section — 18-week SVG bar chart of drops-per-week with chapter date
// ranges shown as tinted bands underneath the bars.
//
// Per family_world_revised.html lines 117-145 (B.3c-phase2a).
// Returns null silently when world has zero drops in the visible window.

import { View, StyleSheet } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useWorldPulse } from '../../../lib/store/worldsSelectors';

interface PulseSectionProps {
  worldId: string;
  numWeeks?: number;
}

// SVG geometry constants
const VIEWBOX_W = 320;
const VIEWBOX_H = 68; // was 56 — adds 12 for label row
const BAR_AREA_TOP = 4;
const BAR_AREA_BOTTOM = 40; // baseline for bars
const BAR_AREA_H = BAR_AREA_BOTTOM - BAR_AREA_TOP; // 36
const BAND_TOP = 42;
const BAND_H = 8;
const LABEL_Y = 60; // baseline for labels (font size 9, sits below band)

const MAX_LABEL_CHARS = 18;

function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_CHARS) return label;
  return label.slice(0, MAX_LABEL_CHARS - 1).trimEnd() + '…';
}

export function PulseSection({ worldId, numWeeks = 18 }: PulseSectionProps) {
  const pulse = useWorldPulse(worldId, numWeeks);

  // Empty state — never been a drop in this world over the last N weeks
  if (pulse.totalDrops === 0) return null;

  // Geometry
  const slotWidth = VIEWBOX_W / pulse.numWeeks; // ~17.78 for 18
  const barWidth = slotWidth * 0.78; // ~13.86
  const barOffset = (slotWidth - barWidth) / 2; // center bar in slot
  const maxCount = Math.max(...pulse.weeks.map((w) => w.dropCount), 1);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        PULSE {'\u00B7'} {pulse.numWeeks} WEEKS
      </Text>
      <Svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} preserveAspectRatio="none" style={styles.svg}>
        {/* Chapter bands underneath the bars */}
        <G>
          {pulse.chapterBands.map((band) => {
            const x = band.startWeekIndex * slotWidth;
            const w = (band.endWeekIndex - band.startWeekIndex + 1) * slotWidth;
            return (
              <Rect
                key={band.id}
                x={x}
                y={BAND_TOP}
                width={w}
                height={BAND_H}
                rx={1}
                fill={lightTokens.colors.epigraphBorder}
                fillOpacity={band.isClosed ? 0.35 : 0.6}
              />
            );
          })}
        </G>

        {/* Weekly bars */}
        <G>
          {pulse.weeks.map((week, i) => {
            // Zero-drop weeks render no bar — honest rhythm
            if (week.dropCount === 0) return null;
            const heightPx = (week.dropCount / maxCount) * BAR_AREA_H;
            const y = BAR_AREA_BOTTOM - heightPx;
            const x = i * slotWidth + barOffset;
            return (
              <Rect
                key={week.weekStart}
                x={x}
                y={y}
                width={barWidth}
                height={heightPx}
                rx={1}
                fill={lightTokens.colors.mossGreen}
              />
            );
          })}
        </G>

        {/* Chapter band labels under the bands */}
        <G>
          {pulse.chapterBands.map((band) => {
            const x = band.startWeekIndex * slotWidth;
            return (
              <SvgText
                key={`label-${band.id}`}
                x={x}
                y={LABEL_Y}
                fontFamily="Inter-Regular"
                fontSize="9"
                fill={lightTokens.colors.warmGrey}
                textAnchor="start"
              >
                {truncateLabel(band.label)}
              </SvgText>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  svg: {
    width: '100%',
    height: 72, // was 60 — proportional to new viewBox
  },
});
