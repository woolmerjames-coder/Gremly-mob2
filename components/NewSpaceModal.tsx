import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState } from 'react';
import { View, TextInput, Pressable, Text as RNText, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spaceInsertSchema } from '../lib/schemas';
import { useRepo } from '../providers/RepoProvider';
import type { Space } from '../lib/types';
import { Box, Text, Button, Chip } from '../ui';
import { useTokens } from '../design/makeStyles';

// Store callback in module scope
let onCreatedCallback: ((space: Space) => void) | null = null;

export function setNewSpaceCallback(callback: ((space: Space) => void) | null) {
  onCreatedCallback = callback;
}

/**
 * NewSpaceModal - Modal for creating a new Space
 * Simplified version that ensures form renders
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

      // Reset form after successful save
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

  const styles = StyleSheet.create({
    container: {
      padding: tokens.spacing[4],
      paddingBottom: (insets.bottom || 0) + tokens.spacing[4],
    },
    title: {
      fontSize: 24,
      fontWeight: '600',
      color: tokens.colors.text,
      marginBottom: tokens.spacing[4],
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: tokens.colors.text,
      marginBottom: tokens.spacing[2],
    },
    input: {
      height: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius[2],
      paddingHorizontal: tokens.spacing[3],
      fontSize: 16,
      backgroundColor: tokens.colors.surface,
      color: tokens.colors.text,
      marginBottom: tokens.spacing[4],
    },
    themeContainer: {
      marginBottom: tokens.spacing[4],
    },
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing[2],
    },
    error: {
      color: tokens.colors.danger,
      fontSize: 14,
      marginBottom: tokens.spacing[3],
    },
    button: {
      backgroundColor: canCreate ? tokens.colors.primary : tokens.colors.border,
      height: 48,
      borderRadius: tokens.radius[2],
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: tokens.spacing[4],
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <ActionSheet
      id="new-space"
      testID="new-space-overlay"
      gestureEnabled
      backgroundInteractionEnabled={false}
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
        {/* Title */}
        <RNText style={styles.title}>New Space</RNText>

        {/* Name Input */}
        <RNText style={styles.label}>Name</RNText>
        <TextInput
          testID="space-name"
          value={name}
          onChangeText={setName}
          placeholder="e.g., Fitness"
          placeholderTextColor={tokens.colors.subtle}
          style={styles.input}
        />

        {/* Icon Input */}
        <RNText style={styles.label}>Icon (optional)</RNText>
        <TextInput
          testID="space-icon"
          value={icon}
          onChangeText={setIcon}
          placeholder="e.g., 🏋️"
          placeholderTextColor={tokens.colors.subtle}
          style={styles.input}
        />

        {/* Theme Selection */}
        <View style={styles.themeContainer}>
          <RNText style={styles.label}>Theme</RNText>
          <Box row gap={2} style={{ flexWrap: 'wrap', marginTop: 8 }}>
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
        </View>

        {/* Error Message */}
        {error && <RNText style={styles.error}>{error}</RNText>}

        {/* Submit Button */}
        <Pressable
          testID="new-space-submit"
          onPress={onSave}
          disabled={!canCreate}
          style={styles.button}
        >
          <RNText style={styles.buttonText}>{saving ? 'Creating...' : 'Create Space'}</RNText>
        </Pressable>
      </View>
    </ActionSheet>
  );
}
