import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag } from 'lucide-react-native';
import { useRepo } from '../providers/RepoProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useTokens } from '../design/makeStyles';
import { Input } from '../design-system/Input';
import { Button } from '../design-system/Button';
import { Text } from '../ui/Text';
import { Box } from '../ui/Box';
import type { Space, SpaceMilestone, SpaceMeta } from '../lib/types';

// Module-scope callback for navigation after creation
let onCreatedCallback: ((space: Space) => void) | null = null;

export function setCreateSpaceCallback(callback: ((space: Space) => void) | null) {
  onCreatedCallback = callback;
}

type Step = 'name-milestone' | 'enrichment';

interface FormState {
  // Step 1
  spaceName: string;
  milestoneName: string;
  // Step 2 (enrichment)
  milestoneDate: string;
  successCriteria: string;
  otherContext: string;
}

const initialFormState: FormState = {
  spaceName: '',
  milestoneName: '',
  milestoneDate: '',
  successCriteria: '',
  otherContext: '',
};

/**
 * CreateSpaceModal - 2-step Space creation flow
 *
 * Step 1: Space name (required) + Milestone (optional)
 * Step 2: Enrichment data (only if milestone was entered)
 *
 * Per spec: "Skip for now" creates Space without milestone (shows nudge)
 */
