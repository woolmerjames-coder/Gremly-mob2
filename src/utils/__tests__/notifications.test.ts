/**
 * Tests for src/utils/notifications.ts
 * Tests push notification configuration and Expo Go detection
 *
 * Note: The notifications module uses dynamic imports for expo-notifications
 * and expo-device to avoid crashes in Expo Go. Due to Jest limitations with
 * dynamic imports, we test the configuration and Expo Go guard behavior.
 */

describe('notifications module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('Expo Go detection', () => {
    it('exports registerForPushNotifications function', () => {
      const notifications = require('../notifications');
      expect(typeof notifications.registerForPushNotifications).toBe('function');
    });

    it('exports savePushToken function', () => {
      const notifications = require('../notifications');
      expect(typeof notifications.savePushToken).toBe('function');
    });

    it('registerForPushNotifications returns null in Expo Go', async () => {
      // With appOwnership === 'expo', the function should return null early
      jest.doMock('expo-constants', () => ({
        appOwnership: 'expo',
      }));

      // Re-require to get fresh module with mocked Constants
      jest.resetModules();
      const { registerForPushNotifications } = require('../notifications');

      const result = await registerForPushNotifications();
      expect(result).toBeNull();
    });

    it('savePushToken does nothing in Expo Go', async () => {
      jest.doMock('expo-constants', () => ({
        appOwnership: 'expo',
      }));

      jest.resetModules();
      const { savePushToken } = require('../notifications');

      // Should not throw and should complete without error
      await expect(savePushToken('user-123', 'ExponentPushToken[xxx]')).resolves.not.toThrow();
    });
  });

  describe('notification constants', () => {
    it('uses correct project ID for Expo push tokens', () => {
      // The project ID should match the one in app.json
      // This is validated at runtime in the actual function
      const expectedProjectId = '4c82fb8d-fdff-41a8-8fec-ce46ee3e6183';

      // Read the source file to verify the project ID
      const fs = require('fs');
      const path = require('path');
      const sourceFile = fs.readFileSync(path.join(__dirname, '../notifications.ts'), 'utf-8');

      expect(sourceFile).toContain(expectedProjectId);
    });

    it('Platform is available for determining iOS/Android', () => {
      const { Platform } = require('react-native');
      expect(Platform).toBeDefined();
      expect(typeof Platform.OS).toBe('string');
    });
  });
});

describe('notification module safety', () => {
  it('does not crash on import in test environment', () => {
    expect(() => {
      require('../notifications');
    }).not.toThrow();
  });

  it('module structure matches expected interface', () => {
    const notifications = require('../notifications');

    // Verify the module exports the expected functions
    expect(notifications).toHaveProperty('registerForPushNotifications');
    expect(notifications).toHaveProperty('savePushToken');

    // Both should be functions that return promises
    expect(typeof notifications.registerForPushNotifications).toBe('function');
    expect(typeof notifications.savePushToken).toBe('function');
  });
});
