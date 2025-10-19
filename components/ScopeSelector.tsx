import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Pressable } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { type as typeStyles } from '../theme/typography';
import type { Space, ID } from '../lib/types';

export type ScopeType = 'everywhere' | 'space' | 'unassigned';

export interface ScopeOption {
  type: ScopeType;
  spaceId?: ID;
  label: string;
  icon?: string;
}

interface ScopeSelectorProps {
  selectedScope: ScopeOption;
  spaces: Space[];
  onChange: (scope: ScopeOption) => void;
}

export default function ScopeSelector({ selectedScope, spaces, onChange }: ScopeSelectorProps) {
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const options: ScopeOption[] = [
    { type: 'everywhere', label: 'Everywhere' },
    ...spaces.map((s) => ({
      type: 'space' as const,
      spaceId: s.id,
      label: s.name,
      icon: s.icon || undefined,
    })),
    { type: 'unassigned', label: 'Unassigned only' },
  ];

  const handleSelect = (option: ScopeOption) => {
    onChange(option);
    setDropdownVisible(false);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setDropdownVisible(true)}
        testID="scope-selector"
      >
        <Text style={styles.buttonText}>{selectedScope.label} ▾</Text>
      </TouchableOpacity>

      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setDropdownVisible(false)}>
          <View style={styles.dropdown}>
            <Text style={[typeStyles.h2, { marginBottom: spacing.md }]}>Select Scope</Text>

            <FlatList
              data={options}
              keyExtractor={(item, idx) => `${item.type}-${item.spaceId || idx}`}
              renderItem={({ item, index }) => {
                const showDividerBefore = index === 1 && spaces.length > 0;
                const showDividerAfter = index === options.length - 1 && spaces.length > 0;

                return (
                  <>
                    {showDividerBefore && <View style={styles.divider} />}

                    <TouchableOpacity
                      style={[
                        styles.option,
                        selectedScope.type === item.type &&
                          selectedScope.spaceId === item.spaceId &&
                          styles.optionActive,
                      ]}
                      onPress={() => handleSelect(item)}
                      testID={
                        item.type === 'everywhere'
                          ? 'scope-option-everywhere'
                          : item.type === 'unassigned'
                            ? 'scope-option-unassigned'
                            : `scope-option-space-${item.spaceId}`
                      }
                    >
                      <View style={styles.optionContent}>
                        {item.icon && <Text style={styles.icon}>{item.icon}</Text>}
                        <Text
                          style={[
                            typeStyles.body,
                            selectedScope.type === item.type &&
                              selectedScope.spaceId === item.spaceId &&
                              styles.optionTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {showDividerAfter && <View style={styles.divider} />}
                  </>
                );
              }}
            />

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setDropdownVisible(false)}
              testID="scope-close-btn"
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  buttonText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    width: '80%',
    maxHeight: '70%',
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
  },
  optionActive: {
    backgroundColor: colors.mint + '20',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  optionTextActive: {
    fontWeight: '700',
    color: colors.deepTeal,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginVertical: spacing.sm,
  },
  closeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.deepTeal,
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 16,
  },
});
