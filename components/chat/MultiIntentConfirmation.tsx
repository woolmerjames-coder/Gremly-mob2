/**
 * MultiIntentConfirmation - Phase 11.5
 * Handles disambiguation when multiple intent interpretations are valid
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  const primaryKind: IntentKind = metadata.actionType || 'todo';
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
    <View style={styles.container} testID={testID}>
      <Text style={styles.questionText}>I can interpret this in multiple ways:</Text>

      <Text style={styles.contentText} numberOfLines={2}>
        "{content}"
      </Text>

      {/* Primary interpretation */}
      <TouchableOpacity
        style={[styles.option, styles.primaryOption]}
        onPress={handleSelectPrimary}
        testID={`${testID}-primary`}
      >
        <View style={styles.optionHeader}>
          <Text style={styles.optionLabel}>{getIntentLabel(primaryKind)}</Text>
          <Text style={styles.primaryBadge}>SUGGESTED</Text>
        </View>
        <Text style={styles.confidence}>{Math.round(primaryConfidence * 100)}% match</Text>
      </TouchableOpacity>

      {/* Alternative interpretations */}
      {alternatives.map((alt, index) => (
        <TouchableOpacity
          key={alt.kind}
          style={styles.option}
          onPress={() => handleSelectAlternative(alt.kind)}
          testID={`${testID}-alt-${index}`}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionLabel}>{getIntentLabel(alt.kind)}</Text>
          </View>
          <Text style={styles.rationale}>{alt.rationale}</Text>
          <Text style={styles.confidence}>{Math.round(alt.confidence * 100)}% match</Text>
        </TouchableOpacity>
      ))}

      {/* Multi-create option if appropriate */}
      {isMultiIntent && onCreateMultiple && (
        <TouchableOpacity
          style={[styles.option, styles.multiOption]}
          onPress={handleCreateMultiple}
          testID={`${testID}-multi`}
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
        </TouchableOpacity>
      )}

      {/* Cancel option */}
      <TouchableOpacity
        style={styles.cancelOption}
        onPress={handleCancel}
        testID={`${testID}-cancel`}
      >
        <Text style={styles.cancelText}>Skip for now</Text>
      </TouchableOpacity>
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
    elevation: 2,
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
