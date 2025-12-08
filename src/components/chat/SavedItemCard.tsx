import React from 'react';
import { Pressable, View, StyleSheet, Image, Text, ImageSourcePropType } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTokens } from '../../../design/tokens';

// Use the mascot image from assets
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MASCOT_IMAGE: ImageSourcePropType = require('../../../assets/buttonforHP.png');

interface SavedItemCardProps {
  itemType: 'habit' | 'todo' | 'note' | 'person';
  title: string;
  subtitle?: string; // e.g., "3x per week" for habits, "Due tomorrow" for todos
  onPress: () => void;
}

export function SavedItemCard({ itemType, title, subtitle, onPress }: SavedItemCardProps) {
  // itemType used for potential future styling differences
  void itemType;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <Image source={MASCOT_IMAGE} style={styles.mascot} />
        <View style={styles.content}>
          <Text style={styles.titleText}>{title} saved</Text>
          {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start', // Left-aligned
    marginLeft: 16,
    marginVertical: 8,
    maxWidth: '85%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F6F0', // Cream
    borderWidth: 1,
    borderColor: 'rgba(107, 142, 107, 0.3)', // Sage green with opacity
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardPressed: {
    opacity: 0.8,
    backgroundColor: '#F0EDE6',
  },
  mascot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  subtitleText: {
    fontSize: 13,
    color: lightTokens.colors.subtle,
    marginTop: 1,
  },
  chevron: {
    fontSize: 18,
    color: lightTokens.colors.subtle,
    marginLeft: 8,
  },
});
