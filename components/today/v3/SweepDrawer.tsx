import React, { useRef, useCallback } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useRepo } from '../../../providers/RepoProvider';
import { useSweepCandidatesUnified } from '../../../lib/store/selectors';
import type { SweepCandidate } from '../../../lib/sweep/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after modal closes with summary of actions taken */
  onSweepComplete?: (summary: { archived: number; total: number }) => void;
};

export default function SweepDrawer({ visible, onClose, onSweepComplete }: Props) {
  const repo = useRepo(); // Kept for sweepApplyAction (not in store yet)

  // Use store selector for sweep candidates
  const sweepCandidates = useSweepCandidatesUnified();

  // Track actions taken during this sweep session
  const actionsRef = useRef<{ archived: number; total: number }>({ archived: 0, total: 0 });

  // Reset counters when modal opens
  React.useEffect(() => {
    if (visible) {
      actionsRef.current = { archived: 0, total: 0 };
    }
  }, [visible]);

  const handleAction = useCallback(
    async (id: string, action: 'archive' | 'carry_forward' | 'keep') => {
      try {
        // sweepApplyAction still needs repo (not in store yet)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (repo as any).sweepApplyAction?.(id, 'todo', action, { archived_reason: 'swept' });

        // Track action
        actionsRef.current.total += 1;
        if (action === 'archive') {
          actionsRef.current.archived += 1;
        }
        // Store auto-updates, no reload needed
      } catch (e) {
        // Soft-fail; keep UI responsive
        console.warn('[Sweep] action failed:', e);
      }
    },
    [repo],
  );

  // Handle Done button - close modal and notify parent with summary
  const handleDone = useCallback(() => {
    const summary = { ...actionsRef.current };
    onClose();
    // Fire callback after close so toast shows after modal dismisses
    if (onSweepComplete && summary.total > 0) {
      // Small delay to ensure modal is closed before toast appears
      setTimeout(() => onSweepComplete(summary), 100);
    }
  }, [onClose, onSweepComplete]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="sweep-drawer"
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Card
            padding="md"
            style={{ borderRadius: BRAND.radius.xl, backgroundColor: BRAND.colors.linenCream }}
          >
            <Box gap={2}>
              <Text variant="title">Evening Sweep</Text>
              <Text variant="subtle">Archive, keep for tomorrow, or keep as-is.</Text>

              <ScrollView style={{ maxHeight: 420 }}>
                <Box gap={2}>
                  {sweepCandidates.length === 0 ? (
                    <Text variant="subtle" style={{ textAlign: 'center', paddingVertical: 24 }}>
                      Nothing to tidy — all clear.
                    </Text>
                  ) : (
                    <>
                      <Text variant="subtle" style={{ marginBottom: 4 }}>
                        Select what stays, what shifts, and what can rest.
                      </Text>
                      {sweepCandidates.map((t: SweepCandidate) => (
                        <Card key={t.id} padding="sm" testID={`sweep-item-${t.id}`}>
                          <Box
                            row
                            style={{
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Box style={{ flex: 1 }}>
                              <Text variant="body">
                                {t.kind === 'todo' ? t.raw.name : t.raw.title || 'Untitled'}
                              </Text>
                              {t.kind === 'todo' && t.raw.carry_forward && (
                                <Text variant="subtle" style={{ fontSize: 12 }}>
                                  carry-forward
                                </Text>
                              )}
                            </Box>
                            <Box row style={{ gap: 8 }}>
                              <Button
                                title="Archive"
                                variant="danger"
                                onPress={() => void handleAction(t.id, 'archive')}
                                testID={`sweep-archive-${t.id}`}
                              />
                              <Button
                                title="Keep for tomorrow"
                                variant="neutral"
                                onPress={() => void handleAction(t.id, 'carry_forward')}
                                testID={`sweep-carry-${t.id}`}
                              />
                              <Button
                                title="Keep"
                                variant="neutral"
                                onPress={() => void handleAction(t.id, 'keep')}
                                testID={`sweep-keep-${t.id}`}
                              />
                            </Box>
                          </Box>
                        </Card>
                      ))}
                    </>
                  )}
                </Box>
              </ScrollView>

              <Box row style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button title="Done" variant="primary" onPress={handleDone} testID="sweep-done" />
              </Box>
            </Box>
          </Card>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  sheet: { width: '100%', padding: 16 },
});
