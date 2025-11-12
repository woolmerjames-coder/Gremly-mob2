import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { lightTokens, darkTokens, spacing as tokenSpacing } from '../../../design/tokens';

type SuggestedTag = {
  name: string;
  lowConfidence?: boolean;
};

type TagsRowProps = {
  tags: string[];
  suggested?: SuggestedTag[];
  onToggle: (tag: string) => void;
  onRemove?: (tag: string) => void;
  activeMeta?: Record<string, { label: string; isPerson: boolean }>;
};

type TagItem = {
  key: string;
  display: string;
  baseLabel: string;
  active: boolean;
  lowConfidence?: boolean;
  isPerson: boolean;
};

export function TagsRow({ tags, suggested = [], onToggle, onRemove, activeMeta }: TagsRowProps) {
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

  const charcoal = palette.charcoal;
  const charcoalMuted = toRgba(charcoal, colorMode === 'dark' ? 0.8 : 0.7);
  const selectedTextColor = colorMode === 'dark' ? palette.charcoal : (palette.deep ?? '#1A3328');
  const personSelectedBackground = '#BFD8C0';
  const topicSelectedBackground = '#DDE7E1';
  const chipBorderColor = 'rgba(46,85,64,0.15)';

  const normalizeSlug = (value: string) =>
    value
      .replace(/^[#@*]+/, '')
      .trim()
      .toLowerCase();
  const ensureDisplayLabel = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[#@*]/.test(trimmed)) return trimmed;
    return `#${trimmed}`;
  };

  const chips = useMemo<TagItem[]>(() => {
    const seen = new Set<string>();
    const list: TagItem[] = [];

    const push = (rawName: string, active: boolean, lowConfidence?: boolean) => {
      const trimmed = rawName?.trim() ?? '';
      if (!trimmed) return;
      const slug = normalizeSlug(trimmed);
      if (!slug) return;

      const dedupeKey = `${active ? '1' : '0'}:${slug}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const meta = active ? activeMeta?.[slug] : undefined;
      const baseLabel = active
        ? (meta?.label ?? ensureDisplayLabel(trimmed))
        : ensureDisplayLabel(trimmed);
      const cleanLabel = baseLabel.startsWith('• ') ? baseLabel.slice(2) : baseLabel;
      const display = active ? cleanLabel : `• ${cleanLabel}`;

      list.push({
        key: slug,
        display,
        baseLabel: cleanLabel,
        active,
        lowConfidence,
        isPerson: meta?.isPerson ?? cleanLabel.startsWith('@'),
      });
    };

    tags.forEach((name) => push(name, true));
    suggested.forEach((entry) => push(entry.name, false, entry.lowConfidence));

    return list;
  }, [activeMeta, suggested, tags]);

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
          const backgroundColor = chip.active
            ? chip.isPerson
              ? personSelectedBackground
              : topicSelectedBackground
            : 'transparent';
          const textColor = chip.active ? selectedTextColor : charcoalMuted;
          const opacity = !chip.active && chip.lowConfidence ? 0.7 : 1;

          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected: chip.active }}
              accessibilityLabel={chip.baseLabel}
              onPress={() => onToggle(chip.key)}
              style={[styles.chip, { borderColor: chipBorderColor, backgroundColor, opacity }]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: textColor,
                    fontWeight: chip.active ? '600' : '500',
                  },
                ]}
              >
                {chip.display}
              </Text>
              {chip.active && onRemove ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${chip.baseLabel}`}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onRemove(chip.key);
                  }}
                  style={styles.removePressable}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeIcon}>×</Text>
                </Pressable>
              ) : null}
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
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: lightTokens.typography.size.sm,
    lineHeight: 18,
  },
  removePressable: {
    marginLeft: 6,
    padding: 2,
  },
  removeIcon: {
    fontSize: 14,
    lineHeight: 16,
    color: 'rgba(26,51,40,0.7)',
  },
});
