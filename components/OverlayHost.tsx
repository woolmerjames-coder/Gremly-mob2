import { useEffect, useState } from 'react';
import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import { Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import NewSpaceModal from './NewSpaceModal';
import { Box, Text, Button } from '../ui';
import { lightTokens } from '../design/tokens';
import { useRepo } from '../providers/RepoProvider';
import type { AppRecord, Space } from '../lib/types';

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

type MoveItemPayload = {
  itemId: string;
  itemType: AppRecord['type'];
};

registerSheet('move-item', ({ payload, sheetId }) => {
  return <MoveItemSheet payload={payload as MoveItemPayload | undefined} sheetId={sheetId} />;
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
        backgroundColor: lightTokens.colors.bg,
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
    backgroundColor: lightTokens.colors.bg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: lightTokens.colors.primary,
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
    color: lightTokens.colors.text,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: lightTokens.colors.primary,
  },
  buttonText: {
    color: lightTokens.colors.onPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
});

type MoveItemSheetProps = {
  payload?: MoveItemPayload;
  sheetId: string;
};

const MoveItemSheet = ({ payload, sheetId }: MoveItemSheetProps) => {
  const repo = useRepo();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const itemId = payload?.itemId;
  const itemType = payload?.itemType;

  useEffect(() => {
    let isMounted = true;
    repo
      .listSpaces()
      .then((result) => {
        if (isMounted) setSpaces(result);
      })
      .catch((err) => {
        console.error('[MoveItemSheet] Failed to load spaces', err);
      });
    return () => {
      isMounted = false;
    };
  }, [repo]);

  const moveTo = async (spaceId: string) => {
    if (!itemId || !itemType) return;
    try {
      await repo.update({ id: itemId, patch: { space_id: spaceId, ai_placed: false } });
      await SheetManager.hide(sheetId);
      console.log('[MoveItem] Moved item', itemId, 'to', spaceId);
    } catch (err) {
      console.error('[MoveItemSheet] Move failed', err);
    }
  };

  return (
    <ActionSheet id={sheetId} gestureEnabled>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text variant="title">Move to Space</Text>
        <Box gap={2} mt={2}>
          {spaces.map((sp) => (
            <Button
              key={sp.id}
              title={sp.name}
              variant="neutral"
              size="md"
              onPress={() => moveTo(sp.id)}
              accessibilityLabel={`Move item to ${sp.name}`}
              testID={`move-space-${sp.id}`}
            />
          ))}
          {spaces.length === 0 && (
            <Text variant="body" style={{ marginTop: 8 }}>
              No spaces available yet.
            </Text>
          )}
        </Box>
      </ScrollView>
    </ActionSheet>
  );
};

export const OverlayHost = () => {
  // Must call hooks before any conditional returns
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Render global modals
  // Note: ManualAddOverlay is now managed locally in each screen
  return (
    <>
      <NewSpaceModal />
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
