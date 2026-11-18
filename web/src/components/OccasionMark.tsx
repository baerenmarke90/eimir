import './OccasionMark.css';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import type { OccasionMatch } from '../client/occasionMatches';
import { usePartnerNickname } from '../client/partnerNickname';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';

/** Lines shown in full; further occasions are counted. */
const VISIBLE_OCCASIONS = 2;

/**
 * Marks revealed in this visit. The one-shot reveal is a greeting, not a
 * loop: returning to the Timeline or reopening the detail shows the line at
 * rest.
 */
const revealedMarks = new Set<string>();

export function occasionMarkText(
  match: OccasionMatch,
  t: TFunction,
  nicknameFor: (accountId: string) => string | null,
): string {
  switch (match.kind) {
    case 'relationship':
      return match.years === 0
        ? t('occasionMarks.relationshipStart')
        : t('occasionMarks.anniversary', { count: match.years, ordinal: true });
    case 'birthday':
      return match.isViewer
        ? t('occasionMarks.ownBirthday')
        : t('occasionMarks.partnerBirthday', {
            name: nicknameFor(match.accountId) || match.displayName,
          });
    default:
      return match.label;
  }
}

function occasionIcon(match: OccasionMatch): EimirIconName {
  if (match.kind === 'birthday') return 'geburtstag';
  if (match.kind === 'relationship') return 'jahrestag';
  return match.type === 'BIRTHDAY'
    ? 'geburtstag'
    : match.type === 'ANNIVERSARY'
      ? 'jahrestag'
      : 'highlights';
}

/**
 * #1907 F2: one quiet line saying the moment happened on one of the couple's
 * occasions. It is real text (also used in the owning card's accessible
 * description); the icon is decorative.
 */
export function OccasionMark({
  matches,
  id,
  revealKey,
}: {
  matches: readonly OccasionMatch[];
  id?: string;
  /** Stable per item; enables the one-shot reveal when first in view. */
  revealKey?: string;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const ref = useRef<HTMLParagraphElement>(null);
  const [reveal, setReveal] = useState<'idle' | 'revealing' | 'done'>('idle');
  const hasMatches = matches.length > 0;

  useEffect(() => {
    const element = ref.current;
    if (
      !hasMatches ||
      !element ||
      !revealKey ||
      revealedMarks.has(revealKey) ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (revealedMarks.has(revealKey)) return;
        revealedMarks.add(revealKey);
        setReveal('revealing');
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMatches, revealKey]);

  if (!hasMatches) return null;
  const visible = matches
    .slice(0, VISIBLE_OCCASIONS)
    .map((match) =>
      occasionMarkText(match, t, (accountId) => nicknameFor(accountId)),
    );
  const remaining = matches.length - visible.length;
  const text = [
    visible.join(' · '),
    remaining > 0 ? t('occasionMarks.more', { count: remaining }) : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <p
      ref={ref}
      id={id}
      className={`occasion-mark${reveal === 'revealing' ? ' occasion-mark-revealing' : ''}`}
      data-occasion-reveal={reveal === 'idle' ? undefined : reveal}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setReveal('done');
      }}
    >
      <EimirIcon name={occasionIcon(matches[0])} />
      <span>{text}</span>
    </p>
  );
}
