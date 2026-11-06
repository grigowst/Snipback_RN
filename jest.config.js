module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Metro resolves image@3x.png from require('image.png'); Jest cannot, so stub images.
  moduleNameMapper: {
    '\\.(png|jpe?g|gif)$': '<rootDir>/__mocks__/imageStub.js',
  },
  // React Navigation and the native-module packages ship untranspiled ESM.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-.*|@react-navigation)/)',
  ],
};
