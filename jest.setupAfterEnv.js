/* eslint-env jest */

// Each test file gets its own in-memory Realm, emptied before every test.
// Realm still writes lock/management files next to the path, so the path is
// inside the system temp folder and removed when the file's tests finish.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clearStore, closeStore, configureInMemoryStoreForTests } = require('./src/db/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snipback-jest-'));
configureInMemoryStoreForTests(path.join(dir, 'test.realm'));

beforeEach(() => {
  clearStore();
});

afterAll(() => {
  closeStore();
  fs.rmSync(dir, { recursive: true, force: true });
});
