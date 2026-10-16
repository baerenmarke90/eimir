import { useTranslation } from '../i18n';

type DemoBannerProps = {
  resetTimerEnabled: boolean;
  resetInterval: string;
};

type ParsedInterval = {
  count: number;
  unitKey: string;
};

function parseResetInterval(raw: string): ParsedInterval | null {
  const match = /^([1-9][0-9]*)([mhd])$/.exec(raw.trim().toLowerCase());
  if (!match) return null;

  const count = Number(match[1]);
  const suffix = match[2];
  const unit = suffix === 'm' ? 'minute' : suffix === 'h' ? 'hour' : 'day';
  return {
    count,
    unitKey: `demo.interval.${unit}${count === 1 ? 'One' : 'Many'}`,
  };
}

export function DemoBanner({
  resetTimerEnabled,
  resetInterval,
}: DemoBannerProps) {
  const { t } = useTranslation();
  const parsedInterval = parseResetInterval(resetInterval);
  const formattedInterval = parsedInterval
    ? `${parsedInterval.count} ${t(parsedInterval.unitKey)}`
    : resetInterval;

  return (
    <div
      className="demo-instance-banner"
      role="note"
      aria-label={t('demo.bannerAria')}
    >
      <strong>{t('demo.bannerTitle')}</strong>
      <span>
        {resetTimerEnabled
          ? t('demo.bannerReset', { interval: formattedInterval })
          : t('demo.bannerResetDisabled')}
      </span>
    </div>
  );
}
