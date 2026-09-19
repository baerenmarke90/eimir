import {
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import { normalizeClientError } from '../client/problemDetails';
import { clearProductReadCache } from '../client/productReadCache';
import { loadStoredSession, storeSession } from '../client/sessionPersistence';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './SpaceOffboardingPanel.css';

type OffboardingStep = 'consequences' | 'confirm' | null;

export interface SpaceOffboardingPanelProps {
  spacesApi: SpacesApi;
  spaceId: string;
  demoMode: boolean;
  /** Test/host override. Production reuses the normal Space-context reset boundary. */
  onSpaceLeft?: () => void | Promise<void>;
}

export function SpaceOffboardingPanel({
  spacesApi,
  spaceId,
  demoMode,
  onSpaceLeft,
}: SpaceOffboardingPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OffboardingStep>(null);
  const [confirmation, setConfirmation] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      try {
        return await spacesApi.leaveSpaceApiV1SpacesSpaceIdMembershipLeavePost({
          spaceId,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setStep(null);
      setConfirmation('');

      if (onSpaceLeft) {
        await onSpaceLeft();
        return;
      }

      // The Account session remains valid after leaving one Space. Remove only
      // the former Space selection and local product cache, then hard-reload so
      // the existing root Space resolver obtains a fresh server-authorized
      // Membership set and chooses another Space, the picker, or the empty state.
      const storedSession = loadStoredSession();
      if (storedSession) {
        storeSession({ ...storedSession, spaceId: null });
      }
      queryClient.clear();
      try {
        await clearProductReadCache();
      } finally {
        window.location.replace('/');
      }
    },
  });

  useModalLifecycle({
    active: Boolean(step),
    initialFocusRef: cancelButtonRef,
  });

  function closeDialog() {
    if (mutation.isPending) return;
    setStep(null);
    setConfirmation('');
    mutation.reset();
  }

  function goToDataExport() {
    if (mutation.isPending) return;
    closeDialog();
    window.location.hash = 'settings-data';
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !mutation.isPending) {
      event.preventDefault();
      closeDialog();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function submitExit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = t('spaceOffboarding.confirmPhrase');
    if (confirmation !== phrase || mutation.isPending || demoMode) return;
    mutation.mutate();
  }

  const confirmationPhrase = t('spaceOffboarding.confirmPhrase');
  const confirmationMatches = confirmation === confirmationPhrase;

  return (
    <>
      <section
        className="form-card space-offboarding-panel"
        aria-labelledby="space-offboarding-title"
      >
        <div className="space-offboarding-copy">
          <p className="eyebrow">{t('spaceOffboarding.eyebrow')}</p>
          <h3 id="space-offboarding-title">{t('spaceOffboarding.title')}</h3>
          <p>{t('spaceOffboarding.intro')}</p>
        </div>

        {demoMode ? (
          <div className="space-offboarding-demo-note" role="note">
            <strong>{t('spaceOffboarding.demoTitle')}</strong>
            <span>{t('spaceOffboarding.demoBody')}</span>
            <button type="button" className="space-exit-button" disabled>
              {t('spaceOffboarding.action')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="space-exit-button"
            onClick={() => {
              mutation.reset();
              setStep('consequences');
            }}
          >
            {t('spaceOffboarding.action')}
          </button>
        )}
      </section>

      {step ? (
        <div className="space-offboarding-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="modal-card space-offboarding-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="space-offboarding-dialog-title"
            aria-describedby="space-offboarding-dialog-description"
            onKeyDown={handleDialogKeyDown}
          >
            {step === 'consequences' ? (
              <>
                <div className="space-offboarding-dialog-head">
                  <div>
                    <p className="eyebrow">{t('spaceOffboarding.eyebrow')}</p>
                    <h2 id="space-offboarding-dialog-title">
                      {t('spaceOffboarding.consequencesTitle')}
                    </h2>
                  </div>
                </div>
                <p id="space-offboarding-dialog-description">
                  {t('spaceOffboarding.consequencesIntro')}
                </p>
                <ul className="space-offboarding-consequences">
                  <li>{t('spaceOffboarding.consequenceAccess')}</li>
                  <li>{t('spaceOffboarding.consequenceAccount')}</li>
                  <li>{t('spaceOffboarding.consequencePrivate')}</li>
                  <li>{t('spaceOffboarding.consequenceShared')}</li>
                  <li>{t('spaceOffboarding.consequenceExport')}</li>
                </ul>
                <div className="form-actions space-offboarding-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={goToDataExport}
                  >
                    {t('spaceOffboarding.exportBefore')}
                  </button>
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="secondary"
                    onClick={closeDialog}
                  >
                    {t('spaceOffboarding.cancelAction')}
                  </button>
                  <button
                    type="button"
                    className="space-exit-button"
                    onClick={() => {
                      setConfirmation('');
                      mutation.reset();
                      setStep('confirm');
                    }}
                  >
                    {t('spaceOffboarding.continueAction')}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submitExit} className="form-grid">
                <div className="space-offboarding-dialog-head">
                  <div>
                    <p className="eyebrow">{t('spaceOffboarding.eyebrow')}</p>
                    <h2 id="space-offboarding-dialog-title">
                      {t('spaceOffboarding.finalTitle')}
                    </h2>
                  </div>
                </div>
                <p id="space-offboarding-dialog-description">
                  {t('spaceOffboarding.finalIntro')}
                </p>
                <p>
                  {t('spaceOffboarding.confirmInstruction', {
                    phrase: confirmationPhrase,
                  })}
                </p>
                <p className="space-confirmation-phrase" aria-hidden="true">
                  <code>{confirmationPhrase}</code>
                </p>
                <div className="field-group">
                  <label htmlFor="space-offboarding-confirmation">
                    {t('spaceOffboarding.confirmLabel')}
                  </label>
                  <input
                    id="space-offboarding-confirmation"
                    value={confirmation}
                    onChange={(event) =>
                      setConfirmation(event.currentTarget.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={mutation.isPending}
                    aria-describedby="space-offboarding-confirmation-help"
                  />
                  <p
                    id="space-offboarding-confirmation-help"
                    className="field-help"
                  >
                    {t('spaceOffboarding.confirmHelp')}
                  </p>
                </div>

                {mutation.error ? (
                  <ProblemState error={mutation.error} />
                ) : null}
                {mutation.isPending ? (
                  <p className="status" role="status" aria-live="polite">
                    {t('spaceOffboarding.submitting')}
                  </p>
                ) : null}

                <div className="form-actions space-offboarding-actions">
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (mutation.isPending) return;
                      setConfirmation('');
                      mutation.reset();
                      setStep('consequences');
                    }}
                    disabled={mutation.isPending}
                  >
                    {t('spaceOffboarding.backAction')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={closeDialog}
                    disabled={mutation.isPending}
                  >
                    {t('spaceOffboarding.cancelAction')}
                  </button>
                  <button
                    type="submit"
                    className="space-exit-button"
                    disabled={!confirmationMatches || mutation.isPending}
                  >
                    {mutation.isPending
                      ? t('spaceOffboarding.submitting')
                      : t('spaceOffboarding.submitAction')}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
