import React, { useMemo } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useRepo } from '../../../providers/RepoProvider';
import { useTodayEntries } from '../../../lib/today/hooks/useTodayEntries';
import { selectSweepCandidates, type SweepCandidate } from '../../../lib/today/sweepSelectors';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SweepDrawer({ visible, onClose }: Props) {
  const repo = useRepo();
  const { items, reload } = useTodayEntries();

  // Use shared sweep selector for consistency with pill count
  const sweepCandidates = useMemo(() => {
    const todayDay = new Date().toISOString().split('T')[0];

    // Map items to the format expected by selectSweepCandidates
    const todosForSweep = items
      .filter((i) => i.type === 'todo')
      .map((t) => ({
        id: t.id,
        name: t.name,
        type: 'todo' as const,
        due_day: t.due_day,
        due_date: t.due_date,
        status: t.status ?? 'active',
        carry_forward: t.carry_forward,
        completed_at: t.completed_at,
        archived: false,
      }));

    const candidates = selectSweepCandidates(todosForSweep, todayDay);

    // Log for debugging sweep mismatch
    console.log('[SweepDrawer] Sweep candidates:', {
      todayDay,
      inputItemsCount: items.length,
      todosCount: todosForSweep.length,
      candidatesCount: candidates.length,
      candidateIds: candidates.map((c) => c.id),
    });

    return candidates;
  }, [items]);

  const handleAction = async (id: string, action: 'archive' | 'carry_forward' | 'keep') => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (repo as any).sweepApplyAction?.(id, 'todo', action, { archived_reason: 'swept' });
      await reload();
    } catch (e) {
      // Soft-fail; keep UI responsive
      console.warn('[Sweep] action failed:', e);
    }
  };

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
                  {sweepCandidates.length === 0 && (
                    <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
                      Nothing to tidy — all clear.
                    </Text>
                  )}
                  {sweepCandidates.map((t: SweepCandidate) => (
                    <Card key={t.id} padding="sm" testID={`sweep-item-${t.id}`}>
                      <Box
                        row
                        style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                      >
                        <Box style={{ flex: 1 }}>
                          <Text variant="body">{t.name}</Text>
                          {t.carry_forward && (
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
                </Box>
              </ScrollView>

              <Box row style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button title="Done" variant="primary" onPress={onClose} testID="sweep-done" />
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
