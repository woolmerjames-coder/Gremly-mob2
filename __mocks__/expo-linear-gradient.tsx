import React from 'react';
import { View, ViewProps } from 'react-native';

type LinearGradientProps = ViewProps & {
  colors: string[];
  locations?: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

export const LinearGradient: React.FC<LinearGradientProps> = ({ children, style, ...rest }) => (
  <View style={style} {...rest}>
    {children}
  </View>
);

export default LinearGradient;
