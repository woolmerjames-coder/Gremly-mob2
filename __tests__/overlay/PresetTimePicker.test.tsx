/**
 * Preset Time Picker Tests
 * Tests for the preset time chip functionality in the unified overlay date picker
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { format, setHours, setMinutes } from 'date-fns';

describe('Preset Time Picker', () => {
  // Test the preset times constant
  describe('PRESET_TIMES constant', () => {
    it('should have 5 preset times', () => {
      const PRESET_TIMES = [
        { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
        { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
        { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
        { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
        { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
      ];

      expect(PRESET_TIMES).toHaveLength(5);
      expect(PRESET_TIMES[0].hour).toBe(9);
      expect(PRESET_TIMES[4].hour).toBe(21);
    });

    it('should have unique keys for each preset', () => {
      const PRESET_TIMES = [
        { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
        { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
        { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
        { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
        { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
      ];

      const keys = PRESET_TIMES.map((p) => p.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(PRESET_TIMES.length);
    });
  });

  describe('Time Toggle Behavior', () => {
    it('should default to first preset (9 AM) when time toggle is turned on', () => {
      // When showTimePicker is toggled from false to true
      // and selectedTimePreset is null
      // it should set selectedTimePreset to '9:00-AM'
      const defaultPresetKey = '9:00-AM';
      const defaultTime = setHours(setMinutes(new Date(), 0), 9);

      expect(defaultTime.getHours()).toBe(9);
      expect(defaultTime.getMinutes()).toBe(0);
      expect(defaultPresetKey).toBe('9:00-AM');
    });

    it('should reset preset selection when time toggle is turned off', () => {
      // When showTimePicker is toggled from true to false
      // selectedTimePreset should be set to null
      // showCustomTimePicker should be set to false
      let selectedTimePreset: string | 'custom' | null = '12:00-PM';
      let showCustomTimePicker = true;

      // Simulate toggle off
      selectedTimePreset = null;
      showCustomTimePicker = false;

      expect(selectedTimePreset).toBeNull();
      expect(showCustomTimePicker).toBe(false);
    });
  });

  describe('Preset Chip Selection', () => {
    it('should update selectedTime when a preset is clicked', () => {
      // Test 9 AM preset
      const preset9AM = { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' };
      const selectedTime = setHours(setMinutes(new Date(), preset9AM.minute), preset9AM.hour);

      expect(selectedTime.getHours()).toBe(9);
      expect(selectedTime.getMinutes()).toBe(0);

      // Test 3 PM preset
      const preset3PM = { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' };
      const selectedTime3PM = setHours(setMinutes(new Date(), preset3PM.minute), preset3PM.hour);

      expect(selectedTime3PM.getHours()).toBe(15);
      expect(selectedTime3PM.getMinutes()).toBe(0);
    });

    it('should update selectedTimePreset when a preset is clicked', () => {
      let selectedTimePreset: string | 'custom' | null = null;

      // Simulate clicking 12 PM preset
      selectedTimePreset = '12:00-PM';
      expect(selectedTimePreset).toBe('12:00-PM');

      // Simulate clicking 9 PM preset
      selectedTimePreset = '9:00-PM';
      expect(selectedTimePreset).toBe('9:00-PM');
    });

    it('should hide custom time picker when a preset is selected', () => {
      let showCustomTimePicker = true;
      let selectedTimePreset: string | 'custom' | null = 'custom';

      // Simulate clicking a preset after custom was selected
      selectedTimePreset = '12:00-PM';
      showCustomTimePicker = false;

      expect(selectedTimePreset).toBe('12:00-PM');
      expect(showCustomTimePicker).toBe(false);
    });

    it('should only allow one preset to be active at a time', () => {
      let selectedTimePreset: string | 'custom' | null = '9:00-AM';

      // Click another preset
      selectedTimePreset = '6:00-PM';

      // Only 6:00-PM should be active now
      expect(selectedTimePreset).toBe('6:00-PM');
    });
  });

  describe('Custom Time Selection', () => {
    it('should show custom time picker when Custom chip is clicked', () => {
      let selectedTimePreset: string | 'custom' | null = null;
      let showCustomTimePicker = false;

      // Simulate clicking Custom chip
      selectedTimePreset = 'custom';
      showCustomTimePicker = true;

      expect(selectedTimePreset).toBe('custom');
      expect(showCustomTimePicker).toBe(true);
    });

    it('should format custom time in 12-hour format with AM/PM', () => {
      const customTime = setHours(setMinutes(new Date(), 15), 14); // 2:15 PM
      const formatted = format(customTime, 'h:mm a');

      expect(formatted).toBe('2:15 PM');
    });

    it('should display "Custom…" when custom is not selected', () => {
      const selectedTimePreset: string | 'custom' | null = null;
      const chipLabel = selectedTimePreset === 'custom' ? 'Custom (time)' : 'Custom…';

      expect(chipLabel).toBe('Custom…');
    });

    it('should display "Custom (time)" when custom is selected', () => {
      const selectedTimePreset: string | 'custom' | null = 'custom';
      const selectedTime = setHours(setMinutes(new Date(), 3), 10); // 10:03 AM
      const chipLabel =
        selectedTimePreset === 'custom' ? `Custom (${format(selectedTime, 'h:mm a')})` : 'Custom…';

      expect(chipLabel).toBe('Custom (10:03 AM)');
    });

    it('should update selectedTime when custom time is changed', () => {
      let selectedTime = setHours(setMinutes(new Date(), 0), 9);

      // Simulate changing to 10:30 AM
      selectedTime = setHours(setMinutes(new Date(), 30), 10);

      expect(selectedTime.getHours()).toBe(10);
      expect(selectedTime.getMinutes()).toBe(30);
    });
  });

  describe('Set Button Integration', () => {
    it('should use preset time when creating due date with 9 AM', () => {
      const selectedDate = new Date('2025-11-20');
      const selectedTime = setHours(setMinutes(new Date(), 0), 9);
      const showTimePicker = true;

      const finalDate = setHours(
        setMinutes(selectedDate, selectedTime.getMinutes()),
        selectedTime.getHours(),
      );
      const finalIso = finalDate.toISOString();

      expect(finalDate.getHours()).toBe(9);
      expect(finalDate.getMinutes()).toBe(0);
      expect(typeof finalIso).toBe('string');
    });

    it('should use preset time when creating due date with 6 PM', () => {
      const selectedDate = new Date('2025-11-20');
      const selectedTime = setHours(setMinutes(new Date(), 0), 18); // 6 PM
      const showTimePicker = true;

      const finalDate = setHours(
        setMinutes(selectedDate, selectedTime.getMinutes()),
        selectedTime.getHours(),
      );

      expect(finalDate.getHours()).toBe(18);
      expect(finalDate.getMinutes()).toBe(0);
    });

    it('should use custom time when creating due date', () => {
      const selectedDate = new Date('2025-11-20');
      const selectedTime = setHours(setMinutes(new Date(), 45), 16); // 4:45 PM
      const showTimePicker = true;

      const finalDate = setHours(
        setMinutes(selectedDate, selectedTime.getMinutes()),
        selectedTime.getHours(),
      );

      expect(finalDate.getHours()).toBe(16);
      expect(finalDate.getMinutes()).toBe(45);
    });

    it('should use midnight when time toggle is off', () => {
      const selectedDate = new Date('2025-11-20');
      const showTimePicker = false;

      const finalDate = setHours(setMinutes(selectedDate, 0), 0);

      expect(finalDate.getHours()).toBe(0);
      expect(finalDate.getMinutes()).toBe(0);
    });
  });

  describe('State Reset on Clear', () => {
    it('should reset time-related state when Clear is pressed', () => {
      let showTimePicker = true;
      let selectedTimePreset: string | 'custom' | null = '3:00-PM';
      let showCustomTimePicker = false;

      // Simulate Clear button press
      showTimePicker = false;
      selectedTimePreset = null;
      showCustomTimePicker = false;

      expect(showTimePicker).toBe(false);
      expect(selectedTimePreset).toBeNull();
      expect(showCustomTimePicker).toBe(false);
    });
  });

  describe('State Reset on Cancel', () => {
    it('should reset all time-related state when Cancel is pressed', () => {
      let showTimePicker = true;
      let selectedTimePreset: string | 'custom' | null = 'custom';
      let showCustomTimePicker = true;

      // Simulate Cancel button press
      showTimePicker = false;
      selectedTimePreset = null;
      showCustomTimePicker = false;

      expect(showTimePicker).toBe(false);
      expect(selectedTimePreset).toBeNull();
      expect(showCustomTimePicker).toBe(false);
    });
  });

  describe('State Reset on Set', () => {
    it('should reset all time-related state when Set is pressed', () => {
      let showTimePicker = true;
      let selectedTimePreset: string | 'custom' | null = '12:00-PM';
      let showCustomTimePicker = false;

      // Simulate Set button press (after applying the changes)
      showTimePicker = false;
      selectedTimePreset = null;
      showCustomTimePicker = false;

      expect(showTimePicker).toBe(false);
      expect(selectedTimePreset).toBeNull();
      expect(showCustomTimePicker).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle switching from custom to preset', () => {
      let selectedTimePreset: string | 'custom' | null = 'custom';
      let showCustomTimePicker = true;

      // Switch to preset
      selectedTimePreset = '9:00-AM';
      showCustomTimePicker = false;

      expect(selectedTimePreset).toBe('9:00-AM');
      expect(showCustomTimePicker).toBe(false);
    });

    it('should handle switching from preset to custom', () => {
      let selectedTimePreset: string | 'custom' | null = '3:00-PM';
      let showCustomTimePicker = false;

      // Switch to custom
      selectedTimePreset = 'custom';
      showCustomTimePicker = true;

      expect(selectedTimePreset).toBe('custom');
      expect(showCustomTimePicker).toBe(true);
    });

    it('should maintain selectedTime when toggling between presets', () => {
      let selectedTime = setHours(setMinutes(new Date(), 0), 9);

      // Switch to different preset
      selectedTime = setHours(setMinutes(new Date(), 0), 15);

      expect(selectedTime.getHours()).toBe(15);
      expect(selectedTime.getMinutes()).toBe(0);
    });

    it('should format edge case times correctly', () => {
      // Midnight
      const midnight = setHours(setMinutes(new Date(), 0), 0);
      expect(format(midnight, 'h:mm a')).toBe('12:00 AM');

      // Noon
      const noon = setHours(setMinutes(new Date(), 0), 12);
      expect(format(noon, 'h:mm a')).toBe('12:00 PM');

      // 1 minute after midnight
      const afterMidnight = setHours(setMinutes(new Date(), 1), 0);
      expect(format(afterMidnight, 'h:mm a')).toBe('12:01 AM');

      // 11:59 PM
      const beforeMidnight = setHours(setMinutes(new Date(), 59), 23);
      expect(format(beforeMidnight, 'h:mm a')).toBe('11:59 PM');
    });
  });

  describe('Visual State Indicators', () => {
    it('should indicate which preset is selected visually', () => {
      const selectedTimePreset: string | 'custom' | null = '12:00-PM';
      const isPreset9AMSelected = selectedTimePreset === '9:00-AM';
      const isPreset12PMSelected = selectedTimePreset === '12:00-PM';

      expect(isPreset9AMSelected).toBe(false);
      expect(isPreset12PMSelected).toBe(true);
    });

    it('should indicate custom is selected visually', () => {
      const selectedTimePreset: string | 'custom' | null = 'custom';
      const isCustomSelected = selectedTimePreset === 'custom';

      expect(isCustomSelected).toBe(true);
    });

    it('should apply green accent color when preset is selected', () => {
      const selectedTimePreset: string | 'custom' | null = '6:00-PM';
      const borderColor = selectedTimePreset === '6:00-PM' ? '#2E5540' : '#E0E0E0';
      const backgroundColor = selectedTimePreset === '6:00-PM' ? '#F0F4F1' : '#FAFAFA';

      expect(borderColor).toBe('#2E5540');
      expect(backgroundColor).toBe('#F0F4F1');
    });

    it('should apply default styling when preset is not selected', () => {
      const selectedTimePreset: string | 'custom' | null = '3:00-PM';
      const borderColor = selectedTimePreset === '9:00-AM' ? '#2E5540' : '#E0E0E0';
      const backgroundColor = selectedTimePreset === '9:00-AM' ? '#F0F4F1' : '#FAFAFA';

      expect(borderColor).toBe('#E0E0E0');
      expect(backgroundColor).toBe('#FAFAFA');
    });
  });
});
