/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ScheduleModal.tsx — Unified schedule editing modal for todos and habits.
 * Extracted from UnifiedOverlayV2.tsx. Owns all internal editing state.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { Calendar, Minus, Plus } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { getDateService } from '../../lib/date';
import { styles as overlayStyles } from './overlayStyles';
import { SCHEDULE_PRESETS } from './overlayHydration';
import { jsonToFrequency } from './frequencyHelpers';
import type { BaseType, HabitState } from './overlayV2.state';

// ── Constants ────────────────────────────────────────────────────────────────

const DURATION_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export type TimeWindow = 'any' | 'morning' | 'day' | 'evening' | null;

export interface ScheduleChanges {
  // Todo fields
  scheduledDate?: string | null;
  targetDate?: string | null;
  dueDay?: string | null;
  timeWindow?: TimeWindow;
  timeEstimateMinutes?: number | null;
  // Habit fields
  frequencyJson?: any;
  schedule?: HabitState['schedule'];
  startDate?: string | null;
  endDate?: string | null;
}

export interface CurrentSchedule {
  // For todos:
  scheduledDate: string | null;
  dueDay: string | null;
  targetDate: string | null;
  timeWindow: string | null;
  timeEstimateMinutes: number | null;
  // For habits:
  frequencyJson: any;
  startDate: string | null;
  endDate: string | null;
}

export interface ScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  currentSchedule: CurrentSchedule;
  baseType: BaseType;
  /** Habit subtype — needed to conditionally show Duration for start_habit vs break_habit */
  habitSubtype?: string | null;
  onApply: (changes: ScheduleChanges) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatTimeEstimate(minutes: number | null | undefined): string {
  if (!minutes) return '';

  if (minutes < 60) {
    return `${minutes} min`;
  } else if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
}

// ── Internal state shape ─────────────────────────────────────────────────────

