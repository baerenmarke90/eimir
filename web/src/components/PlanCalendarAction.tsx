import { useRef, useState } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { isAndroidApp } from '../client/config';
import { openNativePlanCalendar } from '../client/nativePlanCalendar';
import {
  planCalendar,
  planCalendarEvent,
  type PlanCalendarEvent,
} from '../client/planCalendar';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './PlanCalendarAction.css';

function AndroidPlanCalendarAction({ event }: { event: PlanCalendarEvent }) {
  const { t } = useTranslation();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await openNativePlanCalendar(event);
    } catch (failure) {
      const code = (failure as { code?: string } | null)?.code;
      setError(
        code === 'NO_CALENDAR_APP'
          ? 'calendarPlan.noCalendarApp'
          : code === 'CALENDAR_UPDATE_REQUIRED'
            ? 'calendarPlan.updateRequired'
            : 'calendarPlan.openFailed',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="plan-calendar-action">
      <button
        type="button"
        className="button-link secondary"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void open()}
      >
        <EimirIcon name="kalender" />
        {t('calendarPlan.add')}
      </button>
      {error ? <p role="status">{t(error)}</p> : null}
    </div>
  );
}

function BrowserPlanCalendarAction({
  plan,
  location,
}: {
  plan: PlanDetail;
  location?: string;
}) {
  const { t } = useTranslation();
  const [shareError, setShareError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
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
  async function share(calendarFile: File) {
    pending.current = true;
    setBusy(true);
    setShareError(false);
    try {
      await navigator.share({ files: [calendarFile] });
    } catch (failure) {
      if ((failure as { name?: string } | null)?.name !== 'AbortError')
        setShareError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="plan-calendar-action">
      {resource.url ? (
        <a
          className="button-link secondary"
          href={resource.url}
          download={file.name}
          aria-disabled={busy}
          aria-busy={busy}
          onClick={(event) => {
            if (pending.current) {
              event.preventDefault();
              return;
            }
            let canShare = false;
            try {
              canShare =
                typeof navigator.share === 'function' &&
                Boolean(navigator.canShare?.({ files: [file] }));
            } catch {
              // Some browsers expose Web Share but reject this file type.
            }
            if (canShare) {
              event.preventDefault();
              void share(file);
            }
          }}
        >
          <EimirIcon name="kalender" />
          {t('calendarPlan.add')}
        </a>
      ) : null}
      {shareError && resource.url ? (
        <>
          <p role="status">{t('calendarPlan.shareFailed')}</p>
          <a className="tertiary" href={resource.url} download={file.name}>
            {t('calendarPlan.download')}
          </a>
        </>
      ) : null}
      {resource.error ? (
        <p role="status">{t('calendarPlan.unavailable')}</p>
      ) : null}
    </div>
  );
}

export function PlanCalendarAction(props: {
  plan: PlanDetail;
  location?: string;
}) {
  const event = planCalendarEvent(props.plan, props.location);
  if (!event) return null;
  return isAndroidApp() ? (
    <AndroidPlanCalendarAction
      key={`${props.plan.spaceId}:${props.plan.id}`}
      event={event}
    />
  ) : (
    <BrowserPlanCalendarAction
      key={`${props.plan.spaceId}:${props.plan.id}`}
      {...props}
    />
  );
}
