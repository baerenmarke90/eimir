// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { memo, type ReactNode, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../api/generated/runtime';
import { MemoryWorldProvider, useMemoryWorldId } from './memoryWorldContext';
import {
  useAppLayout,
  useWirDesignPresentation,
  WirDesignProvider,
} from './wirDesign';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const renders = { layout: 0, presentation: 0, world: 0 };

const LayoutReader = memo(function LayoutReader() {
  renders.layout += 1;
  useAppLayout();
  return null;
});
const PresentationReader = memo(function PresentationReader() {
  renders.presentation += 1;
  useWirDesignPresentation();
  return null;
});
const WorldReader = memo(function WorldReader() {
  renders.world += 1;
  useMemoryWorldId();
  return null;
});

let rerenderShell: () => void = () => {};

function Shell({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0);
  rerenderShell = () => setTick((tick) => tick + 1);
  const configuration = new Configuration({
    basePath: 'https://example.test',
    // The reads stay pending: the values the pages see do not change.
    fetchApi: () => new Promise<Response>(() => {}),
  });
  const api = new AppearanceApi(configuration);
  const entitlementsApi = new EntitlementsApi(configuration);
  return (
    <WirDesignProvider
      api={api}
      entitlementsApi={entitlementsApi}
      instance="https://example.test"
      accountId="account"
      spaceId="space"
    >
      <MemoryWorldProvider
        api={api}
        entitlementsApi={entitlementsApi}
        instance="https://example.test"
        accountId="account"
        spaceId="space"
      >
        {children}
      </MemoryWorldProvider>
    </WirDesignProvider>
  );
}

it('does not render the pages that read the design or the memory world when the app shell renders again', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Shell>
        <LayoutReader />
        <PresentationReader />
        <WorldReader />
      </Shell>
    </QueryClientProvider>,
  );
  const before = { ...renders };
  // A navigation renders the shell above every kept tab.
  act(() => rerenderShell());
  act(() => rerenderShell());
  expect(renders).toEqual(before);
  client.clear();
});
