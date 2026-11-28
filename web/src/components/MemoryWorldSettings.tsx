import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  isProMemoryWorld,
  MEMORY_WORLDS,
  type MemoryWorld,
} from '../client/memoryWorld';
import { useMemoryWorld } from '../client/memoryWorldContext';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { haptic } from '../motion/haptics';
import {
  setShowSensitiveInWorlds,
  useShowSensitiveInWorlds,
} from './memoryWorlds/sensitivePreference';
import { WorldArt } from './memoryWorlds/WorldArt';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProMark } from './ProMark';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './MemoryWorldSettings.css';
import './WirDesign.css';

/** Fragment that "Welt wechseln" in Momente › Erinnerungen links to. */
export const MEMORY_WORLD_SETTINGS_ANCHOR = 'erinnerungswelten';

/**
 * Settings > Appearance: Erinnerungswelten (#2283). Each person chooses how
 * Momente › Erinnerungen presents the rediscovery selection. It works like the
 * Wir design and the person colours: a summary with the current world, a sheet
 * with all worlds and an explicit save. Story and Stapel are free; every other
 * world is a Pro presentation choice that stays in effect after Pro ends.
 */
export function MemoryWorldSettings() {
  const state = useMemoryWorld();
  if (!state?.ready) return null;
  return <Settings state={state} />;
}

function TierMark({ world }: { world: MemoryWorld }) {
  const { t } = useTranslation();
  return isProMemoryWorld(world) ? (
    <ProMark label={t('memoryWorldSettings.pro')} />
  ) : (
    <span className="memory-world-tier">{t('memoryWorldSettings.free')}</span>
  );
}

function Settings({
  state,
}: {
  state: NonNullable<ReturnType<typeof useMemoryWorld>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { world, capability } = state;
  const showSensitive = useShowSensitiveInWorlds();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MemoryWorld>(world);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const section = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<HTMLInputElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const name = (id: MemoryWorld) => t(`memoryWorldSettings.worlds.${id}.name`);
  const changed = draft !== world;
  const paid = isProMemoryWorld(draft);
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

  // Reached from "Welt wechseln" in Momente › Erinnerungen.
  useEffect(() => {
    if (location.hash !== `#${MEMORY_WORLD_SETTINGS_ANCHOR}`) return;
    section.current?.scrollIntoView({ block: 'start' });
    opener.current?.focus({ preventScroll: true });
  }, [location.hash]);

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
      ref={section}
      id={MEMORY_WORLD_SETTINGS_ANCHOR}
      className="settings-section memory-world-settings"
      aria-labelledby="memory-world-title"
    >
      <h2 id="memory-world-title">{t('memoryWorldSettings.title')}</h2>
      <p className="settings-section-intro">{t('memoryWorldSettings.help')}</p>
      <button
        type="button"
        className="design-palette-trigger memory-world-trigger"
        aria-labelledby="memory-world-title memory-world-value"
        aria-haspopup="dialog"
        ref={opener}
        onClick={() => {
          setDraft(world);
          setSaved(false);
          setError(null);
          state.inspectCapability();
          setOpen(true);
        }}
      >
        <span className="memory-world-summary-art" aria-hidden="true">
          <WorldArt world={world} />
        </span>
        <span className="design-palette-trigger-copy" id="memory-world-value">
          <strong>{name(world)}</strong>
          <TierMark world={world} />
        </span>
      </button>
      {isProMemoryWorld(world) && free ? (
        <p className="memory-world-note">
          {t('memoryWorldSettings.kept', { name: name(world) })}
        </p>
      ) : null}
      {saved && !open ? (
        <p className="memory-world-note" role="status">
          {t('memoryWorldSettings.saved', { name: name(world) })}
        </p>
      ) : null}
      <PreferenceSwitch
        label={t('memoryWorldSettings.sensitive.label')}
        description={t(
          showSensitive
            ? 'memoryWorldSettings.sensitive.shown'
            : 'memoryWorldSettings.sensitive.hidden',
        )}
        checked={showSensitive}
        onCheckedChange={setShowSensitiveInWorlds}
      />
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={t('memoryWorldSettings.choices')}
        closeLabel={t('memoryWorldSettings.close')}
        className="memory-world-sheet"
        initialFocusRef={initialFocus}
        restoreFocusRef={opener}
        isCloseBlocked={saving}
        onClose={() => setOpen(false)}
        footer={
          <div className="memory-world-footer">
            {capability.isFetching ? (
              <p role="status">{t('memoryWorldSettings.proLoading')}</p>
            ) : null}
            {capability.error ? (
              <div role="status">
                <p>{t('memoryWorldSettings.proUnavailable')}</p>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void capability.refetch()}
                >
                  {t('memoryWorldSettings.retry')}
                </button>
              </div>
            ) : null}
            {error ? (
              <p role="alert">
                {t(
                  denied
                    ? 'memoryWorldSettings.denied'
                    : clientProblemKind(error) === 'offline'
                      ? 'memoryWorldSettings.offline'
                      : clientProblemKind(error) === 'conflict'
                        ? 'memoryWorldSettings.conflict'
                        : 'memoryWorldSettings.saveError',
                )}
              </p>
            ) : null}
            {paid && free && changed ? (
              <>
                <p>{t('memoryWorldSettings.proHint', { name: name(draft) })}</p>
                <button
                  type="button"
                  onClick={() =>
                    sheet.current?.closeForNavigation(() =>
                      navigate(proPaywallPath()),
                    )
                  }
                >
                  {t('memoryWorldSettings.discover')}
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
                  ? t('memoryWorldSettings.saving')
                  : changed
                    ? t('memoryWorldSettings.choose', { name: name(draft) })
                    : t('memoryWorldSettings.selected')}
              </button>
            )}
          </div>
        }
      >
        <p className="memory-world-intro">{t('memoryWorldSettings.intro')}</p>
        <fieldset className="memory-world-grid" disabled={saving}>
          <legend className="sr-only">
            {t('memoryWorldSettings.choices')}
          </legend>
          {MEMORY_WORLDS.map((id) => (
            <label
              key={id}
              className={`memory-world-option${draft === id ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="memory-world"
                value={id}
                ref={world === id ? initialFocus : undefined}
                checked={draft === id}
                onChange={() => {
                  setDraft(id);
                  setSaved(false);
                  setError(null);
                  haptic('threshold');
                }}
              />
              <span className="memory-world-option-art" aria-hidden="true">
                <WorldArt world={id} />
                {world === id ? (
                  <span className="memory-world-option-current">
                    {t('memoryWorldSettings.current')}
                  </span>
                ) : null}
              </span>
              <span className="memory-world-option-head">
                <span className="memory-world-option-name">{name(id)}</span>
                <TierMark world={id} />
              </span>
              <span className="memory-world-option-sentence">
                {t(`memoryWorldSettings.worlds.${id}.sentence`)}
              </span>
            </label>
          ))}
        </fieldset>
      </ShortTaskSheet>
    </section>
  );
}
