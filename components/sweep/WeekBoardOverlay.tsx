import React from 'react';
import { View, Modal, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, Calendar } from 'lucide-react-native';
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
  onMoveItem: (itemId: string, fromDay: string) => void;
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
  onMoveItem,
}: {
  day: WeekDay;
  onMoveItem: (itemId: string, fromDay: string) => void;
}) {
  const hasContent = day.todoCount > 0 || day.eventCount > 0;

  return (
    <View style={styles.daySection}>
      {/* Day header */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayDow}>{day.dow.toUpperCase()}</Text>
        <Text style={styles.dayNum}>{day.dayNum}</Text>
        {day.tag ? <Text style={styles.dayTag}>{day.tag}</Text> : null}
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
          <ItemRow key={item.id} item={item} onPress={() => onMoveItem(item.id, day.date)} />
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

export function WeekBoardOverlay({ visible, days, onClose, onMoveItem }: WeekBoardOverlayProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
            <DaySection key={day.date} day={day} onMoveItem={onMoveItem} />
          ))}
        </ScrollView>
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
    gap: 6,
    marginBottom: 4,
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
    marginLeft: 'auto',
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
