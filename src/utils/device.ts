import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Device details the Snipback API expects on every request.
// Mirrors getDeviceID / getDeviceName / getDeviceType / getDeviceInfo /
// getDeviceTimeZone in the iOS app's CommonFunctions.swift.

/**
 * Stable per-install id. On iOS this is the vendor id kept in the Keychain
 * (as the iOS app does); on Android it is ANDROID_ID.
 */
export function getDeviceId(): string {
  return DeviceInfo.getUniqueIdSync();
}

export function getDeviceName(): string {
  return DeviceInfo.getDeviceNameSync();
}

/** "iOS" or "Android". */
export function getDeviceType(): string {
  return Platform.OS === 'ios' ? 'iOS' : 'Android';
}

/** Model and OS version, e.g. "iPad Pro iOS 27.0". */
export function getDeviceInfo(): string {
  return `${DeviceInfo.getModel()} ${getDeviceType()} ${DeviceInfo.getSystemVersion()}`;
}

/** IANA time zone, e.g. "Asia/Kolkata". */
export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getAppVersion(): string {
  return DeviceInfo.getVersion();
}

export function getBuildNumber(): string {
  return DeviceInfo.getBuildNumber();
}

export function isTablet(): boolean {
  return DeviceInfo.isTablet();
}
