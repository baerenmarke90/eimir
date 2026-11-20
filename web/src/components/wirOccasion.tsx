/**
 * Today's occasion for the Wir important-day Moment (#2072). It reuses the
 * occasion matching of `OccasionMark` and the shared occasion queries.
 *
 * Only occasions visible to the viewer qualify (`collectSpaceOccasions`):
 * the relationship start, both partners' birthdays, and shared important
 * dates that are not linked to a related person. Private dates and discreet
 * or surprise plans never surface.
 */
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import {
  type OccasionMatch,
  occasionsOn,
  type SpaceOccasion,
} from '../client/occasionMatches';
import { usePartnerNickname } from '../client/partnerNickname';
import { firstNameFromDisplayName } from '../client/personalName';
import { useSpaceOccasions } from '../client/useSpaceOccasions';
import { useTranslation } from '../i18n';
import { occasionMarkText } from './OccasionMark';
import { localDay, type WirOccasion } from './wirImportantDay';

/** A short non-reversible tag for the occasion key (FNV-1a). */
export function occasionTag(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function primaryCopy(
  match: OccasionMatch,
  t: TFunction,
  nicknameFor: (accountId: string) => string | null,
): string {
  switch (match.kind) {
    case 'relationship':
      return match.years === 0
        ? t('occasionMarks.todayRelationshipStart')
        : t('occasionMarks.todayAnniversary', { count: match.years });
    case 'birthday':
      return match.isViewer
        ? t('occasionMarks.todayOwnBirthday')
        : t('occasionMarks.todayPartnerBirthday', {
            name:
              nicknameFor(match.accountId) ||
              firstNameFromDisplayName(match.displayName, match.displayName),
          });
    default:
      return match.label;
  }
}

/** Today's occasion for Wir: the first by rank, or null. */
export function wirOccasionFor(
  occasions: readonly SpaceOccasion[],
  day: string,
  t: TFunction,
  nicknameFor: (accountId: string) => string | null,
): WirOccasion | null {
  const [year, month, date] = day.split('-').map(Number);
  const match = occasionsOn(
    new Date(Date.UTC(year, month - 1, date)),
    null,
    occasions,
  )[0];
  if (!match) return null;
  return {
    playKey: `${day}|${occasionTag(match.key)}`,
    primary: primaryCopy(match, t, nicknameFor),
    secondary:
      match.kind === 'custom' ? '' : occasionMarkText(match, t, nicknameFor),
    birthday:
      match.kind === 'birthday' ? (match.isViewer ? 'own' : 'partner') : null,
  };
}

export function useWirOccasion(
  spaceId: string | undefined,
  accountId: string | undefined,
): WirOccasion | null {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const occasions = useSpaceOccasions(spaceId, accountId);
  const day = localDay();
  return useMemo(
    () => wirOccasionFor(occasions, day, t, nicknameFor),
    [occasions, day, t, nicknameFor],
  );
}