export default function CreateSpaceModal() {
  const insets = useSafeAreaInsets();
  const repo = useRepo(); // Keep for upsertSpaceMeta until migrated
  const storeCreateSpace = useGremlyStore((s) => s.createSpace);
  const storeCreateMilestone = useGremlyStore((s) => s.createMilestone);
  const tokens = useTokens();

  const [step, setStep] = useState<Step>('name-milestone');
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Validation
  const canContinue = form.spaceName.trim().length > 0 && !saving;
  const hasMilestone = form.milestoneName.trim().length > 0;

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setStep('name-milestone');
    setForm(initialFormState);
    setError(null);
    setSaving(false);
  }, []);

  // Create Space (and optionally milestone + meta)
  const createSpace = useCallback(
    async (includeMilestone: boolean, includeEnrichment: boolean) => {
      if (!canContinue) return;

      setError(null);
      setSaving(true);
      Keyboard.dismiss();

      try {
        // 1. Create the Space using Zustand store
        const space = await storeCreateSpace({
          name: form.spaceName.trim(),
        });

        // 2. Create milestone if provided using Zustand store
        if (includeMilestone && form.milestoneName.trim()) {
          await storeCreateMilestone(space.id, {
            name: form.milestoneName.trim(),
            date: form.milestoneDate || null,
          });
        }

        // 3. Create space_meta if enrichment provided (still uses repo)
        if (includeEnrichment && (form.successCriteria.trim() || form.otherContext.trim())) {
          await repo.upsertSpaceMeta(space.id, {
            success_criteria: form.successCriteria.trim() || null,
            other_context: form.otherContext.trim() || null,
          });
        }

        // 4. Callback and cleanup
        if (onCreatedCallback) {
          onCreatedCallback(space);
          onCreatedCallback = null;
        }

        resetForm();
        await SheetManager.hide('new-space');
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Something went wrong';
        setError(errorMessage);
      } finally {
        setSaving(false);
      }
    },
    [canContinue, form, repo, resetForm],
  );

  // Handle "Skip for now" - create Space without milestone
  const handleSkip = useCallback(() => {
    createSpace(false, false);
  }, [createSpace]);

  // Handle "Continue" from Step 1
  const handleContinue = useCallback(() => {
    if (hasMilestone) {
      // Has milestone → go to Step 2 for enrichment
      setStep('enrichment');
    } else {
      // No milestone → create Space directly (will show nudge)
      createSpace(false, false);
    }
  }, [hasMilestone, createSpace]);

  // Handle "Skip" from Step 2 - create with milestone but no enrichment
  const handleSkipEnrichment = useCallback(() => {
    createSpace(true, false);
  }, [createSpace]);

  // Handle "Save & Start" from Step 2 - create with everything
  const handleSaveAndStart = useCallback(() => {
    createSpace(true, true);
  }, [createSpace]);

  // Handle back from Step 2 to Step 1
  const handleBack = useCallback(() => {
    setStep('name-milestone');
  }, []);

  // Update form field
  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const styles = StyleSheet.create({
    container: {
      padding: tokens.spacing[4],
      paddingBottom: (insets.bottom || 0) + tokens.spacing[4],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: tokens.spacing[4],
    },
    title: {
      fontSize: 24,
      fontWeight: '600',
      color: tokens.colors.text,
      flex: 1,
    },
    stepIndicator: {
      fontSize: 14,
      color: tokens.colors.subtle,
    },
    section: {
      marginBottom: tokens.spacing[4],
    },
    milestoneHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing[2],
      marginTop: tokens.spacing[1],
    },
    buttonRow: {
      flexDirection: 'row',
      gap: tokens.spacing[3],
      marginTop: tokens.spacing[4],
    },
    error: {
      color: tokens.colors.danger,
      fontSize: 14,
      marginBottom: tokens.spacing[3],
    },
  });

  // Render Step 1: Name + Milestone
  const renderStep1 = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Create a Space</Text>
      </View>

      {/* Space Name - Required */}
      <View style={styles.section}>
        <Input
          testID="space-name-input"
          label="What do you want to call this Space?"
          placeholder="e.g., Honeymoon, Fitness, Side Project"
          value={form.spaceName}
          onChangeText={(text) => updateField('spaceName', text)}
          autoFocus
        />
      </View>

      {/* Milestone - Optional */}
      <View style={styles.section}>
        <Input
          testID="milestone-name-input"
          label="What are you working toward?"
          placeholder="e.g., Trip to Japan, Run a 5K"
          value={form.milestoneName}
          onChangeText={(text) => updateField('milestoneName', text)}
          helperText="Optional - you can add this later"
        />
        <View style={styles.milestoneHint}>
          <Flag size={14} color={tokens.colors.subtle} />
          <Text variant="subtle" style={{ fontSize: 13 }}>
            Goals help you stay focused and celebrate wins
          </Text>
        </View>
      </View>

      {/* Error */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Box flex={1}>
          <Button
            testID="skip-button"
            label="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            disabled={!canContinue}
            fullWidth
          />
        </Box>
        <Box flex={1}>
          <Button
            testID="continue-button"
            label="Continue"
            variant="primary"
            onPress={handleContinue}
            disabled={!canContinue}
            isLoading={saving}
            fullWidth
          />
        </Box>
      </View>
    </>
  );

  // Render Step 2: Enrichment
  const renderStep2 = () => (
    <>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <Text style={{ color: tokens.colors.primary, marginRight: tokens.spacing[2] }}>
            ← Back
          </Text>
        </Pressable>
        <Text style={styles.title}>Help Gremly help you</Text>
      </View>

      <Text variant="subtle" style={{ marginBottom: tokens.spacing[4] }}>
        Optional details that help Gremly give better advice. You can edit these anytime in
        settings.
      </Text>

      {/* Milestone Date */}
      <View style={styles.section}>
        <Input
          testID="milestone-date-input"
          label="When is this happening?"
          placeholder="YYYY-MM-DD (e.g., 2025-06-15)"
          value={form.milestoneDate}
          onChangeText={(text) => updateField('milestoneDate', text)}
          helperText="Leave blank if there's no deadline"
        />
      </View>

      {/* Success Criteria */}
      <View style={styles.section}>
        <Input
          testID="success-criteria-input"
          label="What does success look like?"
          placeholder="e.g., Relaxed trip, no rushing around"
          value={form.successCriteria}
          onChangeText={(text) => updateField('successCriteria', text)}
          multiline
        />
      </View>

      {/* Other Context */}
      <View style={styles.section}>
        <Input
          testID="other-context-input"
          label="Anything else Gremly should know?"
          placeholder="e.g., Wife prefers quiet spots, I want to see temples"
          value={form.otherContext}
          onChangeText={(text) => updateField('otherContext', text)}
          multiline
        />
      </View>

      {/* Error */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Box flex={1}>
          <Button
            testID="skip-enrichment-button"
            label="Skip for now"
            variant="ghost"
            onPress={handleSkipEnrichment}
            disabled={saving}
            fullWidth
          />
        </Box>
        <Box flex={1}>
          <Button
            testID="save-start-button"
            label="Save & Start"
            variant="primary"
            onPress={handleSaveAndStart}
            disabled={saving}
            isLoading={saving}
            fullWidth
          />
        </Box>
      </View>
    </>
  );

  return (
    <ActionSheet
      id="new-space"
      testID="create-space-modal"
      gestureEnabled={step === 'name-milestone'}
      backgroundInteractionEnabled={false}
      onClose={resetForm}
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: tokens.colors.bg,
      }}
      indicatorStyle={{
        backgroundColor: tokens.colors.border,
        width: 72,
        height: 5,
        borderRadius: 3,
      }}
    >
      <View style={styles.container}>
        {step === 'name-milestone' ? renderStep1() : renderStep2()}
      </View>
    </ActionSheet>
  );
}

// Re-export for backward compatibility
export { setCreateSpaceCallback as setNewSpaceCallback };
