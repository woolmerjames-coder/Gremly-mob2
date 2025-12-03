/**
 * SweepCard Component
 *
 * Displays a single sweep candidate in a card format.
 * Used in the Evening Sweep decision step to review items.
 *
 * Features:
 * - Type chip showing item kind (To-Do, Habit, Note)
 * - Timestamp showing when item was created
 * - Title and body preview
 * - Action buttons: Keep, Clear, Skip, Fix This
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button } from '../../ui';
import { BRAND } from '../../design/brand';
import type { SweepCandidate } from '../../lib/sweep/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepCardProps {
  /** The sweep candidate to display */
  candidate: SweepCandidate;
  /** Current index (0-based) */
  index: number;
  /** Total number of candidates */
  total: number;
  /** Called when user wants to keep the item */
  onKeep: () => void;
  /** Called when user wants to clear/archive the item */
  onClear: () => void;
  /** Called when user wants to skip until next sweep */
  onSkip: () => void;
  /** Called when user wants to edit/fix the item */
  onOpenEdit: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the display label for the type chip based on candidate kind.
 */
function getTypeChipLabel(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return 'To-Do';
    case 'habit':
      return 'Habit';
    case 'note': {
      // Check if it's a log/journal type from the raw data
      const noteRaw = candidate.raw;
      if (noteRaw.subtype === 'journal' || noteRaw.subtype === 'log') {
        return 'Log';
      }
      return 'Note';
    }
  }
}

/**
 * Get the title to display for a candidate.
 */
function getCandidateTitle(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.name || 'Untitled task';
    case 'habit':
      return candidate.raw.name || 'Untitled habit';
    case 'note':
      return candidate.raw.title || 'Untitled note';
  }
}

/**
 * Get the body/description preview for a candidate.
 */
function getCandidateBody(candidate: SweepCandidate): string | null {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.notes || null;
    case 'habit':
      return candidate.raw.notes || candidate.raw.why_string || null;
    case 'note':
      return candidate.raw.body || null;
  }
}

/**
 * Format the created timestamp for display.
 * Shows "Added today at 4:12 PM" or "Added Dec 1 at 10:30 AM"
 */
function formatCreatedTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Added today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Added yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `Added ${dateStr} at ${timeStr}`;
}

/**
 * Get the primary button label based on candidate kind.
 */
function getPrimaryButtonLabel(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return 'Review to-do details';
    case 'habit':
      return 'Review habit settings';
    case 'note':
      return 'Review note details';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepCard({
  candidate,
  index: _index,
  total: _total,
  onKeep,
  onClear,
  onSkip,
  onOpenEdit,
}: SweepCardProps) {
  const typeLabel = getTypeChipLabel(candidate);
  const title = getCandidateTitle(candidate);
  const body = getCandidateBody(candidate);
  const timestamp = formatCreatedTimestamp(candidate.createdAt);
  const primaryLabel = getPrimaryButtonLabel(candidate);

  // Truncate body preview to ~100 chars
  const bodyPreview = body && body.length > 100 ? `${body.slice(0, 100)}…` : body;

  return (
    <View style={styles.card}>
      {/* Metadata Row */}
      <View style={styles.metadataRow}>
        <View style={styles.metadataLeft}>
          {/* Type Chip */}
          <View style={styles.typeChip}>
            <Text style={styles.typeChipText}>{typeLabel}</Text>
          </View>
          {/* Timestamp */}
          <Text variant="subtle" style={styles.timestamp}>
            {timestamp}
          </Text>
        </View>
        {/* Fix This Button */}
        <TouchableOpacity
          style={styles.fixButton}
          onPress={onOpenEdit}
          accessibilityLabel="Fix this item"
          accessibilityRole="button"
        >
          <Text style={styles.fixButtonText}>✏️ Fix</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <Text variant="body" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {bodyPreview && (
          <Text variant="subtle" style={styles.bodyPreview} numberOfLines={3}>
            {bodyPreview}
          </Text>
        )}
      </View>

      {/* Primary Action Button */}
      <View style={styles.primaryAction}>
        <Button title={primaryLabel} variant="neutral" onPress={onOpenEdit} size="md" />
      </View>

      {/* Skip Text Button */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={onSkip}
        accessibilityLabel="Skip until next Sweep"
        accessibilityRole="button"
      >
        <Text style={styles.skipButtonText}>Skip until next Sweep</Text>
      </TouchableOpacity>

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={onClear}
          accessibilityLabel="Clear this item"
          accessibilityRole="button"
        >
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.keepButton]}
          onPress={onKeep}
          accessibilityLabel="Keep this item"
          accessibilityRole="button"
        >
          <Text style={styles.keepButtonText}>Keep</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 16,
    ...BRAND.elevation.one,
  },

  // Metadata Row
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metadataLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  typeChip: {
    backgroundColor: BRAND.colors.sageMist,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BRAND.radius.pill,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    flex: 1,
  },
  fixButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BRAND.radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  fixButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },

  // Content
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
  },
  bodyPreview: {
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.inkSubtle,
  },

  // Primary Action
  primaryAction: {
    marginBottom: 12,
  },

  // Skip Button
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 16,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    textDecorationLine: 'underline',
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  keepButton: {
    backgroundColor: BRAND.colors.sageMist,
  },
  keepButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
});

export default SweepCard;
