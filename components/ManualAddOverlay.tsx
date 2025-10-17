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
  Animated,
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
  const [fadeAnim] = useState(new Animated.Value(1));
  const insets = useSafeAreaInsets();

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

  // Animate tab transitions
  const handleTabChange = (newTab: TabType) => {
    if (newTab === activeTab) return;

    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

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

                {/* Scrollable body with animation */}
                <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                  <ScrollView
                    style={overlayStyles.body}
                    contentContainerStyle={overlayStyles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
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
                  </ScrollView>
                </Animated.View>

                {/* Pinned reminders (except Catch-All) */}
                {showReminders && (
                  <View style={overlayStyles.pinnedReminders}>
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
