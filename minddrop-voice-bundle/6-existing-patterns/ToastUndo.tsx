import React, { useEffect } from 'react';
import { Box, Text, Button } from '../../ui';

export default function ToastUndo({
  visible,
  onUndo,
  onHide,
  message = 'Change saved',
}: {
  visible: boolean;
  onUndo: () => void;
  onHide: () => void;
  message?: string;
}) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onHide(), 3000);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <Box
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 24,
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#111',
        alignItems: 'center',
      }}
      row
      gap={2}
    >
      <Text style={{ color: '#fff', flex: 1 }}>{message}</Text>
      <Button variant="ghost" size="sm" onPress={onUndo} title="Undo" />
    </Box>
  );
}
