// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  clearMemoryDiaryDrafts,
  MemoryDiaryDraftStore,
  type MemoryDiaryDraft,
} from './memoryDiaryDraft';

it('keeps ordinary, happiness and time-travel drafts isolated across reloads and clears all on logout', async () => {
  clearMemoryDiaryDrafts();
  const kinds = [undefined, 'HAPPINESS', 'TIME_TRAVEL'] as const;
  const draft = (body: string): MemoryDiaryDraft => ({
    title: '',
    body,
    tags: [],
    happenedOn: '',
    files: [],
    attempt: null,
    partial: null,
  });
  for (const kind of kinds) {
    const writer = new MemoryDiaryDraftStore('/api', 'account', 'space', kind);
    expect(await writer.load()).toBeNull();
    await writer.save(draft(kind ?? 'ordinary'));
  }
  for (const kind of kinds) {
    const reader = new MemoryDiaryDraftStore('/api/', 'account', 'space', kind);
    expect((await reader.load())?.body).toBe(kind ?? 'ordinary');
  }
  const otherAccount = new MemoryDiaryDraftStore(
    '/api',
    'other',
    'space',
    'HAPPINESS',
  );
  expect(await otherAccount.load()).toBeNull();
  clearMemoryDiaryDrafts();
  for (const kind of kinds) {
    expect(
      await new MemoryDiaryDraftStore('/api', 'account', 'space', kind).load(),
    ).toBeNull();
  }
});
