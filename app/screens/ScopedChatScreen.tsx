// app/screens/ScopedChatScreen.tsx
//
// World-chat and Chapter-chat screen.
// Params: { scopeType: 'world' | 'chapter', scopeId, scopeName, chatId? }
//
// Architecture:
//   - Creates a new scope_chat row (chat_type = scopeType) if chatId is absent
//   - Streams via world_chat / chapter_chat Cortex lanes
//   - After each save (note/todo/habit) from the reply pill, auto-inserts a
//     drop_world_links or drop_chapter_links row (source = 'user', confidence = 1)
//   - For chapter chats, also inserts drop_world_links for the chapter's parent world
//   - Polls extracted_items from the scope_chat after each turn

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
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
import {
  callWorldChatStreaming,
  callChapterChatStreaming,
  callEnrichPhase15a,
  callEnrichPhase2,
  callChatFullSummary,
} from '../../lib/cortex/CortexClient';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase/client';
import { nowTimestamp } from '../../lib/date/DateService';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { ChevronLeft } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SpaceChat } from '../../lib/types';
import { useCanChat, useCanCreate } from '../../lib/store/lifecycleSelectors';
import { useWakeOnInput } from '../../hooks/useWakeOnInput';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import * as Haptics from 'expo-haptics';

type RouteT = RouteProp<RootStackParamList, 'ScopedChat'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'ScopedChat'>;

