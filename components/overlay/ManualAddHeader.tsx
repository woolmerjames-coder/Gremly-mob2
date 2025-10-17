/**
 * ManualAddHeader - Phase 6 (Brand Refresh)
 * Header with exit button and segmented tabs
 */

import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';

type TabType = 'habits' | 'todos' | 'journal' | 'catchall';

interface ManualAddHeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onClose: () => void;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'habits', label: 'Habits' },
  { key: 'todos', label: 'To-Dos' },
  { key: 'journal', label: 'Journal' },
  { key: 'catchall', label: 'Catch-All' },
];

export function ManualAddHeader({ activeTab, onTabChange, onClose }: ManualAddHeaderProps) {
  return (
    <View style={overlayStyles.header}>
      {/* Title + Exit */}
      <View style={overlayStyles.headerRow}>
        <View style={{ width: 40 }} />
        <Text style={overlayStyles.headerTitle}>Add Manually</Text>
        <TouchableOpacity onPress={onClose} testID="exit-button">
          <Text style={{ fontSize: 24, color: theme.colors.charcoal }}>×</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={overlayStyles.tabsRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[overlayStyles.tab, isActive && overlayStyles.tabActive]}
              onPress={() => onTabChange(tab.key)}
              testID={`tab-${tab.key}`}
            >
              <Text style={[overlayStyles.tabText, isActive && overlayStyles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
