// NOTE: Sentry bundling is handled by the @sentry/react-native/expo config plugin
// declared in app.json. Do NOT manually wire createSentryMetroSerializer here —
// it breaks EAS builds on newer Expo SDKs. If Sentry debug IDs aren't working,
// verify the plugin is in app.json's plugins array.

// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
