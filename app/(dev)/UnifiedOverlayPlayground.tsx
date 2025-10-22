/**
 * UnifiedOverlayPlayground - Dev screen for testing all overlay features
 *
 * This screen provides buttons to test all overlay scenarios:
 * - Create flows for each entity type (habit, todo, journal, note, person)
 * - Edit flows for existing records
 * - AI freeform mode
 * - Space context
 * - All subtypes
 */

import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import { useOverlayController } from '../../hooks/useOverlayController';
import { FeatureFlaggedOverlay } from '../../components/FeatureFlaggedOverlay';
import { useRepo } from '../../providers/RepoProvider';
import type { AppRecord } from '../../lib/types';

export default function UnifiedOverlayPlayground() {
  const overlayController = useOverlayController();
  const repo = useRepo();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [sampleRecords, setSampleRecords] = useState<AppRecord[]>([]);

  // Load sample records for editing
  const loadSamples = async () => {
    try {
      const habits = await repo.listByType('habit', { spaceId: undefined });
      const todos = await repo.listByType('todo', { spaceId: undefined });
      const notes = await repo.listByType('note', { spaceId: undefined });
      setSampleRecords([...habits.slice(0, 2), ...todos.slice(0, 2), ...notes.slice(0, 2)]);
    } catch (error) {
      console.error('Failed to load samples:', error);
    }
  };

  React.useEffect(() => {
    loadSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOverlaySaved = (result: { type: string; id: string }) => {
    setLastResult(`✅ Saved: ${result.type} (${result.id})`);
    loadSamples(); // Reload samples after save
    setTimeout(() => setLastResult(null), 5000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" style={styles.title}>
          Unified Overlay Playground
        </Text>
        <Text variant="body" style={styles.subtitle}>
          Test all create, edit, and AI flows
        </Text>

        {lastResult && (
          <View style={styles.resultBanner}>
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>
        )}

        {/* Create Flows */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Create Flows
          </Text>

          <Button
            label="Create Habit"
            onPress={() => overlayController.openCreate({ type: 'habit' })}
            testID="create-habit-button"
            style={styles.button}
          />

          <Button
            label="Create To-Do"
            onPress={() => overlayController.openCreate({ type: 'todo' })}
            testID="create-todo-button"
            style={styles.button}
          />

          <Button
            label="Create Journal Entry"
            onPress={() => overlayController.openCreate({ type: 'journal' })}
            testID="create-journal-button"
            style={styles.button}
          />

          <Button
            label="Create Note"
            onPress={() => overlayController.openCreate({ type: 'note' })}
            testID="create-note-button"
            style={styles.button}
          />

          <Button
            label="Create Person"
            onPress={() => overlayController.openCreate({ type: 'person' })}
            testID="create-person-button"
            style={styles.button}
          />
        </View>

        {/* Create with Space Context */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Create with Space Context
          </Text>

          <Button
            label='Create Habit in "Work" Space'
            onPress={() => overlayController.openCreate({ type: 'habit', spaceId: 'space-work' })}
            testID="create-habit-work-button"
            style={styles.button}
          />

          <Button
            label='Create To-Do in "Personal" Space'
            onPress={() =>
              overlayController.openCreate({ type: 'todo', spaceId: 'space-personal' })
            }
            testID="create-todo-personal-button"
            style={styles.button}
          />
        </View>

        {/* AI Freeform Mode */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            AI Freeform Mode
          </Text>

          <Button
            label="Open AI Freeform Mode"
            onPress={() => overlayController.openCreate()}
            testID="open-ai-mode-button"
            style={styles.button}
          />

          <Text variant="subtle" style={styles.hint}>
            Tip: Open overlay and toggle AI mode to enter freeform text
          </Text>
        </View>

        {/* Edit Flows */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Edit Existing Records
          </Text>

          {sampleRecords.length === 0 && (
            <Text variant="subtle" style={styles.hint}>
              Create some records first to test edit mode
            </Text>
          )}

          {sampleRecords.map((record) => {
            const getRecordPreview = (rec: AppRecord) => {
              if ('title' in rec && rec.title) return rec.title;
              if ('body' in rec && rec.body) return rec.body.slice(0, 30);
              return 'Untitled';
            };

            return (
              <Button
                key={record.id}
                label={`Edit ${record.type}: ${getRecordPreview(record)}`}
                onPress={() => overlayController.openEdit({ record })}
                testID={`edit-${record.type}-${record.id}-button`}
                style={styles.button}
                variant="secondary"
              />
            );
          })}

          {sampleRecords.length > 0 && (
            <Button
              label="Refresh Sample List"
              onPress={loadSamples}
              testID="refresh-samples-button"
              style={styles.button}
              variant="outline"
            />
          )}
        </View>

        {/* Feature Flag Info */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Feature Flag Status
          </Text>

          <View style={styles.infoBox}>
            <Text variant="subtle">
              EXPO_PUBLIC_UNIFIED_OVERLAY:{' '}
              {process.env.EXPO_PUBLIC_UNIFIED_OVERLAY || 'undefined (defaults to true)'}
            </Text>
            <Text variant="subtle" style={styles.hint}>
              Current Implementation:{' '}
              {process.env.EXPO_PUBLIC_UNIFIED_OVERLAY === 'false'
                ? 'Legacy ManualAddOverlay'
                : 'UnifiedCreateOverlay'}
            </Text>
          </View>
        </View>

        {/* Testing Tips */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Testing Tips
          </Text>

          <View style={styles.infoBox}>
            <Text variant="subtle">
              • Test all entity types (habit, todo, journal, note, person)
            </Text>
            <Text variant="subtle">• Try habit subtypes (start, break, routine)</Text>
            <Text variant="subtle">• Try note subtypes (idea, list, reference)</Text>
            <Text variant="subtle">• Toggle AI mode and enter freeform text</Text>
            <Text variant="subtle">• Edit existing records and verify changes</Text>
            <Text variant="subtle">• Test with and without space context</Text>
            <Text variant="subtle">
              • Toggle EXPO_PUBLIC_UNIFIED_OVERLAY flag to test both implementations
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Feature-Flagged Overlay */}
      <FeatureFlaggedOverlay
        visible={overlayController.state.visible}
        mode={overlayController.state.mode}
        initialEntity={overlayController.state.initialEntity}
        initialSpaceId={overlayController.state.initialSpaceId}
        onClose={overlayController.close}
        onSaved={handleOverlaySaved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  button: {
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  resultBanner: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  resultText: {
    color: '#FFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 4,
  },
});
