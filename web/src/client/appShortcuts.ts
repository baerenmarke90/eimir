import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from '@capacitor/core';

export type AppShortcutAction = 'moment' | 'wish' | 'plan';
export interface AppShortcutRequest {
  id: string;
  action: AppShortcutAction;
}

export const appShortcuts = registerPlugin<{
  peek(): Promise<{ request?: AppShortcutRequest }>;
  acknowledge(options: { id: string }): Promise<void>;
  addListener(
    event: 'shortcutOpen',
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}>('AppShortcuts');

export function hasAppShortcuts(): boolean {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppShortcuts')
  );
}

export function readAppShortcut(value: unknown): AppShortcutRequest | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<AppShortcutRequest>;
  if (
    typeof request.id !== 'string' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(request.id) ||
    !['moment', 'wish', 'plan'].includes(request.action ?? '')
  )
    return null;
  return { id: request.id, action: request.action as AppShortcutAction };
}
