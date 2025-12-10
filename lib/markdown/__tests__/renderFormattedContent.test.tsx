/**
 * Tests for renderFormattedContent
 *
 * This function renders markdown-like text with support for:
 * - **bold** syntax
 * - Bullet lists (• or -)
 * - Numbered lists (1. 2. 3.)
 * - Empty lines as spacing
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import { renderFormattedContent } from '../renderFormattedContent';

// Wrapper component for testing
const TestWrapper = ({ content, options = {} }: { content: string; options?: any }) => {
  return <View testID="container">{renderFormattedContent(content, options)}</View>;
};

describe('renderFormattedContent', () => {
  describe('basic text rendering', () => {
    it('renders plain text', () => {
      const { getByText } = render(<TestWrapper content="Hello world" />);
      expect(getByText('Hello world')).toBeTruthy();
    });

    it('renders multiple lines', () => {
      const { getByText } = render(<TestWrapper content={'Line one\nLine two'} />);
      expect(getByText('Line one')).toBeTruthy();
      expect(getByText('Line two')).toBeTruthy();
    });

    it('trims whitespace from lines', () => {
      const { getByText } = render(<TestWrapper content="  Padded text  " />);
      expect(getByText('Padded text')).toBeTruthy();
    });
  });

  describe('bold syntax', () => {
    it('renders bold text with ** markers', () => {
      const { getByText } = render(<TestWrapper content="This is **bold** text" />);
      expect(getByText('bold')).toBeTruthy();
      expect(getByText('This is ')).toBeTruthy();
      expect(getByText(' text')).toBeTruthy();
    });

    it('renders multiple bold segments', () => {
      const { getByText } = render(<TestWrapper content="**First** and **second** bold" />);
      expect(getByText('First')).toBeTruthy();
      expect(getByText('second')).toBeTruthy();
    });

    it('handles text with no bold markers', () => {
      const { getByText } = render(<TestWrapper content="No bold here" />);
      expect(getByText('No bold here')).toBeTruthy();
    });

    it('handles unclosed bold markers gracefully', () => {
      const { getByText } = render(<TestWrapper content="Unclosed **bold" />);
      // Should render as-is since no closing **
      expect(getByText('Unclosed **bold')).toBeTruthy();
    });
  });

  describe('bullet lists', () => {
    it('renders • bullet points', () => {
      const { getByText, getAllByText } = render(<TestWrapper content={'• First item'} />);
      expect(getByText('First item')).toBeTruthy();
      expect(getAllByText('•').length).toBe(1);
    });

    it('renders - bullet points as •', () => {
      const { getByText, getAllByText } = render(<TestWrapper content={'- First item'} />);
      expect(getByText('First item')).toBeTruthy();
      // Dashes are converted to bullets
      expect(getAllByText('•').length).toBe(1);
    });

    it('renders bold within bullet items', () => {
      const { getByText } = render(<TestWrapper content="• This is **important**" />);
      expect(getByText('important')).toBeTruthy();
      expect(getByText('This is ')).toBeTruthy();
    });
  });

  describe('numbered lists', () => {
    it('renders numbered list items', () => {
      const { getByText } = render(<TestWrapper content={'1. First step'} />);
      expect(getByText('1.')).toBeTruthy();
      expect(getByText('First step')).toBeTruthy();
    });

    it('renders bold within numbered items', () => {
      const { getByText } = render(<TestWrapper content="1. Do **this** first" />);
      expect(getByText('this')).toBeTruthy();
      expect(getByText('Do ')).toBeTruthy();
      expect(getByText(' first')).toBeTruthy();
    });

    it('handles multi-digit numbers', () => {
      const { getByText } = render(<TestWrapper content={'10. Step ten'} />);
      expect(getByText('10.')).toBeTruthy();
      expect(getByText('Step ten')).toBeTruthy();
    });
  });

  describe('empty lines', () => {
    it('handles empty lines as spacing', () => {
      const result = renderFormattedContent('Line one\n\nLine two');
      // Should have 3 elements: line, spacer, line
      expect(result.length).toBe(3);
    });

    it('handles multiple consecutive empty lines', () => {
      const result = renderFormattedContent('Start\n\n\nEnd');
      // Start, spacer, spacer, End
      expect(result.length).toBe(4);
    });
  });

  describe('custom options', () => {
    it('applies custom text color', () => {
      const { UNSAFE_getAllByType } = render(
        <TestWrapper content="Colored text" options={{ textColor: '#FF0000' }} />,
      );
      // Just verify it renders without error
      expect(UNSAFE_getAllByType('Text' as any).length).toBeGreaterThan(0);
    });

    it('applies custom font size', () => {
      const { getByText } = render(<TestWrapper content="Large text" options={{ fontSize: 24 }} />);
      expect(getByText('Large text')).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = renderFormattedContent('');
      expect(result.length).toBe(1); // One empty line spacer
    });

    it('handles string with only whitespace', () => {
      const result = renderFormattedContent('   ');
      expect(result.length).toBe(1); // Trimmed to empty = spacer
    });

    it('handles mixed content types', () => {
      const content = `**Introduction**

• First point

1. Step one

Final paragraph`;

      const { getByText } = render(<TestWrapper content={content} />);
      expect(getByText('Introduction')).toBeTruthy();
      expect(getByText('First point')).toBeTruthy();
      expect(getByText('Step one')).toBeTruthy();
      expect(getByText('Final paragraph')).toBeTruthy();
    });
  });
});
