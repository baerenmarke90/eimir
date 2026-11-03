// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { insertMedia, PhotoArrangeTask } from './PhotoArrangeTask';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const items = ['first', 'second', 'third'].map((key) => ({
  key,
  name: `${key}.jpg`,
  preview: <span>{key}</span>,
  isSensitive: false,
}));

it('inserts rather than swaps while preserving stable media identities', () => {
  expect(insertMedia(['first', 'second', 'third'], 'third', 0)).toEqual([
    'third',
    'first',
    'second',
  ]);
  expect(insertMedia(['first', 'second'], 'first', 1)).toEqual([
    'second',
    'first',
  ]);
});

it('keeps single-pointer changes local until Finish and preserves selection focus', async () => {
  const finish = vi.fn();
  const close = vi.fn();
  render(
    <MemoryRouter>
      <PhotoArrangeTask items={items} onFinish={finish} onClose={close} />
    </MemoryRouter>,
  );
  const dialog = screen.getByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: /^Foto .*third.jpg/,
      pressed: false,
    }),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: i18n.t('experiences.first') }),
  );
  expect(finish).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole('listitem')[0].textContent).toContain(
    'third',
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: i18n.t('experiences.finish') }),
  );
  await vi.waitFor(() =>
    expect(finish).toHaveBeenCalledExactlyOnceWith([
      'third',
      'first',
      'second',
    ]),
  );
});

it('cancel does not publish a locally changed order', () => {
  const finish = vi.fn();
  const close = vi.fn();
  render(
    <MemoryRouter>
      <PhotoArrangeTask items={items} onFinish={finish} onClose={close} />
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('experiences.last') }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('experiences.cancel') }),
  );
  expect(finish).not.toHaveBeenCalled();
});
