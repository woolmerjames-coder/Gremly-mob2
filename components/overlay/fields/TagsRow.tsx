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

  const toRgba = (hex: string, alpha: number): string => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const normalized = hex.replace('#', '');
    const value = normalized.length === 6 ? normalized : normalized.slice(0, 6);
    const int = Number.parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const sage = palette.sage;
  const charcoal = palette.charcoal;
  const sageOutline = toRgba(sage, 0.6);
  const charcoalMuted = toRgba(charcoal, colorMode === 'dark' ? 0.75 : 0.7);

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
          const backgroundColor = active ? sage : 'transparent';
          const borderColor = active ? sage : sageOutline;
          const textColor = active ? charcoal : charcoalMuted;

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
    marginBottom: 6,
    fontSize: lightTokens.typography.size.xs,
    lineHeight: lightTokens.typography.size.xs * lightTokens.typography.lineHeight.normal,
    fontWeight: '500',
  },
  scrollContent: {
    paddingVertical: 6,
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
