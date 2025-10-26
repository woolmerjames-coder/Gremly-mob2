import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated, Easing, Platform } from 'react-native';
import { COLORS, SPACE, RADII } from './_tokens';
import { StickyNote, CalendarClock, Plus } from '../../icons';

type Props = {
  counts?: { notes: number; milestones: number };
  onOpenNotepad: () => void;
  onOpenCalendar: () => void;
  onAdd: () => void;
};

export default function IconRow({ counts, onOpenNotepad, onOpenCalendar, onAdd }: Props) {
  const pulse = React.useMemo(() => new Animated.Value(0), []);

  React.useEffect(() => {
    const animate = () => {
      pulse.setValue(0);
      Animated.timing(pulse, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };
    const id = setInterval(animate, 30_000);
    // fire a gentle cue shortly after mount
    const warmup = setTimeout(animate, 1500);
    return () => {
      clearInterval(id);
      clearTimeout(warmup);
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.wrap}>
      <Action onPress={onOpenNotepad} badge={counts?.notes}>
        <StickyNote color={COLORS.Moss} size={20} strokeWidth={2} />
      </Action>
      <Action onPress={onOpenCalendar} badge={counts?.milestones}>
        <CalendarClock color={COLORS.Moss} size={20} strokeWidth={2} />
      </Action>
      <TouchableOpacity accessibilityRole="button" onPress={onAdd} style={{ alignItems: 'center' }}>
        <Animated.View
          style={[
            styles.plusWrap,
            {
              transform: [{ scale }],
              shadowOpacity: Platform.OS === 'ios' ? (glow as any) : 0,
              elevation: Platform.OS === 'android' ? 2 : 0,
            },
          ]}
        >
          <Plus color={COLORS.Moss} size={20} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

function Action({
  children,
  badge,
  onPress,
}: {
  children: React.ReactNode;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={{ alignItems: 'center' }}>
      <View style={styles.iconWrap}>{children}</View>
      {typeof badge === 'number' && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  iconWrap: {
    padding: 8,
    borderRadius: RADII.btn,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 8,
    backgroundColor: COLORS.Pear,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { color: COLORS.Linen, fontWeight: '800', fontSize: 10 },
  plusWrap: {
    padding: 8,
    borderRadius: RADII.btn,
    shadowColor: 'rgba(224,196,122,0.8)', // Pear glow
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
});
