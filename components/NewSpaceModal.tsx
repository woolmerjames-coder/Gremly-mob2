import React, { useState } from 'react';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spaceInsertSchema } from '../lib/schemas';
import { useRepo } from '../providers/RepoProvider';

// Store callback in module scope (simpler than fighting with types)
let onCreatedCallback: ((space: any) => void) | null = null;

export function setNewSpaceCallback(callback: ((space: any) => void) | null) {
  onCreatedCallback = callback;
}

/**
 * NewSpaceModal - Modal for creating a new Space
 * Phase 5: Form with name (required), icon (optional), theme (optional)
 * UX: Keyboard-safe sticky footer, disabled button until valid
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
      const error = e as Error;
      setError(error?.message ?? 'Please check your inputs');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionSheet
      id="new-space"
      gestureEnabled
      containerStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%' }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingBottom: (insets.bottom || 16) + 96,
            }}
          >
            <Text className="text-lg font-semibold mb-3">New Space</Text>

            <Text className="text-sm mb-1">Name</Text>
            <TextInput
              accessibilityLabel="Space name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Fitness"
              className="border border-gray-300 rounded-2xl px-3 py-3 mb-3 bg-white"
              style={{ minHeight: 44 }}
            />

            <Text className="text-sm mb-1">Icon (optional)</Text>
            <TextInput
              accessibilityLabel="Space icon"
              value={icon}
              onChangeText={setIcon}
              placeholder="e.g., dumbbell"
              className="border border-gray-300 rounded-2xl px-3 py-3 mb-3 bg-white"
              style={{ minHeight: 44 }}
            />

            <Text className="text-sm mb-1">Theme</Text>
            <View className="flex-row gap-2 mb-4">
              {(['deepTeal', 'mint', 'cream', 'periwinkle'] as const).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  onPress={() => setTheme(t)}
                  className={`px-3 py-2 rounded-2xl border ${
                    theme === t ? 'border-black bg-gray-100' : 'border-gray-300 bg-white'
                  }`}
                >
                  <Text className="capitalize">{t}</Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text className="text-red-600 mb-3">{error}</Text> : null}
          </ScrollView>

          {/* Sticky footer button */}
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: (insets.bottom || 16) + 16,
            }}
          >
            <Pressable
              testID="create-space"
              accessibilityRole="button"
              accessibilityLabel="Create Space"
              disabled={!canCreate}
              onPress={onSave}
              className={`${
                canCreate ? 'bg-deepTeal' : 'bg-gray-300'
              } rounded-2xl py-3 items-center`}
              style={{ minHeight: 44 }}
            >
              <Text className="text-white font-semibold">
                {saving ? 'Saving...' : 'Create Space'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ActionSheet>
  );
}
