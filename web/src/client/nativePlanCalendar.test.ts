import { beforeEach, expect, it, vi } from 'vitest';
import { openNativePlanCalendar } from './nativePlanCalendar';

const bridge = vi.hoisted(() => ({
  available: vi.fn(),
  openEvent: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: bridge.available },
  registerPlugin: () => ({ openEvent: bridge.openEvent }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  bridge.available.mockReturnValue(true);
  bridge.openEvent.mockResolvedValue(undefined);
});
const event = { title: 'Our day', allDay: false, startTime: 1793476800000 };
it('sends only the explicitly selected event to the native editor', async () => {
  await openNativePlanCalendar(event);
  expect(bridge.available).toHaveBeenCalledWith('PlanCalendar');
  expect(bridge.openEvent).toHaveBeenCalledExactlyOnceWith(event);
});
it('reports an older APK instead of falling back to a broken WebView download', async () => {
  bridge.available.mockReturnValue(false);
  await expect(openNativePlanCalendar(event)).rejects.toMatchObject({
    code: 'CALENDAR_UPDATE_REQUIRED',
  });
  expect(bridge.openEvent).not.toHaveBeenCalled();
});
it('preserves native error codes for localized recovery', async () => {
  bridge.openEvent.mockRejectedValue({ code: 'NO_CALENDAR_APP' });
  await expect(openNativePlanCalendar(event)).rejects.toMatchObject({
    code: 'NO_CALENDAR_APP',
  });
});
