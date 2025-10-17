/**
 * ManualAddOverlay - Phase 6 (Brand Refresh + Cortex Integration)
 * Full-screen modal for manual data entry with Gremly brand styling
 * Handles Cortex classification and repo persistence internally for catch-all
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { overlayStyles } from '../app/styles/manualAdd.styles';
import { ManualAddHeader } from './overlay/ManualAddHeader';
import { ManualAddFooter } from './overlay/ManualAddFooter';
import { ReminderSelector } from './overlay/ReminderSelector';
import { HabitsTab } from './overlay/HabitsTab';
import { TodoForm } from './overlay/TodoForm';
import { JournalForm } from './overlay/JournalForm';
import { CatchAllForm } from './overlay/CatchAllForm';
import type { ManualAddPayload, TReminderRule } from '../app/schemas/manualAdd';
import { useCortex } from '../providers/CortexProvider';
import { useRepo } from '../providers/RepoProvider';
import type { CortexOutput } from '../cortex/ICortexEngine';
import type { CreateRecordInput } from '../lib/repo/IRepo';

type TabType = 'habits' | 'todos' | 'journal' | 'catchall';

interface ManualAddOverlayProps {
  visible: boolean;
  defaultTab?: TabType;
  onClose: () => void;
  onSubmit?: (payload: ManualAddPayload) => void; // Optional - catch-all handles internally
  onCatchAllSaved?: () => void;
}

export function ManualAddOverlay({
  visible,
  defaultTab = 'habits',
  onClose,
  onSubmit,
  onCatchAllSaved,
}: ManualAddOverlayProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [reminders, setReminders] = useState<TReminderRule[]>([]);
  const insets = useSafeAreaInsets();
  const cortex = useCortex();
  const repo = useRepo();

  const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
  const classifyFlag = (process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false') === 'true';

  console.log('[ManualAddOverlay] RENDER - activeTab:', activeTab, 'visible:', visible);

  // Reset state when modal closes
  const handleClose = () => {
    setActiveTab(defaultTab);
    setReminders([]);
    onClose();
  };

  // Handle submit from child forms
  const handleSubmit = async (payload: ManualAddPayload) => {
    // For catch-all: handle classification and persistence internally
    if (payload.type === 'catchall' && payload.data?.entry) {
      try {
        const inputText = payload.data.entry.trim();

        if (DEBUG) {
          console.log('[OVERLAY][CATCHALL] start', { len: inputText.length, classifyFlag });
        }

        let res: CortexOutput | null = null;

        if (classifyFlag && inputText) {
          try {
            if (DEBUG) console.log('[OVERLAY][CATCHALL] invoking engine.classify...');
            res = await cortex.classify({ text: inputText, spaceId: null });
            if (DEBUG) console.log('[OVERLAY][CATCHALL] result:', res);
          } catch (e) {
            if (DEBUG) console.error('[OVERLAY][CATCHALL] error, fallback:', String(e));
            // ManagedCortexEngine handles fallback to heuristic automatically
          }
        }

        // Map classification to repo payload
        let finalPayload: CreateRecordInput;

        if (!res) {
          finalPayload = {
            type: 'note',
            title: '',
            body: inputText,
            subtype: 'catchall',
            space_id: null,
            ai_placed: false,
            why_string: 'Heuristic default.',
          };
        } else {
          switch (res.type) {
            case 'note':
              finalPayload = {
                type: 'note',
                title: '',
                body: inputText,
                subtype: res.subtype || 'catchall',
                space_id: null,
                ai_placed: res.aiPlaced || false,
                why_string: res.whyString || 'Heuristic default.',
              };
              break;
            case 'todo':
              finalPayload = {
                type: 'todo',
                title: inputText,
                body: inputText,
                due_date: null,
                undefined_due: res.undefinedDue,
                space_id: null,
                ai_placed: res.aiPlaced || false,
                why_string: res.whyString || 'Classified as todo.',
              };
              break;
            case 'habit':
            default:
              finalPayload = {
                type: 'habit',
                title: inputText,
                frequency: res.type === 'habit' ? res.frequency : 'daily',
                space_id: null,
                ai_placed: res.aiPlaced || false,
                why_string: res.whyString || 'Classified as habit.',
              };
              break;
          }
        }

        if (DEBUG) {
          console.log('[OVERLAY][CATCHALL] final payload:', finalPayload);
        }

        finalPayload.origin = 'catchall';

        if (finalPayload.type === 'note' && finalPayload.subtype === 'catchall') {
          finalPayload.ai_placed = true;
          finalPayload.why_string = finalPayload.why_string ?? 'Saved from Catch All.';
        }

        await repo.create(finalPayload);
        onCatchAllSaved?.();

        // Show success
        const toastMessage = finalPayload.ai_placed
          ? 'Saved to the Hub. I put this here.'
          : 'Saved to the Hub.';

        if (Platform.OS === 'web') {
          alert(toastMessage);
        } else {
          Alert.alert('Success', toastMessage);
        }

        handleClose();
      } catch (err) {
        console.error('[OVERLAY][CATCHALL] save error:', err);
        Alert.alert('Error', 'Failed to save. Please try again.');
      }
      return;
    }

    // For other tabs, delegate to parent if provided
    if (onSubmit) {
      onSubmit(payload);
      handleClose();
    }
  };

  // Determine if reminders should be visible
  const showReminders = activeTab !== 'catchall';

  // Handle tab transitions
  const handleTabChange = (newTab: TabType) => {
    if (newTab === activeTab) return;

    console.log('[ManualAddOverlay] Tab change:', activeTab, '→', newTab);

    setActiveTab(newTab);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={overlayStyles.backdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[overlayStyles.card, { paddingBottom: insets.bottom + 16 }]}
                testID="manual-overlay"
              >
                {/* Header with tabs */}
                <ManualAddHeader
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  onClose={handleClose}
                />

                {/* Scrollable body */}
                <ScrollView
                  style={overlayStyles.body}
                  contentContainerStyle={overlayStyles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  testID="manual-body-scroll"
                >
                  <View testID="manual-body">
                    {activeTab === 'habits' && (
                      <HabitsTab reminders={reminders} onSubmit={handleSubmit} />
                    )}
                    {activeTab === 'todos' && (
                      <TodoForm reminders={reminders} onSubmit={handleSubmit} />
                    )}
                    {activeTab === 'journal' && (
                      <JournalForm reminders={reminders} onSubmit={handleSubmit} />
                    )}
                    {activeTab === 'catchall' && <CatchAllForm onSubmit={handleSubmit} />}
                  </View>
                </ScrollView>

                {/* Pinned reminders (except Catch-All) */}
                {showReminders && (
                  <View style={overlayStyles.pinnedReminders} testID="reminders-pinned">
                    <ReminderSelector value={reminders} onChange={setReminders} />
                  </View>
                )}

                {/* Footer */}
                <ManualAddFooter onExit={handleClose} />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
