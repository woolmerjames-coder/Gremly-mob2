/**
 * Tabs - DS-based implementation (migrated from Tailwind)
 */
import * as React from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, ViewStyle, TextStyle, type ViewProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';

type Variant = 'default' | 'pills';

export interface Tab {
  /** Tab ID */
  id: string;
  /** Tab label */
  label: string;
  /** Tab content */
  content: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
}

export interface TabsProps extends Omit<ViewProps, 'style'> {
  /** Tab items */
  tabs: Tab[];
  /** Default active tab ID */
  defaultTabId?: string;
  /** Tab change callback */
  onTabChange?: (tabId: string) => void;
  /** Variant style */
  variant?: Variant;
}

export const Tabs = React.forwardRef<React.ElementRef<typeof Box>, TabsProps>(
  ({ tabs: tabItems, defaultTabId, onTabChange, variant = 'default', ...viewProps }, ref) => {
    const [activeTabId, setActiveTabId] = useState(defaultTabId || tabItems[0]?.id || '');
    const t = useTokens();

    const handleTabPress = (tabId: string, disabled?: boolean) => {
      if (disabled) return;
      setActiveTabId(tabId);
      onTabChange?.(tabId);
    };

    const activeTab = tabItems.find((tab) => tab.id === activeTabId);

    const getTabListStyle = (v: Variant): ViewStyle => {
      if (v === 'pills') {
        return {
          backgroundColor: t.colors.surface,
          borderRadius: t.radius[2],
          padding: t.spacing[1],
        };
      }
      return {
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      };
    };

    const getTabStyle = (v: Variant, isActive: boolean): ViewStyle => {
      const base: ViewStyle = {
        paddingHorizontal: t.spacing[4],
        paddingVertical: t.spacing[3],
      };

      if (v === 'pills') {
        return {
          ...base,
          borderRadius: t.radius[2],
          marginHorizontal: t.spacing[0],
          ...(isActive && {
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }),
        };
      }

      return {
        ...base,
        borderBottomWidth: 2,
        borderBottomColor: isActive ? t.colors.primary : 'transparent',
      };
    };

    const getTabTextStyle = (v: Variant, isActive: boolean): TextStyle => {
      return {
        fontSize: t.typography.size.md,
        color: isActive ? t.colors.primary : t.colors.subtle,
        fontWeight: isActive ? '600' : '400',
      };
    };

    return (
      <Box ref={ref} style={{ width: '100%' }} {...viewProps}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={getTabListStyle(variant)}
        >
          <Box row>
            {tabItems.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => handleTabPress(tab.id, tab.disabled)}
                  disabled={tab.disabled}
                  style={({ pressed }) => [
                    getTabStyle(variant, isActive),
                    pressed && { backgroundColor: t.colors.surface },
                  ]}
                >
                  <Text style={getTabTextStyle(variant, isActive)}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </Box>
        </ScrollView>
        <Box py={4}>{activeTab?.content}</Box>
      </Box>
    );
  },
);

Tabs.displayName = 'Tabs';
