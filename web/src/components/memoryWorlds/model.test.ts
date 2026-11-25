import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { heartItem, memoryItem, milestoneItem } from './__fixtures__/stories';
import {
  buildMemoryWorldEntries,
  seasonLabel,
  seasonOf,
  splitVerses,
  toMemoryWorldEntry,
} from './model';

const t = i18n.t.bind(i18n);
const options = { isLead: false, t, locale: 'de-DE' };

describe('toMemoryWorldEntry', () => {
  it('maps a memory with photos, places and answers', () => {
    const entry = toMemoryWorldEntry(
      memoryItem('m1', 'Am See', {
        photos: [
          { id: 'p2', position: 2 },
          { id: 'p1', position: 1 },
          { id: 'p-sensitive', position: 3, sensitive: true },
          { id: 'p-video', position: 4, video: true },
        ],
        places: ['Konstanz'],
        answers: [
          'We went swimming. Then there was ice cream, cake and coffee.',
        ],
      }),
      options,
    );
    expect(entry).toMatchObject({
      key: expect.any(String),
      kind: 'photo',
      title: 'Am See',
      path: '/story/memories/m1',
      memoryId: 'm1',
      dateTime: '2026-08-24',
      author: 'Lea',
      isLead: false,
    });
    // The cover is the first photo in authored order.
    expect(entry.cover?.id).toBe('p1');
    // Photos in authored order, without sensitive photos and videos.
    expect(entry.photos?.map((photo) => photo.id)).toEqual(['p1', 'p2']);
    expect(entry.verses).toEqual([
      'in Konstanz',
      'We went swimming.',
      'Then there was ice cream, cake and coffee.',
    ]);
  });

  it('uses the words kind without a photo and the headline for the lead', () => {
    const entry = toMemoryWorldEntry(memoryItem('m2', 'An evening'), {
      ...options,
      isLead: true,
      headline: 'One year ago today',
    });
    expect(entry.kind).toBe('words');
    expect(entry.cover).toBeUndefined();
    expect(entry.title).toBe('One year ago today');
    expect(entry.isLead).toBe(true);
  });

  it('maps a heart moment with its feeling and its text as verses', () => {
    const entry = toMemoryWorldEntry(
      heartItem('h1', '  Thank you for being here. Always.  ', {
        emotion: 'GRATEFUL',
      }),
      options,
    );
    expect(entry).toMatchObject({
      kind: 'heart',
      title: 'Thank you for being here. Always.',
      emotion: 'GRATEFUL',
      memoryId: '',
      verses: ['Thank you for being here.', 'Always.'],
    });
    expect(entry.path).toContain('h1');
  });

  it('maps a milestone', () => {
    const entry = toMemoryWorldEntry(
      milestoneItem('ms1', 'Zusammengezogen'),
      options,
    );
    expect(entry).toMatchObject({
      kind: 'milestone',
      title: 'Zusammengezogen',
    });
    expect(entry.path).toContain('ms1');
  });
});

describe('buildMemoryWorldEntries', () => {
  const lead = memoryItem('lead', 'The first holiday', {
    photos: [{ id: 'lead-photo' }],
  });
  const sensitive = memoryItem('s', 'Privat', {
    photos: [{ id: 'secret', sensitive: true }],
  });
  const items = [lead, sensitive, heartItem('h', 'Schön')];

  it('puts the lead first, once, and hides sensitive covers by default', () => {
    const entries = buildMemoryWorldEntries({
      lead,
      leadHeadline: 'Heute vor 2 Jahren',
      items,
      showSensitive: false,
      t,
      locale: 'de-DE',
    });
    expect(entries.map((entry) => entry.title)).toEqual([
      'Heute vor 2 Jahren',
      'Schön',
    ]);
    expect(entries[0].isLead).toBe(true);
  });

  it('shows memories with a sensitive cover when this device chose so', () => {
    const entries = buildMemoryWorldEntries({
      lead: null,
      items,
      showSensitive: true,
      t,
      locale: 'de-DE',
    });
    const shown = entries.find((entry) => entry.title === 'Privat');
    expect(shown?.cover?.isSensitive).toBe(true);
    // The sensitive photo itself never plays as a photo of the memory.
    expect(shown?.photos).toEqual([]);
  });
});

describe('splitVerses', () => {
  it('splits sentences and breaks long sentences at phrases', () => {
    expect(splitVerses('')).toEqual([]);
    expect(splitVerses('Hello!  How   are you?')).toEqual([
      'Hello!',
      'How are you?',
    ]);
    const long =
      'We set off in the morning, had breakfast by the river – and only came back at night.';
    expect(splitVerses(long)).toEqual([
      'We set off in the morning,',
      'had breakfast by the river –',
      'and only came back at night.',
    ]);
  });
});

describe('seasons', () => {
  it('puts December into the next winter and labels it across the years', () => {
    expect(seasonOf(new Date(2025, 11, 20))).toMatchObject({
      season: 'winter',
      year: 2026,
    });
    expect(seasonLabel(new Date(2025, 11, 20), t)).toBe('Winter 2025/26');
    expect(seasonLabel(new Date(2026, 6, 1), t)).toBe('Sommer 2026');
  });

  it('labels seasons in the active language', () => {
    const english = i18n.getFixedT('en');
    expect(seasonLabel(new Date(2026, 3, 1), english)).toBe('Spring 2026');
  });
});
