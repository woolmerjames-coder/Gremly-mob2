/**
 * MultiIntentConfirmation - Phase 11.5
 * Handles disambiguation when multiple intent interpretations are valid
 * CRITICAL FIX: Use Pressable for better touch handling
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { SpaceChatMessage } from '../../lib/types';
import type { AlternativeIntent, IntentKind } from '../../lib/cortex/intents/types';
import { getIntentLabel, getMultiLabel } from '../../lib/cortex/intents/multiIntentDetector';

export interface MultiIntentConfirmationProps {
  message: SpaceChatMessage;
  onSelectIntent: (kind: IntentKind) => void | Promise<void>;
  onCreateMultiple?: () => void | Promise<void>;
  onCancel?: () => void;
  testID?: string;
}

export function MultiIntentConfirmation({
  message,
  onSelectIntent,
  onCreateMultiple,
  onCancel,
  testID,
}: MultiIntentConfirmationProps) {
  const metadata = message.metadata_json || {};
  const primaryKind: IntentKind = (metadata.actionType as IntentKind) || 'todo';
  const content = message.content || 'New item';
  const alternatives: AlternativeIntent[] = metadata.alternativeIntents || [];
  const isMultiIntent: boolean = metadata.isMultiIntent || false;
  const primaryConfidence: number = metadata.confidence || 0;

  const handleSelectPrimary = async () => {
    await onSelectIntent(primaryKind);
  };

  const handleSelectAlternative = async (kind: IntentKind) => {
    await onSelectIntent(kind);
  };

  const handleCreateMultiple = async () => {
    if (onCreateMultiple) {
      await onCreateMultiple();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <View style={styles.container} testID={testID} pointerEvents="box-none">
      <Text style={styles.questionText}>I can interpret this in multiple ways:</Text>

      <Text style={styles.contentText} numberOfLines={2}>
        "{content}"
      </Text>

      {/* Primary interpretation */}
      <Pressable
        style={({ pressed }) => [
          styles.option,
          styles.primaryOption,
          pressed && styles.optionPressed,
        ]}
        onPress={handleSelectPrimary}
        testID={`${testID}-primary`}
        hitSlop={10}
      >
        <View style={styles.optionHeader}>
          <Text style={styles.optionLabel}>{getIntentLabel(primaryKind)}</Text>
          <Text style={styles.primaryBadge}>SUGGESTED</Text>
        </View>
        <Text style={styles.confidence}>{Math.round(primaryConfidence * 100)}% match</Text>
      </Pressable>

      {/* Alternative interpretations */}
      {alternatives.map((alt, index) => (
        <Pressable
          key={alt.kind}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          onPress={() => handleSelectAlternative(alt.kind)}
          testID={`${testID}-alt-${index}`}
          hitSlop={10}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionLabel}>{getIntentLabel(alt.kind)}</Text>
          </View>
          <Text style={styles.rationale}>{alt.rationale}</Text>
          <Text style={styles.confidence}>{Math.round(alt.confidence * 100)}% match</Text>
        </Pressable>
      ))}

      {/* Multi-create option if appropriate */}
      {isMultiIntent && onCreateMultiple && (
        <Pressable
          style={({ pressed }) => [
            styles.option,
            styles.multiOption,
            pressed && styles.optionPressed,
          ]}
          onPress={handleCreateMultiple}
          testID={`${testID}-multi`}
          hitSlop={10}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.multiLabel}>
              ✓ Create both:{' '}
              {getMultiLabel({
                kind: primaryKind,
                confidence: primaryConfidence,
                alternativeIntents: alternatives,
              })}
            </Text>
          </View>
          <Text style={styles.multiHint}>Creates multiple related items</Text>
        </Pressable>
      )}

      {/* Cancel option */}
      <Pressable
        style={({ pressed }) => [styles.cancelOption, pressed && styles.optionPressed]}
        onPress={handleCancel}
        testID={`${testID}-cancel`}
        hitSlop={10}
      >
        <Text style={styles.cancelText}>Skip for now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(249, 246, 241, 0.98)',
    borderRadius: 14,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 5, // Increased elevation for Android
    zIndex: 1000, // High z-index
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
    marginBottom: 12,
  },
  contentText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222222',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 44, // Better touch target
  },
  optionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  primaryOption: {
    borderColor: '#2E5540',
    borderWidth: 2,
    backgroundColor: 'rgba(46, 85, 64, 0.02)',
  },
  multiOption: {
    borderColor: '#BFD8C0',
    borderWidth: 2,
    backgroundColor: 'rgba(191, 216, 192, 0.05)',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
  },
  primaryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E5540',
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  confidence: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    marginTop: 2,
  },
  rationale: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 4,
  },
  multiLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E5540',
  },
  multiHint: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  cancelOption: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999999',
  },
});
