import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import { Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import NewSpaceModal from './NewSpaceModal';
import ManualAddSheet from './ManualAddSheet';
import { Box, Text } from '../ui';

registerSheet('demo-sheet', ({ sheetId }) => {
  return (
    <ActionSheet id={sheetId}>
      <Box p={4} bg="surface">
        <Text variant="title">Hello from a Global Sheet</Text>
        <Text variant="body" style={{ marginBottom: 16 }}>
          This will host Manual Add and Reviews later.
        </Text>
        <Pressable style={styles.button} onPress={() => SheetManager.hide('demo-sheet')}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </Box>
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
        <Box px={4} pt={3}>
          <DSPreview />
        </Box>
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
  // Note: Both are already DS-migrated (C6), no legacy versions to conditionally load
  return (
    <>
      <NewSpaceModal />
      <ManualAddSheet />
      {/* DEV-ONLY: Floating debug button to access dev tools */}
      {__DEV__ && (
        <Pressable
          testID="dev-button"
          onPress={() => navigation.navigate('DevLogin')}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
          }}
        >
          <Text variant="label" style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>
            DEV
          </Text>
        </Pressable>
      )}
    </>
  );
};
