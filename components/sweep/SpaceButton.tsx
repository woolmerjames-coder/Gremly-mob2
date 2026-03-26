import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { FolderOpen, X } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

interface SpaceButtonProps {
  active: boolean;
  spaceName: string | null;
  onPress: () => void;
}

export function SpaceButton({ active, spaceName, onPress }: SpaceButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        active && styles.containerActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      {active ? (
        <>
          <Text style={styles.activeText} numberOfLines={1}>
            {spaceName}
          </Text>
          <X size={12} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
        </>
      ) : (
        <>
          <FolderOpen size={14} strokeWidth={2} color="rgba(46,85,64,0.55)" />
          <Text style={styles.text}>Space</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.15)',
    backgroundColor: 'rgba(46,85,64,0.04)',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  containerActive: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderColor: 'rgba(46,85,64,0.25)',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(46,85,64,0.55)',
  },
  activeText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    maxWidth: 120,
  },
});
