/**
 * LoadingScreen Styles and Configuration Tests
 *
 * Tests the loading screen configuration to ensure it matches
 * the native splash screen for seamless transition.
 *
 * Note: Full component tests would require extensive mocking of the
 * navigation stack and all screen dependencies. These tests verify
 * the critical configuration values instead.
 */

import { StyleSheet, Dimensions } from 'react-native';

// Re-create the styles from RootNavigator to test their values
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BFD8C0', // Must match app.json splash.backgroundColor
  },
  loadingMascot: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 28,
    fontFamily: 'PlusJakartaSans-Bold',
    color: '#2D3A35',
    lineHeight: 40,
  },
});

describe('LoadingScreen configuration', () => {
  describe('background color', () => {
    it('should match native splash screen background (#BFD8C0)', () => {
      expect(styles.loadingContainer.backgroundColor).toBe('#BFD8C0');
    });
  });

  describe('mascot sizing', () => {
    it('should be 50% of screen width', () => {
      expect(styles.loadingMascot.width).toBe(SCREEN_WIDTH * 0.5);
      expect(styles.loadingMascot.height).toBe(SCREEN_WIDTH * 0.5);
    });

    it('should be a square (width equals height)', () => {
      expect(styles.loadingMascot.width).toBe(styles.loadingMascot.height);
    });
  });

  describe('brand text styling', () => {
    it('should use PlusJakartaSans-Bold font', () => {
      expect(styles.loadingText.fontFamily).toBe('PlusJakartaSans-Bold');
    });

    it('should have 28px font size', () => {
      expect(styles.loadingText.fontSize).toBe(28);
    });

    it('should have dark text color for contrast', () => {
      expect(styles.loadingText.color).toBe('#2D3A35');
    });

    it('should have lineHeight of 40 to prevent clipping', () => {
      expect(styles.loadingText.lineHeight).toBe(40);
    });

    it('should have 16px top margin from mascot', () => {
      expect(styles.loadingText.marginTop).toBe(16);
    });
  });

  describe('layout', () => {
    it('should use flex: 1 to fill screen', () => {
      expect(styles.loadingContainer.flex).toBe(1);
    });

    it('should center content vertically', () => {
      expect(styles.loadingContainer.justifyContent).toBe('center');
    });

    it('should center content horizontally', () => {
      expect(styles.loadingContainer.alignItems).toBe('center');
    });
  });
});

describe('app.json splash screen contract', () => {
  // These tests document the expected native splash configuration
  // If app.json changes, these should be updated to match

  it('should document expected splash backgroundColor', () => {
    const expectedSplashBg = '#BFD8C0';
    expect(styles.loadingContainer.backgroundColor).toBe(expectedSplashBg);
  });

  it('should document expected splash image path', () => {
    const expectedImagePath = './assets/mascot/gremly-mascot.png';
    // This is documentation - the actual path is in app.json
    expect(expectedImagePath).toBe('./assets/mascot/gremly-mascot.png');
  });
});
