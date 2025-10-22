import React from 'react';
import { Box, Text } from '../../ui';
import { TouchableOpacity } from 'react-native';

interface ListSwitcherProps {
  selectedList: 'shopping' | 'packing';
  onSelectList: (list: 'shopping' | 'packing') => void;
}

export const ListSwitcher: React.FC<ListSwitcherProps> = ({ selectedList, onSelectList }) => {
  return (
    <Box row center py={3}>
      <Box row bg="border" radius={2} p={1}>
        <TouchableOpacity
          onPress={() => onSelectList('shopping')}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: selectedList === 'shopping' ? '#0D3B3A' : 'transparent',
          }}
        >
          <Text
            variant="label"
            style={{
              color: selectedList === 'shopping' ? 'white' : '#6A6F76',
              fontWeight: selectedList === 'shopping' ? '600' : '400',
            }}
          >
            Shopping
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSelectList('packing')}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: selectedList === 'packing' ? '#0D3B3A' : 'transparent',
          }}
        >
          <Text
            variant="label"
            style={{
              color: selectedList === 'packing' ? 'white' : '#6A6F76',
              fontWeight: selectedList === 'packing' ? '600' : '400',
            }}
          >
            Packing
          </Text>
        </TouchableOpacity>
      </Box>
    </Box>
  );
};
