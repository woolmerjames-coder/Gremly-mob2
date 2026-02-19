import React, { useMemo, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';
import type { TaskItemData } from './TaskItem';

interface ParkedForLaterSectionProps {
  tasks: TaskItemData[];
  onPulse?: boolean;
  onToggleSelect?: (task: TaskItemData) => void;
  /** Whether there are selected priorities — controls header copy */
  hasSelections?: boolean;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ParkedForLaterSection({
  tasks,
  onPulse = false,
  onToggleSelect,
  hasSelections = false,
}: ParkedForLaterSectionProps) {
  const [displayMode, setDisplayMode] = useState<'preview' | 'expanded' | 'collapsed'>('preview');
  const rotateAnim = useMemo(() => new Animated.Value(1), []);
  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  // Pulse animation when onPulse changes to true
  React.useEffect(() => {
    if (onPulse) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [onPulse, pulseAnim]);

  const toggleDisplay = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (displayMode === 'collapsed') {
      setDisplayMode('preview');
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      setDisplayMode('collapsed');
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  if (tasks.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Pressable onPress={toggleDisplay} style={styles.header}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Text style={styles.headerText}>
            {hasSelections
              ? `${tasks.length} more available`
              : `${tasks.length} todos & habits available`}
          </Text>
        </Animated.View>
        <View style={styles.spacer} />
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={16} color={BRAND.colors.inkMuted} />
        </Animated.View>
      </Pressable>

      {/* Expandable content */}
      {displayMode !== 'collapsed' && (
        <View style={styles.content}>
          {(displayMode === 'preview' ? tasks.slice(0, 3) : tasks).map((task) => (
            <Pressable key={task.id} style={styles.taskRow} onPress={() => onToggleSelect?.(task)}>
              <View style={styles.checkbox} />
              <Text style={styles.taskTitle} numberOfLines={1}>
                {task.title}
              </Text>
              {task.estimatedMinutes != null && task.estimatedMinutes > 0 && (
                <Text style={styles.taskEstimate}>{formatTime(task.estimatedMinutes)}</Text>
              )}
            </Pressable>
          ))}
          {displayMode === 'preview' && tasks.length > 3 && (
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setDisplayMode('expanded');
              }}
              style={styles.moreRow}
            >
              <Text style={styles.moreText}>+{tasks.length - 3} more</Text>
            </Pressable>
          )}
          <Text style={styles.footer}>Tap to add to today's plan</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 6,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
  },
  spacer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    opacity: 0.55,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(34,34,34,0.14)',
    backgroundColor: 'transparent',
    marginRight: 10,
  },
  taskTitle: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    color: 'rgba(34,34,34,0.45)',
  },
  taskEstimate: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginLeft: 8,
  },
  footer: {
    marginTop: 10,
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
    lineHeight: 15,
  },
  moreRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  moreText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: '#6A7D76',
  },
});
