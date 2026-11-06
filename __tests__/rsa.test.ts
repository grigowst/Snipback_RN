import forge from 'node-forge';
import { rsaEncrypt, rsaEncryptWithKey } from '../src/utils/rsa';

// A small key keeps the test fast; the chunk sizes scale with the key
// (1024-bit: 128-byte blocks holding 117 bytes each).
const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
const BLOCK = 128;
const CHUNK = BLOCK - 11;

/** Decrypts block by block, the way the server reads SwiftyRSA's output. */
function decrypt(base64: string): string {
  const bytes = forge.util.decode64(base64);
  let clear = '';
  for (let i = 0; i < bytes.length; i += BLOCK) {
    clear += keys.privateKey.decrypt(bytes.slice(i, i + BLOCK), 'RSAES-PKCS1-V1_5');
  }
  return forge.util.decodeUtf8(clear);
}

const blocks = (base64: string) => forge.util.decode64(base64).length / BLOCK;

test('a value that fits one block is one block', () => {
  const value = 'x'.repeat(CHUNK);
  const out = rsaEncryptWithKey(value, keys.publicKey);
  expect(blocks(out)).toBe(1);
  expect(decrypt(out)).toBe(value);
});

test('a longer value is split into chunks, each its own block, base64-encoded once', () => {
  const value = 'y'.repeat(CHUNK + 1);
  const out = rsaEncryptWithKey(value, keys.publicKey);
  expect(blocks(out)).toBe(2);
  expect(decrypt(out)).toBe(value);

  const long = 'z'.repeat(CHUNK * 3 + 5);
  expect(blocks(rsaEncryptWithKey(long, keys.publicKey))).toBe(4);
  expect(decrypt(rsaEncryptWithKey(long, keys.publicKey))).toBe(long);
});

test('chunks are cut by UTF-8 bytes, so multi-byte text survives', () => {
  const value = 'é'.repeat(CHUNK); // 2 bytes each
  expect(decrypt(rsaEncryptWithKey(value, keys.publicKey))).toBe(value);
});

test('the app key (2048-bit) gives 256-byte blocks', () => {
  expect(forge.util.decode64(rsaEncrypt(12345)).length).toBe(256);
  expect(forge.util.decode64(rsaEncrypt('t'.repeat(300))).length).toBe(512);
});
