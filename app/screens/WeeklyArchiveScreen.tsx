import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { usePastSummaries } from '../../lib/store/selectors';
import type { WeeklySummary } from '../../lib/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export default function WeeklyArchiveScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const summaries = usePastSummaries();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerWrap}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={lightTokens.colors.worldsInk} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerTextRow}>
          <Text style={styles.title}>Past summaries</Text>
        </View>
      </View>

      {summaries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <CalendarDays size={22} color={lightTokens.colors.warmGrey} strokeWidth={1.8} />
          <Text style={styles.emptyTitle}>No weekly summaries yet</Text>
          <Text style={styles.emptyHint}>
            Your first summary will appear here on Sunday evening.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.listCard}>
            {summaries.map((summary, idx) => {
              const preview = getSummaryPreview(summary);
              const isLast = idx === summaries.length - 1;

              return (
                <TouchableOpacity
                  key={summary.id}
                  activeOpacity={0.6}
                  style={[styles.row, !isLast && styles.rowBorder]}
                  onPress={() =>
                    navigation.navigate('WeeklySummary', {
                      weekStartDate: summary.week_start_date,
                    })
                  }
                >
                  <View style={styles.rowMain}>
                    <View style={styles.dateLine}>
                      <Text style={styles.dateText}>
                        {formatCompactRange(summary.week_start_date, summary.week_end_date)}
                      </Text>
                      {!summary.viewed ? (
                        <View style={styles.newPill}>
                          <Text style={styles.newLabel}>NEW</Text>
                        </View>
                      ) : null}
                    </View>

                    {preview ? (
                      <Text style={styles.preview} numberOfLines={1} ellipsizeMode="tail">
                        {preview}
                      </Text>
                    ) : null}
                  </View>

                  <ChevronRight
                    size={17}
                    color="#C8C6BD"
                    strokeWidth={2}
                    style={styles.rowChevron}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatCompactRange(startDate: string, endDate: string): string {
  try {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    const sameMonth = sy === ey && sm === em;
    if (sameMonth) {
      return `${format(start, 'MMM d')} - ${format(end, 'd')}`;
    }

    return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
  } catch {
    return `${startDate} - ${endDate}`;
  }
}

function getSummaryPreview(summary: WeeklySummary): string | null {
  const cards = (summary.content as any)?.cards;
  if (!Array.isArray(cards)) return null;

  const hero = cards.find(
    (c) => c?.shape === 'hero' && typeof c?.headline === 'string' && c.headline.trim(),
  );
  const headline =
    hero?.headline ??
    cards.find((c) => typeof c?.headline === 'string' && c.headline.trim())?.headline;

  return headline?.trim() || null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.worldsSurface,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  headerTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 21,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(44, 74, 56, 0.10)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(44, 74, 56, 0.06)',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dateText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#1B1B19',
  },
  newPill: {
    backgroundColor: '#E1F5EE',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  newLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.8,
    color: '#0F6E56',
  },
  preview: {
    marginTop: 2,
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    color: '#8A948B',
  },
  rowChevron: {
    marginLeft: 8,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 10,
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  emptyHint: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: lightTokens.colors.warmGrey,
  },
});
