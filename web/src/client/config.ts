import { Capacitor } from '@capacitor/core';
import { identityBuildVariable } from './identityEnvironment';

export interface ReferenceClientConfig {
  apiBaseUrl: string;
}

export function isCapacitorNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(
  configuredUrl: string,
  origin: string,
  isNative: boolean = isCapacitorNativePlatform(),
): string {
  const trimmed = configuredUrl.trim().replace(/\/+$/, '');
  if (trimmed) {
    return trimmed;
  }
  if (isNative) {
    throw new Error(
      'Capacitor native container requires an explicit API base URL. ' +
        'Falling back to window.location.origin is prohibited in native environments.',
    );
  }
  return origin.replace(/\/+$/, '');
}

export function loadReferenceClientConfig(): ReferenceClientConfig {
  const configured = identityBuildVariable('API_BASE_URL');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBaseUrl = resolveApiBaseUrl(configured, origin);
  return { apiBaseUrl };
}
