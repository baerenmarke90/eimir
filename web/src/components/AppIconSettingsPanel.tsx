import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppIconId } from '../api/generated/models/AppIconId';
import { APP_ICON_IDS, appIconImage } from '../client/appIcon';
import { useAppIcon } from '../client/appIconContext';
import {
  clientProblemKind,
  ClientProblemError,
} from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './AppIconSettingsPanel.css';

export function AppIconSettingsPanel() {
  const state = useAppIcon();
  if (!state) return null;
  return <AppIconSettings state={state} />;
}

function AppIconSettings({
  state,
}: {
  state: NonNullable<ReturnType<typeof useAppIcon>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AppIconId>('original');
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<HTMLInputElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const { preference, capability, mutation } = state;
  const current = preference.data?.preference.iconId ?? 'original';
  const previewName = t(`appIcon.names.${preview}`);
  const isPaid = preview !== 'original';
  const canSave =
    !isPaid ||
    (capability.isSuccess &&
      capability.data === true &&
      !capability.isFetching);
  const isFree =
    capability.isSuccess && capability.data === false && !capability.isFetching;
  const conflict =
    mutation.error instanceof ClientProblemError &&
    mutation.error.kind === 'conflict';
  const denied =
    mutation.error instanceof ClientProblemError &&
    mutation.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';

  function openSelector() {
    state.inspectCapability();
    setPreview(current);
    mutation.reset();
    setSaved(false);
    setOpen(true);
  }

  async function save() {
    if (mutation.isPending || preview === current || !canSave || conflict)
      return;
    setSaved(false);
    try {
      await state.save(preview);
      setSaved(true);
    } catch {
      /* The mutation retains the preview and localized inline recovery. */
    }
  }

  return (
    <section
      className="app-icon-settings settings-section"
      aria-labelledby="app-icon-heading"
    >
      <div className="settings-section-head">
        <h2 id="app-icon-heading">{t('appIcon.title')}</h2>
        <p className="settings-section-intro">{t('appIcon.intro')}</p>
      </div>
      <div className="app-icon-summary">
        <img src={appIconImage(current)} width="64" height="64" alt="" />
        <div>
          <strong>{t(`appIcon.names.${current}`)}</strong>
          {current === 'original' ? (
            <span>{t('appIcon.free')}</span>
          ) : (
            <ProMark label={t('appIcon.pro')} />
          )}
        </div>
        <button
          type="button"
          ref={opener}
          className="button-link"
          onClick={openSelector}
        >
          {t('appIcon.all')}
        </button>
      </div>
      {preference.isPending ? (
        <p role="status">{t('appIcon.loading')}</p>
      ) : null}
      {preference.error ? (
        <div role="status" className="app-icon-message">
          <p>{t('appIcon.unavailable')}</p>
          <button
            type="button"
            className="button-link"
            onClick={() => void preference.refetch()}
          >
            {t('appIcon.retry')}
          </button>
        </div>
      ) : null}
      {saved && !open ? <p role="status">{t('appIcon.saved')}</p> : null}
      <p className="app-icon-platform">{t('appIcon.browser')}</p>

      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('appIcon.choices')}
        closeLabel={t('appIcon.close')}
        className="app-icon-sheet"
        initialFocusRef={initialFocus}
        restoreFocusRef={opener}
        isCloseBlocked={mutation.isPending}
        onClose={() => setOpen(false)}
        footer={
          <div className="app-icon-footer">
            {preference.isPending ? (
              <p role="status">{t('appIcon.loading')}</p>
            ) : null}
            {preference.error ? (
              <div role="status" className="app-icon-message">
                <p>{t('appIcon.unavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void preference.refetch()}
                >
                  {t('appIcon.retry')}
                </button>
              </div>
            ) : null}
            {capability.isFetching ? (
              <p role="status">{t('appIcon.proLoading')}</p>
            ) : null}
            {capability.error ? (
              <div role="status" className="app-icon-message">
                <p>{t('appIcon.capabilityUnavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void capability.refetch()}
                >
                  {t('appIcon.retry')}
                </button>
              </div>
            ) : null}
            {mutation.error ? (
              <div role="status" className="app-icon-message">
                <p>
                  {t(
                    conflict
                      ? 'appIcon.conflict'
                      : denied
                        ? 'appIcon.denied'
                        : clientProblemKind(mutation.error) === 'offline'
                          ? 'appIcon.offline'
                          : 'appIcon.error',
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
                    {t('appIcon.reload')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {saved ? <p role="status">{t('appIcon.saved')}</p> : null}
            {isPaid && isFree ? (
              <button
                type="button"
                onClick={() => {
                  sheet.current?.closeForNavigation(() =>
                    navigate('/more/profile#profile-premium'),
                  );
                }}
              >
                {t('appIcon.discover')}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !preference.data ||
                  Boolean(preference.error) ||
                  !canSave ||
                  conflict ||
                  mutation.isPending ||
                  preview === current
                }
                aria-busy={mutation.isPending}
                onClick={() => void save()}
              >
                {mutation.isPending
                  ? t('appIcon.saving')
                  : preview === current
                    ? t('appIcon.selected')
                    : t('appIcon.choose', { name: previewName })}
              </button>
            )}
            <p className="app-icon-platform">{t('appIcon.browser')}</p>
          </div>
        }
      >
        <p className="app-icon-intro">{t('appIcon.proIntro')}</p>
        <figure
          className="app-icon-preview"
          aria-label={t('appIcon.preview', { name: previewName })}
        >
          <img src={appIconImage(preview)} width="80" height="80" alt="" />
          <figcaption>
            <strong>{previewName}</strong>
          </figcaption>
        </figure>
        <fieldset className="app-icon-grid" disabled={mutation.isPending}>
          <legend className="sr-only">{t('appIcon.choices')}</legend>
          {APP_ICON_IDS.map((iconId) => (
            <label
              key={iconId}
              className={`app-icon-option ${preview === iconId ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name="app-icon"
                value={iconId}
                ref={current === iconId ? initialFocus : undefined}
                checked={preview === iconId}
                onChange={() => {
                  setPreview(iconId);
                  setSaved(false);
                  if (!conflict) mutation.reset();
                }}
              />
              <img
                src={appIconImage(iconId)}
                width="64"
                height="64"
                alt=""
                loading="lazy"
              />
              <span className="app-icon-name">
                {t(`appIcon.names.${iconId}`)}
              </span>
              {iconId === 'original' ? (
                <span className="app-icon-tier">{t('appIcon.free')}</span>
              ) : (
                <ProMark label={t('appIcon.pro')} />
              )}
              <span className="app-icon-check" aria-hidden="true">
                {preview === iconId ? '✓' : ''}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="app-icon-personal">{t('appIcon.personal')}</p>
      </ShortTaskSheet>
    </section>
  );
}
