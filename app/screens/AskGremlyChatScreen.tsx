import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlatList } from '../../components/common/AppFlatList';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { callGeneralChatStreaming } from '../../lib/cortex/CortexClient';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase/client';
import { nowTimestamp } from '../../lib/date/DateService';
import MascotLottie, { type MascotLottieHandle } from '../components/MascotLottie';
import { ChevronLeft, Bookmark } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { SpaceChat, SpaceChatMessage } from '../../lib/types';

const MOSS = '#2E5540';
const LINEN = '#F9F6F1';

type Props = NativeStackScreenProps<RootStackParamList, 'AskGremlyChat'>;

export default function AskGremlyChatScreen({ route, navigation }: Props) {
  const { chatId: paramChatId, initialMessage } = route.params ?? {};
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const mascotRef = useRef<MascotLottieHandle>(null);
  const flatListRef = useRef<any>(null);
  const streamingControllerRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const wordBufferRef = useRef<string[]>([]);
  const wordFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialMessageSentRef = useRef(false);

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const autoTitle = useGremlyStore((s) => s.generalChatAutoTitle);

  const {
    messages,
    loading: messagesLoading,
    sendUserMessage,
    createStreamingMessage,
    updateStreamingContent,
    updateStreamingSearching,
    finalizeStreamingMessage,
    cancelStreaming,
    updateMessage,
  } = useChatMessages(paramChatId, null);

  // Word buffer flush (batches words at 50ms intervals, 3 at a time)
  const flushWordBuffer = useCallback(() => {
    const messageId = streamingMessageIdRef.current;
    if (!messageId || wordBufferRef.current.length === 0) return;
    const wordsToFlush = wordBufferRef.current.splice(0, 3);
    updateStreamingContent(messageId, wordsToFlush.join(''), 'append');
  }, [updateStreamingContent]);

  const startWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) return;
    wordFlushIntervalRef.current = setInterval(flushWordBuffer, 50);
  }, [flushWordBuffer]);

  const stopWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) {
      clearInterval(wordFlushIntervalRef.current);
      wordFlushIntervalRef.current = null;
    }
    if (streamingMessageIdRef.current && wordBufferRef.current.length > 0) {
      updateStreamingContent(
        streamingMessageIdRef.current,
        wordBufferRef.current.join(''),
        'append',
      );
      wordBufferRef.current = [];
    }
  }, [updateStreamingContent]);

  // Initialize chat
  useEffect(() => {
    if (!paramChatId) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('space_chats')
        .select('*')
        .eq('id', paramChatId)
        .single();
      if (data) {
        setChat(data as SpaceChat);
        useGremlyStore.getState().setActiveGeneralChat(paramChatId);
      }
      setLoading(false);
    })();
  }, [paramChatId]);

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!chat?.id || sending || !text.trim()) return;
      setSending(true);

      // Send user message
      await sendUserMessage(text.trim());

      // Create streaming placeholder
      const streamingResult = await createStreamingMessage();
      if (!streamingResult) {
        setSending(false);
        return;
      }
      const { messageId } = streamingResult;
      streamingMessageIdRef.current = messageId;
      startWordFlushInterval();

      // Build conversation history for the API
      const conversationHistory = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      conversationHistory.push({ role: 'user', content: text.trim() });

      streamingControllerRef.current = callGeneralChatStreaming(
        conversationHistory,
        {
          chatId: chat.id,
          userId: userId ?? undefined,
        },
        {
          onChunk: (delta: string) => {
            const chunkMsgId = streamingMessageIdRef.current;
            if (chunkMsgId) {
              updateStreamingSearching(chunkMsgId, false, null);
              updateMessage(chunkMsgId, { isLoadingHint: false } as any);
            }
            wordBufferRef.current.push(...delta.split(/(?<=\s)/));
          },
          onSearching: (query: string, isLoadingHint?: boolean) => {
            const msgId = streamingMessageIdRef.current;
            if (msgId) {
              updateStreamingSearching(msgId, true, query);
              if (isLoadingHint) updateMessage(msgId, { isLoadingHint: true } as any);
            }
          },
          onFetching: (isFetching: boolean, fetchingUrl: string | null) => {
            const msgId = streamingMessageIdRef.current;
            if (msgId) updateMessage(msgId, { isFetching, fetchingUrl } as any);
          },
          onComplete: async (finalText: string, richResult?: any) => {
            stopWordFlushInterval();
            const msgId = streamingMessageIdRef.current;
            streamingMessageIdRef.current = null;

            const content =
              typeof finalText === 'string' ? finalText : richResult?.content || finalText;

            if (msgId) {
              await finalizeStreamingMessage(msgId, content);

              // Apply sources if present
              if (richResult?.sources) {
                updateMessage(msgId, { sources: richResult.sources } as any);
              }
            }

            // Poll for extractions after worker processes
            setTimeout(() => {
              useGremlyStore.getState().updateGeneralChatExtractions(chat.id);
            }, 3000);

            // Update chat's updated_at
            supabase
              .from('space_chats')
              .update({ updated_at: nowTimestamp() })
              .eq('id', chat.id)
              .then(() => {});

            setSending(false);
          },
          onError: (error: string, _partialText: string) => {
            console.error('[AskGremlyChat] Stream error:', error);
            stopWordFlushInterval();
            const msgId = streamingMessageIdRef.current;
            streamingMessageIdRef.current = null;
            if (msgId) cancelStreaming(msgId);
            setSending(false);
          },
        },
      );
    },
    [
      chat,
      sending,
      messages,
      userId,
      sendUserMessage,
      createStreamingMessage,
      startWordFlushInterval,
      stopWordFlushInterval,
      updateStreamingContent,
      updateStreamingSearching,
      updateMessage,
      finalizeStreamingMessage,
      cancelStreaming,
    ],
  );

  // Send initial message after mount
  useEffect(() => {
    if (initialMessage && chat && !initialMessageSentRef.current && !messagesLoading) {
      initialMessageSentRef.current = true;
      setTimeout(() => handleSend(initialMessage), 200);
    }
  }, [initialMessage, chat, messagesLoading, handleSend]);

  const keyExtractor = useCallback((item: SpaceChatMessage) => item.id, []);

  const renderMessage = useCallback(
    ({ item }: { item: SpaceChatMessage }) => (
      <View style={styles.messageContainer}>
        <ChatBubble message={item} testID={`chat-bubble-${item.id}`} />
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color="#222222" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Ask Gremly</Text>
            <View style={styles.headerUnderline} />
            {autoTitle ? <Text style={styles.headerSubtitle}>{autoTitle}</Text> : null}
          </View>

          <TouchableOpacity style={styles.headerBtn} onPress={() => {}}>
            <Bookmark size={20} color={MOSS} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <AppFlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          style={styles.messages}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.emptyListContent,
          ]}
          removeClippedSubviews={false}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={15}
          onContentSizeChange={() => {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }}
          ListEmptyComponent={<View style={styles.flex} />}
          ListFooterComponent={null}
        />

        {/* Bottom: Mascot + Composer */}
        <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 8) }}>
          <View style={styles.composerContainer}>
            <MascotLottie ref={mascotRef} style={styles.mascot} />
            <ChatComposer onSend={handleSend} disabled={sending} placeholder="Type a message..." />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: LINEN },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: '#222222',
  },
  headerUnderline: {
    width: 36,
    height: 2.5,
    backgroundColor: '#E0C47A',
    borderRadius: 2,
    marginTop: 4,
  },
  headerSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(34,34,34,0.55)',
    marginTop: 2,
  },
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 200,
  },
  emptyListContent: { flex: 1 },
  messageContainer: { marginBottom: 8 },
  composerContainer: { position: 'relative' as const },
  mascot: {
    position: 'absolute' as const,
    top: -66,
    right: 0,
    width: 95,
    height: 111,
    zIndex: 10,
  },
});
