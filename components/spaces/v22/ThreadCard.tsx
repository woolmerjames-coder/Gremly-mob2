import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SPACE } from './_tokens';

export type ThreadCardProps = {
  title: string;
  snippet?: string;
  lastActive?: string;
  onOpen: () => void;
  onMenu?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
};

export const ThreadCard: React.FC<ThreadCardProps> = ({
  title,
  snippet,
  lastActive,
  onOpen,
  onMenu,
  onArchive,
  onDelete,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [menuVisible, setMenuVisible] = React.useState(false);

  return (
    <View
      style={[
        styles.card,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }
          : { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <Pressable style={{ flex: 1 }} onPress={onOpen} accessibilityRole="button">
        <Text
          style={[styles.title, isDark ? { color: '#EEEEEE' } : { color: '#111111' }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!!snippet && (
          <Text
            style={[styles.snippet, isDark ? { color: '#DDDDDD' } : { color: '#333333' }]}
            numberOfLines={1}
          >
            {snippet}
          </Text>
        )}
        {!!lastActive && (
          <Text style={[styles.meta, isDark ? { color: '#BBBBBB' } : { color: '#666666' }]}>
            {lastActive}
          </Text>
        )}
      </Pressable>
      <TouchableOpacity
        style={styles.kebab}
        onPress={() => setMenuVisible(true)}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
      >
        <Text style={[styles.kebabText, isDark ? { color: '#CCCCCC' } : { color: '#555555' }]}>
          ⋯
        </Text>
      </TouchableOpacity>

      {/* Simple menu modal */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onOpen();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.menuText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onMenu?.();
                onArchive?.();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.menuText}>Archive</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onMenu?.();
                onDelete?.();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.menuText, { color: '#B00020' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACE.md,
  },
  title: {
    fontWeight: '600',
    fontSize: 16,
  },
  snippet: {
    marginTop: 2,
    opacity: 0.8,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
  },
  kebab: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  kebabText: {
    fontSize: 18,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-end',
  },
  menu: {
    backgroundColor: '#FFF',
    paddingVertical: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuText: {
    fontSize: 16,
    color: '#111',
  },
});

export default ThreadCard;
