/**
 * OverwhelmFocusOverlay - Full-screen focus mode for selected items
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type { OverwhelmPlanItem } from '../../lib/now/useOverwhelmFlow';

interface OverwhelmFocusOverlayProps {
  visible: boolean;
  plan: OverwhelmPlanItem[] | null;
  onExit: () => void;
}

export function OverwhelmFocusOverlay({ visible, plan, onExit }: OverwhelmFocusOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onExit}>
      <Box style={styles.overlay}>
        <TouchableOpacity style={styles.exitButton} onPress={onExit}>
          <Text style={styles.exitText}>✕</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.header}>Focus on these steps</Text>
          <Text style={styles.subtitle}>Take it one micro-step at a time</Text>

          {!plan || plan.length === 0 ? (
            <Text style={styles.emptyText}>No focus items available</Text>
          ) : (
            plan.map((item, index) => (
              <Box key={index} style={styles.focusItem}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Box style={styles.stepsContainer}>
                  {item.steps.map((step, stepIndex) => (
                    <Box key={stepIndex} style={styles.stepRow}>
                      <Box style={styles.stepBullet} />
                      <Text style={styles.stepText}>{step}</Text>
                    </Box>
                  ))}
                </Box>
                {item.encouragement && (
                  <Text style={styles.encouragement}>💪 {item.encouragement}</Text>
                )}
              </Box>
            ))
          )}

          <TouchableOpacity style={styles.doneButton} onPress={onExit}>
            <Text style={styles.doneButtonText}>I'm ready to start</Text>
          </TouchableOpacity>
        </ScrollView>
      </Box>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  exitButton: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  exitText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    paddingTop: 120,
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  focusItem: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  itemTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  stepsContainer: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9800',
    marginTop: 6,
    marginRight: 12,
  },
  stepText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
    lineHeight: 22,
  },
  encouragement: {
    fontSize: 15,
    color: '#FFB74D',
    fontStyle: 'italic',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    paddingVertical: 48,
  },
  doneButton: {
    marginTop: 24,
    backgroundColor: '#FF9800',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
