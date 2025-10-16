// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
let config = getDefaultConfig(__dirname);

// Apply NativeWind Metro plugin first
config = withNativeWind(config, {
  input: './global.css',
});

// Re-apply SVG transformer after NativeWind wraps the config
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// Ensure CSS is resolvable and keep SVG in source extensions
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: Array.from(new Set([...config.resolver.sourceExts, 'svg', 'css'])),
};

module.exports = config;
