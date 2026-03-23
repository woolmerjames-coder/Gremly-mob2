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
import { supabase } from '../../../lib/supabase/client';
import { getTrainingHints } from '../../../lib/training/trainingHints';
import {
  getReadinessLabel,
  getTrainingDaysRemaining,
} from '../../../lib/training/trainingReadiness';
import type { UserTrainingData } from '../../../lib/training/trainingReadiness';
import type { TrainingHint } from '../../../lib/training/trainingHints';

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

interface TrainingMeterProps {
  visible: boolean;
  onDismiss: () => void;
  onNavigate: (screen: string, params?: Record<string, any>) => void;
}

export default function TrainingMeter({ visible, onDismiss, onNavigate }: TrainingMeterProps) {
  const trainingReadiness = useGremlyStore((s) => s.trainingReadiness);
  const trainingStartedAt = useGremlyStore((s) => s.trainingStartedAt);
  const isTrainingMode = useGremlyStore((s) => s.isTrainingMode);
  const refreshTrainingReadiness = useGremlyStore((s) => s.refreshTrainingReadiness);

  const [hints, setHints] = useState<TrainingHint[]>([]);
  const [daysRemaining, setDaysRemaining] = useState(7);

  useEffect(() => {
    if (!visible || !isTrainingMode || !trainingStartedAt) return;

    // Refresh the readiness score
    refreshTrainingReadiness();

    // Compute days remaining
    setDaysRemaining(getTrainingDaysRemaining(trainingStartedAt) ?? 0);

    // Fetch raw data for hints
    const userId = useGremlyStore.getState().userId;
    if (!userId) return;

    supabase
      .rpc('get_training_readiness', {
        p_owner_id: userId,
        p_since: trainingStartedAt,
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
  }, [visible, isTrainingMode, trainingStartedAt, refreshTrainingReadiness]);

  const readinessLabel = getReadinessLabel(trainingReadiness);

  const daysText =
    daysRemaining > 0
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`
      : 'Keep going, almost there';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={styles.bottomCard}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>7-day challenge</Text>
          <Text style={styles.headerDays}>{daysText}</Text>
        </View>

        {/* Readiness bar */}
        <View style={styles.barContainer}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(trainingReadiness, 100)}%` }]} />
          </View>
          <Text style={styles.barLabel}>{readinessLabel}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Hints section */}
        <Text style={styles.sectionTitle}>Tips to train faster</Text>
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
                  <IconComponent size={16} color={c.mossGreen} />
                ) : (
                  <ArrowDownToLine size={16} color={c.mossGreen} />
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
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.charcoalInk,
  },
  headerDays: {
    fontSize: 13,
    color: c.inkMuted,
  },
  barContainer: {
    marginTop: 16,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EDEFF2',
    width: '100%',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.mossGreen,
  },
  barLabel: {
    fontSize: 13,
    color: c.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#EDEFF2',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: c.charcoalInk,
    marginBottom: 12,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  hintText: {
    fontSize: 13,
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
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardTitle: {
    fontSize: 14,
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
