/**
 * UnifiedCreateOverlayExample - Dev screen to test the new overlay
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../design-system/Button';
import { UnifiedCreateOverlay } from '../components/overlay/UnifiedCreateOverlay';

export default function UnifiedCreateOverlayExample() {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ type: string; id: string } | null>(null);

  const handleSaved = (result: { type: string; id: string }) => {
    console.log('✅ Saved:', result);
    setLastSaved(result);
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Unified Create Overlay</Text>
        <Text style={styles.subtitle}>Phase 7 - Type Pills + AI Mode</Text>

        <Button
          label="Open Overlay (Create Mode)"
          onPress={() => setOverlayVisible(true)}
          variant="primary"
          fullWidth
        />

        {lastSaved && (
          <View style={styles.result}>
            <Text style={styles.resultText}>
              ✅ Last saved: {lastSaved.type} (ID: {lastSaved.id})
            </Text>
          </View>
        )}

        <UnifiedCreateOverlay
          visible={overlayVisible}
          mode="create"
          onClose={() => setOverlayVisible(false)}
          onSaved={handleSaved}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  result: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  resultText: {
    fontSize: 14,
    color: '#2E7D32',
  },
});
