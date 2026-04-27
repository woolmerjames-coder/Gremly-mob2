import { View, Pressable, StyleSheet } from 'react-native';
import { format, differenceInDays } from 'date-fns';
import { Edit3 } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { getDateService } from '../../lib/date/DateService';
import type { Chapter } from '../../lib/supabase/types';

/** Parse a YYYY-MM-DD string as a local-timezone Date.
 *  `new Date('2026-05-13')` is UTC midnight which renders as May 12 in
 *  Western timezones. Forcing noon dodges all DST and timezone edge cases.
 */
function parseLocalYMD(ymd: string): Date {
  return new Date(ymd + 'T12:00:00');
}

interface EditableChapterBannerProps {
  chapter: Chapter;
  onEdit: () => void;
}

export function EditableChapterBanner({ chapter, onEdit }: EditableChapterBannerProps) {
  const isClosed = !!chapter.closed_at;
  const isUserEditedEnd = chapter.end_date_source === 'user';
  const isUserEditedStart = chapter.start_date_source === 'user';
  const startLabel = chapter.start_date ? format(parseLocalYMD(chapter.start_date), 'MMM d') : null;
  const endLabel = chapter.end_date ? format(parseLocalYMD(chapter.end_date), 'MMM d') : null;
  const countdown = computeCountdown(chapter);

  return (
    <Pressable onPress={onEdit} style={styles.container} testID="chapter-banner-pressable">
      <View style={styles.editIconWrap}>
        <Edit3 size={14} color={lightTokens.colors.worldsInk} />
      </View>

      {startLabel ? (
        <Text style={[styles.startline, isUserEditedStart && styles.userEdited]}>
          Started {startLabel}
        </Text>
      ) : null}

      <View style={styles.endBlock}>
        <Text style={styles.endPrefix}>{isClosed ? 'Ended  ' : 'Ends  '}</Text>
        {endLabel ? (
          <Text style={[styles.endDate, isUserEditedEnd && styles.userEditedDate]}>{endLabel}</Text>
        ) : (
          <Text style={[styles.endDate, { opacity: 0.35 }]}>—</Text>
        )}
      </View>

      <View style={styles.footer}>
        {countdown && !isClosed ? (
          <Text style={[styles.countdown, countdown.urgent && styles.countdownUrgent]}>
            {countdown.label}
          </Text>
        ) : (
          <View />
        )}
        <View style={[styles.tag, isClosed ? styles.tagClosed : styles.tagActive]}>
          <Text style={[styles.tagText, isClosed ? styles.tagTextClosed : styles.tagTextActive]}>
            {isClosed ? 'CLOSED' : 'ACTIVE'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
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

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    backgroundColor: lightTokens.colors.worldsCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    position: 'relative',
  },
  editIconWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    opacity: 0.5,
  },
  startline: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
    marginBottom: 2,
  },
  endBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  endPrefix: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
  },
  endDate: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 26,
    lineHeight: 30,
    color: lightTokens.colors.worldsInk,
  },
  userEditedDate: {
    color: lightTokens.colors.epigraphBorder,
  },
  userEdited: {
    color: lightTokens.colors.epigraphBorder,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countdown: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
  },
  countdownUrgent: {
    color: lightTokens.colors.epigraphBorder,
    fontWeight: '500',
  },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
  },
  tagActive: {
    backgroundColor: lightTokens.colors.mossLight,
  },
  tagClosed: {
    backgroundColor: lightTokens.colors.closedTagBg,
  },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tagTextActive: {
    color: lightTokens.colors.mossGreen,
  },
  tagTextClosed: {
    color: lightTokens.colors.closedTagFg,
  },
});
