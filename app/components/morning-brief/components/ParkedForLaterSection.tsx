import React, { useMemo, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';

interface ParkedTask {
  id: string;
  title: string;
  estimatedMinutes?: number;
}

interface ParkedForLaterSectionProps {
  tasks: ParkedTask[];
  onPulse?: boolean; // triggers a subtle visual pulse when a task is parked
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ParkedForLaterSection({ tasks, onPulse = false }: ParkedForLaterSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useMemo(() => new Animated.Value(0), []);
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

  const toggleExpanded = () => {
    const next = !expanded;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(next);

    Animated.timing(rotateAnim, {
      toValue: next ? 1 : 0,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  if (tasks.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Pressable onPress={toggleExpanded} style={styles.header}>
        <Text style={styles.headerText}>Parked for later</Text>
        <Animated.View style={[styles.badge, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </Animated.View>
        <View style={styles.spacer} />
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={16} color={BRAND.colors.inkMuted} />
        </Animated.View>
      </Pressable>

      {/* Expandable content — LayoutAnimation handles height transition */}
      {expanded && (
        <View style={styles.content}>
          {tasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <View style={styles.dot} />
              <Text style={styles.taskTitle} numberOfLines={1}>
                {task.title}
              </Text>
              {task.estimatedMinutes != null && task.estimatedMinutes > 0 && (
                <Text style={styles.taskEstimate}>{formatTime(task.estimatedMinutes)}</Text>
              )}
            </View>
          ))}
          <Text style={styles.footer}>
            These stay on your plate — they'll surface again in your Evening Sweep.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 18,
    marginTop: 14,
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
  badge: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 7,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginLeft: 7,
  },
  badgeText: {
    fontSize: 10,
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
    paddingVertical: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginRight: 8,
  },
  taskTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(34,34,34,0.75)',
  },
  taskEstimate: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
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
});
