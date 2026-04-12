import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { Text } from '../../../ui/Text';
import {
  lightTokens,
  darkTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../../design/tokens';
import { normalizeTag } from '../../../lib/tags/normalize';

type TagProvenance = 'AI' | 'You' | string;

export type TagsRowTag = {
  canonical: string;
  slug: string;
  provenance?: TagProvenance;
  locked?: boolean;
};

export type TagsRowSuggestion = TagsRowTag & {
  lowConfidence?: boolean;
};

type TagsRowProps = {
  tags: TagsRowTag[];
  suggested?: TagsRowSuggestion[];
  onToggle: (slug: string) => void;
  onResuggest?: (() => void) | null;
  resuggesting?: boolean;
  onAdd?: ((tag: string) => void) | null;
  onUserAdd?: ((canonical: string) => void) | null;
  onUserRemove?: ((canonical: string, wasAi: boolean) => void) | null;
};

type TagItem = {
  key: string;
  canonical: string;
  display: string;
  active: boolean;
  provenance?: TagProvenance;
  locked?: boolean;
  lowConfidence?: boolean;
};

function formatTagDisplay(canonical: string): string {
  const trimmed = canonical.trim();
  if (!trimmed) return '';
  if (/^[#@*]/.test(trimmed)) {
    if (trimmed.startsWith('#')) return `#${trimmed.slice(1)}`;
    if (trimmed.startsWith('@')) return `@${trimmed.slice(1)}`;
    return trimmed;
  }
  return `#${trimmed}`;
}

function toSlug(value: string): string {
  return value
    .replace(/^[#@*]+/, '')
    .trim()
    .toLowerCase();
}

export function TagsRow({
  tags,
  suggested = [],
  onToggle,
  onResuggest,
  resuggesting,
  onAdd,
  onUserAdd,
  onUserRemove,
}: TagsRowProps) {
  const colorMode = useColorScheme();
  const palette = colorMode === 'dark' ? darkTokens.colors : lightTokens.colors;
  const placeholderColor = colorMode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(34,34,34,0.45)';
  const metadataColor = colorMode === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)';
  const [adding, setAdding] = useState(false);
  const [draftTag, setDraftTag] = useState('');
  const inputRef = useRef<TextInput | null>(null);

  const chips = useMemo<TagItem[]>(() => {
    const seen = new Set<string>();
    const normalized: TagItem[] = [];

    const addTag = (
      descriptor: TagsRowTag | TagsRowSuggestion,
      active: boolean,
      lowConfidence?: boolean,
    ) => {
      const canonical = descriptor.canonical?.trim();
      if (!canonical) return;
      const key = (descriptor.slug ?? toSlug(canonical)).trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);

      normalized.push({
        key,
        canonical,
        display: formatTagDisplay(canonical),
        active,
        provenance: descriptor.provenance,
        locked: descriptor.locked,
        lowConfidence,
      });
    };

    tags.forEach((entry) => addTag(entry, true));
    suggested.forEach((entry) => addTag(entry, false, entry.lowConfidence));

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

    onUserAdd?.(normalized);

    if (typeof onAdd === 'function') {
      onAdd(normalized);
    } else {
      onToggle(toSlug(normalized));
    }

    handleResetDraft();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chips.map((chip) => {
          const active = chip.active;
          const provenance = chip.provenance;

          return (
            <View
              key={chip.key}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? 'rgba(46,85,64,0.08)' : 'transparent',
                },
              ]}
            >
              {active ? (
                // Active tag: show label + × remove button
                <View style={styles.chipContent}>
                  <Text
                    style={[
                      styles.chipLabel,
                      {
                        color: '#2E5540',
                        fontWeight: '500',
                      },
                    ]}
                  >
                    {chip.display}
                  </Text>
                  {!chip.locked ? (
                    <Pressable
                      onPress={() => {
                        onUserRemove?.(chip.canonical, String(provenance).toLowerCase() === 'ai');
                        onToggle(chip.key);
                      }}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${chip.display}`}
                    >
                      <Text style={styles.tagRemove}>×</Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.lockDot, { color: metadataColor }]}>●</Text>
                  )}
                </View>
              ) : (
                // Suggested tag: tappable to add
                <Pressable
                  onPress={() => {
                    onUserAdd?.(chip.canonical);
                    onToggle(chip.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: false }}
                  accessibilityLabel={`Add ${chip.display}`}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={styles.chipContent}>
                    <Text
                      style={[
                        styles.chipLabel,
                        {
                          color: '#2E5540',
                          fontWeight: '400',
                        },
                      ]}
                    >
                      {chip.display}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
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
              placeholderTextColor={placeholderColor}
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
      {/* Re-suggest tags — shown below tag pills */}
      {typeof onResuggest === 'function' ? (
        <Pressable
          onPress={onResuggest}
          disabled={!!resuggesting}
          accessibilityRole="button"
          accessibilityLabel="Re-suggest tags"
          testID="resuggest-tags-action"
          style={({ pressed }) => ({
            opacity: pressed && !resuggesting ? 0.6 : 1,
            marginTop: 4,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {resuggesting ? (
              <ActivityIndicator size="small" color="#A09A90" style={{ marginRight: 4 }} />
            ) : null}
            <Text style={{ fontSize: 12, color: '#A09A90' }}>Re-suggest tags</Text>
          </View>
        </Pressable>
      ) : null}
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
  resuggestContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokenSpacing.xs,
  },
  resuggestSpinner: {
    transform: [{ scale: 0.8 }],
  },
  scrollContent: {
    paddingVertical: 6,
    paddingRight: tokenSpacing.base,
  },
  chip: {
    borderWidth: 0,
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: tokenSpacing.sm,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#2E5540',
  },
  tagRemove: {
    fontSize: 14,
    color: '#2E5540',
    marginLeft: 4,
    fontWeight: '400',
  },
  provenance: {
    fontSize: lightTokens.typography.size.sm * 0.7,
    marginLeft: 4,
    fontWeight: '500',
  },
  lockDot: {
    marginLeft: 6,
    fontSize: lightTokens.typography.size.xs,
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
