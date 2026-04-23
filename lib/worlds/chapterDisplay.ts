/**
 * Shared display helpers for Chapter components.
 * Used by CurrentChapterBigCard and ChapterHeroCard.
 */
import { format } from 'date-fns';
import type { Chapter } from '../supabase/types';

export function resolveChapterLabel(chapter: Chapter): string {
  const typePart = chapter.chapter_type.toUpperCase();
  if (chapter.start_date) {
    const since = format(new Date(chapter.start_date), 'MMM d');
    return `CURRENT CHAPTER · ${typePart} · SINCE ${since}`;
  }
  return `CURRENT CHAPTER · ${typePart}`;
}

export interface PhaseBarState {
  /** Parallel arrays: segments[i] active/inactive, labels[i] display name. */
  segments: boolean[];
  labels: string[];
  currentIndex: number;
  /** Compact single label for small-card usage. */
  label: string;
}

export function resolveChapterPhases(chapter: Chapter): PhaseBarState {
  if (chapter.phase_labels && chapter.phase_labels.length > 0 && chapter.current_phase_key) {
    const idx = chapter.phase_labels.indexOf(chapter.current_phase_key);
    return {
      segments: chapter.phase_labels.map((_, i) => i <= idx),
      labels: chapter.phase_labels.map((l) => l.toUpperCase()),
      currentIndex: Math.max(idx, 0),
      label: idx >= 0 ? chapter.phase_labels[idx].toUpperCase() : '',
    };
  }

  switch (chapter.chapter_type) {
    case 'milestone':
      return {
        segments: [true, false, false],
        labels: ['BUILDING', 'PROGRESSING', 'CLOSING'],
        currentIndex: 0,
        label: 'BUILDING',
      };
    case 'bounded':
      return {
        segments: [true, false, false],
        labels: ['STARTING', 'ACTIVE', 'CLOSING'],
        currentIndex: 0,
        label: 'STARTING',
      };
    case 'season':
    default:
      return {
        segments: [true, false, false],
        labels: ['EARLY', 'MIDDLE', 'LATE'],
        currentIndex: 0,
        label: 'EARLY',
      };
  }
}
