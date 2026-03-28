import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppFlatList } from '../../components/common/AppFlatList';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { SaveIndicatorPill } from '../../components/chat/SaveIndicatorPill';
import { SaveSheet } from '../../components/chat/SaveSheet';
import { callGeneralChatStreaming, callEnrichPhase2 } from '../../lib/cortex/CortexClient';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase/client';
import { nowTimestamp } from '../../lib/date/DateService';
import MascotLottie, { type MascotLottieHandle } from '../components/MascotLottie';
import * as Haptics from 'expo-haptics';
import { Clock, SquarePen, ChevronLeft, Bookmark } from 'lucide-react-native';
import type { SpaceChat, SpaceChatMessage } from '../../lib/types';

const MOSS = '#2E5540';
const LINEN = '#F9F6F1';

const CHIPS = [
  'What should I focus on today?',
  'Help me think through something',
  "What's coming up this week?",
];

export default function AskGremlyScreen() {
  const { userId } = useAuth();
  const mascotRef = useRef<MascotLottieHandle>(null);
  const flatListRef = useRef<any>(null);
  const streamingControllerRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const wordBufferRef = useRef<string[]>([]);
  const wordFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [activeChat, setActiveChat] = useState<SpaceChat | null>(null);
  const [sending, setSending] = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);

  const autoTitle = useGremlyStore((s) => s.generalChatAutoTitle);
  const extractions = useGremlyStore((s) => s.generalChatExtractions);
  const runningSummary = useGremlyStore((s) => s.generalChatRunningSummary);

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
  } = useChatMessages(activeChat?.id, null);

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

  // Auto-scroll on new messages
  useEffect(() => {
    if (!activeChat) return;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages, activeChat]);

  // Poll extractions when resuming an existing chat
  useEffect(() => {
    if (activeChat?.id) {
      useGremlyStore.getState().updateGeneralChatExtractions(activeChat.id);
    }
  }, [activeChat?.id]);

  // Clear active chat in store when returning to empty state
  const goToEmptyState = useCallback(() => {
    setActiveChat(null);
    useGremlyStore.getState().setActiveGeneralChat(null);
  }, []);

  const sendToChat = useCallback(
    async (chat: SpaceChat, text: string) => {
      setSending(true);

      await sendUserMessage(text);

      const streamingResult = await createStreamingMessage();
      if (!streamingResult) {
        setSending(false);
        return;
      }
      const { messageId } = streamingResult;
      streamingMessageIdRef.current = messageId;
      startWordFlushInterval();

      const conversationHistory = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      conversationHistory.push({ role: 'user', content: text });

      streamingControllerRef.current = callGeneralChatStreaming(
        conversationHistory,
        { chatId: chat.id, userId: userId ?? undefined },
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
              if (richResult?.sources) {
                updateMessage(msgId, { sources: richResult.sources } as any);
              }
            }

            setTimeout(() => {
              useGremlyStore.getState().updateGeneralChatExtractions(chat.id);
            }, 2000);
            setTimeout(() => {
              useGremlyStore.getState().updateGeneralChatExtractions(chat.id);
            }, 5000);

            supabase
              .from('space_chats')
              .update({ updated_at: nowTimestamp() })
              .eq('id', chat.id)
              .then(() => {});

            setSending(false);
          },
          onError: (error: string, _partialText: string) => {
            console.error('[AskGremly] Stream error:', error);
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

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const trimmed = text.trim();

      if (activeChat) {
        if (sending) return;
        await sendToChat(activeChat, trimmed);
        return;
      }

      // Empty state → create new chat
      try {
        const chat = await useGremlyStore.getState().createGeneralChat(trimmed.slice(0, 60));
        if (!chat) {
          Alert.alert('Error', 'Could not create chat');
          return;
        }
        useGremlyStore.getState().setActiveGeneralChat(chat.id);
        setActiveChat(chat as SpaceChat);

        // Send the initial message after a tick so useChatMessages picks up the new chatId
        setTimeout(() => sendToChat(chat as SpaceChat, trimmed), 200);
      } catch {
        Alert.alert('Error', 'Could not create chat');
      }
    },
    [activeChat, sending, sendToChat],
  );

  const keyExtractor = useCallback((item: SpaceChatMessage) => item.id, []);

  const renderMessage = useCallback(
    ({ item }: { item: SpaceChatMessage }) => (
      <View style={styles.messageContainer}>
        <ChatBubble message={item} testID={`chat-bubble-${item.id}`} />
      </View>
    ),
    [],
  );

  const inConversation = activeChat !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        {inConversation ? (
          <View style={styles.chatHeader}>
            <TouchableOpacity
              style={styles.chatHeaderBtn}
              onPress={goToEmptyState}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color="#222222" />
            </TouchableOpacity>
            <View style={styles.chatHeaderCenter}>
              <Text style={styles.chatHeaderTitle}>Ask Gremly</Text>
              <View style={styles.chatHeaderUnderline} />
              {autoTitle ? <Text style={styles.chatHeaderSubtitle}>{autoTitle}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.chatHeaderBtn}
              onPress={() => setSaveSheetVisible(true)}
            >
              <Bookmark size={20} color={MOSS} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => {}}
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
              onPress={goToEmptyState}
              accessibilityLabel="New chat"
            >
              <SquarePen size={20} color={MOSS} />
            </TouchableOpacity>
          </View>
        )}

        {/* Content area — takes remaining space */}
        <View style={styles.flex}>
          {inConversation ? (
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
          ) : (
            <View style={styles.emptyState}>
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
            </View>
          )}
        </View>

        {/* Bottom section — fixed height, always at bottom */}
        <View style={styles.bottomSection}>
          <View style={styles.composerContainer}>
            <SaveIndicatorPill
              count={extractions.length}
              visible={!!activeChat && extractions.length > 0}
              onPress={() => setSaveSheetVisible(true)}
              style={{ position: 'absolute', top: -30, right: 105, zIndex: 11 }}
            />
            <Pressable style={styles.mascot}>
              <MascotLottie ref={mascotRef} />
            </Pressable>
            <ChatComposer
              onSend={handleSend}
              disabled={sending}
              placeholder={inConversation ? 'Type a message...' : 'Ask Gremly anything...'}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <SaveSheet
        visible={saveSheetVisible}
        onClose={() => setSaveSheetVisible(false)}
        extractions={extractions}
        autoTitle={autoTitle}
        runningSummary={runningSummary}
        onDismiss={(id) => {
          if (activeChat?.id) {
            useGremlyStore.getState().dismissExtraction(activeChat.id, id);
          }
        }}
        onSave={async (items, includeSummary) => {
          setSaveSheetVisible(false);

          const store = useGremlyStore.getState();
          const savedIds: string[] = [];

          for (const item of items) {
            try {
              const bucket =
                item.type === 'todo' ? 'todo' : item.type === 'habit' ? 'habit' : 'log';
              const subtype = item.type === 'note' ? item.subtype || 'general' : null;
              const enrichText = item.title + (item.body ? '. ' + item.body : '');

              const enriched = await callEnrichPhase2({
                text: enrichText,
                bucket,
                subtype,
              });

              const views = enriched.ok
                ? {
                    confirmation_message: enriched.confirmation_message || null,
                    bucket_confirmed: true,
                  }
                : { bucket_confirmed: true };

              const enrichedTitle = (enriched.ok && enriched.smart_title) || item.title;
              const enrichedTags = (enriched.ok && enriched.tags) || [];
              const enrichedTimeEst = enriched.ok ? enriched.time_estimate_minutes : null;

              if (item.type === 'todo') {
                await store.createTodo({
                  title: enrichedTitle,
                  name: enrichedTitle,
                  body: item.body || null,
                  due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
                  due_day: item.due_date || null,
                  tags: enrichedTags,
                  time_estimate_minutes: enrichedTimeEst,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
              } else if (item.type === 'habit') {
                await store.createHabit({
                  title: enrichedTitle,
                  name: enrichedTitle,
                  frequency:
                    (enriched.ok && enriched.extracted_frequency) || item.frequency || 'daily',
                  subtype: item.habit_subtype === 'break' ? 'break_habit' : 'start_habit',
                  notes: item.body || null,
                  tags: enrichedTags,
                  time_estimate_minutes: enrichedTimeEst,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
              } else {
                await store.createNote({
                  title: enrichedTitle,
                  body: item.body || item.title,
                  subtype: subtype || 'general',
                  tags: enrichedTags,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
              }
              savedIds.push(item.id);
            } catch (err) {
              console.warn('[AskGremly] Save failed:', item.title, err);
            }
          }

          if (includeSummary && autoTitle) {
            try {
              await store.createNote({
                title: autoTitle,
                body: runningSummary || autoTitle,
                subtype: 'general',
                ai_placed: true,
                origin: 'chat_save',
              });
            } catch (err) {
              console.warn('[AskGremly] Failed to save summary:', err);
            }
          }

          if (activeChat?.id && savedIds.length > 0) {
            await store.markExtractionsSaved(activeChat.id, savedIds);
          }

          for (let i = 0; i < savedIds.length + (includeSummary ? 1 : 0); i++) {
            try {
              await store.addGaugeContribution('drop', 0.08);
            } catch {
              /* non-blocking */
            }
          }

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          if (mascotRef.current) {
            mascotRef.current.celebrate();
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: LINEN },
  flex: { flex: 1 },

  // Empty state header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
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

  // Conversation header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  chatHeaderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderCenter: { flex: 1, alignItems: 'center' },
  chatHeaderTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: '#222222',
  },
  chatHeaderUnderline: {
    width: 36,
    height: 2.5,
    backgroundColor: '#E0C47A',
    borderRadius: 2,
    marginTop: 4,
  },
  chatHeaderSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(34,34,34,0.55)',
    marginTop: 2,
  },

  // Empty state content
  emptyState: { flex: 1, justifyContent: 'center' },
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

  // Messages
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 200,
  },
  emptyListContent: { flex: 1 },
  messageContainer: { marginBottom: 8 },

  // Bottom area
  bottomSection: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  composerContainer: { position: 'relative' as const },
  mascot: {
    position: 'absolute' as const,
    top: -88,
    right: 0,
    width: 95,
    height: 111,
    zIndex: 10,
  },
});
