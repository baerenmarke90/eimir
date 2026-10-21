import { App } from '@capacitor/app';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isCapacitorNative } from '../pwa';
import {
  readSensitiveEntryToken,
  type SensitiveEntryToken,
  stripSensitiveEntryToken,
} from './entryToken';
import { postSnackbar } from './snackbar';
import {
  isDocumentLeaveBlocked,
  useDocumentLeaveBlocked,
} from './useDocumentLeaveGuard';

type LaunchQueueWindow = Window & {
  launchQueue?: {
    setConsumer: (consumer: (params: { targetURL?: string }) => void) => void;
  };
};

/** External delivery is trusted only for the current deployment's HTTP origin. */
export function readIdentityEntryUrl(
  rawUrl: string,
  expectedOrigin: string,
  requireHttps = false,
): SensitiveEntryToken | null {
  if (rawUrl.length > 8192) return null;
  for (const character of rawUrl) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code <= 32 || code === 127) return null;
  }
  try {
    const url = new URL(rawUrl);
    const expected = new URL(expectedOrigin);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      (requireHttps && expected.protocol !== 'https:') ||
      url.origin !== expected.origin ||
      expected.username ||
      expected.password ||
      url.username ||
      url.password ||
      url.searchParams.size !== 1 ||
      url.searchParams.getAll('token').length !== 1
    )
      return null;
    const entry = readSensitiveEntryToken(url.pathname, url.search, url.hash);
    if (!entry || entry.token.length > 4096) return null;
    if (url.hash) {
      const fragment = new URLSearchParams(url.hash.slice(1));
      if (
        entry.kind !== 'signup' ||
        fragment.size !== 1 ||
        fragment.getAll('invitationToken').length !== 1 ||
        !entry.invitationToken ||
        entry.invitationToken.length > 4096
      )
        return null;
    }
    return entry;
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
  const blocked = useDocumentLeaveBlocked();
  const [pending, setPending] = useState<SensitiveEntryToken | null>(null);

  const receive = useCallback((entry: SensitiveEntryToken) => {
    const previous = lastDelivery.current;
    if (previous?.kind === entry.kind && previous.token === entry.token)
      return false;
    lastDelivery.current = entry;
    if (isDocumentLeaveBlocked()) {
      setPending(entry);
      postSnackbar('snackbar.identityLinkWaiting');
      return false;
    }
    setPending(null);
    setEntryToken(entry);
    return true;
  }, []);

  useEffect(() => {
    if (blocked || !pending || pending !== lastDelivery.current) return;
    setPending(null);
    setEntryToken(pending);
    navigateRef.current('/', { replace: true });
  }, [blocked, pending]);

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
      const entry = readIdentityEntryUrl(url, origin, native);
      if (!entry) return false;
      if (receive(entry)) navigateRef.current('/', { replace: true });
      return true;
    };

    if (native) {
      let warmEntryReceived = false;
      const subscription = App.addListener('appUrlOpen', ({ url }) => {
        warmEntryReceived = receiveUrl(url) || warmEntryReceived;
      }).catch(() => null);
      void subscription
        .then((listener) => (listener ? App.getLaunchUrl() : undefined))
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

  const clearEntryToken = useCallback(() => {
    setEntryToken(null);
    setPending(null);
  }, []);
  return { entryToken, clearEntryToken };
}
