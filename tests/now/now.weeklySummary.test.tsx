/**
 * Tests for NowWeeklySummary Component
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NowWeeklySummary } from '../../components/now/NowWeeklySummary';

describe('NowWeeklySummary', () => {
  it('renders with non-zero stats', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 7,
          journals: 3,
          ideas: 8,
        }}
      />,
    );

    expect(screen.getByText('This week…')).toBeTruthy();
    expect(screen.getByText('7 lists · 3 journals · 8 ideas')).toBeTruthy();
  });

  it('renders with mixed stats', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 5,
          journals: 0,
          ideas: 2,
        }}
      />,
    );

    expect(screen.getByText('This week…')).toBeTruthy();
    expect(screen.getByText('5 lists · 0 journals · 2 ideas')).toBeTruthy();
  });

  it('does not render when all stats are zero', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 0,
          journals: 0,
          ideas: 0,
        }}
      />,
    );

    // Component should return null
    expect(screen.queryByText('This week…')).toBeFalsy();
  });

  it('renders with only lists', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 3,
          journals: 0,
          ideas: 0,
        }}
      />,
    );

    expect(screen.getByText('This week…')).toBeTruthy();
    expect(screen.getByText('3 lists · 0 journals · 0 ideas')).toBeTruthy();
  });

  it('renders with only journals', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 0,
          journals: 5,
          ideas: 0,
        }}
      />,
    );

    expect(screen.getByText('This week…')).toBeTruthy();
    expect(screen.getByText('0 lists · 5 journals · 0 ideas')).toBeTruthy();
  });

  it('renders with only ideas', () => {
    render(
      <NowWeeklySummary
        stats={{
          lists: 0,
          journals: 0,
          ideas: 10,
        }}
      />,
    );

    expect(screen.getByText('This week…')).toBeTruthy();
    expect(screen.getByText('0 lists · 0 journals · 10 ideas')).toBeTruthy();
  });
});
