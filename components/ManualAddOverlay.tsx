/**
 * ManualAddOverlay - Phase 6 (Brand Refresh)
 * Full-screen modal for manual data entry with Gremly brand styling
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

type TabType = 'habits' | 'todos' | 'journal' | 'catchall';

interface ManualAddOverlayProps {
  visible: boolean;
  defaultTab?: TabType;
  onClose: () => void;
  onSubmit: (payload: ManualAddPayload) => void;
}

export function ManualAddOverlay({
  visible,
  defaultTab = 'habits',
  onClose,
  onSubmit,
}: ManualAddOverlayProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [reminders, setReminders] = useState<TReminderRule[]>([]);
  const insets = useSafeAreaInsets();

  console.log('[ManualAddOverlay] RENDER - activeTab:', activeTab, 'visible:', visible);

  // Reset state when modal closes
  const handleClose = () => {
    setActiveTab(defaultTab);
    setReminders([]);
    onClose();
  };

  // Handle submit from child forms
  const handleSubmit = (payload: ManualAddPayload) => {
    onSubmit(payload);
    handleClose();
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
                  style={[overlayStyles.body, { backgroundColor: '#FF0000' }]}
                  contentContainerStyle={overlayStyles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  testID="manual-body-scroll"
                >
                  <View
                    testID="manual-body"
                    style={{ backgroundColor: '#00FF00', minHeight: 400, padding: 10 }}
                  >
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
