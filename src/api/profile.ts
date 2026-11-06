import { rsaEncrypt } from '../utils/rsa';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import type { User, UserResponse } from './types';

/**
 * The signed-in user's profile (APIManager.getMyProfile in iOS).
 * Note the body key is `enc_userId`, unlike most calls' `enc_user_id`.
 */
export async function fetchProfile(userId: number): Promise<User | null> {
  const response = await apiRequest<UserResponse>(ENDPOINTS.GET_PROFILE, {
    method: 'POST',
    body: { enc_userId: rsaEncrypt(userId) },
  });
  return response.data?.user ?? null;
}
