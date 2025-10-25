import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';
import useSpaceTimeline from '../../../../hooks/useSpaceTimeline';
import { format } from 'date-fns';

export type TimelineOverlayProps = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  onSelectDate?: (dateISO: string) => void;
};

export const TimelineOverlay: React.FC<TimelineOverlayProps> = ({
  visible,
  onClose,
  spaceId,
  onSelectDate,
}) => {
  const { days, reload } = useSpaceTimeline(spaceId);

  React.useEffect(() => {
    if (visible) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spaceId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Timeline</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close timeline"
            >
              <CloseIcon color={COLORS.Linen} size={22} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 12 }} />
          <ScrollView>
            {days.map((d) => (
              <View key={d.dateISO} style={{ marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    onSelectDate?.(d.dateISO);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to ${d.dateISO}`}
                >
                  <Text style={styles.dayHeader}>{format(new Date(d.dateISO), 'EEE, MMM d')}</Text>
                </TouchableOpacity>
                {d.items.length === 0 ? (
                  <Text style={styles.emptyDay}>No items</Text>
                ) : (
                  d.items.map((it) => (
                    <TouchableOpacity
                      key={`${d.dateISO}-${it.id}`}
                      onPress={() => {
                        onSelectDate?.(d.dateISO);
                        onClose();
                      }}
                      style={styles.itemRow}
                    >
                      <View
                        style={[
                          styles.dot,
                          it.type === 'todo'
                            ? { backgroundColor: COLORS.Pear }
                            : it.type === 'habit'
                              ? { backgroundColor: COLORS.Moss }
                              : { backgroundColor: '#B8C7BF' },
                        ]}
                      />
                      <Text style={styles.itemText} numberOfLines={1}>
                        {it.title}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.32)', // Deep with transparency
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.Deep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACE.lg,
    paddingBottom: SPACE.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.Linen,
  },
  placeholderList: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.Pear,
  },
  itemText: {
    color: '#D9E6DA',
    fontSize: 14,
  },
  dayHeader: {
    color: COLORS.Linen,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDay: {
    color: '#BFD0C4',
    fontSize: 12,
    marginLeft: 16,
    marginBottom: 8,
  },
});

export default TimelineOverlay;
