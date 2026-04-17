import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ArrowDownToLine,
  Moon,
  MessageCircle,
  Calendar,
  BookOpen,
  Repeat,
  Sun,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useNeedsMindDropTutorial, useTrialStartedAt } from '../../../lib/store/lifecycleSelectors';
import { supabase } from '../../../lib/supabase/client';
import { getTrainingHints } from '../../../lib/training/trainingHints';
import {
  getReadinessLabel,
  getTrainingDaysRemaining,
} from '../../../lib/training/trainingReadiness';
import type { UserTrainingData } from '../../../lib/training/trainingReadiness';
import type { TrainingHint } from '../../../lib/training/trainingHints';
import MascotLottie from '../../components/MascotLottie';
import { dateService } from '../../../lib/date/DateService';

const c = BRAND.colors;

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  ArrowDownToLine,
  Moon,
  MessageCircle,
  Calendar,
  BookOpen,
  Repeat,
  Sun,
};

function getHeaderText(daysRemaining: number): string {
  if (daysRemaining > 5) return "I'm learning how your brain works";
  if (daysRemaining > 2) return "I'm getting smarter every day";
  if (daysRemaining > 0) return 'Almost trained';
  return 'Keep going, nearly there';
}

interface TrainingMeterProps {
  visible: boolean;
  onDismiss: () => void;
  onNavigate: (screen: string, params?: Record<string, any>) => void;
}

