module.exports = function (api) {
  // Cache config forever; avoid api.env here to prevent cache conflicts under Jest
  api.cache(true);
  const isTest = process.env.NODE_ENV === 'test' || process.env.BABEL_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Strip console.log in production builds
      ...(isProd ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : []),
      // Keep Reanimated plugin LAST
      'react-native-reanimated/plugin',
    ],
  };
};
