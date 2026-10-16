import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { MemoryPreview } from '../../src/components/MemoryPreview';
import { UiState } from '../../src/components/UiState';
import { VisibilityBadge } from '../../src/components/VisibilityBadge';
import { i18n, useTranslation } from '../../src/i18n';
import '../../src/styles.css';
import '../../src/story-media.css';
import '../../src/theme.css';
import '../../src/design/product-roles.css';
import './product-reference-foundations.css';
import de from './locales/de';

// These deliberately localized synthetic fixtures never enter the product bundle.
i18n.addResourceBundle('de', 'foundationsProof', de);

type Detail = 'photo' | 'thought' | 'private';
type Theme = 'light' | 'dark';

const parameters = new URLSearchParams(window.location.search);
const initialTheme: Theme =
  parameters.get('theme') === 'dark' ? 'dark' : 'light';
const hasPhoto = parameters.get('media') !== 'none';
const longLabels = parameters.get('long') === 'true';
const showOffline = parameters.get('offline') === 'true';
document.documentElement.dataset.theme = initialTheme;

function FoundationsProof() {
  const { t } = useTranslation('foundationsProof');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [themeDraft, setThemeDraft] = useState<Theme>(initialTheme);
  const navigate = useNavigate();
  const location = useLocation();
  const route = location.pathname.slice(1);
  const detail: Detail | null =
    route === 'photo' || route === 'thought' || route === 'private'
      ? route
      : null;
  const [imageAttempts, setImageAttempts] = useState<Record<string, number>>(
    {},
  );
  const [imageFailures, setImageFailures] = useState<Record<string, boolean>>(
    {},
  );
  const [appearanceChanged, setAppearanceChanged] = useState(false);
  const imageRequests = useRef<Record<string, number>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<{ trigger: HTMLElement; scrollY: number } | null>(null);

  const loadImage = useCallback(async (memoryId: string) => {
    // Playwright supplies approved local bytes. No backend or user data is used.
    const request = (imageRequests.current[memoryId] ?? 0) + 1;
    imageRequests.current[memoryId] = request;
    setImageFailures((current) => ({ ...current, [memoryId]: false }));
    try {
      const response = await fetch('/__foundation-proof/cabin-lake.jpg');
      if (!response.ok) throw new Error('Fixture media request failed.');
      const url = URL.createObjectURL(await response.blob());
      if (imageRequests.current[memoryId] === request) {
        setImageFailures((current) => ({ ...current, [memoryId]: false }));
      }
      return url;
    } catch (error) {
      if (imageRequests.current[memoryId] === request) {
        setImageFailures((current) => ({ ...current, [memoryId]: true }));
      }
      throw error;
    }
  }, []);

  function imageRecovery(memoryId: string) {
    if (!imageFailures[memoryId] || !hasPhoto) return null;
    return (
      <UiState
        kind="error"
        compact
        title={t('mediaErrorTitle')}
        body={t('mediaErrorBody')}
        action={
          <button
            type="button"
            className="secondary proof-action"
            onClick={() => {
              setImageFailures((current) => ({
                ...current,
                [memoryId]: false,
              }));
              setImageAttempts((current) => ({
                ...current,
                [memoryId]: (current[memoryId] ?? 0) + 1,
              }));
            }}
          >
            {t('retry')}
          </button>
        }
      />
    );
  }

  useEffect(() => {
    if (detail) {
      window.scrollTo(0, 0);
      detailHeading.current?.focus({ preventScroll: true });
    } else if (origin.current) {
      origin.current.trigger.focus({ preventScroll: true });
      window.scrollTo(0, origin.current.scrollY);
    }
  }, [detail]);

  function rememberOrigin(trigger: HTMLElement) {
    origin.current = { trigger, scrollY: window.scrollY };
  }

  function closeDetail() {
    if (origin.current) navigate(-1);
    else navigate('/', { replace: true });
  }

  function openAppearance() {
    setThemeDraft(theme);
    dialog.current?.showModal();
  }

  function applyAppearance() {
    setTheme(themeDraft);
    document.documentElement.dataset.theme = themeDraft;
    setAppearanceChanged(true);
    dialog.current?.close();
  }

  const photoTitle = t(longLabels ? 'photoLongTitle' : 'photoTitle');
  const detailTitle =
    detail === 'photo'
      ? photoTitle
      : t(detail === 'private' ? 'privateTitle' : 'thoughtTitle');

  return (
    <div className="foundation-proof">
      <main className="proof-page" data-testid="proof-page">
        <div hidden={detail !== null}>
          <h1 className="proof-page-title">{t('pageTitle')}</h1>
          {showOffline ? (
            <UiState
              kind="offline"
              compact
              title={t('offlineTitle')}
              body={t('offlineBody')}
            />
          ) : null}

          <article className="proof-photo-memory" aria-labelledby="photo-title">
            <Link
              className="proof-content-link"
              to="/photo"
              onClick={(event) => rememberOrigin(event.currentTarget)}
              aria-label={t('openPhoto')}
            >
              <figure className="proof-photo" data-testid="photo-composition">
                {hasPhoto ? (
                  <div className="proof-media" data-testid="photo-slot">
                    <MemoryPreview
                      key={imageAttempts['fixture-memory'] ?? 0}
                      memoryId="fixture-memory"
                      attachmentId="fixture-image"
                      loadImage={loadImage}
                    />
                  </div>
                ) : null}
                <figcaption>
                  <h2 id="photo-title" className="proof-personal-heading">
                    {photoTitle}
                  </h2>
                  {!hasPhoto ? (
                    <p className="proof-body">{t('photoBody')}</p>
                  ) : null}
                  <p className="proof-supporting">{t('photoContext')}</p>
                </figcaption>
              </figure>
            </Link>
            <VisibilityBadge
              visibility="SPACE_SHARED"
              customLabel={t('shared')}
            />
            {imageRecovery('fixture-memory')}
          </article>

          <article className="proof-thought" aria-labelledby="thought-title">
            <Link
              className="proof-content-link"
              to="/thought"
              aria-label={t('openThought')}
              onClick={(event) => rememberOrigin(event.currentTarget)}
            >
              <h2 id="thought-title" className="proof-content-heading">
                {t('thoughtTitle')}
              </h2>
              <p className="proof-body">{t('thoughtBody')}</p>
              <p className="proof-supporting">{t('thoughtContext')}</p>
            </Link>
          </article>

          <section className="proof-utility" aria-labelledby="utility-title">
            <h2 id="utility-title" className="proof-section-heading">
              {t('utilityTitle')}
            </h2>
            <button
              type="button"
              className="proof-utility-row"
              onClick={openAppearance}
            >
              <span>
                <span className="proof-row-label">
                  {t(longLabels ? 'appearanceLong' : 'appearance')}
                </span>
                <span className="proof-supporting">{t(theme)}</span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="proof-utility-row"
              onClick={(event) => {
                rememberOrigin(event.currentTarget);
                navigate('/private');
              }}
            >
              <span>
                <span className="proof-row-label">{t('privateEntry')}</span>
                <span className="proof-supporting">{t('privateHint')}</span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            {appearanceChanged ? (
              <p className="proof-success" role="status">
                {t('appearanceChanged')}
              </p>
            ) : null}
          </section>
        </div>

        {detail ? (
          <article className="proof-detail" aria-labelledby="detail-title">
            <button
              type="button"
              className="tertiary proof-back"
              onClick={closeDetail}
            >
              {t('back')}
            </button>
            <h1
              id="detail-title"
              ref={detailHeading}
              tabIndex={-1}
              className="proof-personal-heading"
            >
              {detailTitle}
            </h1>
            <VisibilityBadge
              visibility={detail === 'private' ? 'OWNER_ONLY' : 'SPACE_SHARED'}
              customLabel={detail === 'private' ? t('private') : t('shared')}
            />
            {detail === 'photo' && hasPhoto ? (
              <div className="proof-media proof-media-full">
                <MemoryPreview
                  key={imageAttempts['fixture-detail'] ?? 0}
                  memoryId="fixture-detail"
                  attachmentId="fixture-image"
                  loadImage={loadImage}
                />
              </div>
            ) : null}
            {detail === 'photo' ? imageRecovery('fixture-detail') : null}
            <p className="proof-body">
              {t(
                detail === 'photo'
                  ? 'photoBody'
                  : detail === 'private'
                    ? 'privateBody'
                    : 'thoughtBody',
              )}
            </p>
          </article>
        ) : null}
      </main>

      <dialog
        ref={dialog}
        className="proof-sheet"
        aria-labelledby="appearance-title"
      >
        <header className="proof-sheet-header">
          <h2 id="appearance-title" className="proof-section-heading">
            {t('appearance')}
          </h2>
          <button
            type="button"
            className="tertiary proof-close"
            onClick={() => dialog.current?.close()}
          >
            {t('close')}
          </button>
        </header>
        <p className="proof-body">{t('appearanceHint')}</p>
        <fieldset className="proof-appearance-choice">
          <legend className="proof-supporting">{t('appearanceChoice')}</legend>
          {(['light', 'dark'] as const).map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="appearance"
                value={choice}
                checked={themeDraft === choice}
                onChange={() => setThemeDraft(choice)}
              />
              <span>{t(choice)}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="proof-action"
          onClick={applyAppearance}
        >
          {t('done')}
        </button>
      </dialog>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Foundation proof root is missing.');
createRoot(root).render(
  <HashRouter>
    <FoundationsProof />
  </HashRouter>,
);
