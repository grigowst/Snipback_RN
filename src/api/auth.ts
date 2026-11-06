import { rsaEncrypt } from '../utils/rsa';
import { getDeviceId, getDeviceTimeZone } from '../utils/device';
import { apiRequest, ApiError } from './client';
import { ENDPOINTS } from './endpoints';
import type { User, UserResponse } from './types';

/**
 * Signs in with email and password (APIManager.login in iOS).
 * The password is RSA-encrypted; the server never sees it in clear.
 */
export async function login(email: string, password: string): Promise<User> {
  const response = await apiRequest<UserResponse>(ENDPOINTS.LOGIN, {
    method: 'POST',
    body: {
      email,
      enc_password: rsaEncrypt(password),
      deviceID: getDeviceId(),
      timeZone: getDeviceTimeZone(),
    },
  });

  const user = response.data?.user;
  if (!user?.token) {
    throw new ApiError(response.message || 'Unable to sign in. Please try again.');
  }
  return user;
}

// TODO(phase 1+): forgot password / resend credentials (APIManager.forgotPassword),
// register, Apple and Google sign-in, magic-link login (verifyMagicLoginToken),
// and joining a team with a share code after sign-in.
