/**
 * Mock for @react-native-google-signin/google-signin
 * Used in Jest tests to avoid ESM parsing issues
 */

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  signIn: jest.fn().mockResolvedValue({
    type: 'success',
    data: {
      idToken: 'mock-id-token',
      user: {
        email: 'test@example.com',
        id: 'mock-user-id',
        name: 'Test User',
      },
    },
  }),
  signOut: jest.fn().mockResolvedValue(null),
  isSignedIn: jest.fn().mockResolvedValue(false),
  getCurrentUser: jest.fn().mockResolvedValue(null),
  revokeAccess: jest.fn().mockResolvedValue(null),
};

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

export const isSuccessResponse = jest.fn((response) => response?.type === 'success');
export const isErrorWithCode = jest.fn((error) => error?.code !== undefined);

export default {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
  isErrorWithCode,
};
