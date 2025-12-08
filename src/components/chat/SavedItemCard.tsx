import React from 'react';
import { Pressable, View, StyleSheet, Image, Text, ImageSourcePropType } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

// Use the mascot image from assets
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MASCOT_IMAGE: ImageSourcePropType = require('../../../assets/buttonforHP.png');

interface SavedItemCardProps {
  itemType: 'habit' | 'todo' | 'note' | 'person';
  title: string;
  subtitle?: string;
  onPress: () => void;
}

export function SavedItemCard({ itemType, title, subtitle, onPress }: SavedItemCardProps) {
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
          {subtitle && subtitle !== 'custom' && <Text style={styles.subtitleText}>{subtitle}</Text>}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginLeft: 16,
    marginRight: 16,
    marginVertical: 8,
    // Remove alignSelf: 'flex-start' - let it take natural width
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start', // Move here - card shrinks to content
    backgroundColor: '#F8F6F0',
    borderWidth: 1,
    borderColor: 'rgba(107, 142, 107, 0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxWidth: '100%',
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
    flexShrink: 1, // Allow shrinking but not collapsing
    // Remove flex: 1 - let content determine width
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3B2D',
  },
  subtitleText: {
    fontSize: 13,
    color: '#6B8E6B',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#6B8E6B',
    marginLeft: 8,
  },
});
