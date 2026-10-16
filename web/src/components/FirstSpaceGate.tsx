import { useState } from 'react';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { Configuration } from '../api/generated/runtime';
import { normalizeClientError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { Brand } from './Brand';
import { ProblemState } from './ProblemState';

export interface FirstSpaceGateProps {
  apiBaseUrl: string;
  accessToken: string;
  onSpaceReady: () => Promise<void>;
}

export function FirstSpaceGate({
  apiBaseUrl,
  accessToken,
  onSpaceReady,
}: FirstSpaceGateProps) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleCreateSpace = async () => {
    setIsPending(true);
    setError(null);
    try {
      const spacesApi = new SpacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      await spacesApi.createSpaceApiV1SpacesPost();
      await onSpaceReady();
    } catch (err: unknown) {
      const normalized = await normalizeClientError(err);
      if (normalized.code === 'ACCOUNT_HAS_ACTIVE_SPACE') {
        try {
          await onSpaceReady();
          return;
        } catch (readyErr) {
          setError(await normalizeClientError(readyErr));
          return;
        }
      }
      setError(normalized);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="setup-shell">
      <div className="entry-aura entry-aura-start" aria-hidden="true" />
      <div className="entry-aura entry-aura-end" aria-hidden="true" />
      <section
        className="setup-card"
        aria-labelledby="create-first-space-heading"
      >
        <Brand />
        <div className="setup-content">
          <p className="eyebrow">{t('spaceContext.createFirstSpaceEyebrow')}</p>
          <h1 id="create-first-space-heading">
            {t('spaceContext.createFirstSpaceTitle')}
          </h1>
          <p>{t('spaceContext.createFirstSpaceBody')}</p>
          {error ? (
            <ProblemState error={error} onRetry={handleCreateSpace} />
          ) : (
            <div className="form-actions">
              <button
                type="button"
                onClick={() => void handleCreateSpace()}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending
                  ? t('spaceContext.createFirstSpacePending')
                  : t('spaceContext.createFirstSpaceSubmit')}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
