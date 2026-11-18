import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PlanCalendarEvent } from './planCalendar';

interface PlanCalendarPlugin {
  openEvent(event: PlanCalendarEvent): Promise<void>;
}

const calendar = registerPlugin<PlanCalendarPlugin>('PlanCalendar');

export async function openNativePlanCalendar(
  event: PlanCalendarEvent,
): Promise<void> {
  if (!Capacitor.isPluginAvailable('PlanCalendar'))
    throw Object.assign(new Error('Calendar bridge requires an app update'), {
      code: 'CALENDAR_UPDATE_REQUIRED',
    });
  await calendar.openEvent(event);
}
