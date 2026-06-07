import React, { useState } from 'react';
import { View, Modal, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Calendar, CalendarDays } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import type { WeekDay, WeekDayItem } from '../../lib/store/weekGridSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WeekBoardOverlayProps = {
  visible: boolean;
  days: WeekDay[];
  onClose: () => void;
  onConfirmMove: (itemId: string, targetDay: string) => void;
  onOpenCalendarForDay: (date: string) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ItemRow({ item, onPress }: { item: WeekDayItem; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, tap to move`}
    >
      <View
        style={[
          styles.worldDot,
          { backgroundColor: item.world?.accentColor ?? BRAND.colors.inkMuted },
        ]}
      />
      <Text style={styles.itemTitle} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

function DaySection({
  day,
  onItemPress,
  onOpenCalendarForDay,
}: {
  day: WeekDay;
  onItemPress: (itemId: string, fromDay: string) => void;
  onOpenCalendarForDay: (date: string) => void;
}) {
  const hasContent = day.todoCount > 0 || day.eventCount > 0;

  return (
    <View style={styles.daySection}>
      {/* Day header */}
      <View style={styles.dayHeader}>
        <View style={styles.dayHeaderLeft}>
          <Text style={styles.dayDow}>{day.dow.toUpperCase()}</Text>
          <Text style={styles.dayNum}>{day.dayNum}</Text>
          {day.tag ? <Text style={styles.dayTag}>{day.tag}</Text> : null}
        </View>
        <Pressable
          onPress={() => onOpenCalendarForDay(day.date)}
          style={({ pressed }) => [styles.dayCalBtn, pressed && { opacity: 0.55 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open calendar for ${day.dow} ${day.dayNum}`}
        >
          <CalendarDays size={16} strokeWidth={2} color={BRAND.colors.inkMuted} />
        </Pressable>
      </View>

      {/* Count line */}
      <View style={styles.countRow}>
        {!hasContent ? (
          <Text style={styles.nothingYet}>nothing yet</Text>
        ) : (
          <>
            {day.todoCount > 0 && (
              <>
                <Check size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
                <Text style={styles.countText}>{day.todoCount}</Text>
              </>
            )}
            {day.todoCount > 0 && day.eventCount > 0 && <Text style={styles.countDot}>·</Text>}
            {day.eventCount > 0 && (
              <>
                <Calendar size={12} strokeWidth={2} color={BRAND.colors.inkMuted} />
                <Text style={styles.countText}>{day.eventCount}</Text>
              </>
            )}
          </>
        )}
      </View>

      {/* Items */}
      {day.items.length > 0 ? (
        day.items.map((item) => (
          <ItemRow key={item.id} item={item} onPress={() => onItemPress(item.id, day.date)} />
        ))
      ) : (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyRowText}>—</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WeekBoardOverlay({
  visible,
  days,
  onClose,
  onConfirmMove,
  onOpenCalendarForDay,
}: WeekBoardOverlayProps) {
  const insets = useSafeAreaInsets();
  const [movingItem, setMovingItem] = useState<{ id: string; fromDay: string } | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Sheet */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your week</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              accessibilityLabel="Close"
            >
              <X size={18} color={BRAND.colors.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Scrollable day list */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {days.map((day) => (
              <DaySection
                key={day.date}
                day={day}
                onItemPress={(id, fromDay) => setMovingItem({ id, fromDay })}
                onOpenCalendarForDay={onOpenCalendarForDay}
              />
            ))}
          </ScrollView>
        </View>

        {/* Inline day-picker — absolutely positioned over the board */}
        {movingItem !== null && (
          <View style={styles.pickerOverlay}>
            <Pressable style={styles.pickerScrim} onPress={() => setMovingItem(null)} />
            <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.handle} />
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Move to</Text>
                <Pressable
                  onPress={() => setMovingItem(null)}
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                  accessibilityLabel="Cancel"
                >
                  <X size={18} strokeWidth={2} color={BRAND.colors.inkMuted} />
                </Pressable>
              </View>
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.pickerContent}
              >
                {days.map((day) => {
                  const isCurrent = movingItem.fromDay === day.date;
                  return (
                    <Pressable
                      key={day.date}
                      style={({ pressed }) => [
                        styles.pickerDayRow,
                        isCurrent && styles.pickerDayRowCurrent,
                        pressed && !isCurrent && { opacity: 0.65 },
                      ]}
                      onPress={() => {
                        if (isCurrent) {
                          setMovingItem(null);
                          return;
                        }
                        onConfirmMove(movingItem.id, day.date);
                        setMovingItem(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Move to ${day.dow} ${day.dayNum}${
                        isCurrent ? ', current day' : ''
                      }`}
                      accessibilityState={{ selected: isCurrent }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.pickerDayText, isCurrent && styles.pickerDayTextCurrent]}
                        >
                          {day.dow} <Text style={styles.pickerDayNum}>{day.dayNum}</Text>
                          {day.tag ? (
                            <Text style={styles.pickerDayTag}>
                              {'  '}
                              {day.tag}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      {isCurrent && <Check size={15} strokeWidth={2.5} color="#2E5540" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  modalRoot: {
    flex: 1,
  },

  // ── Picker overlay ──

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },

  pickerScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  pickerSheet: {
    backgroundColor: '#F9F6F1',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    maxHeight: '60%',
  },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },

  pickerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    fontFamily: 'Inter-SemiBold',
  },

  pickerContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },

  pickerDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },

  pickerDayRowCurrent: {
    backgroundColor: 'rgba(107,142,107,0.10)',
  },

  pickerDayText: {
    fontSize: 15,
    fontWeight: '400',
    color: '#1A1A1A',
    fontFamily: 'Inter-Regular',
  },

  pickerDayTextCurrent: {
    fontWeight: '600',
    color: '#2E5540',
    fontFamily: 'Inter-SemiBold',
  },

  pickerDayNum: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },

  pickerDayTag: {
    fontSize: 11,
    color: '#2E5540',
    fontFamily: 'Inter-Medium',
  },

  sheet: {
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    maxHeight: '90%',
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginBottom: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.borderSubtle,
  },

  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'Inter-SemiBold',
  },

  closeBtn: {
    padding: 4,
  },

  closeBtnPressed: {
    opacity: 0.5,
  },

  scroll: {
    flexGrow: 0,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },

  // ── Day section ──

  daySection: {
    backgroundColor: 'rgba(191,216,192,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND.colors.borderSubtle,
  },

  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  dayDow: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.8,
    fontFamily: 'Inter-Bold',
  },

  dayNum: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'PlusJakartaSans-Bold',
    lineHeight: 24,
  },

  dayTag: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-Medium',
  },

  dayCalBtn: {
    marginLeft: 'auto',
    padding: 4,
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },

  countText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
  },

  countDot: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
  },

  nothingYet: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },

  // ── Item rows ──

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 4,
  },

  itemRowPressed: {
    opacity: 0.55,
  },

  worldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'Inter-Regular',
  },

  emptyRow: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  emptyRowText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
    opacity: 0.5,
  },
});
