/**
 * PhotoStrip — Photo thumbnails with add button
 *
 * When photos exist: 44×44 thumbnail strip + "+" button
 * When no photos: subtle "Add photo" text link (not big empty squares)
 */

import React from 'react';
import { Pressable, View, Image, StyleSheet } from 'react-native';
import { Camera, Plus, Image as ImageIcon } from 'lucide-react-native';
import { Text } from '../../ui';
import type { DraftPhoto } from './useOverlayDraft';

interface PhotoStripProps {
  photos: DraftPhoto[];
  onAddPhoto: () => void;
  onTapPhoto?: (index: number) => void;
  disabled?: boolean;
}

export const PhotoStrip: React.FC<PhotoStripProps> = ({
  photos,
  onAddPhoto,
  onTapPhoto,
  disabled = false,
}) => {
  const activePhotos = photos.filter((p) => !p.isDeleted);

  if (activePhotos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Pressable
          onPress={onAddPhoto}
          disabled={disabled}
          style={({ pressed }) => [
            styles.addLink,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Camera size={13} color="#8B8579" strokeWidth={1.5} />
          <Text style={styles.addLinkText}>Add photo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.strip}>
      {activePhotos.slice(0, 4).map((photo, i) => (
        <Pressable
          key={photo.id ?? `photo-${i}`}
          onPress={() => onTapPhoto?.(i)}
          accessibilityLabel={`View photo ${i + 1}`}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.thumb,
            pressed && { opacity: 0.8 },
          ]}
        >
          {photo.url.startsWith('file://') || photo.url.startsWith('http') ? (
            <Image
              source={{ uri: photo.url }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbImage, styles.thumbPlaceholder]}>
              <ImageIcon size={16} color="#8B8579" strokeWidth={1.5} />
            </View>
          )}
        </Pressable>
      ))}

      {!disabled && activePhotos.length < 5 && (
        <Pressable
          onPress={onAddPhoto}
          accessibilityLabel="Add another photo"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Plus size={14} color="#8B8579" />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    marginBottom: 8,
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  addLinkText: {
    fontSize: 12,
    color: '#8B8579',
  },
  strip: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 10,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbImage: {
    width: 44,
    height: 44,
  },
  thumbPlaceholder: {
    backgroundColor: '#D5D0C8',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5D0C8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
