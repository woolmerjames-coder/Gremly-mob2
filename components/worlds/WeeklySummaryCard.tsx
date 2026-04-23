import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWeeklySummaryCardState } from '../../lib/store/worldsSelectors';
import { getDateService } from '../../lib/date';

interface WeeklySummaryCardProps {
  onPressNew?: () => void;
  onPressHistory?: () => void;
}

export function WeeklySummaryCard({ onPressNew }: WeeklySummaryCardProps) {
  const state = useWeeklySummaryCardState();

  if (state.kind === 'new_unread') {
    const summary = state.summary;
    const weekday = summary?.generated_at
      ? format(new Date(summary.generated_at), 'EEE').toUpperCase()
      : '';
    const range = summary?.week_start_date ? formatWeekRange(summary.week_start_date) : '';
    return (
      <Pressable onPress={onPressNew} style={styles.cardNew}>
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW{weekday ? ` · ${weekday}` : ''}</Text>
        </View>
        <Text style={styles.lblOnDark}>THIS WEEK{range ? ` · ${range}` : ''}</Text>
        <Text style={styles.headOnDark}>{summary?.title ?? 'Your weekly summary is ready.'}</Text>
        {summary?.excerpt ? <Text style={styles.bodyOnDark}>{summary.excerpt}</Text> : null}
        <Text style={styles.ctaOnDark}>Open your weekly summary -&gt;</Text>
      </Pressable>
    );
  }

  if (state.kind === 'read_or_in_progress') {
    const rangeText = formatCurrentWeekRange();
    return (
      <View style={styles.cardSoft}>
        <Text style={styles.lblSoft}>THIS WEEK{rangeText ? ` · ${rangeText}` : ''}</Text>
        <Text style={styles.headSoft}>{state.headline}</Text>
      </View>
    );
  }

  // never
  return (
    <View style={styles.cardSoft}>
      <Text style={styles.headSoft}>Your first weekly summary lands Monday.</Text>
      <Text style={styles.bodySoft}>Gremly is building your patterns from now.</Text>
    </View>
  );
}

// Helpers: local, do not export.
function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${format(start, 'MMM d')}-${format(end, 'd')}`;
}

function formatCurrentWeekRange(): string {
  const now = getDateService().now();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(start.getDate() - (day - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${format(start, 'MMM d')}-${format(end, 'd')}`;
}

const styles = StyleSheet.create({
  cardNew: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 17,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: lightTokens.colors.deepForest,
    borderWidth: 2,
    borderColor: 'rgba(193,152,88,0.45)',
    shadowColor: '#C19858',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
    position: 'relative',
  },
  newBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: lightTokens.colors.ambergold,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  newBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    color: lightTokens.colors.linenCream,
  },
  lblOnDark: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: 'rgba(244,237,215,0.65)',
  },
  headOnDark: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: lightTokens.colors.linenCream,
    marginTop: 6,
  },
  bodyOnDark: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(244,237,215,0.82)',
    marginTop: 5,
  },
  ctaOnDark: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(244,237,215,0.88)',
    marginTop: 10,
  },
  cardSoft: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 17,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.08)',
  },
  lblSoft: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
  },
  headSoft: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: lightTokens.colors.deepForest,
    marginTop: 6,
  },
  bodySoft: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: lightTokens.colors.warmGrey,
    marginTop: 4,
  },
});
