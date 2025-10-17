// Mock for image/SVG files in tests
// SVG components need to be React components
// eslint-disable-next-line @typescript-eslint/no-var-requires
const React = require('react');

module.exports = function MockSvgComponent(props) {
  return React.createElement('svg', props);
};

// Also export as default for ES6 imports
module.exports.default = module.exports;
