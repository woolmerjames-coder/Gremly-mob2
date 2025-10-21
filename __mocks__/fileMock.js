// Mock for image/SVG files in tests that play nicely with React Native
// eslint-disable-next-line @typescript-eslint/no-var-requires
const React = require('react');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { View } = require('react-native');

function MockSvgComponent(props) {
  // Render a simple View so React Native Testing Library can handle it
  return React.createElement(View, {
    accessibilityLabel: props?.accessibilityLabel ?? 'mock-svg',
    style: props?.style,
    testID: props?.testID,
  });
}

module.exports = MockSvgComponent;
module.exports.default = MockSvgComponent;
module.exports.ReactComponent = MockSvgComponent;
