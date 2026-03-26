import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HelpCircle, Layers, MessageCircle, Shuffle } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { BRAND } from '../../design/brand';

// ─────────────────────────────────────────────────────────────────────────────
// GremlyMenuButton
// ─────────────────────────────────────────────────────────────────────────────

type GremlyMenuButtonProps = {
  onPress: () => void;
};

export function GremlyMenuButton({ onPress }: GremlyMenuButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(1.08, { duration: 150 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1.0, { duration: 150 });
        }}
        onPress={onPress}
      >
        <View style={styles.buttonOuter}>
          <LinearGradient
            colors={['rgba(191,216,192,0.35)', 'rgba(191,216,192,0.15)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.buttonImageCrop}>
            <Image
              source={require('../../assets/mascot/gremly-mascot.png')}
              style={styles.buttonImage}
              resizeMode="cover"
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GremlyPopupMenu
// ─────────────────────────────────────────────────────────────────────────────

type MenuKey = 'help' | 'chat' | 'details' | 'wrongtype';

type GremlyPopupMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelectItem: (key: MenuKey) => void;
};

const MENU_ITEMS: { key: MenuKey; icon: typeof HelpCircle; iconColor: string; label: string }[] = [
  { key: 'help', icon: HelpCircle, iconColor: BRAND.colors.mossGreen, label: 'What do I do?' },
  { key: 'chat', icon: MessageCircle, iconColor: '#9CA6E0', label: 'Chat about this' },
  { key: 'details', icon: Layers, iconColor: BRAND.colors.inkSubtle, label: 'Open details' },
  { key: 'wrongtype', icon: Shuffle, iconColor: BRAND.colors.goldenPear, label: 'Wrong type?' },
];

export function GremlyPopupMenu({ visible, onClose, onSelectItem }: GremlyPopupMenuProps) {
  const menuScale = useSharedValue(0.92);
  const menuTranslateY = useSharedValue(-4);
  const menuOpacity = useSharedValue(0);
  const [pressedKey, setPressedKey] = useState<MenuKey | null>(null);

  useEffect(() => {
    if (visible) {
      menuScale.value = withSpring(1.0, { damping: 14, stiffness: 180 });
      menuTranslateY.value = withSpring(0, { damping: 14, stiffness: 180 });
      menuOpacity.value = withTiming(1, { duration: 120 });
    } else {
      menuScale.value = 0.92;
      menuTranslateY.value = -4;
      menuOpacity.value = 0;
    }
  }, [visible]);

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: menuScale.value }, { translateY: menuTranslateY.value }],
    opacity: menuOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.menuPositioner}>
          <Pressable>
            <Animated.View style={[styles.menuContainer, menuAnimatedStyle]}>
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const isPressed = pressedKey === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.menuItem, isPressed && styles.menuItemPressed]}
                    onPressIn={() => setPressedKey(item.key)}
                    onPressOut={() => setPressedKey(null)}
                    onPress={() => {
                      onSelectItem(item.key);
                      onClose();
                    }}
                  >
                    <Icon size={15} strokeWidth={2} color={item.iconColor} />
                    <Text style={styles.menuLabel}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Button
  buttonOuter: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(191,216,192,0.4)',
    shadowColor: 'rgba(46,85,64,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonImageCrop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  buttonImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginTop: -4,
  },

  // Menu
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menuPositioner: {
    alignItems: 'flex-end',
    paddingRight: 34,
    paddingTop: 8,
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 6,
    minWidth: 195,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.2)',
  },
  menuItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'transparent',
  },
  menuItemPressed: {
    backgroundColor: 'rgba(191,216,192,0.12)',
  },
  menuLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    letterSpacing: -0.1,
    fontFamily: 'Inter-Medium',
  },
});
