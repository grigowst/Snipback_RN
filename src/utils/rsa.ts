import forge from 'node-forge';
import { PUBLIC_PASS_KEY_2048 } from '../config/publicKey';

let publicKey: forge.pki.rsa.PublicKey | null = null;

function getPublicKey(): forge.pki.rsa.PublicKey {
  if (!publicKey) {
    publicKey = forge.pki.publicKeyFromPem(PUBLIC_PASS_KEY_2048) as forge.pki.rsa.PublicKey;
  }
  return publicKey;
}

/**
 * RSA-encrypts a value with PKCS#1 v1.5 padding and returns it as base64,
 * matching `String.rsaEncrypted()` in the iOS app.
 *
 * The padding uses random bytes, so `react-native-get-random-values` must be
 * imported before anything else (see index.js).
 */
export function rsaEncrypt(value: string | number): string {
  return rsaEncryptWithKey(String(value), getPublicKey());
}

/**
 * The encryption itself, with the key passed in so tests can use their own.
 *
 * PKCS#1 v1.5 fits at most (key bytes − 11) bytes in one block: 245 for a
 * 2048-bit key. Longer values (the session token can be) are split the way
 * SwiftyRSA's ClearMessage.encrypted does: each 245-byte chunk becomes one
 * 256-byte block, the blocks are joined, and the result is base64-encoded
 * once. A value that fits in one block is encrypted exactly as before.
 */
export function rsaEncryptWithKey(value: string, key: forge.pki.rsa.PublicKey): string {
  const bytes = forge.util.encodeUtf8(value);
  const blockSize = Math.ceil(key.n.bitLength() / 8);
  const maxChunk = blockSize - 11;
  if (bytes.length <= maxChunk) {
    return forge.util.encode64(key.encrypt(bytes, 'RSAES-PKCS1-V1_5'));
  }
  let encrypted = '';
  for (let i = 0; i < bytes.length; i += maxChunk) {
    encrypted += key.encrypt(bytes.slice(i, i + maxChunk), 'RSAES-PKCS1-V1_5');
  }
  return forge.util.encode64(encrypted);
}
