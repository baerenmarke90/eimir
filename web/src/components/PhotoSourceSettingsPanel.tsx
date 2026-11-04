import { useEffect, useRef, useState } from 'react';
import { usePhotoSources } from '../client/usePhotoSources';
import { useTranslation } from '../i18n';
import { normalizeClientError } from '../client/problemDetails';
import { ShortTaskSheet } from './ShortTaskSheet';
import { ProMark } from './ProMark';
import './PhotoSourcePicker.css';

/** Personal, revocable Immich connection; capture only owns deliberate selection. */
export function PhotoSourceSettingsPanel(props: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { spaceId } = props;
  const { apiRef, availability, refreshAvailability, error, loading } =
    usePhotoSources(props);
  const [linking, setLinking] = useState(false);
  const [origin, setOrigin] = useState('');
  const [key, setKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const formRequest = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    return () => {
      owner.abort();
      formRequest.current?.abort();
    };
  }, []);
  function close() {
    if (busy) return;
    formRequest.current?.abort();
    setLinking(false);
    setKey('');
    setConsent(false);
    setMessage('');
  }
  async function connect() {
    if (!availability || !consent || inFlight.current) return;
    inFlight.current = true;
    const owner = new AbortController();
    formRequest.current = owner;
    setBusy(true);
    setMessage('');
    try {
      await apiRef.current.connectImmichPhotoSource(
        {
          spaceId,
          ifMatch: JSON.stringify(availability.immichConnectionToken),
          photoSourceConnectionCreate: {
            origin: origin.trim(),
            apiKey: key,
            consent: true,
          },
        },
        { signal: owner.signal },
      );
      if (owner.signal.aborted) return;
      setKey('');
      await refreshAvailability();
      if (owner.signal.aborted) return;
      setLinking(false);
      setConsent(false);
      setMessage(t('photoSources.connected'));
    } catch (error) {
      await showConnectionFailure(
        error,
        owner,
        'photoSources.addressUnavailable',
      );
    } finally {
      inFlight.current = false;
      if (!owner.signal.aborted) setBusy(false);
    }
  }

  async function disconnect() {
    if (!availability || inFlight.current) return;
    inFlight.current = true;
    const owner = new AbortController();
    formRequest.current = owner;
    setBusy(true);
    setMessage('');
    try {
      await apiRef.current.disconnectImmichPhotoSource(
        {
          spaceId,
          ifMatch: JSON.stringify(availability.immichConnectionToken),
        },
        { signal: owner.signal },
      );
      if (owner.signal.aborted) return;
      await refreshAvailability();
      if (!owner.signal.aborted) setMessage(t('photoSources.disconnected'));
    } catch (error) {
      await showConnectionFailure(error, owner, 'photoSources.unavailable');
    } finally {
      inFlight.current = false;
      if (!owner.signal.aborted) setBusy(false);
    }
  }

  async function showConnectionFailure(
    error: unknown,
    owner: AbortController,
    fallback: string,
  ) {
    if (owner.signal.aborted) return;
    const problem = await normalizeClientError(error);
    if (owner.signal.aborted) return;
    if (problem.status === 409 || problem.status === 403) {
      await refreshAvailability().catch(() => {});
      if (owner.signal.aborted) return;
      setKey('');
      setLinking(false);
      setConsent(false);
      setMessage(
        t(
          problem.status === 409
            ? 'photoSources.connectionChanged'
            : 'photoSources.proRequired',
        ),
      );
    } else setMessage(t(fallback));
  }

  if (loading) return <p role="status">{t('states.loading.title')}</p>;
  return (
    <section
      className="settings-functional-panel"
      aria-labelledby="photo-source-settings-title"
    >
      <h2 id="photo-source-settings-title">
        {t('photoSources.immich')} <ProMark label={t('photoSources.pro')} />
      </h2>
      {message && !linking ? <p role="status">{message}</p> : null}
      {error ? (
        <>
          <p role="alert">{t('photoSources.unavailable')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => void refreshAvailability().catch(() => {})}
          >
            {t('common.retry')}
          </button>
        </>
      ) : null}
      {availability?.immichConnected ? (
        <>
          <p>{availability.immichOrigin}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {t('photoSources.disconnect')}
          </button>
        </>
      ) : availability?.enabled && availability.canImport ? (
        <button
          ref={trigger}
          type="button"
          className="secondary"
          onClick={() => {
            setMessage('');
            setLinking(true);
          }}
        >
          {t('photoSources.link')}
        </button>
      ) : (
        <p>
          {t(
            availability?.enabled
              ? 'photoSources.proRequired'
              : 'photoSources.unavailable',
          )}
        </p>
      )}
      <ShortTaskSheet
        open={linking}
        title={t('photoSources.linkTitle')}
        onClose={close}
        isCloseBlocked={busy}
        restoreFocusRef={trigger}
        className="photo-source-sheet"
        footer={
          <div className="photo-source-footer">
            <button
              type="button"
              className="secondary"
              onClick={close}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!consent || !origin.trim() || !key || busy}
              onClick={() => void connect()}
            >
              {t(busy ? 'photoSources.connecting' : 'photoSources.connect')}
            </button>
          </div>
        }
      >
        {message ? <p role="alert">{message}</p> : null}
        <>
          <p>{t('photoSources.privateLink')}</p>
          <p>{t('photoSources.consent')}</p>
          <details className="photo-source-setup-help">
            <summary>{t('photoSources.setupHelp')}</summary>
            <ol>
              <li>{t('photoSources.setupOpen')}</li>
              <li>{t('photoSources.setupKey')}</li>
              <li>{t('photoSources.setupPermissions')}</li>
            </ol>
            <p>{t('photoSources.setupFallback')}</p>
          </details>
          <label className="field-group">
            {t('photoSources.address')}
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              value={origin}
              disabled={busy}
              onChange={(event) => setOrigin(event.target.value)}
              aria-describedby="immich-address-hint"
            />
          </label>
          <p id="immich-address-hint" className="field-help">
            {t('photoSources.addressHint')}
          </p>
          <label className="field-group">
            {t('photoSources.key')}
            <input
              type="password"
              aria-describedby="immich-key-hint"
              autoComplete="off"
              value={key}
              disabled={busy}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <p id="immich-key-hint" className="field-help">
            {t('photoSources.keyIsNotPassword')}
          </p>
          <p className="field-help">{t('photoSources.permissions')}</p>
          <label className="photo-source-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />
            {t('photoSources.linkConsent')}
          </label>
        </>
      </ShortTaskSheet>
    </section>
  );
}
