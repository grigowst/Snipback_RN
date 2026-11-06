module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./jest.setupAfterEnv.js'],
  // Realm's Node build keeps the process alive even after every Realm is closed,
  // so Jest would wait forever at the end of a run.
  forceExit: true,
  moduleNameMapper: {
    // Metro resolves image@3x.png from require('image.png'); Jest cannot, so stub images.
    '\\.(png|jpe?g|gif)$': '<rootDir>/__mocks__/imageStub.js',
    // Tests run Realm's Node build (real Realm, in-memory) instead of the native module.
    '^realm$': '<rootDir>/node_modules/realm/dist/platform/node/index.js',
    '^@realm/fetch$': '<rootDir>/node_modules/@realm/fetch/dist/node-cjs/node.js',
  },
  // React Navigation and the native-module packages ship untranspiled ESM.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-.*|@react-navigation)/)',
  ],
};
