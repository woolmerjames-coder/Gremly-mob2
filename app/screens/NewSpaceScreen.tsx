import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spaceInsertSchema } from '../../lib/schemas';
import { useRepo } from '../../providers/RepoProvider';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export default function NewSpaceScreen() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [theme, setTheme] = useState<'deepTeal' | 'mint' | 'cream' | 'periwinkle'>('deepTeal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0 && !saving;

  async function onCreate() {
    if (!canCreate) return;
    try {
      setSaving(true);
      const payload = spaceInsertSchema.parse({
        name: name.trim(),
        icon: icon || undefined,
        theme,
      });
      const created = await repo.createSpace(payload);
      // Navigate straight to the detail page
      navigation.replace('SpaceDetail', { id: created.id });
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const Header = () => (
    <View
      className="flex-row items-center justify-between px-4"
      style={{ paddingTop: Math.max(insets.top, 8), paddingBottom: 8 }}
    >
      <Text className="text-2xl font-semibold">New Space</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={() => navigation.goBack()}
        className="px-3 py-2 rounded-2xl"
      >
        <Text className="text-deepTeal font-medium">Cancel</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <Header />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, position: 'relative' }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: (insets.bottom || 16) + 120,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-sm mb-1">Name</Text>
            <TextInput
              accessibilityLabel="Space name"
              value={name}
              onChangeText={setName}
              placeholder="e.g., Fitness"
              className="border border-gray-300 rounded-2xl px-3 py-3 mb-3 min-h-[48px] bg-white"
            />

            <Text className="text-sm mb-1">Icon (optional)</Text>
            <TextInput
              accessibilityLabel="Space icon"
              value={icon}
              onChangeText={setIcon}
              placeholder="e.g., dumbbell"
              className="border border-gray-300 rounded-2xl px-3 py-3 mb-3 min-h-[48px] bg-white"
            />

            <Text className="text-sm mb-1">Theme</Text>
            <View className="flex-row gap-2 mb-4">
              {(['deepTeal', 'mint', 'cream', 'periwinkle'] as const).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityLabel={`Theme ${t}`}
                  onPress={() => setTheme(t)}
                  className={`px-3 py-2 rounded-2xl border ${
                    theme === t ? 'border-black' : 'border-gray-300'
                  }`}
                >
                  <Text className="capitalize">{t}</Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text className="text-red-600 mb-3">{error}</Text> : null}
          </ScrollView>

          {/* Sticky Create */}
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: (insets.bottom || 16) + 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Space"
              disabled={!canCreate}
              onPress={onCreate}
              className={`${
                canCreate ? 'bg-deepTeal' : 'bg-gray-300'
              } rounded-2xl py-3 items-center min-h-[48px]`}
            >
              <Text className="text-white font-semibold text-lg">
                {saving ? 'Saving...' : 'Create Space'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
