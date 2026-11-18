// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { isAndroidApp } from '../client/config';
import { openNativePlanCalendar } from '../client/nativePlanCalendar';
import copy from '../i18n/locales/calendarPlan';
import { PlanCalendarAction } from './PlanCalendarAction';

vi.mock('../client/config', () => ({ isAndroidApp: vi.fn() }));
vi.mock('../client/nativePlanCalendar', () => ({
  openNativePlanCalendar: vi.fn(),
}));
const plan = {
  id: 'plan',
  spaceId: 'space',
  title: 'Our day',
  description: 'A quiet day',
  plannedOn: new Date('2028-02-29'),
  plannedStart: null,
  plannedEnd: null,
  updatedAt: new Date('2026-10-31T12:30:00Z'),
  version: 3,
} as PlanDetail;
const create = vi.fn(() => 'blob:calendar');
const revoke = vi.fn();
const share = vi.fn();
const canShare = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAndroidApp).mockReturnValue(false);
  vi.mocked(openNativePlanCalendar).mockResolvedValue();
  create.mockReturnValue('blob:calendar');
  share.mockResolvedValue(undefined);
  canShare.mockReturnValue(false);
  vi.stubGlobal('navigator', { canShare, share });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('browser calendar handoff', () => {
  it('offers a real download and releases its resource on return', async () => {
    const view = render(<PlanCalendarAction plan={plan} />);
    const link = await screen.findByRole('link', { name: copy.add });
    expect(link.getAttribute('href')).toBe('blob:calendar');
    expect(link.getAttribute('download')).toBe('eimir-plan-plan.ics');
    expect(fireEvent.click(link)).toBe(true);
    expect(share).not.toHaveBeenCalled();
    view.unmount();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:calendar');
  });
  it('shares a calendar file when supported', async () => {
    canShare.mockReturnValue(true);
    render(<PlanCalendarAction plan={plan} />);
    const link = await screen.findByRole('link', { name: copy.add });
    await act(async () => {
      expect(fireEvent.click(link)).toBe(false);
    });
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe('eimir-plan-plan.ics');
    expect(file.type).toBe('text/calendar;charset=utf-8');
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('uses the download when capability probing throws', async () => {
    canShare.mockImplementation(() => {
      throw new TypeError('Unsupported file');
    });
    render(<PlanCalendarAction plan={plan} />);
    expect(
      fireEvent.click(await screen.findByRole('link', { name: copy.add })),
    ).toBe(true);
    expect(share).not.toHaveBeenCalled();
  });
  it('keeps cancellation quiet but offers recovery after a share failure', async () => {
    canShare.mockReturnValue(true);
    share
      .mockRejectedValueOnce({ name: 'AbortError' })
      .mockRejectedValueOnce(new Error('Unavailable'));
    render(<PlanCalendarAction plan={plan} />);
    const link = await screen.findByRole('link', { name: copy.add });
    await act(async () => {
      fireEvent.click(link);
    });
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      fireEvent.click(link);
    });
    expect(screen.getByRole('status').textContent).toBe(copy.shareFailed);
    expect(
      screen
        .getByRole('link', { name: copy.download })
        .getAttribute('download'),
    ).toBe('eimir-plan-plan.ics');
  });
  it('prevents a second share while the first is open', async () => {
    canShare.mockReturnValue(true);
    let complete!: () => void;
    share.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    render(<PlanCalendarAction plan={plan} />);
    const link = await screen.findByRole('link', { name: copy.add });
    fireEvent.click(link);
    expect(fireEvent.click(link)).toBe(false);
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    expect(link.getAttribute('aria-busy')).toBe('false');
  });
});

describe('Android calendar handoff', () => {
  beforeEach(() => vi.mocked(isAndroidApp).mockReturnValue(true));
  it('opens the editor without depending on a blob or Web Share support', async () => {
    create.mockImplementation(() => {
      throw new Error('WebView downloads unavailable');
    });
    render(<PlanCalendarAction plan={plan} location="At the lake" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.add }));
    });
    expect(openNativePlanCalendar).toHaveBeenCalledExactlyOnceWith({
      title: plan.title,
      description: plan.description,
      location: 'At the lake',
      allDay: true,
      startTime: Date.parse('2028-02-29T00:00:00Z'),
      endTime: Date.parse('2028-03-01T00:00:00Z'),
    });
    expect(create).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it.each([
    ['NO_CALENDAR_APP', copy.noCalendarApp],
    ['CALENDAR_UPDATE_REQUIRED', copy.updateRequired],
    ['CALENDAR_UNAVAILABLE', copy.openFailed],
  ])(
    'offers localized recovery for %s and allows a deliberate retry',
    async (code, message) => {
      vi.mocked(openNativePlanCalendar).mockRejectedValueOnce({ code });
      render(<PlanCalendarAction plan={plan} />);
      const button = screen.getByRole('button', { name: copy.add });
      await act(async () => {
        fireEvent.click(button);
      });
      expect(screen.getByRole('status').textContent).toBe(message);
      await act(async () => {
        fireEvent.click(button);
      });
      expect(screen.queryByRole('status')).toBeNull();
    },
  );
  it('prevents duplicate editor launches', async () => {
    let complete!: () => void;
    vi.mocked(openNativePlanCalendar).mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    render(<PlanCalendarAction plan={plan} />);
    const button = screen.getByRole('button', { name: copy.add });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(openNativePlanCalendar).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => complete());
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
it('does not offer an undated plan as an invented appointment', () => {
  render(<PlanCalendarAction plan={{ ...plan, plannedOn: null }} />);
  expect(screen.queryByText(copy.add)).toBeNull();
});
