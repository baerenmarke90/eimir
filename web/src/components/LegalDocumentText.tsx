import { type ComponentProps, useEffect, useState } from 'react';
import { registerDeferredModule } from '../deferredModules';
import { useTranslation } from '../i18n';
import type { LegalDocumentContent } from './LegalDocumentContent';
import { UiState } from './UiState';

type LegalDocumentContentModule = typeof import('./LegalDocumentContent');

let loaded: LegalDocumentContentModule | null = null;
let pending: Promise<LegalDocumentContentModule> | null = null;

/**
 * Load the legal texts, which stay out of the startup bundle. Surfaces that
 * offer a legal link call this when they appear, so the text is ready, and
 * kept by the service worker for offline reading, before anyone opens it.
 */
export function preloadLegalDocumentContent(): Promise<LegalDocumentContentModule> {
  pending ??= import('./LegalDocumentContent').then((module) => {
    loaded = module;
    return module;
  });
  return pending;
}

registerDeferredModule(preloadLegalDocumentContent);

/**
 * A legal text from the on-demand chunk. A loaded chunk renders in the same
 * frame; otherwise a quiet loading state shows until the text arrives. A failed
 * load, possible only when the chunk was never fetched and the device is
 * offline, shows the offline state instead of reaching the app error boundary.
 * Browsers keep a failed module import for the page's lifetime, so its retry
 * reloads the page.
 */
export function LegalDocumentText(
  props: ComponentProps<typeof LegalDocumentContent>,
) {
  const { t } = useTranslation();
  const [module, setModule] = useState(loaded);
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Loads once; a loaded module never changes.
  useEffect(() => {
    if (module) return;
    let active = true;
    preloadLegalDocumentContent().then(
      (next) => {
        if (active) setModule(next);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (module) return <module.LegalDocumentContent {...props} />;
  if (failed) {
    return (
      <UiState
        kind="offline"
        compact
        title={t('states.offline.title')}
        body={t('states.offline.body')}
        action={
          <button
            type="button"
            className="secondary"
            onClick={() => window.location.reload()}
          >
            {t('common.retry')}
          </button>
        }
      />
    );
  }
  return <UiState kind="loading" compact title={t('states.loading.title')} />;
}
