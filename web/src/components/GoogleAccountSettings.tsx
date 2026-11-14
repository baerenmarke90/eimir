import { type FormEvent, useEffect, useRef, useState } from 'react';
import { normalizeClientError } from '../client/problemDetails';
import { usePhotoSources } from '../client/usePhotoSources';
import { useTranslation } from '../i18n';
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
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    return () => owner.abort();
  }, []);
  const showForm = editing || !email;

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
      setEditing(false);
      setValue('');
      setMessage(t(success));
    } catch (error) {
      if (signal.aborted) return;
      const problem = await normalizeClientError(error);
      if (signal.aborted) return;
      setFailed(true);
      if (problem.status === 409) {
        await refreshAvailability().catch(() => {});
        setEditing(false);
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

  function save(event: FormEvent) {
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
      'photoSources.googleAccountSaved',
    );
  }

  function remove() {
    void run(
      async (signal) =>
        apiRef.current.removeGooglePhotoAccount(
          { spaceId, ifMatch: JSON.stringify(token) },
          { signal },
        ),
      'photoSources.googleAccountRemoved',
    );
  }

  if (!availability?.googleAvailable) return null;
  return (
    <section
      className="settings-functional-panel google-account-settings"
      aria-labelledby="google-account-settings-title"
    >
      <h2 id="google-account-settings-title">
        {t('photoSources.googleAccountTitle')}
      </h2>
      <p>{t('photoSources.googleAccountHelp')}</p>
      {showForm ? (
        <form onSubmit={save}>
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
          <div className="photo-source-footer">
            {email ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setValue('');
                  setMessage('');
                }}
              >
                {t('common.cancel')}
              </button>
            ) : null}
            <button type="submit" disabled={busy || !value.trim()}>
              {t('photoSources.googleAccountSave')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>
            <strong>{email}</strong>
          </p>
          <div className="photo-source-footer">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMessage('');
                setValue(email ?? '');
                setEditing(true);
              }}
            >
              {t('photoSources.googleAccountChange')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={remove}
            >
              {t('photoSources.googleAccountRemove')}
            </button>
          </div>
        </>
      )}
      {message ? <p role={failed ? 'alert' : 'status'}>{message}</p> : null}
    </section>
  );
}
