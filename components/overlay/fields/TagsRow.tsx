import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from '../../../ui/Text';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../../design/tokens';

type SuggestedTag = {
  name: string;
  lowConfidence?: boolean;
};

type TagsRowProps = {
  tags: string[];
  suggested?: SuggestedTag[];
  onToggle: (tag: string) => void;
};

type TagItem = {
  key: string;
  label: string;
  accessibilityLabel: string;
  active: boolean;
  lowConfidence?: boolean;
};

export function TagsRow({ tags, suggested = [], onToggle }: TagsRowProps) {
  const colorMode = useColorScheme();
  const palette = colorMode === 'dark' ? darkTokens.colors : lightTokens.colors;
  const lowConfidenceText = colorMode === 'dark' ? 'rgba(248,250,249,0.65)' : 'rgba(34,34,34,0.55)';
  const lowConfidenceBorder =
    colorMode === 'dark' ? 'rgba(248,250,249,0.35)' : 'rgba(34,34,34,0.25)';
  const inactiveBorder = colorMode === 'dark' ? 'rgba(248,250,249,0.4)' : palette.border;
  const inactiveText = colorMode === 'dark' ? 'rgba(248,250,249,0.85)' : palette.subtle;

  const chips = useMemo<TagItem[]>(() => {
    const seen = new Set<string>();
    const normalized: TagItem[] = [];

    const addTag = (rawName: string, active: boolean, lowConfidence?: boolean) => {
      const trimmed = rawName.trim();
      const slug = trimmed.toLowerCase();
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      const baseLabel =
        trimmed === slug ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
      const label = active ? baseLabel : `\u2022 ${baseLabel}`;
      normalized.push({
        key: slug,
        label,
        accessibilityLabel: baseLabel,
        active,
        lowConfidence,
      });
    };

    tags.forEach((name) => addTag(name, true));
    suggested.forEach((entry) => addTag(entry.name, false, entry.lowConfidence));

    return normalized;
  }, [suggested, tags]);

  if (chips.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="label" style={styles.label}>
        Tags
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chips.map((chip) => {
          const active = chip.active;
          const lowConfidence = !active && !!chip.lowConfidence;
          const backgroundColor = active ? palette.moss : 'transparent';
          const borderColor = active
            ? palette.moss
            : lowConfidence
              ? lowConfidenceBorder
              : inactiveBorder;
          const textColor = active
            ? palette.onPrimary
            : lowConfidence
              ? lowConfidenceText
              : inactiveText;

          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={chip.accessibilityLabel}
              onPress={() => onToggle(chip.key)}
              style={[styles.chip, { borderColor, backgroundColor }]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: textColor,
                    fontWeight: active ? '600' : '500',
                  },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: tokenSpacing.sm,
  },
  label: {
    marginBottom: tokenSpacing.xs,
  },
  scrollContent: {
    paddingVertical: 4,
    paddingRight: tokenSpacing.base,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokenRadius.sm,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    marginRight: tokenSpacing.sm,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: lightTokens.typography.size.sm,
    lineHeight: 18,
  },
});