export default function ScopedChatScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const { scopeType, scopeId, scopeName, chatId: initialChatId } = route.params;
  const { userId } = useAuth();
  const canChat = useCanChat();
  const canCreate = useCanCreate();
  const wakeOnInput = useWakeOnInput();

  const flatListRef = useRef<any>(null);
  const streamingControllerRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordBufferRef = useRef<string[]>([]);
  const wordFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [activeChat, setActiveChat] = useState<SpaceChat | null>(null);
  const [sending, setSending] = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [extractions, setExtractions] = useState<any[]>([]);
  const [autoTitle, setAutoTitle] = useState<string | null>(null);
  const [runningSummary, setRunningSummary] = useState<string | null>(null);

  // ── Initialise or resume chat ───────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      if (initialChatId) {
        // Resume existing chat — fetch from scope_chats
        const { data } = await supabase
          .from('scope_chats')
          .select('*')
          .eq('id', initialChatId)
          .single();
        if (data) setActiveChat(data as SpaceChat);
        return;
      }
      // Create a fresh chat
      try {
        const chat =
          scopeType === 'world'
            ? await useGremlyStore.getState().createWorldChat(scopeId, `Chat about ${scopeName}`)
            : await useGremlyStore.getState().createChapterChat(scopeId, `Chat about ${scopeName}`);
        if (chat) setActiveChat(chat);
      } catch {
        // Non-fatal — the chat UI will still appear, send will fail gracefully
      }
    }
    if (userId) init();
  }, [userId, initialChatId, scopeType, scopeId, scopeName]);

  // ── Polling extractions ─────────────────────────────────────────────────────

  const pollExtractions = useCallback(async (chatId: string) => {
    const { data } = await supabase
      .from('scope_chats')
      .select('extracted_items, dismissed_extractions, saved_extraction_ids, auto_title, running_summary')
      .eq('id', chatId)
      .single();
    if (!data) return;
    const exclude = new Set([
      ...((data as any).dismissed_extractions || []),
      ...((data as any).saved_extraction_ids || []),
    ]);
    setExtractions(
      ((data as any).extracted_items || []).filter((e: any) => !exclude.has(e.id)),
    );
    setAutoTitle((data as any).auto_title || null);
    setRunningSummary((data as any).running_summary || null);
  }, []);

  useEffect(() => {
    if (activeChat?.id) pollExtractions(activeChat.id);
  }, [activeChat?.id, pollExtractions]);

  // ── Message hook ────────────────────────────────────────────────────────────

  const {
    messages,
    sendUserMessage,
    createStreamingMessage,
    updateStreamingContent,
    updateStreamingSearching,
    finalizeStreamingMessage,
    cancelStreaming,
    updateMessage,
  } = useChatMessages(activeChat?.id ?? undefined, null);

  // ── Word-flush timer ────────────────────────────────────────────────────────

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

  // Auto-scroll
  useEffect(() => {
    if (!activeChat) return;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages, activeChat]);

  // ── Send message ────────────────────────────────────────────────────────────

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

      let receivedChunks = false;
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);

      const handleStreamTimeout = () => {
        console.warn('[ScopedChat] Stream timeout');
        stopWordFlushInterval();
        streamingControllerRef.current?.close();
        const msgId = streamingMessageIdRef.current;
        streamingMessageIdRef.current = null;
        if (msgId) {
          finalizeStreamingMessage(msgId, 'Something went wrong. Try sending your message again.');
        }
        setSending(false);
      };

      const streamOpts = {
        scopeId,
        scopeName,
        chatId: chat.id,
        userId: userId ?? undefined,
      };

      const streamFn = scopeType === 'world' ? callWorldChatStreaming : callChapterChatStreaming;

      streamingControllerRef.current = streamFn(conversationHistory, streamOpts, {
        onChunk: (delta: string) => {
          receivedChunks = true;
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          streamTimeoutRef.current = setTimeout(handleStreamTimeout, 15000);

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
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
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

          // Poll extractions shortly after turn completes
          setTimeout(() => pollExtractions(chat.id), 2000);
          setTimeout(() => pollExtractions(chat.id), 5000);

          supabase
            .from('scope_chats')
            .update({ updated_at: nowTimestamp() })
            .eq('id', chat.id)
            .then(() => {});

          setSending(false);
        },
        onError: (error: string) => {
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          console.error('[ScopedChat] Stream error:', error);
          stopWordFlushInterval();
          const msgId = streamingMessageIdRef.current;
          streamingMessageIdRef.current = null;
          if (msgId) cancelStreaming(msgId);
          setSending(false);
        },
      });

      streamTimeoutRef.current = setTimeout(() => {
        if (!receivedChunks) handleStreamTimeout();
      }, 15000);
    },
    [
      messages,
      scopeId,
      scopeName,
      scopeType,
      userId,
      sendUserMessage,
      createStreamingMessage,
      startWordFlushInterval,
      stopWordFlushInterval,
      updateStreamingSearching,
      updateMessage,
      finalizeStreamingMessage,
      cancelStreaming,
      pollExtractions,
    ],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || sending) return;
      if (!canChat) return;
      if (!activeChat) return;
      sendToChat(activeChat, text.trim());
    },
    [activeChat, canChat, sending, sendToChat],
  );

  // ── Auto-link helper ────────────────────────────────────────────────────────

  const autoLinkDrop = useCallback(
    async (dropId: string, dropType: 'note' | 'todo' | 'habit') => {
      if (!userId) return;
      if (scopeType === 'world') {
        const link = {
          drop_id: dropId,
          drop_type: dropType,
          world_id: scopeId,
          owner_id: userId,
          relevance_score: 1.0,
          assigned_by: 'user' as const,
          reason: 'saved_from_chat',
        };
        const { data, error } = await supabase
          .from('drop_world_links')
          .insert(link)
          .select()
          .single();
        if (!error && data) {
          useGremlyStore.setState((s) => ({
            dropWorldLinks: [data as any, ...s.dropWorldLinks],
          }));
        }
      } else {
        // chapter — link to chapter
        const chapterLink = {
          drop_id: dropId,
          drop_type: dropType,
          chapter_id: scopeId,
          owner_id: userId,
          relevance_score: 1.0,
          assigned_by: 'user' as const,
          reason: 'saved_from_chat',
        };
        const { data: chData, error: chError } = await supabase
          .from('drop_chapter_links')
          .insert(chapterLink)
          .select()
          .single();
        if (!chError && chData) {
          useGremlyStore.setState((s) => ({
            dropChapterLinks: [chData as any, ...s.dropChapterLinks],
          }));
        }
        // Also link to the parent world if known
        const chapter = useGremlyStore.getState().chapters.find((c) => c.id === scopeId);
        const parentWorldId = chapter?.primary_world_id;
        if (parentWorldId) {
          const worldLink = {
            drop_id: dropId,
            drop_type: dropType,
            world_id: parentWorldId,
            owner_id: userId,
            relevance_score: 1.0,
            assigned_by: 'user' as const,
            reason: 'saved_from_chat',
          };
          const { data: wData, error: wError } = await supabase
            .from('drop_world_links')
            .insert(worldLink)
            .select()
            .single();
          if (!wError && wData) {
            useGremlyStore.setState((s) => ({
              dropWorldLinks: [wData as any, ...s.dropWorldLinks],
            }));
          }
        }
      }
    },
    [userId, scopeType, scopeId],
  );

  // ── Render helpers ──────────────────────────────────────────────────────────

  const keyExtractor = useCallback((item: any) => item.id, []);

  const renderMessage = useCallback(
    ({ item }: { item: any }) => (
      <ChatBubble
        message={item}
      />
    ),
    [],
  );

  // ── Save sheet handler ──────────────────────────────────────────────────────

  const handleSaveItems = useCallback(
    async (items: any[], includeSummary: boolean) => {
      if (!canCreate) {
        navigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }

      let fullSummary: string | null = null;
      if (includeSummary && activeChat?.id) {
        setSavingChat(true);
        try {
          const result = await callChatFullSummary(activeChat.id);
          fullSummary = result.summary;
        } catch {
          /* fall back to runningSummary */
        } finally {
          setSavingChat(false);
        }
      }
      setSaveSheetVisible(false);

      const store = useGremlyStore.getState();
      const savedIds: string[] = [];

      for (const item of items) {
        try {
          const bucket = item.type === 'todo' ? 'todo' : item.type === 'habit' ? 'habit' : 'log';
          const subtype = item.type === 'note' ? item.subtype || 'general' : null;
          const enrichText = item.title + (item.body ? '. ' + item.body : '');

          const [phase15, phase2] = await Promise.all([
            callEnrichPhase15a({ text: enrichText, bucket, subtype }),
            callEnrichPhase2({ text: enrichText, bucket, subtype }),
          ]);

          const smartTitle =
            (phase15.ok && phase15.smart_title) ||
            (phase2.ok && phase2.smart_title) ||
            item.title;

          const tags = (phase2.ok && phase2.tags) || [];
          const timeEst = phase2.ok ? phase2.time_estimate_minutes : null;
          const views = { confirmation_message: null, bucket_confirmed: true };

          let savedDrop: any = null;

          if (item.type === 'todo') {
            savedDrop = await store.createTodo({
              title: smartTitle,
              name: smartTitle,
              body: item.body || null,
              due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
              due_day: item.due_date || null,
              tags,
              time_estimate_minutes: timeEst,
              views,
              ai_placed: true,
              origin: 'chat_save',
            });
            if (savedDrop?.id) await autoLinkDrop(savedDrop.id, 'todo');
          } else if (item.type === 'habit') {
            savedDrop = await store.createHabit({
              name: smartTitle,
              frequency: (phase2.ok && phase2.extracted_frequency) || item.frequency || 'daily',
              subtype: item.habit_subtype === 'break' ? 'break_habit' : 'start_habit',
              notes: item.body || null,
              tags,
              time_estimate_minutes: timeEst,
              views,
              ai_placed: true,
              origin: 'chat_save',
            });
            if (savedDrop?.id) await autoLinkDrop(savedDrop.id, 'habit');
          } else {
            savedDrop = await store.createNote({
              title: smartTitle,
              body: item.body || item.title,
              subtype: subtype || 'general',
              tags,
              views,
              ai_placed: true,
              origin: 'chat_save',
            });
            if (savedDrop?.id) await autoLinkDrop(savedDrop.id, 'note');
          }
          savedIds.push(item.id);
        } catch (err) {
          console.warn('[ScopedChat] Save failed:', item.title, err);
        }
      }

      if (includeSummary && autoTitle) {
        try {
          const note = await store.createNote({
            title: autoTitle,
            body: fullSummary || runningSummary || autoTitle,
            subtype: 'general',
            ai_placed: true,
            origin: 'chat_save',
          });
          if (note?.id) await autoLinkDrop(note.id, 'note');
        } catch (err) {
          console.warn('[ScopedChat] Failed to save summary:', err);
        }
      }

      if (activeChat?.id && savedIds.length > 0) {
        // Mark as saved in supabase
        const { data: chatData } = await supabase
          .from('scope_chats')
          .select('saved_extraction_ids')
          .eq('id', activeChat.id)
          .single();
        const merged = [
          ...new Set([...((chatData as any)?.saved_extraction_ids || []), ...savedIds]),
        ];
        await supabase
          .from('scope_chats')
          .update({ saved_extraction_ids: merged } as any)
          .eq('id', activeChat.id);
        setExtractions((prev) => prev.filter((e) => !savedIds.includes(e.id)));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [
      activeChat,
      autoTitle,
      runningSummary,
      canCreate,
      navigation,
      autoLinkDrop,
    ],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const title = scopeType === 'world'
    ? `Chat about ${scopeName}`
    : `Chat about ${scopeName}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={lightTokens.colors.worldsInk} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText}>{title}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <AppFlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          removeClippedSubviews={false}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={15}
          onContentSizeChange={() => {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Ask me anything about {scopeName}.
              </Text>
            </View>
          }
          ListFooterComponent={null}
        />

        <View style={styles.bottomSection}>
          <SaveIndicatorPill
            count={extractions.length}
            visible={extractions.length > 0}
            onPress={() => setSaveSheetVisible(true)}
            style={{ position: 'absolute', top: -30, right: 105, zIndex: 11 }}
          />
          <ChatComposer
            onSend={handleSend}
            onChangeText={() => wakeOnInput()}
            disabled={sending || !activeChat}
            placeholder="Ask me anything..."
          />
        </View>
      </KeyboardAvoidingView>

      <SaveSheet
        visible={saveSheetVisible}
        onClose={() => setSaveSheetVisible(false)}
        extractions={extractions}
        autoTitle={autoTitle}
        runningSummary={runningSummary}
        saving={savingChat}
        onDismiss={(id: string) => {
          if (!activeChat?.id) return;
          setExtractions((prev) => prev.filter((e) => e.id !== id));
          supabase
            .from('scope_chats')
            .select('dismissed_extractions')
            .eq('id', activeChat.id)
            .single()
            .then(({ data }) => {
              const merged = [...((data as any)?.dismissed_extractions || []), id];
              supabase
                .from('scope_chats')
                .update({ dismissed_extractions: merged } as any)
                .eq('id', activeChat.id)
                .then(() => {});
            });
        }}
        onSave={handleSaveItems}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.worldsSurface,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.chapterActionBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: lightTokens.colors.worldsInk,
  },
  headerRight: { width: 40 },
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
    textAlign: 'center',
    opacity: 0.6,
  },
  bottomSection: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
});
