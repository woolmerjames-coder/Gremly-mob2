import React, { useMemo } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useRepo } from '../../../providers/RepoProvider';
import { useTodayEntries } from '../../../lib/today/hooks/useTodayEntries';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SweepDrawer({ visible, onClose }: Props) {
  const repo = useRepo();
  const { items, reload } = useTodayEntries();

  const todos = useMemo(
    () =>
      items.filter((i) => i.type === 'todo') as Array<
        Extract<(typeof items)[number], { type: 'todo' }>
      >,
    [items],
  );

  const handleAction = async (id: string, action: 'archive' | 'carry_forward' | 'keep') => {
    try {
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
                  {todos.length === 0 && (
                    <Text variant="subtle" style={{ textAlign: 'center', padding: 12 }}>
                      Nothing to tidy — all clear.
                    </Text>
                  )}
                  {todos.map((t) => (
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
