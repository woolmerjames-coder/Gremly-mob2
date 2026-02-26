import React from 'react';
import { View, Modal, StyleSheet, Text, Pressable } from 'react-native';

interface NotificationPermissionPromptProps {
  visible: boolean;
  context: 'reminder' | 'sweep';
  onAllow: () => void;
  onNotNow: () => void;
}

const COPY = {
  reminder: {
    title: 'Want me to nudge you?',
    body: "I can send you a reminder so this doesn't slip through the cracks. You can always snooze or turn them off.",
  },
  sweep: {
    title: 'Stay on track?',
    body: "A quick nudge each evening helps you sweep before bed. Most people say it's the habit that sticks.",
  },
} as const;

export function NotificationPermissionPrompt({
  visible,
  context,
  onAllow,
  onNotNow,
}: NotificationPermissionPromptProps) {
  const { title, body } = COPY[context];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <Pressable style={styles.allowButton} onPress={onAllow}>
            <Text style={styles.allowText}>Sure, remind me</Text>
          </Pressable>

          <Pressable style={styles.notNowButton} onPress={onNotNow}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#F9F6F1',
    borderRadius: 20,
    padding: 24,
    maxWidth: 320,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: '#2E5540',
    marginBottom: 10,
  },
  body: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
    color: '#6B7C74',
    lineHeight: 22,
    marginBottom: 24,
  },
  allowButton: {
    backgroundColor: '#2E5540',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  allowText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  notNowButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  notNowText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    color: '#6B7C74',
  },
});

export default NotificationPermissionPrompt;
