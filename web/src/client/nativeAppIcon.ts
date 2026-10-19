import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppIconId } from '../api/generated/models/AppIconId';
import { isCapacitorNativePlatform } from './config';

interface AppIconPlugin {
  apply(options: { iconId: AppIconId }): Promise<{ iconId: AppIconId }>;
}

const launcher = registerPlugin<AppIconPlugin>('AppIcon');

export function isAndroidApp(): boolean {
  return isCapacitorNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function canApplyNativeAppIcon(): boolean {
  return isAndroidApp() && Capacitor.isPluginAvailable('AppIcon');
}

export async function applyNativeAppIcon(iconId: AppIconId): Promise<void> {
  const result = await launcher.apply({ iconId });
  if (result.iconId !== iconId)
    throw new Error('Launcher icon was not applied');
}
