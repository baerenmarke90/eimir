import { useMemo, useState } from 'react';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import {
  authorDisplayName,
  authorProfileAttachmentId,
} from '../client/authorPresentation';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import './PersonIdentity.css';

export type PersonIdentitySize = 'small' | 'medium' | 'large';

function firstCharacters(value: string, count: number): string {
  return Array.from(value).slice(0, count).join('');
}

export function personInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return firstCharacters(parts[0], 2).toLocaleUpperCase('de-DE');
  }
  return `${firstCharacters(parts[0], 1)}${firstCharacters(parts.at(-1) ?? '', 1)}`.toLocaleUpperCase(
    'de-DE',
  );
}

export function PersonIdentity({
  displayName,
  imageUrl = null,
  size = 'medium',
  showName = true,
  imageAlt,
  fallbackAlt,
  onImageError,
}: {
  displayName: string;
  imageUrl?: string | null;
  size?: PersonIdentitySize;
  showName?: boolean;
  imageAlt: string;
  fallbackAlt: string;
  onImageError?: () => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const initials = useMemo(() => personInitials(displayName), [displayName]);
  const broken = imageUrl !== null && imageUrl === failedImageUrl;
  const avatarLabel = imageUrl && !broken ? imageAlt : fallbackAlt;

  return (
    <span className="person-identity">
      <span
        className={`person-identity-avatar person-identity-avatar-${size}`}
        role="img"
        aria-label={avatarLabel}
      >
        {imageUrl && !broken ? (
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            onError={() => {
              setFailedImageUrl(imageUrl);
              onImageError?.();
            }}
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </span>
      {showName ? (
        <span className="person-identity-name">{displayName}</span>
      ) : null}
    </span>
  );
}

export function AuthorAvatar({
  author,
  profilesApi,
  spaceId,
  size = 'small',
}: {
  author: {
    id: string;
    displayName: string;
    isFormerMember?: boolean;
    profileAttachmentId?: string | null;
  };
  profilesApi?: ProfilesApi | null;
  spaceId?: string | null;
  size?: PersonIdentitySize;
}) {
  const presentedName = authorDisplayName(author);
  const { avatarUrl } = useProfileAvatarUrl(
    profilesApi,
    spaceId ?? '',
    author.id,
    authorProfileAttachmentId(author),
  );

  return (
    <PersonIdentity
      displayName={presentedName}
      imageUrl={avatarUrl}
      size={size}
      showName={false}
      imageAlt={presentedName}
      fallbackAlt={presentedName}
    />
  );
}
