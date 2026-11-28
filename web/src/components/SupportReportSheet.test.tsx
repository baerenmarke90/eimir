// @vitest-environment jsdom
import { onlineManager } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { SupportReportCreate } from '../api/generated/models/SupportReportCreate';
import { ResponseError } from '../api/generated/runtime';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import type { FailureReference } from '../client/failureReference';
import type { SupportReportKind } from '../client/supportReport';
import supportReport from '../i18n/locales/supportReport';
import { SupportReportSheet } from './SupportReportSheet';
import germanUi from '../i18n/locales/de';

const FAILURE: FailureReference = {
  reference: 'PUT:/memories/{id}:network:web',
  requestId: 'req-1',
};
/** What the sheet shows for `FAILURE`: a short code, never the route. */
const FAILURE_SHOWN = 'PUT · network · web';
const CREATED = { id: 'r1', state: 'NEW', createdAt: new Date() };

type Call = { supportReportCreate: SupportReportCreate };

function mockMatchMedia(reducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setup({
  initialKind = 'PROBLEM',
  failure,
  behaviour = async () => CREATED,
}: {
  initialKind?: SupportReportKind;
  failure?: FailureReference;
  behaviour?: (call: Call) => Promise<unknown>;
} = {}) {
  const createSupportReport = vi.fn((call: Call) => behaviour(call));
  const onClose = vi.fn();
  const view = (open: boolean) => (
    <ApiRuntimeProvider
      apiBaseUrl="http://api.example.test"
      accessToken="token"
      accountId="account-1"
    >
      <SupportReportSheet
        open={open}
        onClose={onClose}
        initialKind={initialKind}
        failure={failure}
        api={{ createSupportReport }}
      />
    </ApiRuntimeProvider>
  );
  const rendered = render(view(true));
  return {
    ...rendered,
    createSupportReport,
    onClose,
    rerenderOpen: (open: boolean) => rendered.rerender(view(open)),
  };
}

function sentList(): string[] {
  const list = screen.getByRole('list', { name: supportReport.sentHeading });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

function noteField(kind: SupportReportKind = 'PROBLEM') {
  return screen.getByRole('textbox', { name: supportReport.noteLabel[kind] });
}

function sendButton(name: string = supportReport.send) {
  return screen.getByRole('button', { name });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  mockMatchMedia(true);
  window.localStorage.clear();
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  onlineManager.setOnline(true);
});

describe('SupportReportSheet', () => {
  it('sheet_lists_exactly_what_is_sent', () => {
    setup({ failure: FAILURE });
    expect(
      screen.getByRole('dialog', { name: supportReport.title.PROBLEM }),
    ).toBeTruthy();
    expect(sentList()).toEqual([
      `${supportReport.items.failureLabel}${FAILURE_SHOWN}`,
      supportReport.items.app,
      supportReport.items.device,
      supportReport.items.locale,
      supportReport.items.account,
    ]);
    expect(screen.getByText(supportReport.never)).toBeTruthy();
    // The note field gets the initial focus.
    expect(document.activeElement).toBe(noteField());
  });

  it('failure_line_puts_the_label_above_the_short_code', () => {
    setup({ failure: FAILURE });
    const list = screen.getByRole('list', { name: supportReport.sentHeading });
    const label = list.querySelector('.support-report-failure-label');
    const token = list.querySelector('code.support-report-failure-token');
    expect(label?.textContent).toBe(supportReport.items.failureLabel);
    expect(token?.textContent).toBe(FAILURE_SHOWN);
    // The route template is sent but never shown on the sheet.
    expect(list.textContent).not.toContain(FAILURE.reference);
    expect(list.textContent).not.toContain('/memories');
    // Label first, then the short error code.
    expect(
      label && token
        ? label.compareDocumentPosition(token) &
            Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).toBeTruthy();
  });

  it('problem_from_problem_state_attaches_failure_reference', async () => {
    const { createSupportReport } = setup({ failure: FAILURE });
    fireEvent.change(noteField(), { target: { value: 'Upload hing' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    const body = createSupportReport.mock.calls[0][0].supportReportCreate;
    expect(body.kind).toBe('PROBLEM');
    expect(body.note).toBe('Upload hing');
    expect(body.failure).toEqual(FAILURE);
  });

  it('problem_from_settings_attaches_no_failure', async () => {
    const { createSupportReport } = setup({ initialKind: 'FEEDBACK' });
    fireEvent.click(
      screen.getByRole('radio', { name: supportReport.kinds.PROBLEM }),
    );
    expect(sentList()).not.toContain(
      `${supportReport.items.failureLabel}${FAILURE_SHOWN}`,
    );
    expect(sentList()).toHaveLength(4);
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    const body = createSupportReport.mock.calls[0][0].supportReportCreate;
    expect(body.kind).toBe('PROBLEM');
    expect(body.failure).toBeUndefined();
    expect(body.note).toBeUndefined();
  });

  it('says_that_feedback_carries_no_error_code', () => {
    setup({ failure: FAILURE });
    expect(screen.queryByText(supportReport.feedbackNoCode)).toBeNull();
    fireEvent.click(
      screen.getByRole('radio', { name: supportReport.kinds.FEEDBACK }),
    );
    expect(screen.getByText(supportReport.feedbackNoCode)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('radio', { name: supportReport.kinds.PROBLEM }),
    );
    expect(screen.queryByText(supportReport.feedbackNoCode)).toBeNull();
  });

  it('feedback_requires_text_and_hides_failure_line', async () => {
    const { createSupportReport } = setup({ failure: FAILURE });
    fireEvent.click(
      screen.getByRole('radio', { name: supportReport.kinds.FEEDBACK }),
    );
    expect(
      screen
        .getByRole('radio', { name: supportReport.kinds.FEEDBACK })
        .matches(':checked'),
    ).toBe(true);
    expect(sentList()).toEqual([
      supportReport.items.app,
      supportReport.items.device,
      supportReport.items.locale,
      supportReport.items.account,
    ]);
    const button = sendButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(supportReport.noteRequired)).toBeTruthy();

    fireEvent.change(noteField('FEEDBACK'), { target: { value: '   ' } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(noteField('FEEDBACK'), {
      target: { value: 'Mehr Farben' },
    });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(supportReport.noteRequired)).toBeNull();
    expect(screen.getByText('11 / 2.000')).toBeTruthy();
    await act(async () => {
      fireEvent.click(sendButton());
    });
    const body = createSupportReport.mock.calls[0][0].supportReportCreate;
    expect(body.kind).toBe('FEEDBACK');
    expect(body.failure).toBeUndefined();
  });

  it('send_disabled_while_sending_no_double_submit', async () => {
    let finish: (value: unknown) => void = () => {};
    const { createSupportReport } = setup({
      behaviour: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    fireEvent.change(noteField(), { target: { value: 'Hängt' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    const busy = sendButton(supportReport.sending);
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect((noteField() as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(busy);
      fireEvent.click(busy);
    });
    expect(createSupportReport).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(CREATED);
    });
    expect(
      screen.getByRole('dialog', { name: supportReport.success.title }),
    ).toBeTruthy();
  });

  it('offline_shows_queued_message_and_keeps_note', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      onlineManager.setOnline(false);
    });
    const { createSupportReport } = setup();
    fireEvent.change(noteField(), { target: { value: 'Without network' } });
    expect(screen.getByText(supportReport.offline.title)).toBeTruthy();
    await act(async () => {
      fireEvent.click(sendButton(supportReport.sendLater));
    });
    expect(createSupportReport).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain(
      supportReport.offline.body,
    );
    expect((noteField() as HTMLTextAreaElement).value).toBe('Without network');
    // A queued report can be retried by hand as well.
    expect(sendButton(supportReport.sendNow)).toBeTruthy();
  });

  it('offline_message_sits_below_the_note_without_moving_the_form', async () => {
    setup();
    const status = () => screen.getByRole('status');
    const before = status();
    const kinds = document.querySelector('.support-report-kinds');
    const field = noteField();
    const sent = document.querySelector('.support-report-sent');
    const follows = (a: Node | null, b: Node | null) =>
      Boolean(
        a &&
          b &&
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    // The message slot lies between the note and the list of what is sent.
    expect(follows(kinds, field)).toBe(true);
    expect(follows(field, before)).toBe(true);
    expect(follows(before, sent)).toBe(true);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      onlineManager.setOnline(false);
    });
    fireEvent.change(noteField(), { target: { value: 'Without network' } });
    await act(async () => {
      fireEvent.click(sendButton(supportReport.sendLater));
    });
    // The same live region now speaks; nothing above the note moved.
    expect(status()).toBe(before);
    expect(status().textContent).toContain(supportReport.offline.body);
    expect(follows(noteField(), status())).toBe(true);
  });

  it('rate_limited_shows_honest_message', async () => {
    setup({
      behaviour: () =>
        Promise.reject(new ResponseError(new Response(null, { status: 429 }))),
    });
    fireEvent.change(noteField(), { target: { value: 'Noch einmal' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(screen.getByRole('status').textContent).toContain(
      supportReport.rateLimited,
    );
    expect((noteField() as HTMLTextAreaElement).value).toBe('Noch einmal');
  });

  it('shows an honest failure with a retry', async () => {
    const { createSupportReport } = setup({
      behaviour: () =>
        Promise.reject(new ResponseError(new Response(null, { status: 500 }))),
    });
    fireEvent.change(noteField(), { target: { value: 'Kaputt' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(screen.getByRole('status').textContent).toContain(
      supportReport.failed,
    );
    await act(async () => {
      fireEvent.click(sendButton(germanUi.common.retry));
    });
    expect(createSupportReport).toHaveBeenCalledTimes(2);
  });

  it('no_close_x_but_handle_button_has_accessible_close_name', () => {
    const { onClose } = setup();
    const close = screen.getByRole('button', { name: germanUi.common.close });
    expect(close.querySelector('svg')).toBeNull();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('success_promises_no_answer_and_done_closes_and_clears_the_draft', async () => {
    const { onClose } = setup({ initialKind: 'FEEDBACK' });
    fireEvent.change(noteField('FEEDBACK'), { target: { value: 'Danke!' } });
    await act(async () => {
      fireEvent.click(sendButton());
    });
    const dialog = screen.getByRole('dialog', {
      name: supportReport.success.title,
    });
    expect(dialog.textContent).toContain(supportReport.success.body);
    expect(screen.getByRole('status').textContent).toContain(
      supportReport.success.title,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    // One centered column: the check, the title and the body.
    expect(dialog.classList.contains('support-report-sheet-sent')).toBe(true);
    expect(dialog.querySelector('.support-report-success-mark')).toBeTruthy();
    const done = screen.getByRole('button', {
      name: germanUi.common.done,
    });
    expect(document.activeElement).toBe(done);
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      window.localStorage.getItem('eimir.supportReportDraft.v1.account-1'),
    ).toBeNull();
  });

  it('reduced_motion_has_no_animation_class', () => {
    const { container, rerenderOpen } = setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-presence')).toBe('open');
    expect(document.body.querySelector('[class*="eimir-motion"]')).toBeNull();
    expect(container.querySelector('[class*="eimir-motion"]')).toBeNull();
    rerenderOpen(false);
    // Reduced motion keeps no retained exit phase.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
