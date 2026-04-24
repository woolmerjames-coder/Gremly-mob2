// components/worlds/sections/AlsoOpenModule.tsx

import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { useOpenNonChapterTodosForWorld } from '../../../lib/store/worldsSelectors';

interface AlsoOpenModuleProps {
  worldId: string;
  onPressSeeAll?: () => void;
  onPressTodo?: (todoId: string) => void;
}

const MAX_ROWS = 4;

export function AlsoOpenModule({ worldId, onPressSeeAll, onPressTodo }: AlsoOpenModuleProps) {
  const todos = useOpenNonChapterTodosForWorld(worldId);
  if (todos.length === 0) return null;

  const visible = todos.slice(0, MAX_ROWS);
  const fullCount = todos.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>ALSO OPEN · {fullCount}</Text>
        <Text style={styles.caption}>beyond the sprint</Text>
      </View>

      {visible.map((todo, idx) => {
        const isLast = idx === visible.length - 1;
        return (
          <Pressable
            key={todo.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            onPress={() => onPressTodo?.(todo.id)}
            testID={`also-open-todo-${todo.id}`}
          >
            <View style={styles.checkbox} />
            <Text style={styles.rowLabel} numberOfLines={1}>
              {todo.title || todo.name || '(untitled)'}
            </Text>
          </Pressable>
        );
      })}

      {onPressSeeAll ? (
        <Pressable onPress={onPressSeeAll} style={styles.seeAllWrap}>
          <Text style={styles.seeAllText}>{'see all ' + fullCount + ' \u2192'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 26, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    fontStyle: 'italic',
    color: lightTokens.colors.warmGrey,
  },
  row: {
    paddingVertical: 7,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    borderColor: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.worldsInk,
  },
  seeAllWrap: { marginTop: 8, paddingHorizontal: 2 },
  seeAllText: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
  },
});
