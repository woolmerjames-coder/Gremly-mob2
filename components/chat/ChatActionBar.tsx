/**
 * ChatActionBar - Phase 11.7 Calm Action Bar v1.1
 * Centered "+" button with ephemeral encouragement messages
 * Replaces 5-icon bottom bar with focused, calm interface
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, Text, Animated, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useColorScheme } from 'react-native';
import { getDateService } from '../../lib/date';

interface EncouragementMessage {
  id: string;
  text: string;
  side: 'left' | 'right';
  timestamp: number;
}

interface CreatedItem {
  type: string;
  title?: string;
  timestamp: number;
}

interface ChatActionBarProps {
  onAddPress: () => void;
  lastCreatedItem: CreatedItem | null;
}

export const ChatActionBar = ({ onAddPress, lastCreatedItem }: ChatActionBarProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [messages, setMessages] = useState<EncouragementMessage[]>([]);
  const buttonScale = useMemo(() => new Animated.Value(1), []);
  const buttonGlow = useMemo(() => new Animated.Value(0), []);

  // timersRef to keep track of timeouts so they can be cleared on cleanup
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Generate encouragement message based on item type (memoized)
  const getEncouragementText = useCallback((itemType: string, count: number = 1): string => {
    const messageMap: Record<string, string[]> = {
      habit: ['Habit added 🪴', 'Building momentum 💫', 'Pattern recognized ⚡'],
      todo: ['To-Do sorted ✅', 'Task captured 📌', 'On your list 📝'],
      note: ['Thought saved 💭', 'Note secured 🔒', 'Captured ✨'],
      reflection: ['Reflection saved ✨', 'Insight logged 🌟', 'Moment preserved 🎯'],
      person: ['Contact added 👤', 'Connection saved 🤝', 'Person noted 📇'],
      journal: ['Entry saved 📔', 'Reflection logged ✨', 'Day captured 🌅'],
      multiple: [`${count} new wins 👏`, 'Batch complete 🎉', 'Progress made 🚀'],
      default: ['The Cortex is pleased 🧠', 'Nicely done 👌', 'Saved successfully ✓'],
    };

    const options = messageMap[itemType] || messageMap.default;
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  // Handle item creation
  useEffect(() => {
    if (!lastCreatedItem) return;

    const id = getDateService().now().getTime().toString();

    // Defer the setState to avoid synchronous setState inside the effect
    const addTimer = setTimeout(() => {
      // Use functional update so we compute side from the previous state safely
      setMessages((prev) => {
        const side = prev.length % 2 === 0 ? 'left' : 'right';
        const newMessage: EncouragementMessage = {
          id,
          text: getEncouragementText(lastCreatedItem.type),
          side,
          timestamp: getDateService().now().getTime(),
        };
        return [...prev, newMessage];
      });

      const removeTimer = setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, 2000);

      timersRef.current.push(removeTimer);
    }, 0);

    timersRef.current.push(addTimer);

    return () => {
      // Clear all timers on unmount or when lastCreatedItem changes
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [lastCreatedItem, getEncouragementText]);

  // Button press animation
  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 0.94,
        useNativeDriver: true,
      }),
      Animated.timing(buttonGlow, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [buttonScale, buttonGlow]);

  const handlePressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.timing(buttonGlow, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [buttonScale, buttonGlow]);

  const styles = getStyles(isDark);

  return (
    <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={styles.container}>
      {/* Left message zone */}
      <View style={styles.messageZone}>
        {messages
          .filter((m) => m.side === 'left')
          .map((message) => (
            <EncouragementMessageComponent key={message.id} message={message} isDark={isDark} />
          ))}
      </View>

      {/* Central + button */}
      <TouchableOpacity
        onPress={onAddPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        style={styles.buttonTouchArea}
        testID="chat-action-bar-add-button"
      >
        <Animated.View
          style={[
            styles.button,
            {
              transform: [{ scale: buttonScale }],
              shadowOpacity: buttonGlow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.08, 0.15],
              }) as unknown as number,
            },
          ]}
        >
          <Text style={styles.buttonText}>+</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Right message zone */}
      <View style={[styles.messageZone, styles.rightZone]}>
        {messages
          .filter((m) => m.side === 'right')
          .map((message) => (
            <EncouragementMessageComponent key={message.id} message={message} isDark={isDark} />
          ))}
      </View>
    </BlurView>
  );
};

// Ephemeral message component
interface EncouragementMessageComponentProps {
  message: EncouragementMessage;
  isDark: boolean;
}

const EncouragementMessageComponent: React.FC<EncouragementMessageComponentProps> = ({
  message,
  isDark,
}) => {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const slideAnim = useMemo(() => new Animated.Value(8), []);

  useEffect(() => {
    // Fade in + slide up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Fade out after 1.8s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 10,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1800);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim]);

  const styles = getMessageStyles(isDark);

  return (
    <Animated.Text
      style={[
        styles.message,
        isDark && styles.messageDark,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {message.text}
    </Animated.Text>
  );
};

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 64,
      backgroundColor: isDark
        ? 'rgba(26, 51, 40, 0.6)' // Deep Forest
        : 'rgba(249, 246, 241, 0.7)', // Linen Cream
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: 'rgba(46, 85, 64, 0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
    },

    messageZone: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    rightZone: {
      alignItems: 'flex-end',
    },

    buttonTouchArea: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },

    button: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#BFD8C0' : '#2E5540', // Sage Mist : Moss Green
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 6,
      elevation: 8,
    },

    buttonText: {
      fontSize: 28,
      fontWeight: '300',
      color: isDark ? '#1A3328' : '#F9F6F1', // Deep Forest : Linen Cream
      marginTop: -2, // Optical centering
    },
  });

const getMessageStyles = (isDark: boolean) =>
  StyleSheet.create({
    message: {
      fontSize: 14,
      fontWeight: '500',
      color: '#222222', // Charcoal Ink
      letterSpacing: 0.3,
      textShadowColor: 'rgba(0, 0, 0, 0.04)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },

    messageDark: {
      color: '#BFD8C0', // Sage Mist
    },
  });
