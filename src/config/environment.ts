// Snipback API environments, copied from the iOS app's APIManager.ENVIRONMENT.getAPIBaseURL().
// Change ACTIVE_ENVIRONMENT to switch every API call to another backend.

export type EnvironmentName = 'DEV' | 'QA' | 'UAT' | 'LIVE';

const API_BASE_URLS: Record<EnvironmentName, string> = {
  DEV: 'https://projectdelta.snipback.com:60443',
  QA: 'https://web01-stg-ch.snipback.com',
  UAT: 'https://aicloud.snipback.com:8443',
  LIVE: 'https://aicloud.snipback.com',
};

export const ACTIVE_ENVIRONMENT: EnvironmentName = 'LIVE';

export const API_BASE_URL = API_BASE_URLS[ACTIVE_ENVIRONMENT];

/**
 * The Snipback website, for the signed-in pages the app opens (REDIRECT_BASEURL
 * in the iOS WebViewController): the QA site for QA, snipback.com otherwise.
 */
const WEBSITE_BASE_URLS: Record<EnvironmentName, string> = {
  DEV: 'https://snipback.com/',
  QA: 'https://web02-stg-ch.snipback.com/',
  UAT: 'https://snipback.com/',
  LIVE: 'https://snipback.com/',
};

export const WEBSITE_BASE_URL = WEBSITE_BASE_URLS[ACTIVE_ENVIRONMENT];

// Sent in the deviceInfo header, as the iOS app does (Bundle.apiVersionNumber()).
export const API_VERSION = '22';

export type AppVersion = { version: string; build: string };

/**
 * Version and build sent in the deviceInfo header, per platform. The server
 * answers HTTP 308 ("Some important updates are pending") to a version it
 * considers too old, so these match the current store apps. Raise them when
 * the backend raises its minimum. null = report the RN app's own version.
 */
export const REPORTED_APP_VERSION: Record<'ios' | 'android', AppVersion | null> = {
  ios: { version: '15.4.7', build: '851' },
  android: { version: '1.1.2', build: '206' },
};

/**
 * A game's watch page, when the game has no link of its own (gameStreamingURL
 * in the iOS Constants: one fixed address, whatever the environment).
 */
export const GAME_STREAMING_URL = 'https://aicloud.snipback.com/streaming';
