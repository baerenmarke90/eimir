import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { assertOnlineWrite } from '../client/connectivity';
import { gentleSuggestionKey, useGentleConsent } from '../client/gentlePrompts';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { MEMORY_CREATE_ROUTE, memoryDetailPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './GentleSuggestionCard.css';

/** A single quiet continuation in the existing contextual Wir region. */
export function GentleSuggestionCard({
  account,
  spaceId,
  api,
  featuredMemoryIds = [],
}: {
  account: AccountView;
  spaceId: string;
  api: NotificationsApi;
  featuredMemoryIds?: string[];
}) {
  const { t } = useTranslation();
  const consent = useGentleConsent(account, api);
  const client = useQueryClient();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const queryKey = gentleSuggestionKey(account.id, spaceId);
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const suggestion = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.getGentleSuggestion({ spaceId }, { signal }),
    enabled: consent,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const item = suggestion.data;
  useLayoutEffect(() => {
    if (!item && feedback) feedbackRef.current?.focus({ preventScroll: true });
  }, [item, feedback]);
  const action = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (kind: 'open' | 'dismiss' | 'exclude') => {
      if (!item) return;
      const current = captureAuthorizedQuery(client, queryKey);
      assertOnlineWrite();
      try {
        if (kind === 'open') {
          const opened = await api.openGentleSuggestion({
            spaceId,
            occasionId: item.id,
          });
          if (!active.current || !current()) return;
          const taskOriginKey = captureOrigin();
          client.setQueryData(queryKey, null);
          void navigate(
            opened.kind === 'MEMORY' && opened.memoryId
              ? memoryDetailPath(opened.memoryId)
              : MEMORY_CREATE_ROUTE,
            { state: { taskOriginKey } },
          );
        } else {
          if (kind === 'exclude' && item.memoryId) {
            await api.excludeGentleMemory({ spaceId, memoryId: item.memoryId });
          } else {
            await api.dismissGentleSuggestion({ spaceId, occasionId: item.id });
          }
          if (!active.current || !current()) return;
          setMenuOpen(false);
          client.setQueryData(queryKey, null);
          setFeedback(
            t(
              kind === 'exclude'
                ? 'gentlePrompts.excluded'
                : 'gentlePrompts.dismissed',
            ),
          );
        }
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });

  if (
    !consent ||
    (!item && !feedback) ||
    (item?.memoryId && featuredMemoryIds.includes(item.memoryId)) ||
    (item && item.expiresAt.getTime() <= Date.now())
  )
    return null;

  if (!item)
    return (
      <p
        ref={feedbackRef}
        tabIndex={-1}
        role="status"
        className="gentle-suggestion-feedback"
      >
        {feedback}
      </p>
    );
  const memory = item.kind === 'MEMORY';
  return (
    <section
      className="gentle-suggestion eimir-motion-lift"
      aria-labelledby="gentle-suggestion-title"
    >
      <div className="gentle-suggestion-heading">
        <h2 id="gentle-suggestion-title">
          {t(
            memory ? 'gentlePrompts.memoryTitle' : 'gentlePrompts.writingTitle',
          )}
        </h2>
        {memory ? (
          <button
            ref={trigger}
            type="button"
            className="tertiary"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label={t('gentlePrompts.actions')}
            onClick={() => setMenuOpen(true)}
            disabled={action.isPending}
          >
            <EimirIcon name="overflow" className="inline-icon" />
          </button>
        ) : null}
      </div>
      <p>
        {t(
          memory
            ? 'gentlePrompts.memoryDescription'
            : `gentlePrompts.writing${item.writingVariant}`,
        )}
      </p>
      <div className="gentle-suggestion-actions">
        <button
          type="button"
          className="secondary"
          disabled={action.isPending}
          onClick={() => action.mutate('open')}
        >
          {t(memory ? 'gentlePrompts.rediscover' : 'gentlePrompts.write')}
        </button>
        <button
          type="button"
          className="tertiary"
          disabled={action.isPending}
          onClick={() => action.mutate('dismiss')}
        >
          {t('gentlePrompts.dismiss')}
        </button>
      </div>
      {action.error && !menuOpen ? <ProblemState error={action.error} /> : null}
      <ShortTaskSheet
        open={menuOpen}
        title={t('gentlePrompts.memoryTitle')}
        restoreFocusRef={trigger}
        isCloseBlocked={action.isPending}
        onClose={() => setMenuOpen(false)}
      >
        <p>{t('gentlePrompts.personalHint')}</p>
        <button
          type="button"
          className="secondary"
          disabled={action.isPending}
          onClick={() => action.mutate('exclude')}
        >
          {t('gentlePrompts.exclude')}
        </button>
        {action.error ? <ProblemState error={action.error} /> : null}
      </ShortTaskSheet>
    </section>
  );
}
