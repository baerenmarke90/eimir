import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isCapacitorNative } from '../pwa';
import {
  readSensitiveEntryToken,
  stripSensitiveEntryToken,
  type SensitiveEntryToken,
} from './entryToken';

type LaunchQueueWindow = Window & {
  launchQueue?: {
    setConsumer: (consumer: (params: { targetURL?: string }) => void) => void;
  };
};

/** External delivery is trusted only for the current deployment's HTTP origin. */
export function readIdentityEntryUrl(
  rawUrl: string,
  expectedOrigin: string,
): SensitiveEntryToken | null {
  try {
    const url = new URL(rawUrl);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.origin !== new URL(expectedOrigin).origin ||
      url.username ||
      url.password
    )
      return null;
    return readSensitiveEntryToken(url.pathname, url.search, url.hash);
  } catch {
    return null;
  }
}

/** One memory-only intake for browser routes, PWA launches and native delivery. */
export function useIdentityEntry(apiBaseUrl: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const [entryToken, setEntryToken] = useState(() =>
    readSensitiveEntryToken(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    ),
  );
  const lastDelivery = useRef(entryToken);

  const receive = useCallback((entry: SensitiveEntryToken) => {
    const previous = lastDelivery.current;
    if (previous?.kind === entry.kind && previous.token === entry.token)
      return false;
    lastDelivery.current = entry;
    setEntryToken(entry);
    return true;
  }, []);

  useEffect(() => {
    const entry = readSensitiveEntryToken(
      location.pathname,
      location.search,
      location.hash,
    );
    if (!entry) return;
    receive(entry);
    // Keep the router synchronized with the scrubbed browser history. The
    // captured proof remains only in memory until IdentityEntry completes it.
    navigate(stripSensitiveEntryToken(location.search), { replace: true });
  }, [location.pathname, location.search, location.hash, navigate, receive]);

  useEffect(() => {
    let cancelled = false;
    const native = isCapacitorNative();
    const origin = native ? apiBaseUrl : window.location.origin;
    const receiveUrl = (url: string) => {
      if (cancelled) return false;
      const entry = readIdentityEntryUrl(url, origin);
      if (!entry) return false;
      if (receive(entry)) navigateRef.current('/', { replace: true });
      return true;
    };

    if (native) {
      let warmEntryReceived = false;
      const subscription = App.addListener('appUrlOpen', ({ url }) => {
        warmEntryReceived = receiveUrl(url) || warmEntryReceived;
      }).catch(() => null);
      void App.getLaunchUrl()
        .then((launch) => {
          if (!warmEntryReceived && launch?.url) receiveUrl(launch.url);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
        void subscription
          .then((listener) => listener?.remove())
          .catch(() => undefined);
      };
    }

    const queue = (window as LaunchQueueWindow).launchQueue;
    queue?.setConsumer(({ targetURL }) => {
      if (targetURL) receiveUrl(targetURL);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, receive]);

  const clearEntryToken = useCallback(() => setEntryToken(null), []);
  return { entryToken, clearEntryToken };
}
