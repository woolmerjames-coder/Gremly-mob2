import { View, Pressable, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
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
  /** Optional extra row rendered inside the dark slab below the dates row.
   *  Used by the Commitment arc to inject the held/slip strip. */
  extraRow?: ReactNode;
}

function computeCountdown(chapter: Chapter): { label: string; urgent: boolean } | null {
  if (chapter.closed_at) return null;
  if (!chapter.end_date) return null;

  // Commitment arc: show "day X of Y" progress instead of countdown to end.
  if (chapter.arc_shape === 'commitment' && chapter.start_date) {
    const startMs = parseLocalYMD(chapter.start_date).getTime();
    const endMs = parseLocalYMD(chapter.end_date).getTime();
    const todayMs = parseLocalYMD(getDateService().today()).getTime();
    const totalDays = Math.round((endMs - startMs) / 86_400_000) + 1;
    const dayOfTotal = Math.min(
      Math.max(1, Math.round((todayMs - startMs) / 86_400_000) + 1),
      totalDays,
    );
    return { label: `day ${dayOfTotal} of ${totalDays}`, urgent: dayOfTotal >= totalDays - 3 };
  }

  const days = differenceInDays(parseLocalYMD(chapter.end_date), getDateService().now());
  if (days < 0) return { label: `${Math.abs(days)} days overdue`, urgent: true };
  if (days === 0) return { label: 'today', urgent: true };
  if (days === 1) return { label: 'in 1 day', urgent: true };
  if (days <= 3) return { label: `in ${days} days`, urgent: true };
  if (days <= 30) return { label: `in ${days} days`, urgent: false };
  if (days <= 60) return { label: `in ${Math.round(days / 7)} weeks`, urgent: false };
  return { label: `in ${Math.round(days / 30)} months`, urgent: false };
}

export function EditableChapterBanner({ chapter, onEdit, extraRow }: EditableChapterBannerProps) {
  const isClosed = !!chapter.closed_at;
  const isCommitment = chapter.arc_shape === 'commitment' && !isClosed;
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
          <View
            style={[
              styles.tag,
              isClosed ? styles.tagClosed : isCommitment ? styles.tagCommitment : styles.tagActive,
            ]}
          >
            <Text
              style={[
                styles.tagText,
                isClosed
                  ? styles.tagTextClosed
                  : isCommitment
                    ? styles.tagTextCommitment
                    : styles.tagTextActive,
              ]}
            >
              {isClosed ? 'CLOSED' : 'ACTIVE'}
            </Text>
          </View>
        </View>
      </View>
      {extraRow != null ? <View style={styles.extraRowWrap}>{extraRow}</View> : null}
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
    color: lightTokens.colors.onInkLabel,
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
  // Commitment arc: periwinkle-tinted tag — chipRelationshipBorder bg, chipRelationshipText fg
  tagCommitment: { backgroundColor: lightTokens.colors.chipRelationshipBorder },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  tagTextActive: { color: lightTokens.colors.mossGreen },
  tagTextClosed: { color: lightTokens.colors.closedTagFg },
  tagTextCommitment: { color: lightTokens.colors.chipRelationshipText },
  extraRowWrap: {
    marginTop: 8,
  },
  editIconWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
    opacity: 0.4,
  },
});
