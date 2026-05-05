import { View, Pressable, StyleSheet, Animated } from 'react-native';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';

interface WorldDetailHeaderProps {
  title: string;
  onBack: () => void;
  worldId: string;
  /**
   * 'always' = pre-B behavior, title + amber underline always rendered.
   * 'scroll' = Phase B archetype pages, title fades in as user scrolls.
   *            When 'scroll' mode is used, scrollY must be provided.
   */
  titleMode?: 'always' | 'scroll';
  /**
   * An Animated.Value tracking the parent ScrollView's content offset Y.
   * Required when titleMode='scroll'. Ignored otherwise.
   */
  scrollY?: Animated.Value;
}

export function WorldDetailHeader({
  title,
  onBack,
  worldId,
  titleMode = 'always',
  scrollY,
}: WorldDetailHeaderProps) {
  const onMenu = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SheetManager.show as (...args: any[]) => void)('world-menu', { payload: { worldId } });
  };

  // Use provided scrollY or a stable-enough fallback for the transition
  // (scrollY is always provided when titleMode='scroll'; new Animated.Value(0)
  // is only a safety net that keeps the title at opacity 0)
  const activeScrollY = scrollY ?? new Animated.Value(0);

  const titleOpacity = activeScrollY.interpolate({
    inputRange: [80, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const borderOpacity = activeScrollY.interpolate({
    inputRange: [80, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  if (titleMode === 'always') {
    return (
      <View style={styles.hdr}>
        <Pressable onPress={onBack} style={styles.iconBtn} testID="world-detail-back">
          <ChevronLeft size={22} color={lightTokens.colors.worldsInk} />
        </Pressable>
        <View style={styles.titleWrap}>
          <View style={styles.titleInner}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.underline} />
          </View>
        </View>
        <Pressable onPress={onMenu} style={styles.iconBtn} testID="world-detail-menu">
          <MoreHorizontal size={20} color={lightTokens.colors.worldsInk} />
        </Pressable>
      </View>
    );
  }

  // SCROLL MODE — Phase B archetype pages
  return (
    <Animated.View style={[styles.hdr, styles.hdrScroll]}>
      <Pressable onPress={onBack} style={styles.iconBtn} testID="world-detail-back">
        <ChevronLeft size={22} color={lightTokens.colors.worldsInk} />
      </Pressable>
      <Animated.View style={[styles.titleWrap, { opacity: titleOpacity }]}>
        <View style={styles.titleInner}>
          <Text style={styles.titleScroll} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </Animated.View>
      <Pressable onPress={onMenu} style={styles.iconBtn} testID="world-detail-menu">
        <MoreHorizontal size={20} color={lightTokens.colors.worldsInk} />
      </Pressable>
      {/* Hairline border overlay — fades in synchronously with title */}
      <Animated.View
        pointerEvents="none"
        style={[styles.hdrBorderOverlay, { opacity: borderOpacity }]}
      />
    </Animated.View>
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
  hdrScroll: {
    backgroundColor: lightTokens.colors.worldsSurface,
    borderBottomWidth: 0,
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
  titleScroll: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: lightTokens.colors.worldsInk,
    // No amber underline — pinned/scrolled mode is cleaner
  },
  underline: {
    marginTop: 3,
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.ambergold,
  },
  hdrBorderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightTokens.colors.worldsCardBorder,
  },
});
