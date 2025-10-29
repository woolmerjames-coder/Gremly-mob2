// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure SVG transformer
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// Keep SVG in source extensions and allow .lottie assets to bundle via Metro
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'lottie'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = config;
