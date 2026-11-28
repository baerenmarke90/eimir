import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WirDesignId } from '../api/generated/models/WirDesignId';
import {
  ClientProblemError,
  clientProblemKind,
} from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import { setSystemColorsEnabled } from '../client/systemColors';
import {
  DEFAULT_WIR_DESIGN,
  DESIGN_PALETTES,
  isFreeWirDesign,
  useWirDesign,
  WIR_DESIGNS,
  wirDesignLayout,
} from '../client/wirDesign';
import { useTranslation } from '../i18n';
import { ProMark } from './ProMark';
import { SystemColorsOverrideNote } from './SystemColorsOverrideNote';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './WirDesign.css';

/** Decorative code-native previews contain no personal data or invented content. */
function DesignPreview({ design }: { design: WirDesignId }) {
  return (
    <span
      className={`wir-design-preview wir-design-preview-layout-${wirDesignLayout(design) ?? design}`}
      data-design-preview={design}
      aria-hidden="true"
    >
      <span className="wir-design-preview-hero">
        {wirDesignLayout(design) === 'rows' ? (
          <>
            <span className="wir-design-preview-person">
              <i />
              <b />
            </span>
            <span className="wir-design-preview-person">
              <i />
              <b />
            </span>
          </>
        ) : (
          <>
            <span className="wir-design-preview-portraits">
              <i />
              <i />
            </span>
            <span className="wir-design-preview-names" />
          </>
        )}
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
function PaletteSwatches({ design }: { design: WirDesignId }) {
  return (
    <span
      className="design-palette-swatches"
      data-design-preview={design}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

const PALETTE_OPTIONS = [null, ...DESIGN_PALETTES];

export function WirDesignSettings() {
  const state = useWirDesign();
  if (!state) return null;
  return <Settings state={state} />;
}

export function DesignPaletteSettings() {
  const state = useWirDesign();
  if (!state) return null;
  return <Settings state={state} palettePicker />;
}

function Settings({
  state,
  palettePicker = false,
}: {
  state: NonNullable<ReturnType<typeof useWirDesign>>;
  palettePicker?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preference, capability, mutation } = state;
  const current = palettePicker ? state.palette : state.current;
  const titleId = palettePicker ? 'design-palette-title' : 'wir-design-title';
  const paletteOptions =
    state.palette !== null && !DESIGN_PALETTES.includes(state.palette)
      ? [...PALETTE_OPTIONS, state.palette]
      : PALETTE_OPTIONS;
  const options = palettePicker ? paletteOptions : WIR_DESIGNS;
  const choices = t(
    palettePicker ? 'wirDesign.palette.choices' : 'wirDesign.choices',
  );
  const savedMessage = t(
    palettePicker ? 'wirDesign.palette.saved' : 'wirDesign.saved',
  );
  const choiceName = (design: WirDesignId | null) =>
    design === null
      ? t('wirDesign.palette.followDesign')
      : t(`wirDesign.names.${design}`);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const initial = useRef<HTMLInputElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const patch = mutation.variables?.patch;
  const error =
    patch && (palettePicker ? 'paletteId' in patch : 'designId' in patch)
      ? mutation.error
      : null;
  const conflict =
    error instanceof ClientProblemError && error.kind === 'conflict';
  const denied =
    error instanceof ClientProblemError &&
    error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';
  const paid = draft !== null && !isFreeWirDesign(draft);
  const free =
    capability.isSuccess && capability.data === false && !capability.isFetching;
  const canSave =
    !paid ||
    (capability.isSuccess &&
      capability.data === true &&
      !capability.isFetching);
  function openChoices() {
    setDraft(current);
    mutation.reset();
    setSaved(false);
    state.inspectCapability();
    setOpen(true);
  }

  async function save() {
    if (!canSave || conflict || mutation.isPending || draft === current) return;
    setSaved(false);
    try {
      if (palettePicker) {
        await state.savePalette(draft);
        // Design colours chosen here replace the system colours.
        setSystemColorsEnabled(false);
      } else if (draft !== null) await state.save(draft);
      setSaved(true);
    } catch {
      /* Keep the user's draft and the mutation's recovery state. */
    }
  }
  return (
    <section
      className="settings-section wir-design-settings"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>
        {t(palettePicker ? 'wirDesign.palette.title' : 'wirDesign.title')}
      </h2>
      {palettePicker ? <SystemColorsOverrideNote /> : null}
      {palettePicker ? (
        <button
          type="button"
          className="design-palette-trigger"
          aria-labelledby={`${titleId} design-palette-value`}
          aria-haspopup="dialog"
          disabled={preference.isPending || mutation.isPending}
          ref={opener}
          onClick={openChoices}
        >
          <PaletteSwatches design={current ?? state.current} />
          <span id="design-palette-value">{choiceName(current)}</span>
        </button>
      ) : (
        <>
          <p className="settings-section-intro">{t('wirDesign.intro')}</p>
          <button
            type="button"
            className="design-palette-trigger wir-design-trigger"
            aria-labelledby="wir-design-title wir-design-value"
            aria-haspopup="dialog"
            ref={opener}
            onClick={openChoices}
          >
            <DesignPreview design={state.current} />
            <span className="design-palette-trigger-copy" id="wir-design-value">
              <strong>{choiceName(state.current)}</strong>
              <span>
                {state.current === DEFAULT_WIR_DESIGN ? (
                  t('wirDesign.standard')
                ) : isFreeWirDesign(state.current) ? (
                  t('wirDesign.free')
                ) : (
                  <ProMark label={t('wirDesign.pro')} />
                )}
              </span>
            </span>
          </button>
        </>
      )}
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
      {saved && !open ? <p role="status">{savedMessage}</p> : null}
      <ShortTaskSheet
        ref={sheet}
        open={open}
        title={choices}
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
            {error ? (
              <div role="status">
                <p>
                  {t(
                    conflict
                      ? 'wirDesign.conflict'
                      : denied
                        ? palettePicker
                          ? 'wirDesign.palette.denied'
                          : 'wirDesign.denied'
                        : clientProblemKind(error) === 'offline'
                          ? 'wirDesign.offline'
                          : palettePicker
                            ? 'wirDesign.palette.error'
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
            {saved ? <p role="status">{savedMessage}</p> : null}
            {paid && free && draft !== current ? (
              <button
                type="button"
                onClick={() =>
                  sheet.current?.closeForNavigation(() =>
                    navigate(proPaywallPath()),
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
        <p className="wir-design-personal">
          {t(palettePicker ? 'wirDesign.palette.intro' : 'wirDesign.personal')}
        </p>
        <fieldset className="wir-design-options" disabled={mutation.isPending}>
          <legend className="sr-only">{choices}</legend>
          {options.map((design) => (
            <label
              key={design ?? 'follow-design'}
              className={`wir-design-option${draft === design ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name={palettePicker ? 'design-palette' : 'wir-design'}
                value={design ?? ''}
                ref={current === design ? initial : undefined}
                checked={draft === design}
                onChange={() => {
                  setDraft(design);
                  setSaved(false);
                  if (!conflict) mutation.reset();
                }}
              />
              {palettePicker ? (
                <PaletteSwatches design={design ?? state.current} />
              ) : design !== null ? (
                <DesignPreview design={design} />
              ) : null}
              <span className="wir-design-copy">
                <strong>
                  {choiceName(design)}
                  {design !== null && !isFreeWirDesign(design) ? (
                    <ProMark label={t('wirDesign.pro')} />
                  ) : !palettePicker ? (
                    <span className="wir-design-tier">
                      {design === DEFAULT_WIR_DESIGN
                        ? t('wirDesign.standard')
                        : t('wirDesign.free')}
                    </span>
                  ) : null}
                </strong>
                {!palettePicker && design !== null ? (
                  <span>{t(`wirDesign.descriptions.${design}`)}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      </ShortTaskSheet>
    </section>
  );
}
