import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useColorScheme, View } from 'react-native';
import { Text } from '../../../ui/Text';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../../design/tokens';
import { normalizeTag } from '../../../lib/tags/normalize';

type SuggestedTag = {
  name: string;
  lowConfidence?: boolean;
};

type TagsRowProps = {
  tags: string[];
  suggested?: SuggestedTag[];
  onToggle: (tag: string) => void;
  onResuggest?: (() => void) | null;
  resuggesting?: boolean;
  onAdd?: ((tag: string) => void) | null;
};

type TagItem = {
  key: string;
  label: string;
  accessibilityLabel: string;
  active: boolean;
  lowConfidence?: boolean;
};

export function TagsRow({
  tags,
  suggested = [],
  onToggle,
  onResuggest,
  resuggesting,
  onAdd,
}: TagsRowProps) {
  const colorMode = useColorScheme();
  const palette = colorMode === 'dark' ? darkTokens.colors : lightTokens.colors;
  const [adding, setAdding] = useState(false);
  const [draftTag, setDraftTag] = useState('');
  const inputRef = useRef<TextInput | null>(null);

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

  const shouldRender = chips.length > 0 || typeof onAdd === 'function';
  if (!shouldRender) return null;

  const scheduleFocus = () => {
    const focus = () => inputRef.current?.focus();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(focus);
    } else {
      setTimeout(focus, 0);
    }
  };

  const handleBeginAdd = () => {
    if (!onAdd && !onToggle) return;
    setAdding(true);
    scheduleFocus();
  };

  const handleResetDraft = () => {
    setAdding(false);
    setDraftTag('');
  };

  const commitDraft = () => {
    const trimmed = draftTag.trim();
    if (!trimmed) {
      handleResetDraft();
      return;
    }

    const { tag: normalized } = normalizeTag(trimmed);
    if (!normalized) {
      handleResetDraft();
      return;
    }

    if (typeof onAdd === 'function') {
      onAdd(normalized);
    } else {
      onToggle(normalized);
    }

    handleResetDraft();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="label" style={styles.label}>
          Tags
        </Text>
        {typeof onResuggest === 'function' ? (
          <Pressable
            onPress={onResuggest}
            disabled={!!resuggesting}
            accessibilityRole="button"
            accessibilityLabel="Re-suggest tags"
            testID="resuggest-tags-action"
            style={({ pressed }) => [
              styles.resuggestButton,
              pressed && !resuggesting ? styles.resuggestButtonPressed : null,
              resuggesting ? styles.resuggestDisabled : null,
            ]}
          >
            <Text style={[styles.resuggestLabel, { color: palette.sage }]}>Re-suggest tags</Text>
          </Pressable>
        ) : null}
      </View>
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
        {typeof onAdd === 'function' ? (
          adding ? (
            <TextInput
              ref={inputRef}
              style={[styles.addInput, { color: palette.charcoal, borderColor: palette.sage }]}
              value={draftTag}
              onChangeText={setDraftTag}
              placeholder="#tag or @person"
              placeholderTextColor={charcoalMuted}
              returnKeyType="done"
              onSubmitEditing={commitDraft}
              blurOnSubmit
              onBlur={commitDraft}
              autoCorrect={false}
              autoCapitalize="none"
              testID="add-tag-input"
            />
          ) : (
            <Pressable
              onPress={handleBeginAdd}
              accessibilityRole="button"
              accessibilityLabel="Add tag"
              style={[styles.chip, styles.addChip]}
              testID="add-tag-trigger"
            >
              <Text style={[styles.chipLabel, { color: palette.sage, fontWeight: '500' }]}>
                + Add tag
              </Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: tokenSpacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    marginBottom: 6,
    fontSize: lightTokens.typography.size.xs,
    lineHeight: lightTokens.typography.size.xs * lightTokens.typography.lineHeight.normal,
    fontWeight: '500',
  },
  resuggestButton: {
    paddingHorizontal: tokenSpacing.xs,
    paddingVertical: 4,
    borderRadius: tokenRadius.sm,
  },
  resuggestButtonPressed: {
    opacity: 0.7,
  },
  resuggestLabel: {
    fontSize: lightTokens.typography.size.xs,
    lineHeight: lightTokens.typography.size.xs * lightTokens.typography.lineHeight.normal,
    fontWeight: '500',
  },
  resuggestDisabled: {
    opacity: 0.6,
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
  addChip: {
    borderStyle: 'dashed',
  },
  addInput: {
    minWidth: 120,
    paddingHorizontal: tokenSpacing.sm,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: tokenSpacing.sm,
    fontSize: lightTokens.typography.size.sm,
    lineHeight: 18,
  },
});
