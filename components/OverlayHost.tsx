import * as React from 'react';
import ActionSheet, { SheetManager, registerSheet } from 'react-native-actions-sheet';
import { Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import DSPreview from '../app/(dev)/DSPreview';
import NewSpaceModal from './NewSpaceModal';
// ManualAddOverlay import removed - replaced with UnifiedCreateOverlay in individual screens
import { Box, Text, Button } from '../ui';
import { lightTokens } from '../design/tokens';
import { useRepo } from '../providers/RepoProvider';
import type { AppRecord, NoteSubtype, Space, Note, Habit, Todo } from '../lib/types';
import { ActivityLog, type ActivityEvent } from '../lib/activityLog';

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

type DestinationPickerPayload = {
  itemId: string;
  itemType: AppRecord['type'];
  itemSubtype?: NoteSubtype;
  itemTitle?: string;
  origin?: AppRecord['origin'];
};

registerSheet(
  'destination-picker',
  ({ sheetId, payload }: { sheetId: string; payload: DestinationPickerPayload }) => (
    <DestinationPickerSheet sheetId={sheetId} payload={payload} />
  ),
);

// DEV-ONLY: Design System Preview Sheet (fallback)
registerSheet('ds-preview-sheet', ({ sheetId }: { sheetId: string }) => {
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
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

function DestinationPickerSheet({
  sheetId,
  payload,
}: {
  sheetId: string;
  payload: DestinationPickerPayload;
}) {
  const repo = useRepo();
  const [spaces, setSpaces] = React.useState<Space[]>([]);
  const { itemId, itemType, itemSubtype, origin } = payload;

  React.useEffect(() => {
    let isMounted = true;
    repo
      .listSpaces()
      .then((result) => {
        if (isMounted) setSpaces(result);
      })
      .catch((err) => {
        console.error('[DestinationPickerSheet] Failed to load spaces', err);
      });
    return () => {
      isMounted = false;
    };
  }, [repo]);

  function fallbackTitle(item: Partial<AppRecord>): string {
    if (item.title && item.title.trim()) return item.title.trim();
    if (item.type === 'note' && (item as Note).body) {
      const line =
        ((item as Note).body ?? '')
          .split('\n')
          .map((segment) => segment.trim())
          .find(Boolean) ?? '';
      if (line.length) {
        return line.length > 60 ? `${line.slice(0, 57)}…` : line;
      }
    }
    return 'Untitled';
  }

  async function moveToDestination(
    destination: 'habit' | 'todo' | 'journal' | 'list',
  ): Promise<void> {
    if (!itemId) return;

    try {
      const currentItem = await repo.getById(itemId);
      if (!currentItem) {
        console.error('[DestinationPickerSheet] Item not found:', itemId);
        return;
      }

      const title = fallbackTitle(currentItem);

      // Route based on destination
      if (destination === 'habit') {
        if (itemType !== 'habit') {
          // Create new habit, archive original
          await repo.create({
            type: 'habit',
            title,
            frequency: (currentItem as Habit).frequency ?? 'daily',
            origin: origin ?? 'catchall',
          });
          await repo.update({ id: itemId, patch: { archived: true, ai_placed: false } });
        }
      } else if (destination === 'todo') {
        if (itemType !== 'todo') {
          // Create new todo, archive original
          await repo.create({
            type: 'todo',
            title,
            body: (currentItem as Todo).body ?? undefined,
            due_date: (currentItem as Todo).due_date ?? null,
            undefined_due: false,
            origin: origin ?? 'catchall',
          });
          await repo.update({ id: itemId, patch: { archived: true, ai_placed: false } });
        }
      } else if (destination === 'journal') {
        if (itemType === 'note' && itemSubtype !== 'journal') {
          // Update existing note to journal subtype
          await repo.update({
            id: itemId,
            patch: { subtype: 'journal', ai_placed: false } as Partial<Note>,
          });
        } else if (itemType !== 'note') {
          // Create new journal note, archive original
          await repo.create({
            type: 'note',
            title,
            body: (currentItem as Note).body ?? undefined,
            subtype: 'journal',
            origin: origin ?? 'catchall',
          });
          await repo.update({ id: itemId, patch: { archived: true, ai_placed: false } });
        }
      } else if (destination === 'list') {
        if (itemType === 'note' && itemSubtype !== 'list') {
          // Update existing note to list subtype
          await repo.update({
            id: itemId,
            patch: { subtype: 'list', ai_placed: false } as Partial<Note>,
          });
        } else if (itemType !== 'note') {
          // Create new list note, archive original
          await repo.create({
            type: 'note',
            title,
            body: (currentItem as Note).body ?? undefined,
            subtype: 'list',
            origin: origin ?? 'catchall',
          });
          await repo.update({ id: itemId, patch: { archived: true, ai_placed: false } });
        }
      }

      // Log if from catch-all
      if (origin === 'catchall') {
        const destKey =
          destination === 'habit'
            ? 'habit'
            : destination === 'todo'
              ? 'todo'
              : destination === 'journal'
                ? 'note:journal'
                : ('note:list' as ActivityEvent['destination']);
        ActivityLog.recordCatchAllMove({
          itemId,
          destination: destKey,
          itemTitle: title,
        });
      }

      console.log(`[DestinationPickerSheet] Moved to ${destination}`);
      await SheetManager.hide(sheetId);
    } catch (e) {
      console.error('[DestinationPickerSheet] Move failed', e);
    }
  }

  async function moveToSpace(spaceId: string): Promise<void> {
    if (!itemId) return;
    try {
      await repo.update({ id: itemId, patch: { space_id: spaceId, ai_placed: false } });
      if (origin === 'catchall') {
        ActivityLog.recordCatchAllMove({
          itemId,
          destination: 'space',
          itemTitle: payload.itemTitle,
        });
      }
      console.log('[DestinationPickerSheet] Moved to space:', spaceId);
      await SheetManager.hide(sheetId);
    } catch (e) {
      console.error('[DestinationPickerSheet] Move to space failed', e);
    }
  }

  return (
    <ActionSheet id={sheetId} gestureEnabled>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text variant="title" style={{ marginBottom: 16 }}>
          Move to…
        </Text>

        <Box gap={2}>
          <Button
            title="Habit"
            variant="neutral"
            size="md"
            testID="dest-habit"
            onPress={() => moveToDestination('habit')}
          />
          <Button
            title="To-Do"
            variant="neutral"
            size="md"
            testID="dest-todo"
            onPress={() => moveToDestination('todo')}
          />
          <Button
            title="Journal"
            variant="neutral"
            size="md"
            testID="dest-journal"
            onPress={() => moveToDestination('journal')}
          />
          <Button
            title="List"
            variant="neutral"
            size="md"
            testID="dest-list"
            onPress={() => moveToDestination('list')}
          />
        </Box>

        {spaces.length > 0 && (
          <>
            <Text variant="label" style={{ marginTop: 24, marginBottom: 8 }}>
              Or place in a Space
            </Text>
            <Box gap={2}>
              {spaces.map((sp: Space) => (
                <Button
                  key={sp.id}
                  title={sp.name}
                  variant="neutral"
                  size="md"
                  testID={`dest-space-${sp.id}`}
                  onPress={() => moveToSpace(sp.id)}
                />
              ))}
            </Box>
          </>
        )}
      </ScrollView>
    </ActionSheet>
  );
}

/**
 * DEPRECATED: manual-edit sheet registration removed
 * All create/edit flows now use UnifiedCreateOverlay managed locally in each screen
 * via useUnifiedOverlayController hook.
 *
 * Previous usage in HubScreen has been migrated to:
 * overlayController.openEdit({ record, spaceId })
 */

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
