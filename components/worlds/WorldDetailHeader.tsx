import { View, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface WorldDetailHeaderProps {
  title: string;
  onBack: () => void;
  worldId: string;
  showTitle?: boolean; // default true — existing callers unchanged
}

export function WorldDetailHeader({
  title,
  onBack,
  worldId,
  showTitle = true,
}: WorldDetailHeaderProps) {
  const onMenu = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SheetManager.show as (...args: any[]) => void)('world-menu', { payload: { worldId } });
  };
  return (
    <View style={styles.hdr}>
      <Pressable onPress={onBack} style={styles.iconBtn} testID="world-detail-back">
        <ChevronLeft size={22} color={lightTokens.colors.worldsInk} />
      </Pressable>
      <View style={styles.titleWrap}>
        {showTitle ? (
          <View style={styles.titleInner}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.underline} />
          </View>
        ) : null}
      </View>
      <Pressable onPress={onMenu} style={styles.iconBtn} testID="world-detail-menu">
        <MoreHorizontal size={20} color={lightTokens.colors.worldsInk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  titleInner: { alignItems: 'center', paddingBottom: 4 },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: lightTokens.colors.worldsInk,
  },
  underline: {
    marginTop: 3,
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.ambergold,
  },
});
