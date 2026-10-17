import { App } from '@capacitor/app';
import { useEffect, useRef, useState } from 'react';
import { isCapacitorNative } from '../pwa';
import {
  readSensitiveEntryToken,
  type SensitiveEntryToken,
} from './entryToken';

/** Receive only the configured server's existing HTTPS email-proof paths. */
export function parseNativeEntryLink(
  raw: string,
  apiBaseUrl: string,
): SensitiveEntryToken | null {
  if (raw.length > 8192) return null;
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code <= 32 || code === 127) return null;
  }
  try {
    const origin = new URL(apiBaseUrl);
    const url = new URL(raw);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      url.protocol !== 'https:' ||
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.size !== 1 ||
      url.searchParams.getAll('token').length !== 1
    )
      return null;
    const token = readSensitiveEntryToken(url.pathname, url.search);
    return token && token.token.length <= 4096 ? token : null;
  } catch {
    return null;
  }
}

/** Transport only; the existing React entry consumer owns proof redemption. */
export function useNativeEntryLinks(
  apiBaseUrl: string,
  hasSession: boolean,
  isRestoring: boolean,
  onEntry: (token: SensitiveEntryToken) => void,
): void {
  const [pending, setPending] = useState<SensitiveEntryToken | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!isCapacitorNative()) return;
    let active = true;
    let receivedLive = false;
    function receive(raw: string) {
      if (!active) return;
      const token = parseNativeEntryLink(raw, apiBaseUrl);
      if (!token) return;
      const identity = `${token.kind}:${token.token}`;
      if (last.current === identity) return;
      last.current = identity;
      setPending(token);
    }
    // Subscribe before reading the initial URL; a stale launch cannot win later.
    const listener = App.addListener('appUrlOpen', (event) => {
      receivedLive = true;
      receive(event.url);
    });
    void listener
      .then(() => App.getLaunchUrl())
      .then((launch) => {
        if (!receivedLive && launch?.url) receive(launch.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!pending || isRestoring) return;
    setPending(null);
    // A mailed sign-in proof never replaces an active account or its drafts.
    if (!hasSession) onEntry(pending);
  }, [pending, hasSession, isRestoring, onEntry]);
}
