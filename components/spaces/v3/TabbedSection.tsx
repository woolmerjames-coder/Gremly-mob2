import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
  Animated,
  Dimensions,
} from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type TabKey = 'chats' | 'habits' | 'todos' | 'notes';
export type Tab = { key: TabKey; label: string; count?: number };

export type TabbedSectionProps = {
  tabs: Tab[];
  activeKey: TabKey | string;
  onChange: (k: TabKey) => void;
};

export const TabbedSection: React.FC<TabbedSectionProps> = ({ tabs, activeKey, onChange }) => {
  const width = Dimensions.get('window').width - 32; // rough container width default
  const tabCount = tabs.length;
  const tabWidth = width / Math.max(1, tabCount);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );
  const translate = useMemo(() => new Animated.Value(index * tabWidth), []);

  useEffect(() => {
    Animated.spring(translate, {
      toValue: Math.max(0, index) * tabWidth,
      useNativeDriver: true,
      bounciness: 5,
    }).start();
  }, [index, tabWidth, translate]);

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {tabs.map((tItem) => (
          <TouchableOpacity
            key={tItem.key}
            style={[styles.tab, { width: `${100 / tabCount}%` }]}
            onPress={() => onChange(tItem.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: tItem.key === activeKey }}
          >
            <Text
              style={[styles.label, tItem.key === activeKey && styles.labelActive]}
              numberOfLines={1}
            >
              {tItem.label}
              {typeof tItem.count === 'number' ? ` ${tItem.count}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
        <Animated.View
          style={[
            styles.indicator,
            { width: `${100 / tabCount}%`, transform: [{ translateX: translate }] },
          ]}
        />
      </View>
    </View>
  );
};

const C = t.colors;
const S = t.spacing;
const R = t.radius;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: R[2],
    ...t.elevation.sm,
  },
  tabs: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: S[2],
    overflow: 'hidden',
  },
  tab: {
    paddingVertical: S[2],
    alignItems: 'center',
  },
  label: {
    color: C.subtle,
    fontSize: t.typography.size.sm,
  },
  labelActive: {
    color: C.mossGreen,
    fontWeight: '700',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: C.mossGreen,
    borderRadius: R[1],
  },
});

export default TabbedSection;
