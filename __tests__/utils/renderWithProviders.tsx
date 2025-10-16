import React, { PropsWithChildren } from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react-native';
import { View } from 'react-native';
import { ThemeProvider } from '../../providers/ThemeProvider';

function AllProviders({ children }: PropsWithChildren) {
  return (
    <View style={{ flex: 1 }}>
      <ThemeProvider>{children}</ThemeProvider>
    </View>
  );
}

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
