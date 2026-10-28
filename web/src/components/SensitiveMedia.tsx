import { useLayoutEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from '../i18n';
import './SensitiveMedia.css';

/** Deliberately volatile: never serialize reveal state with media or navigation. */
export function useSensitiveMediaReveals(identity: string) {
  const [state, setState] = useState<{ identity: string; ids: Set<string> }>(
    () => ({ identity, ids: new Set() }),
  );
  useLayoutEffect(() => {
    setState({ identity, ids: new Set() });
    const conceal = () =>
      flushSync(() => setState({ identity, ids: new Set() }));
    const visibility = () => {
      if (document.visibilityState === 'hidden') conceal();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', conceal);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', conceal);
    };
  }, [identity]);
  return {
    isRevealed: (id: string) =>
      state.identity === identity && state.ids.has(id),
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
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`sensitive-media-cover ${className}`}>
      {children ? (
        <span className="sensitive-media-blurred" aria-hidden="true">
          {children}
        </span>
      ) : null}
      <span className="sensitive-media-label">{t('sensitiveMedia.label')}</span>
    </span>
  );
}

export function SensitiveMediaControl({
  revealed,
  onToggle,
}: {
  revealed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="sensitive-media-control secondary"
      aria-pressed={revealed}
      onClick={onToggle}
    >
      {t(revealed ? 'sensitiveMedia.hide' : 'sensitiveMedia.show')}
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
