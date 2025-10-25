import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TouchableOpacity } from 'react-native';

export type ThreadCardProps = {
  title: string;
  snippet?: string;
  lastActive?: string;
  onOpen: () => void;
  onMenu?: () => void;
};

export const ThreadCard: React.FC<ThreadCardProps> = ({
  title,
  snippet,
  lastActive,
  onOpen,
  onMenu,
}) => {
  const [menuVisible, setMenuVisible] = React.useState(false);

  return (
    <View style={styles.card}>
      <Pressable style={{ flex: 1 }} onPress={onOpen} accessibilityRole="button">
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!snippet && (
          <Text style={styles.snippet} numberOfLines={1}>
            {snippet}
          </Text>
        )}
        {!!lastActive && <Text style={styles.meta}>{lastActive}</Text>}
      </Pressable>
      <TouchableOpacity
        style={styles.kebab}
        onPress={() => setMenuVisible(true)}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
      >
        <Text style={styles.kebabText}>⋯</Text>
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
                // Placeholder: parent can handle archive intent
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
                // Placeholder: parent can handle delete intent
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
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 12,
  },
  title: {
    fontWeight: '600',
    fontSize: 16,
    color: '#111',
  },
  snippet: {
    marginTop: 2,
    opacity: 0.8,
    color: '#333',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: '#666',
  },
  kebab: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  kebabText: {
    fontSize: 18,
    color: '#555',
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
