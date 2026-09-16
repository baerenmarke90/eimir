import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { ReferenceApis } from '../client/referenceFlow';
import taskBoundary from '../i18n/locales/taskBoundary';
import { MemoryProductPage } from './MemoryProductPage';

const memory: MemoryDetail = {
  id: 'memory-1',
  spaceId: 'space-1',
  authorId: 'account-1',
  author: { id: 'account-1', displayName: 'Alex' },
  title: 'Our saved walk',
  body: 'Quiet words from yesterday.',
  attachments: [],
  happenedOn: new Date('2026-09-15'),
  createdAt: new Date('2026-09-15'),
  updatedAt: new Date('2026-09-15'),
  version: 1,
  capabilities: { canEdit: true, canDelete: true, canComment: false },
};
function renderResult(error?: ClientProblemError) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const key = authorSummaryQueryKeys.memory('space-1', memory.id);
  client.setQueryData(key, { value: memory, source: 'network' });
  if (error) {
    const query = client.getQueryCache().find({ queryKey: key });
    if (!query) throw new Error('Memory query is missing');
    query.setState({ status: 'error', error });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/story/memories/memory-1',
            state: { memorySaved: true, taskOriginKey: 'untrusted-key' },
          },
        ]}
      >
        <Routes>
          <Route
            path="/story/memories/:memoryId"
            element={
              <MemoryProductPage
                mode="detail"
                apis={{} as ReferenceApis}
                apiBaseUrl="http://example.test"
                accessToken="test"
                spaceId="space-1"
                currentAccountId="account-1"
                loadMemoryImage={async () => ''}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('confirmed Memory result', () => {
  it('keeps a confirmed result visible when a later detail refresh fails', () => {
    const html = renderResult(new ClientProblemError('server', 503));
    expect(html).toContain(memory.title);
    expect(html).toContain(taskBoundary.saved);
    expect(html).not.toContain('/edit');
  });
  it.each(['unauthorized', 'permission', 'notFound'] as const)(
    'hides a prior result after authoritative %s denial',
    (kind) => {
      const html = renderResult(new ClientProblemError(kind));
      expect(html).not.toContain(memory.title);
      expect(html).not.toContain(memory.body);
      expect(html).toContain('back-link');
    },
  );
});
