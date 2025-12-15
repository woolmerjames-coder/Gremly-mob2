import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Button } from '../../../design-system/Button';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useRepo } from '../../../providers/RepoProvider';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useTodayTodos, useTodayHabits, selectItemById } from '../../../lib/store/selectors';
import { useFocusCard, type FocusEntryType } from '../../../lib/today/hooks/useFocusCard';

type Candidate = { id: string; type: FocusEntryType; title: string; priority: number };

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function FocusPickerModal({ visible, onClose }: Props) {
  const repo = useRepo(); // Kept for topFocusCandidates (not in store yet)
  const todayTodos = useTodayTodos();
  const todayHabits = useTodayHabits();
  const { choose } = useFocusCard();

  // Build namesById from store data
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    todayTodos.forEach((todo) => {
      map.set(todo.id, todo.name || todo.title || '');
    });
    todayHabits.forEach((habit) => {
      map.set(habit.id, habit.name || '');
    });
    return map;
  }, [todayTodos, todayHabits]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // topFocusCandidates still needs repo (specialized query)
      const tops =
        typeof (repo as any).topFocusCandidates === 'function'
          ? await (repo as any).topFocusCandidates(5)
          : [];

      // Get store state for item lookup
      const storeState = useGremlyStore.getState();

      const resolved = (Array.isArray(tops) ? tops : []).map(
        (candidate: { id: string; type: FocusEntryType; priority?: number }) => {
          let title = namesById.get(candidate.id);
          if (!title) {
            // Use store selector instead of repo.getById
            const record = selectItemById(storeState, candidate.id);
            title = (record as any)?.name || (record as any)?.title || candidate.id;
          }
          return {
            id: candidate.id,
            type: candidate.type,
            title: title || candidate.id,
            priority: candidate.priority ?? 0,
          };
        },
      );

      setCandidates(resolved);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [repo, namesById]);

  useEffect(() => {
    if (visible) {
      void load();
    }
  }, [visible, load]);

  const handlePick = async (candidate: Candidate) => {
    if (!candidate.type) return;
    await choose({ entry_id: candidate.id, entry_type: candidate.type, source: 'user' });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      testID="focus-picker-modal"
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Card
            padding="md"
            style={{ borderRadius: BRAND.radius.xl, backgroundColor: BRAND.colors.linenCream }}
          >
            <Box gap={2}>
              <Text variant="title">Pick today's focus</Text>
              {loading && <Text variant="subtle">Loading options...</Text>}
              {!loading && candidates.length === 0 && (
                <Text variant="subtle">No strong candidates right now.</Text>
              )}
              {!loading && candidates.length > 0 && (
                <ScrollView style={{ maxHeight: 320 }}>
                  <Box gap={2}>
                    {candidates.map((candidate) => (
                      <TouchableOpacity
                        key={`${candidate.type ?? 'unknown'}-${candidate.id}`}
                        onPress={() => void handlePick(candidate)}
                        testID={`focus-pick-${candidate.type ?? 'unknown'}-${candidate.id}`}
                      >
                        <Card padding="sm">
                          <Box
                            row
                            style={{ justifyContent: 'space-between', alignItems: 'center' }}
                          >
                            <Text variant="body">{candidate.title}</Text>
                            <Text variant="subtle" style={{ fontSize: 12 }}>
                              {candidate.type === 'habit' ? 'Habit' : 'Task'}
                            </Text>
                          </Box>
                        </Card>
                      </TouchableOpacity>
                    ))}
                  </Box>
                </ScrollView>
              )}
              <Box row style={{ justifyContent: 'flex-end', gap: 8 }}>
                <Button label="Close" variant="ghost" onPress={onClose} />
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: { width: '100%', maxWidth: 480 },
});
