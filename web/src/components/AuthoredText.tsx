import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LinkPreviewsApi } from '../api/generated/apis/LinkPreviewsApi';
import type { LinkPreviewResult } from '../api/generated/models/LinkPreviewResult';
import { authoredLinks } from '../client/authoredLinks';
import { assertOnlineWrite } from '../client/connectivity';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTranslation } from '../i18n';
import './AuthoredText.css';

function LinkPreview({
  api,
  spaceId,
  url,
  offline,
}: {
  api: LinkPreviewsApi;
  spaceId: string;
  url: string;
  offline: boolean;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const captureOwnership = useTaskActivation(!offline);
  const pending = useRef(false);
  const resultLink = useRef<HTMLAnchorElement>(null);
  const [state, setState] = useState<
    'idle' | 'loading' | 'unavailable' | LinkPreviewResult
  >('idle');
  const host = new URL(url).hostname;
  useEffect(() => {
    if (typeof state === 'object')
      resultLink.current?.focus({ preventScroll: true });
  }, [state]);

  async function resolve() {
    if (pending.current || offline) return;
    const ownsTask = captureOwnership();
    pending.current = true;
    setState('loading');
    try {
      assertOnlineWrite();
      const result = await api.resolveLinkPreview({
        spaceId,
        linkPreviewRequest: { url },
      });
      if (ownsTask()) setState(result.available ? result : 'unavailable');
    } catch {
      if (ownsTask()) setState('unavailable');
    } finally {
      pending.current = false;
    }
  }

  if (offline) return null;
  return (
    <div className="authored-link-preview" aria-busy={state === 'loading'}>
      {typeof state === 'object' ? (
        <>
          <a
            ref={resultLink}
            href={url}
            target="_blank"
            rel="noopener noreferrer external"
          >
            <span className="authored-link-domain">{host}</span>
            <strong>{state.title || host}</strong>
            <span className="sr-only">{t('authoredLinks.external')}</span>
          </a>
          {state.description ? <p>{state.description}</p> : null}
        </>
      ) : (
        <>
          <button
            type="button"
            className="tertiary"
            aria-describedby={hintId}
            disabled={state === 'loading'}
            onClick={() => void resolve()}
          >
            {t(
              state === 'loading'
                ? 'authoredLinks.loading'
                : state === 'unavailable'
                  ? 'authoredLinks.retry'
                  : 'authoredLinks.load',
              { host },
            )}
          </button>
          <p id={hintId} className="authored-link-hint" role="status">
            {t(
              state === 'unavailable'
                ? 'authoredLinks.unavailable'
                : 'authoredLinks.disclosure',
              { host },
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** Plain authored text stays inert; links never turn into HTML or remote images. */
export function AuthoredText({
  text,
  previewApi,
  spaceId,
  scope = '',
  offline = false,
}: {
  text: string;
  previewApi?: LinkPreviewsApi;
  spaceId?: string;
  scope?: string;
  offline?: boolean;
}) {
  const { t } = useTranslation();
  const links = authoredLinks(text);
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const link of links) {
    parts.push(text.slice(offset, link.start));
    parts.push(
      <a
        key={link.start}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer external"
      >
        {text.slice(link.start, link.end)}
        <span className="sr-only">{t('authoredLinks.external')}</span>
      </a>,
    );
    offset = link.end;
  }
  parts.push(text.slice(offset));
  // Bound a dense description/thread and deduplicate repeated links per text.
  const previews = [...new Set(links.map((link) => link.url))]
    .filter((url) => url.startsWith('https://'))
    .slice(0, 3);
  return (
    <>
      <p className="authored-text">{parts}</p>
      {previewApi && spaceId
        ? previews.map((url) => (
            <LinkPreview
              key={JSON.stringify([scope, spaceId, text, url, offline])}
              api={previewApi}
              spaceId={spaceId}
              url={url}
              offline={offline}
            />
          ))
        : null}
    </>
  );
}
