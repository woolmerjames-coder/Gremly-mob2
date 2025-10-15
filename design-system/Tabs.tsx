import React, { useState } from 'react';
import { View, Pressable, Text, ScrollView, type ViewProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const tabs = tv({
  slots: {
    container: 'w-full',
    tabList: 'flex-row border-b border-border',
    tab: 'px-4 py-3 border-b-2 border-transparent active:bg-bg-100 transition-colors',
    tabActive: 'border-primary',
    tabText: 'text-base text-text-muted',
    tabTextActive: 'text-primary font-semibold',
    tabPanel: 'py-4',
  },
  variants: {
    variant: {
      default: {},
      pills: {
        tabList: 'border-b-0 bg-bg-100 rounded-lg p-1',
        tab: 'rounded-md border-0 mx-0.5',
        tabActive: 'bg-white shadow-sm border-0',
      },
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type TabsVariants = VariantProps<typeof tabs>;

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends ViewProps, TabsVariants {
  tabs: Tab[];
  defaultTabId?: string;
  onTabChange?: (tabId: string) => void;
}

export const Tabs = React.forwardRef<React.ElementRef<typeof View>, TabsProps>(
  ({ tabs: tabItems, defaultTabId, onTabChange, variant, ...viewProps }, ref) => {
    const [activeTabId, setActiveTabId] = useState(defaultTabId || tabItems[0]?.id || '');
    const styles = tabs({ variant });

    const handleTabPress = (tabId: string, disabled?: boolean) => {
      if (disabled) return;
      setActiveTabId(tabId);
      onTabChange?.(tabId);
    };

    const activeTab = tabItems.find((tab) => tab.id === activeTabId);

    return (
      <View ref={ref} {...viewProps} className={styles.container()}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className={styles.tabList()}>
          {tabItems.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabPress(tab.id, tab.disabled)}
                disabled={tab.disabled}
                className={`${styles.tab()} ${isActive ? styles.tabActive() : ''}`}
              >
                <Text className={`${styles.tabText()} ${isActive ? styles.tabTextActive() : ''}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View className={styles.tabPanel()}>{activeTab?.content}</View>
      </View>
    );
  },
);

Tabs.displayName = 'Tabs';
