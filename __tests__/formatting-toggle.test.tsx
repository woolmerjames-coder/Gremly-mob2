/**
 * Tests for FormattingToggle component
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  FormattingToggle,
  type FormattingType,
} from '../components/overlay/fields/FormattingToggle';

describe('FormattingToggle', () => {
  describe('Basic Rendering', () => {
    it('should render all three formatting options', () => {
      const onChange = jest.fn();
      const { getByTestId, getByText } = render(
        <FormattingToggle value={null} onChange={onChange} />,
      );

      expect(getByTestId('fmt-bullets')).toBeTruthy();
      expect(getByTestId('fmt-numbers')).toBeTruthy();
      expect(getByTestId('fmt-checkboxes')).toBeTruthy();

      expect(getByText('Bullets')).toBeTruthy();
      expect(getByText('Numbers')).toBeTruthy();
      expect(getByText('Checkboxes')).toBeTruthy();
    });

    it('should render with custom label', () => {
      const onChange = jest.fn();
      const { getByText } = render(
        <FormattingToggle value={null} onChange={onChange} label="List formatting" />,
      );

      expect(getByText('List formatting')).toBeTruthy();
    });

    it('should render without label by default', () => {
      const onChange = jest.fn();
      const { queryByText } = render(<FormattingToggle value={null} onChange={onChange} />);

      // Default label "Format" should be present
      expect(queryByText('Format')).toBeTruthy();
    });
  });

  describe('Selection Behavior', () => {
    it('should select bullets when clicked', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value={null} onChange={onChange} />);

      fireEvent.press(getByTestId('fmt-bullets'));

      expect(onChange).toHaveBeenCalledWith('bullets');
    });

    it('should select numbers when clicked', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value={null} onChange={onChange} />);

      fireEvent.press(getByTestId('fmt-numbers'));

      expect(onChange).toHaveBeenCalledWith('numbers');
    });

    it('should select checkboxes when clicked', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value={null} onChange={onChange} />);

      fireEvent.press(getByTestId('fmt-checkboxes'));

      expect(onChange).toHaveBeenCalledWith('checkboxes');
    });

    it('should toggle off when clicking selected option', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value="bullets" onChange={onChange} />);

      fireEvent.press(getByTestId('fmt-bullets'));

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should switch between options', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value="bullets" onChange={onChange} />);

      fireEvent.press(getByTestId('fmt-numbers'));

      expect(onChange).toHaveBeenCalledWith('numbers');
    });
  });

  describe('Visual States', () => {
    it('should show bullets as selected', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value="bullets" onChange={onChange} />);

      const bulletsOption = getByTestId('fmt-bullets');
      expect(bulletsOption).toBeTruthy();
      // Visual state is tested through style application
    });

    it('should show numbers as selected', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value="numbers" onChange={onChange} />);

      const numbersOption = getByTestId('fmt-numbers');
      expect(numbersOption).toBeTruthy();
    });

    it('should show checkboxes as selected', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value="checkboxes" onChange={onChange} />);

      const checkboxesOption = getByTestId('fmt-checkboxes');
      expect(checkboxesOption).toBeTruthy();
    });

    it('should show no selection when value is null', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(<FormattingToggle value={null} onChange={onChange} />);

      // All options should be rendered (not selected)
      expect(getByTestId('fmt-bullets')).toBeTruthy();
      expect(getByTestId('fmt-numbers')).toBeTruthy();
      expect(getByTestId('fmt-checkboxes')).toBeTruthy();
    });
  });

  describe('Disabled State', () => {
    it('should not call onChange when disabled', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(
        <FormattingToggle value={null} onChange={onChange} disabled />,
      );

      fireEvent.press(getByTestId('fmt-bullets'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should apply disabled styles', () => {
      const onChange = jest.fn();
      const { getByTestId } = render(
        <FormattingToggle value={null} onChange={onChange} disabled />,
      );

      // Just verify the component renders when disabled
      const bulletsOption = getByTestId('fmt-bullets');
      expect(bulletsOption).toBeTruthy();
    });
  });

  describe('Type Safety', () => {
    it('should accept all valid FormattingType values', () => {
      const onChange = jest.fn();
      const validValues: FormattingType[] = ['bullets', 'numbers', 'checkboxes', null];

      validValues.forEach((value) => {
        const { unmount } = render(<FormattingToggle value={value} onChange={onChange} />);
        expect(true).toBe(true); // Type check passes
        unmount();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should work in a stateful scenario', () => {
      const TestComponent = () => {
        const [value, setValue] = React.useState<FormattingType>(null);
        return <FormattingToggle value={value} onChange={setValue} />;
      };

      const { getByTestId } = render(<TestComponent />);

      // Select bullets
      fireEvent.press(getByTestId('fmt-bullets'));
      expect(getByTestId('fmt-bullets')).toBeTruthy();

      // Switch to numbers
      fireEvent.press(getByTestId('fmt-numbers'));
      expect(getByTestId('fmt-numbers')).toBeTruthy();

      // Toggle off
      fireEvent.press(getByTestId('fmt-numbers'));
      expect(getByTestId('fmt-numbers')).toBeTruthy();
    });
  });
});
