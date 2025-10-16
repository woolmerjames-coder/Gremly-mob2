import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../../design-system';
import { Screen } from '../../ui';
import NWCheck from '../../components/NWCheck';
import PlusFAB from '../../components/PlusFAB';
import { openManualAdd } from '../../components/ManualAddSheet';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TodayScreen() {
  const navigation = useNavigation<NavigationProp>();

  const openPreview = () => {
    try {
      // Prefer Stack modal route
      navigation.navigate('DSPreview');
    } catch {
      // Fallback to sheet if route not available
      console.log('Stack route not available, using sheet fallback');
      SheetManager.show('ds-preview-sheet');
    }
  };

  return (
    <Screen title="Today" scroll testID="screen-today">
      {/* TEMP: NativeWind diagnostic — remove after validation */}
      <NWCheck />
      {/* DEV-ONLY: Design System Preview Button */}
      {__DEV__ && (
        <View className="mb-4">
          <Button
            testID="btn-open-ds-preview"
            label="🎨 Open Design System Preview"
            variant="secondary"
            size="sm"
            onPress={openPreview}
          />
        </View>
      )}

      <Text className="text-base text-text-primary mb-6">
        Habits Today → Due Today → Might be today?
      </Text>

      <Pressable
        style={styles.button}
        onPress={async () => {
          console.log('Opening demo sheet…');
          await SheetManager.show('demo-sheet');
        }}
      >
        <Text style={styles.buttonText}>Open Demo Sheet</Text>
      </Pressable>

      {/* Plus FAB for Manual Add */}
      <PlusFAB onPress={() => openManualAdd()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#86E5C2',
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
  },
});
