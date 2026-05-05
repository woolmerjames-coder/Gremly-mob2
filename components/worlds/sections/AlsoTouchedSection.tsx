// components/worlds/sections/AlsoTouchedSection.tsx
//
// ALSO TOUCHED section — other worlds that share drops with this world.
// Rendered as a horizontal row of chips, colour-coded by world_type.
// Returns null when there are no overlapping worlds.

import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useAlsoTouchedForWorld, type AlsoTouchedWorld } from '../../../lib/store/worldsSelectors';

interface AlsoTouchedSectionProps {
  worldId: string;
  onPressWorld?: (worldId: string) => void;
}

export function AlsoTouchedSection({ worldId, onPressWorld }: AlsoTouchedSectionProps) {
  const worlds = useAlsoTouchedForWorld(worldId);
  if (worlds.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ALSO TOUCHED</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {worlds.map((world) => (
          <ChipItem key={world.id} world={world} onPress={() => onPressWorld?.(world.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function ChipItem({ world, onPress }: { world: AlsoTouchedWorld; onPress: () => void }) {
  const chipStyle = resolveChipStyle(world.worldType);
  return (
    <Pressable
      style={[styles.chip, chipStyle.border]}
      onPress={onPress}
      testID={`also-touched-${world.id}`}
    >
      <Text style={[styles.chipText, chipStyle.text]} numberOfLines={1}>
        {world.name}
      </Text>
    </Pressable>
  );
}

function resolveChipStyle(worldType: string | null): {
  border: object;
  text: object;
} {
  switch (worldType) {
    case 'project':
      return {
        border: { borderColor: lightTokens.colors.chipProjectBorder },
        text: { color: lightTokens.colors.chipProjectText },
      };
    case 'practice':
      return {
        border: { borderColor: lightTokens.colors.chipPracticeBorder },
        text: { color: lightTokens.colors.chipPracticeText },
      };
    case 'relationship':
      return {
        border: { borderColor: lightTokens.colors.chipRelationshipBorder },
        text: { color: lightTokens.colors.chipRelationshipText },
      };
    default:
      return {
        border: { borderColor: lightTokens.colors.chipDomesticBorder },
        text: { color: lightTokens.colors.chipDomesticText },
      };
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
});
