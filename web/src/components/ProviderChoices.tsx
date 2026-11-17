import type { OidcConnectionView } from '../api/generated/models/OidcConnectionView';
import { useTranslation } from '../i18n';
import './ProviderChoices.css';

/** Google's four-colour "G". Decorative: the button text carries the name. */
export function GoogleMark() {
  return (
    <svg
      className="provider-mark"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.2 7-17.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export function KeyMark() {
  return (
    <svg
      className="provider-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9m-3 0v4m-3-4v3" />
    </svg>
  );
}

export function MailMark() {
  return (
    <svg
      className="provider-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 8 8 6 8-6" />
    </svg>
  );
}

export function IdentityMark() {
  return (
    <svg
      className="provider-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  );
}

/**
 * Provider and passkey entries of the sign-in card. They are quiet,
 * equal-weight buttons; the e-mail form keeps the one filled action.
 */
export function ProviderChoices({
  connections,
  signup,
  disabled,
  pendingConnection,
  onProvider,
  passkey,
  passkeyPending,
  onPasskey,
  dividerKey,
}: {
  connections: OidcConnectionView[];
  /** Label the provider entries as creating an Account. */
  signup: boolean;
  disabled: boolean;
  pendingConnection: string | null;
  onProvider: (connectionId: string) => void;
  passkey: boolean;
  passkeyPending: boolean;
  onPasskey: () => void;
  dividerKey: 'identity.dividerEmailLink' | 'identity.dividerOr';
}) {
  const { t } = useTranslation();
  if (connections.length === 0 && !passkey) return null;
  return (
    <div className="provider-choices">
      {connections.map((connection) => {
        const google = connection.brand === 'google';
        const label = google
          ? t(signup ? 'identity.googleSignUp' : 'identity.googleContinue')
          : connection.label
            ? t('identity.providerContinue', { name: connection.label })
            : t('identity.providerContinueDefault');
        const pending = pendingConnection === connection.id;
        return (
          <button
            key={connection.id}
            type="button"
            className="provider-button"
            disabled={disabled}
            aria-busy={pending || undefined}
            onClick={() => onProvider(connection.id)}
          >
            {google ? <GoogleMark /> : <IdentityMark />}
            <span>{label}</span>
          </button>
        );
      })}
      {passkey ? (
        <button
          type="button"
          className="provider-button"
          disabled={disabled}
          aria-busy={passkeyPending || undefined}
          onClick={onPasskey}
        >
          <KeyMark />
          <span>{t('identity.passkeySignIn')}</span>
        </button>
      ) : null}
      <p className="provider-divider">
        <span>{t(dividerKey)}</span>
      </p>
    </div>
  );
}
