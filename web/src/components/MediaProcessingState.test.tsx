// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { VideoTransfer } from '../client/backgroundVideoUploads';
import video from '../i18n/locales/video';
import { MediaProcessingState } from './MediaProcessingState';

const observation = vi.hoisted(() => ({
  transfer: undefined as VideoTransfer | undefined,
}));
vi.mock('../client/backgroundVideoUploads', () => ({
  useVideoTransfer: () => observation.transfer,
}));
afterEach(() => {
  cleanup();
  observation.transfer = undefined;
});

it('announces accepted bytes as processing while the parent status catches up', () => {
  observation.transfer = {
    attachmentId: 'video',
    phase: 'uploading',
    progress: 63,
  };
  const view = render(
    <MediaProcessingState status="PENDING" attachmentId="video" />,
  );
  expect(screen.getByRole('status').textContent).toContain(video.uploading);
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('63');
  observation.transfer = {
    ...observation.transfer,
    phase: 'processing',
    progress: 100,
  };
  view.rerender(<MediaProcessingState status="PENDING" attachmentId="video" />);
  expect(screen.getByRole('status').textContent).toContain(video.processing);
  expect(screen.getByRole('status').textContent).not.toContain(video.uploading);
  expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
  expect(screen.getByRole('status').textContent).not.toContain('100');
});

it('keeps unknown progress indeterminate and exposes interruption without claiming a failed saved video', () => {
  const view = render(
    <MediaProcessingState status="PENDING" attachmentId="video" />,
  );
  expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
  observation.transfer = {
    attachmentId: 'video',
    phase: 'failed',
    progress: 63,
  };
  view.rerender(<MediaProcessingState status="PENDING" attachmentId="video" />);
  expect(screen.getByText(video.uploadInterrupted)).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  view.rerender(
    <MediaProcessingState status="PROCESSING" attachmentId="video" />,
  );
  expect(screen.getByRole('status').textContent).toContain(video.processing);
});
