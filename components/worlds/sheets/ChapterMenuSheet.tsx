import { Pressable, View, StyleSheet } from 'react-native';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';

interface ChapterMenuPayload {
  chapterId: string;
}

interface ChapterMenuSheetProps {
  sheetId: string;
  payload?: ChapterMenuPayload;
}

export default function ChapterMenuSheet({ sheetId, payload }: ChapterMenuSheetProps) {
  const chapterId = payload?.chapterId ?? '';
  const close = () => SheetManager.hide(sheetId);

  const onRename = () => {
    console.log('[ChapterMenu] rename', chapterId);
    close();
  };
  const onClose = () => {
    console.log('[ChapterMenu] close chapter', chapterId);
    close();
  };
  const onArchive = () => {
    console.log('[ChapterMenu] archive', chapterId);
    close();
  };

  return (
    <ActionSheet id={sheetId} containerStyle={styles.container}>
      <View style={styles.handle} />
      <View style={styles.menu}>
        <Pressable onPress={onRename} style={styles.item}>
          <Text style={styles.itemText}>Rename chapter</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.item}>
          <Text style={styles.itemText}>Close chapter</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable onPress={onArchive} style={styles.item}>
          <Text style={[styles.itemText, styles.itemDanger]}>Archive chapter</Text>
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
  menu: {
    paddingHorizontal: 16,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemText: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '500',
    color: lightTokens.colors.worldsInk,
  },
  itemDanger: {
    color: lightTokens.colors.danger,
  },
  divider: {
    height: 1,
    backgroundColor: lightTokens.colors.worldsCardBorder,
    marginVertical: 4,
  },
});
