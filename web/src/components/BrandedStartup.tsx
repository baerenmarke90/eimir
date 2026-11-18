import { isAndroidApp } from '../client/config';
import { useLaunchScreenHold } from '../client/launchScreen';
import { Brand } from './Brand';
import './BrandedStartup.css';

/**
 * Public branding only; restoration never exposes cached relationship content.
 * In the Android app this view continues the system launch screen: the same
 * tile at the same centred position, with the wordmark and status fading in
 * below it instead of a second, differently sized logo.
 */
export function BrandedStartup({ label }: { label: string }) {
  useLaunchScreenHold();
  if (isAndroidApp()) {
    return (
      <main className="branded-startup branded-startup-native" aria-busy="true">
        <img
          className="branded-startup-mark"
          src="/identity/launch-tile.png"
          alt=""
          width="128"
          height="128"
          decoding="sync"
        />
        <div className="branded-startup-copy">
          <span className="brand-name">
            <strong>
              eimir<span className="brand-dot">.</span>
            </strong>
          </span>
          <p role="status">{label}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="branded-startup" aria-busy="true">
      <Brand />
      <p role="status">{label}</p>
    </main>
  );
}
