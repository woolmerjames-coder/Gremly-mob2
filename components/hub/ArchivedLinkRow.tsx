/**
 * ArchivedLinkRow - Link to archived items screen
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Archive } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export interface ArchivedLinkRowProps {
  onPress: () => void;
  testID?: string;
}

export default function ArchivedLinkRow({
  onPress,
  testID = 'hub-archived-btn',
}: ArchivedLinkRowProps) {
  return (
    <TouchableOpacity style={styles.archivedRow} onPress={onPress} testID={testID}>
      <View style={styles.archivedRowContent}>
        <Archive size={16} color={colors.gray600} />
        <Text style={styles.archivedRowText}>Check archived items</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  archivedRow: {
    marginTop: spacing['2xl'],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.gray100,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  archivedRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  archivedRowText: {
    fontSize: 15,
    color: colors.gray600,
    fontWeight: '500',
  },
});
