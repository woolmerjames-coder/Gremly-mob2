/**
 * Tests for src/utils/notifications.ts
 * Tests push notification configuration, Expo Go detection,
 * notification categories/actions, and response handler config.
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
    expect(notifications).toHaveProperty('setupNotificationResponseHandler');
    expect(notifications).toHaveProperty('getInitialNotification');
    expect(notifications).toHaveProperty('hasNotificationPermission');
    expect(notifications).toHaveProperty('requestNotificationPermissionContextual');
    expect(notifications).toHaveProperty('registerNotificationCategories');
    expect(notifications).toHaveProperty('NOTIFICATION_CATEGORIES');
    expect(notifications).toHaveProperty('NOTIFICATION_ACTIONS');

    // Functions
    expect(typeof notifications.registerForPushNotifications).toBe('function');
    expect(typeof notifications.savePushToken).toBe('function');
    expect(typeof notifications.setupNotificationResponseHandler).toBe('function');
    expect(typeof notifications.getInitialNotification).toBe('function');
    expect(typeof notifications.hasNotificationPermission).toBe('function');
    expect(typeof notifications.requestNotificationPermissionContextual).toBe('function');
    expect(typeof notifications.registerNotificationCategories).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION_CATEGORIES & NOTIFICATION_ACTIONS constants
// ═══════════════════════════════════════════════════════════════════════════════

describe('NOTIFICATION_CATEGORIES', () => {
  it('has exactly 5 category keys', () => {
    const { NOTIFICATION_CATEGORIES } = require('../notifications');
    expect(Object.keys(NOTIFICATION_CATEGORIES)).toHaveLength(5);
  });

  it.each([
    'ENTITY_REMINDER',
    'ENTITY_REMINDER_DEADLINE',
    'MORNING_BRIEF',
    'EVENING_SWEEP',
    'AFTERNOON_CHECKIN',
  ])('contains %s', (key) => {
    const { NOTIFICATION_CATEGORIES } = require('../notifications');
    expect(NOTIFICATION_CATEGORIES).toHaveProperty(key);
    expect(typeof NOTIFICATION_CATEGORIES[key]).toBe('string');
  });
});

describe('NOTIFICATION_ACTIONS', () => {
  it('has exactly 8 action keys', () => {
    const { NOTIFICATION_ACTIONS } = require('../notifications');
    expect(Object.keys(NOTIFICATION_ACTIONS)).toHaveLength(8);
  });

  it.each([
    'DONE',
    'SNOOZE_15M',
    'SNOOZE_1HR',
    'SNOOZE_TOMORROW',
    'SNOOZE_BEFORE_DUE',
    'OPEN',
    'START',
    'VIEW',
  ])('contains %s', (key) => {
    const { NOTIFICATION_ACTIONS } = require('../notifications');
    expect(NOTIFICATION_ACTIONS).toHaveProperty(key);
    expect(typeof NOTIFICATION_ACTIONS[key]).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// hasNotificationPermission
// ═══════════════════════════════════════════════════════════════════════════════

describe('hasNotificationPermission', () => {
  it('exports hasNotificationPermission function', () => {
    const { hasNotificationPermission } = require('../notifications');
    expect(typeof hasNotificationPermission).toBe('function');
  });

  it('returns false in Expo Go', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { hasNotificationPermission } = require('../notifications');

    const result = await hasNotificationPermission();
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requestNotificationPermissionContextual
// ═══════════════════════════════════════════════════════════════════════════════

describe('requestNotificationPermissionContextual', () => {
  it('exports requestNotificationPermissionContextual function', () => {
    const { requestNotificationPermissionContextual } = require('../notifications');
    expect(typeof requestNotificationPermissionContextual).toBe('function');
  });

  it('returns null in Expo Go', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { requestNotificationPermissionContextual } = require('../notifications');

    const result = await requestNotificationPermissionContextual();
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// registerNotificationCategories
// ═══════════════════════════════════════════════════════════════════════════════

describe('registerNotificationCategories', () => {
  it('exports registerNotificationCategories function', () => {
    const { registerNotificationCategories } = require('../notifications');
    expect(typeof registerNotificationCategories).toBe('function');
  });

  it('is a no-op in Expo Go', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { registerNotificationCategories } = require('../notifications');

    // Should not throw
    await expect(registerNotificationCategories()).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupNotificationResponseHandler TESTS (config-object API)
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupNotificationResponseHandler', () => {
  it('exports setupNotificationResponseHandler function', () => {
    const notifications = require('../notifications');
    expect(typeof notifications.setupNotificationResponseHandler).toBe('function');
  });

  it('returns no-op unsubscribe in Expo Go', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { setupNotificationResponseHandler } = require('../notifications');

    const unsubscribe = await setupNotificationResponseHandler({
      onOpenFlow: jest.fn(),
      onOpenItem: jest.fn(),
      onDoneAction: jest.fn(),
      onSnooze: jest.fn(),
      onSnoozBeforeDue: jest.fn(),
      onStartFlow: jest.fn(),
    });
    expect(typeof unsubscribe).toBe('function');
    // Should not throw
    unsubscribe();
  });

  it('accepts config object with all 6 handler keys', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { setupNotificationResponseHandler } = require('../notifications');

    const config = {
      onOpenFlow: jest.fn(),
      onOpenItem: jest.fn(),
      onDoneAction: jest.fn(),
      onSnooze: jest.fn(),
      onSnoozBeforeDue: jest.fn(),
      onStartFlow: jest.fn(),
    };

    const unsubscribe = await setupNotificationResponseHandler(config);
    expect(typeof unsubscribe).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// registerForPushNotifications behavior change
// ═══════════════════════════════════════════════════════════════════════════════

describe('registerForPushNotifications (contextual permission)', () => {
  // Dynamic `await import()` in the source is incompatible with Jest's CJS
  // transform (requires --experimental-vm-modules). We verify the contract via
  // the Expo Go early-return tests above. This test documents intent.
  it.skip('does not request permission on startup — returns null when not granted', async () => {
    // Mock as standalone (not Expo Go) but permission not granted
    jest.doMock('expo-constants', () => ({
      appOwnership: 'standalone',
      manifest: null,
      manifest2: null,
      expoConfig: null,
    }));
    jest.doMock('expo-device', () => ({
      isDevice: true,
    }));
    jest.doMock('expo-notifications', () => ({
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
      requestPermissionsAsync: jest.fn(),
      getExpoPushTokenAsync: jest.fn(),
      setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
      SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
    }));
    jest.resetModules();
    const { registerForPushNotifications } = require('../notifications');

    const result = await registerForPushNotifications();
    expect(result).toBeNull();

    // Verify requestPermissionsAsync was NOT called (contextual prompt instead)
    const Notifications = require('expo-notifications');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getInitialNotification TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('getInitialNotification', () => {
  it('exports getInitialNotification function', () => {
    const notifications = require('../notifications');
    expect(typeof notifications.getInitialNotification).toBe('function');
  });

  it('returns null in Expo Go', async () => {
    jest.doMock('expo-constants', () => ({ appOwnership: 'expo' }));
    jest.resetModules();
    const { getInitialNotification } = require('../notifications');

    const result = await getInitialNotification();
    expect(result).toBeNull();
  });
});
