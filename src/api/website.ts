import { WEBSITE_BASE_URL } from '../config/environment';
import { getDeviceType } from '../utils/device';
import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

// The website's one-time sign-in link (APIManager.createWebsiteAccessToken +
// WebViewController in iOS). The app asks the API for a token; the website
// page `authentication/<token>` signs the browser in as this user and goes on
// to the requested section. Each token is single-use: ask for a new one on
// every open, and never cache or log it (it signs someone in).

/** Which part of the website opens: the team pages or the user pages. */
export type WebsiteTab = 'team' | 'user';

/** The website's default landing page after sign-in (REDIRECT_URL_ENDPOINT). */
const DEFAULT_REDIRECT = 'listUserTeam';

export type WebsiteLinkInput = {
  userId: number;
  orgId: number;
  /** The signed-in session token. */
  token: string;
  tab: WebsiteTab;
  /** Seconds since 1970; injected by tests. */
  nowSeconds?: number;
};

export function websiteTokenRequestBody({ userId, orgId, token, tab, nowSeconds }: WebsiteLinkInput) {
  return {
    enc_user_id: rsaEncrypt(userId),
    enc_orgId: rsaEncrypt(orgId),
    enc_access_token: rsaEncrypt(token),
    user_login: 1,
    redirect_url: DEFAULT_REDIRECT,
    selected_tab: tab,
    // iOS: Date().millisecondsSince1970 / 1000, an integer division.
    timestamp: nowSeconds ?? Math.floor(Date.now() / 1000),
    deviceType: getDeviceType(),
  };
}

/** A fresh signed-in website URL for the given tab. */
export async function createWebsiteLink(input: WebsiteLinkInput): Promise<string> {
  const response = await apiRequest<{ token?: unknown }>(ENDPOINTS.CREATE_WEBSITE_ACCESS_TOKEN, {
    method: 'POST',
    body: websiteTokenRequestBody(input),
  });
  const webToken = typeof response.data?.token === 'string' ? response.data.token : '';
  if (!webToken) {
    throw new ApiError('Unable to open the website. Please try again.');
  }
  return `${WEBSITE_BASE_URL}authentication/${webToken}`;
}
