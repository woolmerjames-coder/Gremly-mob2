/**
 * SweepIntentionStep — Week-mode only. Step 0.75.
 *
 * Presents a focused prompt asking the user what this week is about.
 * On "Set intention": saves a journal note with journal_subtype:'intention',
 * mirroring the reflection note shape from SweepMoodStep, then calls onContinue.
 * On "Skip": calls onSkip with no note saved.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Image,
  StyleSheet,
} from 'react-native';
import { Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_JOURNAL = require('../../../assets/mascot/JournalGremly.png');

export interface SweepIntentionStepProps {
  onContinue: () => void;
  onSkip: () => void;
  weekStartDate: string; // YYYY-MM-DD — the Monday / today that anchors this week
}

export function SweepIntentionStep({ onContinue, onSkip, weekStartDate }: SweepIntentionStepProps) {
  const createNote = useGremlyStore((s) => s.createNote);
  const [intentionText, setIntentionText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSetIntention = useCallback(async () => {
    const trimmed = intentionText.trim();

    // Nothing typed — treat as implicit skip
    if (!trimmed) {
      onContinue();
      return;
    }

    setIsSaving(true);
    try {
      await createNote({
        subtype: 'journal',
        title: trimmed.slice(0, 80) || 'Weekly intention',
        body: trimmed,
        origin: 'manual',
        canonicalType: 'log',
        target_date: weekStartDate,
        tags: ['intention', 'sweep'],
        views: {
          sweep_origin: true,
          sweep_intention: true,
          sweep_date: weekStartDate,
        },
      });
    } catch {
      // Non-blocking — don't strand the user if the note save fails
    } finally {
      setIsSaving(false);
    }
    onContinue();
  }, [intentionText, createNote, weekStartDate, onContinue]);

  const hasText = intentionText.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header row with mascot */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="title" style={styles.title}>
              What's this week about?
            </Text>
            <Text style={styles.subcopy}>
              A sentence is enough. You can always come back to this in your journal.
            </Text>
          </View>
          <Image
            source={GREMLY_JOURNAL}
            style={styles.mascotImage}
            resizeMode="contain"
            accessibilityLabel="Gremly journal mascot"
          />
        </View>

        {/* Intention text input */}
        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="This week I want to focus on..."
            placeholderTextColor={BRAND.colors.inkMuted}
            multiline
            value={intentionText}
            onChangeText={setIntentionText}
            textAlignVertical="top"
            autoFocus={false}
          />
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
          onPress={handleSetIntention}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <View style={styles.primaryButtonContent}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Saving...' : hasText ? 'Set intention' : 'Continue'}
            </Text>
            {!isSaving && (
              <Icon name="ArrowRight" size="sm" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip} disabled={isSaving}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — mirrors SweepMoodStep
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  headerText: {
    flex: 1,
  },
  mascotImage: {
    width: 86,
    height: 86,
    opacity: 0.9,
    marginLeft: 8,
    marginTop: -12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(191, 216, 192, 0.5)',
    letterSpacing: -0.3,
  },
  subcopy: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.75)',
    lineHeight: 22,
  },
  inputSection: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.30)',
    padding: 16,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    minHeight: 120,
    lineHeight: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.xl,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  skipButtonText: {
    color: 'rgba(34, 34, 34, 0.60)',
    fontSize: 15,
    fontWeight: '500',
  },
});
