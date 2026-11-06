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
  const utf8 = forge.util.encodeUtf8(String(value));
  const encrypted = getPublicKey().encrypt(utf8, 'RSAES-PKCS1-V1_5');
  return forge.util.encode64(encrypted);
}
