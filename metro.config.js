const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Configure SVG transformer
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// Add .lottie to assetExts and keep svg in sourceExts
config.resolver = {
  ...config.resolver,
  assetExts: [...new Set([...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'lottie'])],
  sourceExts: [...new Set([...config.resolver.sourceExts, 'svg'])],
};

module.exports = config;
