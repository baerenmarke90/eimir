import { lazy } from 'react';

/**
 * Load the legal texts. Surfaces that offer a legal link call this when they
 * appear, so the text is ready, and kept by the service worker for offline
 * reading, before anyone opens it.
 */
export function preloadLegalDocumentContent() {
  return import('./LegalDocumentContent');
}

export const LazyLegalDocumentContent = lazy(() =>
  preloadLegalDocumentContent().then((module) => ({
    default: module.LegalDocumentContent,
  })),
);
