import { useState } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { planCalendar } from '../client/planCalendar';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

export function PlanCalendarAction({
  plan,
  location,
}: {
  plan: PlanDetail;
  location?: string;
}) {
  const { t } = useTranslation();
  const [shareError, setShareError] = useState(false);
  const content = planCalendar(plan, location);
  const file = content
    ? new File([content], `eimir-plan-${plan.id}.ics`, {
        type: 'text/calendar;charset=utf-8',
      })
    : null;
  const resource = useObjectUrlResource(
    `plan-calendar:${plan.spaceId}`,
    content,
    async () =>
      new Blob([content ?? ''], { type: 'text/calendar;charset=utf-8' }),
  );
  if (!content || !file) return null;
  return (
    <div className="plan-calendar-action">
      {resource.url ? (
        <a
          className="button secondary"
          href={resource.url}
          download={file.name}
          onClick={(event) => {
            if (navigator.canShare?.({ files: [file] })) {
              event.preventDefault();
              void navigator
                .share({ files: [file] })
                .catch((error: unknown) => {
                  if (
                    !(
                      error instanceof DOMException &&
                      error.name === 'AbortError'
                    )
                  )
                    setShareError(true);
                });
            }
          }}
        >
          <EimirIcon name="kalender" />
          {t('calendarPlan.add')}
        </a>
      ) : null}
      {shareError && resource.url ? (
        <a className="tertiary" href={resource.url} download={file.name}>
          {t('calendarPlan.download')}
        </a>
      ) : null}
      <p className="field-help">{t('calendarPlan.copyHint')}</p>
      {resource.error ? (
        <p role="status">{t('calendarPlan.unavailable')}</p>
      ) : null}
    </div>
  );
}
