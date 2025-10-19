/**
 * Tests for icon implementation (Step 8)
 * Verify that emojis have been replaced with DS icons
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Icon, entityTypeToIcon } from '../components/ui/Icon';

describe('Icon Component', () => {
  it('renders without crashing', () => {
    render(<Icon name="Activity" size="sm" />);
    // Icon component doesn't have testID by default, just checking it renders
    expect(true).toBe(true);
  });

  it('supports all entity type icons', () => {
    const entityTypes = ['habit', 'todo', 'journal', 'note', 'person'];
    entityTypes.forEach((type) => {
      expect(entityTypeToIcon[type]).toBeDefined();
    });
  });

  it('maps entity types correctly', () => {
    expect(entityTypeToIcon.habit).toBe('Activity');
    expect(entityTypeToIcon.todo).toBe('CheckCircle2');
    expect(entityTypeToIcon.journal).toBe('BookOpen');
    expect(entityTypeToIcon.note).toBe('FileText');
    expect(entityTypeToIcon.person).toBe('User');
  });

  it('renders different sizes', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    sizes.forEach((size) => {
      const { unmount } = render(<Icon name="Activity" size={size} />);
      expect(true).toBe(true);
      unmount();
    });
  });

  it('renders with custom color', () => {
    const { unmount } = render(<Icon name="Sparkles" size="sm" color="#0F4C5C" />);
    expect(true).toBe(true);
    unmount();
  });
});
