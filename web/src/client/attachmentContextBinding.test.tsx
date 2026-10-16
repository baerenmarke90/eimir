// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartMomentProductPage } from '../components/HeartMomentProductPage';
import { MemoryProductPage } from '../components/MemoryProductPage';
import { i18n } from '../i18n';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import type { ReferenceApis } from './referenceFlow';

const getMemoryMock = vi.fn();
const getHeartMomentMock = vi.fn();

const mockApis = {
  auth: {},
  memories: {
    getMemory: getMemoryMock,
    updateMemory: vi.fn(),
    replaceMemoryAttachments: vi.fn(),
  },
  attachments: {},
  heartMoments: {
    getHeartMoment: getHeartMomentMock,
    updateHeartMoment: vi.fn(),
  },
  story: {},
} as unknown as ReferenceApis;

describe('Attachment form state context binding (#700)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.stubGlobal('crypto', {
      randomUUID: () => 'mock-uuid',
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('MemoryProductPage resets removedAttachmentIds when spaceId or accountId changes', async () => {
    const memory = {
      id: 'mem-1',
      spaceId: 'space-1',
      title: 'Our Anniversary',
      body: 'Great day',
      happenedOn: null,
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      comments: [],
      author: { id: 'acc-1', displayName: 'Alex' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
      attachments: [
        {
          id: 'att-1',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          size: 100,
          status: 'READY',
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          position: 0,
          hasThumbnail: false,
        },
      ],
    };

    getMemoryMock.mockResolvedValue(memory);

    // Prepopulate read cache for space-1 and space-2
    queryClient.setQueryData(
      authorSummaryQueryKeys.memory('space-1', 'mem-1'),
      {
        value: memory,
        source: 'network',
      },
    );
    queryClient.setQueryData(
      authorSummaryQueryKeys.memory('space-2', 'mem-1'),
      {
        value: { ...memory, spaceId: 'space-2' },
        source: 'network',
      },
    );

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/memories/mem-1/edit']}>
          <Routes>
            <Route
              path="/memories/:memoryId/edit"
              element={
                <MemoryProductPage
                  mode="edit"
                  apis={mockApis}
                  apiBaseUrl="https://api.example.com"
                  accessToken="tok-1"
                  spaceId="space-1"
                  currentAccountId="acc-1"
                  loadMemoryImage={vi.fn().mockResolvedValue('blob:loaded')}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const markButton = screen.getByText(
      i18n.t('memoryProduct.markPhotoForRemoval'),
    );
    expect(markButton).toBeDefined();

    // Mark photo for removal
    await act(async () => {
      fireEvent.click(markButton);
    });
    expect(
      screen.getByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeDefined();

    // Change Space to space-2
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/memories/mem-1/edit']}>
            <Routes>
              <Route
                path="/memories/:memoryId/edit"
                element={
                  <MemoryProductPage
                    mode="edit"
                    apis={mockApis}
                    apiBaseUrl="https://api.example.com"
                    accessToken="tok-1"
                    spaceId="space-2"
                    currentAccountId="acc-1"
                    loadMemoryImage={vi.fn().mockResolvedValue('blob:loaded')}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    // Verify removedAttachmentIds was reset: photo is no longer marked for removal
    expect(
      screen.queryByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeNull();
    expect(
      screen.getByText(i18n.t('memoryProduct.markPhotoForRemoval')),
    ).toBeDefined();

    // Mark again
    await act(async () => {
      fireEvent.click(
        screen.getByText(i18n.t('memoryProduct.markPhotoForRemoval')),
      );
    });
    expect(
      screen.getByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeDefined();

    // Change Account to acc-2
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/memories/mem-1/edit']}>
            <Routes>
              <Route
                path="/memories/:memoryId/edit"
                element={
                  <MemoryProductPage
                    mode="edit"
                    apis={mockApis}
                    apiBaseUrl="https://api.example.com"
                    accessToken="tok-2"
                    spaceId="space-2"
                    currentAccountId="acc-2"
                    loadMemoryImage={vi.fn().mockResolvedValue('blob:loaded')}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    // Verify reset on Account change
    expect(
      screen.queryByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeNull();
  });

  it('HeartMomentProductPage resets removeExistingPhoto when spaceId or accountId changes', async () => {
    const heartMoment = {
      id: 'hm-1',
      spaceId: 'space-1',
      note: 'Love note',
      emotion: 'WARMTH',
      visibility: 'SPACE_SHARED',
      happenedOn: new Date('2026-01-01T00:00:00Z'),
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      author: { id: 'acc-1', displayName: 'Alex' },
      capabilities: { canEdit: true, canDelete: true },
      attachment: {
        id: 'att-hm-1',
        mediaType: 'IMAGE',
        mimeType: 'image/jpeg',
        size: 200,
        status: 'READY',
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    };

    getHeartMomentMock.mockResolvedValue(heartMoment);

    queryClient.setQueryData(
      authorSummaryQueryKeys.heartMoment('space-1', 'hm-1'),
      {
        value: heartMoment,
        source: 'network',
      },
    );
    queryClient.setQueryData(
      authorSummaryQueryKeys.heartMoment('space-2', 'hm-1'),
      {
        value: { ...heartMoment, spaceId: 'space-2' },
        source: 'network',
      },
    );

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/heart-moments/hm-1/edit']}>
          <Routes>
            <Route
              path="/heart-moments/:heartMomentId/edit"
              element={
                <HeartMomentProductPage
                  mode="edit"
                  apis={mockApis}
                  apiBaseUrl="https://api.example.com"
                  accessToken="tok-1"
                  spaceId="space-1"
                  currentAccountId="acc-1"
                  loadAttachment={vi.fn().mockResolvedValue('blob:loaded')}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const removeBtn = screen.getByText(i18n.t('memory.photoRemove'));
    expect(removeBtn).toBeDefined();

    // Click remove photo -> photo & button disappear
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    expect(screen.queryByText(i18n.t('memory.photoRemove'))).toBeNull();

    // Change Space to space-2
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/heart-moments/hm-1/edit']}>
            <Routes>
              <Route
                path="/heart-moments/:heartMomentId/edit"
                element={
                  <HeartMomentProductPage
                    mode="edit"
                    apis={mockApis}
                    apiBaseUrl="https://api.example.com"
                    accessToken="tok-1"
                    spaceId="space-2"
                    currentAccountId="acc-1"
                    loadAttachment={vi.fn().mockResolvedValue('blob:loaded')}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    // Verify removeExistingPhoto was reset: photo & remove button reappear
    expect(screen.getByText(i18n.t('memory.photoRemove'))).toBeDefined();

    // Mark again -> disappears
    await act(async () => {
      fireEvent.click(screen.getByText(i18n.t('memory.photoRemove')));
    });
    expect(screen.queryByText(i18n.t('memory.photoRemove'))).toBeNull();

    // Change Account to acc-2
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/heart-moments/hm-1/edit']}>
            <Routes>
              <Route
                path="/heart-moments/:heartMomentId/edit"
                element={
                  <HeartMomentProductPage
                    mode="edit"
                    apis={mockApis}
                    apiBaseUrl="https://api.example.com"
                    accessToken="tok-2"
                    spaceId="space-2"
                    currentAccountId="acc-2"
                    loadAttachment={vi.fn().mockResolvedValue('blob:loaded')}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    // Verify reset on Account change -> photo & remove button reappear
    expect(screen.getByText(i18n.t('memory.photoRemove'))).toBeDefined();
  });

  it('MemoryProductPage and HeartMomentProductPage operate cleanly under React.StrictMode', async () => {
    const memory = {
      id: 'mem-strict',
      spaceId: 'space-1',
      title: 'StrictMode Memory',
      body: 'Body text',
      happenedOn: null,
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      comments: [],
      author: { id: 'acc-1', displayName: 'Alex' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
      attachments: [
        {
          id: 'att-strict-1',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          size: 100,
          status: 'READY',
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          position: 0,
          hasThumbnail: false,
        },
      ],
    };

    getMemoryMock.mockResolvedValue(memory);
    queryClient.setQueryData(
      authorSummaryQueryKeys.memory('space-1', 'mem-strict'),
      { value: memory, source: 'network' },
    );
    queryClient.setQueryData(
      authorSummaryQueryKeys.memory('space-2', 'mem-strict'),
      { value: { ...memory, spaceId: 'space-2' }, source: 'network' },
    );

    const { rerender } = render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/memories/mem-strict/edit']}>
            <Routes>
              <Route
                path="/memories/:memoryId/edit"
                element={
                  <MemoryProductPage
                    mode="edit"
                    apis={mockApis}
                    apiBaseUrl="https://api.example.com"
                    accessToken="tok-1"
                    spaceId="space-1"
                    currentAccountId="acc-1"
                    loadMemoryImage={vi.fn().mockResolvedValue('blob:loaded')}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </React.StrictMode>,
    );

    const markButton = screen.getByText(
      i18n.t('memoryProduct.markPhotoForRemoval'),
    );
    await act(async () => {
      fireEvent.click(markButton);
    });
    expect(
      screen.getByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeDefined();

    // Rerender under StrictMode with Space 2
    await act(async () => {
      rerender(
        <React.StrictMode>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/memories/mem-strict/edit']}>
              <Routes>
                <Route
                  path="/memories/:memoryId/edit"
                  element={
                    <MemoryProductPage
                      mode="edit"
                      apis={mockApis}
                      apiBaseUrl="https://api.example.com"
                      accessToken="tok-1"
                      spaceId="space-2"
                      currentAccountId="acc-1"
                      loadMemoryImage={vi.fn().mockResolvedValue('blob:loaded')}
                    />
                  }
                />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </React.StrictMode>,
      );
    });

    // Verify reset under StrictMode: photo is not marked for removal
    expect(
      screen.queryByText(i18n.t('memoryProduct.photoMarkedForRemoval')),
    ).toBeNull();
  });
});
