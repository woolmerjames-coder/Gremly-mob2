import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { useState } from 'react';
import { View, TextInput, Pressable, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spaceInsertSchema } from '../lib/schemas';
import { useRepo } from '../providers/RepoProvider';
import type { Space } from '../lib/types';
import { Text, Input, Button, Chip } from '../ui';
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
  const [usePlain, setUsePlain] = useState(false);

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
        backgroundColor: tokens.colors.surface,
      }}
      indicatorStyle={{
        backgroundColor: tokens.colors.border,
        width: 72,
        height: 5,
        borderRadius: 3,
      }}
    >
      <View style={{ flex: 1, padding: 16, paddingBottom: insets.bottom + 16 + 80 }}>
        {/* Debug toggle removed to satisfy eslint (no-constant-binary-expression). */}

        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          {!usePlain ? (
            <>
              <Text variant="title" style={{ marginBottom: 16 }}>
                New Space
              </Text>

              <View style={{ width: '100%', marginBottom: 16 }}>
                <Input
                  label="Name"
                  testID="space-name"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Fitness"
                />
              </View>

              <View style={{ width: '100%', marginBottom: 16 }}>
                <Input
                  label="Icon (optional)"
                  testID="space-icon"
                  value={icon}
                  onChangeText={setIcon}
                  placeholder="e.g., 🏋️"
                />
              </View>

              <View style={{ width: '100%', marginTop: 8, marginBottom: 16 }}>
                <Text variant="label" style={{ marginBottom: 8 }}>
                  Theme
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(['deepTeal', 'mint', 'cream', 'periwinkle'] as const).map((t) => (
                    <View key={t} style={{ marginRight: 8, marginBottom: 8 }}>
                      <Chip
                        testID={`theme-${t}`}
                        label={t.charAt(0).toUpperCase() + t.slice(1)}
                        selected={theme === t}
                        onPress={() => setTheme(t)}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {error ? (
                <Text variant="body" style={{ color: tokens.colors.danger, marginBottom: 16 }}>
                  {error}
                </Text>
              ) : null}

              <View style={{ height: 12 }} />

              <View style={{ width: '100%' }}>
                <Button
                  testID="new-space-submit"
                  variant={canCreate ? 'primary' : 'neutral'}
                  title={saving ? 'Saving...' : 'Create Space'}
                  onPress={onSave}
                  disabled={!canCreate}
                />
              </View>
            </>
          ) : (
            <>
              <RNText style={{ fontSize: 20, fontWeight: '600', marginBottom: 16 }}>
                New Space
              </RNText>
              <RNText style={{ marginBottom: 8 }}>Name</RNText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Fitness"
                style={{
                  height: 44,
                  borderWidth: 1,
                  borderColor: '#DDD',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  marginBottom: 16,
                  width: '100%',
                }}
              />
              <RNText style={{ marginBottom: 8 }}>Icon (optional)</RNText>
              <TextInput
                value={icon}
                onChangeText={setIcon}
                placeholder="e.g., 🏋️"
                style={{
                  height: 44,
                  borderWidth: 1,
                  borderColor: '#DDD',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  marginBottom: 16,
                  width: '100%',
                }}
              />
              <RNText style={{ marginBottom: 8 }}>Theme</RNText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
                {(['deepTeal', 'mint', 'cream', 'periwinkle'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTheme(t)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: theme === t ? '#0D3B3A' : '#E7E2D9',
                      backgroundColor: theme === t ? '#0D3B3A' : '#FFFFFF',
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <RNText style={{ color: theme === t ? '#FFFFFF' : '#0E1116' }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </RNText>
                  </Pressable>
                ))}
              </View>
              {error ? (
                <RNText style={{ color: '#E25555', marginBottom: 16 }}>{error}</RNText>
              ) : null}
              <Pressable
                onPress={onSave}
                disabled={!canCreate}
                style={{
                  height: 44,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canCreate ? '#0D3B3A' : '#EEE',
                  width: '100%',
                }}
              >
                <RNText style={{ color: canCreate ? '#FFF' : '#999', fontWeight: '600' }}>
                  {saving ? 'Saving...' : 'Create Space'}
                </RNText>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </ActionSheet>
  );
}
