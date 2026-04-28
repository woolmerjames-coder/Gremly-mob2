import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useChapterTimelineItems } from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterTimelineSectionProps {
  chapter: Chapter;
}

export function ChapterTimelineSection({ chapter }: ChapterTimelineSectionProps) {
  const items = useChapterTimelineItems(chapter);

  if (items.length === 0) return null;

  const { experienceAccent, experienceAccentSoft, experienceAccentDeep, warmGrey, linenCream } =
    lightTokens.colors;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: experienceAccentDeep }]}>THE TRIP</Text>
      <View style={styles.track}>
        {/* Vertical connecting line */}
        <View style={[styles.verticalLine, { backgroundColor: experienceAccentSoft }]} />
        {items.map((item) => {
          const isPast = item.tense === 'past';
          const isNow = item.tense === 'now';
          const isFuture = item.tense === 'future';

          return (
            <View key={item.id} style={styles.row}>
              {/* Dot */}
              <View
                style={[
                  styles.dot,
                  isFuture
                    ? {
                        backgroundColor: linenCream,
                        borderWidth: 2,
                        borderColor: experienceAccentSoft,
                      }
                    : {
                        backgroundColor: experienceAccent,
                        borderWidth: 2,
                        borderColor: linenCream,
                      },
                ]}
              />
              {/* Content */}
              <View style={styles.content}>
                <View style={styles.dateLabelRow}>
                  <Text
                    style={[
                      styles.dateLabel,
                      isFuture ? { color: warmGrey } : { color: experienceAccentDeep },
                    ]}
                  >
                    {item.dateLabel}
                  </Text>
                  {isNow && (
                    <Text style={[styles.hereHint, { color: warmGrey }]}>← you are here</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.itemText,
                    isFuture && { color: warmGrey },
                    item.isMarker && styles.markerText,
                  ]}
                >
                  {item.text}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
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
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  track: {
    position: 'relative',
    paddingLeft: 20,
  },
  verticalLine: {
    position: 'absolute',
    left: 5,
    top: 6,
    bottom: 6,
    width: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    marginLeft: -20,
    marginRight: 10,
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  dateLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  hereHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    fontStyle: 'italic',
  },
  itemText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: lightTokens.colors.worldsInk,
  },
  markerText: {
    fontStyle: 'italic',
    color: lightTokens.colors.warmGrey,
  },
});
