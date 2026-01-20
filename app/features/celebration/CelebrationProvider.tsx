/**
 * Phase 10.9: CelebrationProvider
 * Renders celebration UI components in response to celebration events.
 * Subscribes to CelebrationController and shows MicroCelebrate/ConfettiCanvas.
 *
 * NOTE: AgeUpCelebrationModal is rendered at App.tsx level to avoid
 * conflicts with navigation modals (like DevTools).
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import celebrationController from './CelebrationController';
import { MicroCelebrate } from './MicroCelebrate';
import { ConfettiCanvas } from './ConfettiCanvas';
import type { CelebrationKind } from './CelebrationController';

type CelebrationState = {
  kind: CelebrationKind | null;
  message?: string;
  visible: boolean;
};

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [micro, setMicro] = useState<CelebrationState>({ kind: null, visible: false });
  const [confetti, setConfetti] = useState<CelebrationState>({ kind: null, visible: false });

  useEffect(() => {
    // Subscribe to celebration controller events
    const unsubscribe = celebrationController.subscribe((payload) => {
      switch (payload.kind) {
        case 'micro':
          setMicro({ kind: 'micro', message: payload.message, visible: true });
          // Auto-hide after 1600ms (animation + buffer)
          setTimeout(() => {
            setMicro({ kind: null, visible: false });
          }, 1600);
          break;

        case 'confetti':
          setConfetti({ kind: 'confetti', visible: true });
          // Auto-hide after 1600ms (animation + buffer)
          setTimeout(() => {
            setConfetti({ kind: null, visible: false });
          }, 1600);
          break;

        case 'mascot':
          // Mascot celebration is handled by Mascot component directly
          // via overlay_success event - no UI rendering needed here
          break;

        case 'age_up':
          // Age-up celebration is handled at App.tsx level
          // to avoid conflicts with navigation modals
          break;
      }
    });

    return unsubscribe;
  }, []);

  return (
    <View style={styles.container}>
      {children}

      {/* Micro celebration toast */}
      {micro.visible && micro.message && <MicroCelebrate message={micro.message} />}

      {/* Confetti animation */}
      {confetti.visible && <ConfettiCanvas />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
