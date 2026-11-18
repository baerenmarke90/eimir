// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';

afterEach(cleanup);
function controller() {
  return {
    items: [],
    hasPending: false,
    addFiles: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
  };
}

it('keeps device intake reachable when an edited text-only Memory supplies an empty gallery renderer', () => {
  const attachments = controller();
  const view = render(
    <AttachmentDraftPicker
      id="edited-memory"
      attachments={attachments}
      gallery={() => null}
      hasMedia={false}
      presentation="diary"
    />,
  );
  expect(
    screen.getByRole('button', { name: i18n.t('composer.addPhotos') }),
  ).toBeTruthy();
  const inputs = [
    ...view.container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ];
  expect(new Set(inputs.map((input) => input.id)).size).toBe(inputs.length);
  const file = new File(['photo'], 'our-photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(inputs[0], { target: { files: [file] } });
  expect(attachments.addFiles).toHaveBeenCalledWith([file]);
});

it('keeps the single Photo tool functional without external sources and receives page-wide drops once', () => {
  const attachments = controller();
  const open = vi.spyOn(HTMLInputElement.prototype, 'click');
  const view = render(
    <div className="page-composer">
      <p>Our words</p>
      <AttachmentDraftPicker
        id="local-photos"
        attachments={attachments}
        presentation="tools"
        pageWideDrop
        mediaTrigger={(choose) => (
          <button type="button" onClick={choose}>
            Photo
          </button>
        )}
      />
    </div>,
  );
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Photo' }));
  expect(open).toHaveBeenCalledTimes(1);
  const file = new File(['photo'], 'our-photo.jpg', { type: 'image/jpeg' });
  fireEvent.drop(view.container.querySelector('p')!, {
    dataTransfer: { types: ['Files'], files: [file] },
  });
  expect(attachments.addFiles).toHaveBeenCalledExactlyOnceWith([file]);
  open.mockRestore();
});
