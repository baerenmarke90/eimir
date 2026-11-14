import { useMemo } from 'react';
import { resolvedLocale, useTranslation } from '../i18n';
import './RediscoveryWording.css';
import {
  type RediscoveryOptions,
  type RediscoverySource,
  type RediscoveryWording,
  rediscoveryWording,
} from './rediscoverySelection';

/**
 * Memoized wording for one rediscovery card. Inputs are plain values, so a
 * re-render with the same card and day yields the same text.
 */
export function useRediscoveryWording(
  source: RediscoverySource | null,
  options: RediscoveryOptions,
): RediscoveryWording | null {
  const { t, i18n } = useTranslation();
  const locale = resolvedLocale();
  const context = source?.context ?? null;
  const exclude = (options.exclude ?? []).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: inputs are spelled out as primitives so equal cards never recompute.
  return useMemo(
    () => (source ? rediscoveryWording(source, options, t, locale) : null),
    [
      source?.cardKey,
      source?.day,
      source?.authoredHeadline,
      context?.placeName,
      context?.chapterTitle,
      context?.tag,
      context?.excerpt,
      context?.excerptTruncated,
      context?.photoCount,
      context?.videoCount,
      context?.partOfDay,
      options.today,
      exclude,
      locale,
      i18n.language,
    ],
  );
}

/**
 * The quiet line under a rediscovery headline: the variant (for titled
 * entries) followed by the date, which never breaks inside itself.
 */
export function RediscoverySecondaryLine({
  variantLine,
  date,
  dateTime,
  className,
  timeClassName,
}: {
  variantLine: string | null;
  date: string | null;
  dateTime?: string;
  className?: string;
  timeClassName?: string;
}) {
  const { t } = useTranslation();
  if (!variantLine && !date) return null;
  return (
    <span
      className={['rediscovery-secondary', className].filter(Boolean).join(' ')}
    >
      {variantLine ? (
        <span className="rediscovery-variant">{variantLine}</span>
      ) : null}
      {variantLine && date ? (
        <span aria-hidden="true">{t('rediscovery.separator')}</span>
      ) : null}
      {date ? (
        <time
          className={['rediscovery-date', timeClassName]
            .filter(Boolean)
            .join(' ')}
          dateTime={dateTime}
        >
          {date}
        </time>
      ) : null}
    </span>
  );
}
