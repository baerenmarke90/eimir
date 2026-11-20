import { useQuery } from '@tanstack/react-query';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import type { RecapView } from '../api/generated/models/RecapView';
import { normalizeClientError } from '../client/problemDetails';
import { monthlyRecapInvitation, recapPeriodLabel } from '../client/recaps';
import { recapDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { prefersReducedMotion } from '../motion/reducedMotion';
import { useRecapInvitationReceipt } from './MonthlyRecapInvitation';
import { RecapMedia, type RecapMediaProps } from './RecapMedia';

/** Read-only discovery for Momente: the same edition Wir would invite to. */
export function useDiscoverRecapEdition({
  api,
  accountId,
  spaceId,
  today,
}: {
  api?: RecapsApi;
  accountId: string;
  spaceId: string;
  today: Date;
}): RecapView | undefined {
  const query = useQuery({
    queryKey: ['recap-entry', accountId, spaceId],
    enabled: Boolean(api),
    queryFn: async ({ signal }) => {
      if (!api) throw new Error('Recap discovery is unavailable.');
      try {
        return await api.getRecapOverview(
          { spaceId, kind: 'MONTH' },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  return query.isError || !query.data
    ? undefined
    : monthlyRecapInvitation(query.data.editions, today);
}

// Per page session: the card grows in once per edition, and after it was
// opened it leaves with a short collapse when Discover is shown again.
const announcedEditions = new Set<string>();
let leavingEdition: string | null = null;

/**
 * A temporary photo lead above the Discover experiences (#1907 F4). It shows
 * only while the monthly edition Wir would invite to is still unopened, so
 * Discover keeps a calm list the rest of the month.
 */
export function RecapDiscoverLead({
  api,
  today,
  onOpen,
  ...media
}: RecapMediaProps & {
  api?: RecapsApi;
  today: Date;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const { t } = useTranslation();
  const edition = useDiscoverRecapEdition({
    api,
    accountId: media.account.id,
    spaceId: media.spaceId,
    today,
  });
  const receipt = useRecapInvitationReceipt(media, edition);
  const [left, setLeft] = useState(false);
  // The first visible render decides whether this mount plays the entrance.
  const firstShown = useRef<string | null>(null);
  if (edition && receipt.visible && firstShown.current === null)
    firstShown.current = announcedEditions.has(edition.id) ? '' : edition.id;
  const shownId = edition && receipt.visible ? edition.id : null;
  useEffect(() => {
    if (shownId) announcedEditions.add(shownId);
  }, [shownId]);
  const leavingNow =
    edition !== undefined &&
    !receipt.visible &&
    !left &&
    leavingEdition === edition.id;
  // The collapse is a transition (Replace `disclose`, Motion Contract 4.2):
  // the card first renders open, and one frame later it collapses. It
  // normally ends with transitionend; never leave a stale card behind if
  // that event is skipped (hidden tab, interrupted transition).
  const [collapsing, setCollapsing] = useState(false);
  useEffect(() => {
    if (!leavingNow) return;
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => setCollapsing(true));
    });
    const timer = window.setTimeout(() => {
      leavingEdition = null;
      setLeft(true);
    }, 1_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [leavingNow]);
  if (!edition) return null;
  const leaving = leavingNow && !prefersReducedMotion();
  if (!receipt.visible && !leaving) return null;
  const entering = receipt.visible && firstShown.current === edition.id;
  const cover = edition.sources.find(
    (source) => source.available && source.previewAttachmentId,
  );
  const path = `${recapDetailPath(edition.id)}?play=1`;
  const badge = (
    <span className="recap-lead-badge">{t('recaps.discoverNew')}</span>
  );
  return (
    <div
      className={`recap-lead${entering ? ' is-entering' : ''}${leaving ? ' is-leaving' : ''}${leaving && collapsing ? ' is-collapsing' : ''}`}
      onTransitionEnd={(event) => {
        if (
          !leaving ||
          event.target !== event.currentTarget ||
          event.propertyName !== 'grid-template-rows'
        )
          return;
        leavingEdition = null;
        setLeft(true);
      }}
    >
      <div className="recap-lead-frame">
        <Link
          className={`recap-lead-card${cover ? ' has-photo' : ''}`}
          to={path}
          inert={leaving || undefined}
          onClick={(event) => {
            receipt.consume();
            leavingEdition = edition.id;
            onOpen(event, path);
          }}
        >
          {cover ? (
            <span className="recap-lead-photo">
              <RecapMedia {...media} source={cover} />
              {badge}
            </span>
          ) : null}
          <span className="recap-lead-body">
            {cover ? null : badge}
            <span className="recap-lead-copy">
              <strong>{recapPeriodLabel(edition, resolvedLocale())}</strong>
              <span>{t('recaps.shortTitle')}</span>
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
