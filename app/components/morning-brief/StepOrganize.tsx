/**
 * StepOrganize - Step 4 of the Morning Brief flow
 *
 * Single-purpose CTA screen: one button to trigger AI organize,
 * or skip to arrange manually. Reuses OrganizeButton's internal
 * loading state, spinner, and API call.
 */

import React, { useEffect } from 'react';
import { View, Pressable, Image, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { OrganizeButton } from './components';
import type { TaskAssignment } from '../../../lib/api/organizeDay';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepOrganizeProps {
  // Passed through to OrganizeButton
  targetDate?: string;
  isPrioritizing: boolean;
  selectedIds: Set<string>;
  lockedIds: Set<string>;
  isOverCapacity: boolean;

  // Auto-skip when nothing to organize
  hasTasksToOrganize: boolean;

  // Callbacks
  onOrganizeComplete: (summary: string, reasoning: string[]) => void;
  onOrganizeError: (error: string) => void;
  onAnimationStart: (assignments: TaskAssignment[]) => void;
  onAnimationComplete: () => void;

  // Save parked items after organize
  onSaveParked?: () => void;

  // Navigation
  onContinue: () => void;
  onSkip: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepOrganize({
  targetDate,
  isPrioritizing,
  selectedIds,
  lockedIds,
  isOverCapacity,
  hasTasksToOrganize,
  onOrganizeComplete,
  onOrganizeError,
  onAnimationStart,
  onAnimationComplete,
  onSaveParked,
  onContinue,
  onSkip,
}: StepOrganizeProps) {
  // Auto-skip when there's nothing to organize
  useEffect(() => {
    if (!hasTasksToOrganize) {
      onContinue();
    }
  }, [hasTasksToOrganize, onContinue]);

  return (
    <View style={styles.container}>
      {/* Mascot */}
      <View style={styles.mascotCircle}>
        <Image source={MORNING_BRIEF_GREMLY} style={styles.mascotImage} resizeMode="contain" />
      </View>

      {/* Sparkle */}
      <Text style={styles.sparkle}>✦</Text>

      {/* Title + description */}
      <Text style={styles.title}>Let Gremly organize your day</Text>
      <Text style={styles.description}>
        Gremly will slot your priorities into free time around your meetings.
      </Text>

      {/* Organize button — reuse existing component */}
      <View style={styles.buttonArea}>
        <OrganizeButton
          targetDate={targetDate}
          isPrioritizing={isPrioritizing}
          selectedIds={selectedIds}
          lockedIds={lockedIds}
          isOverCapacity={isOverCapacity}
          onComplete={(summary, reasoning) => {
            onOrganizeComplete(summary, reasoning ?? []);
            onSaveParked?.();
            // Auto-advance after a brief pause for user to see success
            setTimeout(() => onContinue(), 800);
          }}
          onError={(error) => {
            onOrganizeError(error);
          }}
          onAnimationStart={onAnimationStart}
          onAnimationComplete={onAnimationComplete}
        />
      </View>

      {/* Skip link */}
      <Pressable
        style={({ pressed }) => [styles.skipPressable, pressed && { opacity: 0.5 }]}
        onPress={onSkip}
      >
        <Text style={styles.skipText}>I'll arrange it myself →</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  mascotCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#E8F0EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  mascotImage: {
    width: 80,
    height: 80,
  },
  sparkle: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    opacity: 0.3,
    letterSpacing: 2,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 36,
  },
  buttonArea: {
    width: '100%',
  },
  skipPressable: {
    alignItems: 'center',
    marginTop: 4,
  },
  skipText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    paddingVertical: 12,
  },
});

export default StepOrganize;
