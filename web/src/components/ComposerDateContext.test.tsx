// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import experiences from '../i18n/locales/experiences';
import taskBoundary from '../i18n/locales/taskBoundary';
import {
  ComposerDateContext,
  type ComposerDateContextHandle,
} from './ComposerDateContext';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.matchMedia = (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  window.history.replaceState(
    { key: 'date-context', idx: 0 },
    '',
    '/story/memories/new',
  );
});
afterEach(cleanup);

function Harness({
  submit = vi.fn(),
}: {
  submit?: (values: FormData) => void;
}) {
  const [date, setDate] = useState('2026-11-09');
  const [through, setThrough] = useState('');
  return (
    <>
      <button type="submit" form="capture-date">
        Save
      </button>
      <form
        id="capture-date"
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        <ComposerDateContext
          idPrefix="capture-date-input"
          label="Date"
          value={date}
          onChange={setDate}
          allowRange
          endValue={through}
          onEndChange={setThrough}
        />
      </form>
    </>
  );
}

describe('ComposerDateContext', () => {
  it('keeps native named form values while the picker is closed and submits through an external action', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const form = document.getElementById('capture-date') as HTMLFormElement;
    expect(new FormData(form).get('happenedOn')).toBe('2026-11-09');
    await user.click(screen.getByText('Save'));
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0].get('happenedOn')).toBe('2026-11-09');
  });

  it('adds a range in the existing native sheet and retains it after Done', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /^Date:/ });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Date', { selector: 'input' }),
      {
        target: { value: '2026-11-10' },
      },
    );
    await user.click(
      within(dialog).getByRole('button', { name: experiences.addPeriod }),
    );
    fireEvent.change(within(dialog).getByLabelText(experiences.through), {
      target: { value: '2026-11-12' },
    });
    await user.click(
      within(dialog).getByRole('button', { name: experiences.finish }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const values = new FormData(
      document.getElementById('capture-date') as HTMLFormElement,
    );
    expect(values.getAll('happenedOn')).toEqual(['2026-11-10']);
    expect(values.getAll('happenedUntil')).toEqual(['2026-11-12']);
    expect(trigger.textContent).toContain('10. November 2026');
    expect(trigger.textContent).toContain('12. November 2026');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('intercepts native required-date validation to open and focus the real editable field', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <>
        <button type="submit" form="required-date">
          Save
        </button>
        <form id="required-date" onSubmit={submit}>
          <ComposerDateContext
            idPrefix="required-input"
            formId="required-date"
            label="Date"
            required
          />
        </form>
      </>,
    );
    await user.click(screen.getByText('Save'));
    expect(submit).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Date', { selector: 'input' });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      taskBoundary.invalidDate,
    );
  });

  it('reports an invalid range through the shared handle and never accepts it as complete', async () => {
    const user = userEvent.setup();
    const ref = createRef<ComposerDateContextHandle>();
    render(
      <form>
        <ComposerDateContext
          ref={ref}
          idPrefix="range-input"
          label="Date"
          defaultValue="2026-11-12"
          defaultEndValue="2026-11-09"
          allowRange
        />
      </form>,
    );
    let valid: boolean | undefined;
    act(() => {
      valid = ref.current?.reportValidity();
    });
    expect(valid).toBe(false);
    const dialog = await screen.findByRole('dialog');
    const end = within(dialog).getByLabelText(experiences.through);
    await waitFor(() => expect(document.activeElement).toBe(end));
    expect(within(dialog).getByRole('alert').textContent).toBe(
      experiences.invalidPeriod,
    );
    await user.click(
      within(dialog).getByRole('button', { name: experiences.finish }),
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    await user.click(
      within(dialog).getByRole('button', { name: experiences.removePeriod }),
    );
    act(() => {
      valid = ref.current?.reportValidity();
    });
    expect(valid).toBe(true);
  });

  it('restores uncontrolled backing values on a native form reset', async () => {
    const user = userEvent.setup();
    render(
      <form id="reset-date">
        <ComposerDateContext
          idPrefix="reset-input"
          label="Date"
          defaultValue="2026-11-09"
        />
      </form>,
    );
    const form = document.getElementById('reset-date') as HTMLFormElement;
    await user.click(screen.getByRole('button', { name: /^Date:/ }));
    fireEvent.change(
      within(screen.getByRole('dialog')).getByLabelText('Date', {
        selector: 'input',
      }),
      { target: { value: '2026-12-24' } },
    );
    expect(new FormData(form).get('happenedOn')).toBe('2026-12-24');
    act(() => form.reset());
    expect(new FormData(form).get('happenedOn')).toBe('2026-11-09');
  });

  it('refreshes untouched defaults like an uncontrolled native date input', () => {
    const { rerender } = render(
      <form id="refresh-date">
        <ComposerDateContext
          idPrefix="refresh-input"
          label="Date"
          defaultValue="2026-11-09"
          defaultEndValue="2026-11-10"
          allowRange
        />
      </form>,
    );
    rerender(
      <form id="refresh-date">
        <ComposerDateContext
          idPrefix="refresh-input"
          label="Date"
          defaultValue="2026-11-10"
          defaultEndValue="2026-11-11"
          allowRange
        />
      </form>,
    );
    const data = new FormData(
      document.getElementById('refresh-date') as HTMLFormElement,
    );
    expect(data.get('happenedOn')).toBe('2026-11-10');
    expect(data.get('happenedUntil')).toBe('2026-11-11');
  });

  it('preserves unsaved dates across remote default refreshes and resets deliberately to the latest defaults', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <form id="refresh-dirty-date">
        <ComposerDateContext
          idPrefix="refresh-dirty-input"
          label="Date"
          defaultValue="2026-11-09"
          defaultEndValue="2026-11-10"
          allowRange
        />
      </form>,
    );
    const form = document.getElementById(
      'refresh-dirty-date',
    ) as HTMLFormElement;
    await user.click(screen.getByRole('button', { name: /^Date:/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Date', { selector: 'input' }),
      { target: { value: '2026-11-12' } },
    );
    fireEvent.change(within(dialog).getByLabelText(experiences.through), {
      target: { value: '2026-11-14' },
    });
    await user.click(
      within(dialog).getByRole('button', { name: experiences.finish }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    rerender(
      <form id="refresh-dirty-date">
        <ComposerDateContext
          idPrefix="refresh-dirty-input"
          label="Date"
          defaultValue="2026-11-10"
          defaultEndValue="2026-11-11"
          allowRange
        />
      </form>,
    );
    expect(new FormData(form).get('happenedOn')).toBe('2026-11-12');
    expect(new FormData(form).get('happenedUntil')).toBe('2026-11-14');

    act(() => form.reset());
    expect(new FormData(form).get('happenedOn')).toBe('2026-11-10');
    expect(new FormData(form).get('happenedUntil')).toBe('2026-11-11');
  });
});
