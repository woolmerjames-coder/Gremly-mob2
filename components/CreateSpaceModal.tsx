import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Keyboard,
  ScrollView,
  LayoutAnimation,
  Platform,
  Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp, Calendar, X } from 'lucide-react-native';
import { useRepo } from '../providers/RepoProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useTokens } from '../design/makeStyles';
import { Input } from '../design-system/Input';
import { Button } from '../design-system/Button';
import { Text } from '../ui/Text';
import { Box } from '../ui/Box';
import { GremlyPicker } from './spaces/GremlyPicker';
import { getMascotSource } from '../lib/mascots/mascotConfig';
import type { Space } from '../lib/types';
import { getDateService } from '../lib/date';
import { format } from 'date-fns';

// Module-scope callback for navigation after creation
let onCreatedCallback: ((space: Space) => void) | null = null;

export function setCreateSpaceCallback(callback: ((space: Space) => void) | null) {
  onCreatedCallback = callback;
}

interface FormState {
  spaceName: string;
  gremlyAvatar: string; // e.g., 'astro', 'chef', 'artist'
  goalName: string;
  targetDate: Date | null;
  successCriteria: string;
  notes: string;
}

const initialFormState: FormState = {
  spaceName: '',
  gremlyAvatar: 'astro',
  goalName: '',
  targetDate: null,
  successCriteria: '',
  notes: '',
};

/**
 * CreateSpaceModal - Single-page Space creation with progressive disclosure
 *
 * Layout:
 * - Gremly avatar (tappable, placeholder picker)
 * - Name (required)
 * - Goal (optional)
 * - Target date (native picker)
 * - More details toggle (success criteria, notes)
 */
