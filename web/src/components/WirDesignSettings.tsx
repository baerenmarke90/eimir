import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WirDesignId } from '../api/generated/models/WirDesignId';
import { useWirDesign, WIR_DESIGNS } from '../client/wirDesign';
import {
  clientProblemKind,
  ClientProblemError,
} from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './WirDesign.css';

/** Decorative code-native previews contain no personal data or invented content. */
function DesignPreview({ design }: { design: WirDesignId }) {
  return (
    <span
      className={`wir-design-preview wir-design-preview-${design}`}
      aria-hidden="true"
    >
      <span className="wir-design-preview-hero">
        <span className="wir-design-preview-portraits">
          <i />
          <i />
        </span>
        <span className="wir-design-preview-names" />
      </span>
      <span className="wir-design-preview-vibes">
        <i />
        <i />
      </span>
      <span className="wir-design-preview-quote" />
      <span className="wir-design-preview-moment" />
    </span>
  );
}
export function WirDesignSettings() {
  const state = useWirDesign();
  if (!state) return null;
  return <Settings state={state} />;
}
function Settings({
  state,
}: {
  state: NonNullable<ReturnType<typeof useWirDesign>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { current, preference, capability, mutation } = state;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WirDesignId>(current);
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const initial = useRef<HTMLInputElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const conflict =
    mutation.error instanceof ClientProblemError &&
    mutation.error.kind === 'conflict';
  const denied =
    mutation.error instanceof ClientProblemError &&
    mutation.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';
  const paid = draft !== WirDesignId.warm;
  const free =
    capability.isSuccess && capability.data === false && !capability.isFetching;
  const canSave =
    !paid ||
    (capability.isSuccess &&
      capability.data === true &&
      !capability.isFetching);
  async function save() {
    if (!canSave || conflict || mutation.isPending || draft === current) return;
    setSaved(false);
    try {
      await state.save(draft);
      setSaved(true);
    } catch {
      /* Keep the user's draft and the mutation's recovery state. */
    }
  }
  return (
    <section
      className="settings-section wir-design-settings"
      aria-labelledby="wir-design-title"
    >
      <h2 id="wir-design-title">{t('wirDesign.title')}</h2>
      <p className="settings-section-intro">{t('wirDesign.intro')}</p>
      <div className="wir-design-summary">
        <DesignPreview design={current} />
        <div>
          <strong>{t(`wirDesign.names.${current}`)}</strong>
          <span>
            {current === WirDesignId.warm ? (
              t('wirDesign.standard')
            ) : (
              <ProMark label={t('wirDesign.pro')} />
            )}
          </span>
        </div>
        <button
          type="button"
          className="button-link"
          ref={opener}
          onClick={() => {
            setDraft(current);
            mutation.reset();
            setSaved(false);
            state.inspectCapability();
            setOpen(true);
          }}
        >
          {t('wirDesign.change')}
        </button>
      </div>
      {preference.isPending ? (
        <p role="status">{t('wirDesign.loading')}</p>
      ) : null}
      {preference.error ? (
        <div role="status">
          <p>{t('wirDesign.unavailable')}</p>
          <button
            type="button"
            className="button-link"
            onClick={() => void preference.refetch()}
          >
            {t('wirDesign.retry')}
          </button>
        </div>
      ) : null}
      {saved && !open ? <p role="status">{t('wirDesign.saved')}</p> : null}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('wirDesign.choices')}
        closeLabel={t('wirDesign.close')}
        className="wir-design-sheet"
        initialFocusRef={initial}
        restoreFocusRef={opener}
        isCloseBlocked={mutation.isPending}
        onClose={() => setOpen(false)}
        footer={
          <div className="wir-design-footer">
            {preference.isPending ? (
              <p role="status">{t('wirDesign.loading')}</p>
            ) : null}
            {preference.error ? (
              <div role="status">
                <p>{t('wirDesign.unavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void preference.refetch()}
                >
                  {t('wirDesign.retry')}
                </button>
              </div>
            ) : null}
            {capability.isFetching ? (
              <p role="status">{t('wirDesign.proLoading')}</p>
            ) : null}
            {capability.error ? (
              <div role="status">
                <p>{t('wirDesign.proUnavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void capability.refetch()}
                >
                  {t('wirDesign.retry')}
                </button>
              </div>
            ) : null}
            {mutation.error ? (
              <div role="status">
                <p>
                  {t(
                    conflict
                      ? 'wirDesign.conflict'
                      : denied
                        ? 'wirDesign.denied'
                        : clientProblemKind(mutation.error) === 'offline'
                          ? 'wirDesign.offline'
                          : 'wirDesign.error',
                  )}
                </p>
                {conflict ? (
                  <button
                    type="button"
                    className="button-link"
                    onClick={async () => {
                      const result = await preference.refetch();
                      if (result.data && !result.error) mutation.reset();
                    }}
                  >
                    {t('wirDesign.reload')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {saved ? <p role="status">{t('wirDesign.saved')}</p> : null}
            {paid && free && draft !== current ? (
              <button
                type="button"
                onClick={() =>
                  sheet.current?.closeForNavigation(() =>
                    navigate('/more/profile#profile-premium'),
                  )
                }
              >
                {t('wirDesign.discover')}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !preference.data ||
                  Boolean(preference.error) ||
                  preference.isFetching ||
                  !canSave ||
                  conflict ||
                  mutation.isPending ||
                  draft === current
                }
                aria-busy={mutation.isPending}
                onClick={() => void save()}
              >
                {t(
                  mutation.isPending
                    ? 'wirDesign.saving'
                    : draft === current
                      ? 'wirDesign.selected'
                      : 'wirDesign.save',
                )}
              </button>
            )}
          </div>
        }
      >
        <p className="wir-design-personal">{t('wirDesign.personal')}</p>
        <fieldset className="wir-design-options" disabled={mutation.isPending}>
          <legend className="sr-only">{t('wirDesign.choices')}</legend>
          {WIR_DESIGNS.map((design) => (
            <label
              key={design}
              className={`wir-design-option${draft === design ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="wir-design"
                value={design}
                ref={current === design ? initial : undefined}
                checked={draft === design}
                onChange={() => {
                  setDraft(design);
                  setSaved(false);
                  if (!conflict) mutation.reset();
                }}
              />
              <DesignPreview design={design} />
              <span className="wir-design-copy">
                <strong>
                  {t(`wirDesign.names.${design}`)}{' '}
                  {design === WirDesignId.warm ? (
                    <span className="wir-design-tier">
                      {t('wirDesign.standard')}
                    </span>
                  ) : (
                    <ProMark label={t('wirDesign.pro')} />
                  )}
                </strong>
                <span>{t(`wirDesign.descriptions.${design}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </ShortTaskSheet>
    </section>
  );
}
