import React from 'react';
import { renderWithProviders, screen } from './utils/renderWithProviders';
import TodayV4LanesView from '../app/tabs/TodayV4LanesView';

test('renders lanes headings', () => {
  renderWithProviders(<TodayV4LanesView />);
  expect(screen.getByText(/In Progress/i)).toBeTruthy();
  expect(screen.getByText(/Done/i)).toBeTruthy();
});
