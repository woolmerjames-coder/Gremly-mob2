import React from 'react';
import { View, ScrollView, Image, Pressable, StyleSheet, Modal } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../../design/makeStyles';
import { Text } from '../../ui/Text';
import { MASCOT_OPTIONS, type MascotOption } from '../../lib/mascots/mascotConfig';

interface GremlyPickerProps {
  visible: boolean;
  selectedId: string;
  onSelect: (mascotId: string) => void;
  onClose: () => void;
}

/**
 * GremlyPicker - Grid modal for selecting a Gremly mascot
 *
 * Features:
 * - 4-column grid of all available mascots
 * - Current selection highlighted with border + checkmark
 * - Tap mascot to select and close
 * - Tap outside or X to close without changing
 */
export function GremlyPicker({ visible, selectedId, onSelect, onClose }: GremlyPickerProps) {
  const insets = useSafeAreaInsets();
  const tokens = useTokens();

  const handleSelect = (mascot: MascotOption) => {
    onSelect(mascot.id);
    onClose();
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: tokens.colors.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: tokens.spacing[4],
      paddingBottom: insets.bottom + tokens.spacing[4],
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: tokens.spacing[4],
      marginBottom: tokens.spacing[4],
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: tokens.colors.text,
    },
    closeButton: {
      padding: tokens.spacing[2],
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: tokens.spacing[3],
      justifyContent: 'flex-start',
    },
    mascotItem: {
      width: '25%', // 4 columns
      aspectRatio: 1,
      padding: tokens.spacing[2],
    },
    mascotButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: tokens.colors.surface,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    mascotButtonSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: '#E8F5E9',
    },
    mascotImage: {
      width: '80%',
      height: '80%',
    },
    checkBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mascotName: {
      fontSize: 11,
      color: tokens.colors.subtle,
      textAlign: 'center',
      marginTop: 2,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Choose your Gremly</Text>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <X size={24} color={tokens.colors.text} />
            </Pressable>
          </View>

          {/* Grid */}
          <ScrollView>
            <View style={styles.grid}>
              {MASCOT_OPTIONS.map((mascot) => {
                const isSelected = mascot.id === selectedId;
                return (
                  <View key={mascot.id} style={styles.mascotItem}>
                    <Pressable
                      style={[styles.mascotButton, isSelected && styles.mascotButtonSelected]}
                      onPress={() => handleSelect(mascot)}
                    >
                      <Image
                        source={mascot.source}
                        style={styles.mascotImage}
                        resizeMode="contain"
                      />
                      {isSelected && (
                        <View style={styles.checkBadge}>
                          <Check size={12} color="white" strokeWidth={3} />
                        </View>
                      )}
                    </Pressable>
                    <Text style={styles.mascotName}>{mascot.displayName}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
