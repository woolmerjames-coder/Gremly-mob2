import { View, Pressable, StyleSheet } from 'react-native';
import { format, differenceInDays } from 'date-fns';
import { Edit2 } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { getDateService } from '../../lib/date/DateService';
import { parseLocalYMD } from '../../lib/utils/dates';
import type { Chapter } from '../../lib/supabase/types';
// Note: banner bg is worldsInk (dark surface); all text colors are inverted

interface EditableChapterBannerProps {
  chapter: Chapter;
  onEdit: () => void;
}

function computeCountdown(chapter: Chapter): { label: string; urgent: boolean } | null {
  if (chapter.closed_at) return null;
  if (!chapter.end_date) return null;
  const days = differenceInDays(parseLocalYMD(chapter.end_date), getDateService().now());
  if (days < 0) return { label: `${Math.abs(days)} days overdue`, urgent: true };
  if (days === 0) return { label: 'today', urgent: true };
  if (days === 1) return { label: 'in 1 day', urgent: true };
  if (days <= 3) return { label: `in ${days} days`, urgent: true };
  if (days <= 30) return { label: `in ${days} days`, urgent: false };
  if (days <= 60) return { label: `in ${Math.round(days / 7)} weeks`, urgent: false };
  return { label: `in ${Math.round(days / 30)} months`, urgent: false };
}

export function EditableChapterBanner({ chapter, onEdit }: EditableChapterBannerProps) {
  const isClosed = !!chapter.closed_at;
  const isUserEdited = chapter.end_date_source === 'user' || chapter.start_date_source === 'user';
  const startLabel = chapter.start_date
    ? format(parseLocalYMD(chapter.start_date), 'MMM d').toUpperCase()
    : null;
  const endLabel = chapter.end_date
    ? format(parseLocalYMD(chapter.end_date), 'MMM d').toUpperCase()
    : null;
  const countdown = computeCountdown(chapter);

  return (
    <Pressable onPress={onEdit} style={styles.container} testID="chapter-banner-pressable">
      <View style={styles.row}>
        <Text style={[styles.dates, isUserEdited && styles.datesEdited]}>
          {startLabel}
          {startLabel && endLabel ? ' \u2192 ' : ''}
          {endLabel || (isClosed ? 'CLOSED' : 'ONGOING')}
        </Text>
        <View style={styles.right}>
          {countdown ? (
            <Text style={[styles.countdown, countdown.urgent && styles.countdownUrgent]}>
              {countdown.label}
            </Text>
          ) : null}
          <View style={[styles.tag, isClosed ? styles.tagClosed : styles.tagActive]}>
            <Text style={[styles.tagText, isClosed ? styles.tagTextClosed : styles.tagTextActive]}>
              {isClosed ? 'CLOSED' : 'ACTIVE'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.editIconWrap} pointerEvents="none">
        <Edit2 size={12} color={lightTokens.colors.linenCream} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: lightTokens.colors.worldsInk,
    borderRadius: 8,
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  dates: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.2,
    color: lightTokens.colors.linenCream,
    flexShrink: 1,
  },
  // User-edited cue: italic (no new token — date text stays linenCream on dark bg)
  datesEdited: {
    fontStyle: 'italic',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  countdown: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.worldsInkSoft,
  },
  // Urgent: fully-bright linenCream on dark surface signals time pressure
  countdownUrgent: {
    color: lightTokens.colors.linenCream,
    fontWeight: '500',
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagActive: { backgroundColor: lightTokens.colors.mossLight },
  tagClosed: { backgroundColor: lightTokens.colors.closedTagBg },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  tagTextActive: { color: lightTokens.colors.mossGreen },
  tagTextClosed: { color: lightTokens.colors.closedTagFg },
  editIconWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
    opacity: 0.4,
  },
});
