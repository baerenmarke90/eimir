import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCapacitorNative } from '../pwa';
import { settingsCategoryPath } from './routes';

const OUTCOMES = new Set(['connected', 'denied', 'failed', 'expired']);

/**
 * The server's Google Calendar callback hands the app only a fixed outcome
 * (`de.eimir.app://calendar/google?calendarGoogle=<outcome>`, #1895). Anything
 * else, including extra parameters, is ignored.
 */
export function readCalendarGoogleAppReturn(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'de.eimir.app:' ||
    url.host !== 'calendar' ||
    url.pathname !== '/google' ||
    [...url.searchParams.keys()].some((key) => key !== 'calendarGoogle')
  )
    return null;
  const outcome = url.searchParams.get('calendarGoogle');
  return outcome && OUTCOMES.has(outcome) ? outcome : null;
}

/**
 * Android app: when Google's consent returns, close the system browser and
 * open the calendar settings, which show the confirmation for the account.
 * Mounted once at the app root so a cold start after consent works too.
 */
export function useCalendarGoogleAppReturn() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isCapacitorNative()) return;
    let cancelled = false;
    const receive = (url: string) => {
      const outcome = cancelled ? null : readCalendarGoogleAppReturn(url);
      if (!outcome) return false;
      void Browser.close().catch(() => {});
      navigateRef.current(
        `${settingsCategoryPath('calendar')}?calendarGoogle=${outcome}`,
      );
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
  }, []);
}
