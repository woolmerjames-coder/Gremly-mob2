/**
 * AnimatedMindDropCard JSX
 * From: app/screens/CatchAllNotepad.tsx (lines 1222-1268)
 */

// Complete or Failed: Show full content with crossfade animation
const isFailed = visualState === 'failed';

return (
  <Animated.View style={{ opacity: fadeAnim }}>
    <Pressable
      key={`${item.kind}:${item.id}`}
      testID={`minddrop-recent-${item.kind}-${item.id}`}
      style={styles.recentCard}
      onPress={() => handleEdit(item.id, item.kind, item.unsorted)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title || item.text || 'item'}`}
    >
      {/* Row 1: Title (left) + Chip (right) */}
      <View style={styles.recentTopRow}>
        <Text numberOfLines={1} style={styles.recentTitle}>
          {item.title || item.text || '—'}
        </Text>
        <View style={styles.recentTopRight}>
          {effectiveKind === 'note' && (item as any)?.private === true && (
            <Lock size={12} color="#777" />
          )}
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
            {getDisplayKindForChip(effectiveKind, item)}
          </Text>
        </View>
      </View>

      {/* Rows 2+3 grouped together so space-between pushes them to bottom */}
      <View>
        {/* Row 2: Confirmation message */}
        <Text style={styles.recentConfirmation}>{getConfirmationMessage(effectiveKind, item)}</Text>

        {/* Row 3: Contextual info (left) + timestamp (right) */}
        <View style={styles.recentMetaRow}>
          {(() => {
            const contextMeta = getContextualMeta(effectiveKind, item);
            return contextMeta ? <Text style={styles.recentContextPill}>{contextMeta}</Text> : null;
          })()}
          <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  </Animated.View>
);
