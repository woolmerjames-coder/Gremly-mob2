import { Pressable, View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface WorldActionButtonsProps {
  worldName: string;
  onAddPress: () => void;
  onChatPress: () => void;
}

export function WorldActionButtons({
  worldName,
  onAddPress,
  onChatPress,
}: WorldActionButtonsProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onAddPress} style={styles.btnOutlined} testID="world-add-btn">
        <Text style={styles.btnOutlinedText}>+ Add to {worldName}</Text>
      </Pressable>
      <Pressable onPress={onChatPress} style={styles.btnFilled} testID="world-chat-btn">
        <Text style={styles.btnFilledText}>Chat with {worldName}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  btnOutlined: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: lightTokens.colors.chapterActionBg,
    borderWidth: 1,
    borderColor: lightTokens.colors.chapterActionBorder,
    alignItems: 'center',
  },
  btnOutlinedText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '600',
    color: lightTokens.colors.worldsInk,
  },
  btnFilled: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: lightTokens.colors.worldsInk,
    alignItems: 'center',
  },
  btnFilledText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '600',
    color: lightTokens.colors.linenCream,
  },
});
