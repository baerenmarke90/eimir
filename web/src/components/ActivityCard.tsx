import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { ActivityItem } from '../api/generated/models/ActivityItem';
import { authorDisplayName } from '../client/authorPresentation';
import { engagementTargetPath } from '../client/m4Product';
import { usePartnerNickname } from '../client/partnerNickname';
import { resolvedLocale, useTranslation } from '../i18n';
import { AuthorAvatar } from './PersonIdentity';
import './M4ProductPages.css';

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function ActivityCard({
  item,
  profilesApi,
  spaceId,
  currentAccountId,
  onOpen,
  compact = false,
}: {
  item: ActivityItem;
  profilesApi?: ProfilesApi | null;
  spaceId: string;
  currentAccountId?: string;
  compact?: boolean;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const path = engagementTargetPath(item.targetType, item.targetId);

  const isOwn = Boolean(
    currentAccountId && item.actor?.id === currentAccountId,
  );
  const actorName = isOwn
    ? t('m5s5.activity.you')
    : item.actor
      ? item.actor.isFormerMember
        ? authorDisplayName(item.actor)
        : relationshipLabel(
            item.actor.id,
            item.actor.displayName,
            t('couplePresencePartnerFallback'),
          )
      : undefined;

  const actionText = isOwn
    ? t(`m5s5.activityActionOwn.${item.kind}`)
    : item.actor
      ? t(`m5s5.activityAction.${item.kind}`)
      : t(`m5s5.activityKind.${item.kind}`);

  const inner = (
    <div
      className={`activity-card ${path ? 'activity-card-interactive eimir-motion-lift' : 'activity-card-static'} activity-card-${item.targetType?.toLowerCase() ?? 'unknown'}${compact ? ' activity-card-compact' : ''}`}
    >
      <div className="activity-card-header">
        {item.actor && !compact ? (
          <AuthorAvatar
            author={
              isOwn
                ? { ...item.actor, displayName: t('m5s5.activity.you') }
                : item.actor
            }
            profilesApi={profilesApi}
            spaceId={spaceId}
            size="small"
          />
        ) : null}
        <div className="activity-card-actor-copy">
          <p className="activity-card-title">
            {actorName ? (
              <>
                <strong>{actorName}</strong> {actionText}
              </>
            ) : (
              actionText
            )}
          </p>
          <time
            className="activity-card-date"
            dateTime={item.occurredAt.toISOString()}
          >
            {formatDateTime(item.occurredAt)}
          </time>
        </div>
      </div>
      {item.target?.title ? (
        <div className="activity-card-target">
          <span
            className={`activity-card-target-title${compact ? ' today-recent-tile-title' : ''}`}
          >
            {item.target.title}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <li className="activity-result-wrapper">
      {path ? (
        <Link
          className={`activity-result-link${compact ? ' today-recent-tile' : ''}`}
          to={path}
          onClick={(event) => onOpen?.(event, path)}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
