import React, { useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const heightAnim = useMemo(() => new Animated.Value(0), []);
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
    setExpanded(next);

    Animated.parallel([
      Animated.timing(rotateAnim, {
        toValue: next ? 1 : 0,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(heightAnim, {
        toValue: next ? 1 : 0,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  if (tasks.length === 0) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      {/* Header */}
      <Pressable onPress={toggleExpanded} style={styles.header}>
        <Text style={styles.headerText}>Parked for later</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </View>
        <View style={styles.spacer} />
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={16} color={BRAND.colors.inkMuted} />
        </Animated.View>
      </Pressable>

      {/* Expandable content */}
      {expanded && (
        <View style={styles.content}>
          {tasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <Text style={styles.dot}>·</Text>
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
    </Animated.View>
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
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    color: BRAND.colors.inkMuted,
  },
  badge: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginLeft: 7,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
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
    fontSize: 18,
    color: BRAND.colors.inkMuted,
    marginRight: 8,
    lineHeight: 20,
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