export default function TrainingMeter({ visible, onDismiss, onNavigate }: TrainingMeterProps) {
  const trainingReadiness = useGremlyStore((s) => s.trainingReadiness);
  const trialStartedAt = useTrialStartedAt();
  const isTrainingMode = useNeedsMindDropTutorial();
  const refreshTrainingReadiness = useGremlyStore((s) => s.refreshTrainingReadiness);
  const feedingHistory = useGremlyStore((s) => s.feedingHistory);
  const fetchFeedingHistory = useGremlyStore((s) => s.fetchFeedingHistory);
  const isFedToday = useGremlyStore((s) => s.isFedToday);

  const [hints, setHints] = useState<TrainingHint[]>([]);
  const [daysRemaining, setDaysRemaining] = useState(7);

  useEffect(() => {
    if (!visible || !isTrainingMode || !trialStartedAt) return;

    // Refresh the readiness score
    refreshTrainingReadiness();

    // Fetch feeding history for day tracker
    fetchFeedingHistory();

    // Compute days remaining
    setDaysRemaining(getTrainingDaysRemaining(trialStartedAt) ?? 0);

    // Fetch raw data for hints
    const userId = useGremlyStore.getState().userId;
    if (!userId) return;

    supabase
      .rpc('get_training_readiness', {
        p_owner_id: userId,
        p_since: trialStartedAt,
      })
      .then(({ data, error }) => {
        if (error || !data) {
          setHints([]);
          return;
        }
        const metrics = data as Record<string, number>;
        const trainingData: UserTrainingData = {
          totalDrops: metrics.total_drops ?? 0,
          daysWithDrops: metrics.days_with_drops ?? 0,
          totalSweeps: metrics.total_sweeps ?? 0,
          entityTypeCount: metrics.entity_types ?? 0,
          journalCount: metrics.journal_count ?? 0,
          entityChatCount: metrics.entity_chat_count ?? 0,
          briefCount: metrics.brief_count ?? 0,
          todosCount: metrics.todos_count ?? 0,
          calendarConnected: false,
        };
        setHints(getTrainingHints(trainingData));
      });
  }, [visible, isTrainingMode, trialStartedAt, refreshTrainingReadiness, fetchFeedingHistory]);

  const readinessLabel = getReadinessLabel(trainingReadiness);
  const pct = Math.min(trainingReadiness, 100);

  const startDay = trialStartedAt
    ? dateService.toLocalDate(new Date(trialStartedAt))
    : dateService.today();

  const dayNumber = trialStartedAt
    ? Math.min(dateService.daysBetween(startDay, dateService.today()) + 1, 7)
    : 1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={styles.bottomCard}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <MascotLottie />
        </View>

        {/* Header */}
        <Text style={styles.headerTitle}>{getHeaderText(daysRemaining)}</Text>

        {/* Day counter */}
        <Text style={styles.dayCounter}>Day {dayNumber} of 7-day challenge</Text>

        {/* 7-day tracker */}
        <View style={styles.dayTrackerRow}>
          {Array.from({ length: 7 }, (_, i) => {
            const isToday = i + 1 === dayNumber;
            const isPast = i + 1 < dayNumber;
            const isFuture = i + 1 > dayNumber;

            const dayDate = trialStartedAt ? dateService.addDays(startDay, i) : null;

            const wasFull = isToday
              ? isFedToday
              : feedingHistory.some((d) => d.date === dayDate && d.isFed);

            return (
              <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: wasFull
                      ? BRAND.colors.mossGreen
                      : isToday
                        ? '#EDEFF2'
                        : 'transparent',
                    borderWidth: isToday ? 2 : isPast && !wasFull ? 1.5 : isFuture ? 1 : 0,
                    borderColor: isToday
                      ? BRAND.colors.mossGreen
                      : isPast && !wasFull
                        ? '#D4D6CE'
                        : isFuture
                          ? '#EDEFF2'
                          : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {wasFull && <Text style={{ fontSize: 12, color: '#FFFFFF' }}>✓</Text>}
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: isToday ? BRAND.colors.charcoalInk : BRAND.colors.inkMuted,
                    fontWeight: isToday ? '600' : '400',
                  }}
                >
                  {
                    ['S', 'M', 'T', 'W', 'T', 'F', 'S'][
                      (
                        dateService.fromLocalDate(dateService.addDays(startDay, i)) ??
                        dateService.now()
                      ).getDay()
                    ]
                  }
                </Text>
              </View>
            );
          })}
        </View>

        {/* Progress bar */}
        <View style={styles.barContainer}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]}>
              {pct >= 20 && <Text style={styles.barPctInside}>{pct}%</Text>}
            </View>
          </View>
          {pct < 20 && <Text style={styles.barPctBelow}>{pct}%</Text>}
        </View>

        {/* Readiness label */}
        {trainingReadiness > 60 && <Text style={styles.readinessLabel}>{readinessLabel}</Text>}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Hints section */}
        <Text style={styles.sectionTitle}>What to do next</Text>
        {hints.length > 0 ? (
          hints.map((hint, i) => {
            const IconComponent = ICON_MAP[hint.icon];
            return (
              <Pressable
                key={i}
                style={styles.hintRow}
                onPress={() => {
                  onDismiss();
                  onNavigate(hint.navigateTo, hint.navigateParams as Record<string, any>);
                }}
              >
                {IconComponent ? (
                  <IconComponent size={18} color={c.mossGreen} />
                ) : (
                  <ArrowDownToLine size={18} color={c.mossGreen} />
                )}
                <Text style={styles.hintText}>{hint.text}</Text>
                <ChevronRight size={12} color="#D4D6CE" />
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptyHints}>You're doing great. Keep dropping and sweeping.</Text>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Reward card */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardHeader}>
            <Sparkles size={16} color={c.charcoalInk} />
            <Text style={styles.rewardTitle}>See what Gremly learned about you</Text>
          </View>
          <Text style={styles.rewardBody}>
            Complete the challenge and Gremly shows you what it figured out about you.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D6CE',
    alignSelf: 'center',
    marginBottom: 12,
  },
  mascotContainer: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.charcoalInk,
    textAlign: 'center',
  },
  dayCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: c.mossGreen,
    textAlign: 'center',
    marginBottom: 4,
  },
  dayTrackerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  barContainer: {
    marginTop: 20,
    marginBottom: 8,
  },
  barTrack: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EDEFF2',
    width: '100%',
    overflow: 'hidden',
  },
  barFill: {
    height: 16,
    borderRadius: 8,
    backgroundColor: c.mossGreen,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  barPctInside: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  barPctBelow: {
    fontSize: 11,
    fontWeight: '600',
    color: c.inkMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  readinessLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: c.charcoalInk,
    textAlign: 'center',
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#EDEFF2',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: c.charcoalInk,
    marginBottom: 12,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAF7',
    borderRadius: 10,
    marginBottom: 6,
  },
  hintText: {
    fontSize: 14,
    color: c.inkMuted,
    flex: 1,
    marginLeft: 10,
  },
  emptyHints: {
    fontSize: 13,
    color: c.inkMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  rewardCard: {
    backgroundColor: '#F8FAF7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.2)',
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: c.charcoalInk,
    marginLeft: 8,
  },
  rewardBody: {
    fontSize: 12,
    color: c.inkMuted,
    marginTop: 6,
    lineHeight: 18,
  },
});
