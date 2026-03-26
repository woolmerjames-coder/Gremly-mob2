import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

const c = BRAND.colors;

interface RitualProgressPopoverProps {
  visible: boolean;
  onDismiss: () => void;
  gremlyAge: number;
  dropsCount: number;
  sweepsCount: number;
}

function ProgressDots({ count, filled }: { count: number; filled: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, filled >= index + 1 ? styles.dotFilled : styles.dotEmpty]}
        />
      ))}
    </View>
  );
}

export default function RitualProgressPopover({
  visible,
  onDismiss,
  gremlyAge,
  dropsCount,
  sweepsCount,
}: RitualProgressPopoverProps) {
  const ritualComplete = dropsCount >= 3 && sweepsCount >= 3;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Title */}
          <Text style={styles.title}>Age {gremlyAge} with Gremly</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Section label */}
          <Text style={styles.sectionLabel}>Today's ritual</Text>

          {/* Drops row */}
          <View style={styles.progressRow}>
            <ProgressDots count={3} filled={Math.min(dropsCount, 3)} />
            <Text style={styles.progressText}>{Math.min(dropsCount, 3)}/3 drops</Text>
          </View>

          {/* Sweeps row */}
          <View style={styles.progressRow}>
            <ProgressDots count={3} filled={Math.min(sweepsCount, 3)} />
            <Text style={styles.progressText}>{Math.min(sweepsCount, 3)}/3 sweeps</Text>
          </View>

          {/* Completion or encouragement message */}
          {ritualComplete ? (
            <View style={styles.completionRow}>
              <Sparkles size={16} color={c.goldenPear} />
              <Text style={styles.completionText}>Ritual complete! Gremly grew today.</Text>
            </View>
          ) : (
            <Text style={styles.encouragementText}>Complete both to help Gremly grow!</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 160,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BRAND.radius.lg,
    padding: 20,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: c.charcoalInk,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: c.borderSubtle,
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 13,
    color: c.inkMuted,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  dotFilled: {
    backgroundColor: c.mossGreen,
  },
  dotEmpty: {
    backgroundColor: c.borderSubtle,
  },
  progressText: {
    fontSize: 14,
    color: c.charcoalInk,
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  completionText: {
    fontSize: 13,
    color: c.charcoalInk,
    marginLeft: 6,
    fontWeight: '500',
  },
  encouragementText: {
    fontSize: 13,
    color: c.inkMuted,
    marginTop: 12,
    textAlign: 'center',
  },
});
