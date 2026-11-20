import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useState,
} from 'react';
import { isAndroidApp } from '../client/config';
import { holdSecureScreen } from '../client/secureScreen';
import { useTranslation } from '../i18n';

type Status = 'none' | 'ready' | 'failed';

/** Style for private content that must not be painted yet. */
export const UNPAINTED: CSSProperties = { visibility: 'hidden' };

export interface SecureScreenGate {
  /** False only in the app while protection is not (or not yet) confirmed. */
  readonly shown: boolean;
  /** True in the app when protection could not be confirmed. */
  readonly failed: boolean;
}

/**
 * Holds screenshot, screen-recording and Recents-preview protection in the
 * Android app while `active` (#683, once messages).
 *
 * `shown` turns false in the same render that turns protection on and true
 * only once the window confirms FLAG_SECURE, so private content styled with
 * {@link UNPAINTED} meanwhile never reaches a frame; if protection cannot be
 * confirmed it stays false (fail closed). Browsers offer no protection, so
 * there `shown` is always true and nothing is held.
 */
export function useSecureScreen(active = true): SecureScreenGate {
  const [native] = useState(isAndroidApp);
  const protect = native && active;
  // `none` until the current hold answers; reset whenever protection ends, so
  // turning it on again hides private content in that same render.
  const [status, setStatus] = useState<Status>('none');

  useLayoutEffect(() => {
    if (!protect) return;
    const hold = holdSecureScreen(true);
    let mounted = true;
    hold.ready.then(
      () => {
        if (mounted) setStatus('ready');
      },
      () => {
        if (mounted) setStatus('failed');
      },
    );
    return () => {
      mounted = false;
      setStatus('none');
      hold.release();
    };
  }, [protect]);

  return {
    shown: !protect || status === 'ready',
    failed: protect && status === 'failed',
  };
}

const failureNotice: CSSProperties = { visibility: 'visible' };

/**
 * The short notice for a private surface whose protection failed. It stays
 * visible inside the unpainted surface it explains.
 */
export function SecureScreenFailure({ gate }: { gate: SecureScreenGate }) {
  const { t } = useTranslation();
  return gate.failed ? (
    <p className="secure-surface-failure" role="alert" style={failureNotice}>
      {t('privateArea.secureScreenUnavailable')}
    </p>
  ) : null;
}

const painted: CSSProperties = { display: 'contents' };
const unpainted: CSSProperties = { display: 'contents', ...UNPAINTED };

/**
 * Wraps a whole private surface (a route or page section) with
 * {@link useSecureScreen}. In the app the wrapper always exists, whether
 * `active` or not, so toggling never remounts the children; it uses
 * `display: contents` and never changes layout. In a browser the children
 * render unchanged without a wrapper.
 */
export function SecureSurface({
  active = true,
  announceFailure = false,
  children,
}: {
  active?: boolean;
  /** Shows a notice when protection fails; leave off where it would repeat. */
  announceFailure?: boolean;
  children: ReactNode;
}) {
  const [native] = useState(isAndroidApp);
  const gate = useSecureScreen(active);
  if (!native) return <>{children}</>;
  return (
    <>
      <div
        style={gate.shown ? painted : unpainted}
        aria-hidden={gate.shown ? undefined : true}
      >
        {children}
      </div>
      {announceFailure ? <SecureScreenFailure gate={gate} /> : null}
    </>
  );
}
