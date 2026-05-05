import { Pressable, View, StyleSheet } from 'react-native';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';

interface WorldMenuPayload {
  worldId: string;
}

interface WorldMenuSheetProps {
  sheetId: string;
  payload?: WorldMenuPayload;
}

export default function WorldMenuSheet({ sheetId, payload }: WorldMenuSheetProps) {
  const worldId = payload?.worldId ?? '';
  const close = () => SheetManager.hide(sheetId);

  const onAddChapter = () => {
    console.log('[WorldMenu] add chapter', worldId);
    close();
  };
  const onRename = () => {
    console.log('[WorldMenu] rename', worldId);
    close();
  };
  const onMerge = () => {
    console.log('[WorldMenu] merge', worldId);
    close();
  };
  const onHistory = () => {
    console.log('[WorldMenu] history', worldId);
    close();
  };
  const onArchive = () => {
    console.log('[WorldMenu] archive', worldId);
    close();
  };

  return (
    <ActionSheet id={sheetId} containerStyle={styles.container}>
      <View style={styles.handle} />
      <View style={styles.menu}>
        <Pressable onPress={onAddChapter} style={styles.item}>
          <Text style={styles.itemText}>Add a chapter</Text>
        </Pressable>
        <Pressable onPress={onRename} style={styles.item}>
          <Text style={styles.itemText}>Rename world</Text>
        </Pressable>
        <Pressable onPress={onMerge} style={styles.item}>
          <Text style={styles.itemText}>Merge with another world</Text>
        </Pressable>
        <Pressable onPress={onHistory} style={styles.item}>
          <Text style={styles.itemText}>World history</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable onPress={onArchive} style={styles.item}>
          <Text style={[styles.itemText, styles.itemDanger]}>Archive world</Text>
        </Pressable>
      </View>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightTokens.colors.oatCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.worldsInkOutline,
    marginBottom: 14,
  },
  menu: { paddingHorizontal: 8 },
  item: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10 },
  itemText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  itemDanger: { color: lightTokens.colors.danger },
  divider: {
    height: 1,
    backgroundColor: lightTokens.colors.oatCardBorder,
    marginVertical: 6,
    marginHorizontal: 14,
  },
});