interface ModalState {
  selectedDays: number[];
  count: number;
  unit: 'day' | 'week' | 'month';
  isCustom: boolean;
  startDate: string | null;
  endDate: string | null;
  timeWindow: string | null;
  timeEstimateMinutes: number | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScheduleModal({
  visible,
  onClose,
  currentSchedule,
  baseType,
  habitSubtype,
  onApply,
}: ScheduleModalProps) {
  const [modalState, setModalState] = useState<ModalState>({
    selectedDays: [],
    count: 1,
    unit: 'day',
    isCustom: false,
    startDate: null,
    endDate: null,
    timeWindow: null,
    timeEstimateMinutes: null,
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Sync from props when modal opens
  useEffect(() => {
    if (!visible) return;

    if (baseType === 'todo') {
      setModalState({
        selectedDays: [],
        count: 1,
        unit: 'day',
        isCustom: false,
        startDate: currentSchedule.scheduledDate ?? currentSchedule.dueDay ?? null,
        endDate: currentSchedule.targetDate ?? null,
        timeWindow: currentSchedule.timeWindow ?? null,
        timeEstimateMinutes: currentSchedule.timeEstimateMinutes ?? null,
      });
    } else {
      // Habit
      const currentFreq = jsonToFrequency(currentSchedule.frequencyJson);
      let initCount = 1;
      let initUnit: 'day' | 'week' | 'month' = 'day';
      let initDays: number[] = [];
      if (currentFreq.mode === 'simple') {
        initCount = 1;
        initUnit =
          currentFreq.value === 'daily'
            ? 'day'
            : currentFreq.value === 'weekly'
              ? 'week'
              : 'month';
      } else if (currentFreq.mode === 'custom') {
        initCount = currentFreq.value.count;
        initUnit = currentFreq.value.unit;
      } else if (currentFreq.mode === 'days') {
        initCount = currentFreq.days.length;
        initUnit = 'week';
        initDays = currentFreq.days;
      }
      const matchesPreset = SCHEDULE_PRESETS.some(
        (p) =>
          p.count === initCount &&
          p.unit === initUnit &&
          JSON.stringify([...p.days].sort()) === JSON.stringify([...initDays].sort()),
      );
      setModalState({
        selectedDays: initDays,
        count: initCount,
        unit: initUnit,
        isCustom: !matchesPreset,
        startDate: currentSchedule.startDate ?? null,
        endDate: currentSchedule.endDate ?? null,
        timeWindow: currentSchedule.timeWindow ?? null,
        timeEstimateMinutes: currentSchedule.timeEstimateMinutes ?? null,
      });
    }

    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
  }, [visible, baseType, currentSchedule]);

  // ── Apply handler ────────────────────────────────────────────────────────

  const handleApply = useCallback(() => {
    if (baseType === 'todo') {
      onApply({
        scheduledDate: modalState.startDate,
        targetDate: modalState.endDate,
        dueDay: modalState.startDate,
        timeWindow: modalState.timeWindow as TimeWindow,
        timeEstimateMinutes: modalState.timeEstimateMinutes,
      });
      return;
    }

    // Build frequency_json from unified modal state
    const count = modalState.count;
    const unit = modalState.unit;
    let newFrequencyJson;
    if (unit === 'week' && modalState.selectedDays.length > 0) {
      newFrequencyJson = { type: 'days', days: modalState.selectedDays };
    } else if (count === 1) {
      const simpleMap: Record<string, string> = { day: 'daily', week: 'weekly', month: 'monthly' };
      newFrequencyJson = { type: 'simple', value: simpleMap[unit] };
    } else {
      newFrequencyJson = { type: 'custom', value: { count, unit } };
    }

    // Derive schedule string from frequency_json
    let derivedSchedule: HabitState['schedule'] = 'custom';
    if (newFrequencyJson?.type === 'simple') {
      const val = newFrequencyJson.value;
      if (val === 'daily') derivedSchedule = 'daily';
      else if (val === 'weekly') derivedSchedule = 'weekly';
      else derivedSchedule = 'custom';
    } else if (newFrequencyJson?.type === 'custom') {
      const cVal = newFrequencyJson.value as { count: number; unit: string };
      if (cVal?.unit === 'day') derivedSchedule = 'daily';
      else if (cVal?.unit === 'week') derivedSchedule = 'weekly';
      else derivedSchedule = 'custom';
    }

    onApply({
      frequencyJson: newFrequencyJson,
      schedule: derivedSchedule,
      startDate: modalState.startDate,
      endDate: modalState.endDate,
      timeWindow: modalState.timeWindow as TimeWindow,
      timeEstimateMinutes: modalState.timeEstimateMinutes,
    });
  }, [baseType, modalState, onApply]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Backdrop layer — absolute fill, sits BEHIND modal content */}
        <Pressable
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onPress={onClose}
        />
        {/* Modal content — plain View, NOT wrapped in any Pressable */}
        <View style={overlayStyles.scheduleModalContent}>
          <Text style={overlayStyles.scheduleModalTitle}>Schedule</Text>

          <ScrollView
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {/* ===== Frequency sections — habits only ===== */}
            {baseType === 'habit' && (
              <>
                {/* ===== SECTION 1: Frequency presets ===== */}
                <Text style={overlayStyles.schSectionLabel}>Frequency</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  {SCHEDULE_PRESETS.map((preset) => {
                    const isMatch =
                      !modalState.isCustom &&
                      modalState.count === preset.count &&
                      modalState.unit === preset.unit &&
                      JSON.stringify([...modalState.selectedDays].sort()) ===
                        JSON.stringify([...preset.days].sort());
                    return (
                      <Pressable
                        key={preset.key}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setModalState((prev) => ({
                            ...prev,
                            count: preset.count,
                            unit: preset.unit,
                            selectedDays: [...preset.days],
                            isCustom: false,
                          }));
                        }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: isMatch ? '#2D4A3E' : '#F5F2ED',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: isMatch ? '600' : '500',
                            color: isMatch ? '#FFFFFF' : '#6B665C',
                          }}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {/* Custom pill */}
                  <Pressable
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setModalState((prev) => ({ ...prev, isCustom: true }));
                    }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: modalState.isCustom ? '#2D4A3E' : '#F5F2ED',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: modalState.isCustom ? '600' : '500',
                        color: modalState.isCustom ? '#FFFFFF' : '#6B665C',
                      }}
                    >
                      Custom
                    </Text>
                  </Pressable>
                </View>

                {/* ===== SECTION 1b: Custom counter (conditional) ===== */}
                {modalState.isCustom && (
                  <View
                    style={{
                      backgroundColor: '#F5F2ED',
                      borderRadius: 12,
                      padding: 16,
                      marginTop: 12,
                    }}
                  >
                    {/* Counter row */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Pressable
                        onPress={() =>
                          setModalState((prev) => ({
                            ...prev,
                            count: Math.max(1, prev.count - 1),
                          }))
                        }
                        disabled={modalState.count <= 1}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: modalState.count <= 1 ? 0.3 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18, color: '#2D4A3E' }}>−</Text>
                      </Pressable>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: '700',
                          color: '#2D4A3E',
                          marginHorizontal: 24,
                          minWidth: 30,
                          textAlign: 'center',
                        }}
                      >
                        {modalState.count}
                      </Text>
                      <Pressable
                        onPress={() =>
                          setModalState((prev) => ({
                            ...prev,
                            count: Math.min(30, prev.count + 1),
                          }))
                        }
                        disabled={modalState.count >= 30}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: modalState.count >= 30 ? 0.3 : 1,
                        }}
                      >
                        <Text style={{ fontSize: 18, color: '#2D4A3E' }}>+</Text>
                      </Pressable>
                      <Text style={{ fontSize: 14, color: '#8B8579', marginLeft: 16 }}>
                        times per
                      </Text>
                    </View>
                    {/* Unit selector row */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      {(['day', 'week', 'month'] as const).map((u) => {
                        const isUnitSel = modalState.unit === u;
                        return (
                          <Pressable
                            key={u}
                            onPress={() => {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setModalState((prev) => ({
                                ...prev,
                                unit: u,
                                selectedDays: u !== 'week' ? [] : prev.selectedDays,
                              }));
                            }}
                            style={{
                              flex: 1,
                              paddingVertical: 8,
                              alignItems: 'center',
                              borderRadius: 8,
                              backgroundColor: isUnitSel ? '#2D4A3E' : '#FFFFFF',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: isUnitSel ? '600' : '500',
                                color: isUnitSel ? '#FFFFFF' : '#6B665C',
                              }}
                            >
                              {u}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={overlayStyles.schDivider} />
              </>
            )}

            {/* ===== SECTION 2: Pin to days (habits only, conditional) ===== */}
            {baseType === 'habit' && modalState.unit === 'week' && (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    marginBottom: 10,
                  }}
                >
                  <Text style={overlayStyles.schSectionLabel}>On these days</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: '#A09A90',
                      marginLeft: 4,
                      marginBottom: 10,
                    }}
                  >
                    (optional)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {(
                    [
                      { day: 1, label: 'M' },
                      { day: 2, label: 'T' },
                      { day: 3, label: 'W' },
                      { day: 4, label: 'T' },
                      { day: 5, label: 'F' },
                      { day: 6, label: 'S' },
                      { day: 0, label: 'S' },
                    ] as const
                  ).map(({ day, label }) => {
                    const isDaySelected = modalState.selectedDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        onPress={() =>
                          setModalState((prev) => {
                            const newDays = isDaySelected
                              ? prev.selectedDays.filter((d) => d !== day)
                              : [...prev.selectedDays, day].sort();
                            return { ...prev, selectedDays: newDays };
                          })
                        }
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isDaySelected ? '#2D4A3E' : '#F5F2ED',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: isDaySelected ? '#FFFFFF' : '#6B665C',
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={overlayStyles.schDivider} />
              </>
            )}

            {/* ===== SECTION 3: Time of day ===== */}
            <Text style={overlayStyles.schSectionLabel}>Time of day</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {[
                { label: 'Anytime', value: null as string | null },
                { label: 'Morning', value: 'morning' },
                { label: 'Afternoon', value: 'day' },
                { label: 'Evening', value: 'evening' },
              ].map((opt) => {
                const isSel = modalState.timeWindow === opt.value;
                return (
                  <Pressable
                    key={opt.value ?? 'null'}
                    onPress={() =>
                      setModalState((prev) => ({
                        ...prev,
                        timeWindow: opt.value,
                      }))
                    }
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      backgroundColor: isSel ? '#2D4A3E' : '#F5F2ED',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        fontWeight: isSel ? '600' : '500',
                        color: isSel ? '#FFFFFF' : '#6B665C',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ===== SECTION 4: Duration ===== */}
            {(baseType === 'todo' || habitSubtype !== 'break_habit') && (
              <>
                <View style={overlayStyles.schDivider} />
                <Text style={overlayStyles.schSectionLabel}>Duration</Text>
                {/* Row 1: Stepper */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Pressable
                    onPress={() =>
                      setModalState((prev) => {
                        const cur = prev.timeEstimateMinutes ?? 0;
                        const idx = DURATION_STEPS.findIndex((s) => s >= cur);
                        const prevIdx = Math.max(0, (idx > 0 ? idx : DURATION_STEPS.length) - 1);
                        return {
                          ...prev,
                          timeEstimateMinutes: DURATION_STEPS[prevIdx] || null,
                        };
                      })
                    }
                    disabled={!modalState.timeEstimateMinutes}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#F5F2ED',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: !modalState.timeEstimateMinutes ? 0.3 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 16, color: '#2D4A3E' }}>−</Text>
                  </Pressable>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: '#2D4A3E',
                      marginHorizontal: 8,
                      minWidth: 46,
                      textAlign: 'center',
                    }}
                  >
                    {modalState.timeEstimateMinutes
                      ? formatTimeEstimate(modalState.timeEstimateMinutes)
                      : 'None'}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setModalState((prev) => {
                        const cur = prev.timeEstimateMinutes ?? 0;
                        const idx = DURATION_STEPS.findIndex((s) => s > cur);
                        const nextIdx = idx >= 0 ? idx : DURATION_STEPS.length - 1;
                        return {
                          ...prev,
                          timeEstimateMinutes: DURATION_STEPS[nextIdx],
                        };
                      })
                    }
                    disabled={(modalState.timeEstimateMinutes ?? 0) >= 240}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#F5F2ED',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: (modalState.timeEstimateMinutes ?? 0) >= 240 ? 0.3 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 16, color: '#2D4A3E' }}>+</Text>
                  </Pressable>
                </View>
                {/* Row 2: Quick picks */}
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    justifyContent: 'center',
                    marginTop: 10,
                  }}
                >
                  {[
                    { label: '15m', value: 15 },
                    { label: '30m', value: 30 },
                    { label: '1h', value: 60 },
                    { label: '2h', value: 120 },
                  ].map((chip) => {
                    const isDurSel = modalState.timeEstimateMinutes === chip.value;
                    return (
                      <Pressable
                        key={chip.value}
                        onPress={() =>
                          setModalState((prev) => ({
                            ...prev,
                            timeEstimateMinutes: isDurSel ? null : chip.value,
                          }))
                        }
                        style={{
                          paddingVertical: 7,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: isDurSel ? '#2D4A3E' : '#F5F2ED',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isDurSel ? '600' : '500',
                            color: isDurSel ? '#FFFFFF' : '#6B665C',
                          }}
                        >
                          {chip.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Divider ── */}
            <View style={overlayStyles.schDivider} />

            {/* ===== SECTION 5: Dates ===== */}
            <Text style={overlayStyles.schSectionLabel}>Dates</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              {/* Start date */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    color: '#A09A90',
                    marginBottom: 4,
                  }}
                >
                  {baseType === 'todo' ? 'Do date' : 'Starts'}
                </Text>
                <Pressable
                  onPress={() => setShowStartDatePicker(!showStartDatePicker)}
                  style={{
                    backgroundColor: '#F5F2ED',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '500', color: '#2D4A3E' }}>
                    {modalState.startDate
                      ? format(parseISO(modalState.startDate), 'MMM d, yyyy')
                      : 'Not set'}
                  </Text>
                  <Calendar size={14} color="#8B8579" />
                </Pressable>
              </View>
              {/* End date */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    color: '#A09A90',
                    marginBottom: 4,
                  }}
                >
                  {baseType === 'todo' ? 'Deadline' : 'Ends'}
                </Text>
                <Pressable
                  onPress={() => setShowEndDatePicker(!showEndDatePicker)}
                  style={{
                    backgroundColor: '#F5F2ED',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '500',
                      color: modalState.endDate ? '#2D4A3E' : '#B5AFA5',
                    }}
                  >
                    {modalState.endDate
                      ? format(parseISO(modalState.endDate), 'MMM d, yyyy')
                      : 'No end'}
                  </Text>
                  <Calendar size={14} color="#8B8579" />
                </Pressable>
              </View>
            </View>

            {/* Inline DateTimePicker for start date */}
            {showStartDatePicker && (
              <DateTimePicker
                value={
                  modalState.startDate ? parseISO(modalState.startDate) : getDateService().now()
                }
                mode="date"
                display="inline"
                onChange={(event, date) => {
                  if (date) {
                    setModalState((prev) => ({
                      ...prev,
                      startDate: format(date, 'yyyy-MM-dd'),
                    }));
                  }
                  setShowStartDatePicker(false);
                }}
                style={{ backgroundColor: 'white' }}
              />
            )}

            {showEndDatePicker && (
              <View>
                <DateTimePicker
                  value={
                    modalState.endDate ? parseISO(modalState.endDate) : getDateService().now()
                  }
                  mode="date"
                  display="inline"
                  onChange={(event, date) => {
                    if (date) {
                      setModalState((prev) => ({
                        ...prev,
                        endDate: format(date, 'yyyy-MM-dd'),
                      }));
                    }
                    setShowEndDatePicker(false);
                  }}
                  style={{ backgroundColor: 'white' }}
                />
                <Pressable
                  onPress={() => {
                    setModalState((prev) => ({
                      ...prev,
                      endDate: null,
                    }));
                    setShowEndDatePicker(false);
                  }}
                  style={{ alignSelf: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: '#8B8579', fontSize: 14 }}>Clear end date</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={overlayStyles.scheduleModalFooter}>
            <Pressable onPress={onClose} style={overlayStyles.scheduleModalCancelButton}>
              <Text style={overlayStyles.scheduleModalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleApply} style={overlayStyles.scheduleModalSetButton}>
              <Text style={overlayStyles.scheduleModalSetText}>Set</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
