/**
 * Mock for react-native-gesture-handler
 * Minimal mock to avoid requiring native gesture runtime in Jest
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Swipeable = ({ children }: any) => children;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RectButton = ({ children }: any) => children;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TouchableOpacity = ({ children }: any) => children;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GestureDetector = ({ children }: any) => children;

export default {};
