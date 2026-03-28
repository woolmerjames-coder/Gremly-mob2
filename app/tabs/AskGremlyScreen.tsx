import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Clock, SquarePen } from 'lucide-react-native';
import MascotLottie, { type MascotLottieHandle } from '../components/MascotLottie';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase/client';

const MOSS = '#2E5540';
const LINEN = '#F9F6F1';

const CHIPS = [
  'What should I focus on today?',
  'Help me think through something',
  "What's coming up this week?",
];

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AskGremlyScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const mascotRef = useRef<MascotLottieHandle>(null);
  const { user } = useAuth();
  const [historyVisible, setHistoryVisible] = useState(false);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !user?.id) return;

      try {
        const { data, error } = await supabase
          .from('space_chats')
          .insert({ title: 'New conversation', user_id: user.id, space_id: null })
          .select('id')
          .single();

        if (error || !data) {
          Alert.alert('Error', 'Could not create chat');
          return;
        }

        navigation.navigate('AskGremlyChat', {
          chatId: data.id,
          initialMessage: text.trim(),
        });
      } catch {
        Alert.alert('Error', 'Could not create chat');
      }
    },
    [user?.id, navigation],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setHistoryVisible(true)}
          accessibilityLabel="Chat history"
        >
          <Clock size={20} color={MOSS} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText}>Ask Gremly</Text>
          <View style={styles.headerUnderline} />
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {}}
          accessibilityLabel="New chat"
        >
          <SquarePen size={20} color={MOSS} />
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.greeting}>What's on your mind?</Text>

        <View style={styles.chipsContainer}>
          {CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip}
              style={styles.chip}
              onPress={() => handleSend(chip)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom input area */}
      <View style={[styles.bottomArea, { paddingBottom: 80 }]}>
        <MascotLottie ref={mascotRef} style={styles.mascot} />
        <ChatComposer onSend={handleSend} placeholder="Ask Gremly anything..." />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LINEN,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitleText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    color: '#222222',
  },
  headerUnderline: {
    width: 50,
    height: 2.5,
    backgroundColor: '#E0C47A',
    borderRadius: 2,
    marginTop: 4,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(46,85,64,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  greeting: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: 'rgba(34,34,34,0.7)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  chip: {
    backgroundColor: 'rgba(46,85,64,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.1)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: MOSS,
  },
  bottomArea: {
    paddingHorizontal: 16,
  },
  mascot: {
    position: 'absolute',
    top: -88,
    right: 0,
    width: 95,
    height: 111,
    zIndex: 10,
  },
});
