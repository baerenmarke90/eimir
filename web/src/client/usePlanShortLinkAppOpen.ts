import { App } from '@capacitor/app';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCapacitorNative } from '../pwa';
import { readPlanShortLinkUrl } from './planShortLink';
import { planDetailPath } from './routes';

/**
 * Android app: a plan link from a calendar event (`https://<instance>/p/<id>`)
 * opens the plan in the app instead of the browser. Mounted once at the app
 * root so a cold start from the calendar works too.
 */
export function usePlanShortLinkAppOpen(apiBaseUrl: string) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isCapacitorNative()) return;
    let cancelled = false;
    const receive = (url: string) => {
      const planId = cancelled ? null : readPlanShortLinkUrl(url, apiBaseUrl);
      if (!planId) return false;
      navigateRef.current(planDetailPath(planId));
      return true;
    };
    let warmReceived = false;
    const subscription = App.addListener('appUrlOpen', ({ url }) => {
      warmReceived = receive(url) || warmReceived;
    }).catch(() => null);
    void subscription
      .then((listener) => (listener ? App.getLaunchUrl() : undefined))
      .then((launch) => {
        if (!warmReceived && launch?.url) receive(launch.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void subscription
        .then((listener) => listener?.remove())
        .catch(() => undefined);
    };
  }, [apiBaseUrl]);
}
