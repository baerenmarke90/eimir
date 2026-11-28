import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type PersonColourPairId,
  personColourPair,
} from '../client/personColours';
import { usePersonColours } from '../client/personColoursContext';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import { setSystemColorsEnabled } from '../client/systemColors';
import { useTranslation } from '../i18n';
import { PersonColourChoice, Swatches } from './PersonColourChoice';
import { ProMark } from './ProMark';
import { SystemColorsOverrideNote } from './SystemColorsOverrideNote';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PersonColourChoice.css';

/**
 * Settings > Appearance: the personal colour pair (Product Owner decisions
 * 2026-11-16). It works like the Wir design: a summary with the current choice,
 * a sheet with the options and an explicit save. Choosing a pair is a Pro
 * feature; Automatic is always free and a saved pair stays after Pro ends. The
 * pair is a view setting and is never shared with the partner.
 */
export function PersonColoursSettings() {
  const state = usePersonColours();
  if (!state?.ready) return null;
  return <Settings state={state} />;
}

function Settings({
  state,
}: {
  state: NonNullable<ReturnType<typeof usePersonColours>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { colours, capability } = state;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PersonColourPairId | null>(colours);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const tone = (id: string) => t(`personColours.tone.${id}`);
  const label = (id: PersonColourPairId | null) => {
    const pair = personColourPair(id);
    return id === null
      ? t('personColours.automatic')
      : t('personColours.pair', {
          own: tone(pair.own),
          partner: tone(pair.partner),
        });
  };
  const current = personColourPair(colours);
  const changed = draft !== colours;
  const paid = draft !== null;
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
      // A colour pair chosen here replaces the system colours.
      setSystemColorsEnabled(false);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="settings-section person-colours-settings"
      aria-labelledby="person-colours-title"
    >
      <h2 id="person-colours-title">{t('personColours.title')}</h2>
      <p className="settings-section-intro">{t('personColours.help')}</p>
      <SystemColorsOverrideNote />
      <button
        type="button"
        className="design-palette-trigger"
        aria-labelledby="person-colours-title person-colours-value"
        aria-haspopup="dialog"
        ref={opener}
        onClick={() => {
          setDraft(colours);
          setSaved(false);
          setError(null);
          state.inspectCapability();
          setOpen(true);
        }}
      >
        <Swatches own={current.own} partner={current.partner} />
        <span id="person-colours-value">
          {label(colours)}
          {colours !== null ? (
            <>
              {' '}
              <ProMark label={t('personColours.pro')} />
            </>
          ) : null}
        </span>
      </button>
      {saved && !open ? <p role="status">{t('personColours.saved')}</p> : null}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('personColours.choices')}
        closeLabel={t('common.close')}
        className="person-colours-sheet"
        restoreFocusRef={opener}
        isCloseBlocked={saving}
        onClose={() => setOpen(false)}
        footer={
          <div className="person-colours-footer">
            {capability.isFetching ? (
              <p role="status">{t('personColours.proLoading')}</p>
            ) : null}
            {capability.error ? (
              <div role="status">
                <p>{t('personColours.proUnavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void capability.refetch()}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : null}
            {error ? (
              <p role="alert">
                {t(
                  denied
                    ? 'personColours.denied'
                    : clientProblemKind(error) === 'offline'
                      ? 'personColours.offline'
                      : 'personColours.saveError',
                )}
              </p>
            ) : null}
            {saved ? <p role="status">{t('personColours.saved')}</p> : null}
            {paid && free && changed ? (
              <button
                type="button"
                onClick={() =>
                  sheet.current?.closeForNavigation(() =>
                    navigate(proPaywallPath()),
                  )
                }
              >
                {t('personColours.discover')}
              </button>
            ) : (
              <button
                type="button"
                disabled={!changed || saving || !canSave}
                aria-busy={saving}
                onClick={() => void save()}
              >
                {t(
                  saving
                    ? 'common.saving'
                    : changed
                      ? 'common.save'
                      : 'personColours.selected',
                )}
              </button>
            )}
          </div>
        }
      >
        <p className="person-colours-hint">{t('personColours.order')}</p>
        <PersonColourChoice
          value={draft}
          disabled={saving}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
            setError(null);
          }}
        />
      </ShortTaskSheet>
    </section>
  );
}
