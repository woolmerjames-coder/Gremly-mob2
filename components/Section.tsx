/**
 * Section - Consistent section wrapper with header
 * Used across Today, Spaces, Journal screens
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { createScreenStyles } from '../design/styles';

export const Section: React.FC<{
  title: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, children, right }) => {
  const t = useTokens();
  const s = createScreenStyles(t);

  return (
    <View style={{ marginBottom: t.spacing[5] }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={s.sectionHeader}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
};
