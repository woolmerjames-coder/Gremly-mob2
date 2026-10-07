/**
 * The photos on a journal entry: tiles under the writing, three to a row, and
 * one photo shown large when its tile is tapped.
 *
 * While writing, a tile can be taken off and another photo added. Looking
 * back, the photos are only shown.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
import type { PagePhoto } from '../../lib/journal/photos';
import { JOURNAL_COPY } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';
import { PrivateImage } from '../PrivateImage';
import { journalStyles } from './journalStyles';

const PER_ROW = 3;

export type JournalPhotosProps = {
  photos: PagePhoto[];
  /** Left out while looking back */
  onRemove?: (photo: PagePhoto) => void;
  /** Left out while looking back, and when the entry has no more room */
  onAdd?: () => void;
  onOpen: (index: number) => void;
};

type Tile = { photo: PagePhoto; index: number } | 'add' | null;

export function JournalPhotos({ photos, onRemove, onAdd, onOpen }: JournalPhotosProps) {
  if (!photos.length) return null;
  const tiles: Tile[] = photos.map((photo, index) => ({ photo, index }));
  if (onAdd) tiles.push('add');
  // whole rows, so every tile is the same size
  while (tiles.length % PER_ROW) tiles.push(null);
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += PER_ROW) rows.push(tiles.slice(i, i + PER_ROW));

  return (
    <View testID="journal-photos">
      <View style={journalStyles.section}>
        <View style={journalStyles.sectionBar} />
        <Text style={journalStyles.sectionText}>{JOURNAL_COPY.photosTitle}</Text>
      </View>
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((tile, i) => {
              if (tile === null) return <View key={`space-${i}`} style={styles.place} />;
              if (tile === 'add') {
                return (
                  <Pressable
                    key="add"
                    style={[styles.place, styles.add]}
                    onPress={onAdd}
                    accessibilityRole="button"
                    accessibilityLabel={JOURNAL_COPY.photosAddMore}
                    testID="journal-photo-add"
                  >
                    <Plus size={22} color={BRIEF.moss} strokeWidth={2.2} />
                  </Pressable>
                );
              }
              const { photo, index } = tile;
              return (
                <View key={photo.key} style={styles.place}>
                  <Pressable
                    style={styles.tile}
                    onPress={() => onOpen(index)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`${JOURNAL_COPY.photosView}, ${index + 1} of ${photos.length}`}
                    testID={`journal-photo-${index}`}
                  >
                    <PrivateImage uri={photo.url} style={styles.image} resizeMode="cover" />
                  </Pressable>
                  {onRemove ? (
                    <Pressable
                      style={styles.remove}
                      onPress={() => onRemove(photo)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${JOURNAL_COPY.photosRemove}, ${index + 1} of ${photos.length}`}
                      testID={`journal-photo-${index}-remove`}
                    >
                      <X size={14} color="#FFFFFF" strokeWidth={2.6} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export type JournalPhotoViewerProps = {
  photos: PagePhoto[];
  index: number;
  onStep: (index: number) => void;
  onClose: () => void;
};

/** One photo, as large as the screen allows. A tap anywhere closes it. */
export function JournalPhotoViewer({ photos, index, onStep, onClose }: JournalPhotoViewerProps) {
  const photo = photos[index];
  if (!photo) return null;
  return (
    <View style={styles.viewer} testID="journal-photo-viewer">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={JOURNAL_COPY.photosCloseView}
        testID="journal-photo-viewer-close"
      >
        <PrivateImage uri={photo.url} style={styles.large} resizeMode="contain" />
      </Pressable>
      {photos.length > 1 ? (
        <View style={styles.steps} pointerEvents="box-none">
          <Pressable
            style={[styles.stepBtn, index === 0 && styles.stepOff]}
            onPress={() => onStep(index - 1)}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="The photo before"
            testID="journal-photo-viewer-before"
          >
            <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.count}>
            {index + 1} of {photos.length}
          </Text>
          <Pressable
            style={[styles.stepBtn, index === photos.length - 1 && styles.stepOff]}
            onPress={() => onStep(index + 1)}
            disabled={index === photos.length - 1}
            accessibilityRole="button"
            accessibilityLabel="The photo after"
            testID="journal-photo-viewer-after"
          >
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: 14, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  // three equal squares to a row
  place: { flex: 1, aspectRatio: 1 },
  tile: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: BRIEF.sageWash,
    borderWidth: 1,
    borderColor: BRIEF.line,
  },
  image: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(26, 51, 40, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(46, 85, 64, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
    backgroundColor: 'rgba(12, 22, 17, 0.96)',
  },
  large: { width: '100%', height: '100%' },
  steps: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.35 },
  count: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
});
