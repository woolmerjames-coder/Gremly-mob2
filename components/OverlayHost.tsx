import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import NewSpaceModal from './NewSpaceModal';
import ManualAddSheet from './ManualAddSheet';

registerSheet('demo-sheet', ({ sheetId }) => {
  return (
    <ActionSheet id={sheetId}>
      <View style={styles.container}>
        <Text style={styles.title}>Hello from a Global Sheet</Text>
        <Text style={styles.description}>This will host Manual Add and Reviews later.</Text>
        <Pressable style={styles.button} onPress={() => SheetManager.hide('demo-sheet')}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </ActionSheet>
  );
});

// DEV-ONLY: Design System Preview Sheet (fallback)
registerSheet('ds-preview-sheet', ({ sheetId }) => {
  return (
    <ActionSheet
      id={sheetId}
      gestureEnabled
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        backgroundColor: '#FFF7EA',
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <DSPreview />
        </View>
      </ScrollView>
    </ActionSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#FFF7EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#0F4C5C',
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
    color: '#1A1A1A',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#0F4C5C',
  },
  buttonText: {
    color: '#FFF',
    textAlign: 'center',
    fontWeight: '600',
  },
});

export const OverlayHost = () => {
  // Must call hooks before any conditional returns
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Render the NewSpaceModal and ManualAddSheet components to make them available globally
  return (
    <>
      <NewSpaceModal />
      <ManualAddSheet />
      {/* DEV-ONLY: Floating debug button to access dev tools */}
      {__DEV__ && (
        <Pressable
          className="absolute bottom-6 right-6 w-12 h-12 rounded-full items-center justify-center bg-black/60 active:bg-black/80"
          onPress={() => navigation.navigate('DevLogin')}
          style={{
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
          }}
        >
          <Text className="text-white text-xs font-bold">DEV</Text>
        </Pressable>
      )}
    </>
  );
};
