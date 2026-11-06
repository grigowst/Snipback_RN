import { Platform } from 'react-native';
import { API_BASE_URL, API_VERSION, REPORTED_APP_VERSION } from '../config/environment';
import {
  getAppVersion,
  getBuildNumber,
  getDeviceId,
  getDeviceInfo,
  getDeviceName,
  getDeviceTimeZone,
  getDeviceType,
} from '../utils/device';
import type { ApiEnvelope } from './types';

// The app's REST client. Every call goes through apiRequest(), the way every
// iOS call goes through APIManager.callAsynchronousWebService().

const DEFAULT_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// ---- Session token -------------------------------------------------------

let authToken: string | null = null;

/** Set by the auth layer after sign-in or restore; null after sign-out. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

// ---- App-wide responses --------------------------------------------------

type ApiEventHandlers = {
  /** HTTP 401: the session is no longer valid. */
  onUnauthorized?: () => void;
  /** HTTP 308: the server wants a newer app version. */
  onForceUpdate?: () => void;
};

let eventHandlers: ApiEventHandlers = {};

export function setApiEventHandlers(handlers: ApiEventHandlers): void {
  eventHandlers = handlers;
}

// ---- Headers -------------------------------------------------------------

/**
 * Android's HTTP stack rejects non-ASCII header values (a device named
 * "Grigo’s iPhone" would fail every request), so replace them.
 */
function headerSafe(value: string): string {
  if (Platform.OS !== 'android') {
    return value;
  }
  return value.replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '?');
}

/** Same headers as setBasicHTTPHeaders() in the iOS APIManager. */
function buildHeaders(): Record<string, string> {
  const timeZone = getDeviceTimeZone();
  const deviceInfo = getDeviceInfo();
  const reported = REPORTED_APP_VERSION[Platform.OS === 'ios' ? 'ios' : 'android'];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    device_id: getDeviceId(),
    timestamp: String(Date.now()),
    device_name: getDeviceName(),
    device_info: `${getDeviceType()} ${deviceInfo} ${timeZone}`,
    Timezone: timeZone,
    deviceInfo: [
      deviceInfo,
      reported?.version ?? getAppVersion(),
      reported?.build ?? getBuildNumber(),
      API_VERSION,
    ].join('|'),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
    headers.token = authToken;
  }
  for (const key of Object.keys(headers)) {
    headers[key] = headerSafe(headers[key]);
  }
  return headers;
}

// ---- Request -------------------------------------------------------------

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
};

function buildUrl(endpoint: string, query?: RequestOptions['query']): string {
  let url = `${API_BASE_URL}${endpoint}`;
  if (query && Object.keys(query).length > 0) {
    const params = Object.entries(query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    url += `?${params}`;
  }
  return url;
}

/**
 * Calls the Snipback API and returns the parsed `{ status, message, data }`
 * envelope. Throws ApiError when the request fails, the server answers with
 * a non-200 status, or the envelope's `status` is false.
 */
export async function apiRequest<T>(
  endpoint: string,
  { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(endpoint, query), {
      method,
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      // @types/node (pulled in by @types/node-forge) declares its own AbortSignal type.
      signal: controller.signal as RequestInit['signal'],
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The server took too long to respond. Please try again.'
        : 'Unable to reach Snipback. Check your internet connection.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    eventHandlers.onUnauthorized?.();
  } else if (response.status === 308) {
    eventHandlers.onForceUpdate?.();
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await response.json()) as ApiEnvelope<T>;
  } catch {
    json = null;
  }

  if (response.status !== 200 || !json || !json.status) {
    const message =
      json?.message || `Something went wrong (HTTP ${response.status}). Please try again.`;
    throw new ApiError(message, response.status);
  }
  return json;
}
