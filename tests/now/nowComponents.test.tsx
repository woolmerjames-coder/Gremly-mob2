/**
 * Tests for NOW Page Components (Shallow Render)
 * Tests component mounting and placeholder content
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';

describe('NowHeader', () => {
  it('mounts successfully', () => {
    render(<NowHeader />);
    expect(screen.getByText(/Hi James/)).toBeTruthy();
  });

  it('displays greeting text', () => {
    render(<NowHeader />);
    expect(screen.getByText(/Hi James/)).toBeTruthy();
    expect(screen.getByText(/Good Morning/)).toBeTruthy();
  });

  it('displays date and time placeholder', () => {
    render(<NowHeader />);
    expect(screen.getByText(/Monday, November 25/)).toBeTruthy();
    expect(screen.getByText(/10:30 AM/)).toBeTruthy();
  });

  it('displays week indicator', () => {
    render(<NowHeader />);
    expect(screen.getByText('WEEK:')).toBeTruthy();
    expect(screen.getByText('◐')).toBeTruthy();
  });
});

describe('NowVaultBar', () => {
  it('mounts successfully', () => {
    render(<NowVaultBar />);
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
  });

  it('displays Mind Vault title', () => {
    render(<NowVaultBar />);
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
  });

  it('displays placeholder pills', () => {
    render(<NowVaultBar />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Gift ideas')).toBeTruthy();
    expect(screen.getByText('Mexico list')).toBeTruthy();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });
});

describe('NowList', () => {
  it('mounts successfully', () => {
    render(<NowList />);
    expect(screen.getByText('NOW')).toBeTruthy();
  });

  it('displays NOW header', () => {
    render(<NowList />);
    expect(screen.getByText('NOW')).toBeTruthy();
  });

  it('displays locked item placeholder', () => {
    render(<NowList />);
    expect(screen.getByText('⚡')).toBeTruthy();
    expect(screen.getByText('Placeholder locked item')).toBeTruthy();
    expect(screen.getByText('#focus')).toBeTruthy();
  });

  it('displays active item placeholders', () => {
    render(<NowList />);
    const activeItems = screen.getAllByText('Placeholder active item');
    expect(activeItems.length).toBeGreaterThan(0);
  });

  it('displays habit status placeholder', () => {
    render(<NowList />);
    const statusTexts = screen.getAllByText('2 days left this week');
    expect(statusTexts.length).toBeGreaterThan(0);
  });

  it('displays future divider', () => {
    render(<NowList />);
    expect(screen.getByText('Future')).toBeTruthy();
  });
});

describe('NowSweepBar', () => {
  it('mounts successfully', () => {
    render(<NowSweepBar />);
    expect(screen.getByText('🧹 Sweep Available')).toBeTruthy();
  });

  it('displays sweep button text', () => {
    render(<NowSweepBar />);
    expect(screen.getByText('🧹 Sweep Available')).toBeTruthy();
  });
});

describe('OverwhelmButton', () => {
  it('mounts successfully', () => {
    render(<OverwhelmButton />);
    expect(screen.getByText('😮‍💨')).toBeTruthy();
  });

  it('displays emoji icon', () => {
    render(<OverwhelmButton />);
    expect(screen.getByText('😮‍💨')).toBeTruthy();
  });

  it('displays stuck text', () => {
    render(<OverwhelmButton />);
    expect(screen.getByText('Feeling stuck?')).toBeTruthy();
  });
});
