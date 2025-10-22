import React, { useState } from 'react';
import { Box, Text } from '../../ui';
import { TouchableOpacity, Pressable, TextInput } from 'react-native';
import type { ListItem } from '../../lib/repo/types';

interface ListItemRowProps {
  item: ListItem;
  onToggleComplete: (id: string, done: boolean) => void;
  onRename: (id: string, newLabel: string) => void;
}

export const ListItemRow: React.FC<ListItemRowProps> = ({ item, onToggleComplete, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.label);

  const isCompleted = Boolean(item.completed_at);

  const handleToggle = () => {
    onToggleComplete(item.id, !isCompleted);
  };

  const handleLabelPress = () => {
    setIsEditing(true);
    setEditText(item.label);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== item.label) {
      onRename(item.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(item.label);
    setIsEditing(false);
  };

  return (
    <Box row p={3} style={{ alignItems: 'center' }}>
      {/* Checkbox */}
      <TouchableOpacity
        onPress={handleToggle}
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: isCompleted ? '#0D3B3A' : '#E7E2D9',
          backgroundColor: isCompleted ? '#0D3B3A' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {isCompleted && (
          <Text variant="body" style={{ color: 'white', fontSize: 14 }}>
            ✓
          </Text>
        )}
      </TouchableOpacity>

      {/* Label / Edit input */}
      <Box flex={1}>
        {isEditing ? (
          <TextInput
            value={editText}
            onChangeText={setEditText}
            onBlur={handleSaveEdit}
            onSubmitEditing={handleSaveEdit}
            autoFocus
            style={{
              fontSize: 16,
              color: '#0E1116',
              paddingVertical: 4,
              borderBottomWidth: 1,
              borderBottomColor: '#0D3B3A',
            }}
          />
        ) : (
          <Pressable onPress={handleLabelPress}>
            <Text
              variant="body"
              style={{
                textDecorationLine: isCompleted ? 'line-through' : 'none',
                color: isCompleted ? '#6A6F76' : '#0E1116',
              }}
            >
              {item.label}
            </Text>
            {item.qty && (
              <Text variant="label" style={{ color: '#6A6F76', marginTop: 2 }}>
                {item.qty}
                {item.unit ? ` ${item.unit}` : ''}
              </Text>
            )}
          </Pressable>
        )}
      </Box>
    </Box>
  );
};
