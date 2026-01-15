import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Text } from '../../ui';
import { ChevronRight, ChevronDown } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { triggerLight } from '../../lib/haptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SweepEndCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  expandable?: boolean;
  onPress?: () => void;
  children?: React.ReactNode; // Expanded content
  defaultExpanded?: boolean;
  variant?: 'default' | 'outline';
}

export function SweepEndCard({
  icon,
  title,
  subtitle,
  expandable = false,
  onPress,
  children,
  defaultExpanded = false,
  variant = 'default',
}: SweepEndCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handlePress = useCallback(() => {
    if (expandable && children) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      triggerLight();
      setExpanded(!expanded);
    } else if (onPress) {
      triggerLight();
      onPress();
    }
  }, [expandable, children, expanded, onPress]);

  const showChevron = expandable || onPress;

  return (
    <TouchableOpacity
      style={[styles.card, variant === 'outline' && styles.cardOutline]}
      onPress={handlePress}
      activeOpacity={showChevron ? 0.7 : 1}
      disabled={!showChevron}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {icon}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {showChevron &&
          (expanded ? (
            <ChevronDown size={20} color={BRAND.colors.inkMuted} />
          ) : (
            <ChevronRight size={20} color={BRAND.colors.inkMuted} />
          ))}
      </View>

      {expanded && children && <View style={styles.expandedContent}>{children}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 24,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  cardOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowOpacity: 0,
    elevation: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  subtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
});

export default SweepEndCard;
