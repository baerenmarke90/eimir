import { useEffect, useRef, useState } from 'react';
import {
  appUpdatesAdapter,
  type AppUpdatesAdapter,
} from '../client/appUpdates';
import { useTranslation } from '../i18n';
import { useAppUpdateState } from '../client/useAppUpdateState';
import './AppUpdatesPanel.css';

export function AppUpdatesPanel({
  adapter: supplied,
}: {
  adapter?: AppUpdatesAdapter;
}) {
  const { t } = useTranslation();
  const [adapter] = useState(() => supplied ?? appUpdatesAdapter());
  const { state, readError, acceptState } = useAppUpdateState(adapter);
  const [localError, setLocalError] = useState(false);
  const [pending, setPending] = useState(false);
  const admitted = useRef(false);
  const activation = useRef(0);

  useEffect(() => {
    activation.current++;
    return () => {
      activation.current++;
    };
  }, []);

  async function perform(action: 'check' | 'download' | 'install' | 'cancel') {
    if (admitted.current) return;
    admitted.current = true;
    const current = activation.current;
    setPending(true);
    setLocalError(false);
    try {
      const next = await adapter[action]();
      if (current === activation.current) acceptState(next);
    } catch {
      if (current === activation.current) setLocalError(true);
    } finally {
      admitted.current = false;
      if (current === activation.current) setPending(false);
    }
  }

  function cancelDownload() {
    const current = activation.current;
    void adapter.cancel().catch(() => {
      if (current === activation.current) setLocalError(true);
    });
  }

  const failed = localError || readError;
  const phase = state?.phase ?? 'idle';
  const busy = pending || Boolean(state?.busy);
  const ready = phase === 'ready' || phase === 'permissionRequired';
  const canDownload =
    Boolean(state?.available) &&
    (phase === 'available' || phase === 'cancelled');
  const action = ready ? 'install' : canDownload ? 'download' : 'check';
  const actionLabel = phase === 'permissionRequired' ? 'installAgain' : action;

  return (
    <section className="app-updates-panel" aria-label={t('appUpdates.title')}>
      {state ? (
        <div className="app-updates-installed">
          <h2>{t('appUpdates.installed', { version: state.versionName })}</h2>
          <p>{t('appUpdates.testVersion')}</p>
          <details>
            <summary>{t('appUpdates.buildInfo')}</summary>
            <p>
              {t('appUpdates.build', {
                code: state.versionCode,
                revision: state.sourceRevision,
              })}
            </p>
          </details>
        </div>
      ) : null}
      <p className="app-updates-status" role="status" aria-live="polite">
        {state ? t(`appUpdates.phases.${phase}`) : t('states.loading.title')}
      </p>
      {phase === 'downloading' ? (
        <progress
          max={100}
          value={state?.progress ?? 0}
          aria-label={t('appUpdates.progress')}
        />
      ) : null}
      {state?.available ? (
        <div className="app-updates-offer">
          <h2>
            {t('appUpdates.availableVersion', {
              version: state.available.versionName,
            })}
          </h2>
          {state.available.releaseNotes ? (
            <details>
              <summary>{t('appUpdates.notes')}</summary>
              <p className="app-updates-notes">
                {state.available.releaseNotes}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
      {phase === 'permissionRequired' ? (
        <p>{t('appUpdates.permission')}</p>
      ) : null}
      {phase === 'error' || failed ? (
        <p className="field-error" role="alert">
          {t(
            failed
              ? 'appUpdates.actionError'
              : state?.errorCode === 'NETWORK'
                ? 'appUpdates.connectionError'
                : state?.errorCode === 'INSTALL_FAILED'
                  ? 'appUpdates.installError'
                  : 'appUpdates.integrityError',
          )}
        </p>
      ) : null}
      <div className="form-actions">
        {phase === 'downloading' ? (
          <button type="button" className="secondary" onClick={cancelDownload}>
            {t('appUpdates.cancel')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || (!state && !failed)}
            onClick={() => void perform(action)}
          >
            {t(
              failed || phase === 'error'
                ? 'appUpdates.retry'
                : `appUpdates.${actionLabel}`,
            )}
          </button>
        )}
      </div>
      <p className="app-updates-consequence">{t('appUpdates.confirm')}</p>
    </section>
  );
}
