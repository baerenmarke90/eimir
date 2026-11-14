import { type FormEvent, useEffect, useRef, useState } from 'react';
import { normalizeClientError } from '../client/problemDetails';
import { usePhotoSources } from '../client/usePhotoSources';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PhotoSourcePicker.css';
import './GoogleAccountSettings.css';

/**
 * Remembers which Google account to pre-select when Google asks. The address is
 * only a hint for Google's own window; it grants eimir. no access to anything.
 */
export function GoogleAccountSettings(props: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const { spaceId } = props;
  const { apiRef, availability, refreshAvailability } = usePhotoSources(props);
  const email = availability?.googleAccountEmail ?? null;
  const token = availability?.googleAccountToken ?? '';
  const { t } = useTranslation();
  const [linking, setLinking] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    return () => owner.abort();
  }, []);

  function close() {
    if (busy) return;
    setLinking(false);
    setValue('');
    setMessage('');
    setFailed(false);
  }

  async function run(
    action: (signal: AbortSignal) => Promise<void>,
    success: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    const signal = lifetime.current.signal;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await action(signal);
      if (signal.aborted) return;
      await refreshAvailability();
      if (signal.aborted) return;
      setLinking(false);
      setValue('');
      setMessage(t(success));
    } catch (error) {
      if (signal.aborted) return;
      const problem = await normalizeClientError(error);
      if (signal.aborted) return;
      setFailed(true);
      if (problem.status === 409) {
        await refreshAvailability().catch(() => {});
        setLinking(false);
        setValue('');
        setMessage(t('photoSources.googleAccountChanged'));
      } else {
        setMessage(
          t(
            problem.status === 422
              ? 'photoSources.googleAccountInvalid'
              : 'photoSources.googleAccountUnavailable',
          ),
        );
      }
    } finally {
      inFlight.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  function link(event: FormEvent) {
    event.preventDefault();
    const address = value.trim();
    if (!address) return;
    void run(
      async (signal) =>
        apiRef.current.saveGooglePhotoAccount(
          {
            spaceId,
            ifMatch: JSON.stringify(token),
            googleAccountSave: { email: address, consent: true },
          },
          { signal },
        ),
      'photoSources.googleAccountLinked',
    );
  }

  function unlink() {
    void run(
      async (signal) =>
        apiRef.current.removeGooglePhotoAccount(
          { spaceId, ifMatch: JSON.stringify(token) },
          { signal },
        ),
      'photoSources.googleAccountUnlinked',
    );
  }

  if (!availability?.googleAvailable) return null;
  return (
    <section
      className="settings-functional-panel google-account-settings"
      aria-labelledby="google-account-settings-title"
    >
      <h2 id="google-account-settings-title">{t('photoSources.google')}</h2>
      {message && !linking ? (
        <p role={failed ? 'alert' : 'status'}>{message}</p>
      ) : null}
      {email ? (
        <>
          <p>{email}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={unlink}
          >
            {t('photoSources.googleAccountUnlink')}
          </button>
        </>
      ) : (
        <button
          ref={trigger}
          type="button"
          className="secondary"
          onClick={() => {
            setMessage('');
            setLinking(true);
          }}
        >
          {t('photoSources.googleAccountLink')}
        </button>
      )}
      <ShortTaskSheet
        open={linking}
        title={t('photoSources.googleAccountSheetTitle')}
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
              type="submit"
              form="google-account-form"
              disabled={busy || !value.trim()}
            >
              {t('photoSources.connect')}
            </button>
          </div>
        }
      >
        {message ? <p role="alert">{message}</p> : null}
        <form id="google-account-form" onSubmit={link}>
          <label className="field-group">
            {t('photoSources.googleAccountEmail')}
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={value}
              disabled={busy}
              aria-invalid={failed || undefined}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        </form>
      </ShortTaskSheet>
    </section>
  );
}
