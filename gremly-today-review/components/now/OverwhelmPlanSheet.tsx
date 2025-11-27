/**
 * OverwhelmPlanSheet - Shows AI-generated micro-steps for selected items
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Box, Text } from '../../ui';
import type { OverwhelmPlanItem } from '../../lib/now/useOverwhelmFlow';

interface OverwhelmPlanSheetProps {
  visible: boolean;
  plan: OverwhelmPlanItem[] | null;
  isLoading: boolean;
  onEnterFocus: () => void;
  onChangeSelection: () => void;
  onClose: () => void;
}

export function OverwhelmPlanSheet({
  visible,
  plan,
  isLoading,
  onEnterFocus,
  onChangeSelection,
  onClose,
}: OverwhelmPlanSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Box style={styles.header}>
            <Text style={styles.title}>Your starter steps</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </Box>

          {isLoading ? (
            <Box style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF9800" />
              <Text style={styles.loadingText}>Gremly is preparing tiny steps...</Text>
            </Box>
          ) : (
            <>
              <ScrollView style={styles.content}>
                {!plan || plan.length === 0 ? (
                  <Text style={styles.emptyText}>No plan available</Text>
                ) : (
                  plan.map((item, index) => (
                    <Box key={index} style={styles.planItem}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.steps.map((step, stepIndex) => (
                        <Text key={stepIndex} style={styles.step}>
                          → {step}
                        </Text>
                      ))}
                      {item.encouragement && (
                        <Text style={styles.encouragement}>{item.encouragement}</Text>
                      )}
                    </Box>
                  ))
                )}
              </ScrollView>

              <Box style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={onEnterFocus}
                >
                  <Text style={styles.primaryButtonText}>Lock these in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={onChangeSelection}
                >
                  <Text style={styles.secondaryButtonText}>Change selection</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Close</Text>
                </TouchableOpacity>
              </Box>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: '#757575',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
  },
  content: {
    padding: 16,
    maxHeight: 400,
  },
  planItem: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  step: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 8,
    marginBottom: 4,
  },
  encouragement: {
    fontSize: 14,
    color: '#FF9800',
    fontStyle: 'italic',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 24,
  },
  buttons: {
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#FF9800',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#FFF3E0',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9800',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#757575',
  },
});