export default function CreateSpaceModal() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const storeCreateSpace = useGremlyStore((s) => s.createSpace);
  const storeCreateMilestone = useGremlyStore((s) => s.createMilestone);
  const tokens = useTokens();

  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGremlyPicker, setShowGremlyPicker] = useState(false);

  const canCreate = form.spaceName.trim().length > 0 && !saving;

  const resetForm = useCallback(() => {
    setForm(initialFormState);
    setError(null);
    setSaving(false);
    setShowMoreDetails(false);
    setShowDatePicker(false);
    setShowGremlyPicker(false);
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;

    setError(null);
    setSaving(true);
    Keyboard.dismiss();

    try {
      // 1. Create Space
      const space = await storeCreateSpace({
        name: form.spaceName.trim(),
        mascot_id: form.gremlyAvatar,
      });

      // Feed the gauge: space creation = 5% (Soul Document v8)
      useGremlyStore
        .getState()
        .trackSpaceCreate()
        .catch((err: unknown) => {
          console.warn('[CreateSpace] Space create gauge contribution failed:', err);
        });

      // 2. Create milestone if goal provided
      if (form.goalName.trim()) {
        const ds = getDateService();
        await storeCreateMilestone(space.id, {
          name: form.goalName.trim(),
          date: form.targetDate ? ds.toLocalDate(form.targetDate) : null,
        });
      }

      // 3. Create space_meta if details provided
      if (form.successCriteria.trim() || form.notes.trim()) {
        await repo.upsertSpaceMeta(space.id, {
          success_criteria: form.successCriteria.trim() || null,
          other_context: form.notes.trim() || null,
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
  }, [canCreate, form, repo, resetForm, storeCreateSpace, storeCreateMilestone]);

  const handleCancel = useCallback(() => {
    resetForm();
    SheetManager.hide('new-space');
  }, [resetForm]);

  const toggleMoreDetails = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMoreDetails((prev) => !prev);
  }, []);

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: tokens.spacing[4],
      paddingTop: tokens.spacing[4],
      paddingBottom: (insets.bottom || 0) + tokens.spacing[4],
    },
    title: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      color: tokens.colors.text,
      textAlign: 'center',
      marginBottom: tokens.spacing[4],
    },
    avatarContainer: {
      alignItems: 'center',
      marginBottom: tokens.spacing[4],
    },
    avatarImage: {
      width: 80,
      height: 80,
      borderRadius: 16,
      backgroundColor: tokens.colors.surface,
    },
    avatarHint: {
      fontSize: 13,
      marginTop: tokens.spacing[1],
      color: tokens.colors.subtle,
    },
    section: {
      marginBottom: tokens.spacing[4],
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      color: tokens.colors.text,
      marginBottom: tokens.spacing[2],
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tokens.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      paddingHorizontal: tokens.spacing[3],
      paddingVertical: tokens.spacing[3],
      gap: tokens.spacing[2],
    },
    dateText: {
      flex: 1,
      fontSize: 16,
      color: tokens.colors.text,
    },
    datePlaceholder: {
      color: tokens.colors.subtle,
    },
    datePickerContainer: {
      backgroundColor: tokens.colors.surface,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      marginTop: tokens.spacing[2],
      borderRadius: 12,
      overflow: 'hidden',
    },
    datePickerHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: tokens.spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.border,
    },
    moreDetailsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: tokens.spacing[2],
      gap: tokens.spacing[1],
    },
    moreDetailsText: {
      fontSize: 15,
      color: tokens.colors.primary,
      fontWeight: '500',
    },
    moreDetailsContent: {
      marginTop: tokens.spacing[2],
    },
    moreDetailsHint: {
      fontSize: 13,
      color: tokens.colors.subtle,
      marginTop: -tokens.spacing[1],
      marginBottom: tokens.spacing[2],
      marginLeft: tokens.spacing[6],
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

  return (
    <ActionSheet
      id="new-space"
      testID="create-space-modal"
      gestureEnabled
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
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <Text style={styles.title}>Create a Space</Text>

        {/* Gremly Avatar */}
        <Pressable style={styles.avatarContainer} onPress={() => setShowGremlyPicker(true)}>
          <Image
            source={getMascotSource(form.gremlyAvatar)}
            style={styles.avatarImage}
            resizeMode="contain"
          />
          <Text style={styles.avatarHint}>Tap to change</Text>
        </Pressable>

        {/* Gremly Picker Modal */}
        <GremlyPicker
          visible={showGremlyPicker}
          selectedId={form.gremlyAvatar}
          onSelect={(mascotId) => updateField('gremlyAvatar', mascotId)}
          onClose={() => setShowGremlyPicker(false)}
        />

        {/* Name (required) */}
        <View style={styles.section}>
          <Input
            testID="space-name-input"
            label="Name"
            value={form.spaceName}
            onChangeText={(text) => updateField('spaceName', text)}
            autoFocus
          />
        </View>

        {/* More Details Toggle */}
        <Pressable style={styles.moreDetailsToggle} onPress={toggleMoreDetails}>
          {showMoreDetails ? (
            <ChevronUp size={20} color={tokens.colors.primary} />
          ) : (
            <ChevronDown size={20} color={tokens.colors.primary} />
          )}
          <Text style={styles.moreDetailsText}>
            {showMoreDetails ? 'Less details' : 'Add more details'}
          </Text>
        </Pressable>

        {/* Helper text - only show when collapsed */}
        {!showMoreDetails && (
          <Text style={styles.moreDetailsHint}>Help Gremly give better advice</Text>
        )}

        {/* Collapsible Details Section */}
        {showMoreDetails && (
          <View style={styles.moreDetailsContent}>
            {/* Goal */}
            <Input
              testID="goal-name-input"
              label="Goal"
              value={form.goalName}
              onChangeText={(text) => updateField('goalName', text)}
            />

            <View style={{ height: tokens.spacing[3] }} />

            {/* Target Date */}
            <Text style={styles.label}>Target date</Text>
            <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Calendar size={20} color={tokens.colors.subtle} />
              <Text style={[styles.dateText, !form.targetDate && styles.datePlaceholder]}>
                {form.targetDate
                  ? format(form.targetDate, 'MMM d, yyyy')
                  : 'None set'}
              </Text>
              {form.targetDate && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    updateField('targetDate', null);
                  }}
                  hitSlop={8}
                >
                  <X size={18} color={tokens.colors.subtle} />
                </Pressable>
              )}
            </Pressable>

            {/* Date Picker */}
            {showDatePicker &&
              (Platform.OS === 'ios' ? (
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text style={{ color: tokens.colors.primary, fontWeight: '500' }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={form.targetDate || getDateService().now()}
                    mode="date"
                    display="spinner"
                    minimumDate={getDateService().now()}
                    onChange={(event, date) => {
                      if (date) updateField('targetDate', date);
                    }}
                  />
                </View>
              ) : (
                <DateTimePicker
                  value={form.targetDate || getDateService().now()}
                  mode="date"
                  display="default"
                  minimumDate={getDateService().now()}
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) updateField('targetDate', date);
                  }}
                />
              ))}

            <View style={{ height: tokens.spacing[3] }} />

            {/* Success Criteria */}
            <Input
              testID="success-criteria-input"
              label="What does success look like?"
              value={form.successCriteria}
              onChangeText={(text) => updateField('successCriteria', text)}
              multiline
            />

            <View style={{ height: tokens.spacing[3] }} />

            {/* Notes */}
            <Input
              testID="notes-input"
              label="Notes"
              value={form.notes}
              onChangeText={(text) => updateField('notes', text)}
              multiline
            />
          </View>
        )}

        {/* Error */}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Box flex={1}>
            <Button
              testID="cancel-button"
              label="Cancel"
              variant="ghost"
              onPress={handleCancel}
              fullWidth
            />
          </Box>
          <Box flex={1}>
            <Button
              testID="create-button"
              label="Create Space"
              variant="primary"
              onPress={handleCreate}
              disabled={!canCreate}
              isLoading={saving}
              fullWidth
            />
          </Box>
        </View>
      </ScrollView>
    </ActionSheet>
  );
}

// Re-export for backward compatibility
export { setCreateSpaceCallback as setNewSpaceCallback };
