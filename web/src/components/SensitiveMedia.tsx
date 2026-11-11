import { focusManager } from '@tanstack/react-query';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './SensitiveMedia.css';
import './MediaOverlay.css';

/** Deliberately volatile: never serialize reveal state with media or navigation. */
export function useSensitiveMediaReveals(identity: string, enabled = true) {
  const [state, setState] = useState<{ identity: string; ids: Set<string> }>(
    () => ({ identity, ids: new Set() }),
  );
  useLayoutEffect(() => {
    setState({ identity, ids: new Set() });
    if (!enabled) return;
    const conceal = () =>
      flushSync(() => setState({ identity, ids: new Set() }));
    const visibility = () => {
      if (document.visibilityState === 'hidden') conceal();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', conceal);
    const unsubscribeFocus = focusManager.subscribe((focused) => {
      if (!focused) conceal();
    });
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', conceal);
      unsubscribeFocus();
    };
  }, [identity, enabled]);
  return {
    isRevealed: (id: string) =>
      enabled && state.identity === identity && state.ids.has(id),
    toggle: (id: string) =>
      setState((current) => {
        const ids = new Set(current.identity === identity ? current.ids : []);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { identity, ids };
      }),
  };
}

export function SensitiveMediaCover({
  children,
  className = '',
  showLabel = true,
}: {
  children?: ReactNode;
  className?: string;
  showLabel?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className={`sensitive-media-cover ${className}`}>
      {children ? (
        <span className="sensitive-media-blurred" aria-hidden="true">
          {children}
        </span>
      ) : null}
      {showLabel ? (
        <span className="sr-only">{t('sensitiveMedia.label')}</span>
      ) : null}
    </span>
  );
}

export function SensitiveMediaControl({
  revealed,
  onToggle,
  className = '',
  overlay = false,
  iconOnly = false,
  video = false,
}: {
  revealed: boolean;
  onToggle: () => void;
  className?: string;
  overlay?: boolean;
  iconOnly?: boolean;
  video?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`sensitive-media-control ${overlay ? 'media-overlay' : 'secondary'}${iconOnly ? ' sensitive-media-control-icon' : ''}${revealed ? ' is-revealed' : ''} ${className}`}
      aria-pressed={revealed}
      aria-label={t(
        video
          ? revealed
            ? 'video.hide'
            : 'video.show'
          : revealed
            ? 'sensitiveMedia.hide'
            : 'sensitiveMedia.show',
      )}
      onClick={onToggle}
    >
      {iconOnly ? (
        <EimirIcon name="eye-off" />
      ) : (
        <span
          className="sensitive-media-control-copy"
          data-reserve-label={t(
            revealed ? 'sensitiveMedia.reveal' : 'sensitiveMedia.conceal',
          )}
        >
          <span>
            {t(revealed ? 'sensitiveMedia.conceal' : 'sensitiveMedia.reveal')}
          </span>
        </span>
      )}
    </button>
  );
}

export function SensitiveMediaCheckbox({
  checked,
  onChange,
  disabled = false,
  name,
  showHelp = false,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  name?: string;
  showHelp?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="sensitive-media-checkbox">
      <input
        type="checkbox"
        name={name}
        checked={onChange ? checked : undefined}
        defaultChecked={onChange ? undefined : checked}
        disabled={disabled}
        onChange={
          onChange
            ? (event) => onChange(event.currentTarget.checked)
            : undefined
        }
      />
      <span>
        <span>{t('sensitiveMedia.mark')}</span>
        {showHelp ? <small>{t('sensitiveMedia.help')}</small> : null}
      </span>
    </label>
  );
}
