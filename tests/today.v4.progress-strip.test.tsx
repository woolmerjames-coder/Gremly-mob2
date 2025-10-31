import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayV4LanesView from '../app/tabs/TodayV4LanesView';

test('renders gradient progress strip', () => {
  renderWithProviders(<TodayV4LanesView />);
  expect(screen.getByTestId('today-v4-lanes-screen')).toBeTruthy();
});
