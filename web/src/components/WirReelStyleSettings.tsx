import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import {
  isProWirReelStyle,
  WIR_REEL_STYLES,
  type WirReelStyle,
} from '../client/wirReelStyle';
import { useWirReelStyle } from '../client/wirReelStyleContext';
import { useTranslation } from '../i18n';
import { haptic } from '../motion/haptics';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { WirReelStyleArt } from './WirReelStyleArt';
import './WirReelStyleSettings.css';

/**
 * Settings > Appearance: how Wir shows "Neu für dich" and "Du bist dran"
 * (#2345). It works like the Erinnerungswelten: a summary with the current
 * style, a sheet with all styles and an explicit save. Circles are free;
 * tiles and chips are Pro presentation choices that stay after Pro ends.
 * Settings is the only entry point; Wir links nowhere here.
 */
export function WirReelStyleSettings() {
  const state = useWirReelStyle();
  if (!state?.ready) return null;
  return <Settings state={state} />;
}

function TierMark({ style }: { style: WirReelStyle }) {
  const { t } = useTranslation();
  return isProWirReelStyle(style) ? (
    <ProMark label={t('wirReelStyleSettings.pro')} />
  ) : (
    <span className="wir-reel-style-tier">
      {t('wirReelStyleSettings.free')}
    </span>
  );
}

function Settings({
  state,
}: {
  state: NonNullable<ReturnType<typeof useWirReelStyle>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { style, capability } = state;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WirReelStyle>(style);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<HTMLInputElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const name = (id: WirReelStyle) =>
    t(`wirReelStyleSettings.styles.${id}.name`);
  const changed = draft !== style;
  const paid = isProWirReelStyle(draft);
  const free =
    capability.isSuccess && capability.data === false && !capability.isFetching;
  const canSave =
    !paid ||
    (capability.isSuccess &&
      capability.data === true &&
      !capability.isFetching);
  const denied =
    error instanceof ClientProblemError &&
    error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';

  async function save() {
    if (!changed || saving || !canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await state.save(draft);
      setSaved(true);
      haptic('success');
      setOpen(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="settings-section wir-reel-style-settings"
      aria-labelledby="wir-reel-style-title"
    >
      <h2 id="wir-reel-style-title">{t('wirReelStyleSettings.title')}</h2>
      <p className="settings-section-intro">{t('wirReelStyleSettings.help')}</p>
      <div className="wir-reel-style-summary">
        <span className="wir-reel-style-summary-art" aria-hidden="true">
          <WirReelStyleArt style={style} />
        </span>
        <div>
          <strong>{name(style)}</strong>
          <TierMark style={style} />
        </div>
        <button
          type="button"
          className="button-link"
          ref={opener}
          onClick={() => {
            setDraft(style);
            setSaved(false);
            setError(null);
            state.inspectCapability();
            setOpen(true);
          }}
        >
          {t('wirReelStyleSettings.change')}
        </button>
      </div>
      {isProWirReelStyle(style) && free ? (
        <p className="wir-reel-style-note">
          {t('wirReelStyleSettings.kept', { name: name(style) })}
        </p>
      ) : null}
      {saved && !open ? (
        <p className="wir-reel-style-note" role="status">
          {t('wirReelStyleSettings.saved', { name: name(style) })}
        </p>
      ) : null}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('wirReelStyleSettings.choices')}
        closeLabel={t('wirReelStyleSettings.close')}
        className="wir-reel-style-sheet"
        initialFocusRef={initialFocus}
        restoreFocusRef={opener}
        isCloseBlocked={saving}
        onClose={() => setOpen(false)}
        footer={
          <div className="wir-reel-style-footer">
            {capability.isFetching ? (
              <p role="status">{t('wirReelStyleSettings.proLoading')}</p>
            ) : null}
            {capability.error ? (
              <div role="status">
                <p>{t('wirReelStyleSettings.proUnavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void capability.refetch()}
                >
                  {t('wirReelStyleSettings.retry')}
                </button>
              </div>
            ) : null}
            {error ? (
              <p role="alert">
                {t(
                  denied
                    ? 'wirReelStyleSettings.denied'
                    : clientProblemKind(error) === 'offline'
                      ? 'wirReelStyleSettings.offline'
                      : clientProblemKind(error) === 'conflict'
                        ? 'wirReelStyleSettings.conflict'
                        : 'wirReelStyleSettings.saveError',
                )}
              </p>
            ) : null}
            {paid && free && changed ? (
              <>
                <p>
                  {t('wirReelStyleSettings.proHint', { name: name(draft) })}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    sheet.current?.closeForNavigation(() =>
                      navigate(proPaywallPath()),
                    )
                  }
                >
                  {t('wirReelStyleSettings.discover')}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!changed || saving || !canSave}
                aria-busy={saving}
                onClick={() => void save()}
              >
                {saving
                  ? t('wirReelStyleSettings.saving')
                  : changed
                    ? t('wirReelStyleSettings.choose', { name: name(draft) })
                    : t('wirReelStyleSettings.selected')}
              </button>
            )}
          </div>
        }
      >
        <p className="wir-reel-style-intro">
          {t('wirReelStyleSettings.intro')}
        </p>
        <fieldset className="wir-reel-style-grid" disabled={saving}>
          <legend className="sr-only">
            {t('wirReelStyleSettings.choices')}
          </legend>
          {WIR_REEL_STYLES.map((id) => (
            <label
              key={id}
              className={`wir-reel-style-option${draft === id ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="wir-reel-style"
                value={id}
                ref={style === id ? initialFocus : undefined}
                checked={draft === id}
                onChange={() => {
                  setDraft(id);
                  setSaved(false);
                  setError(null);
                  haptic('threshold');
                }}
              />
              <span className="wir-reel-style-option-art" aria-hidden="true">
                <WirReelStyleArt style={id} />
                {style === id ? (
                  <span className="wir-reel-style-option-current">
                    {t('wirReelStyleSettings.current')}
                  </span>
                ) : null}
              </span>
              <span className="wir-reel-style-option-head">
                <span className="wir-reel-style-option-name">{name(id)}</span>
                <TierMark style={id} />
              </span>
              <span className="wir-reel-style-option-sentence">
                {t(`wirReelStyleSettings.styles.${id}.sentence`)}
              </span>
            </label>
          ))}
        </fieldset>
      </ShortTaskSheet>
    </section>
  );
}
