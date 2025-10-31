import React from 'react';
import { renderWithProviders } from './utils/renderWithProviders';
import { Dotline } from '../components/today/Dotline';

test('Dotline renders without crashing', () => {
  renderWithProviders(<Dotline total={5} filled={2} color="#E0C47A" />);
  expect(true).toBe(true);
});
