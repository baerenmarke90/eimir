import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isAndroidApp } from '../client/config';
import { enterLandscape, leaveLandscape } from '../client/landscapeView';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './GardenFullscreen.css';

/*
 * The garden in full screen (#2048). An in-app overlay (the shared
 * full-screen sheet, as for the memory map) so it also works in the Android
 * WebView: the scene fills the screen height and the device turns to
 * landscape where that is possible. Swiping sideways only exists when the
 * garden is wider than the screen; its hint shows at most once per device and
 * leaves after the first swipe or a few seconds, so it never covers the
 * garden for long.
 */

const PAN_HINT_KEY = 'eimir-garden-fullscreen-pan-hint-v1';
const PAN_HINT_MS = 4000;

function panHintSeen(): boolean {
  try {
    return localStorage.getItem(PAN_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

function rememberPanHint(): void {
  try {
    localStorage.setItem(PAN_HINT_KEY, '1');
  } catch {
    // Without storage the hint may show once more; nothing else depends on it.
  }
}

export function useGardenFullscreen() {
  const [open, setOpen] = useState(false);
  const [rotateHint, setRotateHint] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const native = isAndroidApp();

  const openFullscreen = useCallback(() => {
    setOpen(true);
    setRotateHint(false);
    void enterLandscape(document.documentElement, native).then((result) =>
      setRotateHint(result === 'unsupported'),
    );
  }, [native]);

  const closeFullscreen = useCallback(() => {
    setOpen(false);
    setRotateHint(false);
    void leaveLandscape(native);
  }, [native]);

  // Leaving the page while the garden is in full screen gives the
  // orientation back as well.
  useEffect(
    () => () => {
      void leaveLandscape(native);
    },
    [native],
  );

  return { open, rotateHint, trigger, openFullscreen, closeFullscreen };
}

export function GardenFullscreenButton({
  trigger,
  onOpen,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      ref={trigger}
      type="button"
      className="garden-fullscreen-open"
      aria-label={t('games.garden.fullscreen.open')}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <EimirIcon name="expand" />
    </button>
  );
}

export function GardenFullscreenSheet({
  open,
  title,
  rotateHint,
  trigger,
  onClose,
  frameAttributes,
  children,
}: {
  open: boolean;
  title: string;
  rotateHint: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  frameAttributes: {
    season: string;
    sleep: string;
    daytime: string;
  };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const frame = useRef<HTMLDivElement | null>(null);
  const [panHint, setPanHint] = useState(false);

  // The hint appears only when the garden is wider than the screen (the
  // orientation may still be turning when the sheet opens, so the width is
  // watched), at most once per device.
  useEffect(() => {
    const element = frame.current;
    if (!open || !element || panHintSeen()) return;
    let timer: number | undefined;
    const check = () => {
      if (timer !== undefined || panHintSeen()) return;
      if (element.scrollWidth <= element.clientWidth + 1) return;
      rememberPanHint();
      setPanHint(true);
      timer = window.setTimeout(() => setPanHint(false), PAN_HINT_MS);
    };
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    observer?.observe(element);
    check();
    return () => {
      observer?.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      setPanHint(false);
    };
  }, [open]);

  return (
    <ShortTaskSheet
      open={open}
      title={title}
      closeLabel={t('games.garden.fullscreen.close')}
      onClose={onClose}
      restoreFocusRef={trigger}
      className="garden-fullscreen"
    >
      <div className="garden-game-page garden-fullscreen-stage">
        {open ? (
          <div
            ref={frame}
            className="garden-frame garden-fullscreen-frame"
            data-season={frameAttributes.season}
            data-sleep={frameAttributes.sleep}
            data-daytime={frameAttributes.daytime}
            data-testid="garden-fullscreen-frame"
            onScroll={() => setPanHint(false)}
          >
            {children}
          </div>
        ) : null}
        {panHint ? (
          <p className="garden-fullscreen-pan" role="status">
            {t('games.garden.panHint')}
          </p>
        ) : null}
        {rotateHint ? (
          <p className="garden-fullscreen-rotate">
            {t('games.garden.fullscreen.rotate')}
          </p>
        ) : null}
      </div>
    </ShortTaskSheet>
  );
}
