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
import type { CreateRecordInput, UpdateRecordInput } from '../lib/repo/IRepo';
import type { AppRecord } from '../lib/types';

type TabType = 'habits' | 'todos' | 'journal' | 'catchall';

interface ManualAddOverlayProps {
  visible: boolean;
  defaultTab?: TabType;
  onClose: () => void;
  onSubmit?: (payload: ManualAddPayload) => void; // Optional - catch-all handles internally
  onCatchAllSaved?: () => void;
  // Edit mode props
  mode?: 'create' | 'edit';
  initialType?: 'habit' | 'todo' | 'note';
  initialSubtype?: 'journal' | 'list' | 'catchall';
  initialValues?: Partial<AppRecord>;
  itemId?: string;
  onSaved?: () => void;
  // Sheet mode - when true, don't wrap in Modal (already in a Sheet)
  isSheet?: boolean;
}

export function ManualAddOverlay({
  visible,
  defaultTab = 'habits',
  onClose,
  onSubmit,
  onCatchAllSaved,
  mode = 'create',
  initialType,
  initialSubtype,
  initialValues,
  itemId,
  onSaved,
  isSheet = false,
}: ManualAddOverlayProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [reminders, setReminders] = useState<TReminderRule[]>([]);
  const insets = useSafeAreaInsets();
  const cortex = useCortex();
  const repo = useRepo();

  const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
  const classifyFlag = (process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false') === 'true';

  console.log(
    '[ManualAddOverlay] RENDER - activeTab:',
    activeTab,
    'visible:',
    visible,
    'mode:',
    mode,
  );

  // Initialize edit mode: set active tab and prefill form fields
  React.useEffect(() => {
    if (mode === 'edit' && initialType) {
      // Set appropriate tab based on item type
      if (initialType === 'habit') {
        setActiveTab('habits');
      } else if (initialType === 'todo') {
        setActiveTab('todos');
      } else if (initialType === 'note') {
        if (initialSubtype === 'journal') {
          setActiveTab('journal');
        } else {
          // list or catchall
          setActiveTab('catchall');
        }
      }
    }
  }, [mode, initialType, initialSubtype]);

  // Reset state when modal closes
  const handleClose = () => {
    setActiveTab(defaultTab);
    setReminders([]);
    onClose();
  };

  // Handle submit from child forms
  const handleSubmit = async (payload: ManualAddPayload) => {
    // EDIT MODE: Update existing record
    if (mode === 'edit' && itemId && initialType) {
      try {
        console.log('[ManualAddOverlay] Edit mode - updating:', itemId, payload);

        // Build update payload based on type
        let updatePayload: UpdateRecordInput;

        if (initialType === 'habit' && payload.type === 'habits' && payload.data) {
          const habitData = payload.data as { name: string; frequency: string };
          updatePayload = {
            id: itemId,
            patch: {
              type: 'habit',
              title: habitData.name,
              frequency: habitData.frequency as 'daily' | 'weekly' | 'monthly',
              ai_placed: false,
            } as Partial<AppRecord>,
          };
        } else if (initialType === 'todo' && payload.type === 'todos' && payload.data) {
          const todoData = payload.data as { name: string; deadline?: string; notes?: string };
          updatePayload = {
            id: itemId,
            patch: {
              type: 'todo',
              title: todoData.name,
              due_date: todoData.deadline || null,
              body: todoData.notes || null,
              ai_placed: false,
            } as Partial<AppRecord>,
          };
        } else if (initialType === 'note' && payload.data) {
          // For notes, preserve the subtype from initialValues
          const noteSubtype = initialValues?.type === 'note' ? initialValues.subtype : 'other';
          updatePayload = {
            id: itemId,
            patch: {
              type: 'note',
              subtype: noteSubtype,
              title: (payload.data as { tags?: string }).tags || null,
              body: (payload.data as { entry?: string }).entry || null,
              ai_placed: false,
            } as Partial<AppRecord>,
          };
        } else {
          throw new Error('Unsupported edit type');
        }

        await repo.update(updatePayload);

        // Call onSaved and close immediately
        onSaved?.();
        handleClose();

        // Show success message after closing (non-blocking)
        setTimeout(() => {
          if (Platform.OS === 'web') {
            alert('Saved');
          } else {
            Alert.alert('Success', 'Saved');
          }
        }, 100);

        return;
      } catch (err) {
        console.error('[ManualAddOverlay] Edit save error:', err);
        Alert.alert('Error', 'Failed to save. Please try again.');
        return;
      }
    }

    // CREATE MODE: For catch-all: handle classification and persistence internally
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

  // Sheet mode: return content without card wrapper - ActionSheet provides the container
  if (isSheet) {
    return (
      <View
        style={{
          flex: 1,
          flexDirection: 'column',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 16,
        }}
        testID="manual-overlay-sheet"
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
              <HabitsTab
                reminders={reminders}
                onSubmit={handleSubmit}
                mode={mode}
                initialValues={initialValues}
              />
            )}
            {activeTab === 'todos' && (
              <TodoForm
                reminders={reminders}
                onSubmit={handleSubmit}
                mode={mode}
                initialValues={initialValues}
              />
            )}
            {activeTab === 'journal' && (
              <JournalForm
                reminders={reminders}
                onSubmit={handleSubmit}
                mode={mode}
                initialValues={initialValues}
              />
            )}
            {activeTab === 'catchall' && (
              <CatchAllForm onSubmit={handleSubmit} mode={mode} initialValues={initialValues} />
            )}
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
    );
  }

  // The main content for Modal mode
  const cardContent = (
    <View
      style={[overlayStyles.card, { paddingBottom: insets.bottom + 16 }]}
      testID="manual-overlay"
    >
      {/* Header with tabs */}
      <ManualAddHeader activeTab={activeTab} onTabChange={handleTabChange} onClose={handleClose} />

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
            <HabitsTab
              reminders={reminders}
              onSubmit={handleSubmit}
              mode={mode}
              initialValues={initialValues}
            />
          )}
          {activeTab === 'todos' && (
            <TodoForm
              reminders={reminders}
              onSubmit={handleSubmit}
              mode={mode}
              initialValues={initialValues}
            />
          )}
          {activeTab === 'journal' && (
            <JournalForm
              reminders={reminders}
              onSubmit={handleSubmit}
              mode={mode}
              initialValues={initialValues}
            />
          )}
          {activeTab === 'catchall' && (
            <CatchAllForm onSubmit={handleSubmit} mode={mode} initialValues={initialValues} />
          )}
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
  );

  // Modal mode: wrap in Modal with backdrop
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
          <View style={overlayStyles.backdrop}>{cardContent}</View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
