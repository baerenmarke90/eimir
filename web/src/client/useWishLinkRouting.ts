import { App } from '@capacitor/app';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchPath, useNavigate } from 'react-router-dom';
import { isCapacitorNativePlatform } from './config';
import { WISH_DETAIL_ROUTE_PATTERN, wishDetailPath } from './routes';
import { useDocumentLeaveBlocked } from './useDocumentLeaveGuard';

const MAX_URL_LENGTH = 2048;

/**
 * A shared Wish link is the instance address plus the canonical Wish path and
 * nothing else. Anything with a query, fragment, credentials, another origin
 * or another path is not ours to route and is ignored.
 */
export function readWishLinkUrl(
  rawUrl: string,
  instanceOrigin: string,
): string | null {
  if (rawUrl.length > MAX_URL_LENGTH) return null;
  for (const character of rawUrl) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code <= 32 || code === 127) return null;
  }
  try {
    const url = new URL(rawUrl);
    const expected = new URL(instanceOrigin);
    if (
      url.protocol !== 'https:' ||
      expected.protocol !== 'https:' ||
      url.origin !== expected.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = matchPath(
      { path: WISH_DETAIL_ROUTE_PATTERN, end: true },
      url.pathname,
    );
    const wishId = match?.params.wishId;
    // The create route also matches the pattern; only a canonical id passes.
    if (!wishId || wishId === 'new' || url.pathname !== wishDetailPath(wishId))
      return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * Opens a tapped Wish link inside the native app. The router keeps the
 * address through sign-in, and the server alone decides whether the signed-in
 * person may see the Wish. A link that arrives while an editor holds
 * unsaved work waits instead of discarding it.
 */
export function useWishLinkRouting(apiBaseUrl: string): void {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const blocked = useDocumentLeaveBlocked();
  const [waiting, setWaiting] = useState<string | null>(null);
  const lastDelivery = useRef<string | null>(null);

  const receive = useCallback((path: string) => {
    lastDelivery.current = path;
    setWaiting(path);
  }, []);

  useEffect(() => {
    if (blocked || !waiting || waiting !== lastDelivery.current) return;
    setWaiting(null);
    navigateRef.current(waiting);
  }, [blocked, waiting]);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    let cancelled = false;
    const receiveUrl = (url: string) => {
      if (cancelled) return false;
      const path = readWishLinkUrl(url, apiBaseUrl);
      if (!path) return false;
      receive(path);
      return true;
    };
    let warmReceived = false;
    const subscription = App.addListener('appUrlOpen', ({ url }) => {
      warmReceived = receiveUrl(url) || warmReceived;
    }).catch(() => null);
    void subscription
      .then((listener) => (listener ? App.getLaunchUrl() : undefined))
      .then((launch) => {
        if (!warmReceived && launch?.url) receiveUrl(launch.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void subscription
        .then((listener) => listener?.remove())
        .catch(() => undefined);
    };
  }, [apiBaseUrl, receive]);
}
