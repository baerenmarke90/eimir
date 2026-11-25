import type { StoryItem } from '../../../api/generated/models/StoryItem';
import type { MemoryWorldEntry } from '../model';

const author = { id: 'account-lea', displayName: 'Lea Sommer' };

export function memoryItem(
  id: string,
  title: string,
  {
    photos = [],
    date = '2026-08-24',
    places = [],
    answers = [],
  }: {
    photos?: {
      id: string;
      sensitive?: boolean;
      video?: boolean;
      position?: number;
    }[];
    date?: string;
    places?: string[];
    answers?: string[];
  } = {},
): StoryItem {
  return {
    kind: 'MEMORY',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    memory: {
      id,
      title,
      happenedOn: new Date(`${date}T00:00:00Z`),
      author,
      attachments: photos.map((photo, index) => ({
        id: photo.id,
        position: photo.position ?? index,
        hasThumbnail: true,
        isSensitive: photo.sensitive === true,
        mediaType: photo.video ? 'VIDEO' : 'IMAGE',
      })),
      places: places.map((name, index) => ({ id: `place-${index}`, name })),
      experienceAnswers: answers.map((body, index) => ({
        id: `answer-${index}`,
        body,
      })),
    },
  } as unknown as StoryItem;
}

export function heartItem(
  id: string,
  text: string,
  { emotion = 'LOVED', date = '2025-02-14' } = {},
): StoryItem {
  return {
    kind: 'HEART_MOMENT',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    heartMoment: {
      id,
      text,
      emotion,
      visibility: 'SHARED',
      author,
    },
  } as unknown as StoryItem;
}

export function milestoneItem(
  id: string,
  title: string,
  { date = '2024-06-01' } = {},
): StoryItem {
  return {
    kind: 'MILESTONE',
    effectiveDate: new Date(`${date}T00:00:00Z`),
    milestone: { id, title, author },
  } as unknown as StoryItem;
}

export function entry(
  key: string,
  overrides: Partial<MemoryWorldEntry> = {},
): MemoryWorldEntry {
  return {
    key,
    kind: 'words',
    path: `/story/memories/${key}`,
    title: `Title ${key}`,
    date: new Date('2026-08-24T00:00:00Z'),
    dateTime: '2026-08-24',
    dateLabel: '24. August 2026',
    author: 'Lea',
    memoryId: key,
    isLead: false,
    ...overrides,
  };
}
