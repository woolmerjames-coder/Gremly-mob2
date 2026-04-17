// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

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

// Use project-local cache to avoid system temp folder permission issues
config.cacheStores = [];
config.fileMapCacheDirectory = './.metro-cache';

module.exports = withSentryConfig(config);
