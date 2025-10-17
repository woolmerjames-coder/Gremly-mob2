/**
 * ManualAddHeader - Phase 6 (Brand Refresh)
 * Header with exit button and tile tabs with active underline
 */

import React from 'react';
import { View, Pressable, Text, TouchableOpacity } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';

type TabType = 'habits' | 'todos' | 'journal' | 'catchall';

interface ManualAddHeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onClose: () => void;
}

const TABS: { key: TabType; label: string; testID: string }[] = [
  { key: 'habits', label: 'Habits', testID: 'tab-habits' },
  { key: 'todos', label: 'To-Dos', testID: 'tab-todos' },
  { key: 'journal', label: 'Journal', testID: 'tab-journal' },
  { key: 'catchall', label: 'Catch-All', testID: 'tab-catchall' },
];

export function ManualAddHeader({ activeTab, onTabChange, onClose }: ManualAddHeaderProps) {
  return (
    <View style={overlayStyles.header}>
      {/* Title + Exit */}
      <View style={overlayStyles.headerRow}>
        <View style={{ width: 40 }} />
        <Text style={overlayStyles.headerTitle}>Add Manually</Text>
        <TouchableOpacity
          onPress={onClose}
          testID="exit-button"
          accessibilityRole="button"
          accessibilityLabel="Close overlay"
        >
          <Text style={{ fontSize: 24, color: theme.colors.charcoal }}>×</Text>
        </TouchableOpacity>
      </View>

      {/* Tile Tabs with Underline */}
      <View style={overlayStyles.tabsRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              testID={tab.testID}
            >
              <View style={[overlayStyles.tabTile, isActive && overlayStyles.tabTileActive]}>
                <Text style={[overlayStyles.tabText, isActive && overlayStyles.tabTextActive]}>
                  {tab.label}
                </Text>
              </View>
              <View
                style={[overlayStyles.underlineWrap, isActive && overlayStyles.underlineActive]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
