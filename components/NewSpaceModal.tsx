import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spaceInsertSchema } from '../lib/schemas';
import { useRepo } from '../providers/RepoProvider';
import type { Space } from '../lib/types';
import { Box, Text, Input, Button, Chip } from '../ui';
import { useTokens } from '../design/makeStyles';

// Store callback in module scope
let onCreatedCallback: ((space: Space) => void) | null = null;

export function setNewSpaceCallback(callback: ((space: Space) => void) | null) {
  onCreatedCallback = callback;
}

/**
 * NewSpaceModal - Modal for creating a new Space
 * Fixed version with proper spacing and layout
 */
export default function NewSpaceModal() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const tokens = useTokens();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [theme, setTheme] = useState<'deepTeal' | 'mint' | 'cream' | 'periwinkle'>('deepTeal');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canCreate = name.trim().length > 0 && !saving;

  async function onSave() {
    if (!canCreate) return;
    setError(null);
    try {
      const payloadInput = spaceInsertSchema.parse({
        name: name.trim(),
        icon: icon || undefined,
        theme,
      });
      setSaving(true);
      const created = await repo.createSpace(payloadInput);

      if (onCreatedCallback) {
        onCreatedCallback(created);
        onCreatedCallback = null;
      }

      // Reset form
      setName('');
      setIcon('');
      setTheme('deepTeal');
      setError(null);
      await SheetManager.hide('new-space');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Please check your inputs';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  // Reset form when sheet opens
  const handleSheetOpen = () => {
    setName('');
    setIcon('');
    setTheme('deepTeal');
    setError(null);
    setSaving(false);
  };

  return (
    <ActionSheet
      id="new-space"
      testID="new-space-overlay"
      gestureEnabled
      backgroundInteractionEnabled={false}
      onOpen={handleSheetOpen}
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: tokens.colors.bg,
        maxHeight: '80%',
      }}
      indicatorStyle={{
        backgroundColor: tokens.colors.border,
        width: 72,
        height: 5,
        borderRadius: 3,
        marginTop: 8,
        marginBottom: 8,
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{
              padding: tokens.spacing[4],
              paddingBottom: 100, // Space for the button
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Box mb={4}>
              <Text variant="title">New Space</Text>
            </Box>

            {/* Name Input */}
            <Box mb={4}>
              <Input
                label="Name"
                testID="space-name"
                value={name}
                onChangeText={setName}
                placeholder="e.g., Fitness"
              />
            </Box>

            {/* Icon Input */}
            <Box mb={4}>
              <Input
                label="Icon (optional)"
                testID="space-icon"
                value={icon}
                onChangeText={setIcon}
                placeholder="e.g., 🏋️"
              />
            </Box>

            {/* Theme Selection */}
            <Box mb={4}>
              <Box mb={2}>
                <Text variant="label">Theme</Text>
              </Box>
              <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                {(['deepTeal', 'mint', 'cream', 'periwinkle'] as const).map((t) => (
                  <Chip
                    key={t}
                    testID={`theme-${t}`}
                    label={t.charAt(0).toUpperCase() + t.slice(1)}
                    selected={theme === t}
                    onPress={() => setTheme(t)}
                  />
                ))}
              </Box>
            </Box>

            {/* Error Message */}
            {error && (
              <Box mb={3}>
                <Text variant="body" style={{ color: tokens.colors.danger }}>
                  {error}
                </Text>
              </Box>
            )}
          </ScrollView>

          {/* Fixed Footer Button */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: tokens.colors.bg,
              paddingHorizontal: tokens.spacing[4],
              paddingTop: tokens.spacing[3],
              paddingBottom: (insets.bottom || 0) + tokens.spacing[4],
              borderTopWidth: 1,
              borderTopColor: tokens.colors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 5,
            }}
          >
            <Button
              testID="new-space-submit"
              variant={canCreate ? 'primary' : 'neutral'}
              title={saving ? 'Creating...' : 'Create Space'}
              onPress={onSave}
              disabled={!canCreate}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ActionSheet>
  );
}
