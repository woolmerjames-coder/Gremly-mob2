import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spaceInsertSchema } from '../lib/schemas';
import { useRepo } from '../providers/RepoProvider';
import type { Space } from '../lib/types';
import { Box, Text, Input, Button, Chip } from '../ui';
import { useTokens } from '../design/makeStyles';

// Store callback in module scope (simpler than fighting with payload types)
let onCreatedCallback: ((space: Space) => void) | null = null;

export function setNewSpaceCallback(callback: ((space: Space) => void) | null) {
  onCreatedCallback = callback;
}

/**
 * NewSpaceModal - Modal for creating a new Space
 * Phase 5: Form with name (required), icon (optional), theme (optional)
 * UX: Keyboard-safe sticky footer, disabled button until valid, proper overlay
 */
export default function NewSpaceModal() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();

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
      // Call the callback
      if (onCreatedCallback) {
        onCreatedCallback(created);
        onCreatedCallback = null; // Clear after use
      }
      // Reset form
      setName('');
      setIcon('');
      setTheme('deepTeal');
      await SheetManager.hide('new-space');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Please check your inputs';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  const tokens = useTokens();

  return (
    <ActionSheet
      id="new-space"
      testID="new-space-overlay"
      gestureEnabled
      backgroundInteractionEnabled={false}
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
        backgroundColor: tokens.colors.bg,
      }}
      indicatorStyle={{
        backgroundColor: tokens.colors.border,
        width: 72,
        height: 5,
        borderRadius: 3,
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* IMPORTANT: parent must be relative + full height so footer can stick to bottom */}
        <Box style={{ flex: 1, position: 'relative', backgroundColor: 'transparent' }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: tokens.spacing[4],
              paddingBottom: (insets.bottom || tokens.spacing[4]) + 120,
              backgroundColor: 'transparent',
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="title" style={{ marginBottom: tokens.spacing[3] }}>
              New Space
            </Text>

            <Input
              label="Name"
              testID="space-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Fitness"
            />

            <Input
              label="Icon (optional)"
              testID="space-icon"
              value={icon}
              onChangeText={setIcon}
              placeholder="e.g., 🏋️"
            />

            <Box mb={1}>
              <Text variant="label" style={{ marginBottom: tokens.spacing[2] }}>
                Theme
              </Text>
              <Box row gap={2}>
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

            {error ? (
              <Text
                variant="body"
                style={{ color: tokens.colors.danger, marginBottom: tokens.spacing[3] }}
              >
                {error}
              </Text>
            ) : null}
          </ScrollView>

          {/* Sticky footer button — ALWAYS visible at bottom */}
          <Box
            style={{
              position: 'absolute',
              left: tokens.spacing[4],
              right: tokens.spacing[4],
              bottom: (insets.bottom || tokens.spacing[4]) + tokens.spacing[4],
            }}
          >
            <Button
              testID="new-space-submit"
              variant={canCreate ? 'primary' : 'neutral'}
              title={saving ? 'Saving...' : 'Create Space'}
              onPress={onSave}
              disabled={!canCreate}
            />
          </Box>
        </Box>
      </KeyboardAvoidingView>
    </ActionSheet>
  );
}
