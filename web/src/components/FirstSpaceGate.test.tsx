// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { ResponseError } from '../api/generated/runtime';
import de from '../i18n/locales/de';
import { FirstSpaceGate } from './FirstSpaceGate';

describe('FirstSpaceGate', () => {
  const apiBaseUrl = 'https://cloud.eimir.invalid';
  const accessToken = 'test-token-123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders eyebrow, title, description, and creation button', () => {
    render(
      <FirstSpaceGate
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onSpaceReady={vi.fn()}
      />,
    );

    expect(
      screen.getByText(de.spaceContext.createFirstSpaceEyebrow),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', {
        name: de.spaceContext.createFirstSpaceTitle,
      }),
    ).toBeDefined();
    expect(
      screen.getByText(de.spaceContext.createFirstSpaceBody),
    ).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: de.spaceContext.createFirstSpaceSubmit,
      }),
    ).toBeDefined();
  });

  it('creates first space and invokes onSpaceReady', async () => {
    const onSpaceReady = vi.fn().mockResolvedValue(undefined);
    const createSpy = vi
      .spyOn(SpacesApi.prototype, 'createSpaceApiV1SpacesPost')
      .mockResolvedValue({
        id: 'space-new',
        createdAt: new Date(),
        partners: [],
      });

    render(
      <FirstSpaceGate
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onSpaceReady={onSpaceReady}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: de.spaceContext.createFirstSpaceSubmit,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
      expect(onSpaceReady).toHaveBeenCalled();
    });
  });

  it('converges directly to onSpaceReady if account already has active space (409)', async () => {
    const onSpaceReady = vi.fn().mockResolvedValue(undefined);
    const response = new Response(
      JSON.stringify({
        code: 'ACCOUNT_HAS_ACTIVE_SPACE',
        detail: 'Account already has an active space',
        status: 409,
        title: 'Conflict',
        type: 'about:blank',
      }),
      { status: 409, headers: { 'content-type': 'application/problem+json' } },
    );
    vi.spyOn(
      SpacesApi.prototype,
      'createSpaceApiV1SpacesPost',
    ).mockRejectedValue(new ResponseError(response));

    render(
      <FirstSpaceGate
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onSpaceReady={onSpaceReady}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: de.spaceContext.createFirstSpaceSubmit,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSpaceReady).toHaveBeenCalled();
    });
  });

  it('does not converge to onSpaceReady on other 409 conflict and shows problem state', async () => {
    const onSpaceReady = vi.fn().mockResolvedValue(undefined);
    const response = new Response(
      JSON.stringify({
        code: 'OTHER_CONFLICT',
        detail: 'Concurrent space creation in progress',
        status: 409,
        title: 'Conflict',
        type: 'about:blank',
      }),
      { status: 409, headers: { 'content-type': 'application/problem+json' } },
    );
    vi.spyOn(
      SpacesApi.prototype,
      'createSpaceApiV1SpacesPost',
    ).mockRejectedValue(new ResponseError(response));

    render(
      <FirstSpaceGate
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onSpaceReady={onSpaceReady}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: de.spaceContext.createFirstSpaceSubmit,
    });
    fireEvent.click(submitBtn);

    const retryBtn = await screen.findByRole('button', {
      name: de.common.retry,
    });
    expect(retryBtn).toBeDefined();
    expect(onSpaceReady).not.toHaveBeenCalled();
  });

  it('shows problem state on server error and allows retry', async () => {
    const onSpaceReady = vi.fn().mockResolvedValue(undefined);
    const response = new Response(
      JSON.stringify({
        code: 'INTERNAL_ERROR',
        detail: 'Internal server error',
        status: 500,
        title: 'Server Error',
        type: 'about:blank',
      }),
      { status: 500, headers: { 'content-type': 'application/problem+json' } },
    );
    const createSpy = vi
      .spyOn(SpacesApi.prototype, 'createSpaceApiV1SpacesPost')
      .mockRejectedValueOnce(new ResponseError(response))
      .mockResolvedValueOnce({
        id: 'space-new',
        createdAt: new Date(),
        partners: [],
      });

    render(
      <FirstSpaceGate
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onSpaceReady={onSpaceReady}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: de.spaceContext.createFirstSpaceSubmit,
    });
    fireEvent.click(submitBtn);

    // Problem state appears with retry button
    const retryBtn = await screen.findByRole('button', {
      name: de.common.retry,
    });
    expect(retryBtn).toBeDefined();

    // Click retry
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(onSpaceReady).toHaveBeenCalled();
    });
  });
});
